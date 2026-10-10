# PropLens

Check any address before you rent or buy. PropLens estimates **noise** (roads, trains and trams, aircraft, restaurants and bars, industry), maps **flight routes** to show whether planes fly directly over or pass at a distance, finds nearby **schools** and **shops**, works out the hours of direct **sunlight** at any floor, and **estimates rent and purchase prices** for a home there. It can also **rank every address in a postcode or town** and **email alerts** when a listing comes up at an address that scores high enough.

Live at **https://proplens.vatia.workers.dev**

React + Vite + TypeScript + Tailwind v4. Reports and area rankings run in the browser on open data, with no API keys. A small Cloudflare Worker with SQLite-backed Durable Objects caches looked-up data, stores paid alert subscriptions (Stripe) and scans listings.

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to the worker)
npm run dev:api    # the alerts worker on http://localhost:8787 (also serves the built app)
npm test           # model and worker unit tests (vitest)
npm run build      # typecheck + production build to dist/
npm run deploy     # build and deploy to Cloudflare Workers

pip install openpyxl && python3 scripts/update-price-data.py   # refresh the bundled price statistics (yearly)
```

## What you get for an address

| Lens | What it shows |
| --- | --- |
| Noise | Day (6–22 h) and night (22–6 h) levels in dB(A) by source, the loudest roads, rail lines, airports and venues, and a map coloured by each source's contribution. |
| Flight routes | A flyover heatmap of where aircraft regularly pass and how low, and whether the address gets direct flyovers, sits near a flight path or is distant from them, with the height planes pass at. |
| Schools | Nearest childcare and kindergartens, schools (primary/secondary where tagged) and colleges, with walking times. |
| Shopping | Nearest supermarket, fresh food, bakery, pharmacy, post and mall, plus the supermarket chains within 1 km. |
| Sunlight | Sun paths for winter, spring and summer drawn against the real skyline and terrain, direct-sun hours per month, per window direction, and per floor (0–20), plus the neighbouring buildings that block the sun: distance and direction, height and storeys, footprint, and the hours of sun each one takes on the shortest day and over a year. |
| Price estimate | Enter size, rooms, floor, age, condition, fittings and features to get an advertised-rent or purchase-price estimate with a range and a step-by-step breakdown; add an asking price to see if a listing is fair. Swiss addresses use bundled federal statistics; elsewhere you supply a local reference price per m². |

Each lens gets a 0–100 score; the PropLens score weights noise 30%, sunlight 25%, shopping 25% and schools 20%. Reports are shareable: the address, coordinates and floor live in the URL.

## Shadows in 3D

The Sunlight section has a **3D view** in the style of shadowmap.org. It loads on demand: three.js, MapLibre and a WebAssembly kernel, about 145 kB gzipped.

- **Buildings:** every building within 250 m of the address is extruded to its height (federal building register or OpenStreetMap) and placed on the basemap. You can pan, tilt and turn the view, or make it full screen. The address's own building is highlighted.
- **Shadows:** a three.js scene runs inside MapLibre as a custom layer.
  - A directional light is aimed from the sun's actual position for the chosen date and local time (time zone and summer time included). Its shadow map falls onto a transparent ground plane, so only the shadows darken the map.
  - Pick a day (21 Dec, 20 Mar, 21 Jun or any date), drag the time slider between sunrise and sunset, or press play to watch a day in about ten seconds.
  - When the sun is behind the surrounding hills (the terrain horizon), the whole scene is in shade.
  - The panel also says whether the chosen floor of your building is in the sun at that moment.
- **The sun in the scene:** the sun is drawn in the sky where it stands, 100 m from the address, with a ray down to the address. It is dimmed when it is behind the hills and hidden at night.
  - The day's path arcs across the sky, with a bead at every full hour and labels every two hours (local clock time). Labels that would overlap the sun or each other are hidden.
  - A compass ring on the ground marks N, E, S and W, and an arrow on it points towards the sun.
  - A sky dial in the corner shows the sky seen from above: the rim is the horizon and the centre is straight overhead. It turns with the map and shows the day's path and the sun, with "from the south-west, 225°, 34° high". **Face the sun** (or tapping the dial on a phone) turns the view towards the sun. The view also opens facing it.
- **Sun hours:** a heatmap of the hours of direct sun every spot gets on the chosen day.
  - It covers the ground at 1 m resolution, 500 × 500 m (250,000 points), and every roof. Click anywhere for the hours at that spot.
  - The tracing runs in WebAssembly (`assembly/sunhours.ts`, AssemblyScript, compiled by `npm run build:wasm` to a 463-byte `src/wasm/sunhours.wasm`) in a Web Worker.
- **How the kernel works:** footprints are rasterised into a height grid, and the sun's positions every 10 minutes become samples. Sun below 0.5° or behind the terrain is skipped.
  - For each sample, the grid is swept in lines parallel to the light, starting from the sunny side. Each line carries the top of the shadow cast so far: it drops by tan(altitude) per metre and rises to any taller roof.
  - Every cell is visited once per sun position, so a June day takes about 0.3–0.8 s whatever the building heights. The first version marched each ray separately and took 4.7 s near a 49 m building.

## Your preferences and comparing addresses

The **Preferences** button (on every page) opens a list of things people look for. Pick the ones that matter, set a target and how important each one is: nice to have, important or must have.

| Group | Preferences (targets) |
| --- | --- |
| Light | Evening sun: hours of direct sun after 5 pm, April–September (1, 2, 3 h) · Morning sun: before 10 am (0.5, 1, 2 h) · Winter sun on the shortest day (2–5 h) |
| Getting around | Public transport: a bus, tram, metro or train stop (3–10 min walk) · Train station (5–20 min) · Near work or school: straight-line distance to an address you pick (2–20 km) |
| Everyday | Supermarket · School · Childcare or kindergarten · Park or woods (3–15 min walk) |
| Peace and quiet | Quiet nights (≤ 40/45/50 dB) · Quiet days (≤ 50/55/60 dB) · No bars, pubs or clubs within 150 m · No flight path (not overhead / not nearby) |

- **Scoring:** each preference scores 0–1 against what the address offers.
  - Hours count in proportion to the target.
  - Walking times keep full marks up to the target and fall to zero at twice the target.
  - Noise falls to zero 10 dB above the target.
- **Match:** the weighted average, with important counting double and must-have triple. A must-have that isn't fully met caps the match at 59, and only a full match reaches 100.
- **Where it shows:**
  - *Reports:* a **Your match** card with every preference, the measured value and its target.
  - *Area rankings:* a **For you** order that ranks every address by your match and says what each one misses.
  - *Comparison:* **Save to compare** keeps up to six addresses (with what they offer at the saved floor) for the **Compare** page. There they sit side by side, with your match, each preference and the key facts, and the best value in each row highlighted.
- **Storage:** preferences and saved addresses stay in the browser (localStorage); nothing is sent anywhere.
- **New data behind it:**
  - A fifth Overpass query per address fetches bus, tram and metro stops (800 m), train stations and ferries (2 km), and parks and woods (1 km, outlines cropped to the search box). The report doesn't wait for it; the match card says "Still loading…" until it arrives. Area rankings fetch the same data as part of their places query.
  - The sunlight model counts direct sun before 10:00 and after 17:00 local time (the address's time zone, summer time included).

## Shared cache

Every upstream lookup a report or area ranking makes (Overpass queries, official Swiss noise, geo.admin.ch boundaries and building register, Open-Meteo climate and elevation) goes through `POST /api/fetch` on the worker first:

- The worker only proxies those sources (`worker/cache.ts`). The cache key is the Overpass query, whichever mirror is asked, or else the URL.
- A hit is served straight from SQLite in one of 16 `Cache` Durable Objects (`worker/cacheStore.ts`), gzip-compressed end to end. Entries larger than 1 MB are stored in parts.
- On a miss the worker fetches the source itself, trying the Overpass mirrors in turn, and keeps only complete answers. Concurrent misses for the same key share one request.
- Data stays for 30 days (OSM data, noise, boundaries), 120 days (climate) or a year (elevation).
- Each shard is trimmed to 200 MB, least recently used first, with expired entries dropped on the three-hourly cron. That keeps the total within the free plan's 5 GB.
- If the worker can't answer (Overpass sometimes rate-limits Cloudflare; three failures in a row pause Overpass misses for five minutes), the browser fetches directly as before. A cached address's report loads in a couple of seconds instead of 5–20.
- The worker fetches the data itself rather than accepting uploads from browsers, so nobody can plant made-up map data for an address.
- `GET /api/cache/stats` (admin) shows the entries, size and hits per source.

## Area ranking

Search a postcode, town or district (or follow the links at the bottom of a report) to score every residential building with a house number in it. Swiss postcodes and municipalities use their official boundaries from geo.admin.ch; elsewhere a town's or district's bounding box from Photon, or a 2 × 2 km box around an address. Areas larger than 3 × 3 km are ranked in a window you can move ("Rank here").

- One set of Overpass queries covers the whole window plus each model's search radius, so every address sees the same surroundings it would in its own report.
- The noise, schools, shopping, flyover and sunlight models run unchanged for each address, spread over up to four Web Workers (`src/lib/area.worker.ts`). Sunlight is scored at floor 1 against buildings only; the full report adds the terrain horizon.
- In Switzerland the leading 25 addresses are re-checked against the official sonBASE and aircraft noise maps and re-ranked, repeating until the top 25 are all checked (at most 50 lookups).
- Sort by overall score, quiet, sun, schools or shops; filter flats or houses; open any address as a full report.

## Listing alerts

Below an area ranking (and at the bottom of every report) visitors can sign up for alerts: rent or buy, an optional budget, a minimum PropLens score and an email address. Alerts are a paid subscription: **CHF 5 a year per email address**, covering alerts for every area added with that email.

1. **Signup** (`POST /api/alerts`): the form sends the preferences together with the area's ranking (address, position and scores of every ranked home). The worker validates it, rate-limits by hashed IP (5 per hour), stores it in the `Signups` Durable Object (SQLite) and replaces the area's stored ranking. A hidden honeypot field catches bots. Without Stripe configured, signups are refused ("Alerts open soon").
2. **Payment**: if the email has no paid-up subscription, the worker creates a Stripe Checkout Session (subscription mode, the configured yearly price, email prefilled) and the form shows Stripe's embedded payment form in place. When it completes, the page calls `POST /api/billing/complete`, which reads the session from Stripe and switches the alert on. The `checkout.session.completed` and `customer.subscription.*` webhooks (`POST /api/billing/webhook`, signature-checked) record the same, plus renewals, failed renewals and cancellations. Alerts run while the subscription is active, trialing or past due, with 7 days' grace after the paid period. Unpaid signups are deleted after 7 days.
3. **Confirmation**: double opt-in, sent once the email has paid. A confirmation email links to `/?alerts=confirm&token=…`, where a button confirms (so link scanners can't).
4. **Scan** (cron `17 */3 * * *`): for each area with subscribers, new listings in the ranked window come from Flatfox's public listing API (`/api/v1/pin/` then `/api/v1/public-listing/`). Each is matched to a ranked address by street and house number (normalised: case, accents, "str."), or else to the nearest ranked address within 30 m, and takes that address's score. Listings that hide their street or lie outside the area stay unscored.
5. **Digest**: each confirmed, paid-up subscriber gets one email per scan with up to 10 new apartments or houses that match their mode and budget and score at or above their minimum (plus, for a new subscription, matches first seen up to 14 days earlier). Every email links to the listing, the PropLens report for the address, a one-click unsubscribe (`List-Unsubscribe` included) and `/?alerts=manage&token=…`, which opens Stripe's customer portal (cancel, change card, invoices).

Configuration (Cloudflare dashboard or `wrangler secret put`):

| Name | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key. Without it and `ALERTS_FROM`, signups and scans still run, but no email (confirmation or digest) is sent. |
| `ALERTS_FROM` | Sender, e.g. `PropLens <alerts@your-domain.ch>` on a domain verified in Resend. |
| `ADMIN_TOKEN` | Unlocks `GET /api/alerts/export` (subscriptions, payments, areas, recent listings), `POST /api/alerts/scan` (run a scan now) and `GET /api/cache/stats`, with `Authorization: Bearer <token>`. |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…`/`sk_test_…`) or a restricted key with write access to Checkout Sessions, Customers and Customer portal, and read access to Prices and Subscriptions. |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_…`), handed to the page for the payment form. |
| `STRIPE_PRICE_ID` | The yearly price to sell (`price_…`, CHF 5 / year). The page shows this price's amount. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) of the webhook endpoint `https://<your domain>/api/billing/webhook`. |
| `PUBLIC_URL` | Base URL for email links (set in `wrangler.jsonc`). |

