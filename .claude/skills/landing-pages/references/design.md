# Design and taste

Taste is mostly restraint plus attention to detail. The best modern landing pages (think Linear, Stripe, Vercel, Raycast, Resend, Mercury, Clerk, Family, Arc, Teenage Engineering, PostHog for the loud end) look different from each other, but they share the same habits: a clear idea, few elements, perfect type, real product, obsessive details, motion that means something.

## Contents

- Finding the direction
- Typography
- Colour
- Layout and rhythm
- Imagery and product visuals
- Surfaces and detail
- Motion
- Modern CSS worth using
- Dark mode
- What makes a page look generated
- Calibration

---

## Finding the direction

1. **Start from the brand and reader.** A payroll tool for accountants and a synth for musicians should not share a look. Write three adjectives the brand should feel like and three it must not ("precise, calm, warm / not corporate, not playful, not techy").
2. **Survey the category.** Look at 5-10 competitors. Note what they all do (usually: blue, Inter, centered hero, dashboard screenshot, 3-card grid). That's the baseline to depart from, deliberately.
3. **Find a metaphor or material.** A notebook, a receipt, a lab instrument, a magazine spread, a terminal, a control panel, a field guide. It gives you consistent answers to small questions (what does a divider look like? a label? a hover?).
4. **Choose one signature.** One thing someone would describe to a friend: an interactive product demo in the hero, an oversized serif headline, a ticker of real live numbers, hand-drawn annotations, a single bold colour flood section. Make it excellent; keep everything else quiet so it can be seen.
5. **Write the memo** (format in `SKILL.md`) and stick to it.

Directions that age well right now: confident editorial type with lots of space; product-as-hero with real, interactive UI; warm neutrals with one saturated accent; dense, technical, monospace-flavoured "instrument" pages; bold flat colour blocks. Directions that age badly: glass on gradient blobs, purple-to-blue everything, 3D abstract shapes, dark mode with neon glow on every card.

## Typography

Type does more for perceived quality than anything else on the page.

**Choosing faces**

- **One or two families.** A display face plus a text face, or one superfamily used at different sizes and weights. Add a mono for labels/data only if it fits the direction.
- **Choose with intent.** Inter, Roboto, Poppins, Montserrat, Open Sans and Space Grotesk read as defaults. They're not banned, but if you use one, it should be a decision (e.g. Inter Display with tight tracking at large sizes), not a fallback.
- **Good starting points**, free and self-hostable:
  - Sans: Geist, Inter Display, Hanken Grotesk, Schibsted Grotesk, Instrument Sans, Bricolage Grotesque, Onest, Manrope, General Sans / Satoshi / Switzer / Cabinet Grotesk (Fontshare)
  - Serif: Instrument Serif, Fraunces, Newsreader, Source Serif 4, EB Garamond, Young Serif, Gloock
  - Mono: Geist Mono, JetBrains Mono, IBM Plex Mono, Martian Mono, Commit Mono
- **Serif + sans** is the quickest way to look editorial and less like every SaaS page. Serif display at large size, sans for everything else.
- **Variable fonts** where available: one file, any weight, smooth optical sizes.

**Setting type**

- **Scale with contrast.** Big jumps between levels. A hero at 56-96px over body at 17-18px looks designed; 40px over 16px looks like a template.
- **Fluid sizes** with `clamp()`: `font-size: clamp(2.75rem, 1.6rem + 5vw, 5.5rem)`.
- **Tight display tracking**: -0.02em to -0.045em for large sans headlines. Serifs usually need less. Small caps and uppercase labels need positive tracking (+0.04em to +0.12em).
- **Line height** falls as size rises: display 0.95-1.1, headings 1.1-1.25, body 1.5-1.65.
- **Measure**: body paragraphs 55-75 characters (`max-width: 65ch`).
- **`text-wrap: balance`** on headings, **`text-wrap: pretty`** on paragraphs. No orphans in headlines.
- **Weights**: fewer is better. Regular and medium/semibold is usually enough. Bold display type at 800-900 is a style choice, not a default.
- **Numbers**: `font-variant-numeric: tabular-nums` in prices, stats, tables.
- **Hierarchy through more than size**: colour (muted vs. full ink), weight, case, family.
- **Muted text** still passes 4.5:1 contrast.

## Colour

