import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_TLDS,
  CHECK_BATCH,
  type Candidate,
  type CheckResult,
  DEFAULT_TLDS,
  FREE,
  normalizeDomain,
} from "../shared/names";
import { check, getConfig, suggest } from "./api";
import { DomainList, Results } from "./Results";

type Mode = "idea" | "check";
type Phase = "idle" | "thinking" | "checking" | "done";

interface Query {
  mode: Mode;
  text: string;
  tlds: string[];
}

const RECENT_KEY = "domainikus:recent";
const EXAMPLES = ["a bakery in Zürich that delivers fresh bread", "app to book dog walkers nearby", "calm meditation timer"];

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function readUrl(): Query {
  const p = new URLSearchParams(location.search);
  const tlds = splitList(p.get("tlds") ?? "").filter((t) => /^[a-z]{2,24}$/.test(t));
  return { mode: p.get("mode") === "check" ? "check" : "idea", text: p.get("q") ?? "", tlds: tlds.length ? tlds : DEFAULT_TLDS };
}

function writeUrl(q: Query) {
  const p = new URLSearchParams({ q: q.text });
  if (q.mode === "check") p.set("mode", "check");
  if (q.tlds.join() !== DEFAULT_TLDS.join()) p.set("tlds", q.tlds.join(","));
  history.replaceState(null, "", `?${p}`);
}

