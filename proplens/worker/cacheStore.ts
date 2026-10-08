import { DurableObject } from "cloudflare:workers";
import type { CacheKind, Rule } from "./cache";
import { OVERPASS_MIRRORS, cacheable, join, split } from "./cache";

/** Shards the cache over this many Durable Objects, by the first hex digit of the key. */
export const SHARDS = 16;
/** Per shard; 16 shards stay within the 5 GB of SQLite storage on the free plan. */
const MAX_SHARD_BYTES = 200_000_000;
/** Responses larger than this aren't kept (they are still passed through). */
const MAX_ENTRY_BYTES = 40_000_000;
/** After this many Overpass failures in a row, misses fail fast for a while so the app goes direct. */
const BREAKER_FAILURES = 3;
const BREAKER_MS = 5 * 60_000;

export type Lookup = { status: number; type: string; gzip: ArrayBuffer | null; cachedAt: number | null; hit: boolean };

type Meta = { kind: CacheKind; type: string; parts: number; size: number; created: number; expires: number };

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One shard of the shared cache of upstream lookups, stored gzip-compressed in SQLite. */
export class Cache extends DurableObject {
  private sql: SqlStorage;
  private inflight = new Map<string, Promise<Lookup>>();
  private failures = 0;
  private openUntil = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY, kind TEXT NOT NULL, type TEXT NOT NULL, parts INTEGER NOT NULL, size INTEGER NOT NULL,
        created INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS meta_used ON meta (used);
      CREATE TABLE IF NOT EXISTS parts (key TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (key, n));`);
  }

  /** The cached answer for `key`, fetching and storing it on a miss. Concurrent misses share one upstream request. */
  async lookup(key: string, rule: Rule, url: string, body: string | undefined, timeoutMs: number): Promise<Lookup> {
    const hit = this.read(key);
    if (hit) return hit;
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.fill(key, rule, url, body, timeoutMs).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  private read(key: string): Lookup | null {
    const meta = this.sql.exec<Meta>("SELECT kind, type, parts, size, created, expires FROM meta WHERE key = ?", key).toArray()[0];
    if (!meta) return null;
    const now = Date.now();
    if (meta.expires < now) {
      this.remove(key);
      return null;
    }
    const parts = this.sql.exec<{ data: ArrayBuffer }>("SELECT data FROM parts WHERE key = ? ORDER BY n", key).toArray();
    if (parts.length !== meta.parts) {
      this.remove(key);
      return null;
    }
    this.sql.exec("UPDATE meta SET used = ?, hits = hits + 1 WHERE key = ?", now, key);
    const bytes = join(parts.map((p) => new Uint8Array(p.data)));
    return { status: 200, type: meta.type, gzip: bytes.buffer as ArrayBuffer, cachedAt: meta.created, hit: true };
  }

  private async fill(key: string, rule: Rule, url: string, body: string | undefined, timeoutMs: number): Promise<Lookup> {
    const overpass = rule.kind === "overpass";
    if (overpass && Date.now() < this.openUntil) return { status: 503, type: "", gzip: null, cachedAt: null, hit: false };
    const deadline = AbortSignal.timeout(Math.min(timeoutMs, 170_000));
    // Overpass: try the requested mirror first, then the others.
    const targets = overpass ? [url, ...OVERPASS_MIRRORS.filter((m) => m !== url)] : [url];
    let status = 502;
    for (const target of targets) {
      if (deadline.aborted) {
        status = 504;
        break;
      }
      try {
        const res = await fetch(target, {
          method: overpass ? "POST" : "GET",
          headers: overpass ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
          body: overpass ? "data=" + encodeURIComponent(body ?? "") : undefined,
          signal: deadline,
        });
        if (!res.ok) {
          status = res.status === 429 ? 503 : 502;
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!cacheable(rule.kind, bytes)) continue;
        if (overpass) this.failures = 0;
        const type = res.headers.get("Content-Type") ?? "application/json";
        const packed = await gzip(bytes);
        const now = Date.now();
        if (packed.byteLength <= MAX_ENTRY_BYTES) this.store(key, rule, type, packed, now);
        return { status: 200, type, gzip: packed.buffer as ArrayBuffer, cachedAt: now, hit: false };
      } catch {
        status = deadline.aborted ? 504 : 502;
      }
    }
    if (overpass && ++this.failures >= BREAKER_FAILURES) this.openUntil = Date.now() + BREAKER_MS;
    return { status, type: "", gzip: null, cachedAt: null, hit: false };
  }

  private store(key: string, rule: Rule, type: string, packed: Uint8Array, now: number) {
    const parts = split(packed);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM parts WHERE key = ?", key);
      parts.forEach((p, n) => this.sql.exec("INSERT INTO parts (key, n, data) VALUES (?, ?, ?)", key, n, p));
      this.sql.exec(
        `INSERT OR REPLACE INTO meta (key, kind, type, parts, size, created, expires, used, hits) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        key, rule.kind, type, parts.length, packed.byteLength, now, now + rule.days * 86_400_000, now,
      );
    });
    this.trim();
  }

  private remove(key: string) {
    this.sql.exec("DELETE FROM parts WHERE key = ?", key);
    this.sql.exec("DELETE FROM meta WHERE key = ?", key);
  }

  /** Drops expired entries, then the least recently used ones while the shard is over its size budget. */
  trim(): { entries: number; bytes: number } {
    const now = Date.now();
    for (const { key } of this.sql.exec<{ key: string }>("SELECT key FROM meta WHERE expires < ?", now).toArray()) this.remove(key);
    let total = this.sql.exec<{ total: number | null }>("SELECT SUM(size) AS total FROM meta").one().total ?? 0;
    while (total > MAX_SHARD_BYTES) {
      const oldest = this.sql.exec<{ key: string; size: number }>("SELECT key, size FROM meta ORDER BY used LIMIT 50").toArray();
      if (!oldest.length) break;
      for (const o of oldest) {
        this.remove(o.key);
        total -= o.size;
        if (total <= MAX_SHARD_BYTES) break;
      }
    }
    return { entries: this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM meta").one().n, bytes: total };
  }

  stats() {
    return {
      ...this.trim(),
      byKind: this.sql.exec("SELECT kind, COUNT(*) AS entries, SUM(size) AS bytes, SUM(hits) AS hits FROM meta GROUP BY kind").toArray(),
      breakerOpen: Date.now() < this.openUntil,
    };
  }
}
