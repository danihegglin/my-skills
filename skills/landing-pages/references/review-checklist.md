# Review checklist

Run this against screenshots at 390px and 1440px, not against the code. Fix every "no" before handing over. When reviewing someone else's page, report findings in this order, most impactful first.

## 1. Five-second test (most important)

Look at the first screen for five seconds, then look away.

- [ ] Can you say what the product is, in plain words?
- [ ] Can you say who it's for?
- [ ] Can you say why it's better than the alternative?
- [ ] Is the next step obvious, with one primary CTA?
- [ ] Is there a hint of proof on the first screen?
- [ ] Is the product itself visible?

## 2. Copy

- [ ] Headline passes the swap test (couldn't be on a competitor's site)
- [ ] Every section heading is a claim, not a label ("Features", "Testimonials")
- [ ] Numbers and specifics instead of adjectives
- [ ] No AI tells: contrast reveals, "The result?", negation lists, triads everywhere, banned words (see `copywriting.md`)
- [ ] No em dashes or exclamation marks in headlines, subheads or buttons
- [ ] Sentence case, consistent voice
- [ ] Same primary CTA label everywhere; risk reducer next to it
- [ ] No fabricated proof; every `[NEED: ...]` listed for the user
- [ ] Title ≤ 60 chars, meta description ≤ 155 chars, both specific

## 3. Structure and conversion

- [ ] Sections answer objections in a sensible order for this traffic's awareness level
- [ ] No section exists just to fill space; no repeated arguments
- [ ] Proof sits next to the claims it supports
- [ ] CTA appears at least in hero and at the end; reachable without long scrolling on mobile
- [ ] Nav doesn't compete with the CTA
- [ ] Forms ask only for what's needed, have labels, and a real success state
- [ ] Pricing visible if self-serve; FAQ covers price, switching, security, cancelation

## 4. Visual design

- [ ] There's a clear direction, and you can name the signature element
- [ ] Fewer than three items from "What makes a page look generated" in `design.md`
- [ ] Type: clear scale with real contrast, tight display tracking, balanced headline wrapping, body measure ≤ ~75ch
- [ ] At most two families (+ mono); weights used deliberately
- [ ] One accent, used sparingly; primary CTA is the most prominent element on each screen
- [ ] All text passes contrast, including muted text and text on colour
- [ ] Left edges align; spacing follows one scale; consistent section padding
- [ ] Sections vary in layout; no five identical blocks in a row
- [ ] Product visuals are real, legible and cropped to the point; no lorem ipsum, no stock or AI people
- [ ] Icons from one set, one size, one stroke; logos monochrome and optically balanced
- [ ] Radius, border and shadow systems are consistent; nested radii look right
- [ ] Hover, active, focus-visible states exist on everything clickable

## 5. Mobile (390px)

- [ ] No horizontal scroll anywhere
- [ ] Headline is 2-4 lines, no awkward single-word lines
- [ ] Hero CTA visible on the first screen
- [ ] Product visual still legible (tighter crop or alternative if not)
- [ ] Tap targets ≥ 44px; nothing hover-only
- [ ] Tables and comparison grids remain readable (stack or scroll inside their own container)

## 6. Motion

- [ ] Hero entrance is one short, orchestrated sequence
- [ ] Scroll reveals are subtle and not on every element
- [ ] Only transform/opacity animated; no jank on scroll
- [ ] `prefers-reduced-motion` respected
- [ ] With JS disabled, all content is visible

## 7. Technical

- [ ] `npm run build` and `astro check` clean
- [ ] JS only where interactive; islands use `client:visible`/`client:idle` where possible
- [ ] Hero image eager + high priority; other images lazy, sized, AVIF/WebP via `astro:assets`
- [ ] Fonts self-hosted, only used weights, display face preloaded, no visible layout shift on load
- [ ] One `h1`, logical headings, landmarks, skip link, labelled fields, meaningful alt text
- [ ] Canonical, OG image (1200×630), Twitter card, sitemap, robots.txt, JSON-LD, favicon, 404
- [ ] CTAs carry `data-cta` attributes for tracking
- [ ] Lighthouse 95+ on mobile; LCP < 2s; CLS < 0.05

## 8. Final taste check

- [ ] Put the desktop screenshot next to two category leaders. Does it hold up?
- [ ] Is there one thing a visitor would remember tomorrow?
- [ ] Is there anything on the page only because "landing pages have that"? Remove it.
