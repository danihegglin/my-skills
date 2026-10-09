import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Check,
  CircleHelp,
  GraduationCap,
  Martini,
  Minus,
  Moon,
  Plane,
  Scale,
  ShoppingBasket,
  SlidersHorizontal,
  Sun,
  Sunrise,
  Sunset,
  TrainFront,
  TramFront,
  Trees,
  Volume1,
  X,
} from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Place } from "../lib/geocode";
import type { Importance, Match, Metrics, Pref, PrefDef, PrefGroup, PrefId, PrefResult } from "../lib/preferences";
import { IMPORTANCE, MAX_SAVED, PREFS, PREF_BY_ID, matchWord, savedId, usePreferences, useSaved } from "../lib/preferences";
import SearchBox from "./SearchBox";
import { ScoreRing, TONE_COLOR } from "./ui";

export const PREF_ICON: Record<PrefId, LucideIcon> = {
  "evening-sun": Sunset,
  "morning-sun": Sunrise,
  "winter-sun": Sun,
  transit: TramFront,
  train: TrainFront,
  "near-work": Briefcase,
  supermarket: ShoppingBasket,
  school: GraduationCap,
  childcare: Baby,
  green: Trees,
  "quiet-night": Moon,
  "quiet-day": Volume1,
  "no-nightlife": Martini,
  "no-flights": Plane,
};

const GROUPS: PrefGroup[] = ["Light", "Getting around", "Everyday", "Peace and quiet"];

/* ---------- the panel ---------- */

let panelOpen = false;
const panelListeners = new Set<() => void>();
export function openPreferences(open = true) {
  panelOpen = open;
  panelListeners.forEach((l) => l());
}
const usePanelOpen = () =>
  useSyncExternalStore(
    (l) => {
      panelListeners.add(l);
      return () => panelListeners.delete(l);
    },
    () => panelOpen,
  );

