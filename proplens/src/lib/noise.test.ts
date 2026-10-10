import { describe, expect, it } from "vitest";
import type { XY } from "./geo";
import { makeProjection } from "./geo";
import { analyzeNoise, parseSpeed, rateNoise, roadEmission, roadLevels, withOfficial } from "./noise";
import type { OsmElement } from "./osm";
import { buildSkyline, parseBuildings } from "./skyline";

const proj = makeProjection({ lat: 47.38, lon: 8.53 });
let nextId = 1;
const way = (tags: Record<string, string>, pts: XY[]): OsmElement => ({
  type: "way",
  id: nextId++,
  tags,
  geometry: pts.map((p) => proj.toLatLon(p)),
});
/** A straight east-west line `y` metres north of the address, 4 km long. */
const eastWest = (y: number) => [
  { x: -2000, y },
  { x: 2000, y },
];
const category = (r: ReturnType<typeof analyzeNoise>, id: string) => r.categories.find((c) => c.id === id)!;
const run = (streets: OsmElement[], buildings: OsmElement[] = []) =>
  analyzeNoise({ proj, streets, air: [], places: [], skyline: buildings.length ? buildSkyline(parseBuildings(buildings, proj), 250) : null });

describe("road emission", () => {
  it("follows RLS-90 at the reference speed", () => {
    // 1000 cars/h, no trucks, 100 km/h → 37.3 + 30 dB.
    expect(roadEmission(1000, 0, 100)).toBeCloseTo(67.3, 0);
    // Trucks and speed both add noise.
    expect(roadEmission(1000, 20, 100)).toBeGreaterThan(roadEmission(1000, 0, 100) + 3);
    expect(roadEmission(1000, 0, 50)).toBeLessThan(roadEmission(1000, 0, 100) - 4);
  });

  it("parses speed limits", () => {
    expect(parseSpeed("30", 50)).toBe(30);
    expect(parseSpeed("20 mph", 50)).toBeCloseTo(32.2, 0);
    expect(parseSpeed("DE:zone30", 50)).toBe(30);
    expect(parseSpeed("CH:urban", 80)).toBe(50);
    expect(parseSpeed(undefined, 80)).toBe(80);
  });

  it("ignores tunnels and ranks road classes", () => {
    expect(roadLevels({ highway: "primary", tunnel: "yes" })).toBeNull();
    expect(roadLevels({ highway: "motorway" })!.day).toBeGreaterThan(roadLevels({ highway: "primary" })!.day + 5);
    expect(roadLevels({ highway: "primary" })!.day).toBeGreaterThan(roadLevels({ highway: "residential" })!.day + 10);
  });
});

describe("noise propagation", () => {
  const primary = { highway: "primary", name: "Hauptstrasse" };
  const ref = roadLevels(primary)!.day;

  it("reproduces the reference level 25 m from a long straight road", () => {
    // Slightly below the free-field reference: the far parts of the road lose energy to ground and air.
    const road = category(run([way(primary, eastWest(25))]), "road");
    expect(road.day).toBeGreaterThan(ref - 1.5);
    expect(road.day).toBeLessThan(ref + 0.5);
  });

  it("drops about 3 dB per doubling of distance, plus ground absorption", () => {
    const near = category(run([way(primary, eastWest(25))]), "road").day;
    const far = category(run([way(primary, eastWest(50))]), "road").day;
    expect(near - far).toBeGreaterThan(3);
    expect(near - far).toBeLessThan(6.5);
  });

  it("is shielded by a row of buildings in between", () => {
    const row = way({ building: "apartments", height: "15" }, [
      { x: -300, y: 14 },
      { x: 300, y: 14 },
      { x: 300, y: 22 },
      { x: -300, y: 22 },
      { x: -300, y: 14 },
    ]);
    const open = category(run([way(primary, eastWest(40))]), "road").day;
    const behind = category(run([way(primary, eastWest(40))], [row]), "road").day;
    expect(open - behind).toBeGreaterThan(8);
  });

  it("counts parallel tracks of one rail line once", () => {
    const tags = { railway: "rail", usage: "main" };
    const one = category(run([way(tags, eastWest(60))]), "rail").day;
    const four = category(run([60, 64, 68, 72].map((y) => way(tags, eastWest(y)))), "rail").day;
    expect(four - one).toBeLessThan(0.6);
    expect(one).toBeGreaterThan(55);
  });

  it("lets official values override modelled road and rail levels", () => {
    const modelled = run([way(primary, eastWest(25))]);
    const official = withOfficial(modelled, { road: { day: 70, night: 61 }, rail: { day: null, night: null }, air: { day: null, night: null } });
    expect(category(official, "road").official).toEqual(expect.objectContaining({ day: 70, night: 61 }));
    expect(official.day).toBeGreaterThan(69.9);
    expect(category(official, "rail").official).toBeUndefined();
  });
});

describe("ratings", () => {
  it("rates day and night levels", () => {
    expect(rateNoise(44).label).toBe("Very quiet");
    expect(rateNoise(58).tone).toBe("warning");
    expect(rateNoise(67).label).toBe("Very loud");
    expect(rateNoise(41, "night").label).toBe("Moderate");
  });
});
