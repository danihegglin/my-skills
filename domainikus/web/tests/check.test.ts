import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckResult } from "../shared/names";
import type { DomainRow, Store } from "../worker/cache";
import { checkDomains } from "../worker/check";

class MemoryStore implements Store {
  domains = new Map<string, DomainRow>();
  kv = new Map<string, string>([["rdap_bootstrap", JSON.stringify({ com: "https://rdap.example/com/" })]]);
  async getDomains(ds: string[]) {
    return ds.map((d) => this.domains.get(d)).filter((r): r is DomainRow => !!r);
  }
  async putDomains(rs: CheckResult[]) {
    for (const r of rs) this.domains.set(r.domain, { domain: r.domain, status: r.status, source: r.source, detail: r.detail, checked_at: r.checkedAt });
  }
  async getKv(key: string) {
    return this.kv.get(key) ?? null;
  }
  async putKv(key: string, value: string) {
    this.kv.set(key, value);
  }
}

/** Stub fetch: routes maps a URL substring to a JSON body or an HTTP status. */
function route(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    for (const [part, resp] of Object.entries(routes)) {
      if (url.includes(part)) return typeof resp === "number" ? new Response(null, { status: resp }) : Response.json(resp);
    }
    throw new Error(`unrouted ${url}`);
  });
  return calls;
}

const byDomain = (rs: CheckResult[]) => Object.fromEntries(rs.map((r) => [r.domain, r]));

afterEach(() => vi.unstubAllGlobals());

describe("checkDomains", () => {
  it("maps RDAP 200/404 to taken/available", async () => {
    route({ "/domain/taken.com": { status: ["active"] }, "/domain/free.com": 404 });
    const r = byDomain(await checkDomains(new MemoryStore(), ["taken.com", "free.com"]));
    expect(r["taken.com"].status).toBe("taken");
    expect(r["free.com"]).toMatchObject({ status: "available", source: "rdap" });
  });

  it("uses the SWITCH RDAP server for .ch", async () => {
    route({ "rdap.nic.ch/domain/frei.ch": 404 });
    const r = byDomain(await checkDomains(new MemoryStore(), ["frei.ch"]));
    expect(r["frei.ch"].status).toBe("available");
  });

  it("falls back to DNS without RDAP or when RDAP fails", async () => {
    route({
      "name=taken.co": { Status: 0, Answer: [{ data: "ns1." }] },
      "name=free.co": { Status: 3 },
      "/domain/broken.com": 503,
      "name=broken.com": { Status: 0, Answer: [{ data: "ns." }] },
    });
    const r = byDomain(await checkDomains(new MemoryStore(), ["taken.co", "free.co", "broken.com"]));
    expect(r["taken.co"]).toMatchObject({ status: "taken", source: "dns" });
    expect(r["free.co"].status).toBe("likely_available");
    expect(r["broken.com"]).toMatchObject({ status: "taken", source: "dns" });
  });

  it("serves repeats from the cache and never caches failures", async () => {
    const store = new MemoryStore();
    route({ "/domain/a.com": 404 });
    await checkDomains(store, ["a.com", "nowhere.co"]);
    expect(store.domains.has("nowhere.co")).toBe(false);
    const calls = route({});
    const r = byDomain(await checkDomains(store, ["a.com"]));
    expect(r["a.com"].cached).toBe(true);
    expect(calls).toEqual([]);
  });

  it("flags invalid names without looking them up", async () => {
    const calls = route({});
    const r = byDomain(await checkDomains(new MemoryStore(), ["bad_name.com"]));
    expect(r["bad_name.com"].status).toBe("invalid");
    expect(calls).toEqual([]);
  });
});
