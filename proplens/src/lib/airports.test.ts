import { describe, expect, it } from "vitest";
import { analyzeFlights, corridors, designators, flightHeatmap, parseAirports, relateToRunway, summarizeAirports } from "./airports";
import type { XY } from "./geo";
import { makeProjection } from "./geo";
import type { OsmElement } from "./osm";

const proj = makeProjection({ lat: 47.38, lon: 8.53 });
/** A 3 km north-south runway "18/36" whose northern end lies `north` metres south of the address, shifted `east` metres. */
function airport(north: number, east = 0): OsmElement[] {
  const pts: XY[] = [
    { x: -east, y: -north },
    { x: -east, y: -north - 3000 },
  ];
  return [
    { type: "way", id: 1, tags: { aeroway: "runway", ref: "18/36", surface: "asphalt" }, geometry: pts.map((p) => proj.toLatLon(p)) },
    { type: "node", id: 2, tags: { aeroway: "aerodrome", name: "Test Intl", iata: "TST", "aerodrome:type": "international" }, ...proj.toLatLon({ x: -east, y: -north - 1500 }) },
  ];
}

describe("flight paths", () => {
  it("reads runway designators, or derives them from geometry", () => {
    expect(designators({ a: { x: 0, y: 0 }, b: { x: 0, y: -3000 }, length: 3000, ref: "16L/34R" })).toEqual([
      { label: "16L", heading: 160 },
      { label: "34R", heading: 340 },
    ]);
    expect(designators({ a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, length: 3000 }).map((d) => d.label)).toEqual(["09", "27"]);
  });

  it("puts an address on the extended centreline under the approach", () => {
    const [port] = parseAirports(airport(8000), proj);
    expect(port.kind).toBe("major");
    const rel = relateToRunway(port.runways[0]);
    expect(rel.position).toBe("under");
    // North of the runway, arrivals fly south and land on 18; departures from 36 climb out over us.
    expect(rel.landing).toBe("18");
    expect(rel.departing).toBe("36");
    expect(rel.beyond).toBeCloseTo(8000, -1);
    expect(rel.arrivalAltitude).toBe(Math.round(15 + 0.0524 * 8000));
    expect(rel.departureAltitude).toBeGreaterThan(rel.arrivalAltitude!);
  });

  it("separates near and off-path addresses", () => {
    expect(relateToRunway(parseAirports(airport(8000, 1600), proj)[0].runways[0]).position).toBe("near");
    expect(relateToRunway(parseAirports(airport(8000, 4000), proj)[0].runways[0]).position).toBe("off");
    expect(relateToRunway(parseAirports(airport(-1500, 900), proj)[0].runways[0]).position).toBe("alongside");
  });

  it("builds a corridor off each runway end", () => {
    const [port] = summarizeAirports(airport(8000), proj);
    expect(port.corridors).toHaveLength(2);
    expect(port.corridors.map((c) => c.landing).sort()).toEqual(["18", "36"]);
    const north = corridors(parseAirports(airport(8000), proj)[0], proj).find((c) => c.landing === "18")!;
    expect(north.polygon).toHaveLength(4);
    expect(north.marks[0]).toMatchObject({ distance: 4000, altitude: Math.round(15 + 0.0524 * 4000) });
    // The corridor for runway 18 extends north, over the address.
    expect(north.centerline[1].lat).toBeGreaterThan(north.centerline[0].lat);
  });
});

describe("flyover heatmap", () => {
  const ports = parseAirports(airport(8000), proj);
  const heat = flightHeatmap(ports, proj, 20000, 80)!;
  const at = (x: number, y: number) => {
    const cell = 40000 / heat.size;
    const i = Math.floor((x + 20000) / cell);
    const j = Math.floor((20000 - y) / cell);
    return heat.values[j * heat.size + i];
  };

  it("is strongest along the extended centreline and close to the runway", () => {
    expect(at(0, 0)).toBeGreaterThan(at(3000, 0) * 5);
    expect(at(0, -6000)).toBeGreaterThan(at(0, 0));
    expect(at(0, 15000)).toBeLessThan(at(0, 0));
    expect(at(15000, 15000)).toBeLessThan(heat.max / 1000);
  });

  it("classifies direct flyover, near and distant addresses", () => {
    expect(analyzeFlights(airport(8000), proj).exposure).toMatchObject({ level: "direct" });
    expect(analyzeFlights(airport(8000, 1600), proj).exposure.level).toBe("near");
    const far = analyzeFlights(airport(8000, 6000), proj).exposure;
    expect(far.level).toBe("distant");
    expect(far.pathDistance).toBeCloseTo(6000, -2);
    expect(far.share).toBeLessThan(0.05);
    expect(analyzeFlights([], proj).exposure.level).toBe("none");
  });
});
