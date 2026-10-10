// Personal preferences ("evening sun from the west", "a tram stop within 5 minutes") and how well an address meets them.

import { useSyncExternalStore } from "react";
import type { FlyoverLevel } from "./airports";
import type { AreaHome } from "./areaScore";
import type { LatLon } from "./geo";
import { haversine } from "./geo";
import type { Place } from "./geocode";
import type { Report } from "./report";
import type { SunResult } from "./sunlight";

export type PrefId =
  | "evening-sun"
  | "morning-sun"
  | "winter-sun"
  | "transit"
  | "train"
  | "quiet-night"
  | "quiet-day"
  | "supermarket"
  | "school"
  | "childcare"
  | "green"
  | "no-nightlife"
  | "no-flights"
  | "near-work";

/** 1 nice to have, 2 important, 3 must have. */
export type Importance = 1 | 2 | 3;

export type Pref = { id: PrefId; target: number; importance: Importance; place?: { label: string; lat: number; lon: number } };

/**
 * What an address offers, for comparing against preferences. `undefined` means unknown (the data didn't load),
 * `null` means none found within the search radius.
 */
export type Metrics = {
  lat: number;
  lon: number;
  noiseDay?: number;
  noiseNight?: number;
  winterSun?: number;
  eveningSun?: number;
  morningSun?: number;
  /** Metres. */
  stop?: number | null;
  station?: number | null;
  supermarket?: number | null;
  school?: number | null;
  childcare?: number | null;
  green?: number | null;
  barsNearby?: number;
  flyover?: FlyoverLevel;
  names?: Partial<Record<"stop" | "station" | "supermarket" | "school" | "childcare" | "green", string>>;
};

export type PrefGroup = "Light" | "Getting around" | "Everyday" | "Peace and quiet";

type Value = { value: number | null; text: string } | undefined;

export type PrefDef = {
  id: PrefId;
  group: PrefGroup;
  label: string;
  /** Choices for the target, and how each reads. */
  targets: number[];
  defaultTarget: number;
  targetLabel: (t: number) => string;
  /** One line for the preference, e.g. "At least 2 h of sun after 5 pm". */
  describe: (p: Pref) => string;
  measure: (m: Metrics, p: Pref) => Value;
  /** 0–1: how well a measured value meets the target. */
  satisfy: (value: number | null, target: number) => number;
};

/** Walking minutes at 4.8 km/h along streets (1.25 × the straight line), as elsewhere in the app. */
const minutes = (m: number) => (m * 1.25) / 80;
const fmtMin = (m: number) => `${Math.max(1, Math.round(minutes(m)))} min walk`;

/** Full marks at or above the target, falling linearly to zero. */
const atLeast = (v: number | null, t: number) => (v == null ? 0 : v >= t ? 1 : Math.max(0, v / t));
/** Full marks within the target, falling to zero at twice the target. */
const within = (v: number | null, t: number) => (v == null ? 0 : v <= t ? 1 : v >= 2 * t ? 0 : 1 - (v - t) / t);
/** Full marks at or below the target level, falling to zero 10 dB above it. */
const below = (v: number | null, t: number) => (v == null ? 0 : v <= t ? 1 : v >= t + 10 ? 0 : 1 - (v - t) / 10);

function walk(key: "stop" | "station" | "supermarket" | "school" | "childcare" | "green", none: string) {
  return (m: Metrics): Value => {
    const d = m[key];
    if (d === undefined) return undefined;
    if (d === null) return { value: null, text: none };
    const name = m.names?.[key];
    return { value: minutes(d), text: `${fmtMin(d)}${name ? ` · ${name}` : ""}` };
  };
}

const hours = (h: number) => `${h.toFixed(1)} h`;

