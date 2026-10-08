import type { LatLon } from "./geo";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: ({ lat: number; lon: number } | null)[];
  members?: { type: string; role: string; geometry?: ({ lat: number; lon: number } | null)[] }[];
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export const ROADS_RE =
  "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$";
export const RAILS_RE = "^(rail|light_rail|tram|subway|narrow_gauge|monorail)$";
export const DINING_RE = "^(bar|pub|nightclub|restaurant|cafe|fast_food|biergarten|food_court)$";
export const EDUCATION_RE = "^(kindergarten|childcare|school|college|university)$";
const SHOPS =
  "^(supermarket|convenience|bakery|pastry|butcher|greengrocer|deli|organic|general|cheese|health_food|seafood|farm|beverages|chemist|mall|department_store|kiosk)$";

export const RADIUS = {
  roads: 700,
  rails: 1200,
  industry: 600,
  dining: 400,
  education: 2500,
  shops: 1500,
  buildings: 250,
  airports: 25000,
};

function around(r: number, p: LatLon) {
  return `(around:${r},${p.lat.toFixed(6)},${p.lon.toFixed(6)})`;
}

function bbox(p: LatLon, r: number) {
  const dLat = r / 111132;
  const dLon = r / (111320 * Math.cos((p.lat * Math.PI) / 180));
  return [p.lat - dLat, p.lon - dLon, p.lat + dLat, p.lon + dLon].map((v) => v.toFixed(5)).join(",");
}

export const queries = {
  streets: (p: LatLon) => `[out:json][timeout:45];
(
  way["highway"~"${ROADS_RE}"]${around(RADIUS.roads, p)};
  way["railway"~"${RAILS_RE}"]${around(RADIUS.rails, p)};
  way["landuse"="industrial"]${around(RADIUS.industry, p)};
);
out tags geom;
(
  nwr["leisure"="stadium"]${around(2000, p)};
  nwr["amenity"="fire_station"]${around(800, p)};
);
out tags center;`,

  air: (p: LatLon) => `[out:json][timeout:45][bbox:${bbox(p, RADIUS.airports)}];
way["aeroway"="runway"];
out tags geom;
nwr["aeroway"~"^(aerodrome|heliport)$"];
out tags center;`,

  places: (p: LatLon) => `[out:json][timeout:45];
(
  nwr["amenity"~"${DINING_RE}"]${around(RADIUS.dining, p)};
  nwr["amenity"~"${EDUCATION_RE}"]${around(RADIUS.education, p)};
  nwr["shop"~"${SHOPS}"]${around(RADIUS.shops, p)};
  nwr["amenity"~"^(pharmacy|marketplace|post_office)$"]${around(RADIUS.shops, p)};
);
out tags center;
nwr["shop"]${around(800, p)};
out count;`,

  buildings: (p: LatLon) => `[out:json][timeout:45];
way["building"]${around(RADIUS.buildings, p)};
out tags geom;`,
};

export type QueryName = keyof typeof queries;

// Overpass allows a couple of concurrent slots per client; queue the rest.
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function post(endpoint: string, query: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`${new URL(endpoint).host} answered ${res.status}`);
  return res;
}

// A runtime error inside Overpass still returns 200 with a remark and partial data.
const FAILED_REMARK = /runtime error|timed out|out of memory/i;

async function readElements(res: Response): Promise<OsmElement[]> {
  const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
  if (!json.elements) throw new Error("Malformed Overpass response");
  if (json.remark && FAILED_REMARK.test(json.remark)) throw new Error(json.remark);
  return json.elements;
}

async function readBuffer(res: Response): Promise<ArrayBuffer> {
  const buf = await res.arrayBuffer();
  const decoder = new TextDecoder();
  if (!decoder.decode(buf.slice(0, 64)).trimStart().startsWith("{")) throw new Error("Malformed Overpass response");
  // The remark, if any, follows the elements at the very end of the response.
  const tail = decoder.decode(buf.slice(Math.max(0, buf.byteLength - 2048)));
  const remark = tail.match(/"remark"\s*:\s*"([^"]*)"/)?.[1];
  if (remark && FAILED_REMARK.test(remark)) throw new Error(remark);
  return buf;
}

async function viaMirrors<T>(query: string, signal: AbortSignal, timeoutMs: number, read: (res: Response) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    if (signal.aborted) throw signal.reason;
    try {
      return await read(await post(endpoint, query, signal, timeoutMs));
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All Overpass mirrors failed");
}

/**
 * Runs a large query and returns the raw JSON, unparsed, so it can be handed to workers cheaply.
 * Used by the area ranking, whose responses run to several megabytes.
 */
export function overpassBuffer(query: string, signal: AbortSignal, timeoutMs = 150000): Promise<ArrayBuffer> {
  return slot(() => viaMirrors(query, signal, timeoutMs, readBuffer));
}

type Entry = { promise: Promise<OsmElement[]>; ctrl: AbortController; refs: number; timer?: ReturnType<typeof setTimeout> };
const cache = new Map<string, Entry>();

/**
 * Runs one of the named per-address queries around `p`, falling back through public mirrors.
 * Identical queries share one request, which is only cancelled once every caller has aborted.
 */
export function overpass(name: QueryName, p: LatLon, signal?: AbortSignal): Promise<OsmElement[]> {
  const query = queries[name](p);
  let entry = cache.get(query);
  if (!entry) {
    const ctrl = new AbortController();
    const promise = slot(() => viaMirrors(query, ctrl.signal, 40000, readElements));
    const created: Entry = { promise, ctrl, refs: 0 };
    promise.catch(() => {
      if (cache.get(query) === created) cache.delete(query);
    });
    cache.set(query, created);
    entry = created;
  }
  const e = entry;
  e.refs++;
  clearTimeout(e.timer);
  return new Promise((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) return false;
      settled = true;
      e.refs--;
      signal?.removeEventListener("abort", onAbort);
      return true;
    };
    const onAbort = () => {
      if (!release()) return;
      // Give a re-mounting caller a moment to pick the request back up before cancelling it.
      if (e.refs <= 0) e.timer = setTimeout(() => e.ctrl.abort(), 100);
      reject(signal!.reason);
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    e.promise.then(
      (v) => release() && resolve(v),
      (err) => release() && reject(err),
    );
  });
}

export function elementPoint(e: OsmElement): LatLon | null {
  if (e.lat != null && e.lon != null) return { lat: e.lat, lon: e.lon };
  if (e.center) return { lat: e.center.lat, lon: e.center.lon };
  return null;
}

/** Polylines/rings of a way, or the outer rings of a multipolygon relation. */
export function elementLines(e: OsmElement): LatLon[][] {
  if (e.geometry) return [e.geometry.filter((g): g is LatLon => g != null)];
  if (e.members) {
    return e.members
      .filter((m) => m.type === "way" && m.role !== "inner" && m.geometry)
      .map((m) => m.geometry!.filter((g): g is LatLon => g != null));
  }
  return [];
}

/** Total from an `out count;` element, if present. */
export function countFrom(elements: OsmElement[]): number | null {
  const c = elements.find((e) => (e.type as string) === "count");
  return c?.tags?.total ? Number(c.tags.total) : null;
}