Check Flatfox's terms before relying on its API in production; the listing source is isolated in `worker/listings.ts`.

## Data sources

- **OpenStreetMap** via the Overpass API (with fallback mirrors): roads, rail, airports and runways, buildings and heights, schools, shops, restaurants.
- **sonBASE** (Swiss Federal Office for the Environment) and the **aircraft noise cadastres** of the Swiss Federal Office of Civil Aviation, via geo.admin.ch: official road, rail and daytime aircraft noise for Swiss addresses. These replace the modelled values and are marked "Official".
- **Open-Meteo**: ERA5 sunshine records for the last full year, the local time zone, and Copernicus GLO-90 elevations for the terrain horizon.
- **Photon** (komoot) for address and area search; **OpenFreeMap** vector tiles for the basemap; swisstopo municipal and postcode boundaries (geo.admin.ch) for the municipality, canton and area rankings.
- **Federal Register of Buildings and Dwellings** (GWR, Federal Statistical Office, via geo.admin.ch): storeys, footprint, address and year of every Swiss building around the address.
- **Flatfox** public listing API for listing alerts; **Stripe** for alert subscriptions.
- **Bundled price statistics** (`src/data/prices.json`, rebuilt by `scripts/update-price-data.py`): Swiss Federal Statistical Office rents per month and per m² by canton and room count, by construction period, by urban/rural municipality type, for the ten largest cities and by tenancy duration; the City of Winterthur's comparison of advertised and paid rents; and the Canton of Zurich's sale prices of condominiums and houses by property-market region.

