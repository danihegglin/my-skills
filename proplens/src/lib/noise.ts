import type { LatLon, Projection, XY } from "./geo";
import { bearing, closestOnSegment, densify, dist, distanceToPolygon, distanceToPolyline, len } from "./geo";
import type { OsmElement } from "./osm";
import { elementLines, elementPoint } from "./osm";
import type { Skyline } from "./skyline";
import type { OfficialNoise } from "./swissNoise";

export type NoiseCategoryId = "road" | "rail" | "air" | "nightlife" | "other";

export type NoiseSource = {
  id: string;
  category: NoiseCategoryId;
  name: string;
  detail: string;
  distance: number;
  /** Contribution at the address, dB(A). */
  day: number;
  night: number;
  shielded: boolean;
  lines?: LatLon[][];
  point?: LatLon;
};

export type NoiseCategory = {
  id: NoiseCategoryId;
  label: string;
  day: number;
  night: number;
  /** Set when the level comes from an official noise map instead of our model. */
  official?: { day: number; night: number; source: string };
  sources: NoiseSource[];
};

export type NoiseResult = {
  categories: NoiseCategory[];
  day: number;
  night: number;
  score: number;
  /** Every modelled source above ~30 dB, for the map. */
  mapSources: NoiseSource[];
};

/* ---------- acoustics helpers ---------- */

const energy = (db: number) => (Number.isFinite(db) ? 10 ** (db / 10) : 0);
export const toDb = (e: number) => (e > 0 ? 10 * Math.log10(e) : -Infinity);
export const sumDb = (...dbs: number[]) => toDb(dbs.reduce((acc, d) => acc + energy(d), 0));

/** Unmodelled background (distant traffic, people, nature). Keeps totals realistic in very quiet spots. */
const BACKGROUND = { day: 38, night: 30 };
/** Receiver height for noise, as in EU/Swiss noise mapping. */
const RECEIVER_HEIGHT = 4;

type Path = { att: number; shielded: boolean };

function makePath(sky: Skyline | null) {
  const origin = { x: 0, y: 0 };
  return (p: XY): Path => {
    const r = Math.max(len(p), 4);
    const hm = (RECEIVER_HEIGHT + 0.5) / 2;
    // ISO 9613-2 ground term (mixed ground) and air absorption at ~1 kHz.
    const ground = 0.6 * Math.max(0, 4.8 - ((2 * hm) / r) * (17 + 300 / r));
    const air = 0.005 * r;
    let screen = 0;
    if (sky) {
      const bin = Math.floor(bearing(origin, p)) % 360;
      const blockedAt = sky.screenDist[bin];
      // ISO 9613-2 Annex A: 0.1 dB per metre of path through built-up area, times building density.
      const housing = (from: number) => 0.1 * sky.coverage * Math.max(0, r - from);
      if (blockedAt < r - 2) screen = 12 + Math.min(6, housing(blockedAt));
      else if (r > sky.radius) screen = Math.min(10, housing(sky.radius));
    }
    return { att: ground + air + screen, shielded: screen >= 10 };
  };
}

type Piece = { e: number; azFrom: number; azTo: number; closest: XY; r: number; shielded: boolean };

/**
 * Splits a line source into short pieces and returns each piece's energy factor relative to an
 * infinite straight line at 25 m (the reference distance of the emission levels below).
 */
function linePieces(line: XY[], path: (p: XY) => Path): Piece[] {
  const pts = densify(line, 15);
  const origin = { x: 0, y: 0 };
  const out: Piece[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = dist(a, b);
    if (l < 0.01) continue;
    const ux = (b.x - a.x) / l;
    const uy = (b.y - a.y) / l;
    const dPerp = Math.max(Math.abs(a.x * uy - a.y * ux), 4);
    const sa = a.x * ux + a.y * uy;
    const sb = b.x * ux + b.y * uy;
    const dTheta = Math.abs(Math.atan2(sb, dPerp) - Math.atan2(sa, dPerp));
    const c = closestOnSegment(origin, a, b);
    const { att, shielded } = path(c.point);
    out.push({
      e: 10 ** (-att / 10) * (25 / dPerp) * (dTheta / Math.PI),
      azFrom: bearing(origin, a),
      azTo: bearing(origin, b),
      closest: c.point,
      r: c.d,
      shielded,
    });
  }
  return out;
}

