import { BadgeCheck, Building2, Factory, Moon, Plane, SunMedium, TrainFront, UtensilsCrossed, Car, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import { formatDistance } from "../lib/geo";
import type { NoiseCategory, NoiseCategoryId, NoiseResult } from "../lib/noise";
import { rateNoise } from "../lib/noise";
import { Badge, Section, SubHeading, TONE_COLOR, ToneDot } from "./ui";

const ICONS: Record<NoiseCategoryId, LucideIcon> = {
  road: Car,
  rail: TrainFront,
  air: Plane,
  nightlife: UtensilsCrossed,
  other: Factory,
};

const SCALE_MIN = 30;
const SCALE_MAX = 80;
const pct = (db: number) => `${Math.max(0, Math.min(100, ((db - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100))}%`;
const round = (db: number) => Math.round(db);
const level = (c: NoiseCategory) => ({ day: c.official?.day ?? c.day, night: c.official?.night ?? c.night });

const MAIN_SOURCE: Record<NoiseCategoryId, string> = {
  road: "road traffic",
  rail: "trains",
  air: "aircraft",
  nightlife: "restaurants and bars",
  other: "industry",
};

function verdict(n: NoiseResult): string {
  const loudest = [...n.categories].sort((a, b) => level(b).day - level(a).day)[0];
  const rating = rateNoise(n.day).label;
  if (level(loudest).day < 40) return `${rating}, with no significant noise sources nearby.`;
  const src = loudest.sources[0];
  const lead = src ? ` (${src.name}, ${formatDistance(src.distance)} away)` : "";
  return `${rating} by day. Most of it comes from ${MAIN_SOURCE[loudest.id]}${lead}.`;
}

const NoiseSection = forwardRef<HTMLElement, { noise: NoiseResult | null }>(function NoiseSection({ noise }, ref) {
  if (!noise) {
    return (
      <Section ref={ref} id="noise" icon={Volume2} accent="var(--color-noise)" title="Noise" score={null} verdict="Map data for this area could not be loaded, so noise can't be estimated.">
        <span />
      </Section>
    );
  }
  const official = noise.categories.find((c) => c.official)?.official;
  return (
    <Section ref={ref} id="noise" icon={Volume2} accent="var(--color-noise)" title="Noise" score={noise.score} verdict={verdict(noise)}>
      <div className="grid grid-cols-2 gap-3">
        {(["day", "night"] as const).map((period) => {
          const v = noise[period];
          const r = rateNoise(v, period);
          const Icon = period === "day" ? SunMedium : Moon;
          return (
            <div key={period} className="rounded-3xl bg-paper p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <Icon className="size-4" aria-hidden />
                {period === "day" ? "Daytime · 6–22 h" : "Night · 22–6 h"}
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-display text-[44px] font-bold leading-none tracking-tight tabular">{round(v)}</span>
                <span className="text-[15px] font-medium text-ink-2">dB</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[14px] font-medium">
                <ToneDot tone={r.tone} />
                {r.label}
              </div>
            </div>
          );
        })}
      </div>

      <Thermometer day={noise.day} night={noise.night} />

      <div className="mt-8">
        <SubHeading aside={<Legend />}>Sources</SubHeading>
        <ul className="divide-y divide-line">
          {noise.categories.map((c) => (
            <CategoryRow key={c.id} c={c} />
          ))}
        </ul>
      </div>

      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        {official
          ? `Road and rail levels are official values from ${official.source}. Other sources are modelled. `
          : "Levels are modelled from mapped roads, rail lines, airports and venues, with typical traffic for each road class. "}
        Values are equivalent continuous levels at the loudest façade, 4 m above ground. Expect ±5 dB; real traffic counts, noise barriers
        and road surfaces can shift them.
      </p>
    </Section>
  );
});

export default NoiseSection;

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[12px]">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-r-[3px] bg-ink/70" aria-hidden /> Day
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-ink bg-card" aria-hidden /> Night
      </span>
    </span>
  );
}

