// Swiss Federal Register of Buildings and Dwellings (GWR, Federal Statistical Office) via geo.admin.ch:
// storeys, footprint and address of every building, to replace guessed heights in the skyline.

import { cachedFetch } from "./cache";
import type { LatLon } from "./geo";
import { makeProjection } from "./geo";

export type RegisterBuilding = {
  egid: string;
  lat: number;
  lon: number;
  /** Storeys above ground. */
  floors: number | null;
  /** Footprint, m². */
  area: number | null;
  year: number | null;
  address: string | null;
};

const LAYER = "ch.bfs.gebaeude_wohnungs_register";
/** The identify service returns at most this many features; a full tile is split and asked again. */
const LIMIT = 200;

type Hit = { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> };

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

export function parseRegister(hits: Hit[]): RegisterBuilding[] {
  // One feature per entrance: keep one building per EGID, with its largest storey count.
  const byId = new Map<string, RegisterBuilding>();
  for (const h of hits) {
    const p = h.properties ?? {};
    const egid = String(p.egid ?? "");
    const [lon, lat] = h.geometry?.coordinates ?? [];
    if (!egid || lat == null || lon == null) continue;
    const b: RegisterBuilding = {
      egid,
      lat,
      lon,
      floors: num(p.gastw),
      area: num(p.garea),
      year: num(p.gbauj),
      address: typeof p.strname_deinr === "string" && p.strname_deinr ? p.strname_deinr : null,
    };
    const prev = byId.get(egid);
    if (!prev || (b.floors ?? 0) > (prev.floors ?? 0)) byId.set(egid, prev ? { ...b, address: prev.address ?? b.address } : b);
  }
  return [...byId.values()];
}

async function tile(w: number, s: number, e: number, n: number, depth: number, signal?: AbortSignal): Promise<Hit[]> {
  const url =
    `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryEnvelope` +
    `&geometry=${[w, s, e, n].map((v) => v.toFixed(6)).join(",")}&sr=4326&layers=all:${LAYER}&tolerance=0` +
    `&returnGeometry=true&geometryFormat=geojson&limit=${LIMIT}`;
  const res = await cachedFetch(url, signal);
  if (!res.ok) throw new Error(`geo.admin.ch answered ${res.status}`);
  const hits = ((await res.json()) as { results?: Hit[] }).results ?? [];
  if (hits.length < LIMIT || depth >= 2) return hits;
  const mx = (w + e) / 2;
  const my = (s + n) / 2;
  const quads = await Promise.all([
    tile(w, s, mx, my, depth + 1, signal),
    tile(mx, s, e, my, depth + 1, signal),
    tile(w, my, mx, n, depth + 1, signal),
    tile(mx, my, e, n, depth + 1, signal),
  ]);
  return quads.flat();
}

/** Registered buildings within a square of ±`radius` metres around `p` (Switzerland only). */
export async function fetchRegister(p: LatLon, radius: number, signal?: AbortSignal): Promise<RegisterBuilding[]> {
  const proj = makeProjection(p);
  const sw = proj.toLatLon({ x: -radius, y: -radius });
  const ne = proj.toLatLon({ x: radius, y: radius });
  // Four tiles to start with: a dense city block easily holds more than 200 entrances in 500 × 500 m.
  const mx = p.lon;
  const my = p.lat;
  const quads = await Promise.all([
    tile(sw.lon, sw.lat, mx, my, 1, signal),
    tile(mx, sw.lat, ne.lon, my, 1, signal),
    tile(sw.lon, my, mx, ne.lat, 1, signal),
    tile(mx, my, ne.lon, ne.lat, 1, signal),
  ]);
  return parseRegister(quads.flat());
}
