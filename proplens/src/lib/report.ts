import { useEffect, useMemo, useState } from "react";
import type { ShoppingResult, SchoolsResult } from "./amenities";
import { analyzeSchools, analyzeShopping } from "./amenities";
import type { Climate } from "./climate";
import { fetchClimate } from "./climate";
import type { Place } from "./geocode";
import { formatDistance, makeProjection, walkMinutes } from "./geo";
import type { NoiseResult } from "./noise";
import { analyzeNoise, withOfficial } from "./noise";
import type { OsmElement, QueryName } from "./osm";
import { RADIUS, countFrom, overpass } from "./osm";
import type { Building, Skyline } from "./skyline";
import { buildSkyline, parseBuildings } from "./skyline";
import type { SunResult } from "./sunlight";
import { analyzeSun } from "./sunlight";
import type { OfficialNoise } from "./swissNoise";
import { fetchOfficialNoise, inSwitzerland } from "./swissNoise";
import type { TerrainSamples } from "./terrain";
import { fetchTerrain } from "./terrain";

export type StepId = QueryName | "climate" | "terrain" | "official";
export type StepState = "pending" | "done" | "failed" | "skipped";

export const STEP_LABELS: Record<StepId, string> = {
  streets: "Tracing streets, rail lines and industry",
  air: "Scanning airports and flight paths",
  places: "Finding schools, shops and restaurants",
  buildings: "Measuring the surrounding skyline",
  official: "Reading official Swiss noise maps",
  terrain: "Following hills and mountains on the horizon",
  climate: "Reviewing a year of sunshine records",
};

const CORE: QueryName[] = ["streets", "air", "places", "buildings"];

type Raw = {
  streets?: OsmElement[] | null;
  air?: OsmElement[] | null;
  places?: OsmElement[] | null;
  buildings?: OsmElement[] | null;
  climate?: Climate | null;
  terrain?: TerrainSamples | null;
  official?: OfficialNoise | null;
};

export type Report = {
  place: Place;
  noise: NoiseResult | null;
  schools: SchoolsResult | null;
  shopping: ShoppingResult | null;
  skyline: Skyline | null;
  buildings: Building[];
  climate: Climate | null;
  terrain: TerrainSamples | null;
  timeZone: string | undefined;
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
      (["buildings", "places", "streets", "air", "official", "terrain", "climate"] as StepId[]).map((s) => [s, s === "official" && !swiss ? "skipped" : "pending"]),
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

    for (const q of ["buildings", "places", "streets", "air"] as QueryName[]) track(q, q, () => overpass(q, p, ctrl.signal));
    if (swiss) track("official", "official", () => fetchOfficialNoise(p.lat, p.lon, ctrl.signal));
    track("terrain", "terrain", () => fetchTerrain(p, ctrl.signal));
    track("climate", "climate", () => fetchClimate(p.lat, p.lon, ctrl.signal));
    return () => ctrl.abort();
  }, [place, attempt]);

  const coreSettled = CORE.every((q) => raw[q] !== undefined);
  const coreFailed = coreSettled && raw.streets === null && raw.places === null;

  const report = useMemo<Report | null>(() => {
    if (!place || !coreSettled || coreFailed) return null;
    const proj = makeProjection({ lat: place.lat, lon: place.lon });
    const buildings = raw.buildings ? parseBuildings(raw.buildings, proj) : [];
    const skyline = raw.buildings ? buildSkyline(buildings, RADIUS.buildings) : null;
    const modelled = raw.streets || raw.places || raw.air
      ? analyzeNoise({ proj, streets: raw.streets ?? null, air: raw.air ?? null, places: raw.places ?? null, skyline })
      : null;
    return {
      place,
      noise: modelled ? withOfficial(modelled, raw.official ?? null) : null,
      schools: raw.places ? analyzeSchools(raw.places, proj) : null,
      shopping: raw.places ? analyzeShopping(raw.places, proj, countFrom(raw.places)) : null,
      skyline,
      buildings,
      climate: raw.climate ?? null,
      terrain: raw.terrain ?? null,
      timeZone: raw.climate?.timezone,
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
    });
  }, [report, floor]);
}

/* ---------- summary ---------- */

export type SectionId = "noise" | "schools" | "shopping" | "sun";
export const WEIGHTS: Record<SectionId, number> = { noise: 0.3, sun: 0.25, shopping: 0.25, schools: 0.2 };

export function overallScore(scores: Partial<Record<SectionId, number>>): number | null {
  let total = 0;
  let weight = 0;
  for (const [id, w] of Object.entries(WEIGHTS) as [SectionId, number][]) {
    const s = scores[id];
    if (s == null) continue;
    total += s * w;
    weight += w;
  }
  return weight ? Math.round(total / weight) : null;
}

export type Insight = { section: SectionId; text: string };

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
    if (air.day >= 50 && air.sources[0])
      bad.push({ section: "noise", text: `Aircraft noise from ${air.sources[0].name} (≈${Math.round(air.day)} dB)` });
    else if (air.day < 40 && noise.day < 55) good.push({ section: "noise", text: "Away from airport flight paths" });
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
