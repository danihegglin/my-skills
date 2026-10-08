import type { LatLon, Projection, XY } from "./geo";
import { bearing, closestOnSegment, dist, len } from "./geo";
import type { OsmElement } from "./osm";
import { elementLines, elementPoint } from "./osm";

// Airports and runways from OpenStreetMap, and how an address sits relative to their flight paths.

export type AirportKind = "major" | "regional" | "military" | "small";


export type Runway = { a: XY; b: XY; length: number; ref?: string };
export type Airport = {
  id: string;
  name: string;
  code?: string;
  center: XY;
  point: LatLon;
  kind: AirportKind;
  runways: Runway[];
  heliport: boolean;
  paved: boolean;
  tags: Record<string, string>;
};

export function parseAirports(elements: OsmElement[], proj: Projection): Airport[] {
  const ports: Airport[] = [];
  const rawRunways: (Runway & { surface?: string; latlngs: LatLon[] })[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (t.aeroway === "runway") {
      const line = elementLines(e)[0];
      if (!line || line.length < 2) continue;
      const pts = line.map((p) => proj.toXY(p.lat, p.lon));
      // Runways are straight: use the two endpoints furthest apart.
      let a = pts[0];
      let b = pts[pts.length - 1];
      for (const p of pts) if (dist(p, a) > dist(a, b)) b = p;
      for (const p of pts) if (dist(p, b) > dist(a, b)) a = p;
      rawRunways.push({ a, b, length: dist(a, b), ref: t.ref, surface: t.surface, latlngs: line });
    } else if (t.aeroway === "aerodrome" || t.aeroway === "heliport") {
      const pt = elementPoint(e);
      if (!pt) continue;
      if (t.disused === "yes" || t.abandoned === "yes") continue;
      ports.push({
        id: `${e.type}${e.id}`,
        name: t["name:en"] || t.name || (t.aeroway === "heliport" ? "Heliport" : "Airfield"),
        code: t.iata || t.icao,
        center: proj.toXY(pt.lat, pt.lon),
        point: pt,
        kind: t.military === "airfield" || t["aerodrome:type"] === "military" || t.landuse === "military" ? "military" : "small",
        runways: [],
        heliport: t.aeroway === "heliport",
        paved: false,
        tags: t,
      });
    }
  }
  // Merge runway pieces that share an airport and designation.
  for (const r of rawRunways) {
    const mid = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 };
    let owner: Airport | null = null;
    let best = 5000;
    for (const p of ports) {
      if (p.heliport) continue;
      const d = dist(p.center, mid);
      if (d < best) {
        best = d;
        owner = p;
      }
    }
    if (!owner) {
      owner = { id: `rwy${ports.length}`, name: "Airstrip", center: mid, point: proj.toLatLon(mid), kind: "small", runways: [], heliport: false, paved: false, tags: {} };
      ports.push(owner);
    }
    const same = r.ref ? owner.runways.find((x) => x.ref === r.ref) : undefined;
    if (same) {
      const ends = [same.a, same.b, r.a, r.b];
      let pair: [XY, XY] = [same.a, same.b];
      for (const p of ends) for (const q of ends) if (dist(p, q) > dist(pair[0], pair[1])) pair = [p, q];
      same.a = pair[0];
      same.b = pair[1];
      same.length = dist(pair[0], pair[1]);
    } else {
      owner.runways.push({ a: r.a, b: r.b, length: r.length, ref: r.ref });
      owner.paved ||= !/grass|dirt|gravel|ground|sand/.test(r.surface ?? "");
    }
  }
  for (const p of ports) {
    if (p.heliport || p.kind === "military") continue;
    const t = p.tags;
    const longest = Math.max(0, ...p.runways.map((r) => r.length));
    const international = t["aerodrome:type"] === "international" || t.aerodrome === "international";
    if (longest >= 2400 && (t.iata || international)) p.kind = "major";
    else if (p.paved && (t.iata || longest >= 1500)) p.kind = "regional";
  }
  return ports;
}

/* ---------- flight paths ---------- */

/** 3° approach glide slope, as a gradient. */
export const GLIDE = 0.0524;
/** Typical airliner climb gradient after take-off (≈ 4.6°). */
export const CLIMB = 0.08;
/** Corridors are drawn and assessed this far out from each runway end. */
export const CORRIDOR_LENGTH = 20000;
/** Half-width of the band where aircraft pass essentially overhead, widening with distance. */
export const underWidth = (beyond: number) => 400 + 0.08 * beyond;
/** Half-width of the wider band where aircraft are clearly seen and heard. */
export const nearWidth = (beyond: number) => 1200 + 0.12 * beyond;

