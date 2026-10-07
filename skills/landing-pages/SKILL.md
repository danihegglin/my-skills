---
name: landing-pages
description: Build landing pages that convert and look like a senior designer made them, using Astro, Tailwind v4 and modern CSS. Use for any landing page, marketing page, product page, waitlist, launch page, homepage or pricing page, for writing or rewriting hero and page copy, for "make this page look better / less generic / less AI", and for reviewing an existing page's conversion, design or copy.
---

# Landing pages

A landing page has one job: get a specific person to take one specific action. Design and copy both serve that job. A page that is beautiful but unclear loses; a page that is clear but looks like a template loses trust. This skill gets you both.

Work in this order and don't skip ahead. Most bad landing pages come from opening the editor before knowing what the page says.

1. **Brief**: who, what, why now, one action
2. **Copy**: the whole page, as words, before any layout
3. **Direction**: one design idea, written down
4. **Build**: tokens, then sections, in Astro
5. **Verify**: build, screenshot at phone and desktop width, run the review checklist, fix, repeat
6. **Hand over**: what you made, why, and what's still missing

Read the reference file for each step when you reach it:

| Step | Read |
|---|---|
| Brief, structure, section order, CTAs, proof | `references/conversion.md` |
| Copy | `references/copywriting.md` |
| Direction and visual craft | `references/design.md` |
| Astro build | `references/astro.md` |
| Verify | `references/review-checklist.md` |

---

## 1. Brief

Look for existing context first: `.agents/product-marketing.md`, `.claude/product-marketing.md`, `product-marketing-context.md`, a README, an existing site, docs, reviews, support tickets. Only ask about what's missing.

You need answers to these five. If the user wants speed, make the call yourself, write your assumption down, and move on.

1. **The action.** One. Sign up, book a call, join the waitlist, buy. Everything else is secondary.
2. **The reader.** A specific person with a specific problem, in their own words. "Ops lead at a 50-person Shopify brand who exports CSVs every Monday" beats "e-commerce businesses".
3. **Awareness.** Do they know they have the problem? Do they know solutions like this exist? Do they know you? This decides how much the page has to explain (see `conversion.md`).
4. **The difference.** Why this over the alternative they'd otherwise use, including doing nothing or a spreadsheet. If nobody can answer this, the page can't either: flag it.
5. **The proof.** Real numbers, named customers, quotes, logos, press, reviews, a free plan, a demo. List what exists. Never invent any of it.

## 2. Copy first

Write every word of the page in reading order before designing: nav, hero, every section, FAQ, final CTA, footer, page title, meta description, OG text. Put it in one place the user can edit (in Astro: `src/content/landing.ts` or a content collection).

The short version of `copywriting.md`:

- **Clear beats clever.** A visitor decides in about five seconds whether the page is for them. The headline says what you get; the subhead says how.
- **Specific beats impressive.** "Close the books in 2 days instead of 9" beats "Supercharge your finance workflow".
- **Use the customer's words**, from reviews, calls, tickets, Reddit, sales notes.
- **One idea per section**, ordered to answer the objections the reader actually has, in the order they have them.
- **No AI tells.** No "It's not X, it's Y", no "The result?", no "Unlock / seamless / supercharge / elevate", no triple-adjective stacks, no em dashes in headlines. Full list in `copywriting.md`.
- **Never fabricate.** Missing proof becomes `[NEED: customer quote with a number]` in the copy, not a made-up testimonial.

## 3. Pick one direction

Before code, write a short design memo (put it as a comment at the top of `index.astro`):

```
Direction: "Field notebook". Warm paper, ink, one red pencil accent.
Feels like: calm, precise, a little handmade.
Type: Instrument Serif for display, Geist for UI and body, Geist Mono for labels.
Colour: paper oklch(97% 0.01 85), ink oklch(20% 0.02 60), accent oklch(58% 0.19 30). Flat, no gradients.
Signature: hand-drawn underlines that draw in on scroll; product shown as annotated screenshots.
Avoid: glassmorphism, gradient blobs, centered-everything.
```

The direction comes from the product and reader, not from a menu of styles. Ask: what would this brand look like if it were a physical object? What do the three best-looking sites in this category do, and what do they all have in common that we can avoid?

One **signature** element is enough. A page with five clever ideas reads as noise. A page with one, executed perfectly and echoed in small details, is memorable.

`design.md` covers typography, colour, layout, imagery, motion, detail and the list of patterns that make a page look generated.

## 4. Build in Astro

Default stack: **Astro (static output) + Tailwind CSS v4 + TypeScript**, `.astro` components for everything static, small framework islands only where something is interactive. shadcn/ui is fine for interactive primitives (accordion, tabs, dialog), restyled to your tokens. It is not a design.

Non-negotiables (details and code in `astro.md`):

- **Zero JS by default.** A static section is an `.astro` file. Hydrate only real interactivity, and prefer `client:visible` / `client:idle` over `client:load`.
- **Tokens first.** Fonts, colour, radius, spacing and easing live in `@theme` / `:root` before you write a section. No hex codes inside components.
- **Images through `astro:assets`** with real `width`/`height`, `sizes`, and an eager, high-priority hero image. No layout shift.
- **Self-hosted fonts**, preloaded display face, at most two families.
- **Works without JS.** Reveal animations must never leave content invisible if a script fails.
- **Mobile is the main page.** Most landing traffic is on phones. Design 390px first, then widen.
- **Semantic HTML**: one `h1`, real `button` / `a`, labelled form fields, skip link, visible focus.
- **SEO and sharing**: `site` set, title, description, canonical, OG image 1200×630, sitemap, JSON-LD.

## 5. Verify by looking

You can't judge a page from its source. After each meaningful change:

1. `npm run build` (and `npx astro check` if TypeScript is set up) with no errors or warnings.
2. Run `npm run preview` and take full-page screenshots at **390px** and **1440px** (Playwright snippet in `astro.md`). Read them.
3. Go through `references/review-checklist.md`. Be harsh. Anything that looks like a default, fix it.
4. Fix and re-screenshot. Two or three rounds is normal.

## 6. Hand over

Tell the user, briefly:

- The direction in one sentence, and the signature element
- The page structure and why it's in that order
- Headline alternatives (2-3) with a one-line rationale each
- Every `[NEED: ...]` placeholder that blocks launch: missing proof, legal pages, real screenshots, analytics
- How to edit copy (which file) and how to run/deploy

## Ground rules

- If you're improving an existing page, read it and screenshot it first. Keep what works; say what you changed and why.
- Match the existing project's conventions (package manager, component style, file layout) over this skill's defaults.
- Don't fake product UI with lorem ipsum or invent features. Build product visuals from what the product really does, or leave a clearly marked placeholder.
- Don't add sections to fill space. A short page that answers every objection beats a long one that repeats itself.
