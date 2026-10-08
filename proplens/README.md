# PropLens

Check any address before you rent or buy. PropLens estimates **noise** (roads, trains and trams, aircraft, restaurants and bars, industry), finds nearby **schools** and **shops**, and works out the hours of direct **sunlight** at any floor.

React + Vite + TypeScript + Tailwind v4. Runs entirely in the browser on open data; no backend and no API keys.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # model unit tests (vitest)
npm run build      # typecheck + production build to dist/
npm run deploy     # build and deploy to Cloudflare Workers (static assets)
```

## What you get for an address

| Lens | What it shows |
| --- | --- |
| Noise | Day (6–22 h) and night (22–6 h) levels in dB(A) by source, the loudest roads, rail lines, airports and venues, and a map coloured by each source's contribution. |
| Schools | Nearest childcare and kindergartens, schools (primary/secondary where tagged) and colleges, with walking times. |
| Shopping | Nearest supermarket, fresh food, bakery, pharmacy, post and mall, plus the supermarket chains within 1 km. |
| Sunlight | Sun paths for winter, spring and summer drawn against the real skyline and terrain, direct-sun hours per month, per window direction, and per floor (0–20). |

Each lens gets a 0–100 score; the PropLens score weights noise 30%, sunlight 25%, shopping 25% and schools 20%. Reports are shareable: the address, coordinates and floor live in the URL.

## Data sources

- **OpenStreetMap** via the Overpass API (with fallback mirrors): roads, rail, airports and runways, buildings and heights, schools, shops, restaurants.
- **sonBASE** (Swiss Federal Office for the Environment, via geo.admin.ch): official road and rail noise for Swiss addresses. These replace the modelled values and are marked "Official".
- **Open-Meteo**: ERA5 sunshine records for the last full year, the local time zone, and Copernicus GLO-90 elevations for the terrain horizon.
- **Photon** (komoot) for address search; **OpenFreeMap** vector tiles for the basemap.

## How the estimates work

- **Road noise**: RLS-90 emission per road from typical traffic, truck share and speed for its class (adjusted for lanes, one-way carriageways, `maxspeed` and cobbles). Each road is integrated as a line source in short pieces.
- **Propagation**: ISO 9613-2 ground and air absorption; shielding from actual building footprints around the address (12 dB or more behind a building) and ISO 9613-2 Annex A built-up attenuation beyond the scanned radius. The receiver is at 4 m, the EU noise-mapping height.
- **Rail**: reference levels per line type (main, branch, tram, light rail). Parallel tracks of one line are counted once per direction.
- **Aircraft**: runway geometry with a climb and descent of about 4° and a widening corridor along the extended centreline; airports are classed from runway length and IATA status.
- **Dining and nightlife**: point sources per venue type, with extra weight for terraces and late opening hours.
- **Sunlight**: solar position every 5 minutes on the 15th of each month and on the solstices and equinox, tested against a 1° horizon built from building heights (OSM `height`, `building:levels` or a typical height per building type) and terrain up to 20 km, from the chosen floor's eye height.

Treat the noise figures as a screening estimate of about ±5 dB, not a measurement. Real traffic counts, noise barriers, road surfaces and flight procedures can shift them. Trees and balconies aren't part of the sunlight model.

## Code map

```
src/lib/        data fetching and models (pure TypeScript, unit-tested)
  osm.ts        Overpass queries, mirror fallback, shared requests
  noise.ts      noise model and ratings
  skyline.ts    building heights, own-building detection, horizon and shielding
  sunlight.ts   sun hours per floor, month and window direction
  amenities.ts  schools and shopping
  report.ts     fetch orchestration, overall score and highlights
src/components/ landing page, report sections, charts and map
```
