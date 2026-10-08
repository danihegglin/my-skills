# domainikus

Finds free domain names. You describe your idea, and domainikus turns it into candidate names with the same meaning, then checks which are registered and which are free. Every lookup is cached in SQLite, so repeat searches are fast and don't hammer the registries.

It's a single Python file with no dependencies. It also works as a Claude skill (`SKILL.md`): Claude writes the alternatives with the same meaning, and the script checks them.

**Web app:** https://domainikus.vatia.workers.dev is a React + Vite page with a Cloudflare Worker backend. Its source is in [`web/`](web/).

## Usage

```sh
# generate names from a description and check them
./domainikus.py search "an app to book dog walkers nearby"
./domainikus.py search "Bäckerei in Zürich" --tlds ch,com --names "brotli,beck,pane" --free-only

# check specific domains, or a bare name against every TLD
./domainikus.py check example.com bäckerei.ch
./domainikus.py check coolname --tlds com,ch,io,dev

# only generate names, no lookups
./domainikus.py suggest "fast bakery"

# past searches, and the cache
./domainikus.py history
./domainikus.py cache list --status available
./domainikus.py cache stats
./domainikus.py cache clear --expired
```

`search` prints a matrix of names against TLDs, followed by the list of free domains:

```
                 .com   .ch    .io
bookdogwalkers    ✓      ✓      ✓     [input]
bookdog           ✗      ✓      ✓     [combo]
dogbook           ✗      ✓      ✗     [combo]
```

`✓` means the registry has no record of the domain, `~` means there's no RDAP and no DNS (probably free), and `✗` means taken. Every command accepts `--json`.

## How it works

**Availability.** It first asks the registry over RDAP: 404 means free, 200 means taken. The RDAP server comes from the IANA bootstrap file, plus overrides for .ch/.li (SWITCH), .de (DENIC) and .io, which the file doesn't list. TLDs without RDAP, and RDAP errors, fall back to a DNS-over-HTTPS NS lookup: nameservers mean taken, NXDOMAIN means probably free. Rate limits (429) are retried with backoff, and each RDAP host gets at most 2 requests at a time.

**Cache.** Stored at `~/.cache/domainikus/cache.db`. Change it with `--db` or `$DOMAINIKUS_DB`. Taken domains are reused for 14 days, free ones for 1 day. Failed lookups aren't cached. `--refresh` looks everything up again. The cache also stores synonym lookups and the search history.

**Alternatives.** The text is reduced to keywords, skipping English and German stopwords, with umlauts transliterated (ä → ae). From the keywords it builds:
- the joined phrase and keyword pairs (`bookdog`, `dogbook`)
- synonyms from [Datamuse](https://www.datamuse.com/api/), swapped into the phrase. These are English only, and rare words are filtered out.
- prefixes and suffixes on the best names (`get…`, `…hq`)
- names you pass with `--names`
- with `--ai`, names from Claude with the same meaning, including translations. This needs `pip install anthropic` and an API key.

Combinations rank above single words, because single dictionary words are almost always taken.

Datamuse synonyms are a crude baseline: they mix up word senses (book → ledger, script). For good alternatives, use `--ai`, pass your own with `--names`, or use domainikus as a Claude skill.

## Options

| Option | Meaning |
|---|---|
| `--tlds com,ch,io` | TLDs to check. Default: `com,ch,io,net,org,app`, or `$DOMAINIKUS_TLDS` |
| `--names a,b,c` | extra candidate names |
| `--ai` | ask Claude for names with the same meaning |
| `--no-synonyms`, `--no-affixes` | turn off those generators |
| `--max 30` | maximum number of candidate names |
| `--free-only` | hide names with no free TLD |
| `--refresh` | ignore the cache |
| `--json` | machine-readable output |

## Caveats

A "free" result means the registry has no record of the domain. It can still be reserved, premium-priced or blocked, so confirm at a registrar before you buy.

## Tests

```sh
python3 -m unittest test_domainikus   # offline, network is mocked
```

## Web app

`web/` is the same tool as a website. It's a React + Vite frontend, plus a Cloudflare Worker that does the lookups and keeps the SQLite cache in a Durable Object.

```sh
cd web
npm install
npm run dev:api   # worker + cache on :8787 (wrangler dev, serves the last build)
npm run dev       # Vite on :5173, proxies /api to :8787
npm test          # vitest, network mocked
npm run deploy    # build + wrangler deploy
```

- `shared/names.ts` holds the slugs, validation, keywords and ranking used by both the browser and the worker.
- `worker/check.ts` does the RDAP and DNS lookups. `worker/generate.ts` handles Datamuse synonyms and Claude ideas. `worker/cache.ts` is the SQLite Durable Object.
- The browser sends lookups to `/api/check` in batches of 12 domains, which keeps each request under the Workers subrequest limit. Results fill in as they arrive.
- To turn on ideas from Claude, set the key with `npx wrangler secret put ANTHROPIC_API_KEY`. AI requests are limited to 10 per minute per IP, and the answers are cached per description.