/* ---------- road traffic (RLS-90 style emission) ---------- */

type RoadClass = { aadt: number; truckDay: number; truckNight: number; speed: number; nightShare: number; label: string; lanes?: number };

const ROADS: Record<string, RoadClass> = {
  motorway: { aadt: 60000, truckDay: 15, truckNight: 25, speed: 120, nightShare: 0.014, label: "Motorway", lanes: 2 },
  motorway_link: { aadt: 9000, truckDay: 12, truckNight: 20, speed: 70, nightShare: 0.014, label: "Motorway ramp" },
  trunk: { aadt: 25000, truckDay: 10, truckNight: 15, speed: 80, nightShare: 0.014, label: "Expressway", lanes: 2 },
  trunk_link: { aadt: 6000, truckDay: 8, truckNight: 10, speed: 60, nightShare: 0.011, label: "Expressway ramp" },
  primary: { aadt: 14000, truckDay: 8, truckNight: 8, speed: 50, nightShare: 0.011, label: "Main road", lanes: 2 },
  primary_link: { aadt: 4000, truckDay: 6, truckNight: 6, speed: 50, nightShare: 0.011, label: "Main road link" },
  secondary: { aadt: 8000, truckDay: 6, truckNight: 5, speed: 50, nightShare: 0.011, label: "Secondary road", lanes: 2 },
  secondary_link: { aadt: 2500, truckDay: 5, truckNight: 4, speed: 50, nightShare: 0.011, label: "Secondary road link" },
  tertiary: { aadt: 4000, truckDay: 5, truckNight: 3, speed: 50, nightShare: 0.01, label: "Local through-road" },
  tertiary_link: { aadt: 1500, truckDay: 4, truckNight: 3, speed: 40, nightShare: 0.01, label: "Local link" },
  unclassified: { aadt: 1200, truckDay: 4, truckNight: 2, speed: 50, nightShare: 0.008, label: "Minor road" },
  residential: { aadt: 500, truckDay: 2, truckNight: 1, speed: 30, nightShare: 0.008, label: "Residential street" },
  living_street: { aadt: 150, truckDay: 1, truckNight: 0, speed: 15, nightShare: 0.008, label: "Shared street" },
};

export function parseSpeed(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = v.match(/^\s*(\d+)\s*(mph)?/);
  if (n) return Number(n[1]) * (n[2] ? 1.609 : 1);
  const s = v.toLowerCase();
  const zone = s.match(/zone:?(\d+)/);
  if (zone) return Number(zone[1]);
  if (s.includes("living_street") || s === "walk") return 15;
  if (s.includes("urban")) return 50;
  if (s.includes("rural")) return 90;
  if (s.includes("motorway") || s === "none") return 125;
  return fallback;
}

/** Hourly level at 25 m from an infinite straight road (RLS-90), dB(A). */
export function roadEmission(vehiclesPerHour: number, truckPct: number, speed: number): number {
  if (vehiclesPerHour <= 0) return -Infinity;
  const p = truckPct;
  const base = 37.3 + 10 * Math.log10(vehiclesPerHour * (1 + 0.082 * p));
  const vCar = Math.min(130, Math.max(30, speed));
  const vTruck = Math.min(80, Math.max(30, speed));
  const lCar = 27.7 + 10 * Math.log10(1 + (0.02 * vCar) ** 3);
  const lTruck = 23.1 + 12.5 * Math.log10(vTruck);
  const dv = lCar - 37.3 + 10 * Math.log10((100 + (10 ** (0.1 * (lTruck - lCar)) - 1) * p) / (100 + 8.23 * p));
  return base + dv;
}

