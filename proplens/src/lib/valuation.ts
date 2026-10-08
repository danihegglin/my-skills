import prices from "../data/prices.json";
import type { FlyoverLevel } from "./airports";
import type { Tone } from "./noise";

/*
 * Price estimation engine. Runs offline on official figures bundled in src/data/prices.json
 * (refresh with scripts/update-price-data.py) plus hedonic adjustments for the property and the
 * location signals PropLens computes itself. Every step is returned so the UI can explain it.
 */

export type Mode = "rent" | "buy";
export type PropertyType = "apartment" | "house";
export type Quality = "simple" | "standard" | "upscale" | "luxury";
export type Condition = "needs-work" | "average" | "renovated";
export type View = "none" | "partial" | "lake";
export type Period = "new" | "2021+" | "2011-2020" | "2001-2010" | "1991-2000" | "1981-1990" | "1971-1980" | "1961-1970" | "1946-1960" | "1919-1945" | "<1919";
export type Urbanity = "urban" | "intermediate" | "rural";
export type RoomKey = "1" | "2" | "3" | "4" | "5" | "6+";

export type Property = {
  type: PropertyType;
  /** Living area, m². */
  area: number;
  /** Rooms as advertised; half rooms are matched to whole-room statistics (3½ → 3). */
  rooms: number;
  floor: number;
  period: Period;
  condition: Condition;
  quality: Quality;
  balcony: boolean;
  elevator: boolean;
  garden: boolean;
  view: View;
};

export type Location = {
  /** Canton abbreviation (e.g. "ZH"), when the address is in Switzerland. */
  canton: string | null;
  municipality: { name: string; number: number } | null;
  urbanity: Urbanity;
  /** True when urbanity comes from official statistics rather than local density. */
  urbanityOfficial: boolean;
  /** Day noise level at the façade, dB. */
  noiseDay: number | null;
  flyover: FlyoverLevel | null;
  /** Hours of direct sun on the shortest day at the chosen floor. */
  winterSun: number | null;
  /** Average of the schools and shopping scores, 0–100. */
  amenities: number | null;
  /** Outside Switzerland: local reference levels supplied by the user. */
  manualRentPerM2?: number | null;
  manualPricePerM2?: number | null;
};

export type Step = { id: string; label: string; detail: string; factor: number };

export type Estimate = {
  mode: Mode;
  value: number;
  /** Rent mode: what the average sitting tenant of such a flat pays (before the advertised-rent step). */
  paid: number | null;
  low: number;
  high: number;
  perM2: number;
  base: { label: string; perM2: number; source: string };
  steps: Step[];
};

/** [value, ± 95% confidence]; null where the statistics office suppressed a value (too few cases). */
type Pair = (number | null)[];
type RentTable = Record<RoomKey | "total", Pair>;
type Canton = { name: string; monthly: RentTable; perM2: RentTable };

const RENT = prices.rent;
const CANTONS = RENT.cantons as unknown as Record<string, Canton>;
const NEW_LEASE = RENT.newLease as Record<"newBuild" | "existing", Record<string, number>>;
/** Advertised ÷ paid rent by rooms (Winterthur housing monitor). */
const ASKING = RENT.askingPremium.factors as Record<string, number>;
export const ASKING_YEARS = RENT.askingPremium.years;
const PERIODS = RENT.periods.factors as Record<string, number>;
const TYPES = RENT.municipalityTypes.factors as Record<Urbanity, Record<string, number>>;
const CITIES = RENT.cities.byMunicipality as Record<string, { name: string; factors: Record<string, number> }>;
const ZH = prices.zurichSales;
const ZH_REGIONS = ZH.municipalities as Record<string, string>;
type Sales = { n: number; q10: number; q25: number; median: number; q75: number; q90: number };

export const RENT_YEAR = RENT.year;

const pct = (f: number) => `${f >= 1 ? "+" : "−"}${Math.abs(Math.round((f - 1) * 100))}%`;
export const SALES_YEAR = ZH.year;

export const roomKey = (rooms: number): RoomKey => {
  const r = Math.floor(rooms + 1e-9);
  return r <= 1 ? "1" : r >= 6 ? "6+" : (String(r) as RoomKey);
};

export function cantonInfo(code: string | null) {
  return code ? (CANTONS[code] ?? null) : null;
}

/** A canton's figure for a room count, falling back to its overall level scaled like Switzerland's. */
function cantonValue(code: string, kind: "monthly" | "perM2", rk: RoomKey): number {
  const table = CANTONS[code][kind];
  const v = table[rk][0];
  if (v != null) return v;
  const ch = CANTONS.CH[kind];
  return (table.total[0] as number) * ((ch[rk][0] as number) / (ch.total[0] as number));
}

