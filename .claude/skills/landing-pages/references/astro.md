# Building it in Astro

Astro ships HTML and CSS by default and only sends JavaScript for the islands you ask for. That's exactly what a landing page wants: fast first paint, perfect Lighthouse scores, and room for one or two rich interactive moments.

These examples target current Astro (5+) with Tailwind CSS v4. If the project already exists, follow its versions and conventions; check `package.json` and the Astro docs for anything version-specific.

## Contents

- Setup
- Project structure
- Copy lives in one file
- Design tokens (Tailwind v4)
- Fonts
- Layout: head, SEO, sharing
- Sections as Astro components
- Buttons and links
- Images
- Islands: when and how to hydrate
- Motion without hiding content
- Forms
- Analytics
- Performance budget
- Accessibility basics
- Screenshot loop
- Deploy

---

## Setup

```bash
npm create astro@latest my-page -- --template minimal --typescript strict
cd my-page
npx astro add tailwind      # Tailwind v4 via @tailwindcss/vite
npx astro add sitemap
# only if you need interactive islands:
npx astro add react         # or preact / svelte / solid / vue
```

Set `site` in `astro.config.mjs`: canonical URLs, OG URLs and the sitemap need it.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://example.com',
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
})
```

**shadcn/ui** (optional): `npx shadcn@latest init` works with Astro + React. Use it for interactive primitives inside islands (Accordion, Tabs, Dialog, Sheet). For static markup, write Astro and reuse the styling (e.g. import `buttonVariants` and apply it to an `<a>`). Restyle the tokens completely; stock shadcn is recognisable at a glance.

## Project structure

```
src/
  content/landing.ts        # all page copy
  styles/global.css         # tokens, base styles, utilities
  layouts/Layout.astro      # <head>, SEO, fonts, global scripts
  components/
    sections/               # Hero.astro, Proof.astro, HowItWorks.astro, ...
    ui/                     # Button.astro, Container.astro, Eyebrow.astro, ...
    islands/                # the few interactive framework components
  assets/                   # images processed by astro:assets
  pages/
    index.astro             # design memo comment + section order
    404.astro
public/
  favicon.svg  og.png  robots.txt
```

`index.astro` should read like a table of contents: the design memo as a comment, then the sections in order.

## Copy lives in one file

Keep words out of markup so copy can be edited, reviewed and A/B tested without touching layout.

```ts
// src/content/landing.ts
export const meta = {
  title: 'Ledgerly: close your books in 2 days, not 9',
  description: 'Month-end close for finance teams on NetSuite. Auto-match transactions, chase approvals, ship reports. 14-day free trial.',
}

export const hero = {
  eyebrow: 'For finance teams on NetSuite',
  headline: 'Close your books in 2 days, not 9',
  subhead: 'Ledgerly matches transactions, chases approvals and drafts your reports, so month-end stops eating the first two weeks of every month.',
  cta: { label: 'Start free trial', href: '/signup' },
  secondary: { label: 'Watch the 2-min demo', href: '#demo' },
  reassurance: '14 days free. No card.',
}

export const steps = [
  { title: 'Connect NetSuite', body: 'Read-only, takes about 4 minutes.' },
  { title: 'Review the matches', body: 'Ledgerly auto-matches 92% of transactions. You check the rest.' },
  { title: 'Close', body: '[NEED: real median close time from beta customers]' },
] as const
```

For many pages or variants, use a content collection (`src/content.config.ts`) with a schema instead.

## Design tokens (Tailwind v4)

Tailwind v4 is configured in CSS. Put every design decision here before writing a component.

```css
/* src/styles/global.css */
@import "tailwindcss";

@theme {
  --font-display: "Instrument Serif", ui-serif, Georgia, serif;
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  --color-paper: oklch(97.5% 0.008 85);
  --color-ink: oklch(21% 0.015 60);
  --color-ink-muted: oklch(48% 0.012 60);
  --color-line: oklch(21% 0.015 60 / 0.1);
  --color-accent: oklch(60% 0.19 32);
  --color-accent-ink: oklch(98% 0.01 32);

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --radius-card: 1rem;
}

