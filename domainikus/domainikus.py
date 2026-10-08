#!/usr/bin/env python3
"""domainikus: find a free domain name.

Checks whether domains are registered (RDAP, falling back to DNS), caches
every lookup in SQLite, and turns a short description into candidate names
with the same meaning (keywords, synonyms, combinations and, optionally,
ideas from Claude).

Standard library only. `pip install anthropic` enables --ai.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import itertools
import json
import os
import re
import sqlite3
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

__version__ = "0.1.0"

USER_AGENT = f"domainikus/{__version__}"
DEFAULT_TLDS = ["com", "ch", "io", "net", "org", "app"]
DEFAULT_DB = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "domainikus" / "cache.db"

RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
DOH_URL = "https://cloudflare-dns.com/dns-query"
DATAMUSE_URL = "https://api.datamuse.com/words"

# ccTLDs that run RDAP but are missing from the IANA bootstrap file.
RDAP_OVERRIDES = {
    "ch": "https://rdap.nic.ch/",
    "li": "https://rdap.nic.ch/",
    "de": "https://rdap.denic.de/",
    "io": "https://rdap.identitydigital.services/rdap/",
}

# How long a cached answer stays fresh, in seconds.
TTL = {
    "taken": 14 * 86400,
    "available": 86400,
    "likely_available": 86400,
    "invalid": 365 * 86400,
}
SYNONYM_TTL = 30 * 86400
BOOTSTRAP_TTL = 7 * 86400

AVAILABLE = ("available", "likely_available")

STOPWORDS = set("""
a an the and or of for to in on at by with from into about as is are be was were it its this that these those
my your our their his her we you they i me us them app apps website site web online platform tool tools service
services company business thing things some any all very just more most new best good great simple easy using use
help helps helping make makes making find get let people who which what where how can will would should
der die das ein eine einer eines einem einen und oder für fur von zu im in am an auf mit aus bei ist sind
sein war mein meine dein deine unser unsere euer ihr ihre den dem des es sie er wir ich du man nicht auch nur
sehr mehr neue neuer neues beste gute einfach finden hilft helfen machen wie was wo wer welche webseite firma
""".split())

PREFIXES = ["get", "try", "my", "go"]
SUFFIXES = ["hq", "hub", "app", "ly"]

TRANSLIT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "æ": "ae", "ø": "o", "å": "a"})
LABEL_RE = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")


# --------------------------------------------------------------------------- #
# HTTP


class HttpError(Exception):
    def __init__(self, status: int, retry_after: float | None = None):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.retry_after = retry_after


def http_get_json(url: str, accept: str = "application/json", timeout: float = 10.0) -> dict | list:
    """GET a URL and decode JSON. Raises HttpError on non-2xx, OSError on network failure."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        retry_after = None
        if e.headers and e.headers.get("Retry-After", "").isdigit():
            retry_after = float(e.headers["Retry-After"])
        raise HttpError(e.code, retry_after) from None


# --------------------------------------------------------------------------- #
# Cache


