// Sun hours over the ground and roofs around an address, for one day: building footprints become a height
// grid, the sun's path becomes a list of samples, and the WebAssembly kernel (assembly/sunhours.ts) traces them.

import { pointInPolygon } from "./geo";
import type { Building } from "./skyline";
import { daySamples } from "./sun";

export type HeightGrid = {
  /** Cells across (west → east) and down (south → north). */
  w: number;
  h: number;
  /** Cell size, metres. */
  cell: number;
  /** The grid spans ±half metres around the address. */
  half: number;
  /** Surface height per cell: 0 on the ground, the roof height on buildings. Row 0 is the southern edge. */
  heights: Float32Array;
  maxH: number;
};

/** Rasterises building footprints (local metres around the address) into a height grid. */
export function rasterize(buildings: Building[], half: number, cell: number): HeightGrid {
  const w = Math.ceil((2 * half) / cell);
  const h = w;
  const heights = new Float32Array(w * h);
  let maxH = 0;
  for (const b of buildings) {
    const xs = b.ring.map((p) => p.x);
    const ys = b.ring.map((p) => p.y);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) + half) / cell));
    const i1 = Math.min(w - 1, Math.floor((Math.max(...xs) + half) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) + half) / cell));
    const j1 = Math.min(h - 1, Math.floor((Math.max(...ys) + half) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const p = { x: -half + (i + 0.5) * cell, y: -half + (j + 0.5) * cell };
        if (!pointInPolygon(p, b.ring)) continue;
        const k = j * w + i;
        if (b.height > heights[k]) heights[k] = b.height;
      }
    maxH = Math.max(maxH, b.height);
  }
  return { w, h, cell, half, heights, maxH };
}

export const SAMPLE_MINUTES = 10;

/**
 * The sun's positions over a day as kernel samples (dx, dy, tanAlt, hours), every 10 minutes while it is
 * above the horizon and above the terrain (`terrain`: horizon elevation per 1° of azimuth).
 */
export function sunSamples(year: number, month: number, day: number, lat: number, lon: number, terrain?: Float32Array | null): Float32Array {
  const out: number[] = [];
  for (const s of daySamples(year, month, day, lat, lon, SAMPLE_MINUTES)) {
    // Below about half a degree the shadows run for kilometres; the light is weak anyway.
    if (s.altitude < 0.5) continue;
    if (terrain && s.altitude <= terrain[Math.floor(s.azimuth) % 360]) continue;
    const az = (s.azimuth * Math.PI) / 180;
    out.push(Math.sin(az), Math.cos(az), Math.tan((s.altitude * Math.PI) / 180), SAMPLE_MINUTES / 60);
  }
  return new Float32Array(out);
}

export type Kernel = (grid: HeightGrid, suns: Float32Array) => Float32Array;

type Exports = {
  memory: WebAssembly.Memory;
  heapBase(): number;
  sunHours(hPtr: number, w: number, h: number, cell: number, maxH: number, sPtr: number, n: number, oPtr: number): void;
};

/** Wraps the compiled module: copies the grid and samples into its memory, runs it and copies the result out. */
export function makeKernel(instance: WebAssembly.Instance): Kernel {
  const ex = instance.exports as unknown as Exports;
  return (grid, suns) => {
    const cells = grid.w * grid.h;
    const hPtr = (ex.heapBase() + 15) & ~15;
    const sPtr = hPtr + cells * 4;
    const oPtr = sPtr + suns.length * 4;
    const need = oPtr + cells * 4;
    const have = ex.memory.buffer.byteLength;
    if (need > have) ex.memory.grow(Math.ceil((need - have) / 65536));
    new Float32Array(ex.memory.buffer, hPtr, cells).set(grid.heights);
    new Float32Array(ex.memory.buffer, sPtr, suns.length).set(suns);
    ex.sunHours(hPtr, grid.w, grid.h, grid.cell, grid.maxH, sPtr, suns.length / 4, oPtr);
    return new Float32Array(ex.memory.buffer, oPtr, cells).slice();
  };
}

/** Hours at a point (local metres), or null outside the grid. */
export function hoursAt(grid: HeightGrid, hours: Float32Array, x: number, y: number): number | null {
  const i = Math.floor((x + grid.half) / grid.cell);
  const j = Math.floor((y + grid.half) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return null;
  return hours[j * grid.w + i];
}
