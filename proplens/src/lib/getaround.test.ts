import { describe, expect, it } from "vitest";
import { analyzeGetAround } from "./amenities";
import type { XY } from "./geo";
import { makeProjection } from "./geo";
import type { OsmElement } from "./osm";
import { buildSkyline, parseBuildings } from "./skyline";
import { analyzeSun, clockHour } from "./sunlight";

const proj = makeProjection({ lat: 47.38, lon: 8.53 });
let id = 1;
const node = (tags: Record<string, string>, p: XY): OsmElement => {
  const ll = proj.toLatLon(p);
  return { type: "node", id: id++, tags, lat: ll.lat, lon: ll.lon };
};
const area = (tags: Record<string, string>, pts: XY[]): OsmElement => ({ type: "way", id: id++, tags, geometry: [...pts, pts[0]].map((p) => proj.toLatLon(p)) });
const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("getting around", () => {
  it("finds the nearest stop, train station, green space and the bars next door", () => {
    const g = analyzeGetAround(
      [
        node({ highway: "bus_stop", name: "Zollstrasse" }, { x: 200, y: 0 }),
        node({ railway: "tram_stop", name: "Limmatplatz" }, { x: 0, y: 120 }),
        node({ railway: "station", name: "Zürich HB" }, { x: 600, y: 0 }),
        node({ railway: "station", station: "subway", name: "Museumstrasse" }, { x: 300, y: 0 }),
        area({ leisure: "park", name: "Kasernenwiese" }, square(-400, -400, 100)),
        area({ landuse: "forest" }, square(500, 500, 400)),
        node({ amenity: "bar" }, { x: 50, y: 50 }),
        node({ amenity: "pub" }, { x: 140, y: 0 }),
        node({ amenity: "nightclub" }, { x: 200, y: 200 }),
        node({ amenity: "restaurant" }, { x: 10, y: 0 }),
      ],
      proj,
    );
    expect(g.stop).toMatchObject({ name: "Limmatplatz", kindLabel: "Tram stop" });
    expect(g.stop!.distance).toBeCloseTo(120, 0);
    expect(g.station).toMatchObject({ name: "Zürich HB", kindLabel: "Train station" });
    expect(g.green).toMatchObject({ name: "Kasernenwiese", kind: "Park" });
    expect(g.green!.distance).toBeCloseTo(Math.hypot(300, 300), 0);
    expect(g.barsNearby).toBe(2);
  });

  it("counts an address inside a park as 0 m from it", () => {
    const g = analyzeGetAround([area({ leisure: "park" }, square(-50, -50, 100))], proj);
    expect(g.green?.distance).toBe(0);
    expect(g.stop).toBeUndefined();
  });
});

describe("morning and evening sun", () => {
  it("reads local clock time, including summer time", () => {
    const hour = clockHour("Europe/Zurich", 8.53);
    expect(hour(Date.UTC(2026, 0, 15, 12))).toBe(13);
    expect(hour(Date.UTC(2026, 6, 15, 12))).toBe(14);
    expect(clockHour(undefined, 8.53)(Date.UTC(2026, 6, 15, 12))).toBe(13);
  });

  it("loses evening sun behind a tall building to the west, but keeps the morning", () => {
    const open = analyzeSun({ lat: 47.38, lon: 8.53, floor: 1, skyline: null, terrain: null, climate: null, year: 2026, timeZone: "Europe/Zurich" });
    expect(open.eveningSun).toBeGreaterThan(3);
    expect(open.morningSun).toBeGreaterThan(3);
    const wall = area({ building: "yes", height: "40" }, [
      { x: -30, y: -300 },
      { x: -25, y: -300 },
      { x: -25, y: 300 },
      { x: -30, y: 300 },
    ]);
    const west = analyzeSun({ lat: 47.38, lon: 8.53, floor: 1, skyline: buildSkyline(parseBuildings([wall], proj), 250), terrain: null, climate: null, year: 2026, timeZone: "Europe/Zurich" });
    expect(west.eveningSun).toBeLessThan(0.5);
    expect(west.morningSun).toBeCloseTo(open.morningSun, 1);
  });
});
