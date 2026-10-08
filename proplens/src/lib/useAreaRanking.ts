import { useEffect, useState } from "react";
import type { AreaRef, AreaShape, BBox } from "./area";
import { areaQueries, loadAreaShape, rankWindow } from "./area";
import type { WorkerInput, WorkerMessage } from "./area.worker";
import type { AreaHome } from "./areaScore";
import { rank, refineTop } from "./areaScore";
import type { Climate } from "./climate";
import { fetchClimate } from "./climate";
import type { LatLon } from "./geo";
import { overpassBuffer, queries } from "./osm";
import type { StepState } from "./report";
import { fetchOfficialNoise, inSwitzerland } from "./swissNoise";

export type AreaStepId = "boundary" | "buildings" | "streets" | "places" | "air" | "climate" | "scoring" | "official";

export const AREA_STEP_LABELS: Record<AreaStepId, string> = {
  boundary: "Finding the area's boundary",
  buildings: "Loading every building and address",
  streets: "Tracing streets, rail lines and industry",
  places: "Finding schools, shops and restaurants",
  air: "Scanning airports and flight paths",
  climate: "Reviewing a year of sunshine records",
  scoring: "Scoring each address for noise, schools, shopping and sun",
  official: "Checking the best against official Swiss noise maps",
};

export type AreaRanking = {
  shape: AreaShape;
  /** The ranked part of the area: all of it, or a window when the area is too large. */
  window: BBox;
  clipped: boolean;
  homes: AreaHome[];
  /** True once the leading homes have been checked against official noise maps (Swiss areas). */
  refined: boolean;
  ranked: string;
};

export type RankingUpdate = {
  steps: Partial<Record<AreaStepId, StepState>>;
  progress: { done: number; total: number } | null;
  ranking: AreaRanking | null;
};

const shapes = new Map<string, AreaShape>();
const finished = new Map<string, AreaRanking>();
const keyOf = (ref: AreaRef, w: BBox) => `${ref.id}|${[w.south, w.west, w.north, w.east].map((v) => v.toFixed(5)).join(",")}`;

/** A ranking of the same window already computed in this session, if any. */
export function cachedRanking(ref: AreaRef, focus?: LatLon): AreaRanking | null {
  const shape = shapes.get(ref.id);
  return shape ? (finished.get(keyOf(ref, rankWindow(shape.bbox, focus ?? ref.focus).bbox)) ?? null) : null;
}

function workerCount() {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return Math.max(1, Math.min(memory <= 4 ? 2 : 4, cores - 1));
}

function scoreInWorkers(
  input: Omit<WorkerInput, "part">,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<AreaHome[]> {
  const n = workerCount();
  const workers = Array.from({ length: n }, () => new Worker(new URL("./area.worker.ts", import.meta.url), { type: "module" }));
  const stop = () => workers.forEach((w) => w.terminate());
  const progress = workers.map(() => ({ done: 0, total: 0 }));
  return new Promise<AreaHome[]>((resolve, reject) => {
    const results: AreaHome[][] = [];
    signal.addEventListener("abort", () => {
      stop();
      reject(signal.reason);
    }, { once: true });
    workers.forEach((w, k) => {
      w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
        const m = ev.data;
        if (m.type === "progress") {
          progress[k] = { done: m.done, total: m.total };
          onProgress(progress.reduce((a, p) => a + p.done, 0), progress.reduce((a, p) => a + p.total, 0));
        } else if (m.type === "done") {
          results[k] = m.homes;
          if (results.filter(Boolean).length === n) {
            stop();
            resolve(results.flat());
          }
        } else {
          stop();
          reject(new Error(m.message));
        }
      };
      w.onerror = (ev) => {
        stop();
        reject(new Error(ev.message || "The scoring worker failed"));
      };
      // Each worker parses its own copy of the raw responses; the last one takes the originals.
      const last = k === n - 1;
      const copy = (b: ArrayBuffer) => (last ? b : b.slice(0));
      const buffers = {
        buildings: copy(input.buffers.buildings),
        streets: copy(input.buffers.streets),
        places: copy(input.buffers.places),
        air: input.buffers.air && copy(input.buffers.air),
      };
      const transfer = [buffers.buildings, buffers.streets, buffers.places, ...(buffers.air ? [buffers.air] : [])];
      w.postMessage({ ...input, buffers, part: [k, n] } satisfies WorkerInput, transfer);
    });
  });
}