class Cache:
    def __init__(self, path: Path | str):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS domains (
                domain TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                tld TEXT NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL,
                detail TEXT,
                checked_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS domains_status ON domains(status);
            CREATE TABLE IF NOT EXISTS words (
                word TEXT PRIMARY KEY,
                related TEXT NOT NULL,
                fetched_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                fetched_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                tlds TEXT NOT NULL,
                names TEXT NOT NULL,
                created_at REAL NOT NULL
            );
        """)

    # domains
    def get_domain(self, domain: str, now: float | None = None) -> dict | None:
        row = self.db.execute("SELECT * FROM domains WHERE domain = ?", (domain,)).fetchone()
        if row is None:
            return None
        now = time.time() if now is None else now
        if now - row["checked_at"] > TTL.get(row["status"], 0):
            return None
        return dict(row)

    def put_domain(self, result: "CheckResult") -> None:
        if result.status == "unknown":
            return  # never cache failures
        name, tld = result.domain.split(".", 1)
        self.db.execute(
            "INSERT OR REPLACE INTO domains VALUES (?, ?, ?, ?, ?, ?, ?)",
            (result.domain, name, tld, result.status, result.source, result.detail, result.checked_at),
        )
        self.db.commit()

    def list_domains(self, status: str | None = None, limit: int = 100) -> list[dict]:
        sql, args = "SELECT * FROM domains", []
        if status == "available":
            sql += " WHERE status IN ('available', 'likely_available')"
        elif status:
            sql += " WHERE status = ?"
            args.append(status)
        sql += " ORDER BY checked_at DESC LIMIT ?"
        args.append(limit)
        return [dict(r) for r in self.db.execute(sql, args)]

    # synonyms
    def get_words(self, word: str) -> list[str] | None:
        row = self.db.execute("SELECT related, fetched_at FROM words WHERE word = ?", (word,)).fetchone()
        if row is None or time.time() - row["fetched_at"] > SYNONYM_TTL:
            return None
        return json.loads(row["related"])

    def put_words(self, word: str, related: list[str]) -> None:
        self.db.execute("INSERT OR REPLACE INTO words VALUES (?, ?, ?)", (word, json.dumps(related), time.time()))
        self.db.commit()

    # misc key/value (RDAP bootstrap)
    def get_kv(self, key: str, ttl: float) -> str | None:
        row = self.db.execute("SELECT value, fetched_at FROM kv WHERE key = ?", (key,)).fetchone()
        if row is None or time.time() - row["fetched_at"] > ttl:
            return None
        return row["value"]

    def put_kv(self, key: str, value: str) -> None:
        self.db.execute("INSERT OR REPLACE INTO kv VALUES (?, ?, ?)", (key, value, time.time()))
        self.db.commit()

    # search history
    def log_search(self, query: str, tlds: list[str], names: list[str]) -> None:
        self.db.execute(
            "INSERT INTO searches (query, tlds, names, created_at) VALUES (?, ?, ?, ?)",
            (query, ",".join(tlds), json.dumps(names), time.time()),
        )
        self.db.commit()

    def history(self, limit: int = 20) -> list[dict]:
        rows = self.db.execute("SELECT * FROM searches ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]

    def stats(self) -> dict:
        counts = dict(self.db.execute("SELECT status, COUNT(*) FROM domains GROUP BY status").fetchall())
        counts["searches"] = self.db.execute("SELECT COUNT(*) FROM searches").fetchone()[0]
        counts["words"] = self.db.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        return counts

    def clear(self, expired_only: bool = False) -> int:
        if not expired_only:
            n = self.db.execute("SELECT COUNT(*) FROM domains").fetchone()[0]
            self.db.executescript("DELETE FROM domains; DELETE FROM words; DELETE FROM kv; DELETE FROM searches;")
            return n
        now = time.time()
        stale = [
            r["domain"]
            for r in self.db.execute("SELECT domain, status, checked_at FROM domains")
            if now - r["checked_at"] > TTL.get(r["status"], 0)
        ]
        self.db.executemany("DELETE FROM domains WHERE domain = ?", [(d,) for d in stale])
        self.db.commit()
        return len(stale)


# --------------------------------------------------------------------------- #
# Names and domains


def slugify(text: str) -> str:
    """'Bäckerei Zürich!' -> 'baeckereizuerich'. Keeps a-z, 0-9 and hyphens."""
    text = text.lower().translate(TRANSLIT)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9-]+", "", text)
    return text.strip("-")


def normalize_domain(raw: str) -> str | None:
    """Return 'name.tld' in ASCII (punycode for IDNs), or None if it isn't a valid domain."""
    raw = raw.strip().lower().rstrip(".")
    raw = re.sub(r"^[a-z]+://", "", raw).split("/")[0]
    if raw.startswith("www."):
        raw = raw[4:]
    try:
        ascii_ = raw.encode("idna").decode("ascii")
    except UnicodeError:
        return None
    labels = ascii_.split(".")
    if len(labels) < 2 or not all(LABEL_RE.match(l) for l in labels):
        return None
    return ascii_


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[^\W_]+", text.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 1 and not w.isdigit()]


def extract_keywords(text: str, limit: int = 4) -> list[str]:
    seen: list[str] = []
    for w in tokenize(text):
        s = slugify(w)
        if s and s not in seen:
            seen.append(s)
    return seen[:limit]


@dataclass
class Candidate:
    name: str
    source: str  # input | extra | ai | combo | synonym-combo | affix | keyword | synonym
    note: str = ""

    @property
    def score(self) -> float:
        """Lower is better. Single dictionary words are nearly always taken, so combinations rank first."""
        bonus = {"input": 0, "extra": 1, "ai": 1, "combo": 2, "synonym-combo": 3, "affix": 4,
                 "keyword": 5, "synonym": 6}[self.source]
        return bonus + max(0, len(self.name) - 8) * 0.25 + self.name.count("-") * 3


def related_words(word: str, cache: Cache, max_words: int = 6) -> list[str]:
    """Common words with a similar meaning (English, via Datamuse). Cached."""
    cached = cache.get_words(word)
    if cached is not None:
        return cached[:max_words]
    if not is_english(word, cache):
        return []  # Datamuse only knows English; use --ai or --names for other languages
    try:
        data = http_get_json(f"{DATAMUSE_URL}?{urllib.parse.urlencode({'ml': word, 'max': 50, 'md': 'f'})}")
    except (HttpError, OSError, ValueError):
        return []
    words: list[str] = []
    for item in data:
        w = item.get("word", "")
        freq = next((float(t[2:]) for t in item.get("tags", []) if t.startswith("f:")), 0.0)
        # skip rare words (pawl, detent, …) and long phrases; "cake shop" -> "cakeshop" is fine
        if freq < 0.3 or len(w.split()) > 2 or not w.replace(" ", "").isalpha():
            continue
        s = slugify(w)
        if 3 <= len(s) <= 14 and s != word and s not in words and w not in STOPWORDS:
            words.append(s)
    cache.put_words(word, words)
    return words[:max_words]


def is_english(word: str, cache: Cache) -> bool:
    """True if Datamuse knows `word` as a reasonably common English word. Cached."""
    key = "?en:" + word
    cached = cache.get_words(key)
    if cached is not None:
        return bool(cached)
    try:
        data = http_get_json(f"{DATAMUSE_URL}?{urllib.parse.urlencode({'sp': word, 'md': 'f', 'max': 1})}")
    except (HttpError, OSError, ValueError):
        return True  # let the synonym lookup decide
    hit = data[0] if data and data[0].get("word") == word else None
    freq = next((float(t[2:]) for t in (hit or {}).get("tags", []) if t.startswith("f:")), 0.0)
    english = freq >= 0.5
    cache.put_words(key, ["1"] if english else [])
    return english


def ai_names(text: str, count: int = 15, model: str = "claude-opus-5-5") -> list[Candidate]:
    """Ask Claude for short brandable names that carry the same meaning as `text`."""
    import anthropic  # optional dependency

    client = anthropic.Anthropic()
    prompt = (
        f"Suggest {count} short, brandable domain names (without TLD) for this idea:\n\n{text}\n\n"
        "Each name must convey the same meaning as the idea: synonyms, translations (English, German, "
        "French, Italian, Latin), compounds, or evocative coinages. Use only a-z, 0-9 and hyphens, "
        "ideally 4-12 characters, and avoid well-known brand names. Give a few words on what each one means."
    )
    response = client.beta.messages.create(
        model=model,
        max_tokens=4000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={
            "effort": "medium",
            "format": {
                "type": "json_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "names": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"name": {"type": "string"}, "meaning": {"type": "string"}},
                                "required": ["name", "meaning"],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": ["names"],
                    "additionalProperties": False,
                },
            },
        },
        messages=[{"role": "user", "content": prompt}],
    )
    if response.stop_reason == "refusal":
        return []
    text_out = next((b.text for b in response.content if b.type == "text"), "")
    out = []
    for item in json.loads(text_out).get("names", []):
        name = slugify(item.get("name", ""))
        if name:
            out.append(Candidate(name, "ai", item.get("meaning", "")))
    return out