export function PreferencesButton({ compact }: { compact?: boolean }) {
  const [prefs] = usePreferences();
  return (
    <button
      onClick={() => openPreferences()}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 text-[14px] font-medium text-ink transition hover:border-ink/30"
      aria-label={`Your preferences${prefs.length ? ` (${prefs.length} set)` : ""}`}
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      <span className={compact ? "hidden md:inline" : undefined}>Preferences</span>
      {prefs.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-lime text-[11px] font-bold tabular">{prefs.length}</span>}
    </button>
  );
}

export function CompareLink({ onCompare, compact }: { onCompare: () => void; compact?: boolean }) {
  const [saved] = useSaved();
  if (!saved.length) return null;
  return (
    <button
      onClick={onCompare}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 text-[14px] font-medium text-ink transition hover:border-ink/30"
      aria-label={`Compare ${saved.length} saved addresses`}
    >
      <Scale className="size-4" aria-hidden />
      <span className={compact ? "hidden md:inline" : undefined}>Compare</span>
      <span className="grid size-5 place-items-center rounded-full bg-wash text-[11px] font-bold tabular">{saved.length}</span>
    </button>
  );
}

/** The preferences editor, a sheet over whatever page is open. Rendered once by the app. */
export function PreferencesPanel() {
  const open = usePanelOpen();
  const [prefs, setPrefs] = usePreferences();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openPreferences(false);
    addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;
  const byId = new Map(prefs.map((p) => [p.id, p]));
  const update = (id: PrefId, next: Partial<Pref> | null) => {
    if (next === null) return setPrefs(prefs.filter((p) => p.id !== id));
    const cur = byId.get(id);
    const def = PREF_BY_ID[id];
    const merged: Pref = { id, target: def.defaultTarget, importance: 2, ...cur, ...next };
    setPrefs(cur ? prefs.map((p) => (p.id === id ? merged : p)) : [...prefs, merged]);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end bg-ink/30 backdrop-blur-[2px]" onClick={() => openPreferences(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prefs-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[560px] flex-col bg-paper shadow-[0_0_60px_rgb(16_20_15/0.25)] animate-rise"
      >
        <div className="flex items-start gap-4 border-b border-line bg-card px-5 py-5 sm:px-7">
          <div className="min-w-0 flex-1">
            <h2 id="prefs-title" className="font-display text-[26px] font-bold tracking-tight">
              Your preferences
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
              Pick what matters to you. Every report, area ranking and comparison is checked against it. Saved in this browser only.
            </p>
          </div>
          <button ref={closeRef} onClick={() => openPreferences(false)} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full transition hover:bg-wash">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {GROUPS.map((g) => (
            <section key={g} className="mb-6">
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{g}</h3>
              <ul className="space-y-2">
                {PREFS.filter((d) => d.group === g).map((d) => (
                  <PrefRow key={d.id} def={d} pref={byId.get(d.id)} onChange={(next) => update(d.id, next)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-card px-5 py-4 sm:px-7">
          {prefs.length > 0 && (
            <button onClick={() => setPrefs([])} className="rounded-full px-4 py-2 text-[14px] font-medium text-ink-2 transition hover:bg-wash hover:text-ink">
              Clear all
            </button>
          )}
          <span className="ml-auto text-[13px] text-muted">{prefs.length ? `${prefs.length} selected` : "Nothing selected yet"}</span>
          <button onClick={() => openPreferences(false)} className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-forest">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function PrefRow({ def, pref, onChange }: { def: PrefDef; pref?: Pref; onChange: (next: Partial<Pref> | null) => void }) {
  const Icon = PREF_ICON[def.id];
  const on = !!pref;
  return (
    <li className={`rounded-2xl border transition ${on ? "border-ink/25 bg-card shadow-sm" : "border-line bg-card/60"}`}>
      <button type="button" aria-pressed={on} onClick={() => onChange(on ? null : {})} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${on ? "bg-lime" : "bg-paper"}`}>
          <Icon className="size-[18px] text-ink" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{def.label}</span>
          <span className="block text-[13px] leading-snug text-ink-2">{def.describe(pref ?? { id: def.id, target: def.defaultTarget, importance: 2 })}</span>
        </span>
        <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${on ? "border-ink bg-ink text-white" : "border-line"}`} aria-hidden>
          {on && <Check className="size-3.5" />}
        </span>
      </button>
      {pref && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {def.id === "near-work" && (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-ink-2">{pref.place ? `Place: ${pref.place.label}` : "Choose the place"}</div>
              <SearchBox
                size="sm"
                placeholder="Office, school or any address"
                onSelect={(p: Place) => onChange({ place: { label: p.title, lat: p.lat, lon: p.lon } })}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="radiogroup" aria-label={`${def.label} target`} className="flex flex-wrap gap-1.5">
              {def.targets.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={pref.target === t}
                  onClick={() => onChange({ target: t })}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium tabular transition ${pref.target === t ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-ink/30"}`}
                >
                  {def.targetLabel(t)}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label={`${def.label} importance`} className="ml-auto inline-flex rounded-full bg-paper p-0.5">
              {([1, 2, 3] as Importance[]).map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={pref.importance === i}
                  onClick={() => onChange({ importance: i })}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition ${pref.importance === i ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}
                >
                  {IMPORTANCE[i]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------- results ---------- */

export function statusColor(s: number | null) {
  return s == null ? "var(--color-muted)" : s >= 1 ? TONE_COLOR.good : s > 0 ? TONE_COLOR.warning : TONE_COLOR.critical;
}

export function StatusIcon({ s, className = "" }: { s: number | null; className?: string }) {
  const Icon = s == null ? CircleHelp : s >= 1 ? Check : s > 0 ? Minus : X;
  return (
    <span className={`grid size-6 shrink-0 place-items-center rounded-full ${className}`} style={{ background: `color-mix(in oklab, ${statusColor(s)} 18%, white)` }}>
      <Icon className="size-3.5" style={{ color: statusColor(s) }} aria-label={s == null ? "Unknown" : s >= 1 ? "Met" : s > 0 ? "Partly met" : "Not met"} />
    </span>
  );
}

const QUICK: PrefId[] = ["evening-sun", "transit", "quiet-night", "green", "supermarket", "near-work"];

/** "Your match" for an address report. */
/** `pending`: some of the report's data is still loading, so unknown preferences may yet be checked. */
export function MatchCard({ match, pending }: { match: Match; pending?: boolean }) {
  const [prefs, setPrefs] = usePreferences();
  if (!prefs.length)
    return (
      <section className="rounded-[28px] border border-dashed border-ink/20 bg-card p-5 animate-rise sm:p-6" aria-label="Your preferences">
        <h2 className="flex items-center gap-2 font-display text-[20px] font-bold">
          <SlidersHorizontal className="size-5" aria-hidden /> What matters to you?
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">Add your must-haves and nice-to-haves, and every address shows how well it fits you.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK.map((id) => {
            const Icon = PREF_ICON[id];
            return (
              <button
                key={id}
                onClick={() => {
                  setPrefs([...prefs, { id, target: PREF_BY_ID[id].defaultTarget, importance: 2 }]);
                  openPreferences();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-ink transition hover:border-ink/30"
              >
                <Icon className="size-4" aria-hidden /> {PREF_BY_ID[id].label}
              </button>
            );
          })}
          <button onClick={() => openPreferences()} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 underline-offset-2 hover:underline">
            More…
          </button>
        </div>
      </section>
    );

  return (
    <section className="rounded-[28px] border border-line bg-card p-5 animate-rise sm:p-6" aria-label="Your match">
      <div className="flex items-center gap-4">
        <ScoreRing score={match.match} size={64} stroke={7} label="Your match" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Your match</div>
          <div className="font-display text-[22px] font-bold leading-tight">{match.match != null ? matchWord(match.match) : "Checking…"}</div>
          {match.missedMusts.length > 0 && (
            <div className="text-[13px] font-medium text-critical">
              Misses {match.missedMusts.length === 1 ? "a must-have" : `${match.missedMusts.length} must-haves`}: {match.missedMusts.map((r) => r.def.label.toLowerCase()).join(", ")}
            </div>
          )}
        </div>
        <button onClick={() => openPreferences()} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink transition hover:border-ink/30">
          Edit
        </button>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {match.results.map((r) => (
          <ResultRow key={r.pref.id} r={r} pending={pending} />
        ))}
      </ul>
      {!pending && match.results.some((r) => r.satisfaction == null) && (
        <p className="mt-3 text-[13px] leading-snug text-muted">
          Some data didn't load, so the match leaves out what couldn't be checked. Reloading the page usually fills the gaps.
        </p>
      )}
    </section>
  );
}

function ResultRow({ r, pending }: { r: PrefResult; pending?: boolean }) {
  const Icon = PREF_ICON[r.pref.id];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <StatusIcon s={r.satisfaction} />
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">
          {r.def.label}
          {r.pref.importance === 3 && <span className="ml-1.5 rounded-full bg-wash px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">Must</span>}
        </div>
        <div className="text-[13px] leading-snug text-ink-2">{r.satisfaction == null && pending ? "Still loading…" : r.text}</div>
      </div>
      <div className="hidden shrink-0 text-right text-[12px] text-muted sm:block">Wanted: {r.def.targetLabel(r.pref.target)}</div>
    </li>
  );
}

/** Saves an address (with what it offers) for side-by-side comparison. */
export function SaveButton({ place, floor, score, metrics }: { place: Place; floor: number; score: number | null; metrics: Metrics | null }) {
  const [saved, setSaved] = useSaved();
  const id = savedId(place);
  const isSaved = saved.some((s) => s.id === id);
  const full = !isSaved && saved.length >= MAX_SAVED;
  return (
    <button
      disabled={!metrics || full}
      title={full ? `Compare up to ${MAX_SAVED} addresses; remove one first` : undefined}
      onClick={() =>
        setSaved(isSaved ? saved.filter((s) => s.id !== id) : [...saved, { id, place, floor, score, metrics: metrics!, savedAt: new Date().toISOString() }])
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-50 ${isSaved ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:border-ink/30"}`}
    >
      {isSaved ? <BookmarkCheck className="size-4 text-lime" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      {isSaved ? "Saved to compare" : "Save to compare"}
    </button>
  );
}