@layer base {
  html { background: var(--color-paper); color: var(--color-ink); }
  body { font-family: var(--font-sans); font-size: 1.0625rem; line-height: 1.6; -webkit-font-smoothing: antialiased; }
  h1, h2, h3 { text-wrap: balance; letter-spacing: -0.02em; line-height: 1.1; }
  p { text-wrap: pretty; }
  ::selection { background: var(--color-accent); color: var(--color-accent-ink); }
  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; border-radius: 4px; }
  [id] { scroll-margin-top: 6rem; }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
}
```

Tokens become utilities automatically: `bg-paper`, `text-ink-muted`, `border-line`, `font-display`, `ease-out`. Using shadcn? Map its semantic variables (`--background`, `--primary`, ...) to these values in `:root` and `@theme inline`.

## Fonts

Self-host. No layout shift, no third-party request, no GDPR question.

Simplest robust approach, Fontsource:

```bash
npm i @fontsource-variable/geist @fontsource/instrument-serif
```

```astro
---
// Layout.astro frontmatter
import '@fontsource-variable/geist'
import '@fontsource/instrument-serif'
import '@/styles/global.css'
---
```

Newer Astro versions also have a built-in Fonts API (`fonts` in `astro.config.mjs` plus a `<Font />` component from `astro:assets`) that downloads, subsets, generates fallback metrics and preloads for you. Prefer it when the project's Astro version supports it; check the docs for the exact config.

Either way: at most two families plus a mono, only the weights you use, and preload the face used in the hero headline.

## Layout: head, SEO, sharing

```astro
---
// src/layouts/Layout.astro
import '@/styles/global.css'

interface Props { title: string; description: string; ogImage?: string }
const { title, description, ogImage = '/og.png' } = Astro.props
const canonical = new URL(Astro.url.pathname, Astro.site)
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script is:inline>document.documentElement.classList.add('js')</script>
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="sitemap" href="/sitemap-index.xml" />
    <meta name="theme-color" content="#f8f5ef" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonical} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={new URL(ogImage, Astro.site)} />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json" set:html={JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Ledgerly',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description,
      url: canonical.toString(),
    })} />
  </head>
  <body>
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-paper focus:px-4 focus:py-2">Skip to content</a>
    <slot />
  </body>
</html>
```

Add `FAQPage` JSON-LD if the FAQ is substantial, `Product` with `offers` for e-commerce. Design the OG image (1200×630) like a poster: headline, product, logo. It's the page's first impression in every chat and feed.

## Sections as Astro components

Each section is a self-contained `.astro` file that takes its copy from `landing.ts`. Plain HTML, Tailwind classes, no JS.

```astro
---
// src/components/sections/Hero.astro
import { Image } from 'astro:assets'
import { hero } from '@/content/landing'
import Button from '@/components/ui/Button.astro'
import shot from '@/assets/hero-matches.png'
---
<section class="relative pt-28 pb-20 sm:pt-36 lg:pb-28">
  <div class="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
    <div>
      <p class="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted" data-rise>{hero.eyebrow}</p>
      <h1 class="mt-5 font-display text-[clamp(2.9rem,1.4rem+5.6vw,5.75rem)] leading-[0.98]" data-rise style="--d: 80ms">
        {hero.headline}
      </h1>
      <p class="mt-6 max-w-[46ch] text-lg text-ink-muted sm:text-xl" data-rise style="--d: 180ms">{hero.subhead}</p>
      <div class="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center" data-rise style="--d: 280ms">
        <Button href={hero.cta.href} data-cta="hero">{hero.cta.label}</Button>
        <Button href={hero.secondary.href} variant="ghost">{hero.secondary.label}</Button>
      </div>
      <p class="mt-4 text-sm text-ink-muted" data-rise style="--d: 340ms">{hero.reassurance}</p>
    </div>
    <div data-rise style="--d: 240ms">
      <Image
        src={shot}
        alt="Ledgerly matching 1,284 NetSuite transactions, 41 flagged for review"
        widths={[480, 720, 960, 1280]}
        sizes="(min-width: 1024px) 560px, 100vw"
        loading="eager"
        fetchpriority="high"
        class="rounded-[var(--radius-card)] border border-line shadow-[0_1px_2px_oklch(0%_0_0/0.05),0_24px_48px_-24px_oklch(0%_0_0/0.25)]"
      />
    </div>
  </div>
