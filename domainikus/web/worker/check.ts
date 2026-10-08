// Domain availability: RDAP first, DNS-over-HTTPS as fallback, results cached in SQLite.

import { type CheckResult, normalizeDomain } from "../shared/names";
import type { Store } from "./cache";

const RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const DOH_URL = "https://cloudflare-dns.com/dns-query";
const USER_AGENT = "domainikus/0.1 (+https://github.com/danihegglin/my-skills)";

// ccTLDs that run RDAP but are missing from the IANA bootstrap file.
const RDAP_OVERRIDES: Record<string, string> = {
  ch: "https://rdap.nic.ch/",
  li: "https://rdap.nic.ch/",
  de: "https://rdap.denic.de/",
  io: "https://rdap.identitydigital.services/rdap/",
};

// How long a cached answer stays fresh, in seconds.
const TTL: Record<string, number> = {
  taken: 14 * 86400,
  available: 86400,
  likely_available: 86400,
};
const BOOTSTRAP_TTL = 7 * 86400;

const now = () => Date.now() / 1000;

async function getJson(url: string, accept: string): Promise<{ status: number; body: any; retryAfter?: number }> {
  const res = await fetch(url, { headers: { accept, "user-agent": USER_AGENT } });
  const retryAfter = Number(res.headers.get("retry-after")) || undefined;
  const body = res.ok ? await res.json() : (await res.body?.cancel(), null);
  return { status: res.status, body, retryAfter };
}

async function rdapServers(store: Store): Promise<Record<string, string>> {
  const raw = await store.getKv("rdap_bootstrap", BOOTSTRAP_TTL);
  if (raw) return { ...JSON.parse(raw), ...RDAP_OVERRIDES };
  try {
    const { body } = await getJson(RDAP_BOOTSTRAP_URL, "application/json");
    const servers: Record<string, string> = {};
    for (const [tlds, urls] of body.services as [string[], string[]][]) for (const t of tlds) servers[t] = urls[0];
    await store.putKv("rdap_bootstrap", JSON.stringify(servers));
    return { ...servers, ...RDAP_OVERRIDES };
  } catch {
    return { ...RDAP_OVERRIDES };
  }
}

async function checkRdap(domain: string, servers: Record<string, string>): Promise<CheckResult | null> {
  const base = servers[domain.slice(domain.lastIndexOf(".") + 1)];
  if (!base) return null;
  const url = base.replace(/\/$/, "") + "/domain/" + domain;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, body, retryAfter } = await getJson(url, "application/rdap+json");
      if (status === 200) return result(domain, "taken", "rdap", (body?.status ?? []).join(", "));
      if (status === 404) return result(domain, "available", "rdap");
      if (status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, Math.min((retryAfter ?? 2) * 1000, 5000)));
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

async function checkDns(domain: string): Promise<CheckResult> {
  try {
    const { status, body } = await getJson(`${DOH_URL}?name=${domain}&type=NS`, "application/dns-json");
    if (status !== 200) return result(domain, "unknown", "dns", `DNS lookup failed (${status})`);
    if (body.Answer?.length) return result(domain, "taken", "dns", "has nameservers");
    if (body.Status === 3) return result(domain, "likely_available", "dns", "no DNS record; confirm at a registrar");
    return result(domain, "unknown", "dns", `DNS status ${body.Status}`);
  } catch (e) {
    return result(domain, "unknown", "dns", String(e));
  }
}

function result(domain: string, status: CheckResult["status"], source: CheckResult["source"], detail = ""): CheckResult {
  return { domain, status, source, detail, checkedAt: now(), cached: false };
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function checkDomains(store: Store, raw: string[], refresh = false): Promise<CheckResult[]> {
  const results = new Map<string, CheckResult>();
  const valid: string[] = [];
  for (const d of raw) {
    const norm = normalizeDomain(d);
    if (norm) valid.push(norm);
    else results.set(d, result(d, "invalid", "-", "not a valid domain name"));
  }
  const unique = [...new Set(valid)];

  if (!refresh && unique.length) {
    for (const r of await store.getDomains(unique)) {
      if (now() - r.checked_at <= (TTL[r.status] ?? 0)) {
        results.set(r.domain, { domain: r.domain, status: r.status, source: r.source, detail: r.detail ?? "", checkedAt: r.checked_at, cached: true });
      }
    }
  }

  const todo = unique.filter((d) => !results.has(d));
  if (todo.length) {
    const servers = await rdapServers(store);
    const fresh = await mapLimit(todo, 4, async (d) => (await checkRdap(d, servers)) ?? checkDns(d));
    await store.putDomains(fresh.filter((r) => r.status !== "unknown")); // never cache failures
    for (const r of fresh) results.set(r.domain, r);
  }

  return [...results.values()];
}
