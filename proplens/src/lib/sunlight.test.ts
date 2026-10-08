import { describe, expect, it } from "vitest";
import { makeProjection } from "./geo";
import type { OsmElement } from "./osm";
import { parseRegister } from "./register";
import { applyRegister, buildSkyline, buildingHeight, buildingHorizon, parseBuildings } from "./skyline";
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
    expect(buildingHeight({ building: "house" })).toEqual({ height: 8, levels: null, estimated: true, source: "typical" });
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

describe("building register", () => {
  const entrance = (egid: string, x: number, y: number, props: Record<string, unknown>) => {
    const p = proj.toLatLon({ x, y });
    return { geometry: { coordinates: [p.lon, p.lat] as [number, number] }, properties: { egid, ...props } };
  };

  it("keeps one entry per building with its most storeys", () => {
    const reg = parseRegister([
      entrance("1", 0, -30, { gastw: 6, garea: 400, gbauj: 1965, strname_deinr: "Zollstrasse 1" }),
      entrance("1", 10, -30, { gastw: 7, strname_deinr: "Zollstrasse 3" }),
      entrance("2", 0, 80, { gastw: null }),
      { properties: { egid: "3" } },
    ]);
    expect(reg).toHaveLength(2);
    expect(reg[0]).toMatchObject({ egid: "1", floors: 7, address: "Zollstrasse 1" });
    expect(reg[1].floors).toBeNull();
  });

  it("replaces guessed and mapped storeys with registered ones, but not measured heights", () => {
    const guessed = box(10, -20, -40, 20, -20, { building: "yes" });
    const levels = box(11, -20, 20, 20, 40, { building: "apartments", "building:levels": "3" });
    const measured = box(12, 30, -10, 50, 10, { building: "yes", height: "12" });
    const empty = box(13, -50, -10, -30, 10, { building: "yes" });
    const reg = parseRegister([
      entrance("1", 0, -30, { gastw: 8, strname_deinr: "Südweg 2", gbauj: 1972 }),
      entrance("2", 0, 30, { gastw: 5 }),
      entrance("3", 40, 0, { gastw: 9 }),
    ]);
    const [a, b, c, d] = applyRegister(parseBuildings([guessed, levels, measured, empty], proj), reg, proj);
    expect(a).toMatchObject({ height: 25, levels: 8, source: "register", estimated: false, address: "Südweg 2", year: 1972 });
    expect(b).toMatchObject({ height: 16, levels: 5, source: "register" });
    expect(c).toMatchObject({ height: 12, source: "measured" });
    expect(d).toMatchObject({ height: 10, source: "typical", estimated: true });
  });
});

describe("sunlight", () => {
  it("names the buildings that block the sun and how much", () => {
    // A tall block due south, a low shed to the north and a tower to the east.
    const block = box(20, -60, -40, 60, -25, { building: "apartments", height: "30" });
    const shed = box(21, -5, 20, 5, 25, { building: "shed", height: "2" });
    const tower = box(22, 40, -10, 60, 10, { building: "yes", height: "60" });
    const sky = buildSkyline(parseBuildings([block, shed, tower], proj), 250);
    const sun = analyzeSun({ lat: 47.38, lon: 8.53, floor: 0, skyline: sky, terrain: null, climate: null, year: 2026 });
    expect(sun.shade.map((s) => s.building.id)).toEqual([20, 22]);
    const [south, east] = sun.shade;
    // Every winter hour with the sun above the horizon but no direct light is blamed on one of them.
    const blocked = sun.keyDays[0].samples.filter((s) => s.altitude > 0 && !s.lit).length * (5 / 60);
    expect(south.winter + east.winter).toBeCloseTo(blocked, 5);
    expect(south.winter).toBeGreaterThan(east.winter);
    expect(south.year).toBeGreaterThan(500);
    // From high up the block no longer shades; the tower still does.
    const high = analyzeSun({ lat: 47.38, lon: 8.53, floor: 15, skyline: sky, terrain: null, climate: null, year: 2026 });
    expect(high.shade.map((s) => s.building.id)).toEqual([22]);
  });

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
