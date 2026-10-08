import { useEffect, useState } from "react";
import { type Candidate, type CheckResult, FREE, type Source, display } from "../shared/names";

const SOURCE_LABEL: Record<Source, string> = {
  input: "your words",
  extra: "your idea",
  ai: "Claude",
  combo: "combination",
  "synonym-combo": "synonym",
  affix: "variant",
  keyword: "keyword",
  synonym: "synonym",
};

const FREE_PREVIEW = 18;

interface Props {
  rows: Candidate[];
  columns: string[];
  results: Record<string, CheckResult>;
  pending: boolean;
}

export function Results({ rows, columns, results, pending }: Props) {
  const [freeOnly, setFreeOnly] = useState(false);
  const [allFree, setAllFree] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = (domain: string) => {
    navigator.clipboard?.writeText(display(domain)).then(() => setCopied(display(domain)), () => {});
  };

  const free = Object.values(results)
    .filter((r) => FREE.includes(r.status))
    .sort((a, b) => a.domain.length - b.domain.length || a.domain.localeCompare(b.domain));
  const visible = freeOnly
    ? rows.filter((r) => columns.some((t) => FREE.includes(results[`${r.name}.${t}`]?.status)))
    : rows;

  return (
    <section className="results">
      {free.length > 0 && (
        <div className="free">
          <h2>Free</h2>
          <ul>
            {(allFree ? free : free.slice(0, FREE_PREVIEW)).map((r) => (
              <li key={r.domain}>
                <button type="button" className={r.status === "available" ? "pill" : "pill maybe"} onClick={() => copy(r.domain)} title="Copy">
                  {display(r.domain)}
                  {r.status === "likely_available" && <span className="q"> probably</span>}
                </button>
              </li>
            ))}
            {!allFree && free.length > FREE_PREVIEW && (
              <li>
                <button type="button" className="show-all" onClick={() => setAllFree(true)}>
                  Show all {free.length}
                </button>
              </li>
            )}
          </ul>
          <p className="hint">Click a domain to copy it.</p>
        </div>
      )}

      <div className="table-head">
        <h2>All names</h2>
        <label className="toggle">
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
          Only names with a free ending
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              {columns.map((t) => (
                <th scope="col" key={t}>
                  .{t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.name}>
                <th scope="row">
                  <span className="name">{display(row.name)}</span>
                  <span className="meta">
                    <span className={`src src-${row.source}`}>{SOURCE_LABEL[row.source]}</span>
                    {row.note && <span className="note">{row.note}</span>}
                  </span>
                </th>
                {columns.map((t) => (
                  <td key={t}>
                    <Cell domain={`${row.name}.${t}`} result={results[`${row.name}.${t}`]} pending={pending} onCopy={copy} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="empty">{pending ? "Still checking…" : "No free endings for these names. Try other endings or another description."}</p>}
      </div>

      <ul className="legend">
        <li><span className="cell free">✓</span> free</li>
        <li><span className="cell maybe">~</span> probably free (no DNS)</li>
        <li><span className="cell taken">×</span> taken, opens the site</li>
        <li><span className="cell unknown">?</span> couldn’t check</li>
      </ul>

      <div className={copied ? "toast show" : "toast"} role="status">
        {copied && <>Copied {copied}</>}
      </div>
    </section>
  );
}

function Cell({ domain, result, pending, onCopy }: { domain: string; result?: CheckResult; pending: boolean; onCopy: (d: string) => void }) {
  const label = display(domain);
  if (!result) return pending ? <span className="cell pending" aria-label={`${label}: checking`} /> : <span className="cell unknown">?</span>;
  switch (result.status) {
    case "available":
      return (
        <button type="button" className="cell free" onClick={() => onCopy(domain)} title={`${label} is free. Click to copy.`} aria-label={`${label}: free, copy`}>
          ✓
        </button>
      );
    case "likely_available":
      return (
        <button type="button" className="cell maybe" onClick={() => onCopy(domain)} title={`${label} has no DNS. Probably free. Click to copy.`} aria-label={`${label}: probably free, copy`}>
          ~
        </button>
      );
    case "taken":
      return (
        <a className="cell taken" href={`https://${domain}`} target="_blank" rel="noopener noreferrer" title={`${label} is taken. Open it.`} aria-label={`${label}: taken, open site`}>
          ×
        </a>
      );
    default:
      return (
        <span className="cell unknown" title={result.detail || "Couldn’t check"} aria-label={`${label}: unknown`}>
          ?
        </span>
      );
  }
}
