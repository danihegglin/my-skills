import L from "leaflet";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, Check, Crosshair, GraduationCap, House, LoaderCircle, Map as MapIcon, Plane, RotateCcw, ShoppingBasket, Sun, Volume2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Popup, Rectangle, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { AreaRef } from "../lib/area";
import { KIND_LABEL } from "../lib/area";
import type { AreaHome, HomeKind } from "../lib/areaScore";
import { AREA_FLOOR } from "../lib/areaScore";
import type { LatLon } from "../lib/geo";
import { haversine, walkMinutes } from "../lib/geo";
import type { Place } from "../lib/geocode";
import type { AreaRanking, AreaStepId } from "../lib/useAreaRanking";
import { AREA_STEP_LABELS, useAreaRanking } from "../lib/useAreaRanking";
import AlertSignup from "./AlertSignup";
import AreaSearch from "./AreaSearch";
import Logo from "./Logo";
import { BaseMap } from "./MapPanel";
import { Segmented } from "./form";
import { Badge, ScoreRing, TONE_COLOR, TONE_HEX, scoreTone, scoreWord } from "./ui";

type Props = {
  area: AreaRef;
  focus?: LatLon;
  onArea: (area: AreaRef, focus?: LatLon) => void;
  onOpen: (place: Place) => void;
  onHome: () => void;
};

type SortId = "score" | "noise" | "sun" | "schools" | "shopping";
type KindFilter = "all" | HomeKind;

const SORTS: [SortId, string][] = [
  ["score", "Overall"],
  ["noise", "Quiet"],
  ["sun", "Sun"],
  ["schools", "Schools"],
  ["shopping", "Shops"],
];

const sortScore = (h: AreaHome, by: SortId) => (by === "score" ? h.score : h.scores[by]);
const PAGE = 25;

