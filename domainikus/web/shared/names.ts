// Name handling shared by the worker and the browser: slugs, domain validation, keywords, ranking.

export type Source = "input" | "extra" | "ai" | "combo" | "synonym-combo" | "affix" | "keyword" | "synonym";

export interface Candidate {
  name: string;
  source: Source;
  note: string;
}

export type Status = "available" | "likely_available" | "taken" | "invalid" | "unknown";

export interface CheckResult {
  domain: string;
  status: Status;
  source: "rdap" | "dns" | "-";
  detail: string;
  checkedAt: number;
  cached: boolean;
}

export const DEFAULT_TLDS = ["com", "ch", "io", "net", "org", "app"];
export const ALL_TLDS = ["com", "ch", "io", "net", "org", "app", "dev", "co", "ai", "de", "li", "eu", "at", "swiss", "xyz", "studio", "shop"];
export const FREE: Status[] = ["available", "likely_available"];
export const MAX_NAMES = 40;
export const CHECK_BATCH = 12;

export const STOPWORDS = new Set(`
a an the and or of for to in on at by with from into about as is are be was were it its this that these those
my your our their his her we you they i me us them app apps website site web online platform tool tools service
services company business thing things some any all very just more most new best good great simple easy using use
help helps helping make makes making find get let people who which what where how can will would should
der die das ein eine einer eines einem einen und oder für fur von zu im in am an auf mit aus bei ist sind
sein war mein meine dein deine unser unsere euer ihr ihre den dem des es sie er wir ich du man nicht auch nur
sehr mehr neue neuer neues beste gute einfach finden hilft helfen machen wie was wo wer welche webseite firma
`.split(/\s+/).filter(Boolean));

export const PREFIXES = ["get", "try", "my", "go"];
export const SUFFIXES = ["hq", "hub", "app", "ly"];

const TRANSLIT: Record<string, string> = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "æ": "ae", "ø": "o", "å": "a" };
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** "Bäckerei Zürich!" -> "baeckereizuerich". Keeps a-z, 0-9 and hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüßæøå]/g, (c) => TRANSLIT[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "");
}

export function isLabel(s: string): boolean {
  return LABEL_RE.test(s);
}

/** Returns "name.tld" in ASCII (punycode for IDNs), or null if it isn't a valid domain. */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/\.$/, "").replace(/^[a-z]+:\/\//, "").split("/")[0];
  if (s.startsWith("www.")) s = s.slice(4);
  if (!s || /[\s_]/.test(s)) return null;
  let host: string;
  try {
    host = new URL(`http://${s}`).hostname; // converts IDNs to punycode
  } catch {
    return null;
  }
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every(isLabel) || /^\d+$/.test(labels[labels.length - 1])) return null;
  return host;
}

/** "foo.com" stays as is; a bare "foo" becomes foo.<tld> for every TLD. */
export function expand(targets: string[], tlds: string[]): string[] {
  const out: string[] = [];
  for (const t of targets.map((t) => t.trim()).filter(Boolean)) {
    if (t.replace(/\.$/, "").includes(".")) out.push(t);
    else for (const tld of tlds) out.push(`${slugify(t) || t}.${tld}`);
  }
  return [...new Set(out)];
}

export function extractKeywords(text: string, limit = 4): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w) || w.length < 2 || /^\d+$/.test(w)) continue;
    const s = slugify(w);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, limit);
}

const SOURCE_RANK: Record<Source, number> = {
  input: 0, extra: 1, ai: 1, combo: 2, "synonym-combo": 3, affix: 4, keyword: 5, synonym: 6,
};

/** Lower is better. Single dictionary words are nearly always taken, so combinations rank first. */
export function score(c: Candidate): number {
  return SOURCE_RANK[c.source] + Math.max(0, c.name.length - 8) * 0.25 + (c.name.split("-").length - 1) * 3;
}

