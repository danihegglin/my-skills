// Scores a share of an area's homes off the main thread. See useAreaRanking for the coordinator.

import type { AreaShape, BBox } from "./area";
import type { Climate } from "./climate";
import type { AreaHome } from "./areaScore";
import { scoreArea } from "./areaScore";

export type WorkerInput = {
  buffers: { buildings: ArrayBuffer; streets: ArrayBuffer; places: ArrayBuffer; air: ArrayBuffer | null };
  climate: Climate | null;
  shape: Pick<AreaShape, "rings" | "bbox">;
  window: BBox;
  part: [number, number];
};

export type WorkerMessage = { type: "progress"; done: number; total: number } | { type: "done"; homes: AreaHome[] } | { type: "error"; message: string };

const post = (m: WorkerMessage) => postMessage(m);

onmessage = (ev: MessageEvent<WorkerInput>) => {
  const { buffers, climate, shape, window, part } = ev.data;
  try {
    const decoder = new TextDecoder();
    const parse = (b: ArrayBuffer) => (JSON.parse(decoder.decode(b)) as { elements: [] }).elements;
    const data = {
      buildings: parse(buffers.buildings),
      streets: parse(buffers.streets),
      places: parse(buffers.places),
      air: buffers.air ? parse(buffers.air) : null,
      climate,
    };
    const homes = scoreArea(data, shape, window, { part, onProgress: (done, total) => post({ type: "progress", done, total }) });
    post({ type: "done", homes });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