def generate(
    text: str,
    cache: Cache,
    *,
    synonyms: bool = True,
    affixes: bool = True,
    use_ai: bool = False,
    extra: list[str] | None = None,
    max_names: int = 30,
) -> list[Candidate]:
    """Turn a description (or a name) into a ranked list of candidate names."""
    candidates: dict[str, Candidate] = {}

    def add(name: str, source: str, note: str = "") -> None:
        name = slugify(name)
        if name and len(name) <= 63 and LABEL_RE.match(name) and name not in candidates:
            candidates[name] = Candidate(name, source, note)

    keywords = extract_keywords(text)
    # A single word or an existing name ("coolname", "cool-name.com") is used as given.
    stripped = text.strip()
    if " " not in stripped:
        add(stripped.split(".")[0], "input")
    elif len(keywords) > 1:
        add("".join(keywords[:3]), "input")

    for name in extra or []:
        add(name, "extra")

    if use_ai:
        try:
            for c in ai_names(text):
                add(c.name, c.source, c.note)
        except ImportError:
            print("note: --ai needs `pip install anthropic`; skipping AI suggestions", file=sys.stderr)
        except Exception as e:  # network/auth problems shouldn't kill the search
            print(f"note: AI suggestions failed ({type(e).__name__}: {str(e)[:120]})", file=sys.stderr)

    for kw in keywords:
        add(kw, "keyword")
    for a, b in itertools.permutations(keywords[:3], 2):
        add(a + b, "combo")

    if synonyms and keywords:
        core = keywords[:3]
        related = {kw: related_words(kw, cache) for kw in core}
        # swap one keyword at a time for a synonym, keeping the others
        for i, kw in enumerate(core):
            for syn in related[kw]:
                if len(core) > 1:
                    parts = list(core)
                    parts[i] = syn
                    add("".join(parts), "synonym-combo", f"{syn} ≈ {kw}")
                    for j, other in enumerate(core):
                        if j != i:
                            add(syn + other if i < j else other + syn, "synonym-combo", f"{syn} ≈ {kw}")
                add(syn, "synonym", f"≈ {kw}")
        if len(core) >= 2:
            for s1, s2 in itertools.product(related[core[0]][:3], related[core[1]][:3]):
                add(s1 + s2, "synonym-combo", f"≈ {core[0]} + {core[1]}")

    if affixes:
        bases = ("input", "extra", "ai", "combo")
        base = [c.name for c in sorted(candidates.values(), key=lambda c: c.score) if c.source in bases][:2]
        for name in base:
            for p in PREFIXES:
                add(p + name, "affix")
            for s in SUFFIXES:
                if not name.endswith(s):
                    add(name + s, "affix")

    ranked = sorted(candidates.values(), key=lambda c: c.score)
    return ranked[:max_names]


