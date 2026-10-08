---
name: domainikus
description: Find a free domain name. Checks which domains are registered and which are free (RDAP, DNS fallback, results cached in SQLite), and turns a description of a project into candidate names with the same meaning. Use when the user wants a domain, asks whether a domain is taken or free, wants name ideas for a product or company, or wants alternatives to a domain that is already taken.
---

# domainikus

`domainikus.py` (next to this file) does the lookups and caching. Your job is the part a script does badly: coming up with names that mean the same thing as the user's idea.

Run it with `python3 <this-dir>/domainikus.py`. It needs only the Python standard library.

## Workflow

1. **Understand the idea.** Take the user's text as is. If it is only one or two words, that is fine. Don't ask follow-up questions unless the request is empty.
2. **Generate alternatives with the same meaning.** Write 15–30 candidate names yourself before running anything:
   - synonyms and near-synonyms of the key concepts (fast → swift, rapid, quick, presto)
   - translations into the languages the user's audience speaks (for Swiss users: German, French, Italian, English; Latin works for brandable names)
   - compounds of two concepts (dog + walk → dogwalk, walkies, pawstroll)
   - short coinages that still evoke the meaning (bakery → bakeo, brotli)
   - Use only a-z, 0-9 and hyphens. Aim for 4–12 characters. Avoid famous brand names.
3. **Check them all in one run:**
   ```sh
   python3 domainikus.py search "<user's text>" --names "name1,name2,..." --tlds com,ch,io --free-only
   ```
   `search` adds its own keyword combinations and English synonyms to your names. Add `--no-synonyms` if those add noise, for example with non-English text.
   To check specific domains, use `python3 domainikus.py check example.com otherthing.ch`. A bare name is checked against every TLD in `--tlds`.
4. **Report.** List the free domains first, best ones on top. Give a few words on why each one fits the meaning. Then mention notable names that are taken. Mark `~` results (no DNS, not confirmed by the registry) as "probably free".
5. **Iterate.** If few are free, generate a new batch, for example longer compounds, other languages, or other TLDs, and run `search` again. Earlier lookups come from the cache, so repeats are fast.

## Notes

- Use `--json` when you want to parse results instead of reading the table.
- `history` lists past searches with their free domains. `cache list --status available` lists every free domain seen so far.
- Cached results are reused for 14 days for taken domains and 1 day for free ones. Use `--refresh` before the user buys, to look them up again.
- A free result means the registry has no record. It doesn't guarantee the domain is buyable: premium pricing and reserved names show only at a registrar.
- Set `DOMAINIKUS_TLDS` to change the default endings (com,ch,io,net,org,app).
