// Scores every residential address in an area with the same models as the single-address report.

import type { FlyoverLevel } from "./airports";
import { analyzeFlights } from "./airports";
import { analyzeGetAround, analyzeSchools, analyzeShopping } from "./amenities";
import type { AreaShape, BBox } from "./area";
import { inArea } from "./area";
import type { Climate } from "./climate";
import type { LatLon, Projection, XY } from "./geo";
import { makeProjection, pointInPolygon, polygonArea } from "./geo";
import type { NoiseCategoryId, NoiseResult } from "./noise";
import { analyzeNoise, withOfficial } from "./noise";
import type { OsmElement } from "./osm";
import { RADIUS, elementLines, elementPoint } from "./osm";
import { overallScore } from "./score";
import type { OfficialNoise } from "./swissNoise";
import { buildingHeight, buildSkyline, parseBuildings } from "./skyline";
import type { DaySample } from "./sun";
import { daySamples } from "./sun";
import { analyzeSun } from "./sunlight";

export type HomeKind = "flats" | "house";

export type AreaHome = {
  /** OSM way id of the building. */
  id: number;
  lat: number;
  lon: number;
  /** Street and house number. */
  address: string;
  postcode?: string;
  city?: string;
  kind: HomeKind;
  /** "Apartment building", "Detached house", … */
  kindLabel: string;
  levels: number | null;
  /** Footprint, m². */
  footprint: number;
  score: number;
  scores: { noise: number; schools: number; shopping: number; sun: number };
  noise: { day: number; night: number };
  /** Day and night level per noise source, kept so official values can replace the modelled ones. */
  noiseBy: Record<NoiseCategoryId, [number, number]>;
  /** Hours of direct sun on the shortest day at the scored floor. */
  winterSun: number;
  /** Walking distances in metres to the nearest supermarket and school. */
  supermarket: number | null;
  school: number | null;
  /** Walking distances in metres to the nearest childcare or kindergarten, public transport stop, train station and green space. */
  childcare: number | null;
  stop: number | null;
  station: number | null;
  green: number | null;
  /** Bars, pubs and clubs within 150 m. */
  barsNearby: number;
  /** Average daily hours of direct sun after 17:00 and before 10:00, April to September. */
  eveningSun: number;
  morningSun: number;
  flyover: FlyoverLevel;
  /** True once road, rail and aircraft noise come from the official Swiss noise maps. */
  official: boolean;
};

export type AreaData = {
  buildings: OsmElement[];
  streets: OsmElement[];
  places: OsmElement[];
  air: OsmElement[] | null;
  climate: Climate | null;
};

/** Floor the ranking scores sunlight at, as in a new report. */
export const AREA_FLOOR = 1;

const HOUSES: Record<string, string> = {
  house: "House",
  detached: "Detached house",
  semidetached_house: "Semi-detached house",
  terrace: "Terraced house",
  bungalow: "Bungalow",
  farm: "Farmhouse",
  villa: "Villa",
};
const FLATS: Record<string, string> = { apartments: "Apartment building", residential: "Residential building", dormitory: "Residence hall" };
/** Tags that mark a building with an address as something other than a home. */
const NOT_HOME = ["shop", "amenity", "office", "tourism", "craft", "industrial", "healthcare", "leisure", "public_transport", "disused:shop"];

type Candidate = {
  e: OsmElement;
  point: LatLon;
  address: string;
  kind: HomeKind;
  kindLabel: string;
  levels: number | null;
  footprint: number;
};

/** A point inside the footprint: its centroid, or the inside grid point closest to it for L- and U-shaped buildings. */
export function insidePoint(ring: XY[]): XY {
  const n = ring.length - 1;
  const c = ring.slice(0, n).reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
  if (pointInPolygon(c, ring)) return c;
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: XY | null = null;
  let bestD = Infinity;
  // Cell centres, so the point never lands exactly on an edge.
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      const p = { x: x0 + ((x1 - x0) * (i + 0.5)) / 12, y: y0 + ((y1 - y0) * (j + 0.5)) / 12 };
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD && pointInPolygon(p, ring)) {
        best = p;
        bestD = d;
      }
    }
  return best ?? c;
}

