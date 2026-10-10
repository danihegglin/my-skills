import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bookmark, GraduationCap, Moon, Plane, ShoppingBasket, SlidersHorizontal, Sun, Sunrise, Sunset, TramFront, Trees, Volume2, X } from "lucide-react";
import type { Place } from "../lib/geocode";
import type { Metrics, Saved } from "../lib/preferences";
import { evaluate, matchWord, usePreferences, useSaved } from "../lib/preferences";
import Logo from "./Logo";
import { PREF_ICON, PreferencesButton, StatusIcon, openPreferences } from "./Preferences";
import { ScoreRing, scoreWord } from "./ui";
import { floorName } from "./SunSection";

type Props = { onOpen: (place: Place, floor: number) => void; onHome: () => void };

const walk = (m: number | null | undefined) => (m === undefined ? "–" : m === null ? "None nearby" : `${Math.max(1, Math.round((m * 1.25) / 80))} min`);

/** Facts shown for every saved address, whether or not they're among the preferences. `better` picks the best column. */
const FACTS: { label: string; icon: LucideIcon; get: (m: Metrics) => number | null | undefined; text: (m: Metrics) => string; better: "low" | "high" }[] = [
  { label: "Daytime noise", icon: Volume2, get: (m) => m.noiseDay, text: (m) => (m.noiseDay == null ? "–" : `${Math.round(m.noiseDay)} dB`), better: "low" },
  { label: "Night noise", icon: Moon, get: (m) => m.noiseNight, text: (m) => (m.noiseNight == null ? "–" : `${Math.round(m.noiseNight)} dB`), better: "low" },
  { label: "Winter sun", icon: Sun, get: (m) => m.winterSun, text: (m) => (m.winterSun == null ? "–" : `${m.winterSun.toFixed(1)} h`), better: "high" },
  { label: "Evening sun", icon: Sunset, get: (m) => m.eveningSun, text: (m) => (m.eveningSun == null ? "–" : `${m.eveningSun.toFixed(1)} h`), better: "high" },
  { label: "Morning sun", icon: Sunrise, get: (m) => m.morningSun, text: (m) => (m.morningSun == null ? "–" : `${m.morningSun.toFixed(1)} h`), better: "high" },
  { label: "Public transport", icon: TramFront, get: (m) => m.stop, text: (m) => walk(m.stop), better: "low" },
  { label: "Supermarket", icon: ShoppingBasket, get: (m) => m.supermarket, text: (m) => walk(m.supermarket), better: "low" },
  { label: "School", icon: GraduationCap, get: (m) => m.school, text: (m) => walk(m.school), better: "low" },
  { label: "Park or woods", icon: Trees, get: (m) => m.green, text: (m) => walk(m.green), better: "low" },
  {
    label: "Flight path",
    icon: Plane,
    get: (m) => (m.flyover ? { direct: 0, near: 1, distant: 2, none: 3 }[m.flyover] : undefined),
    text: (m) => (m.flyover ? { direct: "Direct flyover", near: "Near a path", distant: "Away", none: "None" }[m.flyover] : "–"),
    better: "high",
  },
];

function best(values: (number | null | undefined)[], better: "low" | "high"): number | null {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null;
  const top = better === "low" ? Math.min(...known) : Math.max(...known);
  // No highlight when everyone ties.
  return known.every((v) => v === top) ? null : top;
}

