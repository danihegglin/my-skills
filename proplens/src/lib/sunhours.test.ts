import { beforeAll, describe, expect, it } from "vitest";
import type { Kernel } from "./sunhours";
import { hoursAt, makeKernel, rasterize, sunSamples } from "./sunhours";
import type { Building } from "./skyline";

let kernel: Kernel;
beforeAll(async () => {
  // Tests run in Node; the app's tsconfig has no Node types, so load fs without them.
  const fs = (await import("node:fs" as string)) as { readFileSync(path: URL): Uint8Array<ArrayBuffer> };
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(new URL("../wasm/sunhours.wasm", import.meta.url)));
  kernel = makeKernel(instance);
});

const box = (id: number, x0: number, y0: number, x1: number, y1: number, height: number): Building => ({
  id,
  ring: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ],
  latlngs: [],
  height,
  levels: null,
  estimated: false,
  source: "measured",
  solid: true,
  kind: "yes",
  footprint: (x1 - x0) * (y1 - y0),
  address: null,
  year: null,
});

describe("sun hours (WebAssembly)", () => {
  it("rasterises footprints into a height grid", () => {
    const g = rasterize([box(1, -10, -10, 10, 10, 20)], 50, 2);
    expect(g.w).toBe(50);
    expect(g.maxH).toBe(20);
    expect(g.heights[25 * 50 + 25]).toBe(20);
    expect(g.heights[0]).toBe(0);
  });

  it("samples only the daytime sun above the terrain", () => {
    const summer = sunSamples(2026, 5, 21, 47.38, 8.53);
    const winter = sunSamples(2026, 11, 21, 47.38, 8.53);
    const hours = (s: Float32Array) => (s.length / 4) * (10 / 60);
    expect(hours(summer)).toBeGreaterThan(15);
    expect(hours(winter)).toBeLessThan(9);
    // A ridge 20° high to the south leaves almost no winter sun.
    const ridge = new Float32Array(360).map((_, az) => (az > 100 && az < 260 ? 20 : 0));
    expect(hours(sunSamples(2026, 11, 21, 47.38, 8.53, ridge))).toBeLessThan(0.5);
  });

  it("gives open ground every daylight hour and puts the ground north of a tall block in winter shade", () => {
    const grid = rasterize([box(1, -40, -10, 40, 0, 30)], 100, 2);
    const suns = sunSamples(2026, 11, 21, 47.38, 8.53);
    const out = kernel(grid, suns);
    const day = (suns.length / 4) * (10 / 60);
    // Far south of the block: full sun. Just north of it: none on the shortest day.
    expect(hoursAt(grid, out, 0, -60)).toBeCloseTo(day, 5);
    expect(hoursAt(grid, out, 0, 5)).toBe(0);
    // The block's roof is in sun all day.
    expect(hoursAt(grid, out, 0, -5)).toBeCloseTo(day, 5);
    // In June the same spot gets most of the day.
    const june = sunSamples(2026, 5, 21, 47.38, 8.53);
    expect(hoursAt(grid, kernel(grid, june), 0, 30)).toBeGreaterThan(10);
    expect(hoursAt(grid, out, 500, 0)).toBeNull();
  });
});
