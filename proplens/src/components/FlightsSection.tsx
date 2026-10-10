import { BadgeCheck, Map as MapIcon, Plane } from "lucide-react";
import { forwardRef } from "react";
import type { FlightExposure, FlyoverLevel } from "../lib/airports";
import { airportKindLabel } from "../lib/airports";
import { formatDistance } from "../lib/geo";
import type { Tone } from "../lib/noise";
import type { Report } from "../lib/report";
import { Section, SubHeading, TONE_COLOR, ToneDot } from "./ui";

/** Sequential ramp for the flyover heatmap (one hue, transparent where planes rarely pass). */
export const HEAT_STOPS: [number, [number, number, number, number]][] = [
  [0, [253, 214, 186, 0]],
  [0.25, [249, 180, 138, 0.35]],
  [0.5, [240, 136, 88, 0.5]],
  [0.75, [214, 84, 44, 0.64]],
  [1, [146, 40, 18, 0.78]],
];

const LEVELS: { id: Exclude<FlyoverLevel, "none">; label: string; hint: string; tone: Tone }[] = [
  { id: "direct", label: "Direct flyover", hint: "Under an approach or departure path", tone: "critical" },
  { id: "near", label: "Near a flight path", hint: "Planes pass to the side or the runway is close", tone: "warning" },
  { id: "distant", label: "Distant", hint: "Away from the regular flight paths", tone: "good" },
];

const metres = (m: number) => `${Math.round(m).toLocaleString("en")} m`;

function verdict(e: FlightExposure): string {
  const port = e.airport;
  if (!port) return "No airports within 40 km, so no regular flight paths pass overhead.";
  const rel = e.relation;
  const name = port.code ? `${port.name} (${port.code})` : port.name;
  if (e.level === "direct" && rel?.arrivalAltitude != null)
    return `Direct flyover: under the approach to runway ${rel.landing} at ${name}. Landing aircraft pass about ${metres(rel.arrivalAltitude)} overhead, departures from runway ${rel.departing} about ${metres(rel.departureAltitude!)}.`;
  if (e.level === "near" && rel?.position === "alongside")
    return `Right next to the runway at ${name}, ${formatDistance(port.distance)} away. Expect take-off, landing and taxiing noise.`;
  if (e.level === "near" && rel)
    return `Near the runway ${rel.landing} flight path at ${name}: aircraft pass about ${formatDistance(rel.lateral)} to the side, roughly ${metres(rel.arrivalAltitude ?? 0)} up.`;
  return `Distant from the flight paths${e.pathDistance != null ? `: the nearest approach or departure path is ${formatDistance(e.pathDistance)} away` : ""}. The nearest airport is ${name}, ${formatDistance(port.distance)} away.`;
}

type Props = { report: Report; onShowMap: () => void };

const FlightsSection = forwardRef<HTMLElement, Props>(function FlightsSection({ report, onShowMap }, ref) {
  const flights = report.flights;
  if (!flights) {
    return (
      <Section ref={ref} id="flights" icon={Plane} accent="var(--color-noise)" title="Flight routes" verdict="Airport data couldn't be loaded, so flight paths can't be shown.">
        <span />
      </Section>
    );
  }
  const e = flights.exposure;
  const port = e.airport;
  const rel = e.relation;
  const air = report.noise?.categories.find((c) => c.id === "air");
  const airDay = air ? (air.official?.day ?? air.day) : null;
  const overhead = (e.level === "direct" || (e.level === "near" && rel?.position !== "alongside")) && rel?.arrivalAltitude != null;

  return (
    <Section ref={ref} id="flights" icon={Plane} accent="var(--color-noise)" title="Flight routes" verdict={verdict(e)}>
      <div role="list" aria-label="Flyover exposure" className="grid grid-cols-3 gap-1.5 rounded-3xl bg-paper p-1.5">
        {LEVELS.map((l) => {
          const active = e.level === l.id || (e.level === "none" && l.id === "distant");
          return (
            <div
              key={l.id}
              role="listitem"
              aria-current={active ? "true" : undefined}
              className={`rounded-[18px] px-3 py-3 transition sm:px-4 ${active ? "bg-card" : ""}`}
              style={active ? { boxShadow: `inset 0 0 0 2px ${TONE_COLOR[l.tone]}` } : undefined}
            >
              <div className={`flex items-center gap-2 text-[14px] font-semibold sm:text-[15px] ${active ? "text-ink" : "text-muted"}`}>
                <ToneDot tone={l.tone} className={active ? "" : "opacity-40"} />
                {l.label}
              </div>
              <div className={`mt-1 hidden text-[12px] leading-snug sm:block ${active ? "text-ink-2" : "text-muted"}`}>{l.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Tile label="Nearest flight path">
          <Value>{e.pathDistance != null ? formatDistance(e.pathDistance) : "–"}</Value>
          <Sub>
            {e.nearestPath
              ? e.nearestPath.alongside
                ? `from the runway at ${e.nearestPath.airport}`
                : `runway ${e.nearestPath.landing} approach${e.nearestPath.airport !== port?.name ? `, ${e.nearestPath.airport}` : ""}`
              : "no straight-in paths nearby"}
          </Sub>
        </Tile>
        <Tile label="Height overhead">
          <Value>{overhead ? metres(rel!.arrivalAltitude!) : "–"}</Value>
          <Sub>{overhead ? `landing · ${metres(rel!.departureAltitude!)} departing` : "no regular overflights"}</Sub>
        </Tile>
        <Tile label="Nearest airport">
          <Value>{port ? formatDistance(port.distance) : "None"}</Value>
          <Sub>{port ? `${port.code ?? port.name} · ${airportKindLabel(port)}` : "within 40 km"}</Sub>
        </Tile>
        <Tile label="Aircraft noise">
          <Value>{airDay != null && airDay >= 30 ? `${Math.round(airDay)} dB` : "< 30 dB"}</Value>
          <Sub>
            {air?.official ? (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="size-3.5" aria-hidden /> official, daytime
              </span>
            ) : (
              "daytime, modelled"
            )}
          </Sub>
        </Tile>
      </div>

      {flights.heatmap && (
        <div className="mt-6">
          <SubHeading
            aside={
              <button onClick={onShowMap} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-ink transition hover:bg-wash">
                <MapIcon className="size-3.5" aria-hidden /> Show on map
              </button>
            }
          >
            Flyover heatmap
          </SubHeading>
          <p className="text-[14px] leading-relaxed text-ink-2">
            The Flights map layer shades where aircraft regularly pass and how low they fly: the darker, the more and the lower the traffic.{" "}
            {e.share >= 0.01
              ? `Your address gets ${Math.round(e.share * 100)}% of the flyover intensity of the busiest spot in view.`
              : "Your address is outside the shaded flight paths."}
          </p>
        </div>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        Modelled from the runway layout in OpenStreetMap: traffic is weighted by airport size and spread along each runway's extended
        centreline, assuming a 3° approach and a typical airliner climb. Real procedures curve, change with wind and runway use, and
        are restricted at night, so treat this as a guide to where planes usually fly, not a timetable.
      </p>
    </Section>
  );
});

export default FlightsSection;

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-3xl bg-paper p-3.5 sm:p-4">
      <div className="text-[13px] font-medium text-ink-2">{label}</div>
      {children}
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 font-display text-[26px] font-bold leading-none tracking-tight tabular sm:text-[28px]">{children}</div>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 text-[13px] leading-snug text-ink-2">{children}</div>;
}
