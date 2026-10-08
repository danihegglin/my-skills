import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyDay, KeyDayId, MonthSun, SunResult } from "../lib/sunlight";

/** Fixed categorical order: winter → slot 1 (blue), summer → slot 2 (orange), equinox → slot 3 (aqua). */
export const DAY_COLOR: Record<KeyDayId, string> = {
  winter: "#2a78d6",
  summer: "#eb6834",
  equinox: "#1baf7a",
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function fmtTime(ms: number, timeZone?: string): string {
  const key = timeZone ?? "local";
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    fmtCache.set(key, f);
  }
  return f.format(ms);
}

function hourOf(ms: number, timeZone?: string) {
  const [h, m] = fmtTime(ms, timeZone).split(":").map(Number);
  return { h, m };
}

type Tip = { x: number; y: number; title: string; lines: string[] };

/** Tracks an element's width so charts draw at true pixel size (text never scales). */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl bg-ink px-3 py-2 text-[12px] leading-snug text-white shadow-lg"
      style={{ left: tip.x, top: tip.y }}
    >
      <div className="font-semibold">{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l} className="text-white/75">
          {l}
        </div>
      ))}
    </div>
  );
}

/* ---------- sun path over the skyline ---------- */

const M = { l: 34, r: 10, t: 18, b: 30 };

