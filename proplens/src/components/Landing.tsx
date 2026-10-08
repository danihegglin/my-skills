import { GraduationCap, Plane, ShoppingBasket, Sun, TrainFront, UtensilsCrossed, Volume2 } from "lucide-react";
import { useState } from "react";
import type { Place } from "../lib/geocode";
import { searchPlaces } from "../lib/geocode";
import Logo from "./Logo";
import SearchBox from "./SearchBox";

const EXAMPLES = ["Langstrasse 120, Zürich", "Kastanienallee 30, Berlin", "Rue Oberkampf 60, Paris", "Westerstraat 100, Amsterdam"];

const LENSES = [
  {
    icon: Volume2,
    color: "var(--color-noise)",
    title: "Noise",
    body: "Roads, trains, trams, aircraft, bars and industry, modelled for day and night in decibels. The loudest sources are named. Swiss addresses use the official federal noise maps.",
  },
  {
    icon: GraduationCap,
    color: "var(--color-school)",
    title: "Schools",
    body: "Childcare, kindergartens, primary and secondary schools, colleges and universities, with walking times from the front door.",
  },
  {
    icon: ShoppingBasket,
    color: "var(--color-shop)",
    title: "Shopping",
    body: "Supermarkets and the chains nearby, bakeries, pharmacies, post offices and markets: everything you need for daily errands.",
  },
  {
    icon: Sun,
    color: "var(--color-sun)",
    title: "Sunlight",
    body: "Sun paths for every season traced against the real skyline and surrounding hills. Choose a floor and watch the direct-sun hours change.",
  },
];

