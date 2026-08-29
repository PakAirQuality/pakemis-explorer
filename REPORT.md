# Report: PakEmis Explorer v2, map-first with Ask PakEmis

Repository: `/Users/rehanahmad/Desktop/pakemis-explorer`. Nothing under
`/Users/rehanahmad/Desktop/emissions` was created, modified or deleted; the release is read at
`data/releases/1.0.0rc42/` (fetched from `git show` at the rc42 fixpoint `bc1716d6`) and
`pakemis_query` is imported from `PAKEMIS_QUERY_PATH`.

## What was delivered, by step

| step | state |
|---|---|
| 1 API + tiles groundwork | `/v1/release` carries the ADM2 rows (152, 126 shape ids), the ten sectors, months by period, server-built labels, defaults and the agent block; `build_tiles.py --raster` writes the 78 visual-only grid PNGs and `bboxes.json`; `test_release_dims.py`. |
| 2 shell + design system + URL state | Tailwind v4 tokens, Inter + JetBrains Mono, `layout.tsx` with `NuqsAdapter`, one screen `page.tsx` (rail, sliding panel, map, right column), `/data`, `/r/[receipt]`, `lib/urlState.ts` (defaults resolved against `/v1/release`), `lib/requests.ts` (every body a pure function of the state; `stateFromRequest` the inverse), `lib/labels.ts`, `Frame`, `ReceiptFooter`, `EnvelopeTable`, `RefusalCard`; the seven v1 pages deleted. |
| 3 map | `ExplorerMap` with basemap (token or keyless style), the ADM1/ADM2/grid layer stack, feature-state paint from envelopes, hatch for bounded cells, the raster kept mounted at opacity 0, `Legend` (five real displays), `HoverTip`, `TimeRail`, `ScopeChips`, `useMapInteractions`, mobile sheet. Screenshots `03`–`07`. |
| 4 detail + panels | `DetailCard` (province, bounded district with lineage table, grid cell), `ContextPanel` (national KPI, sector bars, S minus L, annual series), Explore / Inventory / Compare / Evidence panels, ECharts bars with sector palette and decals. Screenshots `08`–`10`; `DetailCard.test.tsx` walks every text node for decimals. |
| 5 Ask PakEmis, API | `api/pakemis_api/ask/`: 12 tools (11 from `models_gen.MODELS` with `$defs` inlined and dims-enriched descriptions, plus `set_map_view`), cached system prompt with a dims appendix, the loop over an injectable `ModelClient` (`AnthropicModel` uses `messages.stream`, adaptive summarised thinking, effort), `render_multi` for `{{result_k_cell_n}}` with `<cite>` wrapping and the bare-number gate, in-process memory, limits and per-IP bucket, `POST /v1/ask` as SSE, 503 without the key. `test_ask.py`: 16 goldens through the agent, correction then withholding, multi-result, map tool valid/invalid/district, downloads, turn cap, memory, 503. |
| 5 Ask PakEmis, web | `web/src/components/ask/`: `useAskStream` (POST + `ReadableStream` SSE parser handling split chunks, `\r\n`, multi-line data, keep-alive comments; 503 -> disabled, 429 -> error card), `timeline.ts` (event log -> cards), `store.ts` (`localStorage['pakemis.ask.<id>']`, restored from `?c=`), `AskDock`, `ReasoningTimeline`, `ThinkingCard`, `ToolCard` (humanised name, input chips through the labels, result rows `display unit` with group labels and interval badge, limitation chips, `ReceiptFooter` by receipt, "Show on map" via `stateFromRequest`), `AnswerBubble` (`<cite>` -> underlined numbers that highlight and scroll to their card and cell), `UsageLine`, `Composer` (Enter / Shift+Enter, suggestions from the scope, `@` mentions from map clicks via `mentions.ts`), `DisabledCard` (moved from `shell/`). `map_action` applies to the URL as it arrives and shows a chip. `ask.test.tsx`: 7 tests over a scripted SSE body. |

## Verification (this step)