export const PREFS: PrefDef[] = [
  {
    id: "evening-sun",
    group: "Light",
    label: "Evening sun",
    targets: [1, 2, 3],
    defaultTarget: 2,
    targetLabel: (t) => `${t} h+`,
    describe: (p) => `At least ${p.target} h of direct sun after 5 pm, from the west`,
    measure: (m) => (m.eveningSun === undefined ? undefined : { value: m.eveningSun, text: `${hours(m.eveningSun)} a day after 5 pm (Apr–Sep)` }),
    satisfy: atLeast,
  },
  {
    id: "morning-sun",
    group: "Light",
    label: "Morning sun",
    targets: [0.5, 1, 2],
    defaultTarget: 1,
    targetLabel: (t) => `${t} h+`,
    describe: (p) => `At least ${p.target} h of direct sun before 10 am, from the east`,
    measure: (m) => (m.morningSun === undefined ? undefined : { value: m.morningSun, text: `${hours(m.morningSun)} a day before 10 am (Apr–Sep)` }),
    satisfy: atLeast,
  },
  {
    id: "winter-sun",
    group: "Light",
    label: "Winter sun",
    targets: [2, 3, 4, 5],
    defaultTarget: 3,
    targetLabel: (t) => `${t} h+`,
    describe: (p) => `At least ${p.target} h of direct sun on the shortest day`,
    measure: (m) => (m.winterSun === undefined ? undefined : { value: m.winterSun, text: `${hours(m.winterSun)} on Dec 21` }),
    satisfy: atLeast,
  },
  {
    id: "transit",
    group: "Getting around",
    label: "Public transport",
    targets: [3, 5, 8, 10],
    defaultTarget: 5,
    targetLabel: (t) => `${t} min`,
    describe: (p) => `A bus, tram or train stop within ${p.target} min on foot`,
    measure: walk("stop", "No stop within 800 m"),
    satisfy: within,
  },
  {
    id: "train",
    group: "Getting around",
    label: "Train station",
    targets: [5, 10, 15, 20],
    defaultTarget: 10,
    targetLabel: (t) => `${t} min`,
    describe: (p) => `A train station within ${p.target} min on foot`,
    measure: walk("station", "No train station within 2 km"),
    satisfy: within,
  },
  {
    id: "near-work",
    group: "Getting around",
    label: "Near work or school",
    targets: [2, 5, 10, 20],
    defaultTarget: 5,
    targetLabel: (t) => `${t} km`,
    describe: (p) => `Within ${p.target} km of ${p.place?.label ?? "a place you choose"}`,
    measure: (m, p) => {
      if (!p.place) return undefined;
      const km = haversine(m, p.place) / 1000;
      return { value: km, text: `${km < 10 ? km.toFixed(1) : Math.round(km)} km in a straight line` };
    },
    satisfy: within,
  },
  {
    id: "supermarket",
    group: "Everyday",
    label: "Supermarket",
    targets: [3, 5, 10],
    defaultTarget: 5,
    targetLabel: (t) => `${t} min`,
    describe: (p) => `A supermarket within ${p.target} min on foot`,
    measure: walk("supermarket", "No supermarket within 1.5 km"),
    satisfy: within,
  },
  {
    id: "school",
    group: "Everyday",
    label: "School",
    targets: [5, 10, 15],
    defaultTarget: 10,
    targetLabel: (t) => `${t} min`,
    describe: (p) => `A school within ${p.target} min on foot`,
    measure: walk("school", "No school within 2.5 km"),
    satisfy: within,
  },
  {
    id: "childcare",
    group: "Everyday",
    label: "Childcare",
    targets: [5, 10, 15],
    defaultTarget: 10,
    targetLabel: (t) => `${t} min`,
    describe: (p) => `Childcare or a kindergarten within ${p.target} min on foot`,
    measure: walk("childcare", "None within 2.5 km"),
    satisfy: within,
  },
  {
    id: "green",
    group: "Everyday",
    label: "Park or woods",
    targets: [3, 5, 10],
    defaultTarget: 5,
    targetLabel: (t) => `${t} min`,
    describe: (p) => `A park or woods within ${p.target} min on foot`,
    measure: walk("green", "No park within 1 km"),
    satisfy: within,
  },
  {
    id: "quiet-night",
    group: "Peace and quiet",
    label: "Quiet nights",
    targets: [40, 45, 50],
    defaultTarget: 45,
    targetLabel: (t) => `≤ ${t} dB`,
    describe: (p) => `Night noise at most ${p.target} dB`,
    measure: (m) => (m.noiseNight === undefined ? undefined : { value: m.noiseNight, text: `${Math.round(m.noiseNight)} dB at night` }),
    satisfy: below,
  },
  {
    id: "quiet-day",
    group: "Peace and quiet",
    label: "Quiet days",
    targets: [50, 55, 60],
    defaultTarget: 55,
    targetLabel: (t) => `≤ ${t} dB`,
    describe: (p) => `Daytime noise at most ${p.target} dB`,
    measure: (m) => (m.noiseDay === undefined ? undefined : { value: m.noiseDay, text: `${Math.round(m.noiseDay)} dB by day` }),
    satisfy: below,
  },
  {
    id: "no-nightlife",
    group: "Peace and quiet",
    label: "No bars next door",
    targets: [0, 2],
    defaultTarget: 0,
    targetLabel: (t) => (t === 0 ? "None" : `At most ${t}`),
    describe: (p) => (p.target === 0 ? "No bars, pubs or clubs within 150 m" : `At most ${p.target} bars, pubs or clubs within 150 m`),
    measure: (m) => (m.barsNearby === undefined ? undefined : { value: m.barsNearby, text: m.barsNearby ? `${m.barsNearby} within 150 m` : "None within 150 m" }),
    satisfy: (v, t) => (v != null && v <= t ? 1 : 0),
  },
  {
    id: "no-flights",
    group: "Peace and quiet",
    label: "No flight path",
    targets: [1, 2],
    defaultTarget: 1,
    targetLabel: (t) => (t === 1 ? "Not overhead" : "Not nearby"),
    describe: (p) => (p.target === 1 ? "Not directly under a flight path" : "Away from flight paths"),
    measure: (m) => {
      if (m.flyover === undefined) return undefined;
      const rank = { direct: 0, near: 1, distant: 2, none: 2 }[m.flyover];
      return { value: rank, text: { direct: "Direct flyover", near: "Near a flight path", distant: "Away from flight paths", none: "No airport nearby" }[m.flyover] };
    },
    satisfy: (v, t) => (v != null && v >= t ? 1 : 0),
  },
];