export default function ComparePage({ onOpen, onHome }: Props) {
  const [saved, setSaved] = useSaved();
  const [prefs] = usePreferences();
  const matches = saved.map((s) => evaluate(prefs, s.metrics));
  const remove = (s: Saved) => setSaved(saved.filter((x) => x.id !== s.id));
  const cols = `minmax(128px,200px) repeat(${saved.length}, minmax(170px,1fr))`;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-[1000] border-b border-line bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <Logo onClick={onHome} compact />
          <div className="ml-auto" />
          <PreferencesButton compact />
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <section className="py-8 animate-rise">
          <h1 className="font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[52px]">Compare addresses</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            Your saved addresses side by side{prefs.length ? ", checked against your preferences" : ""}. The best value in each row is highlighted.
          </p>
        </section>

        {!saved.length ? (
          <div className="rounded-[28px] border border-dashed border-ink/20 bg-card p-8">
            <Bookmark className="size-7 text-ink-2" aria-hidden />
            <h2 className="mt-4 font-display text-[24px] font-bold">Nothing saved yet</h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">Open an address and press “Save to compare”. Up to six addresses can sit side by side here.</p>
            <button onClick={onHome} className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-forest">
              Check an address <ArrowRight className="size-4 text-lime" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-line bg-card">
            <div className="min-w-max" role="table" aria-label="Saved addresses compared">
              <div role="row" className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
                <div role="columnheader" className="sticky left-0 z-10 bg-card p-4" />
                {saved.map((s) => (
                  <div role="columnheader" key={s.id} className="border-l border-line p-4">
                    <div className="flex items-start gap-2">
                      <button onClick={() => onOpen(s.place, s.floor)} className="min-w-0 flex-1 text-left">
                        <span className="block font-display text-[17px] font-bold leading-tight text-ink hover:underline">{s.place.title}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted">{s.place.subtitle.split(",").slice(0, 2).join(",")}</span>
                        <span className="block text-[12px] text-muted">{floorName(s.floor)}</span>
                      </button>
                      <button onClick={() => remove(s)} aria-label={`Remove ${s.place.title}`} className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-wash hover:text-ink">
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <Row cols={cols} label="PropLens score">
                {saved.map((s) => (
                  <Cell key={s.id} hi={s.score != null && s.score === best(saved.map((x) => x.score), "high")}>
                    <span className="flex items-center gap-2">
                      <ScoreRing score={s.score} size={40} stroke={5} label="PropLens score" />
                      <span className="text-[13px] text-ink-2">{s.score != null ? scoreWord(s.score) : "–"}</span>
                    </span>
                  </Cell>
                ))}
              </Row>
              {prefs.length > 0 ? (
                <Row cols={cols} label="Your match" strong>
                  {matches.map((m, i) => (
                    <Cell key={saved[i].id} hi={m.match != null && m.match === best(matches.map((x) => x.match), "high")}>
                      <span className="flex items-center gap-2">
                        <ScoreRing score={m.match} size={40} stroke={5} label="Your match" />
                        <span className="text-[13px] text-ink-2">
                          {m.match != null ? matchWord(m.match) : "–"}
                          {m.missedMusts.length > 0 && <span className="block text-[12px] text-critical">Misses a must-have</span>}
                        </span>
                      </span>
                    </Cell>
                  ))}
                </Row>
              ) : (
                <Row cols={cols} label="Your match">
                  <div className="col-span-full border-l border-line p-3 text-[14px] text-ink-2" style={{ gridColumn: `2 / span ${saved.length}` }}>
                    <button onClick={() => openPreferences()} className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-2 hover:underline">
                      <SlidersHorizontal className="size-4" aria-hidden /> Set your preferences
                    </button>{" "}
                    to see how well each address fits you.
                  </div>
                </Row>
              )}

              {prefs.map((p, pi) => {
                const Icon = PREF_ICON[p.id];
                const rs = matches.map((m) => m.results[pi]);
                return (
                  <Row
                    key={p.id}
                    cols={cols}
                    label={
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-4 text-muted" aria-hidden />
                        {rs[0]?.def.label}
                        {p.importance === 3 && <span className="rounded-full bg-wash px-1.5 text-[10px] font-semibold text-ink-2">Must</span>}
                      </span>
                    }
                    hint={rs[0]?.def.targetLabel(p.target)}
                  >
                    {rs.map((r, i) => (
                      <Cell key={saved[i].id}>
                        <span className="flex items-start gap-2">
                          <StatusIcon s={r.satisfaction} className="mt-0.5" />
                          <span className="text-[13px] leading-snug text-ink">{r.text}</span>
                        </span>
                      </Cell>
                    ))}
                  </Row>
                );
              })}

              <div className="border-b border-line bg-paper px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">At a glance</div>
              {FACTS.map((f) => {
                const values = saved.map((s) => f.get(s.metrics));
                const top = best(values, f.better);
                return (
                  <Row key={f.label} cols={cols} label={<span className="flex items-center gap-1.5"><f.icon className="size-4 text-muted" aria-hidden />{f.label}</span>}>
                    {saved.map((s, i) => (
                      <Cell key={s.id} hi={top != null && values[i] === top}>
                        <span className="text-[14px] tabular text-ink">{f.text(s.metrics)}</span>
                      </Cell>
                    ))}
                  </Row>
                );
              })}
            </div>
          </div>
        )}
        {saved.length > 0 && (
          <p className="mt-4 text-[13px] text-muted">
            Saved in this browser. Sunlight is for the floor each address was saved at; open an address to change its floor.
          </p>
        )}
      </main>
    </div>
  );
}

function Row({ cols, label, hint, strong, children }: { cols: string; label: React.ReactNode; hint?: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div role="row" className="grid border-b border-line last:border-0" style={{ gridTemplateColumns: cols }}>
      <div role="rowheader" className={`sticky left-0 z-10 bg-card p-3 pl-4 text-[14px] ${strong ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>
        {label}
        {hint && <span className="mt-0.5 block text-[12px] font-normal text-muted">Wanted: {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Cell({ hi, children }: { hi?: boolean; children: React.ReactNode }) {
  return (
    <div role="cell" className={`border-l border-line p-3 ${hi ? "bg-lime/25" : ""}`}>
      {children}
    </div>
  );
}
