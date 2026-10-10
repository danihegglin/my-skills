export type LatLon = { lat: number; lon: number };
/** Metres east (x) and north (y) of a local origin. */
export type XY = { x: number; y: number };

export type Projection = {
  origin: LatLon;
  toXY: (lat: number, lon: number) => XY;
  toLatLon: (p: XY) => LatLon;
};

const RAD = Math.PI / 180;

/** Equirectangular projection around an origin. Accurate to well under 1% within ~30 km. */
export function makeProjection(origin: LatLon): Projection {
  const phi = origin.lat * RAD;
  const mLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const mLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  return {
    origin,
    toXY: (lat, lon) => ({ x: (lon - origin.lon) * mLon, y: (lat - origin.lat) * mLat }),
    toLatLon: (p) => ({ lat: origin.lat + p.y / mLat, lon: origin.lon + p.x / mLon }),
  };
}

export const len = (p: XY) => Math.hypot(p.x, p.y);
export const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Compass bearing in degrees (0 = north, 90 = east) from `from` to `to`. */
export function bearing(from: XY, to: XY): number {
  const deg = Math.atan2(to.x - from.x, to.y - from.y) / RAD;
  return (deg + 360) % 360;
}

export function closestOnSegment(p: XY, a: XY, b: XY): { point: XY; t: number; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, d: dist(p, point) };
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolygon(p: XY, poly: XY[]): number {
  if (poly.length > 2 && pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    best = Math.min(best, closestOnSegment(p, poly[i], poly[i + 1]).d);
  }
  return best;
}

export function distanceToPolyline(p: XY, line: XY[]): { d: number; point: XY } {
  let best = { d: Infinity, point: line[0] };
  for (let i = 0; i < line.length - 1; i++) {
    const c = closestOnSegment(p, line[i], line[i + 1]);
    if (c.d < best.d) best = { d: c.d, point: c.point };
  }
  return best;
}

/**
 * Distance along a ray from the origin (direction = compass bearing) to segment a-b,
 * or null if the ray misses it.
 */
export function rayHit(bearingDeg: number, a: XY, b: XY): number | null {
  const dx = Math.sin(bearingDeg * RAD);
  const dy = Math.cos(bearingDeg * RAD);
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return null;
  const t = (a.x * ey - a.y * ex) / denom; // distance along ray
  const u = (a.x * dy - a.y * dx) / denom; // position along segment
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

export function polylineLength(line: XY[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += dist(line[i], line[i + 1]);
  return total;
}

/** Splits a polyline into pieces no longer than `maxLen` metres. */
export function densify(line: XY[], maxLen: number): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const n = Math.max(1, Math.ceil(dist(a, b) / maxLen));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  if (line.length) out.push(line[line.length - 1]);
  return out;
}

export function polygonArea(poly: XY[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

export function haversine(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

/** WGS84 → Swiss LV95 (EPSG:2056), swisstopo approximate formulas (~1 m accuracy). */
export function toLv95(lat: number, lon: number): { e: number; n: number } {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return { e, n };
}

export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

/** Walking minutes, assuming 4.8 km/h and a 1.25 street-network detour factor. */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round((m * 1.25) / 80));
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compassLabel(deg: number): string {
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
