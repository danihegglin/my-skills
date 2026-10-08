import { BellOff, BellRing, Check, CreditCard, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { alertAction } from "../lib/alerts";
import { portalUrl } from "../lib/billing";
import Logo from "./Logo";

const COPY = {
  confirm: {
    icon: BellRing,
    title: "Confirm your listing alerts",
    body: "One click and we'll start emailing you new listings at addresses that score at or above your minimum.",
    button: "Confirm alerts",
    done: ["Alerts confirmed", "You'll hear from us when a matching listing comes up. Every email has a link to unsubscribe."],
  },
  unsubscribe: {
    icon: BellOff,
    title: "Unsubscribe from this alert?",
    body: "We'll stop emailing you about this area right away and delete the alert.",
    button: "Unsubscribe",
    done: ["You're unsubscribed", "You won't get any more emails for this alert. Your yearly subscription keeps running for your other alerts; manage it from any alert email."],
  },
  manage: {
    icon: CreditCard,
    title: "Manage your subscription",
    body: "Cancel your alerts subscription, change your card or download invoices on Stripe's secure billing page.",
    button: "Open billing page",
    done: ["Opening Stripe…", "Taking you to the billing page."],
  },
} as const;

type Action = keyof typeof COPY;

/** Landing spot for the confirm and unsubscribe links in alert emails. A button press, so link scanners can't act on them. */
export default function AlertLink({ action, token, onHome }: { action: Action; token: string; onHome: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const c = COPY[action];
  const Icon = state === "done" ? Check : c.icon;

  async function run() {
    setState("busy");
    setError(null);
    try {
      if (action === "manage") {
        location.href = await portalUrl(token);
        return;
      }
      await alertAction(action, token);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-7xl items-center px-5 py-5 sm:px-8">
        <Logo onClick={onHome} />
      </header>
      <main className="mx-auto max-w-lg px-5 pt-10 sm:pt-20">
        <div className="rounded-[28px] border border-line bg-card p-7 animate-rise sm:p-9">
          <span className="grid size-12 place-items-center rounded-2xl bg-lime">
            <Icon className="size-6 text-ink" aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-[30px] font-bold leading-tight tracking-tight">{state === "done" ? c.done[0] : c.title}</h1>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2" role="status">
            {state === "done" ? c.done[1] : c.body}
          </p>
          {state !== "done" ? (
            <button
              onClick={run}
              disabled={state === "busy"}
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition hover:bg-forest disabled:opacity-70"
            >
              {state === "busy" && <LoaderCircle className="size-[18px] animate-spin text-lime" aria-hidden />}
              {c.button}
            </button>
          ) : (
            <button onClick={onHome} className="mt-7 inline-flex h-12 items-center rounded-full border border-line px-6 text-[15px] font-medium text-ink transition hover:border-ink">
              Go to PropLens
            </button>
          )}
          {error && (
            <p role="alert" className="mt-4 text-[14px] font-medium text-critical">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
