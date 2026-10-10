import { AlertTriangle, ArrowRight, Check, CircleCheck, CircleDashed, Link2, LoaderCircle, Map as MapIcon, MapPin, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AreaRef } from "../lib/area";
import { areasAt } from "../lib/area";
import type { LatLon } from "../lib/geo";
import type { Place } from "../lib/geocode";
import { reversePlace } from "../lib/geocode";
import type { LayerId, Report, SectionId, StepId } from "../lib/report";
import { STEP_LABELS, insights, overallScore, useReport, useSun } from "../lib/report";
import type { SunResult } from "../lib/sunlight";
import { evaluate, reportMetrics, savedId, usePreferences, useSaved } from "../lib/preferences";
import AlertSignup from "./AlertSignup";
import { SchoolsSection, ShoppingSection } from "./AmenitySections";
import FlightsSection from "./FlightsSection";
import Logo from "./Logo";
import MapPanel from "./MapPanel";
import NoiseSection from "./NoiseSection";
import { CompareLink, MatchCard, PreferencesButton, SaveButton } from "./Preferences";
import PriceSection from "./PriceSection";
import SearchBox from "./SearchBox";
import SunSection from "./SunSection";
import { ScoreRing, scoreWord } from "./ui";

type Props = {
  place: Place;
  floor: number;
  onFloor: (f: number) => void;
  onSelect: (p: Place | null) => void;
  onArea: (area: AreaRef, focus?: LatLon) => void;
  onCompare: () => void;
};

const MAP_LAYERS: LayerId[] = ["noise", "flights", "schools", "shopping", "sun"];

const SECTION_LABELS: Record<SectionId, string> = { noise: "Quiet", schools: "Schools", shopping: "Shopping", sun: "Sunlight" };

