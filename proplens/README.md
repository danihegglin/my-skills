# PropLens

Check any address before you rent or buy. PropLens estimates **noise** (roads, trains and trams, aircraft, restaurants and bars, industry), maps **flight routes** to show whether planes fly directly over or pass at a distance, finds nearby **schools** and **shops**, works out the hours of direct **sunlight** at any floor, and **estimates rent and purchase prices** for a home there.

Live at **https://proplens.vatia.workers.dev**

React + Vite + TypeScript + Tailwind v4. Runs entirely in the browser on open data; no backend and no API keys.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # model unit tests (vitest)
npm run build      # typecheck + production build to dist/
npm run deploy     # build and deploy to Cloudflare Workers (static assets)

pip install openpyxl && python3 scripts/update-price-data.py   # refresh the bundled price statistics (yearly)
```

## What you get for an address

| Lens | What it shows |
| --- | --- |
| Noise | Day (6–22 h) and night (22–6 h) levels in dB(A) by source, the loudest roads, rail lines, airports and venues, and a map coloured by each source's contribution. |
| Flight routes | A flyover heatmap of where aircraft regularly pass and how low, and whether the address gets direct flyovers, sits near a flight path or is distant from them, with the height planes pass at. |
| Schools | Nearest childcare and kindergartens, schools (primary/secondary where tagged) and colleges, with walking times. |
| Shopping | Nearest supermarket, fresh food, bakery, pharmacy, post and mall, plus the supermarket chains within 1 km. |
| Sunlight | Sun paths for winter, spring and summer drawn against the real skyline and terrain, direct-sun hours per month, per window direction, and per floor (0–20). |
| Price estimate | Enter size, rooms, floor, age, condition, fittings and features to get an advertised-rent or purchase-price estimate with a range and a step-by-step breakdown; add an asking price to see if a listing is fair. Swiss addresses use bundled federal statistics; elsewhere you supply a local reference price per m². |

Each lens gets a 0–100 score; the PropLens score weights noise 30%, sunlight 25%, shopping 25% and schools 20%. Reports are shareable: the address, coordinates and floor live in the URL.

## Data sources

- **OpenStreetMap** via the Overpass API (with fallback mirrors): roads, rail, airports and runways, buildings and heights, schools, shops, restaurants.
- **sonBASE** (Swiss Federal Office for the Environment) and the **aircraft noise cadastres** of the Swiss Federal Office of Civil Aviation, via geo.admin.ch: official road, rail and daytime aircraft noise for Swiss addresses. These replace the modelled values and are marked "Official".
- **Open-Meteo**: ERA5 sunshine records for the last full year, the local time zone, and Copernicus GLO-90 elevations for the terrain horizon.
- **Photon** (komoot) for address search; **OpenFreeMap** vector tiles for the basemap; swisstopo municipal boundaries (geo.admin.ch) to find the municipality and canton.
- **Bundled price statistics** (`src/data/prices.json`, rebuilt by `scripts/update-price-data.py`): Swiss Federal Statistical Office rents per month and per m² by canton and room count, by construction period, by urban/rural municipality type, for the ten largest cities and by tenancy duration; the City of Winterthur's comparison of advertised and paid rents; and the Canton of Zurich's sale prices of condominiums and houses by property-market region.

## How the estimates work

- **Road noise**: RLS-90 emission per road from typical traffic, truck share and speed for its class (adjusted for lanes, one-way carriageways, `maxspeed` and cobbles). Each road is integrated as a line source in short pieces.
- **Propagation**: ISO 9613-2 ground and air absorption; shielding from actual building footprints around the address (12 dB or more behind a building) and ISO 9613-2 Annex A built-up attenuation beyond the scanned radius. The receiver is at 4 m, the EU noise-mapping height.
- **Rail**: reference levels per line type (main, branch, tram, light rail). Parallel tracks of one line are counted once per direction.
- **Aircraft**: runway geometry with a climb and descent of about 4° and a widening corridor along the extended centreline; airports are classed from runway length and IATA status.
- **Flight routes**: traffic per airport class (international, regional, military, airfield circuits) is split across its runways and spread along each extended centreline, widening with distance and fading after about 30 km. The heatmap weights it by how low aircraft fly there (3° glide slope, 8% climb). An address inside the inner corridor is a direct flyover; within the wider band, or beside the runway, it is near a flight path; anything else is distant. Real procedures curve and change with wind and runway use.
- **Dining and nightlife**: point sources per venue type, with extra weight for terraces and late opening hours.
- **Price estimate**: base rent per m² for the canton and room count (federal statistics), × the advertised-rent premium over paid rents (Winterthur), × city or urban/rural location, then hedonic steps for size (elasticity −0.15 against the typical size), construction period (federal statistics), condition, fittings (−10% to +25%), floor and lift, balcony, garden and view, and the report's own noise (−0.4% per dB above 50 dB), flyover, winter-sun and amenity signals. Purchase prices multiply annual rent by price-to-rent ratios calibrated so a typical 4-room flat (or 5-room house) reproduces the 2025 median sale price of each Zurich region; elsewhere the agglomeration and rural ratios apply. Ranges are ±12% for rents and ±15–20% for prices.
- **Sunlight**: solar position every 5 minutes on the 15th of each month and on the solstices and equinox, tested against a 1° horizon built from building heights (OSM `height`, `building:levels` or a typical height per building type) and terrain up to 20 km, from the chosen floor's eye height.

Treat the noise figures as a screening estimate of about ±5 dB, not a measurement. Real traffic counts, noise barriers, road surfaces and flight procedures can shift them. Trees and balconies aren't part of the sunlight model.

## Code map

```
src/lib/        data fetching and models (pure TypeScript, unit-tested)
  osm.ts        Overpass queries, mirror fallback, shared requests
  noise.ts      noise model and ratings
  airports.ts   airports, runways, flight corridors, flyover heatmap and exposure
  skyline.ts    building heights, own-building detection, horizon and shielding
  sunlight.ts   sun hours per floor, month and window direction
  amenities.ts  schools and shopping
  valuation.ts  price estimation engine (rent and purchase) and listing check
  municipality.ts  Swiss municipality and canton lookup
src/data/       bundled price statistics (prices.json)
scripts/        update-price-data.py rebuilds prices.json from the official sources
  report.ts     fetch orchestration, overall score and highlights
src/components/ landing page, report sections, charts and map
```
