import type { Climate } from "./climate";
import type { Building, Skyline } from "./skyline";
import { skylineProfile } from "./skyline";
import type { DaySample } from "./sun";
import { HORIZON_ALT, daySamples } from "./sun";
import type { TerrainSamples } from "./terrain";
import { terrainHorizon } from "./terrain";

export const FLOOR_HEIGHT = 3;
/** Eye height above the floor of a storey, metres. */
export const EYE_HEIGHT = 1.6;

export const observerHeight = (floor: number) => floor * FLOOR_HEIGHT + EYE_HEIGHT;

export type KeyDayId = "winter" | "equinox" | "summer";
export type KeyDay = {
  id: KeyDayId;
  label: string;
  /** Daylight hours (sun above a flat horizon). */
  daylight: number;
  /** Hours of direct sun at this spot and height. */
  direct: number;
  firstSun: number | null;
  lastSun: number | null;
  samples: (DaySample & { lit: boolean })[];
};

export type MonthSun = { month: number; daylight: number; direct: number };
export type FacadeSun = { facing: string; azimuth: number; hours: Record<KeyDayId, number> };

export type SunResult = {
  floor: number;
  observerHeight: number;
  /** Combined horizon (buildings + terrain), elevation degrees per 1° azimuth bin. */
  horizon: Float32Array;
  buildings: Float32Array;
  terrain: Float32Array | null;
  keyDays: KeyDay[];
  months: MonthSun[];
  annualDirect: number;
  annualDaylight: number;
  facades: FacadeSun[];
  /** Hours of actual sunshine per year at this spot, weighting clear-sky access by the local climate. */
  realSunshine: number | null;
  /** Buildings that block direct sun here, most first: hours lost on the shortest day and over a year. */
  shade: Shade[];
  /** Average hours of direct sun a day after 17:00 / before 10:00 local time, April to September. */
  eveningSun: number;
  morningSun: number;
  score: number;
};

export type Shade = { building: Building; winter: number; year: number };

const STEP_MIN = 5;
const STEP_H = STEP_MIN / 60;

export type SunInput = {
  lat: number;
  lon: number;
  floor: number;
  skyline: Skyline | null;
  terrain: TerrainSamples | null;
  climate: Climate | null;
  year?: number;
  /** Sun positions per day; pass a memoised `daySamples` when analysing many nearby points. */
  sampler?: typeof daySamples;
  /** IANA time zone for clock-time figures (morning and evening sun); solar time when missing. */
  timeZone?: string;
};

/** Evening and morning sun are counted from April to September, by local clock time. */
const SEASON = [3, 4, 5, 6, 7, 8];
export const EVENING_FROM = 17;
export const MORNING_UNTIL = 10;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Hour of day (0–24, fractional) of a UTC timestamp in a time zone, with the offset looked up once per day. */
export function clockHour(timeZone: string | undefined, lon: number): (t: number) => number {
  const offsets = new Map<number, number>();
  const offsetAt = (t: number) => {
    if (!timeZone) return Math.round(lon / 15) * 3_600_000;
    try {
      let f = formatters.get(timeZone);
      if (!f) {
        f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
        formatters.set(timeZone, f);
      }
      const parts = Object.fromEntries(f.formatToParts(new Date(t)).map((p) => [p.type, Number(p.value)]));
      return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(t / 60_000) * 60_000;
    } catch {
      return Math.round(lon / 15) * 3_600_000;
    }
  };
  return (t) => {
    const day = Math.floor(t / 86_400_000);
    let off = offsets.get(day);
    if (off === undefined) offsets.set(day, (off = offsetAt(t)));
    return ((((t + off) / 3_600_000) % 24) + 24) % 24;
  };
}

