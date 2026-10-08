import { describe, expect, it } from "vitest";
import { MAX_SIDE, bboxSize, inArea, parseGeoAdminSearch, parsePhotonAreas, rankWindow, ringsFromGeoJson } from "./area";
import type { AreaHome } from "./areaScore";
import { applyOfficial, findHomes, insidePoint, refineTop, scoreArea } from "./areaScore";
import type { XY } from "./geo";
import { makeProjection } from "./geo";
import type { OsmElement } from "./osm";

describe("area search", () => {
  it("reads geo.admin.ch postcodes and municipalities, skipping lakes", () => {
    const refs = parseGeoAdminSearch({
      results: [
        { attrs: { origin: "zipcode", label: "<b>8005 - Zürich</b>", featureId: "4390", lat: 47.387, lon: 8.52 } },
        { attrs: { origin: "gg25", label: "<b>Opfikon (ZH)</b>", featureId: "66", lat: 47.43, lon: 8.57 } },
        { attrs: { origin: "gg25", label: "<b>Zürichsee (ZH)</b>", featureId: "9051", lat: 47.3, lon: 8.6 } },
      ],
    });
    expect(refs.map((r) => [r.id, r.label, r.kind, r.detail])).toEqual([
      ["plz:4390", "8005 Zürich", "postcode", "Postcode · Switzerland"],
      ["gg:66", "Opfikon", "municipality", "Municipality · ZH"],
    ]);
  });

  it("keeps Photon cities and districts with an extent, leaving Swiss postcodes and towns to geo.admin.ch", () => {
    const f = (props: Record<string, unknown>) => ({ geometry: { coordinates: [8.7, 47.47] as [number, number] }, properties: props });
    const refs = parsePhotonAreas({
      features: [
        f({ name: "Töss", type: "district", city: "Winterthur", country: "Schweiz", countrycode: "CH", extent: [8.681, 47.4999, 8.729, 47.4497] }),
        f({ name: "Opfikon", type: "city", countrycode: "CH", extent: [8.55, 47.44, 8.59, 47.41] }),
        f({ name: "Freiburg im Breisgau", type: "city", state: "Baden-Württemberg", country: "Deutschland", countrycode: "DE", extent: [7.66, 48.07, 7.93, 47.9] }),
        f({ name: "Kunsthalle", type: "house" }),
      ],
    });
    expect(refs.map((r) => [r.id, r.label, r.kind, r.detail])).toEqual([
      ["box:47.44970,8.68100,47.49990,8.72900", "Töss", "district", "District · Winterthur, Schweiz"],
      ["box:47.90000,7.66000,48.07000,7.93000", "Freiburg im Breisgau", "city", "City · Baden-Württemberg, Deutschland"],
    ]);
  });
});

describe("area shape", () => {
  const square = (x0: number, y0: number, s: number) => [
    [x0, y0],
    [x0 + s, y0],
    [x0 + s, y0 + s],
    [x0, y0 + s],
    [x0, y0],
  ];
  const rings = ringsFromGeoJson({ type: "MultiPolygon", coordinates: [[square(8.5, 47.3, 0.1), square(8.53, 47.33, 0.02)]] });
  const shape = { rings, bbox: { south: 47.3, west: 8.5, north: 47.4, east: 8.6 } };

  it("treats inner rings as holes", () => {
    expect(inArea(shape, { lat: 47.31, lon: 8.51 })).toBe(true);
    expect(inArea(shape, { lat: 47.34, lon: 8.54 })).toBe(false);
    expect(inArea(shape, { lat: 47.41, lon: 8.51 })).toBe(false);
    expect(inArea({ rings: null, bbox: shape.bbox }, { lat: 47.34, lon: 8.54 })).toBe(true);
  });

  it("ranks small areas whole and large ones in a window around the focus, inside the area", () => {
    const small = { south: 47.378, west: 8.501, north: 47.395, east: 8.539 };
    expect(rankWindow(small, undefined)).toEqual({ bbox: small, clipped: false });
    const city = { south: 47.319, west: 8.447, north: 47.435, east: 8.627 };
    const w = rankWindow(city, { lat: 47.43, lon: 8.54 });
    expect(w.clipped).toBe(true);
    const size = bboxSize(w.bbox);
    expect(size.width).toBeCloseTo(MAX_SIDE, -1);
    expect(size.height).toBeCloseTo(MAX_SIDE, -1);
    // Pushed back inside the city's northern edge.
    expect(w.bbox.north).toBeCloseTo(city.north, 6);
  });
});

/* ---------- scoring ---------- */

