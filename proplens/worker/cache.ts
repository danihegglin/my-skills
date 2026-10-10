// Which upstream lookups the shared cache stores, under which key and for how long. Pure, so it can be unit-tested.

export type CacheKind = "overpass" | "climate" | "elevation" | "swiss-noise" | "geo-admin";
export type Rule = { kind: CacheKind; days: number };

/** Overpass mirrors, tried in this order on a miss (the same list the app uses). */
export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const OVERPASS_HOSTS = new Set(OVERPASS_MIRRORS.map((u) => new URL(u).host));

/** The cache rule for a request, or null when it isn't one we cache (and so won't proxy). */
export function ruleFor(url: URL, hasBody: boolean): Rule | null {
  if (url.protocol !== "https:") return null;
  if (hasBody) return OVERPASS_HOSTS.has(url.host) && url.pathname.endsWith("/api/interpreter") ? { kind: "overpass", days: 30 } : null;
  if (url.host === "archive-api.open-meteo.com" && url.pathname === "/v1/archive") return { kind: "climate", days: 120 };
  if (url.host === "api.open-meteo.com" && url.pathname === "/v1/elevation") return { kind: "elevation", days: 365 };
  if (url.host === "wms.geo.admin.ch" && url.searchParams.get("REQUEST") === "GetFeatureInfo") return { kind: "swiss-noise", days: 30 };
  if (url.host === "api3.geo.admin.ch" && url.pathname.startsWith("/rest/services/api/MapServer/")) return { kind: "geo-admin", days: 30 };
  return null;
}

/** SHA-256 of what identifies the data: the query for Overpass (any mirror answers it), the URL otherwise. */
export async function cacheKey(rule: Rule, url: URL, body: string | undefined): Promise<string> {
  const text = rule.kind === "overpass" ? `overpass\n${(body ?? "").trim()}` : `${rule.kind}\n${url.href}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A runtime error inside Overpass still returns 200 with a remark and partial data.
const FAILED_REMARK = /runtime error|timed out|out of memory/i;

/** Whether an upstream answer is complete enough to keep. */
export function cacheable(kind: CacheKind, bytes: Uint8Array): boolean {
  if (!bytes.byteLength) return false;
  const decoder = new TextDecoder();
  const head = decoder.decode(bytes.subarray(0, 64)).trimStart();
  if (kind === "swiss-noise") return !/exception|error/i.test(decoder.decode(bytes.subarray(0, 512)));
  if (!head.startsWith("{")) return false;
  if (kind !== "overpass") return true;
  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.byteLength - 2048)));
  const remark = tail.match(/"remark"\s*:\s*"([^"]*)"/)?.[1];
  return !(remark && FAILED_REMARK.test(remark));
}

/** SQLite in a Durable Object caps a value at 2 MB; larger entries are stored in parts. */
export const PART_BYTES = 1_000_000;

export function split(bytes: Uint8Array, size = PART_BYTES): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.byteLength; i += size) parts.push(bytes.subarray(i, i + size));
  return parts.length ? parts : [new Uint8Array(0)];
}

export function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