```
cd web && npx vitest run        5 files, 31 tests passed (ask.test.tsx 7, DetailCard 5, urlState, paint, smoke)
cd web && npm run lint          0 errors, 2 pre-existing warnings (DetailCard useMemo deps, BarChart effect deps)
cd web && npm run build         clean: / 24.9 kB (179 kB first load), /data, /r/[receipt]
```

The scripted SSE body used by `ask.test.tsx` is built from the API's real event shapes: the
`adm1_punjab_agriculture` golden (receipt `8328128a5bd1eca6b1a29ad79cf6d910`, cell
`123.3050 Mt CO2e AR5`, `limitations_hit: [lulucf_excluded]`, the compacted context), the
`set_map_view` call and `map_action` of `test_set_map_view_valid_emits_map_action`, the
`refuse_ar6_adm2` golden's refusal (`not_estimated` / `NotEstimated` / `ar6_adm2_ne` /
"AR6 CO2e is not carried at ADM2"), an `answer` with two `<cite k="1" cell="0">` tags and a
`done` with usage. The body is serialised as sse-starlette writes it (`\r\n`, a `: ping`
comment) and fed to the reader in 37-byte chunks. The test asserts the arrival order
(thinking, tool, tool, map action, tool + refusal, answer, usage), that the cited number equals
the tool result's `display`, that hovering a cite highlights its card and cell, the
`RefusalCard`'s `error_class` and `limitation_id`, `setState` called with
`{geo, level, period, sector}` for the map action and with `{c: <id>}` after `done`, the
localStorage log, the usage line as received, "Show on map" through `stateFromRequest`, and that
every decimal on screen is one of the strings the stream carried. Separate tests cover the
parser across chunk boundaries, the 503 -> `DisabledCard` path (API reason + the contract's
functions), the release-disabled path (no request made), restoration from `?c=`, and the
`bare_numbers` error card with the correction notice.

Browser (production build on :3000, API on :8000 without the key, keyless basemap style
exported in the shell): `/?ask=1` renders the dock with the 503 reason
"ANTHROPIC_API_KEY is not set in the API's environment", the eleven functions and the disabled
composer: `web/docs/screenshots/13-ask-disabled.jpg`. `document.visibilityState` was
`"hidden"` in the automation window, so the map canvas stayed at its background colour there
(MapLibre renders on animation frames); the dock does not depend on it.

## Defects found while building (this step)

1. `ReceiptFooter` required a whole envelope; the dock's tool results carry the receipt and the
   cells only. The footer now accepts `receipt` alone and replays it through
   `GET /v1/receipt/{r}` when the drawer is opened.
2. The conversation restore effect first keyed on the hook's own id and would have wiped a
   fresh turn between `done` (id in hand) and the URL write (`c` param); it now keys on the
   URL parameter changing to an id the hook did not just mint.

## What is incomplete, and why

- **Visible-window map check pending.** Every browser session of this build ran with
  `document.visibilityState === "hidden"`, where MapLibre never renders. Basemap, choropleth,
  legend, hover and the raster need one look in a visible Chrome window.
- **No live model turn.** `ANTHROPIC_API_KEY` was not in the shell; the two live checks of the
  plan (Punjab agriculture with a `map_action`, and "AR6 by district" refusing with
  `ar6_adm2_ne`) and screenshots `11`–`12` wait for `export ANTHROPIC_API_KEY=...` in the API's
  shell. The SDK's acceptance of the `claude-sonnet-5` id is likewise unverified live
  (`PAKEMIS_ASK_MODEL` overrides it).
- No authentication, users, PostgreSQL, deployment, object storage or CDN; conversations live
  in the API process (24 h) and in the browser.
- Emissions-repo follow-ups (gated, not blocking): `data/method_registry.csv` into the source
  manifest; `{{result_k_cell_n}}` adopted by `placeholders.py` once the agent proves it.

## How to run

```
export PAKEMIS_QUERY_PATH=/Users/rehanahmad/Desktop/emissions/src
export ANTHROPIC_API_KEY=...                 # optional, API shell only: enables Ask PakEmis
make verify && make api                      # :8000
make tiles && make raster                    # once per release
cd web && npm run build && npm run start     # :3000  (NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in web/.env.local; no map without it)
```

## Verification pass of 2026-08-30 (visible rendering, by the maintainer's session)

