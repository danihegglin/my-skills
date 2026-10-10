import type { LatLon, Projection } from "./geo";
import { bearing, distanceToPolyline, len, pointInPolygon } from "./geo";
import type { OsmElement } from "./osm";
import { elementLines, elementPoint } from "./osm";

export type Poi = {
  id: string;
  kind: string;
  /** Human label for the kind, e.g. "Supermarket". */
  kindLabel: string;
  name: string;
  /** Extra info: school level, brand, opening hours… */
  note?: string;
  point: LatLon;
  distance: number;
  bearing: number;
};

/** 100 when closer than `good`, 0 beyond `bad`, smooth in between. */
export function proximity(d: number | undefined, good: number, bad: number): number {
  if (d == null) return 0;
  if (d <= good) return 100;
  if (d >= bad) return 0;
  const x = (d - good) / (bad - good);
  return Math.round(100 * (1 - x * x * (3 - 2 * x)));
}

type Tagged = { poi: Poi; tags: Record<string, string> };

function toPois(elements: OsmElement[], proj: Projection, kindOf: (t: Record<string, string>) => string | null, labels: Record<string, string>): Tagged[] {
  const out: Tagged[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const kind = kindOf(t);
    const pt = elementPoint(e);
    if (!kind || !pt) continue;
    const xy = proj.toXY(pt.lat, pt.lon);
    out.push({
      poi: {
        id: `${e.type}${e.id}`,
        kind,
        kindLabel: labels[kind],
        name: t.name || t.brand || labels[kind],
        point: pt,
        distance: len(xy),
        bearing: bearing({ x: 0, y: 0 }, xy),
      },
      tags: t,
    });
  }
  // Places are often mapped twice (node + building): keep the closer of same-name pairs.
  out.sort((a, b) => a.poi.distance - b.poi.distance);
  const kept: (Tagged & { lower: string })[] = [];
  for (const item of out) {
    const p = item.poi;
    const lower = p.name.toLowerCase();
    const dup = kept.some(
      (k) => k.poi.kind === p.kind && k.lower === lower && Math.abs(k.poi.distance - p.distance) < 150 && Math.abs(k.poi.bearing - p.bearing) < 30,
    );
    if (!dup) kept.push({ ...item, lower });
  }
  return kept.map(({ poi, tags }) => ({ poi, tags }));
}

/* ---------- schools ---------- */

export type SchoolGroupId = "early" | "school" | "higher";
export type SchoolGroup = { id: SchoolGroupId; label: string; items: Poi[]; within1km: number; score: number };
export type SchoolsResult = { groups: SchoolGroup[]; score: number; all: Poi[] };

const SCHOOL_LABELS: Record<string, string> = {
  childcare: "Childcare",
  kindergarten: "Kindergarten",
  school: "School",
  college: "College",
  university: "University",
};

export function schoolLevel(t: Record<string, string>): string | undefined {
  const isced = t["isced:level"] ?? "";
  const kind = `${t.school ?? ""} ${t["school:type"] ?? ""} ${t.grades ?? ""}`.toLowerCase();
  const name = (t.name ?? "").toLowerCase();
  const primary = /(^|;|\s)1(;|$|\s)/.test(isced) || /primary|elementary/.test(kind) || /primar|grundschule|volksschule|elementary|primary|école primaire|ecole primaire|scuola elementare|basisschool/.test(name);
  const secondary = /[23]/.test(isced) || /secondary|middle|high/.test(kind) || /sekundar|gymnas|realschule|gesamtschule|oberstufe|kantonsschule|secondary|high school|middle school|lycée|lycee|collège|college|scuola media|liceo/.test(name);
  if (primary && secondary) return "Primary & secondary";
  if (primary) return "Primary";
  if (secondary) return "Secondary";
  if (t.amenity === "school" && /special|förder|heilpäd|sonderschul/.test(`${kind} ${name}`)) return "Special needs";
  return undefined;
}