# --------------------------------------------------------------------------- #
# Availability


@dataclass
class CheckResult:
    domain: str
    status: str  # taken | available | likely_available | invalid | unknown
    source: str  # rdap | dns | cache | -
    detail: str = ""
    checked_at: float = field(default_factory=time.time)
    cached: bool = False

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


class Checker:
    def __init__(self, cache: Cache, workers: int = 8, refresh: bool = False):
        self.cache = cache
        self.workers = workers
        self.refresh = refresh
        self._rdap: dict[str, str] | None = None
        self._host_locks: dict[str, threading.Semaphore] = {}
        self._lock = threading.Lock()

    def rdap_servers(self) -> dict[str, str]:
        if self._rdap is None:
            raw = self.cache.get_kv("rdap_bootstrap", BOOTSTRAP_TTL)
            if raw is None:
                try:
                    data = http_get_json(RDAP_BOOTSTRAP_URL)
                    servers = {tld: urls[0] for tlds, urls in data["services"] for tld in tlds}
                    raw = json.dumps(servers)
                    self.cache.put_kv("rdap_bootstrap", raw)
                except (HttpError, OSError, ValueError, KeyError):
                    raw = "{}"
            self._rdap = {**json.loads(raw), **RDAP_OVERRIDES}
        return self._rdap

    def _host_slot(self, url: str) -> threading.Semaphore:
        host = urllib.parse.urlparse(url).netloc
        with self._lock:
            # registries rate-limit hard; at most 2 requests in flight per RDAP host
            return self._host_locks.setdefault(host, threading.Semaphore(2))

    def check_rdap(self, domain: str) -> CheckResult | None:
        tld = domain.rsplit(".", 1)[1]
        base = self.rdap_servers().get(tld)
        if not base:
            return None
        url = base.rstrip("/") + "/domain/" + domain
        for attempt in range(3):
            try:
                with self._host_slot(url):
                    data = http_get_json(url, accept="application/rdap+json")
                statuses = ", ".join(data.get("status", [])) if isinstance(data, dict) else ""
                return CheckResult(domain, "taken", "rdap", statuses)
            except HttpError as e:
                if e.status == 404:
                    return CheckResult(domain, "available", "rdap")
                if e.status == 429 and attempt < 2:
                    time.sleep(min(e.retry_after or 2.0 * (attempt + 1), 10))
                    continue
                return None
            except (OSError, ValueError):
                return None
        return None

    def check_dns(self, domain: str) -> CheckResult:
        query = urllib.parse.urlencode({"name": domain, "type": "NS"})
        try:
            data = http_get_json(f"{DOH_URL}?{query}", accept="application/dns-json")
        except (HttpError, OSError, ValueError) as e:
            return CheckResult(domain, "unknown", "dns", str(e))
        if data.get("Answer"):
            return CheckResult(domain, "taken", "dns", "has nameservers")
        if data.get("Status") == 3:
            return CheckResult(domain, "likely_available", "dns", "no DNS (NXDOMAIN); confirm with a registrar")
        return CheckResult(domain, "unknown", "dns", f"DNS status {data.get('Status')}")

    def check_one(self, domain: str) -> CheckResult:
        return self.check_rdap(domain) or self.check_dns(domain)

    def check(self, domains: list[str]) -> dict[str, CheckResult]:
        results: dict[str, CheckResult] = {}
        todo: list[str] = []
        for d in dict.fromkeys(domains):
            norm = normalize_domain(d)
            if norm is None:
                results[d] = CheckResult(d, "invalid", "-", "not a valid domain name")
                continue
            hit = None if self.refresh else self.cache.get_domain(norm)
            if hit:
                results[norm] = CheckResult(norm, hit["status"], hit["source"], hit["detail"] or "", hit["checked_at"], True)
            else:
                todo.append(norm)
        if todo:
            self.rdap_servers()  # load before threading: sqlite connections stay on their thread
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            for res in pool.map(self.check_one, todo):
                results[res.domain] = res
                self.cache.put_domain(res)
        return results


