import { Banknote, Info } from "lucide-react";
import { forwardRef, useEffect, useMemo, useState } from "react";
import type { Report } from "../lib/report";
import type { SunResult } from "../lib/sunlight";
import type { Condition, Estimate, Mode, Period, Property, Quality, View } from "../lib/valuation";
import { ASKING_YEARS, REGION_LABEL, RENT_YEAR, SALES_YEAR, cantonInfo, compareAsking, estimate, locationFrom, roomKey, typicalArea, typicalRents, zurichSales } from "../lib/valuation";
import { floorName } from "./SunSection";
import { Section, SubHeading, ToneDot } from "./ui";

const PERIODS: { id: Period; label: string }[] = [
  { id: "new", label: "New build, first letting" },
  { id: "2021+", label: "2021 or later" },
  { id: "2011-2020", label: "2011–2020" },
  { id: "2001-2010", label: "2001–2010" },
  { id: "1991-2000", label: "1991–2000" },
  { id: "1981-1990", label: "1981–1990" },
  { id: "1971-1980", label: "1971–1980" },
  { id: "1961-1970", label: "1961–1970" },
  { id: "1946-1960", label: "1946–1960" },
  { id: "1919-1945", label: "1919–1945" },
  { id: "<1919", label: "Before 1919" },
];

type Draft = Omit<Property, "floor"> & { mode: Mode; asking: string; refRent: string; refPrice: string };

const STORE = "proplens.property";
function loadDraft(area: number): Draft {
  const fallback: Draft = {
    mode: "rent",
    type: "apartment",
    area: Math.round(area),
    rooms: 3.5,
    period: "1991-2000",
    condition: "average",
    quality: "standard",
    balcony: true,
    elevator: true,
    garden: false,
    view: "none",
    asking: "",
    refRent: "",
    refPrice: "",
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return saved ? { ...fallback, ...saved, asking: "" } : fallback;
  } catch {
    return fallback;
  }
}

