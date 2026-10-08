import { DurableObject } from "cloudflare:workers";
import type { Home, Listing, Mode, Signup } from "./alerts";
import { matchListing, parseSignup, wanted } from "./alerts";
import type { DigestItem } from "./email";
import { confirmEmail, digestEmail, resendMailer } from "./email";
import { newFlatfoxListings } from "./listings";

interface Env {
  ASSETS: Fetcher;
  SIGNUPS: DurableObjectNamespace<Signups>;
  /** Public address used in email links. */
  PUBLIC_URL?: string;
  /** Secret (`wrangler secret put ADMIN_TOKEN`) that unlocks the export and manual scans. */
  ADMIN_TOKEN?: string;
  /** Resend API key and sender (e.g. "PropLens <alerts@example.com>"); no emails are sent without both. */
  RESEND_API_KEY?: string;
  ALERTS_FROM?: string;
}

const HOURLY_LIMIT = 5;
const MAX_BODY = 1_500_000;
/** A new subscription also hears about matching listings first seen up to this long before it. */
const BACKLOG_DAYS = 14;
const DIGEST_SIZE = 10;

type SubRow = { token: string; email: string; area_id: string; area_label: string; mode: Mode; budget: number | null; min_score: number; confirmed: number; created: string };
type AreaRow = { id: string; label: string; south: number; west: number; north: number; east: number };
type ListingRow = { id: string; url: string; title: string; address: string; mode: Mode; category: string; price: number | null; rooms: number | null; space: number | null; home_address: string | null; home_lat: number | null; home_lon: number | null; score: number | null };

export type ScanSummary = { areas: number; newListings: number; scored: number; emails: number; confirmations: number; errors: string[]; mail: boolean };