# --------------------------------------------------------------------------- #
# Output

MARKS = {"available": "✓", "likely_available": "~", "taken": "✗", "invalid": "!", "unknown": "?"}
COLORS = {"available": "32", "likely_available": "33", "taken": "2", "invalid": "31", "unknown": "31"}


def color(text: str, status: str, enabled: bool) -> str:
    return f"\033[{COLORS[status]}m{text}\033[0m" if enabled else text


def print_matrix(names: list[Candidate], tlds: list[str], results: dict[str, CheckResult], use_color: bool) -> None:
    width = max([len(c.name) for c in names] + [4])
    print(" " * (width + 2) + " ".join(f"{'.' + t:^6}" for t in tlds))
    for c in names:
        cells = []
        for t in tlds:
            r = results.get(f"{c.name}.{t}")
            status = r.status if r else "unknown"
            cells.append(color(f"{MARKS[status]:^6}", status, use_color))
        note = f"  {c.note}" if c.note else ""
        print(f"{c.name:<{width}}  " + " ".join(cells) + f"  [{c.source}]{note}")
    print("\n✓ free (RDAP)   ~ probably free (no DNS)   ✗ taken   ? unknown")


def print_free(results: dict[str, CheckResult], use_color: bool) -> None:
    free = sorted((r for r in results.values() if r.status in AVAILABLE), key=lambda r: (len(r.domain), r.domain))
    if not free:
        print("\nNo free domains found. Try --tlds with more endings or a different description.")
        return
    print(f"\nFree ({len(free)}):")
    for r in free:
        print("  " + color(r.domain, r.status, use_color) + ("  (probably)" if r.status == "likely_available" else ""))