const ROUGH_SURFACES = new Set(["sett", "cobblestone", "unhewn_cobblestone", "paving_stones", "grass_paver"]);

export function roadLevels(tags: Record<string, string>): { day: number; night: number; cls: RoadClass } | null {
  const cls = ROADS[tags.highway];
  if (!cls) return null;
  if (tags.tunnel && tags.tunnel !== "no") return null;
  if (tags.covered === "yes") return null;
  let aadt = cls.aadt;
  const oneway = tags.oneway === "yes" || tags.oneway === "-1" || tags.highway === "motorway";
  // Dual carriageways are mapped as one way per direction, each carrying half the traffic.
  if (oneway && (tags.highway === "motorway" || tags.highway === "trunk" || tags.highway === "primary")) aadt /= 2;
  const lanes = Number(tags.lanes);
  if (cls.lanes && lanes > 0) aadt *= Math.min(2, Math.max(0.5, lanes / cls.lanes));
  const speed = parseSpeed(tags.maxspeed, cls.speed);
  const surface = ROUGH_SURFACES.has(tags.surface) ? 2.5 : 0;
  return {
    day: roadEmission(aadt * 0.06, cls.truckDay, speed) + surface,
    night: roadEmission(aadt * cls.nightShare, cls.truckNight, speed) + surface,
    cls,
  };
}

/* ---------- railways ---------- */

export function railLevels(tags: Record<string, string>): { day: number; night: number; label: string } | null {
  if (tags.tunnel && tags.tunnel !== "no") return null;
  if (tags.covered === "yes" || tags["railway:preserved"] === "yes") return null;
  if (tags.railway === "subway" && !(tags.bridge && tags.bridge !== "no") && Number(tags.layer ?? 0) <= 0) return null;
  const service = tags.service;
  switch (tags.railway) {
    case "rail":
      if (service === "yard" || service === "siding" || service === "spur" || service === "crossover")
        return { day: 50, night: 46, label: "Rail sidings" };
      if (tags.usage === "main" || tags.highspeed === "yes") return { day: 65, night: 62, label: "Main railway line" };
      if (tags.usage === "branch") return { day: 58, night: 50, label: "Branch railway line" };
      if (tags.usage === "industrial" || tags.usage === "military" || tags.usage === "tourism")
        return { day: 49, night: 38, label: "Industrial railway" };
      return { day: 61, night: 55, label: "Railway line" };
    case "light_rail":
      return { day: 57, night: 47, label: "Light rail" };
    case "subway":
      return { day: 58, night: 48, label: "Metro (above ground)" };
    case "tram":
      return { day: 56, night: 45, label: "Tram line" };
    case "narrow_gauge":
      return { day: 55, night: 45, label: "Narrow-gauge railway" };
    case "monorail":
      return { day: 50, night: 40, label: "Monorail" };
  }
  return null;
}

/* ---------- aircraft ---------- */

type AirportKind = "major" | "regional" | "military" | "small";
const AIR_REF: Record<AirportKind, { day: number; night: number }> = {
  // Level at 300 m slant distance from the flight track, day/night.
  major: { day: 66, night: 57 },
  regional: { day: 58, night: 44 },
  military: { day: 58, night: 35 },
  small: { day: 50, night: 30 },
};

type Runway = { a: XY; b: XY; length: number; ref?: string };
type Airport = {
  id: string;
  name: string;
  code?: string;
  center: XY;
  point: LatLon;
  kind: AirportKind;
  runways: Runway[];
  heliport: boolean;
  paved: boolean;
  tags: Record<string, string>;
};

