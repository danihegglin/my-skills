import type { ReactNode } from "react";
import { useEffect, useState } from "react";

// Form controls shared by the price calculator and the alert signup.

export const INPUT =
  "h-11 w-full rounded-2xl border border-line bg-card px-3.5 text-[15px] text-ink outline-none transition focus:border-ink/40 focus:shadow-[0_0_0_4px_rgb(212_242_106/0.45)]";

export function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`block min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
        {label}
        {hint && <span className="text-[12px] font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function NumberInput({ value, onChange, suffix, min, max }: { value: number; onChange: (v: number) => void; suffix: string; min: number; max: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        className={`${INPUT} pr-12`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[14px] text-muted">{suffix}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  full,
  titles,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  label: string;
  full?: boolean;
  titles?: Partial<Record<string, string>>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-full bg-paper p-1 ${full ? "flex w-full" : ""}`}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={titles?.[v]}
          onClick={() => onChange(v)}
          className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-medium transition sm:px-3.5 sm:text-[14px] ${full ? "flex-1" : ""} ${value === v ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${on ? "border-ink bg-ink text-white" : "border-line bg-card text-ink-2 hover:border-ink/30"}`}
    >
      {children}
    </button>
  );
}