export function analyzeSchools(places: OsmElement[] | null, proj: Projection): SchoolsResult {
  const all = toPois(places ?? [], proj, (t) => (SCHOOL_LABELS[t.amenity] ? t.amenity : null), SCHOOL_LABELS).map(({ poi, tags }) => ({
    ...poi,
    note: poi.kind === "school" ? schoolLevel(tags) : undefined,
  }));
  const by = (kinds: string[]) => all.filter((p) => kinds.includes(p.kind));
  const early = by(["kindergarten", "childcare"]);
  const schools = by(["school"]);
  const higher = by(["college", "university"]);
  const groups: SchoolGroup[] = [
    { id: "early", label: "Childcare & kindergarten", items: early, within1km: early.filter((p) => p.distance <= 1000).length, score: proximity(early[0]?.distance, 300, 1500) },
    { id: "school", label: "Schools", items: schools, within1km: schools.filter((p) => p.distance <= 1000).length, score: proximity(schools[0]?.distance, 450, 2200) },
    { id: "higher", label: "Colleges & universities", items: higher, within1km: higher.filter((p) => p.distance <= 1000).length, score: proximity(higher[0]?.distance, 1200, 6000) },
  ];
  const choice = Math.min(100, (early.filter((p) => p.distance <= 1000).length + schools.filter((p) => p.distance <= 1500).length) * 12);
  const score = Math.round(0.35 * groups[0].score + 0.45 * groups[1].score + 0.08 * groups[2].score + 0.12 * choice);
  return { groups, score, all };
}

/* ---------- shopping ---------- */

export type ShopEssentialId = "supermarket" | "grocery" | "bakery" | "pharmacy" | "post" | "mall";
export type ShopEssential = { id: ShopEssentialId; label: string; nearest?: Poi; count: number };
export type ShoppingResult = {
  essentials: ShopEssential[];
  score: number;
  all: Poi[];
  /** Distinct supermarket chains within 1 km. */
  chains: string[];
  /** Shops of any kind within 800 m, when Overpass returned a count. */
  shopsNearby: number | null;
  within500: number;
};

const SHOP_LABELS: Record<string, string> = {
  supermarket: "Supermarket",
  convenience: "Convenience store",
  general: "General store",
  greengrocer: "Greengrocer",
  organic: "Organic store",
  health_food: "Health food",
  deli: "Deli",
  butcher: "Butcher",
  cheese: "Cheese shop",
  seafood: "Fishmonger",
  farm: "Farm shop",
  beverages: "Drinks store",
  marketplace: "Market",
  bakery: "Bakery",
  pastry: "Pâtisserie",
  pharmacy: "Pharmacy",
  chemist: "Drugstore",
  post_office: "Post office",
  kiosk: "Kiosk",
  mall: "Shopping centre",
  department_store: "Department store",
};

const ESSENTIALS: { id: ShopEssentialId; label: string; kinds: string[] }[] = [
  { id: "supermarket", label: "Supermarket", kinds: ["supermarket"] },
  { id: "grocery", label: "Corner shop & fresh food", kinds: ["convenience", "general", "greengrocer", "organic", "health_food", "deli", "butcher", "cheese", "seafood", "farm", "marketplace"] },
  { id: "bakery", label: "Bakery", kinds: ["bakery", "pastry"] },
  { id: "pharmacy", label: "Pharmacy & drugstore", kinds: ["pharmacy", "chemist"] },
  { id: "post", label: "Post & kiosk", kinds: ["post_office", "kiosk"] },
  { id: "mall", label: "Mall & department store", kinds: ["mall", "department_store"] },
];

