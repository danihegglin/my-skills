// Areas (postcodes, municipalities, districts) for the area ranking: search, boundaries and Overpass queries.

import { cachedFetch } from "./cache";
import type { LatLon } from "./geo";
import { haversine, makeProjection, pointInPolygon } from "./geo";
import { PHOTON, lang } from "./geocode";
import { DINING_RE, EDUCATION_RE, RADIUS, RAILS_RE, ROADS_RE, greenFilters, transitFilters } from "./osm";
import { inSwitzerland } from "./swissNoise";

export type AreaKind = "postcode" | "municipality" | "district" | "city" | "neighbourhood";

export type AreaRef = {
  /** `plz:<feature id>`, `gg:<municipality number>`, `box:<s>,<w>,<n>,<e>` or `near:<lat>,<lon>`. */
  id: string;
  label: string;
  kind: AreaKind;
  /** Second line in search results, e.g. "Municipality · ZH". */
  detail: string;
  /** Where to centre the ranking window when the area is too large to rank whole. */
  focus?: LatLon;
};

export type BBox = { south: number; west: number; north: number; east: number };

export type AreaShape = {
  ref: AreaRef;
  bbox: BBox;
  /** Boundary rings (outer and inner, even-odd), or null when only a bounding box is known. */
  rings: LatLon[][] | null;
};

export const KIND_LABEL: Record<AreaKind, string> = {
  postcode: "Postcode",
  municipality: "Municipality",
  district: "District",
  city: "City",
  neighbourhood: "Neighbourhood",
};

const GEOADMIN = "https://api3.geo.admin.ch/rest/services/api";
const PLZ_LAYER = "ch.swisstopo-vd.ortschaftenverzeichnis_plz";
const MUNI_LAYER = "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill";
/** Half the side of the neighbourhood box used where no official boundary is available. */
const NEAR_RADIUS = 1000;

/* ---------- search ---------- */

type GeoAdminHit = { attrs: { origin: string; label: string; featureId: string; lat: number; lon: number } };

export function parseGeoAdminSearch(json: { results?: GeoAdminHit[] }): AreaRef[] {
  const out: AreaRef[] = [];
  for (const { attrs: a } of json.results ?? []) {
    const label = a.label.replace(/<[^>]+>/g, "").trim();
    const focus = { lat: a.lat, lon: a.lon };
    if (a.origin === "zipcode") {
      const [plz, name] = label.split(/\s+-\s+/);
      out.push({ id: `plz:${a.featureId}`, label: name ? `${plz} ${name}` : label, kind: "postcode", detail: "Postcode · Switzerland", focus });
    } else if (a.origin === "gg25") {
      // Numbers from 9000 are lakes and other land without a municipality.
      if (Number(a.featureId) >= 9000) continue;
      const m = label.match(/^(.*?)\s*\(([A-Z]{2})\)$/);
      out.push({ id: `gg:${a.featureId}`, label: m?.[1] ?? label, kind: "municipality", detail: `Municipality · ${m?.[2] ?? "Switzerland"}`, focus });
    }
  }
  return out;
}

type PhotonArea = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; type?: string; osm_value?: string; city?: string; state?: string; country?: string; countrycode?: string; extent?: [number, number, number, number] };
};

export function parsePhotonAreas(json: { features?: PhotonArea[] }): AreaRef[] {
  const out: AreaRef[] = [];
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (!p.extent || !p.name) continue;
    const postcode = p.osm_value === "postcode";
    const kind: AreaKind | null = postcode ? "postcode" : p.type === "city" ? "city" : p.type === "district" || p.type === "locality" ? "district" : null;
    if (!kind) continue;
    // Swiss postcodes and municipalities come from the official boundaries instead.
    if (p.countrycode === "CH" && kind !== "district") continue;
    const [west, north, east, south] = p.extent;
    const [lon, lat] = f.geometry.coordinates;
    const label = postcode && p.city ? `${p.name} ${p.city}` : p.name;
    const where = [kind === "district" ? p.city : p.state, p.country].filter(Boolean).join(", ");
    out.push({
      id: `box:${[south, west, north, east].map((v) => v.toFixed(5)).join(",")}`,
      label,
      kind,
      detail: [KIND_LABEL[kind], where].filter(Boolean).join(" · "),
      focus: { lat, lon },
    });
  }
  return out;
}