</section>
```

## Buttons and links

A link that looks like a button is still an `<a>`. A button that does something on the page is a `<button>`.

```astro
---
// src/components/ui/Button.astro
import type { HTMLAttributes } from 'astro/types'

type Props = HTMLAttributes<'a'> & { variant?: 'primary' | 'ghost' }
const { variant = 'primary', class: className, ...rest } = Astro.props

const base = 'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.95rem] font-medium transition-[transform,background-color,box-shadow] duration-200 ease-out active:scale-[0.98]'
const variants = {
  primary: 'bg-ink text-paper hover:bg-accent hover:text-accent-ink',
  ghost: 'text-ink hover:bg-ink/5',
}
---
<a class:list={[base, variants[variant], className]} {...rest}><slot /></a>
```

## Images

- Put images in `src/assets/` and render with `<Image />` or `<Picture />` from `astro:assets`: automatic AVIF/WebP, correct dimensions, lazy by default.
- The hero (LCP) image: `loading="eager"` and `fetchpriority="high"`. Everything else stays lazy.
- Always give `sizes` when using `widths`, matching the real rendered width.
- `alt` describes what the image shows and why it matters ("Dashboard showing churn falling from 7% to 4%"), or `alt=""` for decoration.
- SVG logos and icons inline or via `<img>`; use `@lucide/astro` (or similar) for icons in `.astro` files so they render as static SVG with no JS.
- Video: muted, `playsinline`, `autoplay loop` only for short silent loops, with a `poster`, `preload="none"` below the fold, and MP4 (H.264) + WebM. Prefer CSS/HTML-built product animations when practical.

## Islands: when and how to hydrate

Default to zero JS. Use an island only for real interactivity: a live product demo, a pricing toggle that recalculates, a carousel the user drives, a form with client validation.

| Directive | Use for |
|---|---|
| none | Everything static. The default. |
| `client:visible` | Below-the-fold interactive bits. Most islands. |
| `client:idle` | Above-the-fold widgets that can wait a moment. |
| `client:load` | Above-the-fold interaction needed immediately (hero demo). Use sparingly. |
| `client:media="(max-width: 767px)"` | Mobile-only interactions (e.g. menu). |
| `client:only="react"` | Components that can't render on the server. Rare. |

Many "interactive" pieces need no framework:

- FAQ accordion → `<details name="faq">` (exclusive open, no JS) styled with `interpolate-size` / `::details-content`
- Mobile menu → `<dialog>` or `popover` with a few lines of script
- Monthly/annual toggle → two `<input type="radio">` and CSS `:has()` to swap prices
- Tabs with a few panels → radio inputs + `:has()`, or a tiny `<script>`

Rules for islands:

- Pass serialisable props only (strings, numbers, plain objects). No functions, no class instances, no Astro components as props.
- Don't pass `.astro` icon components into React; import `lucide-react` icons inside the island.
- Keep each island small; import only what it renders.
- `<script>` tags in `.astro` files are bundled, deduped and deferred automatically. Use `is:inline` only for tiny pre-paint snippets.

## Motion without hiding content

Hide-then-reveal only when JS is known to be running (the `js` class set inline in `<head>`), and turn it all off for reduced motion.

```css
/* global.css */
@media (prefers-reduced-motion: no-preference) {
  /* hero entrance, CSS only */
  [data-rise] { animation: rise 700ms var(--ease-out) both; animation-delay: var(--d, 0ms); }

  /* scroll reveals */
  .js [data-reveal] { opacity: 0; translate: 0 14px; transition: opacity 600ms var(--ease-out), translate 600ms var(--ease-out); transition-delay: var(--d, 0ms); }
  .js [data-reveal].is-visible { opacity: 1; translate: 0 0; }
}