function CategoryRow({ c }: { c: NoiseCategory }) {
  const Icon = ICONS[c.id];
  const { day, night } = level(c);
  const negligible = day < SCALE_MIN && night < SCALE_MIN - 5;
  const tone = rateNoise(day).tone;
  const top = c.sources.slice(0, c.id === "nightlife" ? 3 : 2);
  return (
    <li className="py-4">
      <div className="flex items-center gap-3">
        <Icon className="size-[18px] shrink-0 text-ink-2" aria-hidden />
        <span className="font-medium">{c.label}</span>
        {c.official && (
          <Badge className="bg-lime/50 text-ink">
            <BadgeCheck className="size-3.5" aria-hidden /> Official
          </Badge>
        )}
        <span className="ml-auto text-right text-[14px] tabular">
          {negligible ? (
            <span className="text-muted">Negligible</span>
          ) : (
            <>
              <span className="font-semibold">{round(day)} dB</span>
              <span className="text-muted"> · {round(night)} at night</span>
            </>
          )}
        </span>
      </div>
      {!negligible && (
        <div className="relative mt-2.5 ml-[30px] h-2.5 rounded-full bg-wash" role="img" aria-label={`${c.label}: ${round(day)} dB by day, ${round(night)} dB at night, ${rateNoise(day).label}`}>
          <div className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: pct(day), background: TONE_COLOR[tone] }} />
          <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-card" style={{ left: pct(night) }} />
        </div>
      )}
      {top.length > 0 && !negligible && (
        <ul className="mt-2.5 ml-[30px] space-y-1">
          {top.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="min-w-0 truncate">
                <span className="text-ink">{s.name}</span>
                {s.detail !== s.name && <span className="text-muted"> · {s.detail}</span>}
              </span>
              {s.shielded && (
                <span title="Shielded by buildings" className="inline-flex shrink-0 items-center gap-1 text-muted">
                  <Building2 className="size-3.5" aria-hidden />
                  <span className="sr-only">Shielded by buildings</span>
                </span>
              )}
              <span className="ml-auto shrink-0 tabular text-muted">{formatDistance(s.distance)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const REFERENCES = [
  { db: 35, label: "Quiet bedroom" },
  { db: 50, label: "Quiet street" },
  { db: 60, label: "Conversation" },
  { db: 70, label: "Busy main road" },
];

function Thermometer({ day, night }: { day: number; night: number }) {
  const bands: [number, number, keyof typeof TONE_COLOR][] = [
    [30, 50, "good"],
    [50, 55, "fair"],
    [55, 60, "warning"],
    [60, 65, "serious"],
    [65, 80, "critical"],
  ];
  const marker = (v: number, label: string, Icon: LucideIcon, below: boolean) => (
    <div className={`absolute flex -translate-x-1/2 items-center ${below ? "top-[30px] flex-col-reverse" : "top-0 flex-col"}`} style={{ left: pct(v) }}>
      <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white tabular">
        <Icon className="size-3" aria-hidden />
        {label} {round(v)}
      </span>
      <span className="h-3 w-0.5 rounded-full bg-ink" />
    </div>
  );
  return (
    <div className="mt-6 px-1" role="img" aria-label={`Day ${round(day)} dB, night ${round(night)} dB on a scale from 30 to 80 dB`}>
      <div className="relative h-[66px]">
        <div className="absolute inset-x-0 top-[26px] flex h-2 gap-[2px] overflow-hidden rounded-full">
          {bands.map(([a, b, tone]) => (
            <div key={a} style={{ flex: b - a, background: `color-mix(in oklab, ${TONE_COLOR[tone]} 55%, white)` }} />
          ))}
        </div>
        {marker(day, "Day", SunMedium, false)}
        {marker(night, "Night", Moon, true)}
      </div>
      <div className="relative mt-1 h-9 text-[11px] text-muted">
        {REFERENCES.map((r) => (
          <span key={r.db} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: pct(r.db) }}>
            <span className="block font-medium tabular text-ink-2">{r.db} dB</span>
            <span className="hidden whitespace-nowrap sm:block">{r.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
