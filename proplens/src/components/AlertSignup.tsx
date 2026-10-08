import { ArrowLeft, ArrowRight, BellRing, Check, CreditCard, LoaderCircle, MailCheck, Map as MapIcon } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";
import type { AlertForm, AlertMode, Confirmation } from "../lib/alerts";
import { subscribe } from "../lib/alerts";
import type { BillingConfig } from "../lib/billing";
import { billingConfig, completeCheckout, mountCheckout, priceLabel } from "../lib/billing";
import type { AreaRef } from "../lib/area";
import type { LatLon } from "../lib/geo";
import type { AreaRanking, RankingUpdate } from "../lib/useAreaRanking";
import { cachedRanking, rankArea } from "../lib/useAreaRanking";
import { Field, INPUT, Segmented } from "./form";
import { Section, scoreWord } from "./ui";

type Props = {
  /** Areas to choose from; the first is preselected. */
  areas: AreaRef[];
  /** The ranking of the chosen area when the page already has it; otherwise the area is ranked on submit. */
  ranking?: AreaRanking | null;
  /** Centre of the ranked window for areas too large to rank whole. */
  focus?: LatLon;
  onExplore?: (area: AreaRef) => void;
};

const MIN_SCORES = [60, 65, 70, 75, 80, 85, 90];