export interface GenerateOptions {
  extra?: string[];
  ai?: Candidate[];
  related?: Record<string, string[]>; // keyword -> words with a similar meaning
  affixes?: boolean;
  max?: number;
}

/** Turn a description (or a name) into a ranked list of candidate names. */
export function generate(text: string, opts: GenerateOptions = {}): Candidate[] {
  const candidates = new Map<string, Candidate>();
  const add = (raw: string, source: Source, note = "") => {
    const name = slugify(raw);
    if (name && name.length <= 63 && isLabel(name) && !candidates.has(name)) candidates.set(name, { name, source, note });
  };

  const keywords = extractKeywords(text);
  const stripped = text.trim();
  // A single word or an existing name ("coolname", "cool-name.com") is used as given.
  if (!/\s/.test(stripped)) add(stripped.split(".")[0], "input");
  else if (keywords.length > 1) add(keywords.slice(0, 3).join(""), "input");

  for (const n of opts.extra ?? []) add(n, "extra");
  for (const c of opts.ai ?? []) add(c.name, "ai", c.note);

  for (const kw of keywords) add(kw, "keyword");
  const core = keywords.slice(0, 3);
  for (const a of core) for (const b of core) if (a !== b) add(a + b, "combo");

  const related = opts.related ?? {};
  core.forEach((kw, i) => {
    for (const syn of related[kw] ?? []) {
      if (core.length > 1) {
        const parts = [...core];
        parts[i] = syn;
        add(parts.join(""), "synonym-combo", `${syn} ≈ ${kw}`);
        core.forEach((other, j) => {
          if (j !== i) add(i < j ? syn + other : other + syn, "synonym-combo", `${syn} ≈ ${kw}`);
        });
      }
      add(syn, "synonym", `≈ ${kw}`);
    }
  });
  if (core.length >= 2) {
    for (const s1 of (related[core[0]] ?? []).slice(0, 3))
      for (const s2 of (related[core[1]] ?? []).slice(0, 3)) add(s1 + s2, "synonym-combo", `≈ ${core[0]} + ${core[1]}`);
  }

  if (opts.affixes !== false) {
    const bases = [...candidates.values()]
      .filter((c) => ["input", "extra", "ai", "combo"].includes(c.source))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 2);
    for (const { name } of bases) {
      for (const p of PREFIXES) add(p + name, "affix");
      for (const s of SUFFIXES) if (!name.endsWith(s)) add(name + s, "affix");
    }
  }

  return [...candidates.values()].sort((a, b) => score(a) - score(b)).slice(0, opts.max ?? 30);
}

/** Show punycode domains in Unicode where the platform can: xn--bckerei-5wa.ch -> bäckerei.ch. */
export function display(domain: string): string {
  if (!domain.includes("xn--")) return domain;
  try {
    // There's no built-in punycode decoder in browsers or Workers, so decode the labels here.
    return domain.split(".").map((l) => (l.startsWith("xn--") ? punyDecode(l.slice(4)) : l)).join(".");
  } catch {
    return domain;
  }
}

// RFC 3492 decoder, enough to display IDN labels.
function punyDecode(input: string): string {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const out: number[] = [];
  let i = 0, n = 128, bias = 72;
  const basic = input.lastIndexOf("-");
  for (let j = 0; j < Math.max(basic, 0); j++) out.push(input.charCodeAt(j));
  const digit = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base);
  const adapt = (delta: number, numPoints: number, first: boolean) => {
    let k = 0;
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    for (; delta > ((base - tMin) * tMax) >> 1; k += base) delta = Math.floor(delta / (base - tMin));
    return Math.floor(k + ((base - tMin + 1) * delta) / (delta + skew));
  };
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (idx >= input.length) throw new Error("bad punycode");
      const d = digit(input.charCodeAt(idx++));
      if (d >= base) throw new Error("bad punycode");
      i += d * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (d < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0);
    n += Math.floor(i / (out.length + 1));
    i %= out.length + 1;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}