function airports(elements: OsmElement[], proj: Projection): Airport[] {
  const ports: Airport[] = [];
  const rawRunways: (Runway & { surface?: string; latlngs: LatLon[] })[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (t.aeroway === "runway") {
      const line = elementLines(e)[0];
      if (!line || line.length < 2) continue;
      const pts = line.map((p) => proj.toXY(p.lat, p.lon));
      // Runways are straight: use the two endpoints furthest apart.
      let a = pts[0];
      let b = pts[pts.length - 1];
      for (const p of pts) if (dist(p, a) > dist(a, b)) b = p;
      for (const p of pts) if (dist(p, b) > dist(a, b)) a = p;
      rawRunways.push({ a, b, length: dist(a, b), ref: t.ref, surface: t.surface, latlngs: line });
    } else if (t.aeroway === "aerodrome" || t.aeroway === "heliport") {
      const pt = elementPoint(e);
      if (!pt) continue;
      if (t.disused === "yes" || t.abandoned === "yes") continue;
      ports.push({
        id: `${e.type}${e.id}`,
        name: t["name:en"] || t.name || (t.aeroway === "heliport" ? "Heliport" : "Airfield"),
        code: t.iata || t.icao,
        center: proj.toXY(pt.lat, pt.lon),
        point: pt,
        kind: t.military === "airfield" || t["aerodrome:type"] === "military" || t.landuse === "military" ? "military" : "small",
        runways: [],
        heliport: t.aeroway === "heliport",
        paved: false,
        tags: t,
      });
    }
  }
  // Merge runway pieces that share an airport and designation.
  for (const r of rawRunways) {
    const mid = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 };
    let owner: Airport | null = null;
    let best = 5000;
    for (const p of ports) {
      if (p.heliport) continue;
      const d = dist(p.center, mid);
      if (d < best) {
        best = d;
        owner = p;
      }
    }
    if (!owner) {
      owner = { id: `rwy${ports.length}`, name: "Airstrip", center: mid, point: proj.toLatLon(mid), kind: "small", runways: [], heliport: false, paved: false, tags: {} };
      ports.push(owner);
    }
    const same = r.ref ? owner.runways.find((x) => x.ref === r.ref) : undefined;
    if (same) {
      const ends = [same.a, same.b, r.a, r.b];
      let pair: [XY, XY] = [same.a, same.b];
      for (const p of ends) for (const q of ends) if (dist(p, q) > dist(pair[0], pair[1])) pair = [p, q];
      same.a = pair[0];
      same.b = pair[1];
      same.length = dist(pair[0], pair[1]);
    } else {
      owner.runways.push({ a: r.a, b: r.b, length: r.length, ref: r.ref });
      owner.paved ||= !/grass|dirt|gravel|ground|sand/.test(r.surface ?? "");
    }
  }
  for (const p of ports) {
    if (p.heliport || p.kind === "military") continue;
    const t = p.tags;
    const longest = Math.max(0, ...p.runways.map((r) => r.length));
    const international = t["aerodrome:type"] === "international" || t.aerodrome === "international";
    if (longest >= 2400 && (t.iata || international)) p.kind = "major";
    else if (p.paved && (t.iata || longest >= 1500)) p.kind = "regional";
  }
  return ports;
}

