// Alert signups and listing matching. Pure so it can be unit-tested outside the Workers runtime.

export type Mode = "rent" | "buy";

/** A ranked address: what a listing at that address scores. */
export type Home = {
  key: string;
  address: string;
  lat: number;
  lon: number;
  score: number;
  noise: number;
  schools: number;
  shopping: number;
  sun: number;
};

export type AreaInfo = { id: string; label: string; south: number; west: number; north: number; east: number };

export type Signup = {
  email: string;
  mode: Mode;
  budget: number | null;
  minScore: number;
  page: string | null;
  area: AreaInfo;
  /** The area's ranked addresses, computed in the visitor's browser. */
  homes: Home[];
  ranked: string;
};

export type Parsed = { ok: true; signup: Signup } | { ok: false; error: string; spam?: true };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AREA_ID = /^(plz:\d{1,8}|gg:\d{1,6}|box:-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+|near:-?[\d.]+,-?[\d.]+)$/;
export const MAX_HOMES = 8000;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const score = (v: unknown) => {
  const n = num(v);
  return n != null && n >= 0 && n <= 100 ? Math.round(n) : null;
};

/** Lower-case street and number without accents, spaces or punctuation: "Zollstr. 12 A" → "zollstrasse12a". */
export function addressKey(street: string, number: string): string {
  const s = `${street} ${number}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/str\.(\s|$)/g, "strasse$1");
  return s.replace(/[^a-z0-9]/g, "");
}

/** Keys for an address like "Langstrasse 241, 243" or "Zollstrasse 12a": one per house number. */
export function addressKeys(address: string): string[] {
  const m = address.trim().match(/^(.*?)\s+(\d[\w/-]*(?:\s*[,;]\s*\d[\w/-]*)*)$/);
  if (!m) return [];
  return m[2].split(/\s*[,;]\s*/).map((n) => addressKey(m[1], n));
}

function parseArea(v: unknown): AreaInfo | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const id = typeof a.id === "string" ? a.id : "";
  const label = typeof a.label === "string" ? a.label.trim().slice(0, 120) : "";
  const [south, west, north, east] = [num(a.south), num(a.west), num(a.north), num(a.east)];
  if (!AREA_ID.test(id) || !label || south == null || west == null || north == null || east == null) return null;
  if (south >= north || west >= east || north - south > 0.5 || east - west > 0.5 || Math.abs(south) > 90 || Math.abs(west) > 180) return null;
  return { id, label, south, west, north, east };
}

function parseHomes(v: unknown, area: AreaInfo): Home[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_HOMES) return null;
  const pad = 0.01;
  const homes: Home[] = [];
  for (const row of v) {
    if (!Array.isArray(row) || row.length !== 8) continue;
    const [address, lat, lon, ...rest] = row as unknown[];
    const scores = rest.map(score);
    const la = num(lat);
    const lo = num(lon);
    if (typeof address !== "string" || address.length > 120 || la == null || lo == null || scores.some((s) => s == null)) continue;
    if (la < area.south - pad || la > area.north + pad || lo < area.west - pad || lo > area.east + pad) continue;
    const [total, noise, schools, shopping, sun] = scores as number[];
    for (const key of addressKeys(address)) homes.push({ key, address: address.trim(), lat: la, lon: lo, score: total, noise, schools, shopping, sun });
  }
  return homes.length ? homes : null;
}

export function parseSignup(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request" };
  const b = body as Record<string, unknown>;
  // Honeypot: real visitors never see or fill this field. Bots get a normal-looking reply and nothing is stored.
  if (typeof b.website === "string" && b.website.trim()) return { ok: false, error: "Invalid request", spam: true };
  if (b.consent !== true) return { ok: false, error: "Please agree to receive alerts" };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "Please enter a valid email address" };
  const area = parseArea(b.area);
  if (!area) return { ok: false, error: "Please choose an area" };
  const homes = parseHomes(b.homes, area);
  if (!homes) return { ok: false, error: "The area ranking is missing; please rank the area again" };
  const budget = num(b.budget);
  const minScore = num(b.minScore) ?? 60;
  const ranked = typeof b.ranked === "string" && !Number.isNaN(Date.parse(b.ranked)) ? new Date(b.ranked).toISOString() : new Date().toISOString();
  return {
    ok: true,
    signup: {
      email,
      mode: b.mode === "buy" ? "buy" : "rent",
      budget: budget != null && budget > 0 && budget < 1e9 ? Math.round(budget) : null,
      minScore: Math.max(0, Math.min(100, Math.round(minScore))),
      page: typeof b.page === "string" ? b.page.slice(0, 500) : null,
      area,
      homes,
      ranked,
    },
  };
}

/* ---------- listings ---------- */

export type Listing = {
  /** "flatfox:<id>". */
  id: string;
  url: string;
  mode: Mode;
  /** "APARTMENT", "HOUSE", … as the source reports it. */
  category: string;
  title: string;
  street: string | null;
  address: string;
  lat: number | null;
  lon: number | null;
  /** Monthly rent incl. utilities, or the sale price; null on request. */
  price: number | null;
  rooms: number | null;
  space: number | null;
  floor: number | null;
  published: string | null;
};

/** Homes, as opposed to parking spaces, rooms in shared flats and commercial units. */
export const HOME_CATEGORIES = new Set(["APARTMENT", "HOUSE"]);

const MATCH_RADIUS = 30;

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * 6371000;
}

/** The ranked address a listing is at: same street and number, or else the nearest within 30 m. */
export function matchListing(listing: Pick<Listing, "street" | "lat" | "lon">, byKey: Map<string, Home>, homes: Home[]): Home | null {
  if (listing.street) for (const key of addressKeys(listing.street)) {
    const hit = byKey.get(key);
    if (hit) return hit;
  }
  if (listing.lat == null || listing.lon == null) return null;
  const at = { lat: listing.lat, lon: listing.lon };
  let best: Home | null = null;
  let bestD = MATCH_RADIUS;
  for (const h of homes) {
    const d = metres(at, h);
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** Whether a scored listing is one a subscriber asked to hear about. */
export function wanted(sub: { mode: Mode; budget: number | null; minScore: number }, listing: { mode: Mode; price: number | null; score: number | null; category: string }): boolean {
  if (listing.score == null || listing.score < sub.minScore) return false;
  if (listing.mode !== sub.mode || !HOME_CATEGORIES.has(listing.category)) return false;
  if (sub.budget != null && (listing.price == null || listing.price > sub.budget)) return false;
  return true;
}
