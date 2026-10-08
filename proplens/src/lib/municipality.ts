import { cachedFetch } from "./cache";

export type Municipality = { name: string; number: number; canton: string };

const LAYER = "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill";

/** Swiss municipality and canton at a point, from the federal boundaries (swisstopo via geo.admin.ch). */
export async function fetchMunicipality(lat: number, lon: number, signal?: AbortSignal): Promise<Municipality | null> {
  const year = new Date().getFullYear();
  // Boundaries are versioned by year; the current year may not be published yet in January.
  for (const timeInstant of [year, year - 1]) {
    const url =
      `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint` +
      `&geometry=${lon.toFixed(6)},${lat.toFixed(6)}&sr=4326&layers=all:${LAYER}&tolerance=0&returnGeometry=false&timeInstant=${timeInstant}`;
    const res = await cachedFetch(url, signal);
    if (!res.ok) throw new Error(`geo.admin.ch answered ${res.status}`);
    const json = (await res.json()) as { results?: { attributes: { gemname: string; gde_nr: number; kanton: string } }[] };
    const hit = json.results?.[0]?.attributes;
    if (hit) return { name: hit.gemname, number: hit.gde_nr, canton: hit.kanton };
  }
  return null;
}
