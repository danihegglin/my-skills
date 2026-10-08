// Client side of listing alerts: the signup request (with the area ranking) and the email-link actions.

import type { AreaRef } from "./area";
import type { AreaRanking } from "./useAreaRanking";

export type AlertMode = "rent" | "buy";

export type AlertForm = {
  email: string;
  mode: AlertMode;
  budget: number | null;
  minScore: number;
  consent: boolean;
  /** Honeypot, hidden from people. */
  website: string;
};

export type Confirmation = "sent" | "confirmed" | "pending";

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** The signup body: preferences, the area's ranked window and every ranked address with its scores. */
export function signupBody(form: AlertForm, ref: AreaRef, ranking: AreaRanking) {
  return {
    ...form,
    email: form.email.trim(),
    page: location.pathname + location.search,
    area: { id: ref.id, label: ref.label, ...ranking.window },
    homes: ranking.homes.map((h) => [h.address, r5(h.lat), r5(h.lon), h.score, h.scores.noise, h.scores.schools, h.scores.shopping, h.scores.sun]),
    ranked: ranking.ranked,
  };
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status})`);
  return json;
}

export async function subscribe(form: AlertForm, ref: AreaRef, ranking: AreaRanking): Promise<Confirmation> {
  const res = await call<{ confirmation?: Confirmation }>("/api/alerts", signupBody(form, ref, ranking));
  return res.confirmation ?? "pending";
}

export async function alertAction(action: "confirm" | "unsubscribe", token: string): Promise<void> {
  await call(`/api/alerts/${action}`, { token });
}