export function analyzeShopping(places: OsmElement[] | null, proj: Projection, shopsNearby: number | null): ShoppingResult {
  const tagged = toPois(places ?? [], proj, (t) => {
    const k = t.shop ?? (t.amenity === "pharmacy" || t.amenity === "marketplace" || t.amenity === "post_office" ? t.amenity : undefined);
    return k && SHOP_LABELS[k] ? k : null;
  }, SHOP_LABELS);
  const all: Poi[] = tagged.map(({ poi, tags }) => ({ ...poi, note: tags.brand && tags.brand !== poi.name ? tags.brand : undefined }));
  const essentials = ESSENTIALS.map((e) => {
    const items = all.filter((p) => e.kinds.includes(p.kind));
    return { id: e.id, label: e.label, nearest: items[0], count: items.filter((p) => p.distance <= 1000).length };
  });
  const near = (id: ShopEssentialId) => essentials.find((e) => e.id === id)?.nearest?.distance;
  const anyFood = Math.min(near("supermarket") ?? Infinity, near("grocery") ?? Infinity);
  const within500 = all.filter((p) => p.distance <= 500).length;
  const density = shopsNearby != null ? Math.min(100, 28 * Math.log2(1 + shopsNearby / 6)) : Math.min(100, within500 * 8);
  const score = Math.round(
    0.4 * proximity(near("supermarket"), 350, 1600) +
      0.12 * proximity(Number.isFinite(anyFood) ? anyFood : undefined, 200, 1000) +
      0.14 * proximity(near("bakery"), 300, 1400) +
      0.14 * proximity(near("pharmacy"), 350, 1600) +
      0.2 * density,
  );
  // Prefer branded chains; fall back to shop names where nothing is branded.
  const markets = tagged.filter(({ poi }) => poi.kind === "supermarket" && poi.distance <= 1000);
  const brands = [...new Set(markets.map(({ tags }) => tags.brand).filter((b): b is string => !!b))];
  const chains = (brands.length ? brands : [...new Set(markets.map(({ poi }) => poi.name))]).slice(0, 8);
  return { essentials, score, all, chains, shopsNearby, within500 };
}

/* ---------- getting around and green space ---------- */

export type Green = { name: string; kind: string; distance: number; point: LatLon };

export type GetAround = {
  /** Nearest public transport stop of any kind (bus, tram, metro, train, ferry). */
  stop?: Poi;
  /** Nearest train station (not tram or metro). */
  station?: Poi;
  /** Nearest park, wood or other public green space, measured to its edge (0 inside it). */
  green: Green | null;
  /** Bars, pubs and clubs within 150 m. */
  barsNearby: number;
};

const TRANSIT_LABELS: Record<string, string> = {
  bus_stop: "Bus stop",
  tram_stop: "Tram stop",
  metro: "Metro station",
  train: "Train station",
  bus_station: "Bus station",
  ferry: "Ferry",
};

function transitKind(t: Record<string, string>): string | null {
  if (t.highway === "bus_stop") return "bus_stop";
  if (t.railway === "tram_stop") return "tram_stop";
  if (t.railway === "station" || t.railway === "halt") return t.station === "subway" ? "metro" : t.station === "light_rail" && t.railway === "halt" ? "tram_stop" : "train";
  if (t.public_transport === "station") return t.bus === "yes" || t.amenity === "bus_station" ? "bus_station" : null;
  if (t.amenity === "ferry_terminal") return "ferry";
  return null;
}

const GREEN_LABELS: Record<string, string> = {
  park: "Park",
  nature_reserve: "Nature reserve",
  forest: "Woods",
  wood: "Woods",
  recreation_ground: "Recreation ground",
  village_green: "Green",
};

export function analyzeGetAround(places: OsmElement[] | null, proj: Projection): GetAround {
  const els = places ?? [];
  const stops = toPois(els, proj, transitKind, TRANSIT_LABELS);
  const origin = { x: 0, y: 0 };
  let green: Green | null = null;
  for (const e of els) {
    const t = e.tags ?? {};
    const kind = t.leisure === "park" || t.leisure === "nature_reserve" ? t.leisure : t.landuse && GREEN_LABELS[t.landuse] ? t.landuse : t.natural === "wood" ? "wood" : null;
    if (!kind) continue;
    for (const line of elementLines(e)) {
      if (line.length < 2) continue;
      const xy = line.map((p) => proj.toXY(p.lat, p.lon));
      const closed = line.length > 3 && line[0].lat === line[line.length - 1].lat && line[0].lon === line[line.length - 1].lon;
      const near = distanceToPolyline(origin, xy);
      const d = closed && pointInPolygon(origin, xy) ? 0 : near.d;
      if (!green || d < green.distance) green = { name: t.name || GREEN_LABELS[kind], kind: GREEN_LABELS[kind], distance: d, point: proj.toLatLon(near.point) };
    }
  }
  const barsNearby = els.filter((e) => {
    const p = elementPoint(e);
    if (!p || !/^(bar|pub|nightclub)$/.test(e.tags?.amenity ?? "")) return false;
    return len(proj.toXY(p.lat, p.lon)) <= 150;
  }).length;
  return {
    stop: stops[0]?.poi,
    station: stops.find((s) => s.poi.kind === "train")?.poi,
    green,
    barsNearby,
  };
}
