import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutParams, createCheckout, form, periodEnd, verifySignature } from "./billing";

const env = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_test_x", STRIPE_PRICE_ID: "price_123" };

async function sign(payload: string, secret: string, t: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

afterEach(() => vi.unstubAllGlobals());

describe("Stripe requests", () => {
  it("form-encodes nested keys and skips undefined values", () => {
    expect(form({ "line_items[0][price]": "price_1", quantity: 1, flag: true, none: undefined, email: "a+b@c.ch" })).toBe(
      "line_items%5B0%5D%5Bprice%5D=price_1&quantity=1&flag=true&email=a%2Bb%40c.ch",
    );
  });

  it("sells the yearly price as an embedded subscription tied to the email", () => {
    expect(checkoutParams(env, "a@b.ch", null, "embedded_page")).toMatchObject({
      mode: "subscription",
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      "line_items[0][price]": "price_123",
      customer_email: "a@b.ch",
      "metadata[email]": "a@b.ch",
      "subscription_data[metadata][email]": "a@b.ch",
    });
    // A returning customer is reused rather than duplicated.
    const again: Record<string, unknown> = checkoutParams(env, "a@b.ch", "cus_9", "embedded_page");
    expect(again.customer).toBe("cus_9");
    expect("customer_email" in again).toBe(false);
  });

  it("falls back to the older embedded mode name for accounts on older API versions", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return bodies.length === 1
          ? new Response(JSON.stringify({ error: { message: "Invalid ui_mode", param: "ui_mode" } }), { status: 400 })
          : new Response(JSON.stringify({ id: "cs_test_1", client_secret: "cs_test_1_secret" }), { status: 200 });
      }),
    );
    await expect(createCheckout(env, "a@b.ch", null)).resolves.toEqual({ id: "cs_test_1", client_secret: "cs_test_1_secret" });
    expect(bodies[0]).toContain("ui_mode=embedded_page");
    expect(bodies[1]).toContain("ui_mode=embedded&");
  });
});

describe("webhooks", () => {
  const payload = JSON.stringify({ type: "customer.subscription.updated" });
  const now = 1_790_000_000_000;
  const t = now / 1000;

  it("accepts a correctly signed, recent event", async () => {
    const sig = await sign(payload, "whsec_1", t);
    expect(await verifySignature(payload, `t=${t},v1=${sig}`, "whsec_1", now)).toBe(true);
    // Stripe may send several signatures while a secret is rolled.
    expect(await verifySignature(payload, `t=${t},v1=deadbeef,v1=${sig}`, "whsec_1", now)).toBe(true);
  });

  it("rejects wrong secrets, tampered payloads, replays and missing headers", async () => {
    const sig = await sign(payload, "whsec_1", t);
    expect(await verifySignature(payload, `t=${t},v1=${sig}`, "whsec_2", now)).toBe(false);
    expect(await verifySignature(payload.replace("updated", "deleted"), `t=${t},v1=${sig}`, "whsec_1", now)).toBe(false);
    expect(await verifySignature(payload, `t=${t},v1=${sig}`, "whsec_1", now + 10 * 60_000)).toBe(false);
    expect(await verifySignature(payload, null, "whsec_1", now)).toBe(false);
    expect(await verifySignature(payload, `t=${t}`, "whsec_1", now)).toBe(false);
  });
});

describe("subscriptions", () => {
  it("reads the period end from the subscription or, on newer API versions, its items", () => {
    expect(periodEnd({ id: "sub", customer: "cus", status: "active", current_period_end: 1_800_000_000 })).toBe(1_800_000_000_000);
    expect(periodEnd({ id: "sub", customer: "cus", status: "active", items: { data: [{ current_period_end: 1_800_000_000 }, { current_period_end: 1_700_000_000 }] } })).toBe(
      1_800_000_000_000,
    );
    expect(periodEnd({ id: "sub", customer: "cus", status: "incomplete" })).toBeNull();
  });
});