export const PREF_BY_ID = Object.fromEntries(PREFS.map((d) => [d.id, d])) as Record<PrefId, PrefDef>;
export const IMPORTANCE: Record<Importance, string> = { 1: "Nice to have", 2: "Important", 3: "Must have" };

export type PrefResult = { pref: Pref; def: PrefDef; satisfaction: number | null; text: string };
export type Match = { match: number | null; results: PrefResult[]; missedMusts: PrefResult[] };

/** A must-have that isn't fully met caps the match here. */
export const MUST_CAP = 59;

export function evaluate(prefs: Pref[], m: Metrics): Match {
  let total = 0;
  let weight = 0;
  const results: PrefResult[] = prefs.map((pref) => {
    const def = PREF_BY_ID[pref.id];
    const v = def.measure(m, pref);
    if (!v) return { pref, def, satisfaction: null, text: "Not known for this address" };
    const satisfaction = def.satisfy(v.value, pref.target);
    total += satisfaction * pref.importance;
    weight += pref.importance;
    return { pref, def, satisfaction, text: v.text };
  });
  const missedMusts = results.filter((r) => r.pref.importance === 3 && r.satisfaction != null && r.satisfaction < 1);
  // 100 only when every known preference is fully met.
  const short = results.some((r) => r.satisfaction != null && r.satisfaction < 1);
  const raw = weight ? Math.min(short ? 99 : 100, Math.round((100 * total) / weight)) : null;
  return { match: raw == null ? null : missedMusts.length ? Math.min(raw, MUST_CAP) : raw, results, missedMusts };
}