const chf = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const chf2 = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number, swiss: boolean) => {
  const n = v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("de-CH", { maximumFractionDigits: 2 })} M` : chf.format(Math.round(v / (v >= 100_000 ? 1000 : 10)) * (v >= 100_000 ? 1000 : 10));
  return swiss ? `CHF ${n}` : n;
};
const roomsLabel = (r: number) => (r % 1 ? `${Math.floor(r)}½` : String(r));
const pct = (f: number) => `${f >= 1 ? "+" : "−"}${Math.abs((f - 1) * 100).toFixed(Math.abs(f - 1) < 0.1 ? 1 : 0)}%`;

type Props = { report: Report; sun: SunResult | null; floor: number; onFloor: (f: number) => void };

const PriceSection = forwardRef<HTMLElement, Props>(function PriceSection({ report, sun, floor, onFloor }, ref) {
  const canton = report.municipality?.canton ?? null;
  const swiss = !!cantonInfo(canton);
  const [d, setD] = useState<Draft>(() => loadDraft(typicalArea(canton, "3")));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    try {
      const { asking: _asking, ...keep } = d;
      localStorage.setItem(STORE, JSON.stringify(keep));
    } catch {
      /* storage unavailable: the form still works */
    }
  }, [d]);

  const location = useMemo(
    () => ({
      ...locationFrom({
        municipality: report.municipality,
        shopsNearby: report.shopping?.shopsNearby ?? null,
        coverage: report.skyline?.coverage ?? null,
        noiseDay: report.noise?.day ?? null,
        flyover: report.flights?.exposure.level ?? null,
        winterSun: report.skyline && sun ? sun.keyDays[0].direct : null,
        amenities: report.schools && report.shopping ? (report.schools.score + report.shopping.score) / 2 : null,
      }),
      manualRentPerM2: Number(d.refRent) || null,
      manualPricePerM2: Number(d.refPrice) || null,
    }),
    [report, sun, d.refRent, d.refPrice],
  );

  const property: Property = { ...d, type: d.mode === "rent" ? "apartment" : d.type, floor };
  const result = d.area > 5 ? estimate(d.mode, property, location) : null;
  const asking = Number(d.asking.replace(/[’',\s]/g, ""));
  const verdict = result && asking > 0 ? compareAsking(asking, result) : null;
  const sales = d.mode === "buy" && canton === "ZH" ? zurichSales(report.municipality?.number, property.type) : null;
  const rents = typicalRents(canton);
  const rk = roomKey(d.rooms);

  const place = report.municipality ? `${report.municipality.name}${swiss ? ` (${canton})` : ""}` : "this area";
  const verdictText = result
    ? `A ${roomsLabel(d.rooms)}-room ${property.type === "house" ? "house" : "flat"} of ${d.area} m² in ${place} ${d.mode === "rent" ? `rents for about ${money(result.value, swiss)} a month` : `sells for about ${money(result.value, swiss)}`}.`
    : swiss
      ? "Enter the property details to estimate its price."
      : "Price statistics are bundled for Switzerland. Elsewhere, enter a local reference price per m² to use the estimator.";

  return (
    <Section ref={ref} id="prices" icon={Banknote} accent="var(--color-lime-deep)" title="Price estimate" verdict={verdictText}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={d.mode} onChange={(v) => set("mode", v)} options={[["rent", "Rent"], ["buy", "Buy"]]} label="Rent or buy" />
        {d.mode === "buy" && <Segmented value={d.type} onChange={(v) => set("type", v)} options={[["apartment", "Apartment"], ["house", "House"]]} label="Property type" />}
      </div>

      <div className="mt-5 grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <Field label="Living area">
          <NumberInput value={d.area} onChange={(v) => set("area", v)} suffix="m²" min={10} max={1000} />
        </Field>
        <Field label="Rooms">
          <select value={d.rooms} onChange={(e) => set("rooms", Number(e.target.value))} className={INPUT}>
            {Array.from({ length: 15 }, (_, i) => 1 + i * 0.5).map((r) => (
              <option key={r} value={r}>
                {roomsLabel(r)} rooms
              </option>
            ))}
          </select>
        </Field>
        {property.type === "apartment" && (
          <Field label="Floor" hint="Shared with the Sunlight section">
            <select value={floor} onChange={(e) => onFloor(Number(e.target.value))} className={INPUT}>
              {Array.from({ length: 21 }, (_, i) => i).map((f) => (
                <option key={f} value={f}>
                  {floorName(f)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Built">
          <select value={d.period} onChange={(e) => set("period", e.target.value as Period)} className={INPUT}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fittings" wide>
          <Segmented
            value={d.quality}
            onChange={(v) => set("quality", v)}
            options={[["simple", "Simple"], ["standard", "Standard"], ["upscale", "Upscale"], ["luxury", "Luxury"]] as [Quality, string][]}
            label="Fittings"
            full
          />
        </Field>
        {d.period !== "new" && (
          <Field label="Condition" wide>
            <Segmented
              value={d.condition}
              onChange={(v) => set("condition", v)}
              options={[["needs-work", "Needs work"], ["average", "Average"], ["renovated", "Renovated"]] as [Condition, string][]}
              label="Condition"
              full
            />
          </Field>
        )}
        <Field label="Features" wide>
          <div className="flex flex-wrap gap-2">
            <Chip on={d.balcony} onClick={() => set("balcony", !d.balcony)}>Balcony or terrace</Chip>
            {property.type === "apartment" && <Chip on={d.elevator} onClick={() => set("elevator", !d.elevator)}>Lift</Chip>}
            {(property.type === "house" || floor === 0) && <Chip on={d.garden} onClick={() => set("garden", !d.garden)}>Private garden</Chip>}
            {(["none", "partial", "lake"] as View[]).map((v) => (
              <Chip key={v} on={d.view === v} onClick={() => set("view", v)}>
                {v === "none" ? "No view" : v === "partial" ? "Open view" : "Lake or mountain view"}
              </Chip>
            ))}
          </div>
        </Field>
        {!swiss && (
          <>
            <Field label="Local average rent per m² a month" hint="In your currency">
              <input inputMode="decimal" value={d.refRent} onChange={(e) => set("refRent", e.target.value)} className={INPUT} placeholder="e.g. 18" />
            </Field>
            <Field label="Local average purchase price per m²" hint="In your currency">
              <input inputMode="decimal" value={d.refPrice} onChange={(e) => set("refPrice", e.target.value)} className={INPUT} placeholder="e.g. 9000" />
            </Field>
          </>
        )}
        <Field label={d.mode === "rent" ? "Asking rent (net, per month)" : "Asking price"} hint="Optional, to check a listing" wide>
          <input inputMode="numeric" value={d.asking} onChange={(e) => set("asking", e.target.value)} className={INPUT} placeholder={d.mode === "rent" ? "e.g. 2’350" : "e.g. 1’250’000"} />
        </Field>
      </div>

      {result && <Result result={result} swiss={swiss} verdict={verdict} asking={asking} />}
      {result && <Breakdown result={result} swiss={swiss} />}

      {sales && result && (
        <div className="mt-8">
          <SubHeading aside={`${sales.n.toLocaleString("de-CH")} sales in ${SALES_YEAR}`}>
            {property.type === "house" ? "Houses" : "Condominiums"} sold in {REGION_LABEL[sales.region] ?? sales.region}
          </SubHeading>
          <SalesRange sales={sales} estimate={result.value} asking={asking > 0 ? asking : null} />
        </div>
      )}

      {d.mode === "rent" && rents && (
        <div className="mt-8">
          <SubHeading aside={`${cantonInfo(canton)!.name}, ${RENT_YEAR}`}>Average rents in the canton</SubHeading>
          <div className="overflow-hidden rounded-3xl border border-line">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-paper text-left text-[12px] text-muted">
                  <th className="px-4 py-2 font-medium">Rooms</th>
                  <th className="px-2 py-2 text-right font-medium">Size</th>
                  <th className="px-2 py-2 text-right font-medium">Per m²</th>
                  <th className="px-2 py-2 text-right font-medium">All tenants</th>
                  <th className="px-4 py-2 text-right font-medium">Advertised</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rents.map((r) => (
                  <tr key={r.rooms} className={`border-t border-line ${r.rooms === rk ? "bg-lime/25" : ""}`}>
                    <td className="px-4 py-2 font-medium">{r.rooms}</td>
                    <td className="px-2 py-2 text-right text-ink-2">{Math.round(r.area)} m²</td>
                    <td className="px-2 py-2 text-right text-ink-2">{chf2.format(r.perM2)}</td>
                    <td className="px-2 py-2 text-right">
                      {chf.format(r.average)}
                      {r.margin == null && <span className="text-muted">*</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{chf.format(Math.round(r.advertised / 10) * 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Net rent per month in CHF, excluding service charges. "All tenants" is what sitting tenants pay on average; "Advertised" adds the
            premium listings ask over that.
            {rents.some((r) => r.margin == null) ? " * Too few cases for an official figure; estimated from the canton's overall level." : ""}
          </p>
        </div>
      )}

      <p className="mt-6 flex gap-2 text-[13px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {swiss
            ? `An estimate, not a valuation. It starts from the rents tenants actually pay (Swiss Federal Statistical Office ${RENT_YEAR}, including cooperatives) and lifts them to advertised levels using the only open comparison of listings with paid rents, from Winterthur (${ASKING_YEARS}). Purchase prices convert that rent with multiples calibrated on ${SALES_YEAR} sales in canton Zurich. Size, age and urban-rural adjustments come from federal statistics; fittings, floor, view and the noise, flight, sun and amenity steps use typical Swiss price differences and this report.`
            : "Without official statistics for this country, the estimate scales your reference price by the same adjustments for size, age, fittings, floor and location used for Swiss addresses."}
        </span>
      </p>
    </Section>
  );
});

export default PriceSection;

const INPUT =
  "h-11 w-full rounded-2xl border border-line bg-card px-3.5 text-[15px] text-ink outline-none transition focus:border-ink/40 focus:shadow-[0_0_0_4px_rgb(212_242_106/0.45)]";

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
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

function NumberInput({ value, onChange, suffix, min, max }: { value: number; onChange: (v: number) => void; suffix: string; min: number; max: number }) {
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

function Segmented<T extends string>({ value, onChange, options, label, full }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string; full?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-full bg-paper p-1 ${full ? "flex w-full" : ""}`}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-medium transition sm:px-3.5 sm:text-[14px] ${full ? "flex-1" : ""} ${value === v ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

function Result({ result, swiss, verdict, asking }: { result: Estimate; swiss: boolean; verdict: ReturnType<typeof compareAsking> | null; asking: number }) {
  const rent = result.mode === "rent";
  return (
    <div className="mt-6 overflow-hidden rounded-3xl bg-forest p-5 text-white sm:p-6" aria-live="polite">
      <div className="text-[13px] font-medium text-white/70">{rent ? "Estimated advertised rent, net per month" : "Estimated purchase price"}</div>
      <div className="mt-1 font-display text-[44px] font-bold leading-none tracking-tight text-lime tabular sm:text-[52px]">{money(result.value, swiss)}</div>
      <div className="mt-2 text-[14px] text-white/75 tabular">
        Likely between {money(result.low, swiss)} and {money(result.high, swiss)} · {swiss ? "CHF " : ""}
        {rent ? chf2.format(result.perM2) : chf.format(Math.round(result.perM2 / 10) * 10)} per m²
      </div>
      {result.paid != null && <div className="mt-1 text-[13px] text-white/60 tabular">A sitting tenant of a comparable flat pays about {money(result.paid, swiss)}</div>}
      {verdict && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white/10 p-3.5">
          <ToneDot tone={verdict.tone} className="mt-1.5" />
          <div className="text-[14px] leading-snug">
            <div className="font-semibold">
              {verdict.label}: asking {money(asking, swiss)} is {Math.abs(Math.round(verdict.diff * 100))}% {verdict.diff >= 0 ? "above" : "below"}
            </div>
            <div className="text-white/75">{verdict.advice}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Breakdown({ result, swiss }: { result: Estimate; swiss: boolean }) {
  const max = Math.max(0.1, ...result.steps.filter((s) => s.id !== "capitalise").map((s) => Math.abs(s.factor - 1)));
  const unit = swiss ? "CHF " : "";
  return (
    <div className="mt-6">
      <SubHeading>How the estimate is built</SubHeading>
      <ol className="divide-y divide-line overflow-hidden rounded-3xl border border-line">
        <li className="flex items-baseline gap-3 bg-paper px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">{result.base.label}</div>
            <div className="text-[12px] text-muted">{result.base.source}</div>
          </div>
          <div className="shrink-0 text-[14px] font-semibold tabular">
            {unit}
            {chf2.format(result.base.perM2)} /m²
          </div>
        </li>
        {result.steps.map((s) =>
          s.id === "capitalise" ? (
            <li key={s.id} className="flex items-baseline gap-3 bg-paper px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{s.label}</div>
                <div className="text-[12px] text-muted">{s.detail}</div>
              </div>
              <div className="shrink-0 text-right text-[14px] font-semibold tabular">
                × {(s.factor / 12).toFixed(1)}
                <div className="text-[11px] font-normal text-muted">years of rent</div>
              </div>
            </li>
          ) : (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[14px]">{s.label}</div>
                <div className="truncate text-[12px] text-muted" title={s.detail}>
                  {s.detail}
                </div>
              </div>
              <div className="relative hidden h-1.5 w-24 shrink-0 sm:block" aria-hidden>
                <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <div
                  className="absolute inset-y-0 rounded-full bg-ink/45"
                  style={s.factor >= 1 ? { left: "50%", width: `${(50 * (s.factor - 1)) / max}%` } : { right: "50%", width: `${(50 * (1 - s.factor)) / max}%` }}
                />
              </div>
              <div className="w-14 shrink-0 text-right text-[14px] font-medium tabular">{pct(s.factor)}</div>
            </li>
          ),
        )}
        <li className="flex items-baseline gap-3 bg-paper px-4 py-3">
          <div className="flex-1 text-[14px] font-semibold">Estimate</div>
          <div className="text-[14px] font-semibold tabular">
            {unit}
            {result.mode === "rent" ? chf2.format(result.perM2) : chf.format(Math.round(result.perM2 / 10) * 10)} /m²
          </div>
        </li>
      </ol>
    </div>
  );
}

function SalesRange({ sales, estimate, asking }: { sales: { q10: number; q25: number; median: number; q75: number; q90: number }; estimate: number; asking: number | null }) {
  const lo = Math.min(sales.q10, estimate, asking ?? Infinity) * 0.92;
  const hi = Math.max(sales.q90, estimate, asking ?? 0) * 1.05;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const mark = (v: number, label: string, dark: boolean) => (
    <div className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: x(v) }}>
      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${dark ? "bg-ink text-white" : "border border-ink bg-card text-ink"}`}>{label}</span>
      <span className="h-5 w-0.5 bg-ink" />
    </div>
  );
  return (
    <div className="px-1" role="img" aria-label={`Middle half of sales between CHF ${chf.format(sales.q25)} and ${chf.format(sales.q75)}, median ${chf.format(sales.median)}`}>
      <div className="relative h-24">
        {mark(estimate, "Estimate", true)}
        {asking != null && mark(asking, "Asking", false)}
        <div className="absolute inset-x-0 top-[46px] h-3 rounded-full bg-wash" />
        <div className="absolute top-[46px] h-3 rounded-full" style={{ left: x(sales.q10), width: `calc(${x(sales.q90)} - ${x(sales.q10)})`, background: "color-mix(in oklab, var(--color-lime-deep) 35%, white)" }} />
        <div className="absolute top-[46px] h-3 rounded-full bg-lime-deep" style={{ left: x(sales.q25), width: `calc(${x(sales.q75)} - ${x(sales.q25)})` }} />
        <div className="absolute top-[42px] h-5 w-0.5 bg-forest" style={{ left: x(sales.median) }} />
        <div className="absolute inset-x-0 top-[66px] text-[11px] text-muted tabular">
          {[
            [sales.q25, "25%"],
            [sales.median, "median"],
            [sales.q75, "75%"],
          ].map(([v, l]) => (
            <span key={l as string} className="absolute -translate-x-1/2 text-center leading-tight" style={{ left: x(v as number) }}>
              <span className="block font-medium text-ink-2">{money(v as number, false)}</span>
              {l}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-3 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-lime-deep" aria-hidden /> Middle half of sales
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ background: "color-mix(in oklab, var(--color-lime-deep) 35%, white)" }} aria-hidden /> 10–90%
        </span>
        <span>All sizes, so use it as a sense check</span>
      </p>
    </div>
  );
}
