// Runs the WebAssembly sun-hours kernel off the main thread.

import wasmUrl from "../wasm/sunhours.wasm?url";
import type { HeightGrid, Kernel } from "./sunhours";
import { makeKernel } from "./sunhours";

export type SunHoursRequest = { id: number; grid: HeightGrid; suns: Float32Array };
export type SunHoursResponse = { id: number; hours: Float32Array; ms: number } | { id: number; error: string };

let kernel: Promise<Kernel> | null = null;

async function load(): Promise<Kernel> {
  try {
    return makeKernel((await WebAssembly.instantiateStreaming(fetch(wasmUrl))).instance);
  } catch {
    // Servers that don't send application/wasm: compile from the bytes instead.
    const bytes = await (await fetch(wasmUrl)).arrayBuffer();
    return makeKernel((await WebAssembly.instantiate(bytes)).instance);
  }
}

onmessage = async (ev: MessageEvent<SunHoursRequest>) => {
  const { id, grid, suns } = ev.data;
  try {
    kernel ??= load();
    const run = await kernel;
    const t = performance.now();
    const hours = run(grid, suns);
    postMessage({ id, hours, ms: performance.now() - t } satisfies SunHoursResponse, { transfer: [hours.buffer] });
  } catch (err) {
    kernel = null;
    postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies SunHoursResponse);
  }
};
