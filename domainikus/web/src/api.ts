import type { Candidate, CheckResult } from "../shared/names";

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function getConfig(): Promise<{ ai: boolean }> {
  try {
    const res = await fetch("/api/config");
    return res.ok ? await res.json() : { ai: false };
  } catch {
    return { ai: false };
  }
}

export interface SuggestRequest {
  text: string;
  names: string[];
  synonyms: boolean;
  ai: boolean;
  max: number;
}

export function suggest(req: SuggestRequest, signal?: AbortSignal) {
  return post<{ keywords: string[]; names: Candidate[]; aiError?: string }>("/api/suggest", req, signal);
}

export function check(domains: string[], signal?: AbortSignal) {
  return post<{ results: CheckResult[] }>("/api/check", { domains }, signal);
}
