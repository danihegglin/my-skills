// Alternatives with the same meaning: English synonyms from Datamuse, and ideas from Claude.

import Anthropic from "@anthropic-ai/sdk";
import { type Candidate, STOPWORDS, slugify } from "../shared/names";
import type { Store } from "./cache";

const DATAMUSE_URL = "https://api.datamuse.com/words";
const WORDS_TTL = 30 * 86400;
const AI_TTL = 30 * 86400;

const freq = (tags: string[] = []) => Number(tags.find((t) => t.startsWith("f:"))?.slice(2) ?? 0);

async function cached<T>(store: Store, key: string, ttl: number, load: () => Promise<T | null>): Promise<T | null> {
  const raw = await store.getKv(key, ttl);
  if (raw !== null) return JSON.parse(raw) as T;
  const value = await load();
  if (value !== null) await store.putKv(key, JSON.stringify(value));
  return value;
}

async function datamuse(params: Record<string, string>): Promise<{ word: string; tags?: string[] }[] | null> {
  try {
    const res = await fetch(`${DATAMUSE_URL}?${new URLSearchParams(params)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Common English words with a similar meaning. Non-English words get none: Datamuse only knows English. */
export async function relatedWords(store: Store, word: string, max = 6): Promise<string[]> {
  const english = await cached(store, `en:${word}`, WORDS_TTL, async () => {
    const data = await datamuse({ sp: word, md: "f", max: "1" });
    if (!data) return null;
    return data[0]?.word === word && freq(data[0].tags) >= 0.5;
  });
  if (english === false) return [];

  const words = await cached(store, `ml:${word}`, WORDS_TTL, async () => {
    const data = await datamuse({ ml: word, md: "f", max: "50" });
    if (!data) return null;
    const out: string[] = [];
    for (const item of data) {
      const w = item.word ?? "";
      // skip rare words (pawl, detent, …) and long phrases; "cake shop" -> "cakeshop" is fine
      if (freq(item.tags) < 0.3 || w.split(" ").length > 2 || !/^[a-z ]+$/i.test(w) || STOPWORDS.has(w)) continue;
      const s = slugify(w);
      if (s.length >= 3 && s.length <= 14 && s !== word && !out.includes(s)) out.push(s);
    }
    return out;
  });
  return (words ?? []).slice(0, max);
}

const AI_SCHEMA = {
  type: "object",
  properties: {
    names: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, meaning: { type: "string" } },
        required: ["name", "meaning"],
        additionalProperties: false,
      },
    },
  },
  required: ["names"],
  additionalProperties: false,
} as const;

/** Ask Claude for short brandable names that carry the same meaning as `text`. Cached per text. */
export async function aiNames(store: Store, apiKey: string, text: string, count = 15): Promise<Candidate[]> {
  const key = `ai:${text.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const names = await cached(store, key, AI_TTL, async () => {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: AI_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            `Suggest ${count} short, brandable domain names (without TLD) for this idea:\n\n${text}\n\n` +
            "Each name must convey the same meaning as the idea: synonyms, translations (English, German, French, " +
            "Italian, Latin), compounds, or evocative coinages. Use only a-z, 0-9 and hyphens, ideally 4-12 " +
            "characters, and avoid well-known brand names. Give a few words on what each one means.",
        },
      ],
    });
    if (response.stop_reason === "refusal") return [];
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return [];
    const parsed = JSON.parse(block.text) as { names: { name: string; meaning: string }[] };
    return parsed.names.map((n) => ({ name: slugify(n.name), source: "ai" as const, note: n.meaning })).filter((c) => c.name);
  });
  return names ?? [];
}
