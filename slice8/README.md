# Slice8

A physics slicing game made with Godot 4.4. Each object can be cut with a straight swipe, and the pieces fall as real rigid bodies. Your score is the percentage of the total area that reaches the glowing chute at the bottom.

**Play:** https://slice8.vatia.workers.dev

## How to play
- **Slice:** drag a line across a shape and let go. A swipe that cuts nothing doesn't use up a slice.
- **Pins:** a pinned piece stays where it is, and every other piece falls. Unpinned shapes start out still and drop once they are cut.
- **Finish:** a level ends when you run out of slices and the pieces settle. You can also press DONE to end early.
- **Stars:** each world has three star targets, and earning one star unlocks the next world.

## Worlds
| # | World | What's new |
|---|-------|------------|
| 1 | Sunrise Meadow | Two pinned shapes and a wide chute |
| 2 | Canyon Dusk | A ledge you have to tip pieces off, and a star pinned at its centre |
| 3 | Frozen Cavern | Frictionless ice, so only angled cuts slide off the shelf |
| 4 | Coral Reef | Slow underwater physics, a sideways current and sea urchins |
| 5 | Clockwork Foundry | Spinning arms and a conveyor belt |
| 6 | Volcano Core | Lava pools and a moving platform |
| 7 | Orbital Station | Low gravity, a planetoid's gravity well and a blinking laser |
| 8 | Neon Megacity | A sweeping laser, bumpers, a spinner, a slider and eight slices |

## How it works
- Cuts use Godot's `Geometry2D` polygon clipping. Each piece keeps its outline in the original object's coordinates, so surface patterns and earlier cut edges stay continuous across pieces.
- Every piece gets the exact mass, centre of mass and moment of inertia of its polygon. Its velocity is inherited from the parent piece, including the parent's spin.
- All graphics are procedural: GLSL shaders draw the backgrounds and object materials, and particles add the effects. Sound effects are synthesised at startup.

## Project layout
- `scripts/main.gd`: game flow, slicing, scoring, effects and UI
- `scripts/levels.gd`: the eight level layouts and their star targets
- `scripts/env.gd`: level geometry, moving parts, hazards and force fields
- `scripts/piece.gd`: a sliceable rigid piece
- `scripts/geom.gd`: polygon maths and shape generators
- `scripts/themes.gd`: world palettes and object materials
- `scripts/ui/`: HUD and menu widgets
- `shaders/`: backgrounds, materials, terrain, lava and the goal chute
- `tests/bot.gd`: a headless bot that plays a level with random slices. Use it to tune the star targets.

## Build and deploy
```sh
GODOT=/path/to/godot-4.4.1 ./build.sh           # export to build/web
GODOT=/path/to/godot-4.4.1 ./build.sh --deploy  # export and deploy to Cloudflare Workers
# measure a level: best/median score over 300 random playthroughs
$GODOT --headless --fixed-fps 60 res://tests/bot.tscn -- level=3 trials=300
```
The engine's `index.wasm` is about 43 MB, which is over Cloudflare's 25 MiB limit per asset. The build therefore gzips it, and `worker/index.js` serves it with `Content-Encoding: gzip`.

The font is Fredoka, licensed under the SIL Open Font License (`fonts/OFL.txt`).