/**
 * Ranks every residential address in an area (or the window of it around `focus`) with the report's
 * own models, reporting progress through `onUpdate`. Results are cached for the session.
 */
export async function rankArea(ref: AreaRef, focus: LatLon | undefined, signal: AbortSignal, onUpdate: (u: RankingUpdate) => void): Promise<AreaRanking> {
  const cached = cachedRanking(ref, focus);
  const steps: Partial<Record<AreaStepId, StepState>> = {};
  let progress: RankingUpdate["progress"] = null;
  let ranking: AreaRanking | null = cached ?? null;
  const emit = () => onUpdate({ steps: { ...steps }, progress, ranking });
  if (cached) {
    emit();
    return cached;
  }
  const set = (id: AreaStepId, state: StepState) => {
    steps[id] = state;
    emit();
  };

  set("boundary", "pending");
  const shape = shapes.get(ref.id) ?? (await loadAreaShape(ref, signal));
  shapes.set(ref.id, shape);
  set("boundary", "done");
  const { bbox: window, clipped } = rankWindow(shape.bbox, focus ?? ref.focus);
  const key = keyOf(ref, window);
  const ready = finished.get(key);
  if (ready) {
    ranking = ready;
    emit();
    return ready;
  }
  const center = { lat: (window.south + window.north) / 2, lon: (window.west + window.east) / 2 };
  const swiss = inSwitzerland(center.lat, center.lon);
  const q = areaQueries(window);
  for (const id of ["buildings", "streets", "places", "air", "climate", "scoring"] as AreaStepId[]) steps[id] = "pending";
  steps.official = swiss ? "pending" : "skipped";
  emit();

  async function track<T>(id: AreaStepId, run: () => Promise<T>): Promise<T | null> {
    try {
      const value = await run();
      set(id, "done");
      return value;
    } catch (err) {
      if (signal.aborted) throw err;
      console.warn(`[proplens] area ${id} failed`, err);
      set(id, "failed");
      return null;
    }
  }

  const [buildings, streets, places, air, climate] = await Promise.all([
    track("buildings", () => overpassBuffer(q.buildings, signal)),
    track("streets", () => overpassBuffer(q.streets, signal)),
    track("places", () => overpassBuffer(q.places, signal)),
    track("air", () => overpassBuffer(queries.air(center), signal, 60000)),
    track<Climate>("climate", () => fetchClimate(center.lat, center.lon, signal)),
  ]);
  // Without these the scores would quietly miss whole categories; better to say so.
  if (!buildings || !streets || !places) throw new Error("The map servers are busy right now, so this area couldn't be loaded.");

  let homes = await scoreInWorkers({ buffers: { buildings, streets, places, air }, climate, shape, window }, signal, (done, total) => {
    progress = { done, total };
    emit();
  });
  homes = rank(homes);
  ranking = { shape, window, clipped, homes, refined: false, ranked: new Date().toISOString() };
  set("scoring", "done");

  if (swiss && homes.length) {
    homes = await refineTop(homes, (lat, lon) => fetchOfficialNoise(lat, lon, signal), {
      onProgress: (checked) => {
        progress = { done: checked, total: Math.min(50, homes.length) };
        emit();
      },
    });
    if (signal.aborted) throw signal.reason;
    ranking = { ...ranking, homes, refined: true };
    set("official", "done");
  }
  progress = null;
  finished.set(key, ranking);
  emit();
  return ranking;
}

export function useAreaRanking(ref: AreaRef | null, focus: LatLon | undefined, attempt: number) {
  const [update, setUpdate] = useState<RankingUpdate>({ steps: {}, progress: null, ranking: null });
  const [error, setError] = useState<string | null>(null);
  const focusKey = focus ? `${focus.lat},${focus.lon}` : "";

  useEffect(() => {
    if (!ref) return;
    const ctrl = new AbortController();
    setError(null);
    setUpdate({ steps: {}, progress: null, ranking: null });
    rankArea(ref, focus, ctrl.signal, (u) => !ctrl.signal.aborted && setUpdate(u)).catch((err) => {
      if (ctrl.signal.aborted) return;
      console.warn("[proplens] area ranking failed", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    });
    return () => ctrl.abort();
  }, [ref?.id, focusKey, attempt]);

  return { ...update, error };
}