function airportNoise(port: Airport): { day: number; night: number; distance: number; detail: string } {
  const origin = { x: 0, y: 0 };
  if (port.heliport) {
    const d = Math.max(dist(origin, port.center), 60);
    const fall = 20 * Math.log10(d / 300) + 0.004 * d;
    return { day: 52 - fall, night: 40 - fall, distance: d, detail: "Heliport" };
  }
  const ref = AIR_REF[port.kind];
  const runways = port.runways.filter((r) => r.length >= (port.kind === "major" ? 1500 : 300));
  const nearest = Math.min(dist(origin, port.center), ...runways.map((r) => closestOnSegment(origin, r.a, r.b).d));
  if (!runways.length || port.kind === "small") {
    // Small fields fly circuits around the field: treat as spread around the runway.
    const d = Math.max(nearest, 150);
    const fall = 20 * Math.log10(d / 300) + 0.004 * Math.max(0, d - 300);
    return { day: ref.day - fall, night: ref.night - fall, distance: nearest, detail: "Airfield circuit traffic" };
  }
  // Traffic is shared between runways.
  const share = 10 * Math.log10(runways.length);
  let total = 0;
  let bestE = 0;
  let detail = "Airport";
  for (const r of runways) {
    const mx = (r.a.x + r.b.x) / 2;
    const my = (r.a.y + r.b.y) / 2;
    const ux = (r.b.x - r.a.x) / r.length;
    const uy = (r.b.y - r.a.y) / r.length;
    const along = -mx * ux - my * uy;
    const lateral = Math.abs(-mx * uy + my * ux);
    const beyond = Math.abs(along) - r.length / 2;
    let slant: number;
    if (beyond <= 0) slant = Math.max(lateral, 80);
    else {
      const altitude = 60 + 0.065 * beyond;
      const corridor = Math.max(0, lateral - 0.08 * beyond);
      slant = Math.hypot(corridor, altitude);
    }
    const fall = slant >= 300 ? 17 * Math.log10(slant / 300) + 0.003 * (slant - 300) : -Math.min(6, 17 * Math.log10(300 / slant));
    const level = ref.day - fall - share;
    total += energy(level);
    if (energy(level) > bestE) {
      bestE = energy(level);
      detail =
        beyond > 0 && Math.max(0, lateral - 0.08 * beyond) < 1200
          ? `Under the ${r.ref ? `runway ${r.ref} ` : ""}flight path`
          : beyond <= 0
            ? "Alongside the runway"
            : "Off the main flight paths";
    }
  }
  const day = toDb(total);
  return { day, night: day - (ref.day - ref.night), distance: nearest, detail };
}

/* ---------- dining & nightlife ---------- */

const VENUES: Record<string, { day: number; night: number; label: string }> = {
  // Level at 10 m from the venue: guests arriving and leaving, terraces, music.
  nightclub: { day: 46, night: 64, label: "Nightclub" },
  bar: { day: 52, night: 58, label: "Bar" },
  pub: { day: 52, night: 57, label: "Pub" },
  biergarten: { day: 57, night: 54, label: "Beer garden" },
  restaurant: { day: 51, night: 47, label: "Restaurant" },
  food_court: { day: 52, night: 42, label: "Food court" },
  fast_food: { day: 50, night: 43, label: "Fast food" },
  cafe: { day: 48, night: 34, label: "Café" },
};

/* ---------- main ---------- */

export type NoiseInput = {
  proj: Projection;
  streets: OsmElement[] | null;
  air: OsmElement[] | null;
  places: OsmElement[] | null;
  skyline: Skyline | null;
};