@keyframes rise { from { opacity: 0; translate: 0 16px; } }
```

```astro
<!-- once, in Layout.astro -->
<script>
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target) }
  }, { rootMargin: '0px 0px -10% 0px' })
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el))
</script>
```

Pure-CSS alternative where supported:

```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    [data-scroll-reveal] { animation: rise linear both; animation-timeline: view(); animation-range: entry 0% cover 25%; }
  }
}
```

For page-to-page transitions on multi-page sites, `@view-transition { navigation: auto; }` in CSS gives cross-document transitions with no JS. Astro's `<ClientRouter />` is only worth it if you need persistent state across navigations.

## Forms

- Static site: post to a form service or your app's API, with a progressively enhanced `<form action method="post">` so it works without JS.
- Server routes available (an adapter like Cloudflare, Vercel, Netlify, Node): use Astro Actions for type-safe handling with validation, and return a real success state.
- Honeypot field or a privacy-friendly challenge (Turnstile) for spam.
- `type="email"`, `autocomplete="email"`, visible label, `aria-describedby` for errors.

## Analytics

Add `data-cta="hero"`, `data-cta="pricing-pro"`, `data-cta="final"` to every CTA, and send a click event with that value from one small delegated listener. Use a lightweight tool (Plausible, Fathom, Umami, PostHog). Don't load heavy tag managers on a page whose job is speed and conversion; if they're required, load after interaction or idle.

## Performance budget

Targets on a mid-range phone over 4G:

- LCP < 2.0s, CLS < 0.05, INP < 200ms
- JS shipped on first load < 50 KB gzipped (0 KB is achievable for many pages)
- Total transfer for first view < 1 MB, fonts < 150 KB
- Lighthouse 95+ in every category

Checks: `npm run build` output shows each island's size; run Lighthouse or PageSpeed Insights on the preview/deploy; look for oversized images and unused font weights first.

## Accessibility basics

- One `h1`, heading levels in order, landmarks (`header`, `main`, `footer`, `nav`)
- Every interactive element reachable and usable by keyboard, with visible focus
- Contrast: 4.5:1 text, 3:1 large text and UI
- Images have meaningful `alt` or `alt=""`
- Motion respects `prefers-reduced-motion`; nothing auto-plays with sound; carousels have pause controls
- Form fields have labels and announced errors
- `lang` on `<html>`; link text that makes sense out of context

## Screenshot loop

Look at the rendered page, not the code. With the preview running (`npm run build && npm run preview`, default port 4321):

```js
// scripts/shoot.mjs   (npm i -D playwright; then: node scripts/shoot.mjs)
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4321/'
const browser = await chromium.launch()
for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 900]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  await page.emulateMedia({ reducedMotion: 'reduce' })   // skip entrance animations
  await page.goto(url, { waitUntil: 'networkidle' })
  // trigger scroll reveals so the full-page shot isn't blank
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible')))
  await page.screenshot({ path: `shots/${name}-fold.png` })
  await page.screenshot({ path: `shots/${name}-full.png`, fullPage: true })
  await page.close()
}
await browser.close()
```

If Playwright's browser isn't installed, run `npx playwright install chromium` (or point `executablePath` at an existing Chromium). Read the four images, check them against `review-checklist.md`, fix, repeat. Don't commit `shots/`.

## Deploy

Static output deploys anywhere: Cloudflare (Workers static assets or Pages), Netlify, Vercel, GitHub Pages. Add a `robots.txt`, check the sitemap at `/sitemap-index.xml`, verify the OG card with a social preview tool, and run Lighthouse on the live URL once.
