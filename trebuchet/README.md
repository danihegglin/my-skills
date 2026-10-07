# Trebuchet

A 2D physics siege game made with Godot 4.4. You fire a trebuchet at five medieval castles and knock out every defender.

**Play:** https://trebuchet.vatia.workers.dev

## Controls
- **Mouse:** point to aim, hold to charge power, release to fire. Click mid-air to split a cluster shot.
- **Keys:** arrows / W S to aim, Space to charge and fire, 1–3 to pick ammo, R to restart the level.

## Ammo
- **Stone:** unlimited.
- **Cluster:** splits into four stones when you click mid-air.
- **Firepot:** explodes on impact.

## Project layout
- `scripts/main.gd`: game flow, input, camera, UI and scoring
- `scripts/levels.gd`: castle layouts (towers, walls, battlements, mounds)
- `scripts/block.gd`, `enemy.gd`, `destructible.gd`: wood and stone blocks and defenders, with impact damage
- `scripts/projectile.gd`, `trebuchet.gd`, `scenery.gd`, `sfx.gd`: projectiles, the siege engine, the backdrop and procedurally generated sound

## Build & deploy
```sh
GODOT=/path/to/godot-4.4.1 ./build.sh           # export to build/web
GODOT=/path/to/godot-4.4.1 ./build.sh --deploy  # export and deploy to Cloudflare Workers
```
The Godot web export template must be installed. The engine's `index.wasm` is about 43 MB, which is over Cloudflare's 25 MiB limit per asset. The build therefore gzips it, and `worker/index.js` serves it with `Content-Encoding: gzip`.