The map never rendered in any earlier automation session and the cause was NOT the hidden
window: MapLibre GL 6 locates its worker with `new URL("./maplibre-gl-worker.mjs",
import.meta.url)`, which Next's bundler rewrites to a chunk URL where no such file exists, so
the worker never started and no source ever loaded (no error is raised). Fixed by vendoring
the worker into `web/public/vendor/` (`scripts/vendor-maplibre-worker.mjs`, run on install,
dev and build) and `setWorkerUrl`. Two smaller defects fixed on the same pass: the map
container had zero height (`maplibre-gl.css` is imported after Tailwind and its
`position: relative` beat `absolute`), and `rasterFile` looked up TILES.json frames without
their `raster/` prefix. `?hidden=render` is a development aid that swaps requestAnimationFrame
for a timer and reports the document visible, so automation windows can screenshot the map.

Seen rendered and checked against the API (screenshots in `web/docs/screenshots/`):
ADM1 choropleth with the legend's five real displays and the Punjab hover `228.7168 Mt CO2e
AR5` (03); ADM2 for power hatched as bounded intervals (04); AR6 at ADM2 refused by name in
the legend slot, national AR6 KPI intact (05b); FY2020-21 refused (`GrainUnavailable ·
grid_not_tabular`), rail tagged national only, national KPIs for that year (06); the CH4
January raster over Punjab (05) and a grid-cell click reading `0.35006860 Gg` through
`get_grid_cell` with its receipt (05c); the Lahore district card with the interval headline
`[12.2565, 12.2769]`, limitation chips, lineage and receipts (09); the Ask dock on
`claude-sonnet-5` (agent enabled once `ANTHROPIC_API_KEY` is exported to the API's shell).

The one live model turn attempted returned HTTP 401 "API key is invalid" from the provider
for the key exported in the maintainer's shell; the dock rendered it as a `model_error` card
(12). A valid key is needed for the two live checks (a cited answer that moves the map; a
refusal for AR6 by district); the same paths are covered by the FakeModel tests.

## Mapbox globe basemap and the visible Ask entry (2026-08-30, second pass)

The map engine is now Mapbox GL JS v3 (`mapbox-gl` 3.29, `^3.19`), the same as hawanama.org:
`mapbox://styles/mapbox/streets-v12` with hawanama's `MapRefactored.tsx` flags (`maxPitch 45`,
`dragRotate false`, `touchPitch false`, `pitchWithRotate false`, `renderWorldCopies false`,
`antialias false`, no `projection` so v3's globe applies), our layers inserted before the
style's first `symbol` layer so labels stay above the choropleth, Mapbox's own attribution
control with our custom line and the wordmark bottom-left. `maplibre-gl`, the worker vendoring
script and its `dev`/`build`/`postinstall` hooks are gone; `pmtiles` stays as the server-side
reader. Everything else ported 1:1: `promoteId`, feature-state paint, the hatch `fill-pattern`,
the `image` raster source (`updateImage`), `fitBounds`, layer-scoped events, `?hidden=render`.

Two facts found while building, neither in the plan:

- **Mapbox GL JS renders nothing without a valid token, whatever the style.** v2+ authenticates
  every map load (`Map#_authenticate`) and `_revokeAuth` clears the canvas and fires "A valid
  Mapbox access token is required" even for an OpenFreeMap style URL. The plan's keyless
  fallback (`NEXT_PUBLIC_BASEMAP_STYLE` without a token) therefore cannot exist under this
  engine and is not worked around: without the token no map is created, a one-line notice says
  why, and the legend, panels and dock keep working (the envelope numbers never came from the
  map). `NEXT_PUBLIC_BASEMAP_STYLE` is now a style override on top of the token.
- **streets-v12 declares no fog**, so v3's globe showed a bare edge rather than the atmosphere
  the plan expected as a default. The ops dashboard's fog (`#ffffff` / high `#b8d4e8` / space
  `#d8f2ff`, horizon-blend 0.08) is set once on load when the style has none; the 3D toggle
  adds terrain and the tilted camera on top, and switching it off keeps the atmosphere.

