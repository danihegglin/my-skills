import { describe, expect, it } from "vitest";
import { makeProjection } from "./geo";
import type { OsmElement } from "./osm";
import { buildSkyline, buildingHeight, buildingHorizon, parseBuildings } from "./skyline";
import { analyzeSun, observerHeight } from "./sunlight";
import { TERRAIN_DISTANCES, terrainHorizon } from "./terrain";

const proj = makeProjection({ lat: 47.38, lon: 8.53 });
const box = (id: number, x0: number, y0: number, x1: number, y1: number, tags: Record<string, string>): OsmElement => ({
  type: "way",
  id,
  tags,
  geometry: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ].map((p) => proj.toLatLon(p)),
});

describe("buildings", () => {
  it("derives heights from tags", () => {
    expect(buildingHeight({ building: "yes", height: "21.5 m" }).height).toBe(21.5);
    expect(buildingHeight({ building: "apartments", "building:levels": "5" }).height).toBe(16);
    expect(buildingHeight({ building: "house" })).toEqual({ height: 8, levels: null, estimated: true });
  });

  it("finds the address's own building and the skyline around it", () => {
    const own = box(1, -5, -5, 5, 5, { building: "house" });
    // A 20 m block 20 m to the south.
    const south = box(2, -30, -40, 30, -20, { building: "yes", height: "20" });
    const sky = buildSkyline(parseBuildings([own, south], proj), 250);
    expect(sky.own?.id).toBe(1);
    const horizon = buildingHorizon(sky, observerHeight(0));
    expect(horizon[180]).toBeCloseTo((Math.atan2(20 - 1.6, 20) * 180) / Math.PI, 0);
    expect(horizon[0]).toBe(0);
    expect(sky.screenDist[180]).toBeCloseTo(20, 0);
  });
});

describe("sunlight", () => {
  it("gives full daylight on open ground and none behind a tall southern wall in winter", () => {
    const open = analyzeSun({ lat: 47.38, lon: 8.53, floor: 0, skyline: null, terrain: null, climate: null, year: 2026 });
    const winterOpen = open.keyDays.find((d) => d.id === "winter")!;
    expect(winterOpen.direct).toBeGreaterThan(winterOpen.daylight - 0.4);

    const wall = box(3, -400, -30, 400, -25, { building: "yes", height: "40" });
    const sky = buildSkyline(parseBuildings([wall], proj), 250);
    const shaded = analyzeSun({ lat: 47.38, lon: 8.53, floor: 0, skyline: sky, terrain: null, climate: null, year: 2026 });
    expect(shaded.keyDays.find((d) => d.id === "winter")!.direct).toBe(0);
    expect(shaded.score).toBeLessThan(open.score);

    // Ten floors up, the same wall no longer blocks the winter sun.
    const high = analyzeSun({ lat: 47.38, lon: 8.53, floor: 13, skyline: sky, terrain: null, climate: null, year: 2026 });
    expect(high.keyDays.find((d) => d.id === "winter")!.direct).toBeGreaterThan(6);
  });

  it("only lights south-facing windows at midday in winter", () => {
    const open = analyzeSun({ lat: 47.38, lon: 8.53, floor: 2, skyline: null, terrain: null, climate: null, year: 2026 });
    const facing = Object.fromEntries(open.facades.map((f) => [f.facing, f.hours.winter]));
    expect(facing.North).toBe(0);
    expect(facing.South).toBeGreaterThan(facing.East);
  });

  it("turns elevation samples into a terrain horizon", () => {
    const ridge = TERRAIN_DISTANCES.map((d) => (d === 5500 ? 1400 : 400));
    const flat = TERRAIN_DISTANCES.map(() => 400);
    const elevations = Array.from({ length: 36 }, (_, i) => (i === 18 ? ridge : flat));
    const h = terrainHorizon({ ground: 400, elevations }, 0);
    expect(h[180]).toBeGreaterThan(9);
    expect(h[0]).toBeLessThan(0.1);
  });
});