export default function Landing({ onSelect }: { onSelect: (p: Place) => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function tryExample(q: string) {
    setBusy(q);
    try {
      const [first] = await searchPlaces(q);
      if (first) onSelect(first);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <a href="#how" className="rounded-full px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-wash hover:text-ink">
          How it works
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-6 lg:pb-24 lg:pt-12">
          <div className="min-w-0 animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-[13px] font-medium text-ink-2">
              <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden />
              Address check for renters and buyers
            </p>
            <h1 className="mt-6 font-display text-[44px] font-bold leading-[0.98] tracking-[-0.035em] text-balance sm:text-[64px] lg:text-[76px]">
              Know the neighbourhood before you know the <span className="relative whitespace-nowrap">neighbours<Underline /></span>.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-ink-2 text-pretty">
              Type any address. PropLens estimates the noise from roads, trains, aircraft and nightlife, finds the nearest schools and shops,
              works out how many hours of direct sun reach each floor, and estimates what a home there should cost to rent or buy.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchBox onSelect={onSelect} autoFocus />
            </div>
            <div className="mt-4 flex max-w-xl flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted">Try</span>
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  onClick={() => tryExample(q)}
                  disabled={!!busy}
                  className="rounded-full border border-line bg-card/60 px-3 py-1 text-ink-2 transition hover:border-ink/30 hover:bg-card hover:text-ink disabled:opacity-60"
                >
                  {busy === q ? "Locating…" : q}
                </button>
              ))}
            </div>
          </div>
          <LensRadar />
        </section>

        <section className="border-y border-line bg-card">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="max-w-2xl font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[48px]">Four lenses on every address</h2>
              <p className="max-w-md text-[16px] leading-relaxed text-ink-2">
                Each lens gets a score from 0 to 100, and together they make the PropLens score: a quick read on how a place will feel to live in.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {LENSES.map(({ icon: Icon, color, title, body }) => (
                <article key={title} className="group rounded-[28px] border border-line bg-paper/60 p-6 transition hover:-translate-y-1 hover:bg-paper">
                  <span className="grid size-12 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${color} 18%, white)` }}>
                    <Icon className="size-6 text-ink" aria-hidden />
                  </span>
                  <h3 className="mt-6 font-display text-[24px] font-bold tracking-tight">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:py-24">
          <div>
            <h2 className="font-display text-[36px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[48px]">Open data, honest estimates</h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2">
              PropLens runs entirely in your browser. It pulls live open data for the address you enter and models the rest with standard
              engineering methods. Every number is an estimate made to compare places, not a certified measurement.
            </p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[28px] border border-line bg-line">
            {[
              ["Map data", "Streets, rail lines, airports, buildings, schools and shops from OpenStreetMap, fetched live via the Overpass API."],
              ["Noise model", "Road emission after RLS-90 with typical traffic per road class, attenuation after ISO 9613-2, shielding from the real buildings around you. Levels are given at 4 m height, the reference height used by EU noise mapping."],
              ["Official noise maps", "For Swiss addresses, road and rail levels come from sonBASE, the national noise database of the Federal Office for the Environment."],
              ["Sun and sky", "The sun's position is calculated every five minutes across the year. Building heights come from OpenStreetMap, terrain from the Copernicus elevation model, and real sunshine hours from ERA5 climate data via Open-Meteo."],
              ["Price estimates", "Rents start from federal statistics per canton and room count, lifted to advertised levels and adjusted for the home and its location. Purchase prices use price-to-rent ratios calibrated on actual sales in canton Zurich. The engine runs in your browser on bundled data."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-5 bg-card p-6">
                <span className="font-display text-[15px] font-bold text-muted tabular">0{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="bg-forest text-white/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] sm:px-8">
          <span className="font-display text-[18px] font-bold text-white">proplens</span>
          <span>Map data © OpenStreetMap contributors · Swiss noise data © FOEN/swisstopo · Weather data by Open-Meteo</span>
        </div>
      </footer>
    </div>
  );
}

function Underline() {
  return (
    <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden className="absolute -bottom-1 left-0 -z-10 h-[0.32em] w-full">
      <path d="M3 14 C 60 4, 140 4, 297 10" stroke="var(--color-lime)" strokeWidth="12" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Decorative scan around an address: rings, sources and a sweeping lens. */
function LensRadar() {
  const chips = [
    { icon: TrainFront, color: "var(--color-noise)", x: 79, y: 30, label: "Rail line", value: "58 dB" },
    { icon: GraduationCap, color: "var(--color-school)", x: 22, y: 26, label: "Kindergarten", value: "3 min" },
    { icon: ShoppingBasket, color: "var(--color-shop)", x: 16, y: 70, label: "Supermarket", value: "240 m" },
    { icon: Sun, color: "var(--color-sun)", x: 74, y: 78, label: "Winter sun", value: "4.2 h" },
  ];
  const dots = [
    { icon: UtensilsCrossed, color: "var(--color-noise)", x: 60, y: 62 },
    { icon: Plane, color: "var(--color-noise)", x: 88, y: 56 },
    { icon: ShoppingBasket, color: "var(--color-shop)", x: 38, y: 40 },
    { icon: GraduationCap, color: "var(--color-school)", x: 44, y: 80 },
  ];
  return (
    <figure className="relative mx-auto aspect-square w-full max-w-[520px] animate-rise [animation-delay:120ms]" aria-label="Illustration of PropLens scanning the area around an address">
      <svg viewBox="0 0 400 400" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <radialGradient id="pl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d4f26a" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#d4f26a" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#d4f26a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pl-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10140f" stopOpacity="0" />
            <stop offset="100%" stopColor="#10140f" stopOpacity="0.09" />
          </linearGradient>
          <clipPath id="pl-clip">
            <circle cx="200" cy="200" r="190" />
          </clipPath>
        </defs>
        <circle cx="200" cy="200" r="196" fill="url(#pl-glow)" />
        <g clipPath="url(#pl-clip)">
          <path d="M-10 250 L410 170" stroke="#fff" strokeWidth="18" />
          <path d="M150 -10 L235 410" stroke="#fff" strokeWidth="12" />
          <path d="M-10 92 C 120 120, 260 60, 410 112" fill="none" stroke="#eb6834" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />
        </g>
        {[70, 130, 190].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#10140f" strokeOpacity="0.12" />
        ))}
        <g className="origin-center animate-sweep" style={{ transformBox: "view-box" }}>
          <path d="M200 200 L390 200 A190 190 0 0 0 334 66 Z" fill="url(#pl-sweep)" />
          <line x1="200" y1="200" x2="390" y2="200" stroke="#10140f" strokeOpacity="0.25" />
        </g>
        <text x="206" y="126" fontSize="10" fill="#7c8279" fontFamily="Inter Variable, sans-serif">250 m</text>
        <text x="206" y="66" fontSize="10" fill="#7c8279" fontFamily="Inter Variable, sans-serif">500 m</text>
        <text x="206" y="6" fontSize="10" fill="#7c8279" fontFamily="Inter Variable, sans-serif" dy="10">1 km</text>
      </svg>

      {dots.map(({ icon: Icon, color, x, y }, i) => (
        <span key={i} className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-paper shadow-sm" style={{ left: `${x}%`, top: `${y}%`, background: color }}>
          <Icon className="size-4 text-white" aria-hidden />
        </span>
      ))}

      <span className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center">
        <span className="absolute size-16 animate-ping rounded-full bg-lime/60 [animation-duration:2.4s]" />
        <span className="relative grid size-12 place-items-center rounded-full bg-ink shadow-lg">
          <span className="size-4 rounded-full bg-lime" />
        </span>
      </span>

      {chips.map(({ icon: Icon, color, x, y, label, value }) => (
        <span
          key={label}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-2xl border border-line bg-card/95 py-2 pl-2 pr-3.5 shadow-[0_12px_30px_-12px_rgb(16_20_15/0.3)] backdrop-blur"
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <span className="grid size-8 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 18%, white)` }}>
            <Icon className="size-4 text-ink" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-[11px] text-muted">{label}</span>
            <span className="block whitespace-nowrap font-display text-[16px] font-bold tabular">{value}</span>
          </span>
        </span>
      ))}
      <figcaption className="sr-only">Illustration only: example readouts around an address.</figcaption>
    </figure>
  );
}
