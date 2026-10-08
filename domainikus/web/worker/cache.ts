// The cache: one SQLite-backed Durable Object shared by every request.

import { DurableObject } from "cloudflare:workers";
import type { CheckResult } from "../shared/names";

export interface DomainRow {
  domain: string;
  status: CheckResult["status"];
  source: CheckResult["source"];
  detail: string;
  checked_at: number;
}

export class Cache extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS domains (
        domain TEXT PRIMARY KEY,
        tld TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        detail TEXT,
        checked_at REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS domains_status ON domains(status);
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        fetched_at REAL NOT NULL
      );
    `);
  }

  getDomains(domains: string[]): DomainRow[] {
    if (!domains.length) return [];
    return this.sql
      .exec<Record<string, SqlStorageValue>>(`SELECT * FROM domains WHERE domain IN (${domains.map(() => "?").join(",")})`, ...domains)
      .toArray() as unknown as DomainRow[];
  }

  putDomains(results: CheckResult[]): void {
    for (const r of results) {
      this.sql.exec(
        "INSERT OR REPLACE INTO domains (domain, tld, status, source, detail, checked_at) VALUES (?, ?, ?, ?, ?, ?)",
        r.domain, r.domain.slice(r.domain.indexOf(".") + 1), r.status, r.source, r.detail, r.checkedAt,
      );
    }
  }

  /** Returns the value if it was stored less than `maxAge` seconds ago. */
  getKv(key: string, maxAge: number): string | null {
    const rows = this.sql
      .exec<{ value: string }>("SELECT value FROM kv WHERE key = ? AND fetched_at > ?", key, Date.now() / 1000 - maxAge)
      .toArray();
    return rows[0]?.value ?? null;
  }

  putKv(key: string, value: string): void {
    this.sql.exec("INSERT OR REPLACE INTO kv (key, value, fetched_at) VALUES (?, ?, ?)", key, value, Date.now() / 1000);
  }

  stats(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.sql.exec<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM domains GROUP BY status")) {
      out[r.status] = r.n;
    }
    return out;
  }
}

/** What the rest of the worker needs from the cache (the Durable Object stub, or a fake in tests). */
export interface Store {
  getDomains(domains: string[]): Promise<DomainRow[]>;
  putDomains(results: CheckResult[]): Promise<void>;
  getKv(key: string, maxAge: number): Promise<string | null>;
  putKv(key: string, value: string): Promise<void>;
}
