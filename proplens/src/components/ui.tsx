import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import type { Tone } from "../lib/noise";

export const TONE_COLOR: Record<Tone, string> = {
  good: "var(--color-good)",
  fair: "var(--color-fair)",
  warning: "var(--color-warning)",
  serious: "var(--color-serious)",
  critical: "var(--color-critical)",
};

/** Hex equivalents for places CSS variables can't reach (Leaflet SVG attributes). */
export const TONE_HEX: Record<Tone, string> = {
  good: "#0ca30c",
  fair: "#7cbf3a",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export const CATEGORY_HEX = { noise: "#eb6834", school: "#2a78d6", shop: "#1baf7a", sun: "#eda100" };

export function scoreTone(score: number): Tone {
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  if (score >= 40) return "warning";
  if (score >= 20) return "serious";
  return "critical";
}

export function scoreWord(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Weak";
  return "Poor";
}

export function ToneDot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${className}`} style={{ background: TONE_COLOR[tone] }} />;
}

export function ScoreRing({ score, size = 72, stroke = 7, label }: { score: number | null; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Score"} ${score ?? "pending"} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-wash)" strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE_COLOR[scoreTone(value)]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * value) / 100} ${c}`}
            style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.2,0.7,0.2,1)" }}
          />
        )}
      </svg>
      <span className="absolute font-display font-bold tabular text-ink" style={{ fontSize: size * 0.32 }}>
        {score ?? "–"}
      </span>
    </div>
  );
}

type SectionProps = {
  id: string;
  icon: LucideIcon;
  accent: string;
  title: string;
  score: number | null;
  verdict: ReactNode;
  children: ReactNode;
};

export const Section = forwardRef<HTMLElement, SectionProps>(function Section({ id, icon: Icon, accent, title, score, verdict, children }, ref) {
  return (
    <section ref={ref} id={id} data-section={id} className="scroll-mt-24 animate-rise rounded-[28px] border border-line bg-card p-5 sm:p-8">
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${accent} 16%, white)` }}>
          <Icon className="size-6 text-ink" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[26px] font-bold leading-tight tracking-tight">{title}</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{verdict}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ScoreRing score={score} size={56} stroke={6} label={`${title} score`} />
          {score != null && <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{scoreWord(score)}</span>}
        </div>
      </header>
      <div className="mt-7">{children}</div>
    </section>
  );
});

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full bg-wash px-2.5 py-0.5 text-[12px] font-medium text-ink-2 ${className}`}>{children}</span>;
}

export function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {aside && <span className="text-[13px] text-muted">{aside}</span>}
    </div>
  );
}