export default function ReportView({ place, floor, onFloor, onSelect, onArea, onCompare }: Props) {
  const [attempt, setAttempt] = useState(0);
  const { report, steps, failed } = useReport(place, attempt);
  const sun = useSun(report, floor);
  const [layer, setLayer] = useState<LayerId>("noise");
  const refs = useRef<Partial<Record<LayerId, HTMLElement | null>>>({});
  const manual = useRef(0);

  // Follow the section in view with the map layer.
  useEffect(() => {
    if (!report) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (Date.now() - manual.current < 900) return;
        // Only where the map stays beside the text; on phones it scrolls away, so keep the chosen layer.
        if (!matchMedia("(min-width: 1024px)").matches) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute("data-section");
        // Sections without a map layer (the price estimate) leave the map as it is.
        if (id && MAP_LAYERS.includes(id as LayerId)) setLayer(id as LayerId);
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0, 0.25, 0.5] },
    );
    for (const el of Object.values(refs.current)) if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [report]);

  const jump = useCallback((id: LayerId) => {
    manual.current = Date.now();
    setLayer(id);
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Switch the map to a layer and, on narrow screens where the map isn't sticky, bring it into view.
  const mapRef = useRef<HTMLElement>(null);
  const showOnMap = useCallback((id: LayerId) => {
    manual.current = Date.now();
    setLayer(id);
    const box = mapRef.current?.getBoundingClientRect();
    if (box && (box.bottom < 80 || box.top > innerHeight)) mapRef.current!.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const pick = useCallback(
    async (lat: number, lon: number) => {
      onSelect(await reversePlace(lat, lon));
    },
    [onSelect],
  );

  const scores: Partial<Record<SectionId, number>> = {
    noise: report?.noise?.score,
    schools: report?.schools?.score,
    shopping: report?.shopping?.score,
    // Without nearby buildings the sun model assumes open sky, so it shouldn't score.
    sun: report?.skyline ? sun?.score : undefined,
  };
  const overall = report ? overallScore(scores) : null;

  // Personal preferences: what this address offers, and how well that fits.
  const [prefs] = usePreferences();
  const metrics = useMemo(() => (report ? reportMetrics(report, sun) : null), [report, sun]);
  const match = useMemo(() => (metrics ? evaluate(prefs, metrics) : null), [prefs, metrics]);
  // A saved address keeps its comparison snapshot current while its report is open.
  const [saved, setSaved] = useSaved();
  useEffect(() => {
    if (!metrics) return;
    const id = savedId(place);
    const s = saved.find((x) => x.id === id);
    if (s && (s.floor !== floor || s.score !== overall || JSON.stringify(s.metrics) !== JSON.stringify(metrics)))
      setSaved(saved.map((x) => (x.id === id ? { ...x, floor, score: overall, metrics } : x)));
  }, [metrics, overall, floor, place, saved, setSaved]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-[1000] border-b border-line bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-6">
          <Logo onClick={() => onSelect(null)} compact />
          <div className="order-last w-full min-w-0 sm:order-none sm:ml-auto sm:w-auto sm:max-w-md sm:flex-1">
            <SearchBox onSelect={onSelect} size="sm" placeholder="Check another address" />
          </div>
          <span className="ml-auto flex items-center gap-2 sm:ml-0">
            <CompareLink onCompare={onCompare} compact />
            <PreferencesButton compact />
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <section className="flex flex-col gap-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 animate-rise">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
              <MapPin className="size-4" aria-hidden /> Address report
            </p>
            <h1 className="mt-2 font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] text-balance sm:text-[52px]">{place.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-2">
              {place.subtitle && <span>{place.subtitle}</span>}
              <span className="tabular text-muted">
                {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
              </span>
              <CopyLink />
              <SaveButton place={place} floor={floor} score={overall} metrics={metrics} />
            </p>
          </div>
          <ScoreCard overall={overall} scores={scores} loading={!report} onJump={jump} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <aside ref={mapRef} className="scroll-mt-20 h-[52vh] min-h-[320px] lg:sticky lg:top-[84px] lg:h-[calc(100dvh-108px)]">
            <MapPanel place={place} report={report} sun={sun} layer={layer} onLayer={jump} onPick={pick} />
          </aside>
          <div className="min-w-0 space-y-6">
            {failed ? (
              <Failure onRetry={() => setAttempt((a) => a + 1)} />
            ) : !report ? (
              <Progress steps={steps} />
            ) : (
              <>
                {match && <MatchCard match={match} pending={Object.values(steps).includes("pending")} />}
                <Insights report={report} sun={sun} onJump={jump} />
                <NoiseSection ref={(el) => { refs.current.noise = el; }} noise={report.noise} />
                <FlightsSection ref={(el) => { refs.current.flights = el; }} report={report} onShowMap={() => showOnMap("flights")} />
                <SchoolsSection ref={(el) => { refs.current.schools = el; }} schools={report.schools} />
                <ShoppingSection ref={(el) => { refs.current.shopping = el; }} shopping={report.shopping} />
                {sun && <SunSection ref={(el) => { refs.current.sun = el; }} report={report} sun={sun} floor={floor} onFloor={onFloor} />}
                <PriceSection report={report} sun={sun} floor={floor} onFloor={onFloor} />
                <Partial steps={steps} />
                <AreaAlerts place={place} onArea={onArea} />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ScoreCard({ overall, scores, loading, onJump }: { overall: number | null; scores: Partial<Record<SectionId, number>>; loading: boolean; onJump: (id: SectionId) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-5 rounded-[28px] border border-line bg-card p-4 pr-5 animate-rise [animation-delay:80ms]">
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="grid size-[84px] place-items-center rounded-full border-[8px] border-wash">
            <LoaderCircle className="size-6 animate-spin text-muted" aria-label="Scoring" />
          </div>
        ) : (
          <ScoreRing score={overall} size={84} stroke={8} label="PropLens score" />
        )}
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">PropLens score</div>
          <div className="font-display text-[22px] font-bold leading-tight">{overall != null ? scoreWord(overall) : "Scoring…"}</div>
        </div>
      </div>
      <div className="hidden h-14 w-px bg-line sm:block" />
      <ul className="hidden grid-cols-2 gap-x-5 gap-y-1.5 sm:grid">
        {(Object.keys(SECTION_LABELS) as SectionId[]).map((id) => (
          <li key={id}>
            <button onClick={() => onJump(id)} className="flex w-full items-center justify-between gap-4 rounded-lg text-[14px] text-ink-2 transition hover:text-ink">
              {SECTION_LABELS[id]}
              <span className="font-display font-bold tabular text-ink">{scores[id] ?? "–"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Insights({ report, sun, onJump }: { report: Report; sun: SunResult | null; onJump: (id: LayerId) => void }) {
  const { good, bad } = insights(report, sun);
  if (!good.length && !bad.length) return null;
  return (
    <section className="grid gap-4 animate-rise sm:grid-cols-2" aria-label="Summary">
      {[
        { title: "Highlights", items: good, icon: CircleCheck, color: "var(--color-good)", empty: "Nothing stands out positively." },
        { title: "Worth checking", items: bad, icon: TriangleAlert, color: "var(--color-serious)", empty: "No red flags found." },
      ].map(({ title, items, icon: Icon, color, empty }) => (
        <div key={title} className="rounded-[28px] border border-line bg-card p-5">
          <h2 className="flex items-center gap-2 font-display text-[18px] font-bold">
            <Icon className="size-5" style={{ color }} aria-hidden />
            {title}
          </h2>
          {items.length ? (
            <ul className="mt-3 space-y-1">
              {items.map((i) => (
                <li key={i.text}>
                  <button onClick={() => onJump(i.section)} className="w-full rounded-xl px-2 py-1.5 -mx-2 text-left text-[15px] leading-snug text-ink transition hover:bg-paper">
                    {i.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[15px] text-muted">{empty}</p>
          )}
        </div>
      ))}
    </section>
  );
}

function Progress({ steps }: { steps: Partial<Record<StepId, string>> }) {
  return (
    <div className="rounded-[28px] border border-line bg-card p-6 sm:p-8 animate-rise" aria-live="polite">
      <h2 className="font-display text-[26px] font-bold tracking-tight">Reading the neighbourhood…</h2>
      <p className="mt-1 text-[15px] text-ink-2">Live open data for this address. Usually 5–20 seconds.</p>
      <ul className="mt-6 space-y-3">
        {(Object.keys(STEP_LABELS) as StepId[])
          .filter((id) => steps[id] && steps[id] !== "skipped")
          .map((id) => {
            const s = steps[id];
            return (
              <li key={id} className="flex items-center gap-3 text-[15px]">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${s === "done" ? "bg-lime" : s === "failed" ? "bg-wash" : "bg-paper"}`}>
                  {s === "done" ? (
                    <Check className="size-4" aria-label="Done" />
                  ) : s === "failed" ? (
                    <X className="size-4 text-ink-2" aria-label="Unavailable" />
                  ) : (
                    <LoaderCircle className="size-4 animate-spin text-ink-2" aria-label="Loading" />
                  )}
                </span>
                <span className={s === "done" ? "text-ink" : "text-ink-2"}>{STEP_LABELS[id]}</span>
              </li>
            );
          })}
      </ul>
      <div className="mt-8 space-y-3" aria-hidden>
        {[0.9, 0.7, 0.8].map((w, i) => (
          <div key={i} className="h-3 animate-pulse rounded-full bg-wash" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function Partial({ steps }: { steps: Partial<Record<StepId, string>> }) {
  const failed = (Object.keys(STEP_LABELS) as StepId[]).filter((id) => steps[id] === "failed");
  const pending = (Object.keys(STEP_LABELS) as StepId[]).filter((id) => steps[id] === "pending");
  if (!failed.length && !pending.length) return null;
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-dashed border-line px-5 py-4 text-[14px] text-ink-2">
      {pending.length ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden /> : <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>
        {pending.length > 0 && <p>Still loading: {pending.map((id) => STEP_LABELS[id].toLowerCase()).join("; ")}.</p>}
        {failed.length > 0 && (
          <p>
            Couldn't reach a data source for: {failed.map((id) => STEP_LABELS[id].toLowerCase()).join("; ")}. The report uses what was available.
          </p>
        )}
      </div>
    </div>
  );
}

function Failure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[28px] border border-line bg-card p-8">
      <AlertTriangle className="size-7 text-serious" aria-hidden />
      <h2 className="mt-4 font-display text-[26px] font-bold tracking-tight">The map servers are busy</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
        PropLens couldn't load OpenStreetMap data for this address. The public Overpass servers are sometimes overloaded; trying again in a
        moment usually works.
      </p>
      <button onClick={onRetry} className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-forest">
        <RotateCcw className="size-4 text-lime" aria-hidden /> Try again
      </button>
    </div>
  );
}

function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium text-ink-2 transition hover:bg-wash hover:text-ink"
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
      {done ? "Link copied" : "Copy link"}
    </button>
  );
}

/** Links to the area rankings this address belongs to, and the alert signup for them. */
function AreaAlerts({ place, onArea }: { place: Place; onArea: (area: AreaRef, focus?: LatLon) => void }) {
  const [areas, setAreas] = useState<AreaRef[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setAreas(null);
    areasAt(place.lat, place.lon, place.title, ctrl.signal).then((a) => setAreas(a), () => {});
    return () => ctrl.abort();
  }, [place]);
  if (!areas?.length) return null;
  // Large areas are ranked in a window; centre it on this address.
  const focus = { lat: place.lat, lon: place.lon };
  return (
    <>
      <section className="rounded-[28px] bg-forest p-5 text-white animate-rise sm:p-8" aria-label="Area ranking">
        <h2 className="font-display text-[26px] font-bold leading-tight tracking-tight">Find the best addresses nearby</h2>
        <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-white/75">
          Rank every home in the area by the PropLens score and compare them on one map: quietest streets, sunniest buildings, shortest walks.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => onArea(a, focus)}
              className="group inline-flex items-center gap-2.5 rounded-full bg-white/10 py-2 pl-3 pr-4 text-left transition hover:bg-white/20"
            >
              <MapIcon className="size-4 text-lime" aria-hidden />
              <span className="text-[15px] font-medium">{a.label}</span>
              <span className="text-[13px] text-white/60">{a.detail.split(" · ")[0]}</span>
              <ArrowRight className="size-4 text-lime transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          ))}
        </div>
      </section>
      <AlertSignup areas={areas} focus={focus} onExplore={(a) => onArea(a, focus)} />
    </>
  );
}
