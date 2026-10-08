import type { LatLon, Projection, XY } from "./geo";
import { bearing, distanceToPolygon, len, pointInPolygon, polygonArea, rayHit } from "./geo";
import type { OsmElement } from "./osm";
import { elementLines } from "./osm";
import type { RegisterBuilding } from "./register";

/** Where a building's height comes from, best first. */
export type HeightSource = "measured" | "register" | "levels" | "typical";

export type Building = {
  id: number;
  ring: XY[];
  latlngs: LatLon[];
  height: number;
  /** Floors from OSM or the building register, when known. */
  levels: number | null;
  /** True when neither height nor floors were known and we fell back to a typical value. */
  estimated: boolean;
  source: HeightSource;
  /** Open structures (canopies, carports) cast shade but don't block sound. */
  solid: boolean;
  kind: string;
  /** Footprint, m². */
  footprint: number;
  address: string | null;
  year: number | null;
};

const TYPICAL_HEIGHT: Record<string, number> = {
  house: 8, detached: 8, semidetached_house: 8, terrace: 8, bungalow: 4.5, farm: 8, cabin: 4,
  residential: 11, apartments: 14, dormitory: 14, hotel: 15,
  commercial: 12, office: 14, retail: 8, supermarket: 7, kiosk: 3,
  industrial: 9, warehouse: 9, manufacture: 9, hangar: 10,
  church: 16, cathedral: 25, chapel: 8, mosque: 12, synagogue: 12, temple: 10,
  school: 12, kindergarten: 6, university: 16, college: 14, hospital: 18, public: 12, civic: 12, government: 14,
  train_station: 12, transportation: 8, stadium: 18, sports_hall: 10, parking: 9,
  garage: 3, garages: 3, shed: 3, hut: 3, carport: 3, roof: 4, greenhouse: 3, service: 3,
  toilets: 3, container: 3, allotment_house: 3, static_caravan: 3, construction: 9,
};
const OPEN_STRUCTURES = new Set(["roof", "carport"]);

