import { useEffect, useMemo, useState } from "react";
import type { GetAround, ShoppingResult, SchoolsResult } from "./amenities";
import { analyzeGetAround, analyzeSchools, analyzeShopping } from "./amenities";
import type { FlightAnalysis } from "./airports";
import { analyzeFlights } from "./airports";
import type { Climate } from "./climate";
import { fetchClimate } from "./climate";
import type { Place } from "./geocode";
import { formatDistance, makeProjection, walkMinutes } from "./geo";
import type { NoiseResult } from "./noise";
import { analyzeNoise, withOfficial } from "./noise";
import type { OsmElement, QueryName } from "./osm";
import { RADIUS, countFrom, overpass } from "./osm";
import type { Building, Skyline } from "./skyline";
import { applyRegister, buildSkyline, parseBuildings } from "./skyline";
import type { SunResult } from "./sunlight";
import { analyzeSun } from "./sunlight";
import type { Municipality } from "./municipality";
import type { RegisterBuilding } from "./register";
import { fetchRegister } from "./register";
import { fetchMunicipality } from "./municipality";
import type { OfficialNoise } from "./swissNoise";
import { fetchOfficialNoise, inSwitzerland } from "./swissNoise";
import type { TerrainSamples } from "./terrain";
import type { SectionId } from "./score";
import { fetchTerrain } from "./terrain";

export type StepId = QueryName | "climate" | "terrain" | "official" | "municipality" | "register";
export type StepState = "pending" | "done" | "failed" | "skipped";

export const STEP_LABELS: Record<StepId, string> = {
  streets: "Tracing streets, rail lines and industry",
  air: "Scanning airports and flight paths",
  places: "Finding schools, shops and restaurants",
  around: "Finding stops, stations and parks",
  buildings: "Measuring the surrounding skyline",
  register: "Reading storeys from the federal building register",
  official: "Reading official Swiss noise maps",
  municipality: "Looking up the municipality",
  terrain: "Following hills and mountains on the horizon",
  climate: "Reviewing a year of sunshine records",
};

const CORE: QueryName[] = ["streets", "air", "places", "buildings"];
const QUERIES: QueryName[] = ["buildings", "places", "streets", "air", "around"];

type Raw = {
  streets?: OsmElement[] | null;
  air?: OsmElement[] | null;
  places?: OsmElement[] | null;
  around?: OsmElement[] | null;
  buildings?: OsmElement[] | null;
  climate?: Climate | null;
  terrain?: TerrainSamples | null;
  official?: OfficialNoise | null;
  municipality?: Municipality | null;
  register?: RegisterBuilding[] | null;
};

export type Report = {
  place: Place;
  noise: NoiseResult | null;
  /** Airports within 40 km, flight corridors and the flyover heatmap; null when airport data failed to load. */
  flights: FlightAnalysis | null;
  schools: SchoolsResult | null;
  shopping: ShoppingResult | null;
  /** Public transport, train station and green space; null until (or unless) they load. */
  getAround: GetAround | null;
  /** Bars, pubs and clubs within 150 m; null when places didn't load. */
  barsNearby: number | null;
  skyline: Skyline | null;
  buildings: Building[];
  climate: Climate | null;
  terrain: TerrainSamples | null;
  timeZone: string | undefined;
  /** Swiss municipality and canton, when the address is in Switzerland. */
  municipality: Municipality | null;
};