export function analyzeNoise(input: NoiseInput): NoiseResult {
  const { proj, skyline } = input;
  const path = makePath(skyline);
  const origin = { x: 0, y: 0 };
  const sources: NoiseSource[] = [];

  // Roads: energetic sum of every piece; grouped by street name for display.
  const roadGroups = new Map<string, NoiseSource & { eDay: number; eNight: number }>();
  // Individual OSM ways for the map, tagged with the street or line they belong to.
  const lineWays: (NoiseSource & { group: string })[] = [];
  const railBinsDay = new Float64Array(360);
  const railBinsNight = new Float64Array(360);
  const railGroups = new Map<string, NoiseSource & { eDay: number; eNight: number }>();

  for (const e of input.streets ?? []) {
    const t = e.tags ?? {};
    const lines = elementLines(e).filter((l) => l.length > 1);
    if (!lines.length) continue;
    const xy = lines.map((l) => l.map((p) => proj.toXY(p.lat, p.lon)));

    if (t.highway) {
      const lv = roadLevels(t);
      if (!lv) continue;
      let eDay = 0;
      let eNight = 0;
      let closest: Piece | null = null;
      for (const line of xy)
        for (const piece of linePieces(line, path)) {
          eDay += energy(lv.day) * piece.e;
          eNight += energy(lv.night) * piece.e;
          if (!closest || piece.r < closest.r) closest = piece;
        }
      if (!closest) continue;
      const name = t.name || t.ref || lv.cls.label;
      const key = `${name}|${lv.cls.label}`;
      const g = roadGroups.get(key);
      if (g) {
        g.eDay += eDay;
        g.eNight += eNight;
        if (closest.r < g.distance) {
          g.distance = closest.r;
          g.shielded = closest.shielded;
        }
        g.lines!.push(...lines);
      } else {
        roadGroups.set(key, {
          id: `road-${key}`, category: "road", name, detail: lv.cls.label, distance: closest.r, day: 0, night: 0,
          shielded: closest.shielded, lines: [...lines], eDay, eNight,
        });
      }
      lineWays.push({ id: `w${e.id}`, category: "road", name, detail: lv.cls.label, distance: closest.r, day: 0, night: 0, shielded: closest.shielded, lines, group: `road-${key}` });
    } else if (t.railway) {
      const lv = railLevels(t);
      if (!lv) continue;
      // Parallel tracks share one line's traffic: per direction, keep the loudest track only.
      const wayDay = new Float64Array(360);
      let eDay = 0;
      let eNight = 0;
      let closest: Piece | null = null;
      for (const line of xy)
        for (const piece of linePieces(line, path)) {
          spread(wayDay, piece, energy(lv.day) * piece.e);
          eDay += energy(lv.day) * piece.e;
          eNight += energy(lv.night) * piece.e;
          if (!closest || piece.r < closest.r) closest = piece;
        }
      if (!closest) continue;
      const ratio = lv.night - lv.day;
      for (let b = 0; b < 360; b++) {
        if (wayDay[b] > railBinsDay[b]) railBinsDay[b] = wayDay[b];
        const n = wayDay[b] * 10 ** (ratio / 10);
        if (n > railBinsNight[b]) railBinsNight[b] = n;
      }
      const name = t.name || lv.label;
      const key = `${name}|${lv.label}`;
      const g = railGroups.get(key);
      const detail = !t.name && t.ref && t.railway === "tram" ? `Line ${t.ref}` : lv.label;
      const way: NoiseSource = { id: `w${e.id}`, category: "rail", name, detail, distance: closest.r, day: toDb(eDay), night: toDb(eNight), shielded: closest.shielded, lines };
      lineWays.push({ ...way, group: `rail-${key}` });
      if (g) {
        g.eDay = Math.max(g.eDay, eDay);
        g.eNight = Math.max(g.eNight, eNight);
        if (closest.r < g.distance) {
          g.distance = closest.r;
          g.shielded = closest.shielded;
        }
      } else railGroups.set(key, { ...way, id: `rail-${key}`, eDay, eNight });
    } else if (t.landuse === "industrial") {
      const ring = xy[0];
      const d = Math.max(distanceToPolygon(origin, ring), 0);
      const r = Math.max(d, 30);
      const near = distanceToPolyline(origin, ring);
      const { att, shielded } = d > 0 ? path(near.point) : { att: 0, shielded: false };
      const fall = 15 * Math.log10(r / 30) + Math.min(att, 12);
      sources.push({ id: `ind${e.id}`, category: "other", name: t.name || "Industrial area", detail: "Industry & logistics", distance: d, day: 57 - fall, night: 49 - fall, shielded, lines });
    }
  }

  for (const g of roadGroups.values()) sources.push({ ...g, day: toDb(g.eDay), night: toDb(g.eNight) });

  const railTotalDay = railBinsDay.reduce((a, b) => a + b, 0);
  const railTotalNight = railBinsNight.reduce((a, b) => a + b, 0);
  const railSources = [...railGroups.values()].map((g) => ({ ...g, day: toDb(g.eDay), night: toDb(g.eNight) }));
  // Scale individual lines so they never exceed the de-duplicated total.
  const railRaw = railSources.reduce((a, s) => a + energy(s.day), 0);
  const railScale = railRaw > 0 ? Math.min(1, railTotalDay / railRaw) : 1;
  for (const s of railSources) {
    const k = toDb(railScale);
    sources.push({ ...s, day: s.day + k, night: s.night + k });
  }

  // Stadiums and fire stations.
  for (const e of input.streets ?? []) {
    const t = e.tags ?? {};
    const pt = elementPoint(e);
    if (!pt) continue;
    const p = proj.toXY(pt.lat, pt.lon);
    const d = len(p);
    const { att, shielded } = path(p);
    if (t.leisure === "stadium") {
      const fall = 20 * Math.log10(Math.max(d, 80) / 100) + att;
      sources.push({ id: `st${e.id}`, category: "other", name: t.name || "Stadium", detail: "Stadium · event days", distance: d, day: 58 - fall, night: 48 - fall, shielded, point: pt });
    } else if (t.amenity === "fire_station") {
      const fall = 20 * Math.log10(Math.max(d, 20) / 50) + att;
      sources.push({ id: `fs${e.id}`, category: "other", name: t.name || "Fire station", detail: "Sirens", distance: d, day: 50 - fall, night: 46 - fall, shielded, point: pt });
    }
  }

  // Aircraft.
  if (input.air) {
    for (const port of airports(input.air, proj)) {
      if (port.heliport && len(port.center) > 3000) continue;
      const n = airportNoise(port);
      if (n.day < 25) continue;
      sources.push({
        id: port.id, category: "air", name: port.code && !port.heliport ? `${port.name} (${port.code})` : port.name,
        detail: n.detail, distance: n.distance, day: n.day, night: n.night, shielded: false, point: port.point,
      });
    }
  }

  // Dining & nightlife venues.
  const seen = new Set<string>();
  for (const e of input.places ?? []) {
    const t = e.tags ?? {};
    const v = VENUES[t.amenity];
    const pt = elementPoint(e);
    if (!v || !pt) continue;
    const key = `${t.name}|${pt.lat.toFixed(4)}|${pt.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = proj.toXY(pt.lat, pt.lon);
    const d = len(p);
    const { att, shielded } = path(p);
    const terrace = t.outdoor_seating === "yes" ? 3 : 0;
    const late = /24\/7|0[2-5]:\d\d|2[4-9]:\d\d/.test(t.opening_hours ?? "") ? 3 : 0;
    const fall = 20 * Math.log10(Math.max(d, 10) / 10) + att;
    sources.push({
      id: `v${e.type}${e.id}`, category: "nightlife", name: t.name || v.label, detail: v.label + (terrace ? " · terrace" : ""),
      distance: d, day: v.day + terrace - fall, night: v.night + terrace + late - fall, shielded, point: pt,
    });
  }

  const LABELS: Record<NoiseCategoryId, string> = {
    road: "Road traffic",
    rail: "Trains & trams",
    air: "Aircraft",
    nightlife: "Restaurants & nightlife",
    other: "Industry & events",
  };
  const categories: NoiseCategory[] = (Object.keys(LABELS) as NoiseCategoryId[]).map((id) => {
    const loudest = (s: NoiseSource) => (id === "nightlife" ? s.night : s.day);
    const list = sources.filter((s) => s.category === id).sort((a, b) => loudest(b) - loudest(a));
    const day = id === "rail" ? toDb(railTotalDay) : sumDb(...list.map((s) => s.day));
    const night = id === "rail" ? toDb(railTotalNight) : sumDb(...list.map((s) => s.night));
    return { id, label: LABELS[id], day, night, sources: list.filter((s) => loudest(s) > 20).slice(0, 5) };
  });

  // Colour each mapped way by its whole street's or line's contribution, as in the source list.
  const groupLevels = new Map(sources.map((s) => [s.id, s]));
  const ways = lineWays.flatMap(({ group, ...w }) => {
    const g = groupLevels.get(group);
    return g ? [{ ...w, day: g.day, night: g.night }] : [];
  });
  const mapSources = [...ways, ...sources.filter((s) => s.category !== "road" && s.category !== "rail")].filter((s) => s.day > 30);
  return finalize(categories, mapSources);
}

/** Distributes a piece's energy across the 1° azimuth bins it spans. */
function spread(bins: Float64Array, piece: Piece, e: number) {
  let from = piece.azFrom;
  let to = piece.azTo;
  let span = ((to - from + 540) % 360) - 180;
  if (span < 0) {
    [from, to] = [to, from];
    span = -span;
  }
  if (span < 1e-6) {
    bins[Math.floor(from) % 360] += e;
    return;
  }
  for (let k = Math.floor(from); k <= Math.floor(from + span); k++) {
    const overlap = Math.min(k + 1, from + span) - Math.max(k, from);
    if (overlap > 0) bins[((k % 360) + 360) % 360] += (e * overlap) / span;
  }
}

function finalize(categories: NoiseCategory[], mapSources: NoiseSource[]): NoiseResult {
  const day = sumDb(BACKGROUND.day, ...categories.map((c) => c.official?.day ?? c.day));
  const night = sumDb(BACKGROUND.night, ...categories.map((c) => c.official?.night ?? c.night));
  return { categories, day, night, score: quietScore(day, night), mapSources };
}

/**
 * Replaces modelled road/rail levels with official values where available, shifting the individual
 * sources by the same amount so the map and source list stay consistent with the official total.
 */
export function withOfficial(result: NoiseResult, official: OfficialNoise | null): NoiseResult {
  if (!official) return result;
  const shift = new Map<NoiseCategoryId, { day: number; night: number }>();
  const categories = result.categories.map((c) => {
    if (c.id !== "road" && c.id !== "rail") return c;
    const o = official[c.id];
    if (o.day == null || o.night == null) return c;
    if (Number.isFinite(c.day) && Number.isFinite(c.night)) shift.set(c.id, { day: o.day - c.day, night: o.night - c.night });
    const adjust = (s: NoiseSource) => {
      const d = shift.get(c.id);
      return d ? { ...s, day: s.day + d.day, night: s.night + d.night } : s;
    };
    return { ...c, sources: c.sources.map(adjust), official: { day: o.day, night: o.night, source: "sonBASE · Swiss Federal Office for the Environment" } };
  });
  const mapSources = result.mapSources.map((s) => {
    const d = shift.get(s.category);
    return d ? { ...s, day: s.day + d.day, night: s.night + d.night } : s;
  });
  return finalize(categories, mapSources);
}

/* ---------- ratings ---------- */

export type Tone = "good" | "fair" | "warning" | "serious" | "critical";

const DAY_STEPS: [number, string, Tone][] = [
  [45, "Very quiet", "good"],
  [50, "Quiet", "good"],
  [55, "Moderate", "fair"],
  [60, "Noticeable", "warning"],
  [65, "Loud", "serious"],
  [Infinity, "Very loud", "critical"],
];

export function rateNoise(db: number, period: "day" | "night" = "day"): { label: string; tone: Tone } {
  const v = period === "night" ? db + 10 : db;
  const step = DAY_STEPS.find(([max]) => v < max)!;
  return { label: step[1], tone: step[2] };
}

export function quietScore(day: number, night: number): number {
  const f = (l: number) => Math.max(0, Math.min(100, 100 - (l - 42) * 3.6));
  return Math.round(0.6 * f(day) + 0.4 * f(night + 10));
}