## How the estimates work

- **Road noise**: RLS-90 emission per road from typical traffic, truck share and speed for its class (adjusted for lanes, one-way carriageways, `maxspeed` and cobbles). Each road is integrated as a line source in short pieces.
- **Propagation**: ISO 9613-2 ground and air absorption; shielding from actual building footprints around the address (12 dB or more behind a building) and ISO 9613-2 Annex A built-up attenuation beyond the scanned radius. The receiver is at 4 m, the EU noise-mapping height.
- **Rail**: reference levels per line type (main, branch, tram, light rail). Parallel tracks of one line are counted once per direction.
- **Aircraft**: runway geometry with a climb and descent of about 4° and a widening corridor along the extended centreline; airports are classed from runway length and IATA status.
- **Flight routes**: traffic per airport class (international, regional, military, airfield circuits) is split across its runways and spread along each extended centreline, widening with distance and fading after about 30 km. The heatmap weights it by how low aircraft fly there (3° glide slope, 8% climb). An address inside the inner corridor is a direct flyover; within the wider band, or beside the runway, it is near a flight path; anything else is distant. Real procedures curve and change with wind and runway use.
- **Dining and nightlife**: point sources per venue type, with extra weight for terraces and late opening hours.
- **Price estimate**: base rent per m² for the canton and room count (federal statistics), × the advertised-rent premium over paid rents (Winterthur), × city or urban/rural location, then hedonic steps for size (elasticity −0.15 against the typical size), construction period (federal statistics), condition, fittings (−10% to +25%), floor and lift, balcony, garden and view, and the report's own noise (−0.4% per dB above 50 dB), flyover, winter-sun and amenity signals. Purchase prices multiply annual rent by price-to-rent ratios calibrated so a typical 4-room flat (or 5-room house) reproduces the 2025 median sale price of each Zurich region; elsewhere the agglomeration and rural ratios apply. Ranges are ±12% for rents and ±15–20% for prices.
- **Sunlight**: solar position every 5 minutes on the 15th of each month and on the solstices and equinox, tested against a 1° horizon built from every building within 250 m (its real footprint and height) and terrain up to 20 km, from the chosen floor's eye height. Heights come from OSM `height` where mapped; otherwise, in Switzerland, from the storeys in the Federal Register of Buildings and Dwellings (3 m a storey plus 1 m); then OSM `building:levels`; then a typical height per building type. Each direction of the horizon remembers the building that forms it, so every minute of blocked sun is credited to a building.

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
  report.ts     fetch orchestration, overall score and highlights
  area.ts       area search, boundaries, ranking window and area queries
  areaScore.ts  scores every home in an area; official-noise refinement
  area.worker.ts, useAreaRanking.ts  worker pool and progress for the area ranking
  alerts.ts     alert signup requests
  billing.ts    Stripe config, embedded Checkout and the billing portal
  cache.ts      the shared lookup cache, with direct fallback
  register.ts   Swiss building register (storeys, footprints) around an address
  preferences.ts  preference catalogue, match scoring, saved addresses
  sunhours.ts, sunhours.worker.ts  height grid, sun samples and the WebAssembly sun-hours kernel
  shadowScene.ts  three.js buildings, sun light and shadows as a MapLibre custom layer
assembly/       AssemblyScript source of the sun-hours kernel (built to src/wasm/sunhours.wasm)
src/data/       bundled price statistics (prices.json)
src/components/ landing page, report sections, area ranking, alert form, charts and map
scripts/        update-price-data.py rebuilds prices.json from the official sources
worker/         Cloudflare Worker: alerts API and Durable Object, Flatfox scan, emails, Stripe billing, shared cache
```
