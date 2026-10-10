import { describe, expect, it } from "vitest";
import { daySamples, sunPosition } from "./sun";

describe("sun", () => {
  it("puts the summer-solstice noon sun at 90° − latitude + 23.44°", () => {
    const lat = 47.38;
    const samples = daySamples(2026, 5, 21, lat, 8.53, 1);
    const peak = samples.reduce((a, b) => (b.altitude > a.altitude ? b : a));
    expect(peak.altitude).toBeCloseTo(90 - lat + 23.44, 0);
    expect(peak.azimuth).toBeGreaterThan(175);
    expect(peak.azimuth).toBeLessThan(185);
  });

  it("rises in the south-east in winter", () => {
    const samples = daySamples(2026, 11, 21, 47.38, 8.53, 1);
    const rise = samples.find((s) => s.altitude > 0)!;
    expect(rise.azimuth).toBeGreaterThan(120);
    expect(rise.azimuth).toBeLessThan(130);
    // Zurich sunrise on Dec 21 is around 07:13 UTC.
    const minutes = new Date(rise.t).getUTCHours() * 60 + new Date(rise.t).getUTCMinutes();
    expect(Math.abs(minutes - (7 * 60 + 13))).toBeLessThan(15);
  });

  it("is below the horizon at midnight", () => {
    expect(sunPosition(Date.UTC(2026, 2, 20, 23), 47.38, 8.53).altitude).toBeLessThan(-20);
  });
});