export function analyzeSun(input: SunInput): SunResult {
  const { lat, lon, floor } = input;
  const samplesFor = input.sampler ?? daySamples;
  const year = input.year ?? new Date().getFullYear();
  const h = observerHeight(floor);
  const profile = input.skyline ? skylineProfile(input.skyline, h) : null;
  const buildings = profile?.angles ?? new Float32Array(360);
  const terrain = input.terrain ? terrainHorizon(input.terrain, h) : null;
  const horizon = new Float32Array(360);
  for (let b = 0; b < 360; b++) horizon[b] = Math.max(buildings[b], terrain ? terrain[b] : 0, 0);

  const lit = (s: DaySample) => s.altitude > HORIZON_ALT && s.altitude > horizon[Math.floor(s.azimuth) % 360];
  // The building in the way when the sun is up and clear of the terrain but behind the building skyline.
  const blocker = (s: DaySample) => {
    const bin = Math.floor(s.azimuth) % 360;
    if (!profile || s.altitude <= Math.max(HORIZON_ALT, terrain ? terrain[bin] : 0, 0) || s.altitude > buildings[bin]) return null;
    return profile.owners[bin];
  };
  const shadeBy = new Map<Building, Shade>();
  const blame = (s: DaySample, key: "winter" | "year", hours: number) => {
    const b = blocker(s);
    if (!b) return;
    let entry = shadeBy.get(b);
    if (!entry) shadeBy.set(b, (entry = { building: b, winter: 0, year: 0 }));
    entry[key] += hours;
  };

  const hour = clockHour(input.timeZone, lon);
  let evening = 0;
  let morning = 0;
  const months: MonthSun[] = [];
  let annualDirect = 0;
  let annualDaylight = 0;
  for (let m = 0; m < 12; m++) {
    const samples = samplesFor(year, m, 15, lat, lon, STEP_MIN);
    const daylight = samples.filter((s) => s.altitude > HORIZON_ALT).length * STEP_H;
    const direct = samples.filter(lit).length * STEP_H;
    const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    annualDirect += direct * days;
    annualDaylight += daylight * days;
    months.push({ month: m, daylight, direct });
    if (SEASON.includes(m))
      for (const s of samples) {
        if (!lit(s)) continue;
        const h = hour(s.t);
        if (h >= EVENING_FROM) evening += STEP_H;
        else if (h < MORNING_UNTIL) morning += STEP_H;
      }
    if (profile) for (const s of samples) blame(s, "year", STEP_H * days);
  }

  const south = lat < 0;
  const dates: Record<KeyDayId, [number, number, string]> = {
    winter: south ? [5, 21, "Winter · Jun 21"] : [11, 21, "Winter · Dec 21"],
    equinox: [2, 20, "Spring · Mar 20"],
    summer: south ? [11, 21, "Summer · Dec 21"] : [5, 21, "Summer · Jun 21"],
  };
  const keyDays: KeyDay[] = (Object.keys(dates) as KeyDayId[]).map((id) => {
    const [m, d, label] = dates[id];
    const samples = samplesFor(year, m, d, lat, lon, STEP_MIN).map((s) => ({ ...s, lit: lit(s) }));
    const litSamples = samples.filter((s) => s.lit);
    return {
      id,
      label,
      daylight: samples.filter((s) => s.altitude > HORIZON_ALT).length * STEP_H,
      direct: litSamples.length * STEP_H,
      firstSun: litSamples[0]?.t ?? null,
      lastSun: litSamples[litSamples.length - 1]?.t ?? null,
      samples,
    };
  });

  const facades: FacadeSun[] = [
    ["North", 0],
    ["East", 90],
    ["South", 180],
    ["West", 270],
  ].map(([facing, azimuth]) => {
    const hours = {} as Record<KeyDayId, number>;
    for (const day of keyDays) {
      hours[day.id] =
        day.samples.filter((s) => {
          const off = Math.abs(((s.azimuth - (azimuth as number) + 540) % 360) - 180);
          return s.lit && off < 85;
        }).length * STEP_H;
    }
    return { facing: facing as string, azimuth: azimuth as number, hours };
  });

  let realSunshine: number | null = null;
  if (input.climate) {
    realSunshine = input.climate.monthlySunshine.reduce((acc, sun, m) => {
      const share = months[m].daylight ? months[m].direct / months[m].daylight : 0;
      const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      return acc + sun * share * days;
    }, 0);
  }

  if (profile) for (const s of keyDays[0].samples) blame(s, "winter", STEP_H);
  const shade = [...shadeBy.values()].filter((x) => x.year >= 1 || x.winter > 0).sort((a, b) => b.year - a.year || b.winter - a.winter);

  const winter = keyDays[0];
  const winterShare = winter.daylight ? winter.direct / winter.daylight : 0;
  const annualShare = annualDaylight ? annualDirect / annualDaylight : 0;
  let score = 100 * (0.55 * Math.min(1, winterShare / 0.85) + 0.45 * Math.min(1, annualShare / 0.9));
  if (input.climate) {
    const climateScore = Math.max(0, Math.min(100, ((input.climate.annualSunshine - 1100) / 1500) * 100));
    score = 0.8 * score + 0.2 * climateScore;
  }

  return {
    floor,
    observerHeight: h,
    horizon,
    buildings,
    terrain,
    keyDays,
    months,
    annualDirect,
    annualDaylight,
    facades,
    realSunshine,
    shade,
    eveningSun: evening / SEASON.length,
    morningSun: morning / SEASON.length,
    score: Math.round(score),
  };
}