/** Postcodes, municipalities, cities and districts matching the text. Swiss ones come with official boundaries. */
export async function searchAreas(text: string, signal?: AbortSignal): Promise<AreaRef[]> {
  const q = encodeURIComponent(text.trim());
  const [swiss, world] = await Promise.all([
    fetch(`${GEOADMIN}/SearchServer?searchText=${q}&type=locations&origins=zipcode,gg25&limit=6&sr=4326`, { signal })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then(parseGeoAdminSearch)
      .catch((err) => {
        if (signal?.aborted) throw err;
        return [] as AreaRef[];
      }),
    fetch(`${PHOTON}/api/?q=${q}&limit=10&lang=${lang()}`, { signal })
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then(parsePhotonAreas)
      .catch((err) => {
        if (signal?.aborted) throw err;
        return [] as AreaRef[];
      }),
  ]);
  const seen = new Set<string>();
  return [...swiss, ...world].filter((a) => !seen.has(a.label) && seen.add(a.label)).slice(0, 7);
}

/** The areas an address belongs to: its postcode and municipality in Switzerland, its neighbourhood elsewhere. */
export async function areasAt(lat: number, lon: number, title: string, signal?: AbortSignal): Promise<AreaRef[]> {
  const near: AreaRef = { id: `near:${lat.toFixed(5)},${lon.toFixed(5)}`, label: `Around ${title}`, kind: "neighbourhood", detail: "2 × 2 km around the address", focus: { lat, lon } };
  if (!inSwitzerland(lat, lon)) return [near];
  type Hit = { layerBodId: string; featureId: number; attributes: { plz?: number; langtext?: string; gemname?: string; kanton?: string } };
  // Boundaries are versioned by year (without one, every historical municipality matches); this year's may not be out yet.
  const identify = async (year: number) => {
    const url =
      `${GEOADMIN}/MapServer/identify?geometryType=esriGeometryPoint&geometry=${lon.toFixed(6)},${lat.toFixed(6)}` +
      `&sr=4326&layers=all:${PLZ_LAYER},${MUNI_LAYER}&tolerance=0&returnGeometry=false&timeInstant=${year}`;
    const res = await cachedFetch(url, signal);
    if (!res.ok) throw new Error(`geo.admin.ch answered ${res.status}`);
    return ((await res.json()) as { results?: Hit[] }).results ?? [];
  };
  try {
    const year = new Date().getFullYear();
    let hits = await identify(year);
    if (!hits.some((h) => h.layerBodId === MUNI_LAYER)) hits = await identify(year - 1);
    const focus = { lat, lon };
    const out: AreaRef[] = [];
    const seen = new Set<string>();
    for (const r of hits) {
      if (seen.has(`${r.layerBodId}${r.featureId}`)) continue;
      seen.add(`${r.layerBodId}${r.featureId}`);
      const a = r.attributes;
      if (r.layerBodId === PLZ_LAYER && a.plz)
        out.push({ id: `plz:${r.featureId}`, label: `${a.plz} ${a.langtext ?? ""}`.trim(), kind: "postcode", detail: "Postcode · Switzerland", focus });
      if (r.layerBodId === MUNI_LAYER && a.gemname)
        out.push({ id: `gg:${r.featureId}`, label: a.gemname, kind: "municipality", detail: `Municipality · ${a.kanton ?? "CH"}`, focus });
    }
    // Postcode first; a postcode and municipality with the same extent are both still useful.
    out.sort((a, b) => (a.kind === "postcode" ? 0 : 1) - (b.kind === "postcode" ? 0 : 1));
    return out.length ? out : [near];
  } catch (err) {
    if (signal?.aborted) throw err;
    return [near];
  }
}

/* ---------- boundaries ---------- */

function boxAround(p: LatLon, r: number): BBox {
  const proj = makeProjection(p);
  const sw = proj.toLatLon({ x: -r, y: -r });
  const ne = proj.toLatLon({ x: r, y: r });
  return { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon };
}

export function bboxOf(rings: LatLon[][]): BBox {
  const b = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
  for (const ring of rings)
    for (const p of ring) {
      b.south = Math.min(b.south, p.lat);
      b.north = Math.max(b.north, p.lat);
      b.west = Math.min(b.west, p.lon);
      b.east = Math.max(b.east, p.lon);
    }
  return b;
}

type GeoJsonGeometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };

export function ringsFromGeoJson(g: GeoJsonGeometry): LatLon[][] {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polygons.flatMap((poly) => poly.map((ring) => ring.map(([lon, lat]) => ({ lat, lon }))));
}

/** Boundary and bounding box of an area. */
export async function loadAreaShape(ref: AreaRef, signal?: AbortSignal): Promise<AreaShape> {
  const [kind, value] = [ref.id.slice(0, ref.id.indexOf(":")), ref.id.slice(ref.id.indexOf(":") + 1)];
  if (kind === "plz" || kind === "gg") {
    const layer = kind === "plz" ? PLZ_LAYER : MUNI_LAYER;
    const res = await cachedFetch(`${GEOADMIN}/MapServer/${layer}/${encodeURIComponent(value)}?geometryFormat=geojson&sr=4326`, signal);
    if (!res.ok) throw new Error(`geo.admin.ch answered ${res.status}`);
    const json = (await res.json()) as { feature?: { geometry?: GeoJsonGeometry } };
    if (!json.feature?.geometry) throw new Error("Area boundary not found");
    const rings = ringsFromGeoJson(json.feature.geometry);
    return { ref, rings, bbox: bboxOf(rings) };
  }
  const n = value.split(",").map(Number);
  if (kind === "box" && n.length === 4 && n.every(Number.isFinite)) return { ref, rings: null, bbox: { south: n[0], west: n[1], north: n[2], east: n[3] } };
  if (kind === "near" && n.length === 2 && n.every(Number.isFinite)) return { ref, rings: null, bbox: boxAround({ lat: n[0], lon: n[1] }, NEAR_RADIUS) };
  throw new Error("Unknown area");
}