/** Alert subscriptions, area rankings and the listings seen so far, in one SQLite-backed Durable Object. */
export class Signups extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        token TEXT PRIMARY KEY, email TEXT NOT NULL, area_id TEXT NOT NULL, area_label TEXT NOT NULL, mode TEXT NOT NULL,
        budget INTEGER, min_score INTEGER NOT NULL, page TEXT, confirmed INTEGER NOT NULL DEFAULT 0, confirm_sent TEXT,
        created TEXT NOT NULL, updated TEXT NOT NULL, UNIQUE (email, area_id, mode));
      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, south REAL NOT NULL, west REAL NOT NULL, north REAL NOT NULL, east REAL NOT NULL,
        homes INTEGER NOT NULL, ranked TEXT NOT NULL, scanned TEXT);
      CREATE TABLE IF NOT EXISTS homes (
        area_id TEXT NOT NULL, key TEXT NOT NULL, address TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
        score INTEGER NOT NULL, noise INTEGER NOT NULL, schools INTEGER NOT NULL, shopping INTEGER NOT NULL, sun INTEGER NOT NULL,
        PRIMARY KEY (area_id, key));
      CREATE TABLE IF NOT EXISTS listings (
        area_id TEXT NOT NULL, id TEXT NOT NULL, url TEXT, title TEXT, address TEXT, mode TEXT, category TEXT NOT NULL,
        price INTEGER, rooms REAL, space INTEGER, home_address TEXT, home_lat REAL, home_lon REAL, score INTEGER,
        first_seen TEXT NOT NULL, PRIMARY KEY (area_id, id));
      CREATE TABLE IF NOT EXISTS sent (token TEXT NOT NULL, listing_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (token, listing_id));
      CREATE TABLE IF NOT EXISTS attempts (client TEXT NOT NULL, at INTEGER NOT NULL);`);
  }

  private get mailer() {
    return resendMailer(this.env.RESEND_API_KEY, this.env.ALERTS_FROM);
  }

  private get base() {
    return (this.env.PUBLIC_URL ?? "https://proplens.vatia.workers.dev").replace(/\/$/, "");
  }

  /** Stores or updates a subscription and replaces the area's ranking with the one sent along. */
  subscribe(s: Signup, client: string): { status: "ok" | "limited"; confirmed: boolean } {
    const hourAgo = Date.now() - 3_600_000;
    this.sql.exec("DELETE FROM attempts WHERE at < ?", hourAgo);
    const recent = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM attempts WHERE client = ?", client).one().n;
    if (recent >= HOURLY_LIMIT) return { status: "limited", confirmed: false };
    this.sql.exec("INSERT INTO attempts (client, at) VALUES (?, ?)", client, Date.now());
    const now = new Date().toISOString();
    const a = s.area;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO areas (id, label, south, west, north, east, homes, ranked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET label = excluded.label, south = excluded.south, west = excluded.west, north = excluded.north,
           east = excluded.east, homes = excluded.homes, ranked = excluded.ranked`,
        a.id, a.label, a.south, a.west, a.north, a.east, s.homes.length, s.ranked,
      );
      this.sql.exec("DELETE FROM homes WHERE area_id = ?", a.id);
      for (const h of s.homes)
        this.sql.exec(
          "INSERT OR REPLACE INTO homes (area_id, key, address, lat, lon, score, noise, schools, shopping, sun) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          a.id, h.key, h.address, h.lat, h.lon, h.score, h.noise, h.schools, h.shopping, h.sun,
        );
      this.sql.exec(
        `INSERT INTO subscriptions (token, email, area_id, area_label, mode, budget, min_score, page, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (email, area_id, mode) DO UPDATE SET area_label = excluded.area_label, budget = excluded.budget,
           min_score = excluded.min_score, page = excluded.page, updated = excluded.updated`,
        crypto.randomUUID(), s.email, a.id, a.label, s.mode, s.budget, s.minScore, s.page, now, now,
      );
    });
    const sub = this.sql.exec<{ confirmed: number }>("SELECT confirmed FROM subscriptions WHERE email = ? AND area_id = ? AND mode = ?", s.email, a.id, s.mode).one();
    return { status: "ok", confirmed: sub.confirmed === 1 };
  }

  confirm(token: string): boolean {
    return this.sql.exec("UPDATE subscriptions SET confirmed = 1, updated = ? WHERE token = ?", new Date().toISOString(), token).rowsWritten > 0;
  }

  unsubscribe(token: string): boolean {
    const gone = this.sql.exec("DELETE FROM subscriptions WHERE token = ?", token).rowsWritten > 0;
    if (gone) this.sql.exec("DELETE FROM sent WHERE token = ?", token);
    return gone;
  }

  /** Emails a confirmation link to every subscription that hasn't had one yet. */
  async sendConfirmations(): Promise<number> {
    const mail = this.mailer;
    if (!mail) return 0;
    const subs = this.sql.exec<SubRow>("SELECT * FROM subscriptions WHERE confirmed = 0 AND confirm_sent IS NULL").toArray();
    let sent = 0;
    for (const s of subs) {
      await mail(confirmEmail(s, this.base));
      this.sql.exec("UPDATE subscriptions SET confirm_sent = ? WHERE token = ?", new Date().toISOString(), s.token);
      sent++;
    }
    return sent;
  }

  /**
   * Fetches new listings for every area with subscribers, scores each by the ranked address it is at,
   * and emails confirmed subscribers the matches they haven't had yet.
   */
  async scan(): Promise<ScanSummary> {
    const summary: ScanSummary = { areas: 0, newListings: 0, scored: 0, emails: 0, confirmations: 0, errors: [], mail: !!this.mailer };
    const areas = this.sql.exec<AreaRow>("SELECT a.* FROM areas a WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.area_id = a.id)").toArray();
    const now = new Date().toISOString();
    for (const area of areas) {
      summary.areas++;
      try {
        const seen = new Set(this.sql.exec<{ id: string }>("SELECT id FROM listings WHERE area_id = ?", area.id).toArray().map((r) => r.id));
        const { listings, ignored } = await newFlatfoxListings(area, (id) => seen.has(id));
        const homes = this.sql.exec<Home>("SELECT key, address, lat, lon, score, noise, schools, shopping, sun FROM homes WHERE area_id = ?", area.id).toArray();
        const byKey = new Map(homes.map((h) => [h.key, h]));
        for (const l of listings) {
          const home = matchListing(l, byKey, homes);
          if (home) summary.scored++;
          this.insertListing(area.id, l, home, now);
        }
        for (const id of ignored)
          this.sql.exec("INSERT OR IGNORE INTO listings (area_id, id, category, first_seen) VALUES (?, ?, 'IGNORED', ?)", area.id, id, now);
        summary.newListings += listings.length;
        this.sql.exec("UPDATE areas SET scanned = ? WHERE id = ?", now, area.id);
      } catch (err) {
        summary.errors.push(`${area.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const mail = this.mailer;
    if (!mail) return summary;
    try {
      summary.confirmations = await this.sendConfirmations();
    } catch (err) {
      summary.errors.push(`confirmations: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const s of this.sql.exec<SubRow>("SELECT * FROM subscriptions WHERE confirmed = 1").toArray()) {
      const since = new Date(Date.parse(s.created) - BACKLOG_DAYS * 86_400_000).toISOString();
      const matches = this.sql
        .exec<ListingRow>(
          `SELECT * FROM listings l WHERE l.area_id = ? AND l.score IS NOT NULL AND l.first_seen >= ?
             AND NOT EXISTS (SELECT 1 FROM sent x WHERE x.token = ? AND x.listing_id = l.id)
           ORDER BY l.score DESC, l.first_seen DESC`,
          s.area_id, since, s.token,
        )
        .toArray()
        .filter((l) => wanted({ mode: s.mode, budget: s.budget, minScore: s.min_score }, { mode: l.mode, price: l.price, score: l.score, category: l.category }));
      if (!matches.length) continue;
      const items: DigestItem[] = matches.slice(0, DIGEST_SIZE).map((l) => ({
        url: l.url,
        title: l.title,
        address: l.address,
        price: l.price,
        rooms: l.rooms,
        space: l.space,
        mode: l.mode,
        score: l.score!,
        home: { address: l.home_address ?? l.address, lat: l.home_lat ?? 0, lon: l.home_lon ?? 0 },
      }));
      try {
        await mail(digestEmail(s, items, matches.length - items.length, this.base));
        for (const l of matches.slice(0, DIGEST_SIZE)) this.sql.exec("INSERT OR IGNORE INTO sent (token, listing_id, at) VALUES (?, ?, ?)", s.token, l.id, now);
        summary.emails++;
      } catch (err) {
        summary.errors.push(`digest: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return summary;
  }

  private insertListing(areaId: string, l: Listing, home: Home | null, now: string) {
    this.sql.exec(
      `INSERT OR IGNORE INTO listings (area_id, id, url, title, address, mode, category, price, rooms, space, home_address, home_lat, home_lon, score, first_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      areaId, l.id, l.url, l.title, l.address, l.mode, l.category, l.price, l.rooms, l.space,
      home?.address ?? null, home?.lat ?? null, home?.lon ?? null, home?.score ?? null, now,
    );
  }

  export() {
    return {
      subscriptions: this.sql.exec("SELECT email, area_id, area_label, mode, budget, min_score, confirmed, confirm_sent, created, updated FROM subscriptions ORDER BY created DESC").toArray(),
      areas: this.sql.exec("SELECT id, label, homes, ranked, scanned FROM areas ORDER BY ranked DESC").toArray(),
      listings: this.sql.exec("SELECT area_id, id, title, address, mode, category, price, rooms, space, home_address, score, first_seen FROM listings WHERE category != 'IGNORED' ORDER BY first_seen DESC LIMIT 200").toArray(),
    };
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function hash(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TOKEN = /^[0-9a-f-]{36}$/;

async function tokenFrom(request: Request, url: URL): Promise<string | null> {
  let token = url.searchParams.get("token");
  if (!token && request.headers.get("Content-Type")?.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token : null;
  }
  return token && TOKEN.test(token) ? token : null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const store = () => env.SIGNUPS.get(env.SIGNUPS.idFromName("all"));
    const admin = !!env.ADMIN_TOKEN && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;

    if (url.pathname === "/api/alerts" && request.method === "POST") {
      if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY) return json({ error: "Request too large" }, 413);
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: "Request too large" }, 413);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
      const parsed = parseSignup(body);
      if (!parsed.ok) return parsed.spam ? json({ ok: true, confirmation: "sent" }) : json({ error: parsed.error }, 400);
      const client = await hash(`${request.headers.get("CF-Connecting-IP") ?? "unknown"}:proplens`);
      const result = await store().subscribe(parsed.signup, client);
      if (result.status === "limited") return json({ error: "Too many signups from your connection. Please try again later." }, 429);
      const mail = !!(env.RESEND_API_KEY && env.ALERTS_FROM);
      if (mail && !result.confirmed) ctx.waitUntil(store().sendConfirmations().catch((err) => console.error("confirmation failed", err)));
      return json({ ok: true, confirmation: result.confirmed ? "confirmed" : mail ? "sent" : "pending" });
    }

    if ((url.pathname === "/api/alerts/confirm" || url.pathname === "/api/alerts/unsubscribe") && request.method === "POST") {
      const token = await tokenFrom(request, url);
      if (!token) return json({ error: "This link is invalid" }, 400);
      const done = url.pathname.endsWith("confirm") ? await store().confirm(token) : await store().unsubscribe(token);
      return done ? json({ ok: true }) : json({ error: "This link has expired or was already used" }, 404);
    }

    if (url.pathname === "/api/alerts/export" && request.method === "GET") {
      return admin ? json(await store().export()) : json({ error: "Not found" }, 404);
    }

    if (url.pathname === "/api/alerts/scan" && request.method === "POST") {
      return admin ? json(await store().scan()) : json({ error: "Not found" }, 404);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      env.SIGNUPS.get(env.SIGNUPS.idFromName("all"))
        .scan()
        .then((s) => console.log("listing scan", JSON.stringify(s))),
    );
  },
} satisfies ExportedHandler<Env>;