/** Runways with regular traffic; small airfields fly circuits instead of straight-in corridors. */
export function mainRunways(port: Airport): Runway[] {
  if (port.heliport || port.kind === "small") return [];
  return port.runways.filter((r) => r.length >= (port.kind === "major" ? 1500 : 800));
}

export type Designator = { label: string; heading: number };

/** "14/32" → runway 14 (heading 140°) and 32 (320°). Falls back to the geometry when untagged. */
export function designators(r: Runway): Designator[] {
  const parsed = (r.ref ?? "")
    .split("/")
    .map((part) => part.trim().match(/^(\d{1,2})([LRC]?)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ label: `${m[1].padStart(2, "0")}${m[2]}`, heading: (Number(m[1]) * 10) % 360 }));
  if (parsed.length === 2) return parsed;
  const h = bearing(r.a, r.b);
  const label = (deg: number) => String(Math.round(deg / 10) || 36).padStart(2, "0");
  return [
    { label: label(h), heading: h },
    { label: label((h + 180) % 360), heading: (h + 180) % 360 },
  ];
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export type RunwayRelation = {
  runway: Runway;
  /** Runway aircraft land on after passing over the address. */
  landing: string;
  /** Runway aircraft take off from before passing over the address. */
  departing: string;
  /** Distance beyond the nearer runway end, metres (negative when alongside the runway). */
  beyond: number;
  /** Offset from the extended centreline, metres. */
  lateral: number;
  position: "under" | "near" | "alongside" | "off";
  /** Estimated height of landing aircraft overhead, metres above the runway. */
  arrivalAltitude: number | null;
  /** Estimated height of departing aircraft overhead. */
  departureAltitude: number | null;
};

export function relateToRunway(r: Runway): RunwayRelation {
  const mx = (r.a.x + r.b.x) / 2;
  const my = (r.a.y + r.b.y) / 2;
  const ux = (r.b.x - r.a.x) / r.length;
  const uy = (r.b.y - r.a.y) / r.length;
  const along = -mx * ux - my * uy;
  const lateral = Math.abs(-mx * uy + my * ux);
  const beyond = Math.abs(along) - r.length / 2;
  const position: RunwayRelation["position"] =
    beyond <= 0
      ? lateral < 1500
        ? "alongside"
        : "off"
      : beyond > CORRIDOR_LENGTH * 1.25
        ? "off"
        : lateral <= underWidth(beyond)
          ? "under"
          : lateral <= nearWidth(beyond)
            ? "near"
            : "off";
  // Aircraft over the address that are heading towards the runway are landing on it.
  const towards = bearing({ x: 0, y: 0 }, { x: mx, y: my });
  const [d1, d2] = designators(r);
  const landing = angleDiff(d1.heading, towards) <= angleDiff(d2.heading, towards) ? d1 : d2;
  const departing = landing === d1 ? d2 : d1;
  return {
    runway: r,
    landing: landing.label,
    departing: departing.label,
    beyond,
    lateral,
    position,
    arrivalAltitude: beyond > 0 ? Math.round(15 + GLIDE * beyond) : null,
    departureAltitude: beyond > 0 ? Math.round(CLIMB * (beyond + 0.4 * r.length)) : null,
  };
}

const RANK: Record<RunwayRelation["position"], number> = { under: 0, near: 1, alongside: 2, off: 3 };

/** The runway relation that matters most for this address. */
export function mainRelation(port: Airport): RunwayRelation | null {
  const rel = mainRunways(port).map(relateToRunway);
  rel.sort((a, b) => RANK[a.position] - RANK[b.position] || a.lateral - underWidth(Math.max(0, a.beyond)) - (b.lateral - underWidth(Math.max(0, b.beyond))));
  return rel[0] ?? null;
}

export type Corridor = {
  id: string;
  /** Runway that aircraft in this corridor land on (and the reciprocal they depart from). */
  landing: string;
  departing: string;
  polygon: LatLon[];
  centerline: [LatLon, LatLon];
  /** Height of arriving aircraft at points along the corridor. */
  marks: { point: LatLon; distance: number; altitude: number }[];
};