/** Typical size of rented flats with this many rooms in the canton (average rent ÷ rent per m²). */
export function typicalArea(canton: string | null, rooms: RoomKey): number {
  const code = canton && CANTONS[canton] ? canton : "CH";
  return cantonValue(code, "monthly", rooms) / cantonValue(code, "perM2", rooms);
}

/** English names of canton Zurich's property-market regions. */
export const REGION_LABEL: Record<string, string> = {
  "Stadt Zürich": "the city of Zurich",
  "Stadt Winterthur": "the city of Winterthur",
  Agglomerationsgemeinden: "the agglomeration",
  Seegemeinden: "the lakeside municipalities",
  Landgemeinden: "the rural municipalities",
};

export function zurichRegion(municipality: number | null | undefined): string | null {
  return municipality != null ? (ZH_REGIONS[String(municipality)] ?? null) : null;
}

/** Location factor relative to the canton average: city statistics where they exist, else municipality type. */
function locationStep(loc: Location, rk: RoomKey): Step {
  const city = loc.municipality ? CITIES[String(loc.municipality.number)] : undefined;
  if (city) {
    const f = city.factors[rk];
    return { id: "location", label: `City of ${loc.municipality!.name}`, detail: `Rents in the city run ${pct(f)} against the canton average`, factor: f };
  }
  // Canton averages already blend town and country, so apply the national urban/rural gap only partly.
  const f = Math.pow(TYPES[loc.urbanity][rk], 0.6);
  const what = { urban: "Urban area", intermediate: "Suburban / small-town area", rural: "Rural area" }[loc.urbanity];
  return { id: "location", label: what, detail: loc.urbanityOfficial ? "From the official regional classification" : "Judged from local building and shop density", factor: f };
}

/** Market rent per m² for a typical property of this room count at a location (before property-specific steps). */
function marketRentPerM2(canton: string, rk: RoomKey, loc: Pick<Location, "municipality" | "urbanity" | "urbanityOfficial">): number {
  return cantonValue(canton, "perM2", rk) * ASKING[rk] * locationStep(loc as Location, rk).factor;
}

/* ---------- purchase calibration ---------- */

const REGION_LOCATIONS: Record<string, { urbanity: Urbanity; city?: { name: string; number: number } }> = {
  "Stadt Zürich": { urbanity: "urban", city: { name: "Zürich", number: 261 } },
  "Stadt Winterthur": { urbanity: "urban", city: { name: "Winterthur", number: 230 } },
  Agglomerationsgemeinden: { urbanity: "urban" },
  Seegemeinden: { urbanity: "urban" },
  Landgemeinden: { urbanity: "rural" },
};

/**
 * Price-to-annual-rent multiples, calibrated so that a typical flat (4 rooms) or house (5 rooms)
 * of canton-average size reproduces the median sale price of each Zurich property-market region.
 */
function calibrate(kind: "condos" | "houses"): Record<string, number> {
  const rk: RoomKey = kind === "condos" ? "4" : "5";
  const sales = ZH[kind] as Record<string, Sales>;
  const out: Record<string, number> = {};
  for (const [region, where] of Object.entries(REGION_LOCATIONS)) {
    const s = sales[region];
    if (!s) continue;
    const rent = marketRentPerM2("ZH", rk, { municipality: where.city ?? null, urbanity: where.urbanity, urbanityOfficial: true });
    out[region] = s.median / (rent * 12 * typicalArea("ZH", rk));
  }
  // Elsewhere in Switzerland, use the agglomeration and rural multiples, and their midpoint in between.
  out.urban = out.Agglomerationsgemeinden;
  out.rural = out.Landgemeinden;
  out.intermediate = (out.urban + out.rural) / 2;
  return out;
}

export const MULTIPLES = { apartment: calibrate("condos"), house: calibrate("houses") };

/* ---------- the engine ---------- */

const QUALITY: Record<Quality, [number, string]> = {
  simple: [0.9, "Simple fittings"],
  standard: [1, "Standard fittings"],
  upscale: [1.1, "Upscale fittings"],
  luxury: [1.25, "Luxury fittings"],
};