export function SunPathChart({ sun, lat, timeZone }: { sun: SunResult; lat: number; timeZone?: string }) {
  const [wrap, W] = useWidth<HTMLDivElement>(640);
  const H = Math.round(Math.min(320, Math.max(220, W * 0.42)));
  const [tip, setTip] = useState<Tip | null>(null);
  const [cross, setCross] = useState<number | null>(null);
  const center = lat >= 0 ? 180 : 0;
  const SPAN = 150;
  const rel = (az: number) => ((az - center + 540) % 360) - 180;
  const maxAlt = Math.max(30, Math.ceil((Math.max(...sun.keyDays.flatMap((d) => d.samples.map((s) => s.altitude))) + 6) / 10) * 10);
  const x = (az: number) => M.l + ((rel(az) + SPAN) / (2 * SPAN)) * (W - M.l - M.r);
  const y = (alt: number) => M.t + (1 - Math.max(0, alt) / maxAlt) * (H - M.t - M.b);
  const base = y(0);

  const silhouettes = useMemo(() => {
    const area = (h: Float32Array | null) => {
      if (!h) return null;
      const pts: string[] = [`${M.l},${base}`];
      for (let r = -SPAN; r < SPAN; r++) {
        const az = (r + center + 360) % 360;
        const v = Math.min(maxAlt, h[Math.floor(az) % 360]);
        pts.push(`${x(az).toFixed(1)},${y(v).toFixed(1)}`, `${x(az + 1).toFixed(1)},${y(v).toFixed(1)}`);
      }
      pts.push(`${W - M.r},${base}`);
      return pts.join(" ");
    };
    return { buildings: area(sun.buildings), terrain: area(sun.terrain) };
  }, [sun, center, maxAlt, W, H]);

  const paths = useMemo(
    () =>
      sun.keyDays.map((d) => {
        const visible = d.samples.filter((s) => s.altitude > -1 && Math.abs(rel(s.azimuth)) <= SPAN);
        const segments: { lit: boolean; pts: string }[] = [];
        let cur: { lit: boolean; pts: string[] } | null = null;
        for (const s of visible) {
          const p = `${x(s.azimuth).toFixed(1)},${y(s.altitude).toFixed(1)}`;
          if (!cur || cur.lit !== s.lit) {
            if (cur) segments.push({ lit: cur.lit, pts: cur.pts.join(" ") });
            cur = { lit: s.lit, pts: cur ? [cur.pts[cur.pts.length - 1], p] : [p] };
          } else cur.pts.push(p);
        }
        if (cur) segments.push({ lit: cur.lit, pts: cur.pts.join(" ") });
        const hours = visible.filter((s) => s.altitude > 0 && hourOf(s.t, timeZone).m < 5);
        const peak = visible.reduce((a, b) => (b.altitude > a.altitude ? b : a), visible[0]);
        return { day: d, segments, hours, peak, visible };
      }),
    [sun, timeZone, center, maxAlt, W, H],
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * W;
    const sy = ((e.clientY - box.top) / box.height) * H;
    let best: { d: KeyDay; s: KeyDay["samples"][number]; dist: number } | null = null;
    for (const p of paths)
      for (const s of p.visible) {
        const dist = Math.hypot(x(s.azimuth) - sx, y(s.altitude) - sy);
        if (!best || dist < best.dist) best = { d: p.day, s, dist };
      }
    if (!best || best.dist > 40) {
      setTip(null);
      setCross(null);
      return;
    }
    const scale = box.width / W;
    const wrapBox = wrap.current!.getBoundingClientRect();
    setCross(x(best.s.azimuth));
    setTip({
      x: box.left - wrapBox.left + x(best.s.azimuth) * scale,
      y: box.top - wrapBox.top + y(best.s.altitude) * scale,
      title: `${best.d.label.split(" · ")[1]} · ${fmtTime(best.s.t, timeZone)}`,
      lines: [
        `Sun ${Math.max(0, best.s.altitude).toFixed(0)}° high, ${Math.round(best.s.azimuth)}° bearing`,
        best.s.altitude <= 0 ? "Below the horizon" : best.s.lit ? "Direct sun reaches you" : "Hidden behind the skyline",
      ],
    });
  }

  const compass = [
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
    [0, "N"],
    [45, "NE"],
  ].filter(([az]) => Math.abs(rel(az as number)) <= SPAN) as [number, string][];

  return (
    <div ref={wrap} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`Sun paths on ${sun.keyDays.map((d) => `${d.label}: ${d.direct.toFixed(1)} hours of direct sun`).join("; ")}`}
        onPointerMove={onMove}
        onPointerLeave={() => {
          setTip(null);
          setCross(null);
        }}
      >
        {[0, 20, 40, 60, 80].filter((a) => a <= maxAlt).map((a) => (
          <g key={a}>
            <line x1={M.l} x2={W - M.r} y1={y(a)} y2={y(a)} stroke="var(--color-line)" />
            <text x={M.l - 8} y={y(a)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-muted)" className="tabular">
              {a}°
            </text>
          </g>
        ))}
        {silhouettes.terrain && <polygon points={silhouettes.terrain} fill="#c9cdc0" />}
        {silhouettes.buildings && <polygon points={silhouettes.buildings} fill="#3d4a40" />}
        <line x1={M.l} x2={W - M.r} y1={base} y2={base} stroke="#3d4a40" />
        {compass.map(([az, label]) => (
          <text key={label} x={x(az)} y={H - 8} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-ink-2)">
            {label}
          </text>
        ))}
        {cross != null && <line x1={cross} x2={cross} y1={M.t} y2={base} stroke="var(--color-ink)" strokeOpacity="0.25" />}
        {paths.map(({ day, segments, hours, peak }) => (
          <g key={day.id}>
            {segments.map((seg, i) => (
              <polyline
                key={i}
                points={seg.pts}
                fill="none"
                stroke={DAY_COLOR[day.id]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeOpacity={seg.lit ? 1 : 0.45}
                strokeDasharray={seg.lit ? undefined : "2 5"}
              />
            ))}
            {hours.map((s) => (
              <circle key={s.t} cx={x(s.azimuth)} cy={y(s.altitude)} r={3.5} fill={s.lit ? DAY_COLOR[day.id] : "white"} stroke={s.lit ? "white" : DAY_COLOR[day.id]} strokeWidth={s.lit ? 2 : 1.5} />
            ))}
            {peak && (
              <text x={x(peak.azimuth)} y={y(peak.altitude) - 10} textAnchor="middle" fontSize="11.5" fontWeight={600} fill="var(--color-ink)" paintOrder="stroke" stroke="white" strokeWidth={4}>
                {day.label.split(" · ")[1]}
              </text>
            )}
          </g>
        ))}
      </svg>
      <Tooltip tip={tip} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
        {sun.keyDays.map((d) => (
          <span key={d.id} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: DAY_COLOR[d.id] }} aria-hidden />
            {d.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="1" x2="15" y1="2" y2="2" stroke="var(--color-ink-2)" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
          </svg>
          Sun hidden
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-[#3d4a40]" aria-hidden /> Buildings
        </span>
        {sun.terrain && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] bg-[#c9cdc0]" aria-hidden /> Terrain
          </span>
        )}
        <span className="text-muted">Dots mark full hours</span>
      </div>
    </div>
  );
}

/* ---------- monthly direct sun ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MH = 210;
const MM = { l: 30, r: 6, t: 22, b: 26 };

export function MonthlySunChart({ months, climate }: { months: MonthSun[]; climate: number[] | null }) {
  const [wrap, MW] = useWidth<HTMLDivElement>(640);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.ceil(Math.max(...months.map((m) => m.daylight)) / 4) * 4;
  const band = (MW - MM.l - MM.r) / 12;
  const bw = Math.min(24, band * 0.55);
  const y = (h: number) => MM.t + (1 - h / max) * (MH - MM.t - MM.b);
  const base = y(0);
  const minI = months.reduce((a, m, i) => (m.direct < months[a].direct ? i : a), 0);
  const maxI = months.reduce((a, m, i) => (m.direct > months[a].direct ? i : a), 0);

  const bar = (h: number, cx: number) => {
    const top = y(h);
    const r = Math.min(4, (base - top) / 2);
    const x0 = cx - bw / 2;
    if (base - top < 0.5) return "";
    return `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`;
  };

  function show(i: number, e: React.PointerEvent) {
    const box = wrap.current!.getBoundingClientRect();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    const scale = svg.width / MW;
    const m = months[i];
    setHover(i);
    setTip({
      x: svg.left - box.left + (MM.l + band * (i + 0.5)) * scale,
      y: svg.top - box.top + y(m.daylight) * scale,
      title: MONTHS[i],
      lines: [
        `${m.direct.toFixed(1)} h direct sun per day`,
        `${m.daylight.toFixed(1)} h of daylight`,
        ...(climate ? [`≈ ${(climate[i] * (m.daylight ? m.direct / m.daylight : 0)).toFixed(1)} h with typical clouds`] : []),
      ],
    });
  }

  return (
    <div ref={wrap} className="relative">
      <svg viewBox={`0 0 ${MW} ${MH}`} className="w-full select-none" role="img" aria-label={`Direct sun per day by month: ${months.map((m, i) => `${MONTHS[i]} ${m.direct.toFixed(1)} h`).join(", ")}`} onPointerLeave={() => { setTip(null); setHover(null); }}>
        {Array.from({ length: max / 4 + 1 }, (_, i) => i * 4).map((h) => (
          <g key={h}>
            <line x1={MM.l} x2={MW - MM.r} y1={y(h)} y2={y(h)} stroke="var(--color-line)" />
            <text x={MM.l - 8} y={y(h)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-muted)" className="tabular">
              {h}h
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = MM.l + band * (i + 0.5);
          return (
            <g key={i} onPointerEnter={(e) => show(i, e)} onPointerMove={(e) => show(i, e)}>
              <rect x={cx - band / 2} y={MM.t} width={band} height={base - MM.t} fill={hover === i ? "rgb(16 20 15 / 0.04)" : "transparent"} />
              <path d={bar(m.daylight, cx)} fill="var(--color-wash)" />
              <path d={bar(m.direct, cx)} fill="var(--color-sun)" />
              {(i === minI || i === maxI) && (
                <text x={cx} y={y(m.direct) - 6} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-ink)" className="tabular">
                  {m.direct.toFixed(1)}
                </text>
              )}
              <text x={cx} y={MH - 8} textAnchor="middle" fontSize="11" fill="var(--color-ink-2)">
                {MONTHS[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-sun" aria-hidden /> Direct sun at this height
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-wash" aria-hidden /> Daylight
        </span>
        <span className="text-muted">Hours per day, mid-month, clear sky</span>
      </div>
    </div>
  );
}

/* ---------- façade table ---------- */

export function FacadeTable({ sun }: { sun: SunResult }) {
  const max = Math.max(1, ...sun.facades.flatMap((f) => Object.values(f.hours)));
  const cols = sun.keyDays;
  return (
    <div className="overflow-hidden rounded-3xl border border-line">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="bg-paper text-left text-[12px] text-muted">
            <th className="px-4 py-2.5 font-medium">Window facing</th>
            {cols.map((d) => (
              <th key={d.id} className="px-2 py-2.5 text-center font-medium">
                {d.label.split(" · ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sun.facades.map((f) => (
            <tr key={f.facing} className="border-t border-line">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                {f.facing}
              </th>
              {cols.map((d) => {
                const h = f.hours[d.id];
                return (
                  <td key={d.id} className="p-1">
                    <div
                      className="rounded-xl py-1.5 text-center font-medium tabular"
                      style={{ background: `color-mix(in oklab, var(--color-sun) ${Math.round((h / max) * 62)}%, var(--color-paper))` }}
                    >
                      {h < 0.05 ? "–" : `${h.toFixed(1)} h`}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
