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
