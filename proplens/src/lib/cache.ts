// The shared lookup cache on the PropLens worker. Every answer comes from storage or is fetched once by the
// worker and kept; whenever the worker can't help, callers fetch directly as before.

/** Turned off for the session when there is no worker (a plain static dev server). */
let unavailable = false;

/**
 * Asks the worker for an upstream answer (`body` makes it an Overpass query). Resolves to null when the
 * worker can't provide it, so the caller falls back to the upstream itself.
 */
export async function viaCache(url: string, signal?: AbortSignal, body?: string, timeoutMs = 40000): Promise<Response | null> {
  if (unavailable) return null;
  const timeout = AbortSignal.timeout(timeoutMs + 5000);
  try {
    const res = await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, body, timeout: timeoutMs }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (res.ok) return res;
    if (res.status === 404 || res.status === 405 || res.status === 500) unavailable = true;
    return null;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

/** GET through the cache, or directly when the cache can't answer. */
export async function cachedFetch(url: string, signal?: AbortSignal): Promise<Response> {
  return (await viaCache(url, signal)) ?? fetch(url, { signal });
}
