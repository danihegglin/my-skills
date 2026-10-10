// Alert emails: confirmation and listing digests, sent through Resend when it is configured.

import type { Listing, Mode } from "./alerts";

export type Email = { to: string; subject: string; html: string; text: string; unsubscribe?: string };
export type Mailer = (email: Email) => Promise<void>;

/** A Resend sender, or null while RESEND_API_KEY and ALERTS_FROM aren't set. */
export function resendMailer(apiKey: string | undefined, from: string | undefined): Mailer | null {
  if (!apiKey || !from) return null;
  return async (e) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [e.to],
        subject: e.subject,
        html: e.html,
        text: e.text,
        headers: e.unsubscribe ? { "List-Unsubscribe": `<${e.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const chf = (n: number) => `CHF ${Math.round(n).toLocaleString("de-CH").replace(/[’']/g, "'")}`;

type Sub = { token: string; email: string; area_label: string; mode: Mode; budget: number | null; min_score: number };

function prefs(s: Sub) {
  const what = s.mode === "buy" ? "homes for sale" : "homes to rent";
  const budget = s.budget ? ` up to ${chf(s.budget)}${s.mode === "rent" ? " a month" : ""}` : "";
  return `${what} in ${s.area_label}${budget} scoring ${s.min_score} or more`;
}

const shell = (body: string, footer: string) => `<!doctype html><html><body style="margin:0;background:#f6f5f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:20px">PropLens</div>
<div style="background:#fff;border:1px solid #e7e5df;border-radius:18px;padding:24px">${body}</div>
<p style="font-size:12px;line-height:1.5;color:#71717a;margin-top:18px">${footer}</p>
</div></body></html>`;

export function confirmEmail(s: Sub, base: string): Email {
  const link = `${base}/?alerts=confirm&token=${encodeURIComponent(s.token)}`;
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 10px">Confirm your listing alerts</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 18px">You asked to hear about ${esc(prefs(s))}. Confirm and we'll email you when a new listing at a matching address comes up.</p>
<a href="${esc(link)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">Confirm alerts</a>`,
    `If you didn't sign up, ignore this email and you won't hear from us again. <a href="${esc(`${base}/?alerts=manage&token=${encodeURIComponent(s.token)}`)}" style="color:#71717a">Manage your subscription</a>`,
  );
  return { to: s.email, subject: `Confirm your PropLens alerts for ${s.area_label}`, html, text: `Confirm your alerts for ${prefs(s)}:\n${link}\n\nIf you didn't sign up, ignore this email.` };
}

export type DigestItem = Pick<Listing, "url" | "title" | "address" | "price" | "rooms" | "space" | "mode"> & { score: number; home: { address: string; lat: number; lon: number } };

export function digestEmail(s: Sub, items: DigestItem[], more: number, base: string): Email {
  const unsubscribe = `${base}/?alerts=unsubscribe&token=${encodeURIComponent(s.token)}`;
  const manage = `${base}/?alerts=manage&token=${encodeURIComponent(s.token)}`;
  const report = (i: DigestItem) => `${base}/?${new URLSearchParams({ q: i.home.address, s: s.area_label, lat: i.home.lat.toFixed(6), lon: i.home.lon.toFixed(6) })}`;
  const facts = (i: DigestItem) =>
    [i.rooms ? `${i.rooms} rooms` : "", i.space ? `${i.space} m²` : "", i.price ? `${chf(i.price)}${i.mode === "rent" ? "/month" : ""}` : "Price on request"].filter(Boolean).join(" · ");
  const rows = items
    .map(
      (i) => `<tr><td style="padding:14px 0;border-top:1px solid #efeee9;vertical-align:top;width:52px">
<div style="width:40px;height:40px;border-radius:999px;background:${i.score >= 80 ? "#0ca30c" : "#7cbf3a"};color:#fff;font-weight:700;font-size:15px;line-height:40px;text-align:center">${i.score}</div></td>
<td style="padding:14px 0;border-top:1px solid #efeee9">
<a href="${esc(i.url)}" style="color:#18181b;font-weight:600;font-size:15px;text-decoration:none">${esc(i.title)}</a>
<div style="font-size:13px;color:#52525b;margin-top:2px">${esc(i.address)}</div>
<div style="font-size:13px;color:#52525b;margin-top:2px">${esc(facts(i))}</div>
<div style="font-size:13px;margin-top:6px"><a href="${esc(i.url)}" style="color:#2a78d6">View listing</a> · <a href="${esc(report(i))}" style="color:#2a78d6">PropLens report</a></div>
</td></tr>`,
    )
    .join("");
  const n = items.length + more;
  const subject = `${n} new ${n === 1 ? "listing" : "listings"} in ${s.area_label} scoring ${s.min_score}+`;
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 6px">${esc(subject)}</h1>
<p style="font-size:14px;line-height:1.5;color:#52525b;margin:0 0 8px">Matching your alert for ${esc(prefs(s))}. Scores are for the address: noise, schools, shopping and sunlight.</p>
<table style="width:100%;border-collapse:collapse">${rows}</table>
${more ? `<p style="font-size:13px;color:#52525b">And ${more} more; they'll follow in the next email.</p>` : ""}`,
    `Listings from Flatfox. You get this because you subscribed to PropLens alerts. <a href="${esc(unsubscribe)}" style="color:#71717a">Unsubscribe from this alert</a> · <a href="${esc(manage)}" style="color:#71717a">Manage your subscription</a>`,
  );
  const text = [
    subject,
    "",
    ...items.map((i) => `${i.score}  ${i.title}\n    ${i.address}\n    ${facts(i)}\n    ${i.url}`),
    more ? `\nAnd ${more} more in the next email.` : "",
    `\nUnsubscribe from this alert: ${unsubscribe}\nManage your subscription: ${manage}`,
  ].join("\n");
  return { to: s.email, subject, html, text, unsubscribe: `${base}/api/alerts/unsubscribe?token=${encodeURIComponent(s.token)}` };
}