/** True when the point is inside the area (its boundary, or its bounding box when there is none). */
export function inArea(shape: Pick<AreaShape, "rings" | "bbox">, p: LatLon): boolean {
  const b = shape.bbox;
  if (p.lat < b.south || p.lat > b.north || p.lon < b.west || p.lon > b.east) return false;
  if (!shape.rings) return true;
  // Even-odd across all rings handles holes and multi-part areas alike.
  const pt = { x: p.lon, y: p.lat };
  let inside = false;
  for (const ring of shape.rings) if (pointInPolygon(pt, ring.map((q) => ({ x: q.lon, y: q.lat })))) inside = !inside;
  return inside;
}

/* ---------- ranking window ---------- */

/** Largest side of the ranked window, metres. Bigger areas are ranked around their centre or a chosen point. */
export const MAX_SIDE = 3000;

export function bboxSize(b: BBox): { width: number; height: number } {
  const mid = (b.south + b.north) / 2;
  return {
    width: haversine({ lat: mid, lon: b.west }, { lat: mid, lon: b.east }),
    height: haversine({ lat: b.south, lon: b.west }, { lat: b.north, lon: b.west }),
  };
}

/** The part of the area that gets ranked: all of it, or a MAX_SIDE square around `focus`. */
export function rankWindow(bbox: BBox, focus: LatLon | undefined): { bbox: BBox; clipped: boolean } {
  const { width, height } = bboxSize(bbox);
  if (width <= MAX_SIDE * 1.05 && height <= MAX_SIDE * 1.05) return { bbox, clipped: false };
  const c = focus ?? { lat: (bbox.south + bbox.north) / 2, lon: (bbox.west + bbox.east) / 2 };
  const halfLat = ((bbox.north - bbox.south) * Math.min(1, MAX_SIDE / height)) / 2;
  const halfLon = ((bbox.east - bbox.west) * Math.min(1, MAX_SIDE / width)) / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const lat = clamp(c.lat, bbox.south + halfLat, bbox.north - halfLat);
  const lon = clamp(c.lon, bbox.west + halfLon, bbox.east - halfLon);
  return { bbox: { south: lat - halfLat, west: lon - halfLon, north: lat + halfLat, east: lon + halfLon }, clipped: true };
}

/* ---------- Overpass ---------- */

function grow(b: BBox, metres: number): string {
  const dLat = metres / 111132;
  const dLon = metres / (111320 * Math.cos((((b.south + b.north) / 2) * Math.PI) / 180));
  return [b.south - dLat, b.west - dLon, b.north + dLat, b.east + dLon].map((v) => v.toFixed(5)).join(",");
}

/**
 * The per-address queries, widened to cover a whole window: every address in it sees the same
 * surroundings it would in its own report.
 */
export function areaQueries(b: BBox) {
  const head = "[out:json][timeout:120][maxsize:536870912];";
  return {
    buildings: `${head}
way["building"](${grow(b, RADIUS.buildings)});
out tags geom;`,
    streets: `${head}
(
  way["highway"~"${ROADS_RE}"](${grow(b, RADIUS.roads)});
  way["railway"~"${RAILS_RE}"](${grow(b, RADIUS.rails)});
  way["landuse"="industrial"](${grow(b, RADIUS.industry)});
);
out tags geom;
(
  nwr["leisure"="stadium"](${grow(b, 2000)});
  nwr["amenity"="fire_station"](${grow(b, 800)});
);
out tags center;`,
    places: `${head}
(
  nwr["amenity"~"${DINING_RE}"](${grow(b, RADIUS.dining)});
  nwr["amenity"~"${EDUCATION_RE}"](${grow(b, RADIUS.education)});
  nwr["shop"](${grow(b, RADIUS.shops)});
  nwr["amenity"~"^(pharmacy|marketplace|post_office)$"](${grow(b, RADIUS.shops)});
);
out tags center;
(${transitFilters((r) => `(${grow(b, r)})`)}
);
out tags center;
(${greenFilters(`(${grow(b, RADIUS.green)})`)}
);
out tags geom(${grow(b, RADIUS.green + 100)});`,
  };
}
