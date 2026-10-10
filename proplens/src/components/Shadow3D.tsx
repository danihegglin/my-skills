import { Map as MapLibreMap, FullscreenControl, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import maplibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { Compass, Cpu, LoaderCircle, Pause, Play, Sun, SunDim } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { compassLabel, makeProjection } from "../lib/geo";
import type { Report } from "../lib/report";
import type { ShadowScene } from "../lib/shadowScene";
import { COMPASS_RADIUS, RAMP_CSS, createShadowScene, rampColor } from "../lib/shadowScene";
import { HORIZON_ALT, daySamples, sunPosition } from "../lib/sun";
import type { HeightGrid } from "../lib/sunhours";
import { hoursAt, rasterize, sunSamples } from "../lib/sunhours";
import type { SunHoursRequest, SunHoursResponse } from "../lib/sunhours.worker";
import type { SunResult } from "../lib/sunlight";
import { utcOffset, zonedTime } from "../lib/sunlight";
import { terrainHorizon } from "../lib/terrain";
import { Segmented } from "./form";

setWorkerUrl(maplibreWorker);

type Props = { report: Report; sun: SunResult; floor: number };
type Day = { y: number; m: number; d: number };
type Mode = "shadows" | "hours";

/** Area around the address that gets shadows and sun hours, metres either side (the buildings reach 250 m). */
const HALF = 250;
const CELL = 1;

const DAYS: [string, (y: number) => Day][] = [
  ["Dec 21", (y) => ({ y, m: 11, d: 21 })],
  ["Mar 20", (y) => ({ y, m: 2, d: 20 })],
  ["Jun 21", (y) => ({ y, m: 5, d: 21 })],
];

const WORDS: Record<string, string> = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };

type SkyPath = { path: [number, number][]; hours: { h: number; az: number; alt: number }[] };
type Label = { text: string; az: number; alt: number; r?: number; kind: "compass" | "hour" };

/** A view that has the sun ahead and a little to the right, with the shadows falling towards the viewer. */
const facing = (azimuth: number) => (((azimuth - 30 + 540) % 360) - 180);