export default function AreaView({ area, focus, onArea, onOpen, onHome }: Props) {
  const [attempt, setAttempt] = useState(0);
  const { steps, progress, ranking, error } = useAreaRanking(area, focus, attempt);
  const [sort, setSort] = useState<SortId>("score");
  const [kind, setKind] = useState<KindFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<number | null>(null);

  const homes = useMemo(() => {
    if (!ranking) return [];
    const list = ranking.homes.filter((h) => kind === "all" || h.kind === kind);
    return sort === "score" ? list : [...list].sort((a, b) => sortScore(b, sort) - sortScore(a, sort) || b.score - a.score);
  }, [ranking, sort, kind]);

  useEffect(() => setShown(PAGE), [sort, kind, area.id]);

  const open = (h: AreaHome) =>
    onOpen({
      id: `area${h.id}`,
      lat: h.lat,
      lon: h.lon,
      title: h.address,
      subtitle: [[h.postcode, h.city].filter(Boolean).join(" ") || area.label, area.kind === "postcode" || area.kind === "municipality" ? "Switzerland" : ""].filter(Boolean).join(", "),
      countryCode: area.kind === "postcode" || area.kind === "municipality" ? "CH" : undefined,
    });

  const done = ranking != null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-[1000] border-b border-line bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
          <Logo onClick={onHome} compact />
          <div className="ml-auto min-w-0 max-w-md flex-1">
            <AreaSearch onSelect={(a) => onArea(a)} size="sm" placeholder="Rank another postcode or town" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <section className="flex flex-col gap-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 animate-rise">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
              <MapIcon className="size-4" aria-hidden /> Area ranking · {KIND_LABEL[area.kind]}
            </p>
            <h1 className="mt-2 font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] text-balance sm:text-[52px]">
              Best addresses in {area.label}
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
              Every residential address scored for noise, schools, shopping and sunlight, with the same models as a full report. Open any address for
              the details and a price estimate.
            </p>
          </div>
          <Summary ranking={ranking} />
        </section>

        {ranking?.clipped && <ClippedNote area={area} />}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <aside className="h-[52vh] min-h-[320px] lg:sticky lg:top-[84px] lg:h-[calc(100dvh-108px)]">
            <AreaMap ranking={ranking} homes={homes} sort={sort} selected={selected} onSelect={setSelected} onOpen={open} onRecentre={(c) => onArea(area, c)} />
          </aside>

          <div className="min-w-0 space-y-6">
            {error ? (
              <Failure message={error} onRetry={() => setAttempt((a) => a + 1)} />
            ) : !done ? (
              <Progress steps={steps} progress={progress} />
            ) : !ranking.homes.length ? (
              <Empty area={area} />
            ) : (
              <section className="rounded-[28px] border border-line bg-card p-4 animate-rise sm:p-6" aria-label="Ranked addresses">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-[24px] font-bold tracking-tight">Top addresses</h2>
                  <Segmented value={kind} onChange={setKind} options={[["all", "All"], ["flats", "Flats"], ["house", "Houses"]]} label="Building type" />
                </div>
                <div className="mt-3 overflow-x-auto pb-1">
                  <Segmented value={sort} onChange={setSort} options={SORTS} label="Rank by" />
                </div>
                {steps.official === "pending" && (
                  <p className="mt-3 flex items-center gap-2 text-[13px] text-muted" aria-live="polite">
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Checking the leaders against official Swiss noise maps…
                  </p>
                )}
                <ol className="mt-4 divide-y divide-line">
                  {homes.slice(0, shown).map((h, i) => (
                    <HomeRow key={h.id} home={h} rank={i + 1} sort={sort} selected={selected === h.id} onSelect={() => setSelected(h.id)} onOpen={() => open(h)} />
                  ))}
                </ol>
                {homes.length > shown && (
                  <button onClick={() => setShown((s) => s + PAGE)} className="mt-3 w-full rounded-2xl bg-paper py-3 text-[14px] font-medium text-ink-2 transition hover:bg-wash hover:text-ink">
                    Show {Math.min(PAGE, homes.length - shown)} more of {homes.length.toLocaleString("en")}
                  </button>
                )}
                <p className="mt-4 text-[12px] leading-relaxed text-muted">
                  Scores are for the address, with sunlight at floor {AREA_FLOOR} and buildings only (the full report adds hills and mountains).
                  {ranking.refined && " Addresses marked Official use the federal road, rail and aircraft noise maps, like a full report."}
                </p>
              </section>
            )}
            {done && ranking.homes.length > 0 && <AlertSignup areas={[area]} ranking={ranking} focus={focus} />}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- summary ---------- */

function Summary({ ranking }: { ranking: AreaRanking | null }) {
  const homes = ranking?.homes ?? [];
  const sorted = homes.map((h) => h.score).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const buckets = [0, 20, 40, 60, 80].map((lo) => homes.filter((h) => h.score >= lo && h.score < lo + 20 + (lo === 80 ? 1 : 0)).length);
  const max = Math.max(1, ...buckets);
  return (
    <div className="flex shrink-0 items-center gap-5 rounded-[28px] border border-line bg-card p-4 pr-5 animate-rise [animation-delay:80ms]">
      {ranking ? <ScoreRing score={homes[0]?.score ?? null} size={84} stroke={8} label="Best score" /> : (
        <div className="grid size-[84px] place-items-center rounded-full border-[8px] border-wash">
          <LoaderCircle className="size-6 animate-spin text-muted" aria-label="Ranking" />
        </div>
      )}
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Best score</div>
        <div className="font-display text-[22px] font-bold leading-tight">{ranking ? `${homes.length.toLocaleString("en")} addresses` : "Ranking…"}</div>
        <div className="text-[13px] text-ink-2 tabular">{median != null ? `Median ${median} · ${buckets[4].toLocaleString("en")} excellent (80+)` : "Scoring every address"}</div>
      </div>
      {ranking && homes.length > 0 && (
        <div className="hidden h-14 items-end gap-1 sm:flex" aria-label="Score distribution" role="img">
          {buckets.map((n, i) => (
            <span key={i} className="w-3.5 rounded-t" style={{ height: `${8 + (48 * n) / max}px`, background: TONE_COLOR[scoreTone(i * 20 + 10)] }} title={`${i * 20}–${i * 20 + 19}: ${n}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClippedNote({ area }: { area: AreaRef }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-3xl border border-dashed border-line px-5 py-4 text-[14px] leading-relaxed text-ink-2">
      <Crosshair className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        {area.label} is larger than 3 × 3 km, so this ranks the dashed square of it. Move the map and press <b className="font-semibold text-ink">Rank here</b> to rank
        another part, or search for a postcode.
      </p>
    </div>
  );
}

/* ---------- list ---------- */

function Fact({ icon: Icon, children, tone }: { icon: LucideIcon; children: ReactNode; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon className="size-3.5 text-muted" style={tone ? { color: tone } : undefined} aria-hidden />
      {children}
    </span>
  );
}

function HomeRow({ home: h, rank, sort, selected, onSelect, onOpen }: { home: AreaHome; rank: number; sort: SortId; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const value = sortScore(h, sort);
  return (
    <li ref={ref} className={`-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition sm:gap-4 ${selected ? "bg-lime/25" : ""}`}>
      <span className="w-6 shrink-0 text-right font-display text-[14px] font-bold text-muted tabular">{rank}</span>
      <button onClick={onSelect} className="shrink-0" aria-label={`Show ${h.address} on the map`}>
        <ScoreRing score={value} size={46} stroke={5} label={sort === "score" ? "PropLens score" : `${SORTS.find(([id]) => id === sort)![1]} score`} />
      </button>
      <button onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[16px] font-semibold text-ink">{h.address}</span>
          {h.official && <Badge className="!bg-lime/50 !text-ink">Official noise</Badge>}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">
          {h.kindLabel}
          {h.levels ? ` · ${h.levels} ${h.levels === 1 ? "floor" : "floors"}` : ""}
          {sort !== "score" ? ` · overall ${h.score}` : ` · ${scoreWord(h.score)}`}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2 tabular">
          <Fact icon={Volume2}>{Math.round(h.noise.day)} dB</Fact>
          <Fact icon={Sun}>{h.winterSun.toFixed(1)} h winter sun</Fact>
          {h.supermarket != null && <Fact icon={ShoppingBasket}>{walkMinutes(h.supermarket)} min</Fact>}
          {h.school != null && <Fact icon={GraduationCap}>{walkMinutes(h.school)} min</Fact>}
          {(h.flyover === "direct" || h.flyover === "near") && (
            <Fact icon={Plane} tone={TONE_HEX[h.flyover === "direct" ? "serious" : "warning"]}>
              {h.flyover === "direct" ? "Direct flyover" : "Near flight path"}
            </Fact>
          )}
        </span>
      </button>
      <button onClick={onOpen} className="group hidden shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink transition hover:border-ink sm:inline-flex">
        Report <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </button>
      <button onClick={onOpen} className="grid size-9 shrink-0 place-items-center rounded-full border border-line sm:hidden" aria-label={`Open the report for ${h.address}`}>
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/* ---------- map ---------- */

const rankIcon = (n: number, score: number) =>
  L.divIcon({
    className: "pl-marker",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#10140f;color:#fff;font:700 12px/1 'Bricolage Grotesque Variable',sans-serif;border:2px solid ${TONE_HEX[scoreTone(score)]};box-shadow:0 2px 8px rgb(16 20 15/.3)">${n}</span>`,
  });

function AreaMap({
  ranking,
  homes,
  sort,
  selected,
  onSelect,
  onOpen,
  onRecentre,
}: {
  ranking: AreaRanking | null;
  homes: AreaHome[];
  sort: SortId;
  selected: number | null;
  onSelect: (id: number) => void;
  onOpen: (h: AreaHome) => void;
  onRecentre: (c: LatLon) => void;
}) {
  const rings = useMemo(() => ranking?.shape.rings?.map((r) => r.map((p) => [p.lat, p.lon] as [number, number])) ?? null, [ranking]);
  const sel = homes.find((h) => h.id === selected) ?? null;
  // Draw the leaders last so they sit on top.
  const dots = useMemo(() => [...homes].reverse(), [homes]);
  return (
    <div className="relative h-full overflow-hidden rounded-[28px] border border-line bg-wash">
      <MapContainer center={[47.38, 8.53]} zoom={14} zoomSnap={0.25} zoomControl={false} scrollWheelZoom preferCanvas className="size-full" maxZoom={19}>
        <BaseMap />
        {ranking && <Frame ranking={ranking} />}
        {rings && <Polygon positions={rings} pathOptions={{ color: "#10140f", weight: 2, opacity: 0.55, fillColor: "#d4f26a", fillOpacity: 0.06 }} interactive={false} />}
        {ranking?.clipped && (
          <Rectangle
            bounds={[[ranking.window.south, ranking.window.west], [ranking.window.north, ranking.window.east]]}
            pathOptions={{ color: "#10140f", weight: 1.5, dashArray: "6 6", fill: false }}
            interactive={false}
          />
        )}
        {dots.map((h) => (
          <CircleMarker
            key={h.id}
            center={[h.lat, h.lon]}
            radius={h.id === selected ? 8 : 5}
            pathOptions={{ color: "#ffffff", weight: 1, fillColor: TONE_HEX[scoreTone(sortScore(h, sort))], fillOpacity: 0.95 }}
            eventHandlers={{ click: () => onSelect(h.id) }}
          >
            <Tooltip className="pl-tip" direction="top" offset={[0, -6]}>
              <b>{h.address}</b> · {sortScore(h, sort)}
            </Tooltip>
          </CircleMarker>
        ))}
        {homes.slice(0, 10).map((h, i) => (
          <Marker key={`top${h.id}`} position={[h.lat, h.lon]} icon={rankIcon(i + 1, sortScore(h, sort))} eventHandlers={{ click: () => onSelect(h.id) }} zIndexOffset={1000 - i} />
        ))}
        {sel && (
          <Popup position={[sel.lat, sel.lon]} offset={[0, -4]} closeButton={false} autoPan>
            <div className="min-w-44">
              <div className="text-[14px] font-semibold text-ink">{sel.address}</div>
              <div className="text-[12px] text-muted">
                {sel.kindLabel} · score {sel.score}
              </div>
              <button onClick={() => onOpen(sel)} className="mt-2 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-white">
                Open report <ArrowRight className="size-3 text-lime" aria-hidden />
              </button>
            </div>
          </Popup>
        )}
        <FlyTo home={sel} />
        {ranking?.clipped && <RankHere window={ranking.window} onRecentre={onRecentre} />}
      </MapContainer>
      <Legend />
    </div>
  );
}

function Frame({ ranking }: { ranking: AreaRanking }) {
  const map = useMap();
  useEffect(() => {
    const w = ranking.window;
    map.fitBounds(L.latLngBounds([w.south, w.west], [w.north, w.east]), { padding: [16, 16] });
  }, [map, ranking.window]);
  return null;
}

function FlyTo({ home }: { home: AreaHome | null }) {
  const map = useMap();
  useEffect(() => {
    if (home) map.flyTo([home.lat, home.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [map, home]);
  return null;
}

function RankHere({ window, onRecentre }: { window: AreaRanking["window"]; onRecentre: (c: LatLon) => void }) {
  const [center, setCenter] = useState<LatLon | null>(null);
  useMapEvents({
    moveend: (e) => {
      const c = (e.target as L.Map).getCenter();
      setCenter({ lat: c.lat, lon: c.lng });
    },
  });
  const mid = { lat: (window.south + window.north) / 2, lon: (window.west + window.east) / 2 };
  if (!center || haversine(center, mid) < 600) return null;
  return (
    <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2">
      <button
        onClick={() => onRecentre(center)}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-white shadow-lg transition hover:bg-forest"
      >
        <Crosshair className="size-4 text-lime" aria-hidden /> Rank here
      </button>
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-3 right-3 z-[500] rounded-2xl border border-line bg-card/95 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      <div className="mb-1 font-medium text-ink-2">Score</div>
      <div className="flex gap-2.5">
        {(["80+", "60–79", "40–59", "20–39", "< 20"] as const).map((label, i) => (
          <span key={label} className="flex items-center gap-1 tabular text-ink-2">
            <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[scoreTone(90 - i * 20)] }} aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- states ---------- */

function Progress({ steps, progress }: { steps: Partial<Record<AreaStepId, string>>; progress: { done: number; total: number } | null }) {
  return (
    <div className="rounded-[28px] border border-line bg-card p-6 animate-rise sm:p-8" aria-live="polite">
      <h2 className="font-display text-[26px] font-bold tracking-tight">Scoring the whole area…</h2>
      <p className="mt-1 text-[15px] text-ink-2">Every building, street, school and shop, live from open data. Usually 20–90 seconds.</p>
      <ul className="mt-6 space-y-3">
        {(Object.keys(AREA_STEP_LABELS) as AreaStepId[])
          .filter((id) => steps[id] && steps[id] !== "skipped")
          .map((id) => {
            const s = steps[id];
            const counting = id === "scoring" && s === "pending" && progress && progress.total > 0;
            return (
              <li key={id} className="flex items-center gap-3 text-[15px]">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${s === "done" ? "bg-lime" : s === "failed" ? "bg-wash" : "bg-paper"}`}>
                  {s === "done" ? <Check className="size-4" aria-label="Done" /> : s === "failed" ? <X className="size-4 text-ink-2" aria-label="Unavailable" /> : <LoaderCircle className="size-4 animate-spin text-ink-2" aria-label="Loading" />}
                </span>
                <span className={s === "done" ? "text-ink" : "text-ink-2"}>
                  {AREA_STEP_LABELS[id]}
                  {counting && <span className="ml-2 tabular text-muted">{Math.round((100 * progress.done) / progress.total)}%</span>}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function Empty({ area }: { area: AreaRef }) {
  return (
    <div className="rounded-[28px] border border-line bg-card p-8">
      <House className="size-7 text-ink-2" aria-hidden />
      <h2 className="mt-4 font-display text-[26px] font-bold tracking-tight">No addresses to rank</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
        OpenStreetMap has no residential buildings with house numbers in {area.label}. You can still check single addresses there.
      </p>
    </div>
  );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[28px] border border-line bg-card p-8">
      <AlertTriangle className="size-7 text-serious" aria-hidden />
      <h2 className="mt-4 font-display text-[26px] font-bold tracking-tight">Couldn't rank this area</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">{message} Trying again in a moment usually works.</p>
      <button onClick={onRetry} className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-forest">
        <RotateCcw className="size-4 text-lime" aria-hidden /> Try again
      </button>
    </div>
  );
}
