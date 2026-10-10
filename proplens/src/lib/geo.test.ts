import { describe, expect, it } from "vitest";
import { bearing, compassLabel, formatDistance, haversine, makeProjection, pointInPolygon, rayHit, toLv95, walkMinutes } from "./geo";

describe("geo", () => {
  it("projects round-trip and matches haversine distances", () => {
    const proj = makeProjection({ lat: 47.3815, lon: 8.53 });
    const p = proj.toXY(47.39, 8.545);
    const back = proj.toLatLon(p);
    expect(back.lat).toBeCloseTo(47.39, 8);
    expect(back.lon).toBeCloseTo(8.545, 8);
    const d = haversine({ lat: 47.3815, lon: 8.53 }, { lat: 47.39, lon: 8.545 });
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(d, -1);
  });

  it("measures compass bearings", () => {
    const o = { x: 0, y: 0 };
    expect(bearing(o, { x: 0, y: 10 })).toBeCloseTo(0);
    expect(bearing(o, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(bearing(o, { x: 0, y: -10 })).toBeCloseTo(180);
    expect(bearing(o, { x: -10, y: 0 })).toBeCloseTo(270);
    expect(compassLabel(224)).toBe("SW");
  });

  it("casts rays against segments", () => {
    // A wall 20 m east of the origin, running north-south.
    expect(rayHit(90, { x: 20, y: -5 }, { x: 20, y: 5 })).toBeCloseTo(20);
    expect(rayHit(270, { x: 20, y: -5 }, { x: 20, y: 5 })).toBeNull();
    expect(rayHit(0, { x: 20, y: -5 }, { x: 20, y: 5 })).toBeNull();
  });

  it("tests points in polygons", () => {
    const square = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ];
    expect(pointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(pointInPolygon({ x: 2, y: 0 }, square)).toBe(false);
  });

  it("converts to Swiss LV95 within a metre", () => {
    // Reference point from swisstopo: the old Bern observatory.
    const { e, n } = toLv95(46.9510811, 7.4386372);
    expect(e).toBeCloseTo(2600000, -1);
    expect(n).toBeCloseTo(1200000, -1);
  });

  it("formats distances and walking times", () => {
    expect(formatDistance(4)).toBe("10 m");
    expect(formatDistance(243)).toBe("240 m");
    expect(formatDistance(1520)).toBe("1.5 km");
    expect(walkMinutes(400)).toBe(6);
  });
});