export function matchWord(match: number): string {
  if (match >= 85) return "Great match";
  if (match >= 70) return "Good match";
  if (match >= 50) return "Partial match";
  return "Poor match";
}

/* ---------- metrics ---------- */

export function reportMetrics(report: Report, sun: SunResult | null): Metrics {
  const g = report.getAround;
  const market = report.shopping?.essentials.find((e) => e.id === "supermarket")?.nearest;
  const school = report.schools?.groups[1].items[0];
  const early = report.schools?.groups[0].items[0];
  // Without nearby buildings the sun model assumes open sky: don't let that pass for a fact.
  const lit = sun && report.skyline ? sun : null;
  return {
    lat: report.place.lat,
    lon: report.place.lon,
    noiseDay: report.noise?.day,
    noiseNight: report.noise?.night,
    winterSun: lit?.keyDays[0].direct,
    eveningSun: lit?.eveningSun,
    morningSun: lit?.morningSun,
    stop: g ? (g.stop?.distance ?? null) : undefined,
    station: g ? (g.station?.distance ?? null) : undefined,
    green: g ? (g.green?.distance ?? null) : undefined,
    barsNearby: report.barsNearby ?? undefined,
    supermarket: report.shopping ? (market?.distance ?? null) : undefined,
    school: report.schools ? (school?.distance ?? null) : undefined,
    childcare: report.schools ? (early?.distance ?? null) : undefined,
    flyover: report.flights?.exposure.level,
    names: {
      stop: g?.stop && `${g.stop.kindLabel} ${g.stop.name !== g.stop.kindLabel ? g.stop.name : ""}`.trim(),
      station: g?.station?.name,
      green: g?.green?.name,
      supermarket: market?.name,
      school: school?.name,
      childcare: early?.name,
    },
  };
}

export function homeMetrics(h: AreaHome): Metrics {
  return {
    lat: h.lat,
    lon: h.lon,
    noiseDay: h.noise.day,
    noiseNight: h.noise.night,
    winterSun: h.winterSun,
    eveningSun: h.eveningSun,
    morningSun: h.morningSun,
    stop: h.stop,
    station: h.station,
    supermarket: h.supermarket,
    school: h.school,
    childcare: h.childcare,
    green: h.green,
    barsNearby: h.barsNearby,
    flyover: h.flyover,
  };
}

/* ---------- storage (this browser) ---------- */

function store<T>(key: string, fallback: T) {
  let value: T = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = JSON.parse(raw) as T;
  } catch {
    /* private mode or bad data: start empty */
  }
  const listeners = new Set<() => void>();
  // Keep other tabs in step.
  if (typeof window !== "undefined")
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      try {
        value = e.newValue ? (JSON.parse(e.newValue) as T) : fallback;
      } catch {
        value = fallback;
      }
      listeners.forEach((l) => l());
    });
  return {
    get: () => value,
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* quota or private mode: keep it for this session */
      }
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const prefStore = store<Pref[]>("proplens.preferences.v1", []);

export function usePreferences(): [Pref[], (p: Pref[]) => void] {
  const prefs = useSyncExternalStore(prefStore.subscribe, prefStore.get);
  return [prefs, prefStore.set];
}

/** An address saved for comparison, with what it offered when saved. */
export type Saved = { id: string; place: Place; floor: number; score: number | null; metrics: Metrics; savedAt: string };

const savedStore = store<Saved[]>("proplens.compare.v1", []);
export const MAX_SAVED = 6;

export const savedId = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

export function useSaved(): [Saved[], (s: Saved[]) => void] {
  const saved = useSyncExternalStore(savedStore.subscribe, savedStore.get);
  return [saved, savedStore.set];
}