export function useReport(place: Place | null, attempt: number) {
  const [raw, setRaw] = useState<Raw>({});
  const [steps, setSteps] = useState<Partial<Record<StepId, StepState>>>({});

  useEffect(() => {
    if (!place) return;
    const ctrl = new AbortController();
    const p = { lat: place.lat, lon: place.lon };
    setRaw({});
    const swiss = inSwitzerland(p.lat, p.lon);
    setSteps(Object.fromEntries(
      (["buildings", "register", "places", "around", "streets", "air", "official", "municipality", "terrain", "climate"] as StepId[]).map((s) => [
        s,
        (s === "official" || s === "municipality" || s === "register") && !swiss ? "skipped" : "pending",
      ]),
    ));

    function track<T>(id: StepId, key: keyof Raw, run: () => Promise<T>) {
      run().then(
        (value) => {
          if (ctrl.signal.aborted) return;
          setRaw((r) => ({ ...r, [key]: value }));
          setSteps((s) => ({ ...s, [id]: "done" }));
        },
        (err) => {
          if (ctrl.signal.aborted) return;
          console.warn(`[proplens] ${id} failed`, err);
          setRaw((r) => ({ ...r, [key]: null }));
          setSteps((s) => ({ ...s, [id]: "failed" }));
        },
      );
    }

    for (const q of QUERIES) track(q, q, () => overpass(q, p, ctrl.signal));
    if (swiss) track("official", "official", () => fetchOfficialNoise(p.lat, p.lon, ctrl.signal));
    if (swiss) track("municipality", "municipality", () => fetchMunicipality(p.lat, p.lon, ctrl.signal));
    // Storeys for every Swiss building: the skyline re-measures once they arrive.
    if (swiss) track("register", "register", () => fetchRegister(p, RADIUS.buildings, ctrl.signal));
    track("terrain", "terrain", () => fetchTerrain(p, ctrl.signal));
    track("climate", "climate", () => fetchClimate(p.lat, p.lon, ctrl.signal));
    return () => ctrl.abort();
  }, [place, attempt]);

  const coreSettled = CORE.every((q) => raw[q] !== undefined);
  const coreFailed = coreSettled && raw.streets === null && raw.places === null;

  const report = useMemo<Report | null>(() => {
    if (!place || !coreSettled || coreFailed) return null;
    const proj = makeProjection({ lat: place.lat, lon: place.lon });
    const buildings = raw.buildings ? applyRegister(parseBuildings(raw.buildings, proj), raw.register ?? [], proj) : [];
    const skyline = raw.buildings ? buildSkyline(buildings, RADIUS.buildings) : null;
    const modelled = raw.streets || raw.places || raw.air
      ? analyzeNoise({ proj, streets: raw.streets ?? null, air: raw.air ?? null, places: raw.places ?? null, skyline })
      : null;
    return {
      place,
      noise: modelled ? withOfficial(modelled, raw.official ?? null) : null,
      flights: raw.air ? analyzeFlights(raw.air, proj) : null,
      schools: raw.places ? analyzeSchools(raw.places, proj) : null,
      shopping: raw.places ? analyzeShopping(raw.places, proj, countFrom(raw.places)) : null,
      getAround: raw.around ? analyzeGetAround(raw.around, proj) : null,
      barsNearby: raw.places ? analyzeGetAround(raw.places, proj).barsNearby : null,
      skyline,
      buildings,
      climate: raw.climate ?? null,
      terrain: raw.terrain ?? null,
      timeZone: raw.climate?.timezone,
      municipality: raw.municipality ?? null,
    };
  }, [place, coreSettled, coreFailed, raw]);

  return { report, steps, failed: coreFailed };
}

export function useSun(report: Report | null, floor: number): SunResult | null {
  return useMemo(() => {
    if (!report) return null;
    return analyzeSun({
      lat: report.place.lat,
      lon: report.place.lon,
      floor,
      skyline: report.skyline,
      terrain: report.terrain,
      climate: report.climate,
      timeZone: report.timeZone,
    });
  }, [report, floor]);
}

/* ---------- summary ---------- */

export type { SectionId } from "./score";
export { WEIGHTS, overallScore } from "./score";
/** Map layers: one per scored section, plus flight routes. */
export type LayerId = SectionId | "flights";

export type Insight = { section: LayerId; text: string };