/** Residential buildings with a house number inside the area and the ranked window. */
export function findHomes(buildings: OsmElement[], shape: Pick<AreaShape, "rings" | "bbox">, window: BBox): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const e of buildings) {
    const t = e.tags ?? {};
    const number = t["addr:housenumber"];
    const street = t["addr:street"] ?? t["addr:place"];
    if (!number || !street) continue;
    const type = t.building;
    if (!(type in HOUSES || type in FLATS || type === "yes")) continue;
    if (NOT_HOME.some((k) => t[k])) continue;
    const ring = elementLines(e)[0];
    if (!ring || ring.length < 4) continue;
    const proj = makeProjection(ring[0]);
    const xy = ring.map((p) => proj.toXY(p.lat, p.lon));
    const footprint = polygonArea(xy);
    if (footprint < 30) continue;
    const point = proj.toLatLon(insidePoint(xy));
    if (point.lat < window.south || point.lat > window.north || point.lon < window.west || point.lon > window.east) continue;
    if (!inArea(shape, point)) continue;
    const address = `${street} ${number.replace(/\s*;\s*/g, ", ")}`;
    if (seen.has(address)) continue;
    seen.add(address);
    const { levels } = buildingHeight(t);
    // Untyped buildings: small, low ones are houses, the rest apartment buildings.
    const kind: HomeKind = type in HOUSES || (type === "yes" && footprint < 220 && (levels ?? 2) <= 3) ? "house" : "flats";
    const kindLabel = HOUSES[type] ?? FLATS[type] ?? (kind === "house" ? "House" : "Residential building");
    out.push({ e, point, address, kind, kindLabel, levels, footprint: Math.round(footprint) });
  }
  return out;
}

/* ---------- spatial index ---------- */

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Uniform grid over element bounding boxes, in metres around the window centre. */
class Grid<T> {
  private cells = new Map<string, { item: T; box: Box }[]>();
  constructor(private size: number) {}
  add(item: T, box: Box) {
    const s = this.size;
    for (let i = Math.floor(box.x0 / s); i <= Math.floor(box.x1 / s); i++)
      for (let j = Math.floor(box.y0 / s); j <= Math.floor(box.y1 / s); j++) {
        const k = `${i},${j}`;
        const cell = this.cells.get(k);
        if (cell) cell.push({ item, box });
        else this.cells.set(k, [{ item, box }]);
      }
  }
  /** Items whose box comes within `r` of `p`, or within `reach(item)` when that is smaller. */
  near(p: XY, r: number, reach?: (item: T) => number): T[] {
    const s = this.size;
    const out = new Set<T>();
    for (let i = Math.floor((p.x - r) / s); i <= Math.floor((p.x + r) / s); i++)
      for (let j = Math.floor((p.y - r) / s); j <= Math.floor((p.y + r) / s); j++)
        for (const { item, box } of this.cells.get(`${i},${j}`) ?? []) {
          if (out.has(item)) continue;
          const dx = Math.max(box.x0 - p.x, 0, p.x - box.x1);
          const dy = Math.max(box.y0 - p.y, 0, p.y - box.y1);
          const within = reach ? Math.min(r, reach(item)) : r;
          if (dx * dx + dy * dy <= within * within) out.add(item);
        }
    return [...out];
  }
}

function boxOf(e: OsmElement, proj: Projection): Box | null {
  const pts = elementLines(e).flat();
  const pt = elementPoint(e);
  if (!pts.length && pt) pts.push(pt);
  if (!pts.length) return null;
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of pts) {
    const q = proj.toXY(p.lat, p.lon);
    b.x0 = Math.min(b.x0, q.x);
    b.y0 = Math.min(b.y0, q.y);
    b.x1 = Math.max(b.x1, q.x);
    b.y1 = Math.max(b.y1, q.y);
  }
  return b;
}

function index(elements: OsmElement[], proj: Projection, keep: (t: Record<string, string>) => boolean = () => true, size = 200) {
  const grid = new Grid<OsmElement>(size);
  for (const e of elements) {
    if (!keep(e.tags ?? {})) continue;
    const box = boxOf(e, proj);
    if (box) grid.add(e, box);
  }
  return grid;
}

