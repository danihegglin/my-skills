import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LucideIcon } from "lucide-react";
import { Crosshair, GraduationCap, Plane, ShoppingBasket, Sun, UtensilsCrossed, Volume2, Factory } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Poi } from "../lib/amenities";
import { formatDistance, makeProjection, walkMinutes } from "../lib/geo";
import type { Place } from "../lib/geocode";
import type { NoiseSource } from "../lib/noise";
import { rateNoise } from "../lib/noise";
import type { Report, SectionId } from "../lib/report";
import type { SunResult } from "../lib/sunlight";
import { DAY_COLOR, fmtTime } from "./SunCharts";
import { CATEGORY_HEX, TONE_COLOR, TONE_HEX } from "./ui";

const LAYERS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "noise", label: "Noise", icon: Volume2 },
  { id: "schools", label: "Schools", icon: GraduationCap },
  { id: "shopping", label: "Shopping", icon: ShoppingBasket },
  { id: "sun", label: "Sun", icon: Sun },
];

// MapLibre locates its worker relative to its own module, which bundling breaks: point at it explicitly.
setWorkerUrl(maplibreWorker);

const iconCache = new Map<string, L.DivIcon>();
function poiIcon(Icon: LucideIcon, color: string, size = 28) {
  const key = `${Icon.displayName}-${color}-${size}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const svg = renderToStaticMarkup(<Icon size={size * 0.5} color="white" strokeWidth={2.2} />);
    icon = L.divIcon({
      className: "pl-marker",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid white;box-shadow:0 2px 8px rgb(16 20 15/.25)">${svg}</span>`,
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const homeIcon = L.divIcon({
  className: "pl-marker",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<span style="position:relative;display:grid;place-items:center;width:44px;height:44px">
    <span class="pl-ping"></span>
    <span style="position:relative;display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:#10140f;box-shadow:0 4px 14px rgb(16 20 15/.35)">
      <span style="width:10px;height:10px;border-radius:999px;background:#d4f26a"></span>
    </span></span>`,
});

type Props = {
  place: Place;
  report: Report | null;
  sun: SunResult | null;
  layer: SectionId;
  onLayer: (l: SectionId) => void;
  onPick: (lat: number, lon: number) => void;
};

export default function MapPanel({ place, report, sun, layer, onLayer, onPick }: Props) {
  const center: [number, number] = [place.lat, place.lon];
  return (
    <div className="relative h-full overflow-hidden rounded-[28px] border border-line bg-wash">
      <MapContainer center={center} zoom={16} zoomControl={false} scrollWheelZoom className="size-full" attributionControl maxZoom={19}>
        <BaseMap />
        <Recenter place={place} layer={layer} report={report} />
        <Picker onPick={onPick} />
        {report && layer === "noise" && <NoiseLayer sources={report.noise?.mapSources ?? []} />}
        {report && layer === "schools" && <PoiLayer pois={report.schools?.all ?? []} icon={GraduationCap} color={CATEGORY_HEX.school} limit={40} />}
        {report && layer === "shopping" && <PoiLayer pois={report.shopping?.all ?? []} icon={ShoppingBasket} color={CATEGORY_HEX.shop} limit={60} />}
        {report && layer === "sun" && <SunLayer report={report} sun={sun} />}
        {(layer === "schools" || layer === "shopping") && (
          <>
            <Circle center={center} radius={500} pathOptions={{ color: "#10140f", weight: 1, opacity: 0.25, fill: false }} />
            <Circle center={center} radius={1000} pathOptions={{ color: "#10140f", weight: 1, opacity: 0.18, fill: false }} />
          </>
        )}
        <Marker position={center} icon={homeIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -18]} className="pl-tip">
            {place.title}
          </Tooltip>
        </Marker>
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-between gap-2">
        <div className="pointer-events-auto flex gap-1 overflow-x-auto rounded-full border border-line bg-card/95 p-1 shadow-sm backdrop-blur" role="tablist" aria-label="Map layer">
          {LAYERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={layer === id}
              onClick={() => onLayer(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${layer === id ? "bg-ink text-white" : "text-ink-2 hover:bg-wash"}`}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
      {layer === "noise" && report?.noise && <NoiseLegend />}
      <p className="pointer-events-none absolute bottom-3 left-3 z-[500] hidden rounded-full bg-card/90 px-3 py-1 text-[12px] text-ink-2 shadow-sm backdrop-blur sm:flex sm:items-center sm:gap-1.5">
        <Crosshair className="size-3.5" aria-hidden /> Click the map to check another spot
      </p>
    </div>
  );
}

