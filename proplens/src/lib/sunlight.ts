import type { Climate } from "./climate";
import type { Skyline } from "./skyline";
import { buildingHorizon } from "./skyline";
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
  score: number;
};

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
};

export function analyzeSun(input: SunInput): SunResult {
  const { lat, lon, floor } = input;
  const year = input.year ?? new Date().getFullYear();
  const h = observerHeight(floor);
  const buildings = input.skyline ? buildingHorizon(input.skyline, h) : new Float32Array(360);
  const terrain = input.terrain ? terrainHorizon(input.terrain, h) : null;
  const horizon = new Float32Array(360);
  for (let b = 0; b < 360; b++) horizon[b] = Math.max(buildings[b], terrain ? terrain[b] : 0, 0);

  const lit = (s: DaySample) => s.altitude > HORIZON_ALT && s.altitude > horizon[Math.floor(s.azimuth) % 360];

  const months: MonthSun[] = [];
  let annualDirect = 0;
  let annualDaylight = 0;
  for (let m = 0; m < 12; m++) {
    const samples = daySamples(year, m, 15, lat, lon, STEP_MIN);
    const daylight = samples.filter((s) => s.altitude > HORIZON_ALT).length * STEP_H;
    const direct = samples.filter(lit).length * STEP_H;
    const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    annualDirect += direct * days;
    annualDaylight += daylight * days;
    months.push({ month: m, daylight, direct });
  }

  const south = lat < 0;
  const dates: Record<KeyDayId, [number, number, string]> = {
    winter: south ? [5, 21, "Winter · Jun 21"] : [11, 21, "Winter · Dec 21"],
    equinox: [2, 20, "Spring · Mar 20"],
    summer: south ? [11, 21, "Summer · Dec 21"] : [5, 21, "Summer · Jun 21"],
  };
  const keyDays: KeyDay[] = (Object.keys(dates) as KeyDayId[]).map((id) => {
    const [m, d, label] = dates[id];
    const samples = daySamples(year, m, d, lat, lon, STEP_MIN).map((s) => ({ ...s, lit: lit(s) }));
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
    score: Math.round(score),
  };
}
