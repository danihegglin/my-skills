// New listings from Flatfox's public listing API (Swiss rentals and sales).

import type { AreaInfo, Listing } from "./alerts";

const FLATFOX = "https://flatfox.ch";
const HEADERS = { Accept: "application/json", "User-Agent": "PropLens listing alerts (+https://proplens.vatia.workers.dev)" };
/** Most pins one map request returns; a ranked window rarely holds more live listings. */
const MAX_PINS = 600;
const BATCH = 50;

type Pin = { pk: number };

type FlatfoxListing = {
  pk: number;
  url?: string;
  status?: string;
  offer_type?: string;
  object_category?: string;
  short_title?: string;
  public_title?: string;
  street?: string | null;
  zipcode?: number | null;
  city?: string | null;
  public_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  price_display?: number | null;
  selling_price?: number | null;
  number_of_rooms?: string | null;
  livingspace?: number | null;
  surface_living?: number | null;
  floor?: number | null;
  published?: string | null;
};

export function toListing(f: FlatfoxListing): Listing | null {
  if (f.status && f.status !== "act") return null;
  const mode = f.offer_type === "RENT" ? "rent" : f.offer_type === "SALE" ? "buy" : null;
  if (!mode) return null;
  const rooms = Number(f.number_of_rooms);
  const price = f.price_display ?? f.selling_price ?? null;
  return {
    id: `flatfox:${f.pk}`,
    url: `${FLATFOX}${f.url ?? `/${f.pk}/`}`,
    mode,
    category: f.object_category ?? "OTHER",
    title: f.short_title || f.public_title || "Listing",
    street: f.street || null,
    address: f.public_address || [f.street, [f.zipcode, f.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    lat: f.latitude ?? null,
    lon: f.longitude ?? null,
    price: price != null && price > 0 ? price : null,
    rooms: Number.isFinite(rooms) && rooms > 0 ? rooms : null,
    space: f.livingspace ?? f.surface_living ?? null,
    floor: f.floor ?? null,
    published: f.published ?? null,
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`flatfox.ch answered ${res.status}`);
  return (await res.json()) as T;
}

/** Listings in the area's box that aren't `known` yet, plus the ids of new ones that aren't usable offers. */
export async function newFlatfoxListings(area: AreaInfo, known: (id: string) => boolean): Promise<{ listings: Listing[]; ignored: string[] }> {
  const q = new URLSearchParams({
    north: String(area.north),
    south: String(area.south),
    east: String(area.east),
    west: String(area.west),
    max_count: String(MAX_PINS),
  });
  const pins = await getJson<Pin[]>(`${FLATFOX}/api/v1/pin/?${q}`);
  const fresh = pins.map((p) => p.pk).filter((pk) => Number.isInteger(pk) && !known(`flatfox:${pk}`));
  const listings: Listing[] = [];
  const ignored: string[] = [];
  for (let i = 0; i < fresh.length; i += BATCH) {
    const ids = fresh.slice(i, i + BATCH);
    const page = await getJson<{ results?: FlatfoxListing[] }>(`${FLATFOX}/api/v1/public-listing/?limit=${BATCH}&${ids.map((pk) => `pk=${pk}`).join("&")}`);
    for (const f of page.results ?? []) {
      const l = toListing(f);
      if (l) listings.push(l);
      else ignored.push(`flatfox:${f.pk}`);
    }
  }
  return { listings, ignored };
}