const pad = (n: number) => String(n).padStart(2, "0");
const fmtMin = (min: number) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad(Math.round(min % 60) % 60)}`;
const iso = (d: Day) => `${d.y}-${pad(d.m + 1)}-${pad(d.d)}`;

function today(tz: string | undefined, lon: number): { day: Day; minutes: number } {
  const now = Date.now();
  const local = new Date(now + utcOffset(tz, now, lon));
  return { day: { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() }, minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** Sun-hours shares to an RGBA image, north at the top. */
function paint(grid: HeightGrid, hours: Float32Array, max: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = grid.w;
  canvas.height = grid.h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(grid.w, grid.h);
  for (let j = 0; j < grid.h; j++)
    for (let i = 0; i < grid.w; i++) {
      const [r, g, b] = rampColor(max ? hours[j * grid.w + i] / max : 0);
      const o = ((grid.h - 1 - j) * grid.w + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export default function Shadow3D({ report, sun, floor }: Props) {
  const { lat, lon } = report.place;
  const tz = report.timeZone;
  const start = useMemo(() => {
    const t = today(tz, lon);
    // Open on the current time while the sun is well up; otherwise early afternoon.
    const up = sunPosition(zonedTime(t.day.y, t.day.m, t.day.d, t.minutes, tz, lon), lat, lon).altitude >= 10;
    const minutes = up ? t.minutes : 13 * 60;
    const { azimuth } = sunPosition(zonedTime(t.day.y, t.day.m, t.day.d, minutes, tz, lon), lat, lon);
    return { day: t.day, minutes, bearing: facing(azimuth) };
  }, [tz, lon, lat]);
  const [day, setDay] = useState<Day>(start.day);
  const [minutes, setMinutes] = useState(start.minutes);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<Mode>("shadows");
  const [hours, setHours] = useState<{ key: string; data: Float32Array; ms: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sceneRef = useRef<ShadowScene | null>(null);
  const [ready, setReady] = useState(false);

  // Sunrise and sunset in local clock minutes, for the slider.
  const daylight = useMemo(() => {
    const up = daySamples(day.y, day.m, day.d, lat, lon, 5).filter((s) => s.altitude > HORIZON_ALT);
    if (!up.length) return null;
    const local = (t: number) => (t - Date.UTC(day.y, day.m, day.d) + utcOffset(tz, t, lon)) / 60_000;
    return { rise: local(up[0].t), set: local(up[up.length - 1].t), hours: (up.length * 5) / 60 };
  }, [day, lat, lon, tz]);
  const terrain = useMemo(() => (report.terrain ? terrainHorizon(report.terrain, 0) : null), [report.terrain]);

  const at = useMemo(() => sunPosition(zonedTime(day.y, day.m, day.d, minutes, tz, lon), lat, lon), [day, minutes, tz, lat, lon]);
  const bin = Math.floor(at.azimuth) % 360;
  const behindHills = !!terrain && at.altitude > 0 && at.altitude <= terrain[bin];
  const lit = at.altitude > 0 && !behindHills;
  const windowLit = at.altitude > HORIZON_ALT && at.altitude > sun.horizon[bin];

  // The day's path across the sky, and where the sun stands at each full hour of the local clock.
  const sky = useMemo<SkyPath>(
    () => ({
      path: daySamples(day.y, day.m, day.d, lat, lon, 10).map((s) => [s.azimuth, s.altitude]),
      hours: Array.from({ length: 24 }, (_, h) => {
        const p = sunPosition(zonedTime(day.y, day.m, day.d, h * 60, tz, lon), lat, lon);
        return { h, az: p.azimuth, alt: p.altitude };
      }),
    }),
    [day, lat, lon, tz],
  );
  const labels = useMemo<Label[]>(
    () => [
      ...["N", "E", "S", "W"].map((text, i): Label => ({ text, az: i * 90, alt: 0, r: COMPASS_RADIUS + 15, kind: "compass" })),
      ...(mode === "shadows" ? sky.hours.filter((p) => p.h % 2 === 0 && p.alt > 1) : []).map((p): Label => ({ text: `${p.h}:00`, az: p.az, alt: p.alt, kind: "hour" })),
    ],
    [sky, mode],
  );

  // The map and the 3D scene, once.
  useEffect(() => {
    const map = new MapLibreMap({
      container: el.current!,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [lon, lat],
      // A little wider on phones, so the sun and its path fit.
      zoom: el.current!.clientWidth < 500 ? 16.2 : 16.6,
      pitch: 58,
      bearing: start.bearing,
      maxPitch: 80,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new FullscreenControl({ container: wrap.current! }), "top-right");
    const scene = createShadowScene({ lat, lon }, report.buildings, report.skyline?.own?.id ?? null, HALF);
    map.on("load", () => {
      map.addLayer(scene.layer);
      setReady(true);
    });
    map.on("error", (e) => console.warn("[proplens] 3D map", e.error));
    mapRef.current = map;
    sceneRef.current = scene;
    return () => {
      map.remove();
      scene.dispose();
      mapRef.current = null;
      sceneRef.current = null;
    };
  }, [lat, lon, report.buildings, report.skyline, start.bearing]);

  useEffect(() => {
    if (ready) sceneRef.current?.setSun(at.azimuth, at.altitude, lit);
  }, [ready, at, lit]);
  useEffect(() => {
    if (ready) sceneRef.current?.setSunPath(sky.path, sky.hours.map((p) => [p.az, p.alt]));
  }, [ready, sky]);
  useEffect(() => {
    if (ready) sceneRef.current?.setSunMarkers(mode === "shadows");
  }, [ready, mode]);

  // HTML labels pinned to points of the 3D scene: compass letters, hours along the path, the time at the sun.
  const labelEls = useRef<(HTMLSpanElement | null)[]>([]);
  const sunLabel = useRef<HTMLSpanElement>(null);
  const sunAt = useRef({ az: 0, alt: 0, show: false });
  useEffect(() => {
    sunAt.current = { az: at.azimuth, alt: at.altitude, show: mode === "shadows" && at.altitude > 0 };
    mapRef.current?.triggerRepaint();
  }, [at, mode]);
  useEffect(() => {
    const map = mapRef.current;
    const scene = sceneRef.current;
    if (!ready || !map || !scene) return;
    const put = (el: HTMLElement | null, p: { x: number; y: number } | null) => {
      if (!el) return;
      el.style.visibility = p ? "visible" : "hidden";
      if (p) el.style.left = `${p.x}px`;
      if (p) el.style.top = `${p.y}px`;
    };
    const place = () => {
      // Hour labels give way to the sun, its time and each other where the path runs towards the viewer.
      const taken: { x: number; y: number }[] = [];
      const s = sunAt.current;
      const at = s.show ? scene.project(s.az, s.alt) : null;
      put(sunLabel.current, at);
      if (at) taken.push(at, { x: at.x + 44, y: at.y });
      labels.forEach((l, i) => {
        let p = scene.project(l.az, l.alt, l.r);
        if (p && l.kind === "hour") {
          const box = { x: p.x, y: p.y - 18 };
          if (taken.some((t) => Math.abs(t.x - box.x) < 44 && Math.abs(t.y - box.y) < 20)) p = null;
          else taken.push(box);
        }
        put(labelEls.current[i], p);
      });
    };
    map.on("render", place);
    map.triggerRepaint();
    return () => {
      map.off("render", place);
    };
  }, [ready, labels]);

  // Play: a day in about ten seconds.
  useEffect(() => {
    if (!playing || !daylight) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setMinutes((m) => {
        const next = m + dt * 0.12;
        return next > daylight.set + 20 ? daylight.rise - 20 : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, daylight]);

  // Sun hours for the whole day, traced by the WebAssembly kernel in a worker.
  const grid = useMemo(() => rasterize(report.buildings, HALF, CELL), [report.buildings]);
  const key = `${iso(day)}|${report.buildings.length}`;
  useEffect(() => {
    if (mode !== "hours" || hours?.key === key) return;
    const worker = new Worker(new URL("../lib/sunhours.worker.ts", import.meta.url), { type: "module" });
    const suns = sunSamples(day.y, day.m, day.d, lat, lon, terrain);
    worker.onmessage = (ev: MessageEvent<SunHoursResponse>) => {
      if ("error" in ev.data) setFailed(ev.data.error);
      else setHours({ key, data: ev.data.hours, ms: ev.data.ms });
      worker.terminate();
    };
    setFailed(null);
    worker.postMessage({ id: 1, grid, suns } satisfies SunHoursRequest);
    return () => worker.terminate();
  }, [mode, key, hours?.key, grid, day, lat, lon, terrain]);

  const max = daylight?.hours ?? 1;
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    if (mode !== "hours" || !hours || hours.key !== key) {
      scene.setHeatmap(null);
      scene.setRoofColors(null);
      return;
    }
    scene.setHeatmap(paint(grid, hours.data, max));
    // Roofs take the average of the grid cells at their height inside their bounding box.
    const roofs = new Map<number, string>();
    for (const b of report.buildings) {
      const xs = b.ring.map((p) => p.x);
      const ys = b.ring.map((p) => p.y);
      const i0 = Math.max(0, Math.floor((Math.min(...xs) + grid.half) / grid.cell));
      const i1 = Math.min(grid.w - 1, Math.floor((Math.max(...xs) + grid.half) / grid.cell));
      const j0 = Math.max(0, Math.floor((Math.min(...ys) + grid.half) / grid.cell));
      const j1 = Math.min(grid.h - 1, Math.floor((Math.max(...ys) + grid.half) / grid.cell));
      let sum = 0;
      let n = 0;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * grid.w + i;
          if (grid.heights[k] !== b.height) continue;
          sum += hours.data[k];
          n++;
        }
      if (!n) continue;
      const [r, g, bl] = rampColor(sum / n / max);
      roofs.set(b.id, `rgb(${r}, ${g}, ${bl})`);
    }
    scene.setRoofColors(roofs);
  }, [ready, mode, hours, key, grid, max, report.buildings]);

  // Click for the hours at a spot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== "hours" || !hours) return;
    const proj = makeProjection({ lat, lon });
    let popup: Popup | null = null;
    const onClick = (e: { lngLat: { lat: number; lng: number } }) => {
      const p = proj.toXY(e.lngLat.lat, e.lngLat.lng);
      const h = hoursAt(grid, hours.data, p.x, p.y);
      popup?.remove();
      popup = new Popup({ closeButton: false, className: "pl-popup" })
        .setLngLat(e.lngLat)
        .setHTML(h == null ? "Outside the computed area" : `<b>${h.toFixed(1)} h</b> of direct sun on ${new Date(Date.UTC(day.y, day.m, day.d)).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}`)
        .addTo(map);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      popup?.remove();
    };
  }, [mode, hours, grid, day, lat, lon]);

  const computing = mode === "hours" && hours?.key !== key && !failed;
  const lo = daylight ? Math.floor(daylight.rise - 20) : 0;
  const hi = daylight ? Math.ceil(daylight.set + 20) : 1440;

  return (
    <div ref={wrap} className="relative overflow-hidden rounded-3xl border border-line bg-wash [&:fullscreen]:rounded-none">
      <div ref={el} className="h-[520px] w-full sm:h-[600px] [:fullscreen_&]:h-dvh" aria-label="3D map of the buildings and their shadows" role="region" />

      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
        {labels.map((l, i) => (
          <span
            key={`${l.kind}-${l.text}`}
            ref={(e) => {
              labelEls.current[i] = e;
            }}
            className={
              l.kind === "compass"
                ? "invisible absolute -translate-x-1/2 -translate-y-1/2 font-display text-[13px] font-bold text-ink [text-shadow:0_0_3px_#fff,0_0_6px_#fff]"
                : "invisible absolute -translate-x-1/2 -translate-y-[160%] rounded-full bg-card/85 px-1.5 text-[10px] font-semibold leading-4 text-[#b45309] tabular shadow-sm"
            }
          >
            {l.text}
          </span>
        ))}
        <span ref={sunLabel} className="invisible absolute translate-x-5 -translate-y-1/2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-lime tabular shadow">
          {fmtMin(minutes)}
        </span>
      </div>

      <div className="absolute left-3 top-3 z-[2] flex flex-wrap items-center gap-2">
        <div className="rounded-full bg-card/95 p-0.5 shadow-sm backdrop-blur">
          <Segmented value={mode} onChange={setMode} options={[["shadows", "Shadows"], ["hours", "Sun hours"]]} label="View" />
        </div>
        {mode === "hours" && (computing || hours?.key === key) && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-[12px] font-medium text-ink-2 shadow-sm backdrop-blur">
            {computing ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Cpu className="size-3.5" aria-hidden />}
            {computing ? "Tracing the sun…" : `${(grid.w * grid.h / 1000).toFixed(0)}k points traced in ${Math.round(hours!.ms)} ms (WebAssembly)`}
          </span>
        )}
      </div>

      {mode === "shadows" && (
        <SkyDial
          map={ready ? mapRef.current : null}
          path={sky.path}
          azimuth={at.azimuth}
          altitude={at.altitude}
          lit={lit}
          behindHills={behindHills}
        />
      )}

      <div className="absolute inset-x-3 bottom-3 z-[2] rounded-3xl bg-card/95 p-3 shadow-[0_12px_40px_-12px_rgb(16_20_15/0.35)] backdrop-blur sm:inset-x-auto sm:left-3 sm:w-[min(560px,calc(100%-24px))] sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {DAYS.map(([label, make]) => {
            const d = make(day.y);
            const on = d.m === day.m && d.d === day.d;
            return (
              <button key={label} onClick={() => setDay(d)} className={`rounded-full border px-3 py-1 text-[13px] font-medium transition ${on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-ink/30"}`}>
                {label}
              </button>
            );
          })}
          <input
            type="date"
            value={iso(day)}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split("-").map(Number);
              if (y && m && d) setDay({ y, m: m - 1, d });
            }}
            className="h-8 rounded-full border border-line bg-card px-3 text-[13px] text-ink"
            aria-label="Date"
          />
        </div>

        {mode === "shadows" ? (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-forest"
              aria-label={playing ? "Pause" : "Play the day"}
            >
              {playing ? <Pause className="size-4 text-lime" aria-hidden /> : <Play className="size-4 text-lime" aria-hidden />}
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={lo}
                max={hi}
                step={5}
                value={Math.min(hi, Math.max(lo, minutes))}
                onChange={(e) => {
                  setPlaying(false);
                  setMinutes(Number(e.target.value));
                }}
                className="w-full accent-ink"
                aria-label="Time of day"
                aria-valuetext={fmtMin(minutes)}
              />
              <div className="flex justify-between text-[11px] text-muted tabular">
                <span>{daylight ? `Sunrise ${fmtMin(daylight.rise)}` : "No sunrise"}</span>
                <span>{daylight ? `Sunset ${fmtMin(daylight.set)}` : ""}</span>
              </div>
            </div>
            <div className="w-[92px] shrink-0 text-right">
              <div className="font-display text-[22px] font-bold leading-none tabular">{fmtMin(minutes)}</div>
              <div className="mt-1 text-[11px] leading-tight text-muted">
                {at.altitude > 0 ? `${Math.round(at.altitude)}° high, ${compassLabel(at.azimuth)}` : "Sun down"}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="h-2.5 rounded-full" style={{ background: RAMP_CSS }} aria-hidden />
            <div className="mt-1 flex justify-between text-[11px] text-muted tabular">
              <span>0 h</span>
              <span>Hours of direct sun on this day · click the map for a spot</span>
              <span>{max.toFixed(1)} h</span>
            </div>
            {failed && <p className="mt-1 text-[12px] font-medium text-critical">Couldn't compute sun hours: {failed}</p>}
          </div>
        )}

        {mode === "shadows" && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
            {windowLit ? <Sun className="size-3.5 text-sun" aria-hidden /> : <SunDim className="size-3.5" aria-hidden />}
            {at.altitude <= 0
              ? "Night: the sun is below the horizon."
              : behindHills
                ? "The sun is behind the hills: everything here is in their shadow."
                : `${floor === 0 ? "The ground floor" : `Floor ${floor}`} of your building is ${windowLit ? "in the sun" : "in the shade"} now.`}
          </p>
        )}
      </div>
    </div>
  );
}