- **Define colour in OKLCH** for predictable lightness steps and easy theming: `oklch(62% 0.19 30)`.
- **Neutrals carry the page.** 90% of the surface is background, text and borders. Tint neutrals slightly towards the brand hue (chroma 0.005-0.02) so they don't feel like raw grey.
- **One accent, used rarely.** Primary CTA, key highlights, small marks. If the accent is everywhere, nothing stands out. A second accent only if it has a clear job (e.g. success state).
- **Full ink or near-black buttons** with an accent elsewhere is a strong, modern pattern.
- **Colour blocks** (a full-bleed section in the accent or a deep tone) create rhythm better than gradient backgrounds.
- **Gradients**: if you use them, make them subtle, purposeful and on-brand (a light wash, a glow behind the product). Avoid the purple→blue→pink default, and avoid gradient text in more than one place.
- **Contrast**: body text ≥ 4.5:1, large text and UI ≥ 3:1. Check muted text and text on accent fills.
- **Semantic tokens** (`--background`, `--foreground`, `--muted`, `--accent`, `--border`, `--ring`) so sections and dark mode don't hard-code colours.

## Layout and rhythm

- **Grid**: a centered container (max ~1120-1280px for content, ~680px for prose) with consistent side padding (16-24px mobile, 32-48px desktop). Align everything to shared edges. Misaligned left edges are the most common amateur tell.
- **Spacing scale**: use a scale (4/8-based) and stick to it. Section padding 80-160px on desktop, 56-96px on mobile. Inside components, related things close, unrelated things far (proximity does the grouping, not boxes).
- **Vary the sections.** Alternate between full-width visuals, split layouts (text + visual, flipping sides), dense lists, a single big quote, a colour band. Repeating one layout five times reads as a template.
- **Left-aligned text** for anything longer than two lines. Centered works for short heroes and final CTAs.
- **Asymmetry with purpose**: a 7/5 split, a visual that bleeds off the edge, a headline that overhangs its column. One or two deliberate breaks per page, not chaos.
- **Bento grids** work when the cells hold real, varied content (a live chart, a UI fragment, a number) at genuinely different sizes. A bento of icon + heading + sentence cards is just a 3-card grid with extra steps.
- **Density is a choice.** Either generous space (premium, calm) or controlled density (technical, information-rich). Middle-ground density looks undecided.
- **Above the fold at 1440×900 and 390×844**: headline, subhead, CTA and part of the visual must be visible. Check both.

## Imagery and product visuals

- **The product is the hero image.** Show the real UI, the real object, the real output.
- **Crop and zoom** to the part that proves the headline. A full dashboard shrunk to fit is unreadable; a tight crop of one card with real data is convincing.
- **Build UI in HTML/CSS** where it helps: crisp at any size, themeable, animatable, interactive. A small island that lets visitors flip a switch and see the result is a powerful hero.
- **Real data** in screenshots: believable names, plausible numbers, no "Lorem ipsum" or "John Doe".
- **Annotate**: small labels, arrows or highlights that point to what matters.
- **Frames**: a subtle browser or device frame, or none. Avoid heavy 3D device mockups.
- **Photography**: real people from the company or customers beat stock every time. No AI-generated people. No handshake/laptop-pointing stock.
- **Illustration**: only with a consistent, distinctive style. Generic flat "people with laptops" illustrations and abstract 3D blobs say "template".
- **Icons**: one set, one stroke width, sized consistently (Lucide, Phosphor, Tabler, or custom). Don't put every icon in a coloured circle. Many feature lists look better with no icons at all.
- **Logos**: single colour (muted foreground), consistent optical size, not the actual brand colours.

## Surfaces and detail

Details are what separate "fine" from "crafted".

- **Borders**: 1px, low-contrast (`color-mix(in oklch, var(--foreground) 10%, transparent)`). Hairlines read as precise.
- **Shadows**: layered and soft, slightly tinted, not one big black blur. E.g. `0 1px 2px oklch(0% 0 0 / 0.06), 0 8px 24px -8px oklch(0% 0 0 / 0.12)`. Or no shadows at all and use borders. Pick one system.
- **Radius**: one scale, consistent. Nested radius = outer radius − padding, otherwise corners look off.
- **Texture**: a faint noise/grain overlay (SVG filter, 2-4% opacity) adds warmth to flat colour. Dot or line grids at very low opacity can frame a hero.
- **States**: every interactive element has hover, active, focus-visible and disabled states. Focus rings are visible, on-brand and offset.
- **Small touches**: custom `::selection` colour, `accent-color` on form controls, `scroll-margin-top` on anchored sections, smooth `scroll-behavior` (respecting reduced motion), a favicon that matches, a designed 404, a designed OG image.
- **Consistency audit**: same button sizes, same card padding, same heading-to-body spacing, same icon size everywhere.