export function insights(report: Report, sun: SunResult | null): { good: Insight[]; bad: Insight[] } {
  const good: Insight[] = [];
  const bad: Insight[] = [];
  const { noise, schools, shopping } = report;

  if (noise) {
    const level = (c: NoiseResult["categories"][number]) => c.official?.day ?? c.day;
    const road = noise.categories.find((c) => c.id === "road")!;
    const rail = noise.categories.find((c) => c.id === "rail")!;
    const air = noise.categories.find((c) => c.id === "air")!;
    const night = noise.categories.find((c) => c.id === "nightlife")!;
    if (noise.day < 50) good.push({ section: "noise", text: `Quiet surroundings, around ${Math.round(noise.day)} dB by day` });
    if (level(road) >= 60 && road.sources[0])
      bad.push({ section: "noise", text: `Busy road: ${road.sources[0].name}, ${formatDistance(road.sources[0].distance)} away (≈${Math.round(level(road))} dB)` });
    if (level(rail) >= 55 && rail.sources[0])
      bad.push({ section: "noise", text: `${rail.sources[0].detail} ${formatDistance(rail.sources[0].distance)} away (≈${Math.round(level(rail))} dB)` });
    const exposure = report.flights?.exposure;
    const port = exposure?.airport;
    const rel = exposure?.relation;
    if (exposure?.level === "direct" && port && rel?.arrivalAltitude != null)
      bad.push({ section: "flights", text: `Direct flyover: under the runway ${rel.landing} approach to ${port.name}, planes ≈ ${rel.arrivalAltitude} m overhead` });
    else if (exposure?.level === "near" && port)
      bad.push({
        section: "flights",
        text: rel?.position === "alongside" ? `Next to the runway of ${port.name}` : `Near the runway ${rel?.landing} flight path of ${port.name}, ${formatDistance(exposure.pathDistance ?? 0)} to the side`,
      });
    else if (level(air) >= 50 && air.sources[0]) bad.push({ section: "flights", text: `Aircraft noise from ${air.sources[0].name} (≈${Math.round(level(air))} dB)` });
    else if (exposure && (exposure.level === "distant" || exposure.level === "none") && level(air) < 45)
      good.push({ section: "flights", text: exposure.pathDistance != null ? `Away from flight paths (nearest ${formatDistance(exposure.pathDistance)})` : "No airport flight paths nearby" });
    const lateVenues = night.sources.filter((s) => s.distance < 120 && /Bar|Pub|Nightclub/.test(s.detail)).length;
    if (night.night >= 45 && lateVenues) bad.push({ section: "noise", text: `${lateVenues} bar${lateVenues > 1 ? "s" : ""} or club${lateVenues > 1 ? "s" : ""} within 120 m: lively evenings` });
  }

  if (schools) {
    const early = schools.groups[0].items[0];
    const school = schools.groups[1].items.find((p) => p.note && p.distance <= 800) ?? schools.groups[1].items[0];
    if (early && early.distance <= 500) good.push({ section: "schools", text: `${early.kindLabel} ${walkMinutes(early.distance)} min on foot` });
    if (school && school.distance <= 800) good.push({ section: "schools", text: `${school.note ? `${school.note} school` : "School"} ${walkMinutes(school.distance)} min on foot: ${school.name}` });
    if (!school || school.distance > 1800) bad.push({ section: "schools", text: "No school within comfortable walking distance" });
  }

  if (shopping) {
    const market = shopping.essentials.find((e) => e.id === "supermarket")?.nearest;
    if (market && market.distance <= 500) good.push({ section: "shopping", text: `Supermarket ${walkMinutes(market.distance)} min on foot: ${market.name}` });
    if (!market || market.distance > 1200) bad.push({ section: "shopping", text: market ? `Nearest supermarket is ${formatDistance(market.distance)} away` : "No supermarket within 1.5 km" });
  }

  if (sun && report.skyline) {
    const winter = sun.keyDays[0];
    const floor = sun.floor === 0 ? "the ground floor" : `floor ${sun.floor}`;
    if (winter.direct >= 5) good.push({ section: "sun", text: `${winter.direct.toFixed(1)} h of direct winter sun on ${floor}` });
    else if (winter.direct < 2) bad.push({ section: "sun", text: `Only ${winter.direct.toFixed(1)} h of direct sun on the shortest day at ${floor}` });
    if (report.climate && report.climate.annualSunshine >= 2000) good.push({ section: "sun", text: `Sunny climate: ${Math.round(report.climate.annualSunshine).toLocaleString("en")} sunshine hours in ${report.climate.year}` });
  }

  return { good: good.slice(0, 5), bad: bad.slice(0, 5) };
}