/** Vector basemap from OpenFreeMap (no API key), rendered by MapLibre inside Leaflet. */
function BaseMap() {
  const map = useMap();
  useEffect(() => {
    const layer = maplibreGL({ style: "https://tiles.openfreemap.org/styles/positron" });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map]);
  return null;
}

function NoiseLegend() {
  const items: [string, keyof typeof TONE_COLOR][] = [
    ["< 50", "good"],
    ["50–55", "fair"],
    ["55–60", "warning"],
    ["60–65", "serious"],
    ["65+", "critical"],
  ];
  return (
    <div className="absolute bottom-3 right-3 z-[500] rounded-2xl border border-line bg-card/95 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      <div className="mb-1 font-medium text-ink-2">Contribution at the address, dB</div>
      <div className="flex gap-2.5">
        {items.map(([label, tone]) => (
          <span key={label} className="flex items-center gap-1 tabular text-ink-2">
            <span className="h-1 w-3 rounded-full" style={{ background: TONE_COLOR[tone] }} aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Recenter({ place, layer, report }: { place: Place; layer: SectionId; report: Report | null }) {
  const map = useMap();
  // Late data (climate, terrain) rebuilds the report; only re-frame when the layer or place changes.
  const latest = useRef(report);
  latest.current = report;
  const ready = report != null;
  useEffect(() => {
    const here = L.latLng(place.lat, place.lon);
    const r = latest.current;
    const fit = (pois: Poi[], n: number, maxZoom: number) => {
      const pts = pois.slice(0, n).map((p) => L.latLng(p.point.lat, p.point.lon));
      if (!pts.length) return map.flyTo(here, 16, { duration: 0.6 });
      map.flyToBounds(L.latLngBounds([here, ...pts]).pad(0.15), { maxZoom, duration: 0.6 });
    };
    if (!r) map.setView(here, 16);
    else if (layer === "schools") fit(r.schools?.all ?? [], 8, 16);
    else if (layer === "shopping") fit(r.shopping?.all ?? [], 10, 17);
    else if (layer === "sun") map.flyTo(here, 18, { duration: 0.6 });
    else map.flyTo(here, 16, { duration: 0.6 });
  }, [map, place, layer, ready]);
  return null;
}

function Picker({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  const [pt, setPt] = useState<L.LatLng | null>(null);
  useMapEvents({ click: (e) => setPt(e.latlng) });
  if (!pt) return null;
  return (
    <Popup position={pt} eventHandlers={{ remove: () => setPt(null) }}>
      <button
        onClick={() => {
          onPick(pt.lat, pt.lng);
          setPt(null);
        }}
        className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium text-white"
      >
        Analyze this spot →
      </button>
    </Popup>
  );
}

const SOURCE_ICON: Record<string, LucideIcon> = { air: Plane, nightlife: UtensilsCrossed, other: Factory };

function NoiseLayer({ sources }: { sources: NoiseSource[] }) {
  const sorted = useMemo(() => [...sources].filter((s) => Math.max(s.day, s.night + 8) > 36).sort((a, b) => a.day - b.day), [sources]);
  return (
    <>
      {sorted.map((s) => {
        const tone = rateNoise(Math.max(s.day, s.category === "nightlife" ? s.night : -Infinity)).tone;
        const color = TONE_HEX[tone];
        const tip = (
          <Tooltip sticky className="pl-tip">
            <strong>{s.name}</strong>
            <br />
            {s.detail} · {formatDistance(s.distance)}
            <br />≈ {Math.round(s.day)} dB day · {Math.round(s.night)} dB night
          </Tooltip>
        );
        if (s.lines)
          return (
            <Polyline key={s.id} positions={s.lines.map((l) => l.map((p) => [p.lat, p.lon] as [number, number]))} pathOptions={{ color, weight: s.category === "rail" ? 2.5 : 4, opacity: 0.85, lineCap: "round" }}>
              {tip}
            </Polyline>
          );
        if (s.point) {
          const Icon = SOURCE_ICON[s.category];
          if (s.category === "nightlife")
            return (
              <CircleMarker key={s.id} center={[s.point.lat, s.point.lon]} radius={5} pathOptions={{ color: "white", weight: 2, fillColor: color, fillOpacity: 1 }}>
                {tip}
              </CircleMarker>
            );
          return (
            <Marker key={s.id} position={[s.point.lat, s.point.lon]} icon={poiIcon(Icon ?? Volume2, color, 30)}>
              {tip}
            </Marker>
          );
        }
        return null;
      })}
    </>
  );
}

function PoiLayer({ pois, icon, color, limit }: { pois: Poi[]; icon: LucideIcon; color: string; limit: number }) {
  return (
    <>
      {pois.slice(0, limit).map((p) => (
        <Marker key={p.id} position={[p.point.lat, p.point.lon]} icon={poiIcon(icon, color)}>
          <Tooltip direction="top" offset={[0, -14]} className="pl-tip">
            <strong>{p.name}</strong>
            <br />
            {p.note ?? p.kindLabel} · {formatDistance(p.distance)} · {walkMinutes(p.distance)} min walk
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

function SunLayer({ report, sun }: { report: Report; sun: SunResult | null }) {
  const proj = useMemo(() => makeProjection({ lat: report.place.lat, lon: report.place.lon }), [report.place]);
  const maxH = Math.max(12, ...report.buildings.map((b) => b.height));
  const rays = useMemo(() => {
    if (!sun) return [];
    return sun.keyDays
      .filter((d) => d.id !== "equinox")
      .flatMap((d) => {
        const up = d.samples.filter((s) => s.altitude > 0);
        if (!up.length) return [];
        return [up[0], up[up.length - 1]].map((s, i) => {
          const r = (s.azimuth * Math.PI) / 180;
          const end = proj.toLatLon({ x: Math.sin(r) * 160, y: Math.cos(r) * 160 });
          return { id: `${d.id}${i}`, day: d, s, end, rise: i === 0 };
        });
      });
  }, [sun, proj]);
  return (
    <>
      {report.buildings.map((b) => {
        const t = Math.min(1, b.height / maxH);
        const own = b === report.skyline?.own;
        return (
          <Polygon
            key={b.id}
            positions={b.latlngs.map((p) => [p.lat, p.lon] as [number, number])}
            pathOptions={{ color: own ? "#10140f" : "#3d4a40", weight: own ? 2 : 0.5, fillColor: own ? "#d4f26a" : "#3d4a40", fillOpacity: own ? 0.8 : 0.12 + t * 0.6 }}
          >
            <Tooltip sticky className="pl-tip">
              {own ? "This building · " : ""}
              {b.levels ? `${b.levels} floors · ` : ""}≈ {Math.round(b.height)} m{b.estimated ? " (typical height)" : ""}
            </Tooltip>
          </Polygon>
        );
      })}
      {rays.map(({ id, day, s, end, rise }) => (
        <Polyline key={id} positions={[[report.place.lat, report.place.lon], [end.lat, end.lon]]} pathOptions={{ color: DAY_COLOR[day.id], weight: 3, opacity: 0.9, dashArray: rise ? undefined : "6 6" }}>
          <Tooltip sticky className="pl-tip">
            {day.label.split(" · ")[1]} · sun{rise ? "rise" : "set"} {fmtTime(s.t, report.timeZone)}
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
}