# --------------------------------------------------------------------------- #
# CLI


def display(domain: str) -> str:
    """Show punycode domains in Unicode: xn--bckerei-5wa.ch -> bäckerei.ch."""
    try:
        return domain.encode("ascii").decode("idna") if "xn--" in domain else domain
    except UnicodeError:
        return domain


def parse_tlds(value: str | None) -> list[str]:
    raw = value or os.environ.get("DOMAINIKUS_TLDS") or ",".join(DEFAULT_TLDS)
    return [t.strip().lstrip(".").lower() for t in raw.split(",") if t.strip()]


def expand(targets: list[str], tlds: list[str]) -> list[str]:
    """'foo.com' stays as is; a bare 'foo' becomes foo.<tld> for every TLD."""
    out = []
    for t in targets:
        if "." in t.strip().rstrip("."):
            out.append(t)
        else:
            out.extend(f"{slugify(t) or t}.{tld}" for tld in tlds)
    return out


def cmd_check(args: argparse.Namespace, cache: Cache) -> int:
    tlds = parse_tlds(args.tlds)
    results = Checker(cache, args.workers, args.refresh).check(expand(args.domains, tlds))
    if args.json:
        print(json.dumps([r.as_dict() for r in results.values()], indent=2))
        return 0
    for r in results.values():
        tag = " (cached)" if r.cached else ""
        detail = f"  {r.detail[:60]}" if r.detail and r.status != "taken" else ""
        print(f"{color(MARKS[r.status], r.status, args.color)} {display(r.domain):<32} {r.status}{tag}{detail}")
    return 0


def cmd_suggest(args: argparse.Namespace, cache: Cache) -> int:
    names = generate(
        args.text, cache, synonyms=not args.no_synonyms, affixes=not args.no_affixes,
        use_ai=args.ai, extra=split_list(args.names), max_names=args.max,
    )
    if args.json:
        print(json.dumps([c.__dict__ for c in names], indent=2))
    else:
        for c in names:
            print(f"{c.name:<24} [{c.source}] {c.note}")
    return 0


def cmd_search(args: argparse.Namespace, cache: Cache) -> int:
    tlds = parse_tlds(args.tlds)
    names = generate(
        args.text, cache, synonyms=not args.no_synonyms, affixes=not args.no_affixes,
        use_ai=args.ai, extra=split_list(args.names), max_names=args.max,
    )
    if not names:
        print("Couldn't derive any names from that text. Try a few keywords.", file=sys.stderr)
        return 1
    domains = [f"{c.name}.{t}" for c in names for t in tlds]
    if not args.json:
        print(f"Checking {len(names)} names × {len(tlds)} TLDs = {len(domains)} domains…", file=sys.stderr)
    results = Checker(cache, args.workers, args.refresh).check(domains)
    cache.log_search(args.text, tlds, [c.name for c in names])
    if args.json:
        print(json.dumps({
            "query": args.text,
            "tlds": tlds,
            "names": [c.__dict__ for c in names],
            "results": [r.as_dict() for r in results.values()],
            "free": sorted(r.domain for r in results.values() if r.status in AVAILABLE),
        }, indent=2))
        return 0
    if args.free_only:
        names = [c for c in names if any(getattr(results.get(f"{c.name}.{t}"), "status", "") in AVAILABLE for t in tlds)]
    print_matrix(names, tlds, results, args.color)
    print_free(results, args.color)
    return 0


