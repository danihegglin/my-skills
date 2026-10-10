import { cachedFetch } from "./cache";

export type Climate = {
  year: number;
  timezone: string;
  /** Measured-equivalent sunshine hours over the whole year. */
  annualSunshine: number;
  /** Average sunshine hours per day, per month (Jan..Dec). */
  monthlySunshine: number[];
  /** Average daylight hours per day, per month. */
  monthlyDaylight: number[];
};

type ArchiveResponse = {
  timezone?: string;
  daily?: { time: string[]; sunshine_duration: (number | null)[]; daylight_duration: (number | null)[] };
};

export function summarizeClimate(json: ArchiveResponse, year: number): Climate {
  const daily = json.daily;
  if (!daily?.time?.length) throw new Error("No climate data for this location");
  const sun = Array(12).fill(0);
  const light = Array(12).fill(0);
  const days = Array(12).fill(0);
  daily.time.forEach((date, i) => {
    const m = Number(date.slice(5, 7)) - 1;
    const s = daily.sunshine_duration[i];
    const l = daily.daylight_duration[i];
    if (s == null || l == null) return;
    sun[m] += s / 3600;
    light[m] += l / 3600;
    days[m]++;
  });
  const monthlySunshine = sun.map((s, m) => (days[m] ? s / days[m] : 0));
  const monthlyDaylight = light.map((l, m) => (days[m] ? l / days[m] : 0));
  const annualSunshine = monthlySunshine.reduce((acc, s, m) => acc + s * new Date(Date.UTC(year, m + 1, 0)).getUTCDate(), 0);
  return { year, timezone: json.timezone || "UTC", annualSunshine, monthlySunshine, monthlyDaylight };
}

/** Last full calendar year of sunshine from the ERA5 reanalysis via Open-Meteo. */
export async function fetchClimate(lat: number, lon: number, signal?: AbortSignal): Promise<Climate> {
  const year = new Date().getFullYear() - 1;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&start_date=${year}-01-01&end_date=${year}-12-31&daily=sunshine_duration,daylight_duration&timezone=auto`;
  const res = await cachedFetch(url, signal);
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  return summarizeClimate((await res.json()) as ArchiveResponse, year);
}
