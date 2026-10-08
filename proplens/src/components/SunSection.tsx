import { Building, CloudSun, Minus, Plus, Sun, TriangleAlert } from "lucide-react";
import { forwardRef } from "react";
import type { Report } from "../lib/report";
import type { SunResult } from "../lib/sunlight";
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
        Building heights come from OpenStreetMap
        {report.skyline && report.skyline.estimatedShare > 0.05
          ? `; ${Math.round(report.skyline.estimatedShare * 100)}% of nearby buildings had no height and use a typical value for their type`
          : ""}
        . Trees, balconies and your own building's overhangs aren't modelled{report.terrain ? "" : ", and terrain data wasn't available"}.
      </p>
    </Section>
  );
});

export default SunSection;
