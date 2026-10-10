// Stripe billing for listing alerts: one yearly subscription per email address, sold through embedded Checkout.

export type BillingEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  /** The yearly Price to sell (price_…), e.g. CHF 5 a year. */
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export const billingEnabled = (env: BillingEnv) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_PRICE_ID);

/** Days a lapsed subscription keeps alerts running while Stripe retries the renewal payment. */
export const GRACE_DAYS = 7;

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly param?: string) {
    super(message);
  }
}

/** Form-encodes flat Stripe parameters (`line_items[0][price]` style keys). */
export function form(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export async function stripe<T>(env: BillingEnv, method: "GET" | "POST", path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const body = params ? form(params) : undefined;
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; param?: string } };
  if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe answered ${res.status}`, res.status, json.error?.param);
  return json;
}

export type Price = { amount: number; currency: string; interval: string };

let priceCache: { id: string; at: number; price: Price } | null = null;

/** The configured price, for display; cached for ten minutes per isolate. */
export async function getPrice(env: BillingEnv): Promise<Price> {
  if (priceCache && priceCache.id === env.STRIPE_PRICE_ID && Date.now() - priceCache.at < 600_000) return priceCache.price;
  const p = await stripe<{ unit_amount: number | null; currency: string; recurring: { interval: string } | null }>(env, "GET", `prices/${env.STRIPE_PRICE_ID}`);
  const price = { amount: p.unit_amount ?? 0, currency: p.currency, interval: p.recurring?.interval ?? "year" };
  priceCache = { id: env.STRIPE_PRICE_ID!, at: Date.now(), price };
  return price;
}

export function checkoutParams(env: BillingEnv, email: string, customer: string | null, uiMode: string) {
  return {
    mode: "subscription",
    ui_mode: uiMode,
    // The page shows its own confirmation, so redirect-only payment methods are left out.
    redirect_on_completion: "never",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": 1,
    ...(customer ? { customer } : { customer_email: email }),
    "metadata[email]": email,
    "subscription_data[metadata][email]": email,
    allow_promotion_codes: true,
    locale: "auto",
  };
}

/** An embedded Checkout Session for the alert subscription. */
export async function createCheckout(env: BillingEnv, email: string, customer: string | null): Promise<{ id: string; client_secret: string }> {
  // Stripe renamed the mode in recent API versions; accounts pinned to an older version still expect "embedded".
  try {
    return await stripe(env, "POST", "checkout/sessions", checkoutParams(env, email, customer, "embedded_page"));
  } catch (err) {
    if (err instanceof StripeError && err.status === 400 && err.param === "ui_mode") return stripe(env, "POST", "checkout/sessions", checkoutParams(env, email, customer, "embedded"));
    throw err;
  }
}

export type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
};

/** End of the paid period in ms. Newer API versions keep it on the subscription items. */
export function periodEnd(sub: StripeSubscription): number | null {
  const s = sub.current_period_end ?? sub.items?.data?.reduce<number | null>((a, i) => (i.current_period_end ? Math.max(a ?? 0, i.current_period_end) : a), null);
  return s ? s * 1000 : null;
}

/** Statuses during which alerts keep running (past due: Stripe is still retrying the renewal). */
export const PAYING = new Set(["active", "trialing", "past_due"]);

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Verifies a `Stripe-Signature` header (HMAC-SHA256 over "timestamp.payload"), allowing five minutes of clock skew. */
export async function verifySignature(payload: string, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !signatures.length || Math.abs(now / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  // Constant-time comparison.
  return signatures.some((sig) => sig.length === expected.length && [...sig].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}
