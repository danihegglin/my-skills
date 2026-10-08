import type { LatLon } from "./geo";
import { makeProjection } from "./geo";

/** Azimuth spacing and sample distances of the terrain horizon scan. */
export const TERRAIN_AZ_STEP = 10;
export const TERRAIN_DISTANCES = [300, 550, 900, 1400, 2200, 3500, 5500, 8500, 13000, 20000];

export type TerrainSamples = {
  /** Ground elevation at the address, metres above sea level. */
  ground: number;
  /** elevations[azimuthIndex][distanceIndex] in metres. */
  elevations: number[][];
};

const EARTH_R = 6371000;

/**
 * Horizon elevation angle (degrees) per 1° azimuth bin seen from `observerHeight`
 * metres above the ground, including earth curvature with standard refraction.
 */
export function terrainHorizon(t: TerrainSamples, observerHeight: number): Float32Array {
  const coarse = t.elevations.map((row) => {
    let best = -90;
    row.forEach((h, i) => {
      const d = TERRAIN_DISTANCES[i];
      const drop = (d * d) / (2 * EARTH_R) * 0.87;
      const angle = (Math.atan2(h - drop - t.ground - observerHeight, d) * 180) / Math.PI;
      best = Math.max(best, angle);
    });
    return best;
  });
  const out = new Float32Array(360);
  const n = coarse.length;
  for (let b = 0; b < 360; b++) {
    const pos = (b + 0.5) / TERRAIN_AZ_STEP;
    const i = Math.floor(pos) % n;
    const f = pos - Math.floor(pos);
    out[b] = coarse[i] * (1 - f) + coarse[(i + 1) % n] * f;
  }
  return out;
}

export async function fetchTerrain(p: LatLon, signal?: AbortSignal): Promise<TerrainSamples> {
  const proj = makeProjection(p);
  const points: LatLon[] = [p];
  for (let az = 0; az < 360; az += TERRAIN_AZ_STEP) {
    const r = (az * Math.PI) / 180;
    for (const d of TERRAIN_DISTANCES) points.push(proj.toLatLon({ x: Math.sin(r) * d, y: Math.cos(r) * d }));
  }
  const heights: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url =
      `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((c) => c.lat.toFixed(5)).join(",")}` +
      `&longitude=${chunk.map((c) => c.lon.toFixed(5)).join(",")}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Elevation service answered ${res.status}`);
    const json = (await res.json()) as { elevation: number[] };
    heights.push(...json.elevation);
  }
  const per = TERRAIN_DISTANCES.length;
  const elevations: number[][] = [];
  for (let a = 0; a < 360 / TERRAIN_AZ_STEP; a++) elevations.push(heights.slice(1 + a * per, 1 + (a + 1) * per));
  return { ground: heights[0], elevations };
}