const center = { lat: 47.38, lon: 8.53 };
const proj = makeProjection(center);
let nextId = 1;
const ring = (x: number, y: number, w: number, h: number): XY[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
  { x, y },
];
const building = (tags: Record<string, string>, pts: XY[]): OsmElement => ({ type: "way", id: nextId++, tags: { building: "yes", ...tags }, geometry: pts.map((p) => proj.toLatLon(p)) });
const window = { south: 47.37, west: 8.515, north: 47.39, east: 8.545 };
const whole = { rings: null, bbox: window };

describe("finding homes", () => {
  it("keeps residential buildings with an address and classifies houses and flats", () => {
    const homes = findHomes(
      [
        building({ building: "apartments", "addr:street": "Zollstrasse", "addr:housenumber": "12" }, ring(0, 0, 20, 15)),
        building({ "addr:street": "Zollstrasse", "addr:housenumber": "14" }, ring(40, 0, 12, 10)),
        building({ "addr:street": "Zollstrasse", "addr:housenumber": "16", "building:levels": "6" }, ring(80, 0, 12, 10)),
        building({ building: "retail", "addr:street": "Zollstrasse", "addr:housenumber": "18" }, ring(120, 0, 20, 15)),
        building({ "addr:street": "Zollstrasse", "addr:housenumber": "20", shop: "bakery" }, ring(160, 0, 20, 15)),
        building({ building: "garage" }, ring(200, 0, 6, 6)),
        building({ "addr:street": "Zollstrasse", "addr:housenumber": "22" }, ring(240, 0, 4, 4)),
        building({ "addr:street": "Zollstrasse", "addr:housenumber": "24" }, ring(5000, 0, 12, 10)),
      ],
      whole,
      window,
    );
    expect(homes.map((h) => [h.address, h.kind, h.kindLabel])).toEqual([
      ["Zollstrasse 12", "flats", "Apartment building"],
      ["Zollstrasse 14", "house", "House"],
      ["Zollstrasse 16", "flats", "Residential building"],
    ]);
  });

  it("puts the scoring point inside U-shaped footprints", () => {
    const u: XY[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
      { x: 20, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
      { x: 0, y: 0 },
    ];
    const p = insidePoint(u);
    const inside = (p.y < 8 && p.x > 0 && p.x < 30) || (p.y < 30 && (p.x < 10 || p.x > 20));
    expect(inside).toBe(true);
  });
});

describe("ranking", () => {
  const road = (pts: XY[]): OsmElement => ({ type: "way", id: nextId++, tags: { highway: "primary", name: "Badenerstrasse" }, geometry: pts.map((p) => proj.toLatLon(p)) });
  const data = {
    buildings: [
      building({ building: "apartments", "addr:street": "Badenerstrasse", "addr:housenumber": "1" }, ring(-10, 12, 20, 12)),
      building({ building: "apartments", "addr:street": "Gartenweg", "addr:housenumber": "2" }, ring(-10, 400, 20, 12)),
    ],
    streets: [road([{ x: -1500, y: 0 }, { x: 1500, y: 0 }])],
    places: [] as OsmElement[],
    air: [] as OsmElement[],
    climate: null,
  };

  it("scores the home beside a main road below the quiet one and splits work between workers", () => {
    const homes = scoreArea(data, whole, window, { year: 2026 });
    expect(homes.map((h) => h.address)).toEqual(["Gartenweg 2", "Badenerstrasse 1"]);
    expect(homes[1].noise.day).toBeGreaterThan(homes[0].noise.day + 10);
    expect(homes[1].scores.noise).toBeLessThan(homes[0].scores.noise);
    const parts = [0, 1].flatMap((k) => scoreArea(data, whole, window, { year: 2026, part: [k, 2] }));
    expect(parts.map((h) => h.address).sort()).toEqual(homes.map((h) => h.address).sort());
  });

  it("replaces modelled noise with official values and re-ranks the leaders", async () => {
    const homes = scoreArea(data, whole, window, { year: 2026 });
    const quiet = homes[0];
    const official = applyOfficial(quiet, { road: { day: 66, night: 58 }, rail: { day: null, night: null }, air: { day: null, night: null } });
    expect(official.official).toBe(true);
    expect(official.noise.day).toBeGreaterThan(65);
    expect(official.score).toBeLessThan(quiet.score);

    const calls: number[] = [];
    const refined = await refineTop(homes, async (lat) => {
      calls.push(lat);
      return lat === quiet.lat ? { road: { day: 70, night: 62 }, rail: { day: null, night: null }, air: { day: null, night: null } } : null;
    });
    expect(calls).toHaveLength(2);
    expect(refined.map((h: AreaHome) => h.address)).toEqual(["Badenerstrasse 1", "Gartenweg 2"]);
  });
});