PMTiles reach Mapbox GL (which has no `addProtocol`) through two Next route handlers on the
same origin: `GET /tiles/{adm1|adm2|grid}` returns TileJSON 3.0.0 with absolute tile URLs
built from the request origin (forwarded host honoured) and the archive's zooms, bounds and
`vector_layers`; `GET /tiles/<name>/{z}/{x}/{y}.mvt` returns the tile bytes exactly as stored
with `Content-Type: application/vnd.mapbox-vector-tile`, `Content-Encoding: gzip` when the
archive's `tileCompression` is gzip (the directory walk mirrors the package's `getZxyAttempt`
without its decompression), 204 for a tile the archive does not hold, a year of immutable
cache, and 404 for any other name. Next serves `public/` files before dynamic routes, so
`/tiles/TILES.json`, `bboxes.json`, `*.pmtiles` and `raster/*` are unchanged (checked with
curl). `web/src/lib/pmtilesServer.test.ts` runs against the real archives.

Discoverability: an accent "Ask PakEmis" pill at the map's top-right (the rail button stays),
a one-time hint chip under the scope chips remembered in `localStorage`, and a README section
"Talking to the agent". `view3d` joined the URL state.

Verification (Chrome at 1440 px, `?hidden=render`, API on :8000):

```
cd web && npm run build     clean: /tiles/[name] and /tiles/[name]/[z]/[x]/[y] as dynamic routes
cd web && npx vitest run    7 files, 42 tests (pmtilesServer 7, AskEntry 3, urlState +1, the rest as before)
cd web && npx eslint        0 errors, the same 2 pre-existing warnings
curl -s localhost:3000/tiles/adm1            TileJSON, tiles ["http://localhost:3000/tiles/adm1/{z}/{x}/{y}.mvt"], zoom 0-8, Pakistan bounds
curl -sI localhost:3000/tiles/adm2/6/44/26.mvt   200, vnd.mapbox-vector-tile, gzip, immutable
```

Seen rendered with the token: the globe with the atmosphere halo and streets-v12 labels above
the choropleth (`14-globe.jpg`, taken at zoom 2.1 by script because the UI keeps hawanama's
`minZoom 3.5`, where the globe fills the viewport; `14b-globe-national.jpg` is the UI's own
national view at 3.5, curvature visible, `getProjection().name === "globe"`); Punjab hover
`228.7168 Mt CO2e AR5`; `?level=adm2&sector=power` hatched as bounded intervals (Lahore's
feature-state `[0.5865, 0.5866]`, bounded); `?level=grid&gas=CH4&month=202401&cam=73.5,31.2,6.4`
shows the raster below the labels and a cell click reads `0.04928880 Gg` through
`get_grid_cell` with its receipt; `?view3d=1` at zoom 7.2 over the Karakoram foothills has
`mapbox-dem` terrain, pitch 30, bearing -10 and fog with the choropleth draped
(`15-3d-terrain.jpg`); the Ask pill opens the dock (`ask=1`). Every `api.mapbox.com` and
`events.mapbox.com` request carries the token only as the `access_token` query parameter; as a
`NEXT_PUBLIC_` variable it is compiled into the client bundle by design and appears in no log,
screenshot or commit. Without the token (the server started with the variable empty) the notice
shows and no map is created; the legend and panels are unchanged.

Not verified: a live model turn (no valid `ANTHROPIC_API_KEY`; the dock showed the disabled
card), and Mapbox's per-load billing on the user's token, which this engine incurs on every
page load.

## The territories at province level and the first-visit explainer (2026-08-30, third pass)