export function estimate(mode: Mode, p: Property, loc: Location): Estimate | null {
  const rk = roomKey(p.rooms);
  const canton = loc.canton && CANTONS[loc.canton] ? loc.canton : null;
  const steps: Step[] = [];
  let base: Estimate["base"];

  if (canton) {
    const c = CANTONS[canton];
    base = {
      label: `Average rent, ${rk === "6+" ? "6+" : rk}-room flats in canton ${c.name}`,
      perM2: cantonValue(canton, "perM2", rk),
      source: `Swiss Federal Statistical Office, ${RENT_YEAR}`,
    };
    steps.push({
      id: "market",
      label: "Advertised rent level",
      detail: `Listings ask this much more than the average tenant pays (Winterthur, ${ASKING_YEARS})`,
      factor: ASKING[rk],
    });
    steps.push(locationStep(loc, rk));
  } else if (mode === "rent" && loc.manualRentPerM2) {
    base = { label: "Your reference rent for the area", perM2: loc.manualRentPerM2, source: "Entered by you" };
  } else if (mode === "buy" && loc.manualPricePerM2) {
    base = { label: "Your reference price for the area", perM2: loc.manualPricePerM2, source: "Entered by you" };
  } else return null;

  const typical = typicalArea(canton, rk);
  const size = Math.min(1.15, Math.max(0.85, Math.pow(p.area / typical, -0.15)));
  if (Math.abs(size - 1) >= 0.005)
    steps.push({
      id: "size",
      label: p.area > typical ? "Larger than typical" : "Smaller than typical",
      detail: `A typical ${rk}-room flat here has ${Math.round(typical)} m²; price per m² falls as size grows`,
      factor: size,
    });

  if (p.period === "new")
    steps.push({
      id: "age",
      label: "New build, first letting",
      detail: "New tenants of new buildings pay this much more than new tenants of older ones",
      factor: NEW_LEASE.newBuild[rk] / NEW_LEASE.existing[rk],
    });
  else {
    steps.push({ id: "age", label: `Built ${p.period === "<1919" ? "before 1919" : p.period.replace("+", " or later")}`, detail: "Rent per m² by construction period, Switzerland", factor: PERIODS[p.period] });
    const old = !["2021+", "2011-2020", "2001-2010"].includes(p.period);
    if (p.condition === "needs-work") steps.push({ id: "condition", label: "Needs renovation", detail: "Dated kitchen, bathrooms or windows", factor: 0.88 });
    if (p.condition === "renovated" && old) steps.push({ id: "condition", label: "Renovated", detail: "Modernised kitchen, bathrooms and windows", factor: 1.06 });
  }

  const [q, qLabel] = QUALITY[p.quality];
  if (q !== 1) steps.push({ id: "quality", label: qLabel, detail: "Materials, kitchen and bathroom standard", factor: q });

  if (p.type === "apartment") {
    let f = p.floor === 0 ? 0.97 : 1 + 0.01 * Math.min(Math.max(p.floor - 1, 0), 8);
    if (!p.elevator && p.floor >= 3) f *= 1 - 0.015 * (p.floor - 2);
    if (Math.abs(f - 1) >= 0.005)
      steps.push({ id: "floor", label: p.floor === 0 ? "Ground floor" : `Floor ${p.floor}${p.elevator ? "" : ", no lift"}`, detail: "Higher floors are brighter and quieter; stairs without a lift count against", factor: f });
  }
  if (p.balcony) steps.push({ id: "balcony", label: "Balcony or terrace", detail: "Private outdoor space", factor: 1.03 });
  if (p.garden && (p.type === "house" || p.floor === 0)) steps.push({ id: "garden", label: "Private garden", detail: "Garden use", factor: 1.03 });
  if (p.view !== "none") steps.push({ id: "view", label: p.view === "lake" ? "Lake or mountain view" : "Open view", detail: "Unobstructed outlook", factor: p.view === "lake" ? 1.06 : 1.02 });

  if (loc.noiseDay != null) {
    const L = loc.noiseDay;
    const f = L <= 45 ? 1.02 : L > 50 ? 1 - 0.004 * Math.min(L - 50, 25) : 1;
    if (f !== 1) steps.push({ id: "noise", label: L <= 45 ? "Quiet location" : "Noise exposure", detail: `${Math.round(L)} dB by day at the façade (from this report)`, factor: f });
  }
  if (loc.flyover === "direct" || loc.flyover === "near")
    steps.push({ id: "flights", label: loc.flyover === "direct" ? "Direct flyovers" : "Near a flight path", detail: "Aircraft overhead (from this report)", factor: loc.flyover === "direct" ? 0.97 : 0.99 });
  if (loc.winterSun != null) {
    const f = 0.96 + (0.07 * Math.min(loc.winterSun, 6)) / 6;
    if (Math.abs(f - 1) >= 0.005)
      steps.push({ id: "sun", label: f > 1 ? "Sunny" : "Little winter sun", detail: `${loc.winterSun.toFixed(1)} h of direct sun on the shortest day at this floor`, factor: f });
  }
  if (loc.amenities != null) {
    const f = 0.97 + (0.05 * loc.amenities) / 100;
    if (Math.abs(f - 1) >= 0.005) steps.push({ id: "amenities", label: f > 1 ? "Good everyday access" : "Few shops and schools nearby", detail: "Schools and shopping scores (from this report)", factor: f });
  }

  let perM2 = steps.reduce((acc, s) => acc * s.factor, base.perM2);
  if (mode === "buy" && canton) {
    const region = canton === "ZH" ? zurichRegion(loc.municipality?.number) : null;
    const table = MULTIPLES[p.type];
    const multiple = (region && table[region]) || table[loc.urbanity];
    steps.push({
      id: "capitalise",
      label: "Rent to purchase price",
      detail: `Price-to-rent ratio calibrated on ${SALES_YEAR} sales in ${region ? `${REGION_LABEL[region] ?? region} of` : "the agglomeration and rural areas of"} canton Zurich`,
      factor: multiple * 12,
    });
    perM2 *= multiple * 12;
  }

  const value = perM2 * p.area;
  const spread = mode === "rent" ? (canton ? 0.12 : 0.15) : canton === "ZH" ? 0.15 : 0.2;
  const paid = mode === "rent" && canton ? value / ASKING[rk] : null;
  return { mode, value, paid, low: value * (1 - spread), high: value * (1 + spread), perM2, base, steps };
}