function loadRecent(): Query[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(q: Query, prev: Query[]): Query[] {
  const next = [q, ...prev.filter((r) => r.text !== q.text || r.mode !== q.mode)].slice(0, 6);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage is optional
  }
  return next;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export default function App() {
  const initial = useMemo(readUrl, []);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [ideaText, setIdeaText] = useState(initial.mode === "idea" ? initial.text : "");
  const [domainText, setDomainText] = useState(initial.mode === "check" ? initial.text : "");
  const text = mode === "idea" ? ideaText : domainText;
  const [tlds, setTlds] = useState<string[]>(initial.tlds);
  const [extra, setExtra] = useState("");
  const [synonyms, setSynonyms] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [aiAvailable, setAiAvailable] = useState(false);

  const [rows, setRows] = useState<Candidate[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [runMode, setRunMode] = useState<Mode>(initial.mode);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recent, setRecent] = useState<Query[]>(loadRecent);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(getConfig());

  useEffect(() => {
    configRef.current.then((c) => setAiAvailable(c.ai));
    if (initial.text) void run(initial);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(q: Query) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setNotice(null);
    setResults({});
    setRows([]);

    const query = { ...q, text: q.mode === "idea" ? q.text.trim() : q.text.replace(/\s+/g, "") };
    if (!query.text) return setError(query.mode === "idea" ? "Describe your idea first." : "Enter a domain or a name.");
    if (!query.tlds.length) return setError("Pick at least one domain ending.");
    writeUrl(query);
    setRecent((prev) => saveRecent(query, prev));

    try {
      let names: Candidate[];
      let cols: string[];
      let domains: string[];
      if (query.mode === "idea") {
        setPhase("thinking");
        const ai = useAi && (await configRef.current).ai;
        const res = await suggest({ text: query.text, names: splitList(extra), synonyms, ai, max: 30 }, ctrl.signal);
        if (res.aiError) setNotice(res.aiError);
        names = res.names;
        cols = query.tlds;
        domains = names.flatMap((n) => cols.map((t) => `${n.name}.${t}`));
      } else {
        // One name or domain: "brotli" checks every selected ending, "brotli.ch" checks .ch first, then the rest.
        const typed = query.text.includes(".") ? normalizeDomain(query.text) : normalizeDomain(`${query.text}.com`);
        if (!typed) throw new Error("That isn’t a valid domain name. Use letters, digits and hyphens, like brotli or brotli.ch.");
        const name = typed.slice(0, typed.indexOf("."));
        cols = [...new Set([...(query.text.includes(".") ? [typed.slice(name.length + 1)] : []), ...query.tlds])];
        names = [{ name, source: "input", note: "" }];
        domains = cols.map((t) => `${name}.${t}`);
      }
      if (ctrl.signal.aborted) return;
      setRunMode(query.mode);
      setRows(names);
      setColumns(cols);
      setTotal(domains.length);
      setPhase("checking");

      const batches: string[][] = [];
      for (let i = 0; i < domains.length; i += CHECK_BATCH) batches.push(domains.slice(i, i + CHECK_BATCH));
      await mapLimit(batches, 3, async (batch) => {
        if (ctrl.signal.aborted) return;
        let found: CheckResult[];
        try {
          found = (await check(batch, ctrl.signal)).results;
        } catch (e) {
          if (ctrl.signal.aborted) return;
          const detail = e instanceof Error ? e.message : "lookup failed";
          found = batch.map((domain) => ({ domain, status: "unknown", source: "-", detail, checkedAt: 0, cached: false }));
        }
        setResults((prev) => {
          const next = { ...prev };
          for (const r of found) next[r.domain] = r;
          return next;
        });
      });
      if (!ctrl.signal.aborted) setPhase("done");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("idle");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run({ mode, text, tlds });
  }

  function pick(q: Query) {
    setMode(q.mode);
    (q.mode === "idea" ? setIdeaText : setDomainText)(q.text);
    setTlds(q.tlds);
    void run(q);
  }

  const toggleTld = (t: string) =>
    setTlds((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : ALL_TLDS.filter((x) => x === t || prev.includes(x))));

  const checked = Object.keys(results).length;
  const free = Object.values(results).filter((r) => FREE.includes(r.status)).length;

  return (
    <div className="page">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="domainikus home">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" />
            <path d="M9 16.5l4.5 4.5L23 11.5" />
          </svg>
          domainikus
        </a>
      </header>

      <main>
        <section className="hero">
          <h1>
            Find a domain that’s <em>still free</em>.
          </h1>
          <p className="lede">
            Describe your idea. domainikus comes up with names that mean the same thing and checks every one against
            the registries.
          </p>
        </section>

        <form className="search" onSubmit={onSubmit}>
          <div className="tabs" role="tablist" aria-label="Search mode">
            {(["idea", "check"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "tab active" : "tab"}
                onClick={() => setMode(m)}
              >
                {m === "idea" ? "Describe an idea" : "Search a domain"}
              </button>
            ))}
          </div>

          <div className="field">
            <label htmlFor="q" className="sr-only">
              {mode === "idea" ? "Your idea" : "Domain or name"}
            </label>
            {mode === "idea" ? (
              <textarea
                id="q"
                rows={2}
                value={ideaText}
                maxLength={300}
                placeholder="e.g. a bakery in Zürich that delivers fresh bread"
                onChange={(e) => setIdeaText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void run({ mode, text, tlds });
                  }
                }}
              />
            ) : (
              <input
                id="q"
                type="search"
                className="domain-input"
                value={domainText}
                maxLength={253}
                placeholder="brotli or brotli.ch"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setDomainText(e.target.value.replace(/\s+/g, ""))}
              />
            )}
            <button type="submit" className="go" disabled={phase === "thinking" || phase === "checking"}>
              {phase === "thinking" || phase === "checking" ? "Searching…" : "Search"}
            </button>
          </div>

          <fieldset className="tlds">
            <legend>Endings</legend>
            {ALL_TLDS.map((t) => (
              <label key={t} className={tlds.includes(t) ? "chip on" : "chip"}>
                <input type="checkbox" checked={tlds.includes(t)} onChange={() => toggleTld(t)} />.{t}
              </label>
            ))}
          </fieldset>

          {mode === "idea" && (
            <details className="more">
              <summary>More options</summary>
              <div className="options">
                <label className="extra">
                  <span>Your own name ideas</span>
                  <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="comma-separated, e.g. brotli, beckli" />
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={synonyms} onChange={(e) => setSynonyms(e.target.checked)} />
                  English synonyms
                </label>
                <label className={aiAvailable ? "toggle" : "toggle disabled"} title={aiAvailable ? "" : "Not set up on this server"}>
                  <input type="checkbox" checked={aiAvailable && useAi} disabled={!aiAvailable} onChange={(e) => setUseAi(e.target.checked)} />
                  Ideas from Claude{aiAvailable ? "" : " (not set up)"}
                </label>
              </div>
            </details>
          )}

          {(recent.length > 0 || phase === "idle") && (
            <div className="recent">
              <span>{recent.length ? "Recent" : "Try"}</span>
              {(recent.length ? recent : EXAMPLES.map((text) => ({ mode: "idea" as const, text, tlds }))).map((q) => (
                <button type="button" key={q.mode + q.text} onClick={() => pick(q)}>
                  {q.text}
                </button>
              ))}
            </div>
          )}
        </form>

        {error && <p className="alert" role="alert">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {phase !== "idle" && (
          <section className="status" aria-live="polite">
            {phase === "thinking" ? (
              <p>Finding names with the same meaning…</p>
            ) : (
              <>
                <p>
                  {phase === "checking" ? (
                    <>Checked {checked} of {total} domains</>
                  ) : (
                    <>
                      <strong>{free}</strong> free {free === 1 ? "domain" : "domains"} among {total}
                    </>
                  )}
                </p>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${total ? (checked / total) * 100 : 0}%` }} />
                </div>
              </>
            )}
          </section>
        )}

        {rows.length > 0 &&
          (runMode === "check" ? (
            <DomainList name={rows[0].name} endings={columns} results={results} pending={phase === "checking"} />
          ) : (
            <Results rows={rows} columns={columns} results={results} pending={phase === "checking"} />
          ))}
      </main>

      <footer className="foot">
        <h2>How it works</h2>
        <p>
          Every domain is looked up at its registry over RDAP. Endings without RDAP fall back to DNS, and those results
          show as “probably free”. Results are cached in SQLite: free domains for a day, taken ones for two weeks.
        </p>
        <p>
          “Free” means the registry has no record of the domain. It can still be reserved or premium-priced, so confirm
          at a registrar before you buy.
        </p>
        <p className="tiny">
          Made with domainikus. No accounts, no tracking. Recent searches stay in your browser.
        </p>
      </footer>
    </div>
  );
}
