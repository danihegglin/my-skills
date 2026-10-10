import { ArrowUp, Box, Building, CloudSun, LoaderCircle, Minus, Plus, Sun, TriangleAlert } from "lucide-react";
import { Suspense, forwardRef, lazy, useState } from "react";
import { bearing, compassLabel, distanceToPolygon } from "../lib/geo";
import type { Report } from "../lib/report";
import type { Building as Bldg, HeightSource } from "../lib/skyline";
import type { Shade, SunResult } from "../lib/sunlight";
import { FacadeTable, MonthlySunChart, SunPathChart, fmtTime } from "./SunCharts";
import { Section, SubHeading } from "./ui";

type Props = { report: Report; sun: SunResult; floor: number; onFloor: (f: number) => void };

export const floorName = (f: number) => (f === 0 ? "Ground floor" : `Floor ${f}`);

const SunSection = forwardRef<HTMLElement, Props>(function SunSection({ report, sun, floor, onFloor }, ref) {
  const tz = report.timeZone;
  const winter = sun.keyDays[0];
  const share = sun.annualDaylight ? sun.annualDirect / sun.annualDaylight : 0;
  const ownLevels = report.skyline?.own?.levels;
  const openSky = !report.skyline;
  const verdict = openSky
    ? "Nearby building data couldn't be loaded, so these figures assume an open sky and aren't scored."
    : winter.direct >= 5
      ? `Bright: ${winter.direct.toFixed(1)} h of direct sun even on the shortest day at ${floorName(floor).toLowerCase()}.`
      : winter.direct >= 2
        ? `Decent light: ${winter.direct.toFixed(1)} h of direct winter sun at ${floorName(floor).toLowerCase()}, plenty in summer.`
        : `Shaded in winter: ${winter.direct.toFixed(1)} h of direct sun on the shortest day at ${floorName(floor).toLowerCase()}. Higher floors may do better.`;

  return (
    <Section ref={ref} id="sun" icon={Sun} accent="var(--color-sun)" title="Sunlight" score={openSky ? null : sun.score} verdict={verdict}>
      {openSky && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-warning/15 px-4 py-3 text-[14px] text-ink-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
          Surrounding buildings are missing from this result. Reload the page to try again; the map servers are sometimes busy.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl bg-paper p-3 pl-5">
        <div className="mr-auto">
          <div className="text-[13px] font-medium text-ink-2">Check it from</div>
          <div className="font-display text-[22px] font-bold leading-tight">{floorName(floor)}</div>
          <div className="text-[12px] text-muted">
            Eye height ≈ {sun.observerHeight.toFixed(1)} m
            {ownLevels ? ` · this building has ${ownLevels} floor${ownLevels > 1 ? "s" : ""}` : ""}
          </div>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <button
            onClick={() => onFloor(Math.max(0, floor - 1))}
            disabled={floor === 0}
            aria-label="Lower floor"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-card transition hover:border-ink/30 disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <input
            type="range"
            min={0}
            max={20}
            value={floor}
            onChange={(e) => onFloor(Number(e.target.value))}
            aria-label="Floor"
            aria-valuetext={floorName(floor)}
            className="h-2 w-full min-w-0 cursor-pointer accent-ink sm:w-44"
          />
          <button
            onClick={() => onFloor(Math.min(20, floor + 1))}
            disabled={floor === 20}
            aria-label="Higher floor"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-card transition hover:border-ink/30 disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {sun.keyDays.map((d) => (
          <div key={d.id} className="min-w-0 rounded-3xl border border-line p-3 sm:p-4">
            <div className="text-[12px] font-medium text-ink-2 sm:text-[13px]">
              <span className="hidden sm:inline">{d.label}</span>
              <span className="sm:hidden">{d.label.split(" · ")[1]}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-[26px] font-bold leading-none tracking-tight tabular sm:text-[34px]">{d.direct.toFixed(1)}</span>
              <span className="text-[13px] text-ink-2 sm:text-[14px]">
                h<span className="hidden sm:inline"> direct sun</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash" role="img" aria-label={`${Math.round((d.direct / Math.max(d.daylight, 0.01)) * 100)}% of daylight`}>
              <div className="h-full rounded-r-[4px] bg-sun" style={{ width: `${(d.direct / Math.max(d.daylight, 0.01)) * 100}%` }} />
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-muted tabular sm:text-[12px]">
              of {d.daylight.toFixed(1)} h daylight
              <br />
              {d.firstSun != null && d.lastSun != null ? `${fmtTime(d.firstSun, tz)}–${fmtTime(d.lastSun, tz)}` : "No direct sun"}
            </div>
          </div>
        ))}
      </div>

      {report.skyline && report.buildings.length > 0 && <Shadows3D report={report} sun={sun} floor={floor} />}

      <div className="mt-8">
        <SubHeading aside="Hover to explore">Sun paths against the skyline</SubHeading>
        <SunPathChart sun={sun} lat={report.place.lat} timeZone={tz} />
      </div>

      <div className="mt-8 grid gap-8">
        <div>
          <SubHeading>Direct sun through the year</SubHeading>
          <MonthlySunChart months={sun.months} climate={report.climate?.monthlySunshine ?? null} />
        </div>
        <div>
          <SubHeading>By window direction</SubHeading>
          <FacadeTable sun={sun} />
          <p className="mt-2 text-[12px] text-muted">Hours of direct sun on a window facing each way, on the days above.</p>
        </div>
      </div>

      {report.skyline && <ShadeList report={report} shade={sun.shade} floor={floor} />}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-3xl bg-paper p-4">
          <Building className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
          <div className="text-[14px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink tabular">{Math.round(sun.annualDirect).toLocaleString("en")} h</span> of possible direct sun a year at
            this height: {Math.round(share * 100)}% of all daylight hours.
          </div>
        </div>
        <div className="flex gap-3 rounded-3xl bg-paper p-4">
          <CloudSun className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
          <div className="text-[14px] leading-relaxed text-ink-2">
            {report.climate && sun.realSunshine != null ? (
              <>
                The area logged <span className="font-semibold text-ink tabular">{Math.round(report.climate.annualSunshine).toLocaleString("en")} h</span> of
                sunshine in {report.climate.year}. Allowing for the skyline, about{" "}
                <span className="font-semibold text-ink tabular">{Math.round(sun.realSunshine).toLocaleString("en")} h</span> would reach you.
              </>
            ) : (
              <>Climate records weren't available, so these hours assume clear skies.</>
            )}
          </div>
        </div>
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        <HeightNote report={report} /> Trees, balconies and your own building's overhangs aren't modelled{report.terrain ? "" : ", and terrain data wasn't available"}.
      </p>
    </Section>
  );
});

export default SunSection;

const KIND: Record<string, string> = {
  apartments: "Apartment building",
  residential: "Residential building",
  house: "House",
  detached: "Detached house",
  semidetached_house: "Semi-detached house",
  terrace: "Terraced houses",
  commercial: "Commercial building",
  office: "Office building",
  retail: "Shop building",
  industrial: "Industrial building",
  warehouse: "Warehouse",
  school: "School",
  university: "University building",
  hospital: "Hospital",
  church: "Church",
  hotel: "Hotel",
  garage: "Garage",
  garages: "Garages",
  yes: "Building",
};

export const kindLabel = (kind: string) => KIND[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");

export const SOURCE_LABEL: Record<HeightSource, string> = {
  measured: "mapped height",
  register: "storeys from the federal building register",
  levels: "mapped storeys",
  typical: "typical height for its type",
};

const DIRECTION: Record<string, string> = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };

function where(b: Bldg) {
  const n = b.ring.length - 1;
  const c = b.ring.slice(0, n).reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
  const az = bearing({ x: 0, y: 0 }, c);
  return { distance: Math.max(1, Math.round(distanceToPolygon({ x: 0, y: 0 }, b.ring))), azimuth: az, direction: DIRECTION[compassLabel(az)] ?? compassLabel(az) };
}

function ShadeList({ report, shade, floor }: { report: Report; shade: Shade[]; floor: number }) {
  const [all, setAll] = useState(false);
  const others = report.skyline!.others;
  const tallest = others.reduce<Bldg | null>((a, b) => (!a || b.height > a.height ? b : a), null);
  const shown = all ? shade : shade.slice(0, 5);
  const maxYear = Math.max(1, ...shade.map((s) => s.year));
  return (
    <div className="mt-8">
      <SubHeading aside={floorName(floor)}>Buildings that block your sun</SubHeading>
      <p className="mb-3 text-[14px] leading-relaxed text-ink-2">
        {others.length} buildings stand within 250 m{tallest ? `; the tallest is ≈ ${Math.round(tallest.height)} m` : ""}. Each one is traced with its
        real footprint and height. {shade.length ? "These cut off direct sun here:" : `None of them blocks direct sun at ${floorName(floor).toLowerCase()}.`}
      </p>
      {shade.length > 0 && (
        <ol className="divide-y divide-line rounded-3xl border border-line">
          {shown.map(({ building: b, winter, year }) => {
            const w = where(b);
            return (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3 sm:gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-paper" title={`${w.direction}, ${Math.round(w.azimuth)}°`}>
                  <ArrowUp className="size-4 text-ink" style={{ transform: `rotate(${w.azimuth}deg)` }} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">{b.address ?? kindLabel(b.kind)}</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-ink-2 tabular">
                    {w.distance} m {w.direction} · ≈ {Math.round(b.height)} m tall
                    {b.levels ? `, ${b.levels} storeys` : ""} · {b.footprint.toLocaleString("en")} m² footprint
                    {b.year ? ` · built ${b.year}` : ""}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {b.address ? `${kindLabel(b.kind)} · ` : ""}
                    {SOURCE_LABEL[b.source]}
                  </div>
                </div>
                <div className="w-[112px] shrink-0 text-right">
                  <div className="font-display text-[17px] font-bold leading-tight text-ink tabular">
                    −{year >= 10 ? Math.round(year).toLocaleString("en") : year.toFixed(1)} h<span className="font-sans text-[12px] font-normal text-muted"> a year</span>
                  </div>
                  <div className="text-[12px] text-muted tabular">{winter > 0 ? `−${winter.toFixed(1)} h on Dec 21` : "none on Dec 21"}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-wash">
                    <div className="ml-auto h-full rounded-full bg-sun" style={{ width: `${(100 * year) / maxYear}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {shade.length > 5 && (
        <button onClick={() => setAll((a) => !a)} className="mt-2 text-[13px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          {all ? "Show fewer" : `Show all ${shade.length}`}
        </button>
      )}
    </div>
  );
}

function HeightNote({ report }: { report: Report }) {
  const others = report.skyline?.others ?? [];
  if (!others.length) return <>Building heights come from OpenStreetMap.</>;
  const count = (src: HeightSource) => others.filter((b) => b.source === src).length;
  const register = count("register");
  const mapped = count("measured") + count("levels");
  const typical = count("typical");
  const pct = (n: number) => `${Math.round((100 * n) / others.length)}%`;
  return (
    <>
      Heights of the {others.length} surrounding buildings:{" "}
      {[register ? `${pct(register)} from storeys in the federal building register` : "", mapped ? `${pct(mapped)} mapped in OpenStreetMap` : "", typical ? `${pct(typical)} a typical height for their type` : ""]
        .filter(Boolean)
        .join(", ")}
      .
    </>
  );
}

// three.js and the WebAssembly kernel load only when someone opens the 3D view.
const Shadow3D = lazy(() => import("./Shadow3D"));

function Shadows3D({ report, sun, floor }: { report: Report; sun: SunResult; floor: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8">
      <SubHeading aside={open ? "Drag to pan · right-drag or two fingers to tilt and turn" : undefined}>Shadows in 3D</SubHeading>
      {open ? (
        <Suspense
          fallback={
            <div className="grid h-[520px] place-items-center rounded-3xl border border-line bg-wash text-[14px] text-ink-2 sm:h-[600px]">
              <span className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading the 3D view…
              </span>
            </div>
          }
        >
          <Shadow3D report={report} sun={sun} floor={floor} />
        </Suspense>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 rounded-3xl border border-line bg-[linear-gradient(135deg,#fdf6e3,#eef2f7)] p-5 text-left transition hover:border-ink/30"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink">
            <Box className="size-6 text-lime" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[18px] font-bold text-ink">Watch the shadows move</span>
            <span className="block text-[14px] leading-snug text-ink-2">
              The {report.buildings.length} buildings around you in 3D, with their shadows at any date and time, and a map of the hours of sun every spot gets.
            </span>
          </span>
          <span className="hidden shrink-0 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-white transition group-hover:bg-forest sm:inline">Open 3D view</span>
        </button>
      )}
    </div>
  );
}