def cmd_history(args: argparse.Namespace, cache: Cache) -> int:
    rows = cache.history(args.limit)
    if args.json:
        print(json.dumps(rows, indent=2))
        return 0
    for r in rows:
        when = time.strftime("%Y-%m-%d %H:%M", time.localtime(r["created_at"]))
        free = []
        for name in json.loads(r["names"]):
            for tld in r["tlds"].split(","):
                hit = cache.get_domain(f"{name}.{tld}", now=0)  # any age
                if hit and hit["status"] in AVAILABLE:
                    free.append(f"{name}.{tld}")
        print(f"{when}  {r['query']!r}  → {len(free)} free" + (f": {', '.join(free[:6])}" if free else ""))
    return 0


def cmd_cache(args: argparse.Namespace, cache: Cache) -> int:
    if args.action == "stats":
        print(json.dumps({"db": str(args.db), **cache.stats()}, indent=2))
    elif args.action == "list":
        rows = cache.list_domains(args.status, args.limit)
        if args.json:
            print(json.dumps(rows, indent=2))
        else:
            for r in rows:
                when = time.strftime("%Y-%m-%d", time.localtime(r["checked_at"]))
                print(f"{color(MARKS[r['status']], r['status'], args.color)} {r['domain']:<32} {r['status']:<17} {when}")
    elif args.action == "clear":
        n = cache.clear(expired_only=args.expired)
        print(f"Removed {n} cached domain{'s' * (n != 1)}.")
    return 0


def split_list(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--db", type=Path, default=Path(os.environ.get("DOMAINIKUS_DB", DEFAULT_DB)),
                        help="SQLite cache file (default: %(default)s, or $DOMAINIKUS_DB)")
    common.add_argument("--json", action="store_true", help="machine-readable output")
    common.add_argument("--no-color", dest="color", action="store_false", default=sys.stdout.isatty())

    lookup = argparse.ArgumentParser(add_help=False)
    lookup.add_argument("--tlds", help=f"comma-separated endings (default: {','.join(DEFAULT_TLDS)}, or $DOMAINIKUS_TLDS)")
    lookup.add_argument("--refresh", action="store_true", help="ignore the cache and look up again")
    lookup.add_argument("--workers", type=int, default=8, help="parallel lookups (default: %(default)s)")

    gen = argparse.ArgumentParser(add_help=False)
    gen.add_argument("text", help="a description of the idea, a few keywords, or a name")
    gen.add_argument("--names", help="extra candidate names to include, comma-separated")
    gen.add_argument("--ai", action="store_true", help="also ask Claude for names with the same meaning (needs `anthropic`)")
    gen.add_argument("--no-synonyms", action="store_true", help="skip synonym lookup")
    gen.add_argument("--no-affixes", action="store_true", help="skip get…/…hq style variants")
    gen.add_argument("--max", type=int, default=30, help="max candidate names (default: %(default)s)")

    p = argparse.ArgumentParser(prog="domainikus", description="Find free domain names.")
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", parents=[common, lookup, gen], help="generate names from text and check them")
    s.add_argument("--free-only", action="store_true", help="only show names with at least one free TLD")
    s.set_defaults(func=cmd_search)

    c = sub.add_parser("check", parents=[common, lookup], help="check specific domains or bare names")
    c.add_argument("domains", nargs="+", help="example.com, or a bare name checked against --tlds")
    c.set_defaults(func=cmd_check)

    g = sub.add_parser("suggest", parents=[common, gen], help="only generate names, don't check them")
    g.set_defaults(func=cmd_suggest)

    h = sub.add_parser("history", parents=[common], help="past searches and what was free")
    h.add_argument("--limit", type=int, default=20)
    h.set_defaults(func=cmd_history)

    k = sub.add_parser("cache", parents=[common], help="inspect or clear the cache")
    k.add_argument("action", choices=["stats", "list", "clear"])
    k.add_argument("--status", choices=["available", "taken", "likely_available", "invalid"])
    k.add_argument("--expired", action="store_true", help="with clear: only drop stale entries")
    k.add_argument("--limit", type=int, default=100)
    k.set_defaults(func=cmd_cache)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cache = Cache(args.db)
    try:
        return args.func(args, cache)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
