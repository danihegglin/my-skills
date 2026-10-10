import { describe, expect, it } from "vitest";
import { proximity, schoolLevel } from "./amenities";
import { summarizeClimate } from "./climate";
import { overallScore } from "./report";
import { parseFeatureInfo } from "./swissNoise";

describe("official Swiss noise", () => {
  it("parses WMS GetFeatureInfo text", () => {
    const text = `GetFeatureInfo results:

Layer 'ch.bafu.laerm-bahnlaerm_nacht_full'
  Feature 0: 
    ch.bafu.laerm-bahnlaerm_nacht.value_0.name = '4'

Layer 'ch.bafu.laerm-strassenlaerm_tag_full'
  Feature 0: 
    ch.bafu.laerm-strassenlaerm_tag.value_0.name = '60.4'
`;
    expect(parseFeatureInfo(text)).toEqual({ road: { day: 60.4, night: null }, rail: { day: null, night: 4 }, air: { day: null, night: null } });
  });

  it("reads the aircraft noise cadastre's assessment level", () => {
    const text = `GetFeatureInfo results:

Layer 'ch.bazl.laermbelastungskataster-zivilflugplaetze_klein-grossflugzeuge_gfi'
  Feature 48794: 
    Beurteilungspegel_dBA = '58'
    Lärmbelastungstyp = 'OverallTrafficDay_Lr'
`;
    expect(parseFeatureInfo(text).air).toEqual({ day: 58, night: null });
  });
});

describe("schools", () => {
  it("detects school levels from tags and names", () => {
    expect(schoolLevel({ amenity: "school", "isced:level": "1" })).toBe("Primary");
    expect(schoolLevel({ amenity: "school", name: "Schulhaus Kornhausbrücke Primarschule" })).toBe("Primary");
    expect(schoolLevel({ amenity: "school", name: "Kantonsschule Enge" })).toBe("Secondary");
    expect(schoolLevel({ amenity: "school", name: "Schulhaus Limmat" })).toBeUndefined();
  });

  it("scores proximity smoothly", () => {
    expect(proximity(100, 300, 1500)).toBe(100);
    expect(proximity(900, 300, 1500)).toBe(50);
    expect(proximity(2000, 300, 1500)).toBe(0);
    expect(proximity(undefined, 300, 1500)).toBe(0);
  });
});

describe("climate", () => {
  it("averages sunshine per month", () => {
    const time = ["2025-01-01", "2025-01-02", "2025-07-01"];
    const c = summarizeClimate(
      { timezone: "Europe/Zurich", daily: { time, sunshine_duration: [3600, 7200, 36000], daylight_duration: [30000, 30000, 57600] } },
      2025,
    );
    expect(c.monthlySunshine[0]).toBeCloseTo(1.5);
    expect(c.monthlySunshine[6]).toBeCloseTo(10);
    expect(c.annualSunshine).toBeCloseTo(1.5 * 31 + 10 * 31);
    expect(c.timezone).toBe("Europe/Zurich");
  });
});

describe("overall score", () => {
  it("re-weights when a section is missing", () => {
    expect(overallScore({ noise: 50, schools: 50, shopping: 50, sun: 50 })).toBe(50);
    expect(overallScore({ noise: 100 })).toBe(100);
    expect(overallScore({})).toBeNull();
  });
});
