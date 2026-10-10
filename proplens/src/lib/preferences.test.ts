import { describe, expect, it } from "vitest";
import type { Metrics, Pref } from "./preferences";
import { MUST_CAP, PREFS, evaluate } from "./preferences";

const home: Metrics = {
  lat: 47.3815,
  lon: 8.53,
  noiseDay: 52,
  noiseNight: 44,
  winterSun: 2.5,
  eveningSun: 1.5,
  morningSun: 2,
  stop: 160, // 2.5 min
  station: 1200, // 18.75 min
  supermarket: 300,
  school: null,
  childcare: 400,
  green: 0,
  barsNearby: 1,
  flyover: "near",
  names: { stop: "Tram stop Bahnhofplatz" },
};
const pref = (id: Pref["id"], target: number, importance: Pref["importance"] = 2, place?: Pref["place"]): Pref => ({ id, target, importance, place });

describe("preferences", () => {
  it("defines every preference with a valid default target", () => {
    for (const d of PREFS) expect(d.targets).toContain(d.defaultTarget);
  });

  it("scores each preference against what the address offers", () => {
    const { results } = evaluate(
      [pref("evening-sun", 2), pref("transit", 5), pref("train", 10), pref("quiet-night", 45), pref("school", 10), pref("green", 5), pref("no-nightlife", 0), pref("no-flights", 1)],
      home,
    );
    const by = Object.fromEntries(results.map((r) => [r.pref.id, r]));
    expect(by["evening-sun"].satisfaction).toBeCloseTo(0.75);
    expect(by["evening-sun"].text).toBe("1.5 h a day after 5 pm (Apr–Sep)");
    expect(by.transit.satisfaction).toBe(1);
    expect(by.transit.text).toBe("3 min walk · Tram stop Bahnhofplatz");
    // 18.75 min against 10: partly met, nothing at twice the target.
    expect(by.train.satisfaction).toBeCloseTo(0.125);
    expect(by["quiet-night"].satisfaction).toBe(1);
    expect(by.school.satisfaction).toBe(0);
    expect(by.school.text).toBe("No school within 2.5 km");
    expect(by.green.satisfaction).toBe(1);
    expect(by["no-nightlife"].satisfaction).toBe(0);
    expect(by["no-flights"].satisfaction).toBe(1);
  });

  it("weights by importance, skips unknowns and caps the match when a must-have is missed", () => {
    const met = pref("transit", 5, 1);
    const missed = pref("school", 10, 2);
    expect(evaluate([met, missed], home).match).toBe(33);
    expect(evaluate([met, pref("winter-sun", 3, 1)], { ...home, winterSun: undefined }).match).toBe(100);
    expect(evaluate([met, pref("winter-sun", 3, 1)], { ...home, winterSun: undefined }).results[1].satisfaction).toBeNull();
    const must = evaluate([pref("transit", 5, 1), pref("supermarket", 5, 1), pref("winter-sun", 3, 3)], home);
    expect(must.missedMusts.map((r) => r.pref.id)).toEqual(["winter-sun"]);
    expect(must.match).toBeLessThanOrEqual(MUST_CAP);
    expect(evaluate([], home).match).toBeNull();
    // A small shortfall on a nice-to-have never rounds up to a perfect match.
    const nearly = evaluate([pref("transit", 5, 3), pref("supermarket", 5, 3), pref("quiet-night", 45, 3), pref("train", 18, 1)], home);
    expect(nearly.results[3].satisfaction).toBeGreaterThan(0.9);
    expect(nearly.match).toBe(99);
  });

  it("measures distance to a chosen place", () => {
    const work = { label: "ETH Zürich", lat: 47.3763, lon: 8.5476 };
    const r = evaluate([pref("near-work", 2, 2, work)], home).results[0];
    expect(r.text).toBe("1.4 km in a straight line");
    expect(r.satisfaction).toBe(1);
    expect(evaluate([pref("near-work", 2)], home).results[0].satisfaction).toBeNull();
  });
});
