// Solar position after the NOAA / Astronomical Algorithms approximations used by SunCalc.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;

function sunCoords(d: number) {
  const m = RAD * (357.5291 + 0.98560028 * d);
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const l = m + c + RAD * 102.9372 + Math.PI;
  return {
    dec: Math.asin(Math.sin(l) * Math.sin(OBLIQUITY)),
    ra: Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l)),
  };
}

export type SunPosition = {
  /** Compass azimuth in degrees, 0 = north, 90 = east. */
  azimuth: number;
  /** Altitude above the horizon in degrees. */
  altitude: number;
};

export function sunPosition(ms: number, lat: number, lon: number): SunPosition {
  const d = toDays(ms);
  const { dec, ra } = sunCoords(d);
  const phi = lat * RAD;
  const h = RAD * (280.16 + 360.9856235 * d) + lon * RAD - ra;
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  return { azimuth: ((az / RAD + 180) % 360 + 360) % 360, altitude: alt / RAD };
}

/** UTC timestamp of (approximate) local solar noon on the given UTC calendar day. */
export function solarNoon(year: number, month: number, day: number, lon: number): number {
  return Date.UTC(year, month, day, 12) - (lon / 15) * 3600000;
}

export type DaySample = SunPosition & { t: number };

/** Sun positions across the 24 hours centred on solar noon, every `stepMin` minutes. */
export function daySamples(year: number, month: number, day: number, lat: number, lon: number, stepMin = 5): DaySample[] {
  const noon = solarNoon(year, month, day, lon);
  const out: DaySample[] = [];
  for (let m = -720; m <= 720; m += stepMin) {
    const t = noon + m * 60000;
    out.push({ t, ...sunPosition(t, lat, lon) });
  }
  return out;
}

/** Altitude the sun's centre has at apparent sunrise/sunset (refraction + semi-diameter). */
export const HORIZON_ALT = -0.833;