/* ---------- scoring ---------- */

const NOISE_IDS: NoiseCategoryId[] = ["road", "rail", "air", "nightlife", "other"];
const isRoute = (t: Record<string, string>) => !!(t.highway || t.railway || t.landuse);

export type ScoreOptions = {
  year?: number;
  /** `[k, n]`: score only every n-th home starting at k, so n workers can split an area. */
  part?: [number, number];
  onProgress?: (done: number, total: number) => void;
};

export function scoreArea(data: AreaData, shape: Pick<AreaShape, "rings" | "bbox">, window: BBox, opts: ScoreOptions = {}): AreaHome[] {
  const center = { lat: (window.south + window.north) / 2, lon: (window.west + window.east) / 2 };
  const base = makeProjection(center);
  const year = opts.year ?? new Date().getFullYear();
  const [k, n] = opts.part ?? [0, 1];
  const candidates = findHomes(data.buildings, shape, window).filter((_, i) => i % n === k);

  const buildings = index(data.buildings, base, (t) => !!t.building && t.building !== "no", 100);
  const routes = index(data.streets, base, isRoute, 250);
  const landmarks = index(data.streets, base, (t) => !isRoute(t), 500);
  const dining = index(data.places, base, (t) => !!t.amenity && !t.shop && /^(bar|pub|nightclub|restaurant|cafe|fast_food|biergarten|food_court)$/.test(t.amenity), 200);
  const education = index(data.places, base, (t) => /^(kindergarten|childcare|school|college|university)$/.test(t.amenity ?? ""), 500);
  const shops = index(data.places, base, (t) => !!t.shop || /^(pharmacy|marketplace|post_office)$/.test(t.amenity ?? ""), 250);
  const anyShop = index(data.places, base, (t) => !!t.shop, 250);
  const around = index(
    data.places,
    base,
    (t) => !!(t.highway === "bus_stop" || t.railway || t.public_transport || t.amenity === "ferry_terminal" || t.leisure === "park" || t.leisure === "nature_reserve" || t.landuse || t.natural === "wood"),
    250,
  );

  // Sun positions barely change across a few kilometres: compute each day once for the whole window.
  const days = new Map<string, DaySample[]>();
  const sampler: typeof daySamples = (y, m, d, _lat, _lon, step) => {
    const key = `${y}|${m}|${d}|${step}`;
    let s = days.get(key);
    if (!s) days.set(key, (s = daySamples(y, m, d, center.lat, center.lon, step)));
    return s;
  };

  const out: AreaHome[] = [];
  candidates.forEach((c, i) => {
    const proj = makeProjection(c.point);
    const here = base.toXY(c.point.lat, c.point.lon);
    const near = buildings.near(here, RADIUS.buildings);
    const skyline = buildSkyline(parseBuildings(near, proj), RADIUS.buildings, c.e.id);
    // The same search radii as a report's queries, per kind of source.
    const streets = [
      ...routes.near(here, RADIUS.rails, (e) => (e.tags?.highway ? RADIUS.roads : e.tags?.railway ? RADIUS.rails : RADIUS.industry)),
      ...landmarks.near(here, 2000, (e) => (e.tags?.leisure === "stadium" ? 2000 : 800)),
    ];
    const noise = analyzeNoise({ proj, streets, air: data.air, places: dining.near(here, RADIUS.dining), skyline });
    const schools = analyzeSchools(education.near(here, RADIUS.education), proj);
    const shopping = analyzeShopping(shops.near(here, RADIUS.shops), proj, anyShop.near(here, 800).length);
    const sun = analyzeSun({ lat: c.point.lat, lon: c.point.lon, floor: AREA_FLOOR, skyline, terrain: null, climate: data.climate, year, sampler, timeZone: data.climate?.timezone });
    // The report's search radii: bus stops 800 m, stations 2 km, green space 1 km.
    const reach = (e: OsmElement) => (e.tags?.highway === "bus_stop" ? RADIUS.stops : e.tags?.railway || e.tags?.public_transport || e.tags?.amenity ? RADIUS.stations : RADIUS.green);
    const getAround = analyzeGetAround([...around.near(here, RADIUS.stations, reach), ...dining.near(here, 150)], proj);
    const flyover = data.air ? analyzeFlights(data.air, proj, 40000, false).exposure.level : "none";
    const scores = { noise: noise.score, schools: schools.score, shopping: shopping.score, sun: sun.score };
    const t = c.e.tags ?? {};
    out.push({
      id: c.e.id,
      lat: c.point.lat,
      lon: c.point.lon,
      address: c.address,
      postcode: t["addr:postcode"],
      city: t["addr:city"],
      kind: c.kind,
      kindLabel: c.kindLabel,
      levels: c.levels,
      footprint: c.footprint,
      score: overallScore(scores) ?? 0,
      scores,
      noise: { day: noise.day, night: noise.night },
      noiseBy: Object.fromEntries(NOISE_IDS.map((id) => {
        const cat = noise.categories.find((k) => k.id === id)!;
        return [id, [cat.day, cat.night]];
      })) as AreaHome["noiseBy"],
      winterSun: sun.keyDays[0].direct,
      supermarket: shopping.essentials.find((e) => e.id === "supermarket")?.nearest?.distance ?? null,
      school: schools.groups[1].items[0]?.distance ?? null,
      childcare: schools.groups[0].items[0]?.distance ?? null,
      stop: getAround.stop?.distance ?? null,
      station: getAround.station?.distance ?? null,
      green: getAround.green?.distance ?? null,
      barsNearby: getAround.barsNearby,
      eveningSun: sun.eveningSun,
      morningSun: sun.morningSun,
      flyover,
      official: false,
    });
    if (i % 25 === 24) opts.onProgress?.(i + 1, candidates.length);
  });
  opts.onProgress?.(candidates.length, candidates.length);
  return rank(out);
}