const AlertSignup = forwardRef<HTMLElement, Props>(function AlertSignup({ areas, ranking, focus, onExplore }, ref) {
  const [areaId, setAreaId] = useState(areas[0]?.id);
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const [form, setForm] = useState<AlertForm>({ email: "", mode: "rent", budget: null, minScore: 75, consent: false, website: "" });
  const [busy, setBusy] = useState<RankingUpdate | "sending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ confirmation: Confirmation; email: string; area: string } | null>(null);
  const [payment, setPayment] = useState<{ clientSecret: string; sessionId: string; email: string; area: string } | null>(null);
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  useEffect(() => {
    billingConfig().then(setBilling);
  }, []);
  const set = <K extends keyof AlertForm>(k: K, v: AlertForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Stop a ranking started from this form if the page goes away.
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  if (!area) return null;
  const known = ranking ?? cachedRanking(area, focus);
  const homes = known?.homes;
  const matching = homes ? homes.filter((h) => h.score >= form.minScore).length : null;

  async function submit() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return setError("Please enter a valid email address.");
    if (!form.consent) return setError("Please tick the box to agree to receive alerts.");
    ctrl.current = new AbortController();
    const signal = ctrl.current.signal;
    try {
      const r = known ?? (await rankArea(area, focus, signal, (u) => !signal.aborted && setBusy(u)));
      if (!r.homes.length) throw new Error(`We couldn't find any homes with an address in ${area.label}.`);
      setBusy("sending");
      const result = await subscribe(form, area, r);
      if ("payment" in result) setPayment({ ...result.payment, email: form.email.trim(), area: area.label });
      else setDone({ confirmation: result.confirmation, email: form.email.trim(), area: area.label });
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      if (!signal.aborted) setBusy(null);
    }
  }

  const budgetHint = form.mode === "rent" ? "CHF per month, incl. utilities" : "CHF";

  return (
    <Section
      ref={ref}
      id="alerts"
      icon={BellRing}
      accent="var(--color-lime-deep)"
      title="Listing alerts"
      verdict={
        <>
          Get an email when a home {form.mode === "rent" ? "to rent" : "for sale"} comes up in <b className="font-semibold text-ink">{area.label}</b> at an address that scores{" "}
          <b className="font-semibold text-ink">{form.minScore} or more</b>.
        </>
      }
    >
      {done ? (
        <Done {...done} />
      ) : payment && billing?.enabled ? (
        <Payment
          {...payment}
          billing={billing}
          onBack={() => setPayment(null)}
          onPaid={(confirmation) => {
            setDone({ confirmation, email: payment.email, area: payment.area });
            setPayment(null);
          }}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
          noValidate
        >
          {areas.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Area">
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={a.id === area.id}
                  onClick={() => setAreaId(a.id)}
                  className={`rounded-2xl border px-3.5 py-2 text-left transition ${a.id === area.id ? "border-ink bg-ink text-white" : "border-line bg-card text-ink hover:border-ink/30"}`}
                >
                  <span className="block text-[14px] font-semibold">{a.label}</span>
                  <span className={`block text-[12px] ${a.id === area.id ? "text-white/70" : "text-muted"}`}>{a.detail}</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <Field label="Looking to">
              <Segmented value={form.mode} onChange={(v: AlertMode) => set("mode", v)} options={[["rent", "Rent"], ["buy", "Buy"]]} label="Rent or buy" full />
            </Field>
            <Field label="Budget" hint={budgetHint}>
              <BudgetInput value={form.budget} onChange={(v) => set("budget", v)} placeholder={form.mode === "rent" ? "Any, e.g. 3200" : "Any, e.g. 1200000"} />
            </Field>
            <Field label="Minimum PropLens score" hint={matching != null ? `${matching.toLocaleString("en")} of ${homes!.length.toLocaleString("en")} addresses qualify` : undefined} wide>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Minimum score">
                {MIN_SCORES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={form.minScore === s}
                    onClick={() => set("minScore", s)}
                    className={`min-w-14 rounded-full border px-3 py-1.5 text-[14px] font-semibold tabular transition ${form.minScore === s ? "border-ink bg-ink text-white" : "border-line bg-card text-ink-2 hover:border-ink/30"}`}
                  >
                    {s}+
                  </button>
                ))}
              </div>
              <span className="mt-1.5 block text-[13px] text-muted">{scoreWord(form.minScore)} and better. The score covers noise, schools, shopping and sunlight at the address.</span>
            </Field>
            <Field label="Email" wide>
              <input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" className={INPUT} />
            </Field>
          </div>
          {/* Honeypot: hidden from people and screen readers, tempting to bots. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => set("website", e.target.value)} className="absolute -left-[9999px] size-px opacity-0" />

          <label className="mt-5 flex items-start gap-3 text-[14px] leading-snug text-ink-2">
            <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" />
            <span>Email me listings that match. I'll confirm my address first and can unsubscribe from any alert with one click.</span>
          </label>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!!busy || !billing?.enabled}
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition hover:bg-forest disabled:opacity-70"
            >
              {busy || !billing ? <LoaderCircle className="size-[18px] animate-spin text-lime" aria-hidden /> : <CreditCard className="size-[18px] text-lime" aria-hidden />}
              {busy === "sending" ? "Opening payment…" : busy ? "Ranking the area…" : billing?.enabled ? `Continue to payment · ${priceLabel(billing)}` : billing ? "Alerts open soon" : "Create alert"}
            </button>
            {onExplore && (
              <button type="button" onClick={() => onExplore(area)} className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-[15px] font-medium text-ink-2 transition hover:bg-wash hover:text-ink">
                <MapIcon className="size-[18px]" aria-hidden /> See the best addresses in {area.label}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-2.5 text-[13px] leading-snug text-muted">
            {billing?.enabled
              ? `${priceLabel(billing)} covers alerts for every area you add with this email. Secure payment by Stripe; cancel anytime.`
              : billing
                ? "Alerts are a paid subscription and open as soon as payments are set up."
                : ""}
          </p>
          {busy && busy !== "sending" && <RankProgress update={busy} />}
          {error && (
            <p role="alert" className="mt-3 text-[14px] font-medium text-critical">
              {error}
            </p>
          )}

          <ol className="mt-7 grid gap-3 border-t border-line pt-5 text-[13px] leading-snug text-ink-2 sm:grid-cols-3">
            {[
              ["Rank", `Every address in ${area.label} gets its PropLens score, right here in your browser.`],
              ["Scan", "Every three hours we check new listings on Flatfox and match each one to its address."],
              ["Alert", "You get an email with the listings at addresses scoring at or above your minimum."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-paper font-display text-[12px] font-bold text-ink">{i + 1}</span>
                <span>
                  <b className="font-semibold text-ink">{t}.</b> {b}
                </span>
              </li>
            ))}
          </ol>
        </form>
      )}
    </Section>
  );
});

export default AlertSignup;

function BudgetInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder: string }) {
  const [text, setText] = useState(value ? String(value) : "");
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const clean = e.target.value.replace(/[^\d]/g, "");
          setText(clean ? Number(clean).toLocaleString("de-CH") : "");
          onChange(clean ? Number(clean) : null);
        }}
        className={`${INPUT} pr-14 tabular`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[14px] text-muted">CHF</span>
    </div>
  );
}

function RankProgress({ update }: { update: RankingUpdate }) {
  const { steps, progress } = update;
  const scoring = steps.scoring === "pending" && progress && progress.total > 0;
  const loaded = (["boundary", "buildings", "streets", "places", "air", "climate"] as const).filter((s) => steps[s] === "done" || steps[s] === "failed").length;
  const pct = steps.scoring === "done" ? 100 : scoring ? 30 + (70 * progress.done) / progress.total : (30 * loaded) / 6;
  return (
    <div className="mt-4 max-w-md" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-full bg-wash">
        <div className="h-full rounded-full bg-lime-deep transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[13px] text-muted tabular">
        {scoring ? `Scoring ${progress.done.toLocaleString("en")} of ${progress.total.toLocaleString("en")} addresses…` : steps.scoring === "done" ? "Checking the best against official noise maps…" : "Loading buildings, streets, schools and shops…"}
      </p>
    </div>
  );
}

function Done({ confirmation, email, area }: { confirmation: Confirmation; email: string; area: string }) {
  const text: Record<Confirmation, [string, string]> = {
    sent: ["Check your inbox", `We sent a confirmation link to ${email}. Your alerts for ${area} start once you click it.`],
    confirmed: ["Alert is on", `Your subscription covers ${area}; alerts go to ${email} with these settings.`],
    pending: ["You're subscribed", `We'll email ${email} a confirmation link before the first alert for ${area}.`],
  };
  const [title, body] = text[confirmation];
  return (
    <div className="flex items-start gap-4 rounded-3xl bg-paper p-5" role="status">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime">
        {confirmation === "confirmed" ? <Check className="size-5" aria-hidden /> : <MailCheck className="size-5" aria-hidden />}
      </span>
      <div>
        <h3 className="font-display text-[20px] font-bold">{title}</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
      </div>
    </div>
  );
}

/** Stripe's embedded Checkout, inside the alert card. */
function Payment({
  clientSecret,
  sessionId,
  email,
  billing,
  onBack,
  onPaid,
}: {
  clientSecret: string;
  sessionId: string;
  email: string;
  billing: Extract<BillingConfig, { enabled: true }>;
  onBack: () => void;
  onPaid: (c: Confirmation) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  // The page around may re-render while the card is typed in; keep the form mounted regardless.
  const paid = useRef(onPaid);
  paid.current = onPaid;
  const [state, setState] = useState<"loading" | "ready" | "finishing">("loading");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let checkout: Awaited<ReturnType<typeof mountCheckout>> | null = null;
    let gone = false;
    mountCheckout(billing.publishableKey, clientSecret, el.current!, async () => {
      setState("finishing");
      // The webhook would get there too; asking now switches the alert on straight away.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const r = await completeCheckout(sessionId);
          if (!gone) paid.current(r.confirmation);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!gone) paid.current("pending");
    }).then(
      (c) => {
        if (gone) c.destroy();
        else {
          checkout = c;
          setState("ready");
        }
      },
      (err) => !gone && setError(err instanceof Error ? err.message : "The payment form couldn't load."),
    );
    return () => {
      gone = true;
      checkout?.destroy();
    };
  }, [billing.publishableKey, clientSecret, sessionId]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} disabled={state === "finishing"} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-ink-2 transition hover:bg-wash hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
        <span className="text-[13px] text-muted">
          {priceLabel(billing)} · {email}
        </span>
      </div>
      {state !== "ready" && !error && (
        <p className="flex items-center gap-2 py-6 text-[14px] text-ink-2" aria-live="polite">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> {state === "finishing" ? "Payment received, switching your alert on…" : "Loading the secure payment form…"}
        </p>
      )}
      {error && (
        <p role="alert" className="py-4 text-[14px] font-medium text-critical">
          {error}
        </p>
      )}
      <div ref={el} className={state === "finishing" ? "hidden" : "overflow-hidden rounded-2xl"} />
    </div>
  );
}
