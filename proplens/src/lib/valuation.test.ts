import { describe, expect, it } from "vitest";
import prices from "../data/prices.json";
import type { Location, Property } from "./valuation";
import { compareAsking, estimate, estimateUrbanity, roomKey, typicalArea, typicalRents, zurichRegion, zurichSales } from "./valuation";

const flat: Property = {
  type: "apartment",
  area: 80,
  rooms: 3.5,
  floor: 1,
  period: "2001-2010",
  condition: "average",
  quality: "standard",
  balcony: false,
  elevator: true,
  garden: false,
  view: "none",
};
const neutral: Location = {
  canton: "ZH",
  municipality: { name: "Opfikon", number: 66 },
  urbanity: "urban",
  urbanityOfficial: true,
  noiseDay: null,
  flyover: null,
  winterSun: null,
  amenities: null,
};
const rent = (p: Partial<Property> = {}, l: Partial<Location> = {}) => estimate("rent", { ...flat, ...p }, { ...neutral, ...l })!;

describe("valuation engine", () => {
  it("matches advertised room counts to whole-room statistics", () => {
    expect(roomKey(1)).toBe("1");
    expect(roomKey(3.5)).toBe("3");
    expect(roomKey(6.5)).toBe("6+");
  });

  it("starts from the canton's official rent per m² and explains every step", () => {
    const e = rent();
    expect(e.base.perM2).toBe(prices.rent.cantons.ZH.perM2["3"][0]);
    const product = e.steps.reduce((acc, s) => acc * s.factor, e.base.perM2);
    expect(e.perM2).toBeCloseTo(product, 6);
    expect(e.value).toBeCloseTo(e.perM2 * 80, 6);
    expect(e.low).toBeLessThan(e.value);
    expect(e.high).toBeGreaterThan(e.value);
    expect(e.paid).toBeLessThan(e.value);
  });

  it("responds to the property in the expected direction", () => {
    expect(rent({ quality: "luxury" }).value).toBeGreaterThan(rent().value);
    expect(rent({ condition: "needs-work" }).value).toBeLessThan(rent().value);
    expect(rent({ period: "new" }).value).toBeGreaterThan(rent({ period: "2021+" }).value * 0.95);
    expect(rent({ floor: 0 }).value).toBeLessThan(rent({ floor: 5 }).value);
    expect(rent({ floor: 5, elevator: false }).value).toBeLessThan(rent({ floor: 5 }).value);
    expect(rent({ view: "lake" }).value).toBeGreaterThan(rent({ view: "partial" }).value);
    // Bigger flats cost more in total but less per m².
    expect(rent({ area: 110 }).value).toBeGreaterThan(rent().value);
    expect(rent({ area: 110 }).perM2).toBeLessThan(rent().perM2);
  });

  it("prices in the location signals from the report", () => {
    expect(rent({}, { noiseDay: 66 }).value).toBeLessThan(rent({}, { noiseDay: 48 }).value);
    expect(rent({}, { noiseDay: 42 }).value).toBeGreaterThan(rent().value);
    expect(rent({}, { flyover: "direct" }).value).toBeLessThan(rent({}, { flyover: "distant" }).value);
    expect(rent({}, { winterSun: 0 }).value).toBeLessThan(rent({}, { winterSun: 6 }).value);
    expect(rent({}, { urbanity: "rural", municipality: null, urbanityOfficial: false }).value).toBeLessThan(rent().value);
  });

  it("uses city statistics for the ten largest cities", () => {
    const zurich = rent({}, { municipality: { name: "Zürich", number: 261 } });
    expect(zurich.steps.find((s) => s.id === "location")!.label).toBe("City of Zürich");
  });

  it("reproduces the median Zurich sale price for a typical flat", () => {
    const sales = zurichSales(66, "apartment")!;
    expect(sales.region).toBe("Agglomerationsgemeinden");
    const typical = estimate("buy", { ...flat, rooms: 4, area: typicalArea("ZH", "4") }, neutral)!;
    // 2001–2010 buildings sit ~0.6% above the all-ages average the calibration uses.
    expect(typical.value / sales.median).toBeGreaterThan(0.98);
    expect(typical.value / sales.median).toBeLessThan(1.03);
  });

  it("fills statistics the federal office suppressed", () => {
    const appenzell = typicalRents("AI")!;
    expect(appenzell[0].average).toBeGreaterThan(300);
    expect(appenzell[0].margin).toBeNull();
    expect(Number.isFinite(estimate("rent", { ...flat, rooms: 1, area: 35 }, { ...neutral, canton: "AI", municipality: null })!.value)).toBe(true);
  });

  it("needs a reference price outside Switzerland", () => {
    const abroad: Location = { ...neutral, canton: null, municipality: null };
    expect(estimate("rent", flat, abroad)).toBeNull();
    const withRef = estimate("rent", flat, { ...abroad, manualRentPerM2: 20 })!;
    expect(withRef.base.perM2).toBe(20);
    expect(estimate("buy", flat, { ...abroad, manualPricePerM2: 8000 })!.perM2).toBeGreaterThan(5000);
  });

  it("compares an asking price with the estimate", () => {
    const e = rent();
    expect(compareAsking(e.value * 1.05, e).label).toBe("In line with estimate");
    expect(compareAsking(e.value * 1.18, e).label).toBe("Above estimate");
    expect(compareAsking(e.value * 1.4, e).tone).toBe("serious");
    expect(compareAsking(e.value * 0.7, e).label).toBe("Well below estimate");
  });

  it("classifies urbanity and Zurich regions", () => {
    expect(estimateUrbanity(200, 0.3)).toBe("urban");
    expect(estimateUrbanity(15, 0.05)).toBe("intermediate");
    expect(estimateUrbanity(2, 0.04)).toBe("rural");
    expect(zurichRegion(261)).toBe("Stadt Zürich");
    expect(zurichRegion(9999)).toBeNull();
  });
});