## Motion

Motion should explain (what changed, where it came from) or reward (a small moment of delight). Everything else is noise and slows the page.

- **Durations**: UI feedback 120-200ms; component transitions 200-350ms; entrances 400-700ms. Nothing over a second unless it's a deliberate showpiece.
- **Easing**: ease-out for entrances, custom curves over the default `ease`. `cubic-bezier(0.22, 1, 0.36, 1)` is a good general-purpose out curve. Springs for things that feel physical.
- **One orchestrated hero entrance**: headline, subhead, CTA, visual, staggered 60-120ms apart. Then calm.
- **Scroll reveals**: subtle (8-16px translate + fade), once per element, never on every paragraph. Prefer CSS scroll-driven animations (`animation-timeline: view()`) inside `@supports`, fall back to IntersectionObserver.
- **Animate transform and opacity only.** Never width, height, top, left or anything that triggers layout.
- **Product motion**: a short loop or an animated UI sequence that shows the product working is worth more than any decorative animation.
- **Respect `prefers-reduced-motion`**: disable translations and parallax, keep opacity fades instant or very short.
- **Never hide content behind JS.** Only hide-before-reveal when a `.js` class is present on `<html>` (see `astro.md`).

## Modern CSS worth using

All of these are supported in current evergreen browsers; wrap the newest in `@supports` when the fallback matters.

- `clamp()` fluid type and spacing
- `oklch()`, `color-mix()`, `light-dark()` for colour systems
- `text-wrap: balance | pretty`
- Container queries (`@container`) for components that live in different widths
- `:has()` for parent-aware styling (e.g. a card with an image)
- Subgrid for aligned card internals
- Scroll-driven animations (`animation-timeline: view()` / `scroll()`)
- View transitions (cross-document: `@view-transition { navigation: auto; }`)
- `@starting-style` and `transition-behavior: allow-discrete` for entry animations on dialogs and popovers
- `interpolate-size: allow-keywords` for animating to `height: auto` (accordions)
- Native `<dialog>`, `popover`, `<details name="...">` for exclusive accordions without JS

## Dark mode

Only ship it if you'll design it. A dark mode that's just inverted tokens looks cheap. If you do:

- Backgrounds are dark tinted neutrals, not `#000`. Elevation = slightly lighter surfaces, not shadows.
- Reduce accent chroma/lightness slightly so it doesn't vibrate.
- Re-check every contrast pair and every image (screenshots may need dark variants).

A single, well-designed light *or* dark page beats two half-designed ones.

## What makes a page look generated

If a screenshot shows three or more of these, redo the direction.

- Purple/indigo-to-blue gradient hero on white, or dark with neon glows
- Gradient text in the headline *and* elsewhere
- Inter or Poppins everywhere, one weight, default tracking
- Everything centered, every section the same width and structure
- Pill badge above the headline saying "✨ Now with AI" or "Introducing X"
- Three identical feature cards with an icon in a coloured circle
- Glassmorphism cards floating over blurred blobs
- Abstract 3D shapes or generic isometric illustrations instead of product
- Stock photos, AI-generated people, fake testimonials with initials avatars
- Fake logo walls ("Acme", "Globex")
- Uniform `rounded-2xl` + `shadow-lg` on everything
- Animated gradient borders, spotlight hover cards, particles, grids of glowing dots — all at once
- Fade-up on every single element as you scroll
- Generic section headings: "Features", "Why choose us", "What our customers say"
- Emoji used as icons

## Calibration

Before calling the design done, put your screenshot next to two category-leading sites. Ask:

- Would someone guess this was made by a strong design team?
- Is the type as considered as theirs?
- Is there one thing on this page they'd remember tomorrow?
- Is there anything here that's on the page only because it's "what landing pages have"?