export const rank = (homes: AreaHome[]) => homes.sort((a, b) => b.score - a.score || b.scores.noise - a.scores.noise || a.address.localeCompare(b.address));

/** Replaces a home's modelled road, rail and aircraft noise with official values, as the report does. */
export function applyOfficial(home: AreaHome, official: OfficialNoise): AreaHome {
  const modelled: NoiseResult = {
    categories: NOISE_IDS.map((id) => ({ id, label: id, day: home.noiseBy[id][0], night: home.noiseBy[id][1], sources: [] })),
    day: home.noise.day,
    night: home.noise.night,
    score: home.scores.noise,
    mapSources: [],
  };
  const noise = withOfficial(modelled, official);
  const scores = { ...home.scores, noise: noise.score };
  return {
    ...home,
    noise: { day: noise.day, night: noise.night },
    noiseBy: Object.fromEntries(noise.categories.map((c) => [c.id, [c.official?.day ?? c.day, c.official?.night ?? c.night]])) as AreaHome["noiseBy"],
    scores,
    score: overallScore(scores) ?? 0,
    official: true,
  };
}

/**
 * Checks the leading homes against the official noise maps and re-ranks, repeating while homes that
 * haven't been checked move into the lead.
 */
export async function refineTop(
  homes: AreaHome[],
  fetchOfficial: (lat: number, lon: number) => Promise<OfficialNoise | null>,
  opts: { top?: number; maxChecks?: number; concurrency?: number; onProgress?: (checked: number) => void } = {},
): Promise<AreaHome[]> {
  const top = opts.top ?? 25;
  const maxChecks = opts.maxChecks ?? 60;
  const concurrency = opts.concurrency ?? 4;
  let list = rank([...homes]);
  const checked = new Set<number>();
  while (checked.size < maxChecks) {
    const todo = list.slice(0, top).filter((h) => !checked.has(h.id)).slice(0, maxChecks - checked.size);
    if (!todo.length) break;
    const results = new Map<number, OfficialNoise | null>();
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
        while (next < todo.length) {
          const h = todo[next++];
          results.set(h.id, await fetchOfficial(h.lat, h.lon).catch(() => null));
          checked.add(h.id);
          opts.onProgress?.(checked.size);
        }
      }),
    );
    list = rank(list.map((h) => {
      const o = results.get(h.id);
      return o ? applyOfficial(h, o) : h;
    }));
  }
  return list;
}