export type Verdict = { diff: number; label: string; tone: Tone; advice: string };

export function compareAsking(asking: number, e: Estimate): Verdict {
  const diff = asking / e.value - 1;
  if (diff < -0.25) return { diff, label: "Well below estimate", tone: "warning", advice: "Unusually cheap: check the condition, the lease terms and what's included." };
  if (diff < -0.1) return { diff, label: "Below estimate", tone: "good", advice: "Good value for the location and features." };
  if (diff <= 0.1) return { diff, label: "In line with estimate", tone: "good", advice: "A fair price for what you get." };
  if (diff <= 0.25) return { diff, label: "Above estimate", tone: "warning", advice: "On the high side; there may be room to negotiate." };
  return { diff, label: "Well above estimate", tone: "serious", advice: "Expensive for the area, unless it has features the model can't see." };
}

/** Zurich sale-price quartiles for the address's property-market region. */
export function zurichSales(municipality: number | null | undefined, type: PropertyType): (Sales & { region: string }) | null {
  const region = zurichRegion(municipality);
  if (!region) return null;
  const s = (type === "apartment" ? ZH.condos : ZH.houses) as Record<string, Sales>;
  return s[region] ? { ...s[region], region } : null;
}

/** Average and market rents by room count for the canton, for the reference table. */
export function typicalRents(canton: string | null) {
  const c = cantonInfo(canton);
  if (!c) return null;
  const code = canton!;
  return (["1", "2", "3", "4", "5", "6+"] as RoomKey[]).map((rk) => {
    const average = cantonValue(code, "monthly", rk);
    return {
      rooms: rk,
      average,
      /** ± 95% confidence; null where the official value was suppressed and is estimated here. */
      margin: c.monthly[rk][1],
      advertised: average * ASKING[rk],
      area: typicalArea(code, rk),
      perM2: cantonValue(code, "perM2", rk),
    };
  });
}

/* ---------- location from a PropLens report ---------- */

type ReportSignals = {
  municipality: { name: string; number: number; canton: string } | null;
  shopsNearby: number | null;
  /** Share of ground covered by buildings around the address. */
  coverage: number | null;
  noiseDay: number | null;
  flyover: FlyoverLevel | null;
  winterSun: number | null;
  amenities: number | null;
};

/** Without an official class, judge urbanity from shops within 800 m and building density. */
export function estimateUrbanity(shops: number | null, coverage: number | null): Urbanity {
  const s = shops ?? 0;
  const c = coverage ?? 0;
  if (s >= 60 || c >= 0.25) return "urban";
  if (s >= 10 || c >= 0.12) return "intermediate";
  return "rural";
}

export function locationFrom(r: ReportSignals): Location {
  const m = r.municipality;
  const region = m?.canton === "ZH" ? zurichRegion(m.number) : null;
  return {
    canton: m?.canton ?? null,
    municipality: m ? { name: m.name, number: m.number } : null,
    urbanity: region ? (region === "Landgemeinden" ? "rural" : "urban") : estimateUrbanity(r.shopsNearby, r.coverage),
    urbanityOfficial: !!region,
    noiseDay: r.noiseDay,
    flyover: r.flyover,
    winterSun: r.winterSun,
    amenities: r.amenities,
  };
}