export function corridors(port: Airport, proj: Projection): Corridor[] {
  const out: Corridor[] = [];
  for (const r of mainRunways(port)) {
    const [d1, d2] = designators(r);
    const cx = (r.a.x + r.b.x) / 2;
    const cy = (r.a.y + r.b.y) / 2;
    for (const end of [r.a, r.b]) {
      const ox = (end.x - cx) / (r.length / 2);
      const oy = (end.y - cy) / (r.length / 2);
      const at = (d: number, side: number) => {
        const w = side * underWidth(d);
        return proj.toLatLon({ x: end.x + ox * d - oy * w, y: end.y + oy * d + ox * w });
      };
      // Aircraft over this end fly towards the runway centre.
      const heading = bearing(end, { x: cx, y: cy });
      const landing = angleDiff(d1.heading, heading) <= angleDiff(d2.heading, heading) ? d1 : d2;
      out.push({
        id: `${port.id}-${landing.label}`,
        landing: landing.label,
        departing: landing === d1 ? d2.label : d1.label,
        polygon: [at(0, -1), at(CORRIDOR_LENGTH, -1), at(CORRIDOR_LENGTH, 1), at(0, 1)],
        centerline: [at(0, 0), at(CORRIDOR_LENGTH, 0)],
        marks: [4000, 8000, 12000, 16000].map((d) => ({ point: at(d, 0), distance: d, altitude: Math.round(15 + GLIDE * d) })),
      });
    }
  }
  return out;
}

export type AirportSummary = {
  id: string;
  name: string;
  code?: string;
  kind: AirportKind;
  heliport: boolean;
  point: LatLon;
  /** Distance to the nearest runway (or the airport centre), metres. */
  distance: number;
  relation: RunwayRelation | null;
  corridors: Corridor[];
  runways: [LatLon, LatLon][];
};

function summarize(ports: Airport[], proj: Projection, maxDistance: number): AirportSummary[] {
  return ports
    .map((port) => ({
      id: port.id,
      name: port.name,
      code: port.code,
      kind: port.kind,
      heliport: port.heliport,
      point: port.point,
      distance: Math.min(len(port.center), ...port.runways.map((r) => closestOnSegment({ x: 0, y: 0 }, r.a, r.b).d)),
      relation: mainRelation(port),
      corridors: corridors(port, proj),
      runways: port.runways.map((r): [LatLon, LatLon] => [proj.toLatLon(r.a), proj.toLatLon(r.b)]),
    }))
    .filter((p) => p.distance <= (p.heliport ? 3000 : maxDistance))
    .sort((a, b) => a.distance - b.distance);
}

export function summarizeAirports(elements: OsmElement[], proj: Projection, maxDistance = 40000): AirportSummary[] {
  return summarize(parseAirports(elements, proj), proj, maxDistance);
}

const POSITION_RANK = { under: 0, alongside: 1, near: 2, off: 3 } as const;

/** The airport that shapes this address's flight exposure: one whose paths it sits on, else the nearest. */
export function relevantAirport(airports: AirportSummary[]): AirportSummary | null {
  const fields = airports.filter((a) => !a.heliport);
  const onPath = fields
    .filter((a) => a.relation && a.relation.position !== "off")
    .sort((a, b) => POSITION_RANK[a.relation!.position] - POSITION_RANK[b.relation!.position] || a.distance - b.distance);
  return onPath[0] ?? fields[0] ?? null;
}

const KIND_LABEL: Record<AirportKind, string> = {
  major: "International airport",
  regional: "Regional airport",
  military: "Military airfield",
  small: "Airfield",
};
export const airportKindLabel = (a: AirportSummary) => (a.heliport ? "Heliport" : KIND_LABEL[a.kind]);

/* ---------- flyover heatmap ---------- */

/** Relative traffic by airport class, split across its runways. */
const TRAFFIC: Record<AirportKind, number> = { major: 1, regional: 0.3, military: 0.12, small: 0.05 };
/** Lateral spread of traffic at the runway end; it widens as aircraft disperse further out. */
const SIGMA0 = 300;
const spread = (beyond: number) => SIGMA0 + 0.07 * beyond;
/** Lower aircraft weigh more: halves at about 300 m above ground. */
const heightWeight = (h: number) => 1 / (1 + (h / 300) ** 2);
/** Straight-in paths fade out beyond this distance, where routes fan out to their headings. */
const FADE = 30000;
/** Small airfields fly circuits within about this radius instead of long straight corridors. */
const CIRCUIT = 1800;

type Lane = { mx: number; my: number; ux: number; uy: number; half: number; weight: number; circuit: boolean };

function lanes(ports: Airport[]): Lane[] {
  const out: Lane[] = [];
  for (const port of ports) {
    if (port.heliport) continue;
    const main = mainRunways(port);
    const list = main.length ? main : port.runways.slice(0, 1);
    for (const r of list) {
      if (r.length < 1) continue;
      out.push({
        mx: (r.a.x + r.b.x) / 2,
        my: (r.a.y + r.b.y) / 2,
        ux: (r.b.x - r.a.x) / r.length,
        uy: (r.b.y - r.a.y) / r.length,
        half: r.length / 2,
        weight: TRAFFIC[port.kind] / list.length,
        circuit: !main.length,
      });
    }
  }
  return out;
}

