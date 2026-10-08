import { toLv95 } from "./geo";

/** Official Swiss noise exposure (sonBASE, Federal Office for the Environment), dB(A). */
export type OfficialNoise = {
  road: { day: number | null; night: number | null };
  rail: { day: number | null; night: number | null };
};

const LAYERS = {
  "ch.bafu.laerm-strassenlaerm_tag": ["road", "day"],
  "ch.bafu.laerm-strassenlaerm_nacht": ["road", "night"],
  "ch.bafu.laerm-bahnlaerm_tag": ["rail", "day"],
  "ch.bafu.laerm-bahnlaerm_nacht": ["rail", "night"],
} as const;

/** Rough bounding box of Switzerland, so we only ask geo.admin.ch about Swiss points. */
export function inSwitzerland(lat: number, lon: number) {
  return lat > 45.8 && lat < 47.85 && lon > 5.9 && lon < 10.55;
}

export function parseFeatureInfo(text: string): OfficialNoise {
  const out: OfficialNoise = { road: { day: null, night: null }, rail: { day: null, night: null } };
  const blocks = text.split(/Layer '/).slice(1);
  for (const block of blocks) {
    const layer = block.slice(0, block.indexOf("'")).replace(/_full$/, "") as keyof typeof LAYERS;
    const match = block.match(/value_0\.name = '([\d.]+)'/);
    const target = LAYERS[layer];
    if (!target || !match) continue;
    const [kind, period] = target;
    out[kind][period] = Number(match[1]);
  }
  return out;
}

export async function fetchOfficialNoise(lat: number, lon: number, signal?: AbortSignal): Promise<OfficialNoise> {
  const { e, n } = toLv95(lat, lon);
  const layers = Object.keys(LAYERS).join(",");
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: layers,
    QUERY_LAYERS: layers,
    CRS: "EPSG:2056",
    BBOX: [e - 5, n - 5, e + 5, n + 5].map((v) => v.toFixed(1)).join(","),
    WIDTH: "11",
    HEIGHT: "11",
    I: "5",
    J: "5",
    INFO_FORMAT: "text/plain",
    FEATURE_COUNT: "10",
  });
  const res = await fetch(`https://wms.geo.admin.ch/?${params}`, { signal });
  if (!res.ok) throw new Error(`geo.admin.ch answered ${res.status}`);
  return parseFeatureInfo(await res.text());
}
