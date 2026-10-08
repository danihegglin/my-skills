import { CHECK_BATCH, MAX_NAMES, extractKeywords, generate } from "../shared/names";
import { Cache, type Store } from "./cache";
import { checkDomains } from "./check";
import { aiNames, relatedWords } from "./generate";

export interface Env {
  ASSETS: Fetcher;
  CACHE: DurableObjectNamespace<Cache>;
  AI_LIMITER?: RateLimit;
  ANTHROPIC_API_KEY?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export { Cache };

const store = (env: Env): Store => env.CACHE.get(env.CACHE.idFromName("global")) as unknown as Store;

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 253)).slice(0, max) : [];

async function suggest(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 300) : "";
  if (!text) return json({ error: "Describe your idea first." }, 400);
  const max = Math.min(Math.max(Number(body.max) || 30, 5), MAX_NAMES);

  const keywords = extractKeywords(text);
  const related: Record<string, string[]> = {};
  if (body.synonyms !== false) {
    await Promise.all(keywords.slice(0, 3).map(async (kw) => (related[kw] = await relatedWords(store(env), kw))));
  }

  let ai: Awaited<ReturnType<typeof aiNames>> = [];
  let aiError: string | undefined;
  if (body.ai && env.ANTHROPIC_API_KEY) {
    const ip = req.headers.get("cf-connecting-ip") ?? "anon";
    const allowed = env.AI_LIMITER ? (await env.AI_LIMITER.limit({ key: ip })).success : true;
    if (!allowed) aiError = "Too many AI requests. Try again in a minute.";
    else {
      try {
        ai = await aiNames(store(env), env.ANTHROPIC_API_KEY, text);
      } catch (e) {
        console.error("ai names failed", e);
        aiError = "AI suggestions are unavailable right now.";
      }
    }
  }

  const names = generate(text, { extra: strings(body.names, 30), ai, related, affixes: body.affixes !== false, max });
  return json({ keywords, names, aiError });
}

async function check(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const domains = strings(body.domains, CHECK_BATCH);
  if (!domains.length) return json({ error: "No domains to check." }, 400);
  return json({ results: await checkDomains(store(env), domains, body.refresh === true) });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/api/config" && req.method === "GET") return json({ ai: Boolean(env.ANTHROPIC_API_KEY) });
      if (pathname === "/api/suggest" && req.method === "POST") return await suggest(req, env);
      if (pathname === "/api/check" && req.method === "POST") return await check(req, env);
      if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
