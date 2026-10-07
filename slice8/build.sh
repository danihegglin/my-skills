#!/usr/bin/env bash
# Export the Godot project for the web and prepare it for Cloudflare.
# Usage: GODOT=/path/to/godot ./build.sh [--deploy]
set -euo pipefail
cd "$(dirname "$0")"
GODOT="${GODOT:-godot}"

rm -rf build/web && mkdir -p build/web
"$GODOT" --headless --import >/dev/null 2>&1 || true
"$GODOT" --headless --export-release "Web" build/web/index.html

# index.wasm is larger than Cloudflare's 25 MiB asset limit: ship it gzipped
# and let worker/index.js serve it with Content-Encoding: gzip.
gzip -9 -f build/web/index.wasm

if [[ "${1:-}" == "--deploy" ]]; then
  npx --yes wrangler@4 deploy
fi