type DialProps = { map: MapLibreMap | null; path: [number, number][]; azimuth: number; altitude: number; lit: boolean; behindHills: boolean };

/**
 * The sky seen from above, turned with the map: the rim is the horizon, the centre straight overhead. Shows the
 * day's path and where the sun stands, so its direction reads the same as on the map.
 */
function SkyDial({ map, path, azimuth, altitude, lit, behindHills }: DialProps) {
  const [bearing, setBearing] = useState(() => map?.getBearing() ?? 0);
  useEffect(() => {
    if (!map) return;
    const on = () => setBearing(map.getBearing());
    on();
    map.on("rotate", on);
    return () => {
      map.off("rotate", on);
    };
  }, [map]);

  const R = 40;
  const pt = (az: number, alt: number, r = R * (1 - Math.max(0, alt) / 90)) => {
    const a = ((az - bearing) * Math.PI) / 180;
    return [Math.sin(a) * r, -Math.cos(a) * r] as const;
  };
  const above = path.filter(([, alt]) => alt > 0);
  const line = above.map(([az, alt]) => pt(az, alt).map((v) => v.toFixed(1)).join(",")).join(" ");
  const up = altitude > 0;
  const [sx, sy] = pt(azimuth, altitude);
  const [ex, ey] = pt(azimuth, 0, R + 4);
  const word = WORDS[compassLabel(azimuth)];

  const face = () => map?.easeTo({ bearing: facing(azimuth), duration: 900 });

  // On phones only the dial shows (tap it to face the sun); the words stay for screen readers.
  return (
    <div className="absolute left-3 top-14 z-[2] flex items-center gap-3 rounded-3xl bg-card/95 p-1.5 shadow-sm backdrop-blur sm:py-2 sm:pl-2 sm:pr-4">
      <button onClick={face} disabled={!up} tabIndex={-1} aria-hidden title="Face the sun" className="shrink-0 rounded-full enabled:cursor-pointer">
        <svg viewBox="-52 -52 104 104" className="size-[60px] sm:size-[76px]">
          <circle r={R} className="fill-wash stroke-line" strokeWidth={1.5} />
          {[30, 60].map((alt) => (
            <circle key={alt} r={R * (1 - alt / 90)} fill="none" className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
          ))}
          {["N", "E", "S", "W"].map((t, i) => {
            const [x, y] = pt(i * 90, 0, R + 7.5);
            return (
              <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="central" className={t === "N" ? "fill-ink" : "fill-muted"} fontSize={t === "N" ? 11 : 9} fontWeight={700}>
                {t}
              </text>
            );
          })}
          {line && <polyline points={line} fill="none" stroke="#f59e0b" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />}
          {up && (
            <>
              <line x1={0} y1={0} x2={ex} y2={ey} stroke="#f59e0b" strokeWidth={2} strokeDasharray={lit ? undefined : "3 3"} />
              <circle cx={sx} cy={sy} r={9} fill="#ffd23f" opacity={0.35} />
              <circle cx={sx} cy={sy} r={5.5} fill={lit ? "#ffd23f" : "#d9c48a"} stroke="#f59e0b" strokeWidth={1.5} />
            </>
          )}
          <circle r={2.5} className="fill-ink" />
        </svg>
      </button>
      <div className="sr-only text-[12px] leading-snug sm:not-sr-only">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Sun now</div>
        {up ? (
          <>
            <div className="font-semibold text-ink">From the {word}</div>
            <div className="text-ink-2 tabular">
              {Math.round(azimuth)}° · {Math.round(altitude)}° high
            </div>
            {behindHills && <div className="text-ink-2">behind the hills</div>}
            <button onClick={face} className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-forest underline-offset-2 hover:underline">
              <Compass className="size-3.5" aria-hidden />
              Face the sun
            </button>
          </>
        ) : (
          <div className="font-semibold text-ink">Below the horizon</div>
        )}
      </div>
    </div>
  );
}