function parseMetres(v?: string): number | null {
  if (!v) return null;
  const m = v.replace(",", ".").match(/^\s*([\d.]+)\s*(m|ft|')?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] === "ft" || m[2] === "'" ? n * 0.3048 : n;
}

/** Storeys to metres: 3 m a storey, a taller ground floor and half-height roof storeys. */
export const storeysToHeight = (levels: number, roofLevels = 0) => levels * 3 + roofLevels * 1.5 + 1;

export function buildingHeight(tags: Record<string, string>): { height: number; levels: number | null; estimated: boolean; source: HeightSource } {
  const levels = parseMetres(tags["building:levels"]);
  const height = parseMetres(tags.height);
  if (height) return { height: Math.min(height, 400), levels, estimated: false, source: "measured" };
  if (levels) return { height: storeysToHeight(levels, parseMetres(tags["roof:levels"]) ?? 0), levels, estimated: false, source: "levels" };
  return { height: TYPICAL_HEIGHT[tags.building] ?? 10, levels: null, estimated: true, source: "typical" };
}

export function parseBuildings(elements: OsmElement[], proj: Projection): Building[] {
  const out: Building[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    if (!tags.building || tags.building === "no") continue;
    const line = elementLines(e)[0];
    if (!line || line.length < 4) continue;
    const { height, levels, estimated, source } = buildingHeight(tags);
    const ring = line.map((p) => proj.toXY(p.lat, p.lon));
    const street = tags["addr:street"] ?? tags["addr:place"];
    out.push({
      id: e.id,
      ring,
      latlngs: line,
      height,
      levels,
      estimated,
      source,
      solid: !OPEN_STRUCTURES.has(tags.building),
      kind: tags.building,
      footprint: Math.round(polygonArea(ring)),
      address: street && tags["addr:housenumber"] ? `${street} ${tags["addr:housenumber"]}` : null,
      year: Number(tags.start_date?.slice(0, 4)) || null,
    });
  }
  return out;
}

/**
 * Takes storeys, address and year from the Swiss building register for every building whose footprint
 * holds a registered building. A mapped height (OSM `height`) still wins; storeys replace mapped or guessed ones.
 */
export function applyRegister(buildings: Building[], register: RegisterBuilding[], proj: Projection): Building[] {
  if (!register.length) return buildings;
  const pts = register.map((r) => ({ r, p: proj.toXY(r.lat, r.lon) }));
  return buildings.map((b) => {
    const xs = b.ring.map((q) => q.x);
    const ys = b.ring.map((q) => q.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const inside = pts.filter(({ p }) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pointInPolygon(p, b.ring)).map(({ r }) => r);
    if (!inside.length) return b;
    // Row houses mapped as one footprint: the tallest registered part sets the skyline.
    const top = inside.reduce((a, r) => ((r.floors ?? 0) > (a.floors ?? 0) ? r : a));
    const next = { ...b, address: b.address ?? top.address, year: b.year ?? top.year };
    if (b.source === "measured" || !top.floors) return next;
    return { ...next, height: storeysToHeight(top.floors), levels: top.floors, estimated: false, source: "register" as const };
  });
}

type Hit = { d: number; h: number; solid: boolean; building: Building };

export type Skyline = {
  /** The building the address sits in (or right next to), excluded from shading/shielding. */
  own: Building | null;
  others: Building[];
  /** Share of ground covered by buildings within the scan radius. */
  coverage: number;
  /** Share of surrounding buildings whose height had to be guessed. */
  estimatedShare: number;
  /** Per 1° azimuth bin: distance to the first solid building at least 3 m tall. */
  screenDist: Float32Array;
  hits: Hit[][];
  radius: number;
};

/** `ownId` names the address's own building when it is already known (as in the area ranking). */
export function buildSkyline(buildings: Building[], radius: number, ownId?: number): Skyline {
  const origin = { x: 0, y: 0 };
  let own: Building | null =
    (ownId != null ? buildings.find((b) => b.id === ownId) : buildings.find((b) => pointInPolygon(origin, b.ring))) ?? null;
  if (!own) {
    // Address points usually sit inside the footprint or on its entrance; allow a small offset.
    let best = 6;
    for (const b of buildings) {
      const d = distanceToPolygon(origin, b.ring);
      if (d < best) {
        best = d;
        own = b;
      }
    }
  }
  const others = buildings.filter((b) => b !== own);
  const hits: Hit[][] = Array.from({ length: 360 }, () => []);
  const screenDist = new Float32Array(360).fill(Infinity);
  let area = 0;

  for (const b of buildings) {
    const c = b.ring.reduce((acc, p) => ({ x: acc.x + p.x / b.ring.length, y: acc.y + p.y / b.ring.length }), origin);
    if (len(c) <= radius) area += polygonArea(b.ring);
  }

  for (const b of others) {
    const base = bearing(origin, b.ring[0]);
    let lo = 0;
    let hi = 0;
    for (const p of b.ring) {
      const rel = ((bearing(origin, p) - base + 540) % 360) - 180;
      lo = Math.min(lo, rel);
      hi = Math.max(hi, rel);
    }
    if (hi - lo >= 180) continue;
    let found = false;
    const first = Math.floor(base + lo);
    const last = Math.floor(base + hi);
    for (let k = first; k <= last; k++) {
      const bin = ((k % 360) + 360) % 360;
      let d = Infinity;
      for (let i = 0; i < b.ring.length - 1; i++) {
        const t = rayHit(bin + 0.5, b.ring[i], b.ring[i + 1]);
        if (t != null && t < d) d = t;
      }
      if (d === Infinity) continue;
      found = true;
      record(bin, d, b);
    }
    if (!found) {
      // Tiny or distant footprint that slips between bin centres: count it once.
      const bin = Math.floor(bearing(origin, b.ring[0])) % 360;
      record(bin, Math.min(...b.ring.map(len)), b);
    }
  }

  function record(bin: number, d: number, b: Building) {
    hits[bin].push({ d, h: b.height, solid: b.solid, building: b });
    if (b.solid && b.height >= 3 && d < screenDist[bin]) screenDist[bin] = d;
  }

  return {
    own,
    others,
    coverage: Math.min(0.9, area / (Math.PI * radius * radius)),
    estimatedShare: others.length ? others.filter((b) => b.estimated).length / others.length : 0,
    screenDist,
    hits,
    radius,
  };
}

/**
 * Elevation angle (degrees) of the building skyline per 1° azimuth bin, for an eye at `observerHeight` m,
 * and the building that forms the skyline in each direction.
 */
export function skylineProfile(s: Skyline, observerHeight: number): { angles: Float32Array; owners: (Building | null)[] } {
  const angles = new Float32Array(360);
  const owners: (Building | null)[] = Array(360).fill(null);
  for (let b = 0; b < 360; b++) {
    let best = 0;
    for (const hit of s.hits[b]) {
      const angle = (Math.atan2(hit.h - observerHeight, Math.max(hit.d, 1)) * 180) / Math.PI;
      if (angle > best) {
        best = angle;
        owners[b] = hit.building;
      }
    }
    angles[b] = best;
  }
  return { angles, owners };
}

export const buildingHorizon = (s: Skyline, observerHeight: number): Float32Array => skylineProfile(s, observerHeight).angles;
