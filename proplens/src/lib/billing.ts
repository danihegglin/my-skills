// Alert subscriptions are paid through Stripe's embedded Checkout.

export type BillingConfig = { enabled: false } | { enabled: true; publishableKey: string; amount: number; currency: string; interval: string };

let config: Promise<BillingConfig> | null = null;

export function billingConfig(): Promise<BillingConfig> {
  config ??= fetch("/api/billing/config")
    .then((r) => (r.ok ? (r.json() as Promise<BillingConfig>) : { enabled: false as const }))
    .catch(() => {
      config = null;
      return { enabled: false as const };
    });
  return config;
}

/** "CHF 5 a year" */
export function priceLabel(c: { amount: number; currency: string; interval: string }) {
  const amount = c.amount % 100 ? (c.amount / 100).toFixed(2) : String(c.amount / 100);
  return `${c.currency.toUpperCase()} ${amount} a ${c.interval}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status})`);
  return json;
}

/** Tells the server the payment went through, which switches the alert on and sends the confirmation email. */
export const completeCheckout = (sessionId: string) => post<{ confirmation: "sent" | "pending" | "confirmed" }>("/api/billing/complete", { sessionId });

/** A Stripe customer-portal link (cancel, change card, invoices) for the subscription behind an alert. */
export const portalUrl = (token: string) => post<{ url: string }>("/api/billing/portal", { token }).then((r) => r.url);

/** Mounts embedded Checkout into `el`; Stripe.js loads from js.stripe.com on first use. */
export async function mountCheckout(publishableKey: string, clientSecret: string, el: HTMLElement, onComplete: () => void) {
  const { loadStripe } = await import("@stripe/stripe-js");
  const stripe = await loadStripe(publishableKey);
  if (!stripe) throw new Error("The payment form couldn't load");
  const checkout = await stripe.createEmbeddedCheckoutPage({ clientSecret, onComplete });
  checkout.mount(el);
  return checkout;
}
