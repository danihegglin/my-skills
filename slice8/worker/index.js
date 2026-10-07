// Serves the static Godot web export. The engine's index.wasm (~43 MB) exceeds
// Cloudflare's 25 MiB per-asset limit, so it is uploaded gzip-compressed and
// streamed back here with Content-Encoding: gzip; the browser decompresses it.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".wasm")) {
      const gz = await env.ASSETS.fetch(new URL(url.pathname + ".gz", url));
      if (gz.ok) {
        return new Response(gz.body, {
          headers: {
            "Content-Type": "application/wasm",
            "Content-Encoding": "gzip",
            "Cache-Control": "public, max-age=86400",
          },
          encodeBody: "manual",
        });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