Decision on Gilgit-Baltistan, Azad Kashmir and Islamabad Capital Territory: they are in the
numbers (the release's fifth ADM1 unit `Other`, `has_polygon: no`) but were drawn flat grey at
province level because the boundary file has three polygons where the envelope has one cell.
The map now paints that one cell on each member polygon, verbatim, with `shared: true` and
`shared_with: "Other"` in feature-state and a dotted outline layer (`adm1-shared`) above
`adm1-line`; nothing is divided or apportioned, and the hover ("part of the release's 'Other'
unit — … together"; "coverage differs by sector for these territories — see About"), the
legend's dotted swatch and the detail card's kicker all say the cell is shared. The members
are derived (`src/lib/geography.ts`: every ADM1 polygon in `bboxes.json` that is not a
`has_polygon: yes` row), never listed; clicking a member selects `geo=Other`, the API answers
`geography_ids: ["Other"]` (checked live: `1.9972 Mt CO2e AR5` for FY2023-24, the same display
the hover shows), and `fitBounds` unions the three boxes. ADM2 is unchanged: each of their
districts already had its own cell.

The explainer is `WelcomeModal` (four panels with a stepper, one scroll under 768 px), shown
until `localStorage['pakemis.intro.dismissed'] === "1"` and re-openable from the rail's "?"
and from `/about`. It quotes `paper_national/short_summary.txt` verbatim, the release's
reporting period and note, LULUCF status and note, GWP bases, configuration labels and notes,
the seven structural limitation texts, the contract's functions and the agent's status, all
from `/v1/release`; the one number it prints is the national total's `display` from the same
context envelope the right column uses, with its receipt. `/about` is the prose version plus
the territories' sector coverage written from `data/province_shares.csv`'s own notes (no
numbers), what `Other` is, the licences (incl. `odbl_note` and the carve-outs), a vocabulary
note and links. `src/__tests__/vocabulary.ts` holds the manuscript outline's "avoid" list;
`WelcomeModal.test.tsx` and `about.test.tsx` assert no phrase appears and that every decimal on
screen is a mocked envelope display (or a string of the release itself: the id, `CC-BY-4.0`).

One thing the brief summarised more coarsely than the source: `province_shares.csv` gives the
`Other` column a share for the railway route model (Islamabad trackage), for industrial and
captive gas (Islamabad's part of the SNGPL franchise) and a large one for domestic aviation
(Islamabad International plus Gilgit, Skardu, Muzaffarabad and Rawalakot); power, fugitives and
cement are zero there. `/about` follows the file's notes.

### The explainer redesigned as a product hero (same day)

The user reviewed the first explainer and asked for a substantially different treatment: make
people care before explaining anything. `WelcomeModal` is now four screens on a warm off-white
surface (`#faf8f4`, `max-w-3xl`, `p-10`, an "01 / 04" counter with a thin progress bar, arrow
keys and Escape, one scroll under 768 px): "A public record of Pakistan's emissions." with the
dek and a facts row ("Nine fiscal years · Monthly detail · District-level data ·
Source-traceable"; the count is a word derived from `dims.dim_period`, so no digit) and the
primary "Explore the project →"; "From the national picture to individual districts."; "Every
number has a paper trail." with the example line "Pakistan emitted 452.34662 Mt CO₂e in
FY2023-24 — Explore where those emissions came from →" and "View source →" opening the
national envelope's evidence drawer; "Check it. Reuse it. Improve it." with "Start exploring →",
"Ask a question" (`ask=1`) and the About link. The release version, the date range, the
configuration label, the receipt hash and the replay explanation left the modal (screen 4's
footnote names the release; `/about` keeps the rest). The visual on screens 1 and 2 is
`TrendChart` (`components/ui/TrendChart.tsx`): an ECharts area over the `get_timeseries`
envelope (`seriesBody`, annual, reference configuration, reported GWP), first and last points
labelled with their `display` strings, the reference year in amber, a skeleton while loading.

Two rules bound the number: the user wrote "452.3", but the client may not round, so the
display string is printed whole and split typographically (`452` large, `.34662` lighter, one
string in the DOM, `splitDisplay`); the unit is "Mt CO₂e" only as typography over the
envelope's "Mt CO2e …" unit (`unitText`), any other unit verbatim. `WelcomeModal.test.tsx`
asserts screen 1 contains neither the version, "receipt", "AR5", "Inventory reference" nor the
number, that the number appears from screen 3 on and equals the mocked display, that "View
source" opens the drawer, and the avoid-list check on every screen. Also in this commit:
`empty_answer` joined the dock's error-title vocabulary, and the README's Run block gained
`google-genai` and the `api/.env` sourcing note the API agent could not edit.

A note on the browser walk: `next build` while `next dev` was serving the same `.next` left the
dev server serving an unstyled "Loading release…" shell; restarting the dev server fixed it.
Mapbox ignored the automation tool's synthetic clicks in the hidden window (Punjab as well as
Gilgit-Baltistan), while `mousedown`/`mouseup`/`click` dispatched on the canvas selected both
(`geo=Other` with the three members outlined); hover worked either way.


## Stage 0, the API half (2026-08-30): the Explorer made merge-shaped

The merge plan for hawanama-main asks three mechanical changes of the API before it can be a
fourth app of that monorepo: routes under `/api/v1/emissions`, tiles served by the API rather
than by Next route handlers, and a Cloud Run image built the way hawanama builds its own.
All three are in; the web half (static export, `NEXT_PUBLIC_API_BASE`, `/data?receipt=`,
`firebase.json`) was done alongside by the web side.

**Prefix.** One `APIRouter` carries every route and is mounted twice: under `/api/v1/emissions`
(the canonical paths, the only ones `openapi.json` names) and under the legacy `/v1` (out of the
schema). A pure-ASGI headers middleware marks the alias with `Deprecation: true` and
`Link: </api/v1/emissions/...>; rel="successor-version"`, and adds hawanama's baseline headers
(HSTS, nosniff, Referrer-Policy) everywhere. `POST /ask` and the download links the agent hands
back follow the prefix. `/healthz` stays at the root for the container's health check and also
answers under the prefix. A second small middleware answers HEAD as GET without the body:
FastAPI's `get` routes reply 405 to HEAD, and `curl -I` on a tile is the natural deployment check.
`GZipMiddleware(minimum_size=1024)` compresses the JSON (`/release` is 300 KB) and leaves the SSE
stream and the already-gzipped tiles alone; `ALLOWED_ORIGINS` (comma list, `*` by default)
replaces the hard-coded CORS.

**Tiles.** `api/pakemis_api/tiles.py` is a port of `web/src/lib/pmtilesServer.ts` to Python over
`seek`/`read` range reads, without the `pmtiles` package: the 127-byte v3 header, gzip'd varint
directories (ids delta-coded, run lengths, offsets), the leaf walk, Hilbert tile ids. A test
cross-checks tile ids and tile bytes against the `pmtiles` package when it is installed (it is,
here) and skips otherwise. Routes: `/tiles/meta` (TILES.json), `/tiles/bboxes`,
`/tiles/{adm1|adm2|grid}` (TileJSON 3.0.0, absolute URLs on the forwarded origin),
`/tiles/{name}/{z}/{x}/{y}.mvt` (the stored bytes with `Content-Encoding: gzip` passed through,
immutable, 204 when absent, 404 for an unknown name), `/tiles/raster/{config}/{gas}/{frame}.png`.
The archives moved into the release payload: `tiles/build_tiles.py` writes
`data/releases/<v>/tiles/` (`Settings.tiles_dir`) and still copies to `web/public/tiles` for one
release; the Service verifies every output present against `TILES.json`'s digests at start and
refuses a tampered archive exactly as it refuses a tampered table (a test flips one byte).

**Container and build.** `api/Dockerfile` (python:3.11-slim, non-root `pakemis`, port 8080,
built from the repository root; `.dockerignore` keeps `api/.env`, `web/` and the payload out),
`api/start.sh` (pull `gs://$PAKEMIS_RELEASES_BUCKET/releases/<v>/` through `api/pull_release.py`
when the directory is absent; `verify_release.py`; one uvicorn worker with `--proxy-headers`),
root `cloudbuild.yaml` for the service `pakemis` (build, push to Artifact Registry, `gcloud run
deploy` with `--set-secrets GEMINI_API_KEY`, 2 CPU / 2 GiB, concurrency 20, timeout 300,
min-instances 1), `make vendor | docker-build | docker-run | push-release | deploy`.

The one design decision worth recording is the query core. The image has no emissions checkout,
and the rule until now was "no copy of `pakemis_query`". The copy is now explicit and pinned:
`scripts/vendor_query_core.py` reads `src/pakemis_query` through `git show <ref>:...` (so a dirty
working tree cannot leak in) into `api/vendor/pakemis_query`, and `VENDOR.json` records the
repository, the commit (631b95f0), every file's sha256 and one digest; `test_vendor.py` proves the
copy byte-equal to that commit whenever the checkout is on the machine. The copy is committed
because Cloud Build sees only this repository. Development is unchanged: `PAKEMIS_QUERY_PATH`
overrides, and the default prefers the checkout when it exists (the golden files sit beside it)
and falls back to the vendored copy only when it does not, which is the image's case.

**Verification.** `PAKEMIS_API_LAZY=1 pytest api/tests`: 97 -> 124 passed (test_prefix.py 10,
test_tiles.py 14, test_vendor.py 3); `api/export_openapi.py --check` fresh. `docker build -t
pakemis -f api/Dockerfile .` (598 MB); `docker run -p 8080:8080 -v $PWD/data/releases:/app/data/
releases:ro -e PAKEMIS_RELEASE_VERSION=1.0.0rc42 pakemis`: the log shows the 44 tables, 3 products
and 53 fetched files verified, then `GET /api/v1/emissions/release` 200 (version 1.0.0rc42, the
agent disabled since no key is passed), `HEAD /api/v1/emissions/tiles/adm2/6/44/26.mvt` 200
`application/vnd.mapbox-vector-tile` `content-encoding: gzip` immutable, `/tiles/meta` the
TILES.json with 78 raster files, `/tiles/adm1` with `X-Forwarded-Host: pakemis.web.app` giving
`https://pakemis.web.app/api/v1/emissions/tiles/adm1/{z}/{x}/{y}.mvt`, `/v1/release` with
`deprecation: true`, the raster PNG 63,587 bytes; `/app/api/.env` absent in the container; the
process runs as `pakemis`.

**Not done here.** `web/src/types.gen.ts` must be regenerated (`make types`) from the new
`openapi.json`; the bucket `pakemis-releases`, the Secret Manager entry and the Cloud Run service
do not exist yet (`cloudbuild.yaml` is written, not run); `docker-compose.yml`'s web service still
names the old variable `NEXT_PUBLIC_PAKEMIS_API` (port updated to 8080); the `/v1` alias and the
`web/public/tiles` copy are both due for removal after one release.

## The introduction as a data product, Result details, and two-decimal presentation (2026-08-30)

**The four screens.** `WelcomeModal` follows the user's brief verbatim: *Pakistan
greenhouse-gas emissions, 2015–16 to 2023–24* (the range from the release's fiscal periods), the
facts line "9 fiscal years · monthly estimates · district-level data · documented sources" (the
count is the number of fiscal period rows) and the national series as a figure titled "Pakistan
greenhouse-gas emissions" with the unit line "Million tonnes CO₂e (AR5), excluding land use"
(the cell's `unit_words`, else `unitWords`, plus `context.lulucf`); *Explore emissions across
place, time and sector* with the four dimensions as a definition list and "Emissions by sector,
2023–24"; *Query the dataset* with the example question and a live transport envelope
(`transportSeriesBody`: `get_timeseries`, `sectors: ["transport"]`, annual, reference
configuration) drawn as "Transport emissions by year", a skeleton while it loads and the API's
refusal by name if it refuses; *Open data, methods and code* with the definition list, the
versioning line, "View methodology" (`/about#methods`, the anchor on the methods section, which
keeps the version string in its header) and "Open Explorer". Header `PAKEMIS · 1 of 4 · ×`,
four 6 px dots and no progress fill; Skip / Back (pages 2–4) / Next; the title at 28 px. No
eyebrows, chips, captions, receipt lines, version footnote, map-levels note or Ask button; the
only "?" on any screen is the example question. `TrendChart` gained `subtitle` and
`showReceipt` so the panels keep their built subtitle and source line. Every screen was
measured in the headless render at 1440×779: the screen area's `scrollHeight` equals its
`clientHeight` on all four (the modal is 597–673 px tall), so nothing scrolls.

**Result details.** The receipt hash left the collapsed footer: `ReceiptFooter` is one quiet
"Result details ›" button (title "Sources · filters · calculation · API request") opening the
drawer with **Sources** (the old Evidence), **Filters** (the envelope's context through the
labels: period short, configuration label with its id, GWP basis, geography, spatial view,
basis, defaults applied), **Calculation**, **API request**, **Download**, **Cite**; the foot
carries "Result ID <full receipt>" with Copy and "Reproduce this result →" (`/data?receipt=`).
Frames pass their labels through so `/data` (outside the Explorer context) names ids too; the
Ask dock's tool cards use the same footer (receipt-only mode still replays on open); `/data`'s
replay box says Result ID. One finding from checking the curl line against the live API:
posting the canonical request verbatim returns a *different* Result ID (0e5b0195… for the
drawer's 93aa968b…), because the fields the contract filled by default (`basis`,
`geography_level`, `spatial_view`, listed in `defaults_applied`) arrive explicit, no default is
applied, and the request canonicalises differently. `apiCallOf` therefore posts `replayBody`
(the canonical JSON minus `defaults_applied` and the keys it names, at every level: a
timeseries' `query`, a compare's `left`/`right`), which the API confirmed reproduces the same
receipt for a query (93aa968b…) and a timeseries (39d71a7c…); the tab says which fields were
left out and why.

**Two-decimal presentation.** The API now mints `display_short` (the exact decimal rounded
half to even to two places, `<0.01` for a non-zero value that would print 0.00, intervals
end by end) and `unit_words` on every cell, described by `/release.rounding.presentation`.
The web reads them and derives nothing: `shown(cell)` = `display_short ?? display`
(`lib/envelope.ts`) is what every default rendering prints — the national KPI and gas chips,
the sector bars, the legend ranks and raster anchors, the hover tip, the trend figure's labels
and tooltip, the detail card's headline and chips, the evidence panel's stream total, the
EnvelopeTable's Value column, the tool cards (`display_short` on the `tool_result` cells; a
cite's text is shown as the server rendered it), and the introduction's three figures. The
contract's `display` and the `exact` decimal stay one step away: in the title of every
headline, in the table's "full precision" toggle (the column switches to `display`, the Exact
and Rows columns appear), and in Result details' Calculation tab, which lists every cell as
Shown / Published value (contract precision) / Exact. Live, against the restarted API: the KPI
reads 452.35 (title "452.34662 Mt CO2e AR5 (contract precision) · exact 452.346624380…"), the
gas chips 248.75 / 42.14 / 161.46, the legend 2.00 · 30.85 · 56.06 · 134.73 · 228.72, the
Punjab hover 228.72, Lahore's district headline "[12.26, 12.28]" (title "[12.2565, 12.2769]"),
the grid cell 1.16 Gg (title "1.16181505 Gg"), the district legend "[2.18, 2.19]" … "[33.91,
33.92]", and the body text of the shell carries no decimal of three or more places; the
KPI's Result details shows 452.35 · 452.34662 · 452.346624380000000000 side by side
(screenshots 21 and 20b).

**Tests and checks.** `WelcomeModal.test` rewritten (the four titles verbatim, no "?"
eyebrows, no receipt / Result ID / release id / "Ask" / "FY" on any screen, Back absent on page
1, Next on 1–3 and Open Explorer on 4 beside View methodology, only envelope strings as
decimals, the transport refusal card, the mobile scroll); `ReceiptFooter.test` (no hex
collapsed, six tabs, the Result ID and replay link, the Filters rows, the API request tab's
JSON and curl with nothing key-like, `apiCallOf`'s routes and `replayBody`, the receipt-only
replay); `presentation.test` (`shown`, the table's default and full-precision modes, the
Calculation tab's precision table, `unit_words` preferred); the decimal audits in DetailCard,
WelcomeModal, TrendChart and ask accept a rendered decimal that equals a cell's
`display_short` or its `display`, and the fixtures carry two-decimal shorts. 85 tests green,
`next build` green, ESLint clean (two pre-existing warnings). Screenshots 16, 16b, 16c refreshed
and 16d, 20, 20b, 21 added from the headless render.

Not done: the Ask dock's tool card was not exercised against a live Gemini turn (its
`display_short` path is covered by `ask.test`); `next build` again left the running dev server
answering 500 until restarted (as recorded above).