/** Relative overflight intensity at a point (metres from the address): traffic density weighted by how low it flies. */
function overflight(ls: Lane[], x: number, y: number): number {
  let total = 0;
  for (const l of ls) {
    const dx = x - l.mx;
    const dy = y - l.my;
    if (l.circuit) {
      total += l.weight * Math.exp(-(dx * dx + dy * dy) / (2 * CIRCUIT * CIRCUIT));
      continue;
    }
    const along = dx * l.ux + dy * l.uy;
    const lateral = dx * l.uy - dy * l.ux;
    const beyond = Math.abs(along) - l.half;
    if (beyond > FADE * 1.4) continue;
    const s = beyond > 0 ? spread(beyond) : SIGMA0;
    const h = beyond > 0 ? 15 + GLIDE * beyond : 0;
    const fade = beyond > 0 ? Math.exp(-((beyond / FADE) ** 4)) : 1;
    total += l.weight * Math.exp(-(lateral * lateral) / (2 * s * s)) * (SIGMA0 / s) * heightWeight(h) * fade;
  }
  return total;
}

export type FlightHeatmap = {
  /** Grid cells per side; row 0 is the northern edge. */
  size: number;
  values: Float32Array;
  max: number;
  south: number;
  west: number;
  north: number;
  east: number;
};

export function flightHeatmap(ports: Airport[], proj: Projection, half: number, size = 200): FlightHeatmap | null {
  const ls = lanes(ports);
  if (!ls.length) return null;
  const values = new Float32Array(size * size);
  const cell = (2 * half) / size;
  let max = 0;
  for (let j = 0; j < size; j++) {
    const y = half - (j + 0.5) * cell;
    for (let i = 0; i < size; i++) {
      const v = overflight(ls, -half + (i + 0.5) * cell, y);
      values[j * size + i] = v;
      if (v > max) max = v;
    }
  }
  const sw = proj.toLatLon({ x: -half, y: -half });
  const ne = proj.toLatLon({ x: half, y: half });
  return { size, values, max, south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon };
}

export type FlyoverLevel = "direct" | "near" | "distant" | "none";

export type FlightExposure = {
  level: FlyoverLevel;
  airport: AirportSummary | null;
  relation: RunwayRelation | null;
  /** Distance from the address to the nearest approach/departure path or runway, metres. */
  pathDistance: number | null;
  /** The runway (as landed on) whose path that is, and whether the address is beside the runway itself. */
  nearestPath: { airport: string; landing: string; alongside: boolean } | null;
  /** Overflight intensity here as a share of the busiest spot on the heatmap (0–1). */
  share: number;
};

export type FlightAnalysis = { airports: AirportSummary[]; heatmap: FlightHeatmap | null; exposure: FlightExposure };

/** Nearest straight-in path (extended centreline out to the corridor length) or runway. */
function nearestPath(ports: Airport[]): { distance: number; airport: string; landing: string; alongside: boolean } | null {
  let best: { distance: number; airport: string; landing: string; alongside: boolean } | null = null;
  for (const port of ports)
    for (const r of mainRunways(port)) {
      const rel = relateToRunway(r);
      const d = rel.beyond > CORRIDOR_LENGTH ? Math.hypot(rel.beyond - CORRIDOR_LENGTH, rel.lateral) : rel.lateral;
      if (!best || d < best.distance) best = { distance: d, airport: port.name, landing: rel.landing, alongside: rel.beyond <= 0 };
    }
  return best;
}

export function analyzeFlights(elements: OsmElement[], proj: Projection, maxDistance = 40000): FlightAnalysis {
  const all = parseAirports(elements, proj);
  const airports = summarize(all, proj, maxDistance);
  const kept = new Set(airports.map((a) => a.id));
  const ports = all.filter((p) => kept.has(p.id));
  const focus = relevantAirport(airports);
  const half = Math.min(30000, Math.max(12000, focus ? focus.distance + 8000 : 15000));
  const heatmap = flightHeatmap(ports, proj, half);
  const here = overflight(lanes(ports), 0, 0);
  const rel = focus?.relation ?? null;
  const path = nearestPath(ports);
  const level: FlyoverLevel = !focus
    ? "none"
    : rel?.position === "under"
      ? "direct"
      : rel?.position === "near" || rel?.position === "alongside"
        ? "near"
        : "distant";
  return {
    airports,
    heatmap,
    exposure: {
      level,
      airport: focus,
      relation: rel,
      pathDistance: path?.distance ?? null,
      nearestPath: path && { airport: path.airport, landing: path.landing, alongside: path.alongside },
      share: heatmap?.max ? here / heatmap.max : 0,
    },
  };
}
