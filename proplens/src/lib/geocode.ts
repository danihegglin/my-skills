export type Place = {
  id: string;
  lat: number;
  lon: number;
  /** Street + number, or the place name. */
  title: string;
  /** Postcode, city and country. */
  subtitle: string;
  countryCode?: string;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
  };
};

export const PHOTON = "https://photon.komoot.io";
const LANGS = ["de", "en", "fr", "it"];

export function lang() {
  const l = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LANGS.includes(l) ? l : "en";
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : "";
  const title = street && (!p.name || p.type === "house") ? street : p.name || street || p.city || "Dropped pin";
  const city = p.city || p.locality || p.district;
  const subtitle = [
    street && title !== street ? street : "",
    [p.postcode, city !== title ? city : ""].filter(Boolean).join(" "),
    p.country,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    id: `${p.osm_type ?? "x"}${p.osm_id ?? `${lat},${lon}`}`,
    lat,
    lon,
    title,
    subtitle,
    countryCode: p.countrycode?.toUpperCase(),
  };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=6&lang=${lang()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return json.features.map(toPlace).filter((p) => {
    const key = `${p.title}|${p.subtitle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<Place> {
  const fallback: Place = { id: `pin${lat},${lon}`, lat, lon, title: "Dropped pin", subtitle: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=${lang()}`, { signal });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { features: PhotonFeature[] };
    const f = json.features[0];
    // Keep the exact clicked point; the label is only for display.
    return f ? { ...toPlace(f), lat, lon, id: fallback.id } : fallback;
  } catch {
    return fallback;
  }
}
