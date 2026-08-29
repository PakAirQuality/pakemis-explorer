# PakEmis Explorer

The public frontend of PakEmis, Pakistan's national greenhouse-gas inventory (ten sectors,
FY2015-16 to FY2023-24, LULUCF excluded), the deterministic query API under it, and Ask
PakEmis, a tool-calling agent whose every number is a server-inserted envelope value.

**One numerical truth layer.** The map, the cards, the downloads, the API and the agent are
different views of the same verified release. The rule this repository enforces at every layer:

- Every number shown anywhere is a `display` string from an API envelope that carries a
  receipt. The web app computes nothing: no sums, no rounding, no percentages, no unit changes.
  A cell's `value` may only size a bar or shade a polygon.
- The API adds no number either. It returns `pakemis_query`'s Envelope unchanged (values with
  `exact` beside `display`, the context bar, the calculation SQL, provenance digests, unallocated
  mass, limitations hit, citation, `result_sha256`, receipt).
- A request the release cannot answer is refused by name (HTTP 422 with the error class and
  the `limitation_id`), never approximated. The agent reports refusals verbatim.
- A receipt is replayed, never served from a stored result. `GET /v1/receipt/{r}` recomputes the
  stored canonical request and fails loudly if the receipt no longer reproduces.
- Map tiles and rasters carry geometry and identifiers only; values are painted through Mapbox GL
  `feature-state` from `/v1/query/emissions` envelopes; the grid raster is visual shading and
  every grid value shown comes from `get_grid_cell`.
- The agent calls only the release's eleven typed functions (plus `set_map_view`, which runs no
  query). Numbers reach its prose only as `{{result_k_cell_n}}` placeholders the server fills
  from the envelope; a draft with a bare decimal is corrected once and then withheld.
- The API refuses to start unless the pinned release verifies byte-for-byte.
- The Mapbox token and `ANTHROPIC_API_KEY` are read from the environment, never printed,
  hard-coded or committed.

## Layout

```
data/fetch_release.py   copy outputs/semantic/*, the manifest, geometry and the two grid cubes
                        out of the emissions checkout at a git ref (never touching its tree)
data/verify_release.py  every table digest vs semantic_release.json; products vs the manifest;
                        every byte vs FETCH.json; the pin vs RELEASES.md
data/releases/<v>/      the payload (gitignored) + FETCH.json (committed)
RELEASES.md             the pinned version and its two digests
api/                    FastAPI over pakemis_query (imported from PAKEMIS_QUERY_PATH, never copied)
api/pakemis_api/ask/    Ask PakEmis: tools from the generated request models, the system prompt,
                        the loop over an injectable model client, the placeholder renderer, limits
api/openapi.json        committed schema; web/src/types.gen.ts is generated from it
tiles/build_tiles.py    ADM1, ADM2 and 0.05 degree grid PMTiles keyed by name / shape_id / cell_id;
                        bboxes.json; --raster: visual-only shading PNGs of the two grid cubes
web/                    Next.js 15 + TypeScript, a static export (next.config.ts: output
                        "export"), map-first: one screen (/) whose state lives in the URL
                        (lib/urlState.ts), request bodies as pure functions of it
                        (lib/requests.ts), Mapbox GL JS v3 choropleth painted through
                        feature-state (components/map; the tiles reach it as TileJSON from the
                        API's /tiles routes), detail card and rail panels (components/detail,
                        components/panels), the Ask dock (components/ask), /data (receipt replay
                        at /data?receipt=<hash>, downloads, digests, evidence browser), /about
firebase.json           Firebase Hosting for web/out: the rewrite /api/v1/emissions/** -> Cloud Run
                        service `pakemis`; .firebaserc names the project and the `pakemis` target
```

## The screen

`/` is one map-first screen: a 48 px rail (Explore, Inventory, Compare, Evidence, Data, Ask),
a sliding 370 px panel, the full-bleed map with floating scope chips, the Ask PakEmis pill,
raster / 3D / frame buttons, time rail, legend and context pill, a detail card that slides in
over the map's right edge, and a right column that is the national context panel or, with
`ask=1`, the Ask dock. Every control reads and writes the URL (`level`, `period`, `month`,
`sector`, `gas`, `config`, `gwp`, `view`, `geo`, `cell`, `panel`, `ask`, `c`, `cam`, `raster`,
`view3d`), so a copied URL opens with identical receipts.

The map is hawanama.org's: Mapbox GL JS v3 rendering `mapbox://styles/mapbox/streets-v12`
with hawanama's flags (maxPitch 45, no drag-rotate, no world copies) and v3's default globe
projection, so the national view is a globe with the atmosphere halo below zoom ~5 and flattens
as you zoom into a province; the choropleth, hatch and grid raster sit below the style's label
layers. The 3D button (`view3d=1`) applies the ops dashboard's recipe: `mapbox-dem` terrain
(exaggeration 1.5 tapering to 1.0), fog, pitch 30, bearing -10, with the choropleth draped. Spatial products exist for FY2023-24 only: other years drive national numbers and
show the typed refusal in the legend's place.

First visit: a four-screen explainer (`WelcomeModal`, a product hero rather than
documentation: what is this, what can I explore, why should I trust it, what makes this open)
opens over the screen until it is dismissed (`localStorage['pakemis.intro.dismissed']`), and
re-opens from the "?" on the rail's brand square or from `/about`, which carries the
methodology prose (what "emissions data" means here, how to read the map, the territories'
sector coverage, the licences, a vocabulary note). The explainer's visual is the national
timeseries envelope drawn as an area chart (values size the shape; only the first and last
points are labelled, with their `display` strings); the one number in its copy, from the third
screen on, is the national total's `display` printed whole with the integer part large and the
fraction lighter (typography, never rounding), with a "View source" that opens the envelope's
evidence drawer; the facts row is words ("Nine fiscal years", counted from the dims). Tests
assert screen 1 carries no version, receipt, GWP or configuration string, that every decimal
on any screen is an envelope display, and that no phrase from the manuscript's "avoid" list
appears.

The territories at province level: the release's ADM1 table has one row without a polygon
(`has_polygon: no`, named `Other`) while the boundary file draws Gilgit-Baltistan, Azad
Kashmir and Islamabad Capital Territory separately. `src/lib/geography.ts` derives the
members (the drawn ADM1 polygons no province row claims; nothing is hard-coded), the map
paints the row's one cell on each member verbatim with a dotted outline (feature-state
`shared`, `shared_with`), the hover and legend say the cell is shared, and clicking a member
selects `geo=Other`, the release's own id, which the detail card and the API answer as one
unit. Coverage of the three differs by sector; `/about` says how.

## Fetch and verify a release

```
make fetch EMISSIONS=/path/to/emissions REF=HEAD   # writes data/releases/<version>/ and FETCH.json
make verify                                         # exit 0, or names the first mismatching file
```

`--zenodo URL` is a declared placeholder: the manifest's DOI slots are empty, so no deposit
exists to fetch. When one does, `RELEASES.md` gains a row with the same two digests.

## Run

```
export PAKEMIS_QUERY_PATH=/path/to/emissions/src   # default: /Users/rehanahmad/Desktop/emissions/src
make api      # http://localhost:8000  (docs at /docs; GET /v1/release shows the context bar, dims,
              # labels, defaults and the agent block)
make tiles    # once per release: PMTiles + bboxes.json into web/public/tiles (needs tippecanoe)
make raster   # once per release: 78 grid-shading PNGs (2 configurations x 3 gases x 12 months + annual)
              # into web/public/tiles/raster; visual only, every value shown comes from get_grid_cell
make web      # http://localhost:3000; the page calls the API at NEXT_PUBLIC_API_BASE (default
              # http://localhost:8000/api/v1/emissions; the old NEXT_PUBLIC_PAKEMIS_API origin still
              # resolves for one release, with the prefix appended). CORS is open on the API, so
              # nothing is proxied: every route, tile and raster is fetched from the base directly.
              # basemap: NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in web/.env.local (gitignored, never committed)
              # renders Mapbox streets-v12 on v3's globe. Mapbox GL JS v3 authenticates every map
              # load and renders NOTHING without a valid token, whatever the style, so there is no
              # keyless map: without it the screen shows a one-line notice and no map (legend, panels
              # and the dock still work). NEXT_PUBLIC_BASEMAP_STYLE=<style URL> overrides the style
              # (still billed to the token). The PMTiles reach the browser as TileJSON from the
              # API ({base}/tiles/<adm1|adm2|grid>, tiles at {base}/tiles/<name>/{z}/{x}/{y}.mvt);
              # TILES.json is {base}/tiles/meta, bboxes.json {base}/tiles/bboxes and the rasters
              # {base}/tiles/raster/<config>/<gas>/<frame>.png. Nothing under web/public/tiles is
              # read by the app any more (the builder still writes it there for one release).
make types    # regenerate web/src/types.gen.ts after any API change (CI checks openapi.json is fresh)
make test     # api pytest + web vitest
docker compose up   # api + web (mounts the release and the query core read-only)
```

### Deploying the web app

The web app is a static export: `cd web && npm run export` (the same as `npm run build`) writes
`web/out/` with `/`, `/data/`, `/about/` and `404.html`; there are no server routes, so a
receipt's URL is `/data?receipt=<hash>`. Build it with the production base baked in, then
deploy the `pakemis` Firebase Hosting target from the repository root:

```
cd web && NEXT_PUBLIC_API_BASE=/api/v1/emissions npm run export && cd ..
npx firebase deploy --only hosting:pakemis        # project and target from .firebaserc
```

`firebase.json` serves `web/out` (trailing slashes, immutable caching for `/_next/static/**`,
`tiles/**` ignored) and rewrites `/api/v1/emissions/**` to the Cloud Run service `pakemis`
(asia-south1), so the page and the API share one origin and `NEXT_PUBLIC_API_BASE` is the
same-origin path. Anywhere else, set `NEXT_PUBLIC_API_BASE` to the API's absolute base
(`https://<host>/api/v1/emissions`) at build time; `web/Dockerfile` bakes it in and serves
`out/` with nginx on :3000.

To enable Ask PakEmis, export the key in the shell that starts the API and nothing else:

```
export ANTHROPIC_API_KEY=...        # in the API's shell only; never in a file of this repository
export PAKEMIS_ASK_MODEL=...        # optional; default claude-sonnet-5
make api                            # /v1/release.agent.enabled becomes true
```

Without the key the API answers `POST /v1/ask` with 503 `agent_disabled` and the dock shows the
reason. Caps: `PAKEMIS_ASK_MAX_TURNS` (8), `PAKEMIS_ASK_MAX_TOOL_CALLS` (12),
`PAKEMIS_ASK_CONVERSATION_TOKENS`, `PAKEMIS_ASK_DAILY_TOKENS`, `PAKEMIS_ASK_PER_IP_PER_HOUR` (60),
`PAKEMIS_ASK_EFFORT` (medium).

Python needs `fastapi uvicorn pydantic>=2 duckdb pyarrow netCDF4 numpy Pillow httpx pytest
anthropic>=0.93 google-genai>=1.67 sse-starlette>=3.3` (`api/requirements.txt`). `make api`
sources `api/.env` (gitignored) into the API's environment before starting uvicorn, so a
`GEMINI_API_KEY=` line there is the other way to enable the agent; the file is never printed
or committed.

## Talking to the agent

Open `/?ask=1`, click the accent **Ask PakEmis** pill at the map's top-right, the Ask button
at the bottom of the rail, or the one-time hint under the scope chips (dismissed once, kept
in `localStorage`). The agent runs on one of two providers behind the same loop, tools and
rendering gate:

- **Gemini** (the default when only a Gemini key is present; the way hawanama's copilot runs):
  `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), model `gemini-3.1-pro-preview` falling back to
  `gemini-2.5-pro` then `gemini-2.5-flash` when the key cannot use a model (a 429 or 404
  before the first token; a begun stream is never restarted). `/v1/release.agent.model`
  names the model actually answering.
- **Anthropic**: `ANTHROPIC_API_KEY`, model `claude-sonnet-5`.

`PAKEMIS_ASK_PROVIDER=auto|anthropic|gemini` (default `auto`: Gemini when `PAKEMIS_ASK_MODEL`
starts with `gemini` or when only the Gemini key is set, Anthropic otherwise) and
`PAKEMIS_ASK_MODEL` override the choice. The keys are read by the provider SDKs from the API
process's environment and nowhere else: `make api` sources `api/.env` (gitignored; write it
with `python3 scripts/copy_gemini_key.py /path/to/other/.env`, which copies the one
`GEMINI_API_KEY=` line by name and prints only the value's length) and still honours a key
exported in the shell. No key is ever printed, logged, put in a response or committed; the
test suite greps the tree for key prefixes. The web app never sees a key. Without one
`/v1/release.agent.enabled` is false and the dock shows the disabled card with the reason
(the name of the missing variable). With an invalid key the provider's answer is shown
verbatim in the dock as a model-error card; nothing is retried or hidden.

## The API

| route | function |
|---|---|
| `GET /v1/release` | identity, defaults, dims (periods, months by period, ADM1/ADM2 rows, sectors, gases), server-built labels, digests, context-bar fields, the agent block, placeholders |
| `POST /v1/query/emissions` | `query_emissions` |
| `POST /v1/query/compare` | `compare_emissions` (two configurations or two periods; never two bases) |
| `POST /v1/query/timeseries` | `get_timeseries` |
| `POST /v1/query/uncertainty` | `get_uncertainty` |
| `POST /v1/query/completeness` | `get_completeness` |
| `GET /v1/evidence/{stream_id}` | `get_evidence` (`_` for every stream; `?module=` `?category=`) |
| `GET /v1/method/{method_id_or_category}` | `get_method` |
| `GET /v1/transfers?ledger_id=` | `get_cross_sector_transfer` |
| `GET /v1/spatial/lineage/{shape_id_or_province}` | `get_spatial_lineage` |
| `POST /v1/spatial/grid` | `get_grid_cell` (reads the NetCDF cube) |
| `GET /v1/receipt/{receipt}` | replay |
| `GET /v1/download/{receipt}.csv`, `.receipt.json` | `download_query_result` (canonical CSV; RECEIPT.json with the ODbL note when an OSM-derived surface is in scope) |
| `POST /v1/ask` | Ask PakEmis: one user message in, server-sent events out |

Request bodies are pydantic models generated at import time from the `pakemis_query.models`
dataclasses (`api/pakemis_api/models_gen.py`); a test asserts they mirror the dataclass fields.

## Ask PakEmis: the contract

`POST /v1/ask` takes `{conversation_id?, message, ui_state, client_history?}` and streams:

| event | payload |
|---|---|
| `status` | `{phase: model \| tool \| correction \| tool_limit, turn?, k?, name?, reason?}` |
| `thinking` | `{text}` summarised reasoning deltas |
| `tool_call` | `{k, id, name, input}` k = the 1-based tool call of this turn |
| `tool_result` | `{k, id, name, receipt, request_type, context, n_values, cells: [{i, display, unit, group?, exactness?, attrs?}], limitations_hit, unallocated?, truncated?, download?}` |
| `refusal` | `{k, id, name, error, error_class, limitation_id, message, detail}` the typed refusal, verbatim |
| `map_action` | `{level?, geo?, period?, month?, sector?, gas?, config?, gwp?, view?}` from `set_map_view` |
| `answer` | `{text, receipts, citations, elapsed_s}`; every number in `text` is `<cite k cell receipt>display</cite>` |
| `error` | `{code, message}`: `bare_numbers`, `placeholder_error`, `turn_limit`, `budget_exhausted`, `model_error`, `model_refusal` |
| `done` | `{conversation_id, usage, cost_estimate_usd}` |

The tools are the eleven `query_contract.functions` with schemas from the generated request
models (field descriptions and allowed values from the dims) plus `set_map_view`. The model
sees a compact result (the first 60 cells: `display`, `unit`, identifying strings), never the
envelope and never the release version string. It writes `{{result_k_cell_n}}` (or `.unit`,
`.exact`); `render.py` delegates each to `pakemis_query.placeholders.render` on that call's
envelope and then runs `reject_bare_numbers` over the rest. Conversations are in-process
(24 h TTL); the browser keeps its own copy and re-seeds an unknown id with `client_history`.

The web dock (`web/src/components/ask/`): `useAskStream` POSTs and parses the SSE body with a
ReadableStream reader; `ReasoningTimeline` shows, in arrival order, the thinking (collapsed),
one `ToolCard` per call (humanised name, input chips through the release's labels, the result's
`display unit` rows with group labels and the interval badge, limitation chips, the
`ReceiptFooter`, "Show on map" via `stateFromRequest`), the shared `RefusalCard`, the
"moved the map" chip, the `AnswerBubble` whose cited numbers highlight and scroll to their card
and cell, and the `UsageLine` (tokens, cost estimate, elapsed, as received). `map_action`
events move the map as they arrive; `ui_state` (the URL scope) goes with every question; a map
click while the dock is open inserts an `@` mention; suggested questions are worded from the
current scope; conversations persist in `localStorage['pakemis.ask.<id>']` and restore from `?c=`.

## What is NOT here

- No authentication, no users, no PostgreSQL. Receipts live in an in-memory map mirrored to
  `data/receipts.json`; conversations live in the API process and the browser.
- No object storage, no CDN. The API serves the tiles from the release payload; the web app is
  static files on Firebase Hosting (or any file server) with one rewrite to the API.
- No copy of `pakemis_query` or of the release. Both are read from where they live.
- No live model turn has been run in this repository's checks: every agent test drives a
  scripted model; the first live turn needs the key in the API's shell.

Licences: code MIT; data and text CC-BY-4.0; OSM-derived tables ODbL (see the release's
`licences.odbl_note`). Cite as the envelope's `citation` field, which names the receipt.

## The web app's rules (enforced by tests)

- No numeric literal reaches the UI: every number is an envelope's `display` (or `exact`, or a
  coordinate the envelope returned), and in the dock a stream's `display`/`unit` or a `<cite>`;
  `DetailCard.test.tsx` and `ask.test.tsx` walk every text node for decimals.
- Every request body is a pure function of the URL state (`src/lib/requests.ts`), so the same
  URL yields the same receipts; `stateFromRequest` is the inverse (`/data?receipt=` and the
  dock's "Show on map"). `src/lib/urlState.test.tsx` round-trips it.
- Labels come from `/v1/release.labels` and the dims; the enumerations (AR5 | AR6, views,
  levels) from `openapi.json` field descriptions; nothing is a hard-coded list.
- The legend's five labels are real cells' displays at ranks 0, n/4, n/2, 3n/4, n-1 (no
  client-computed breaks); a refused map request puts the typed refusal in the legend's place;
  bounded ADM2 cells print "[low, high]" verbatim with an interval badge and a hatch.
- Receipts are footers (`ReceiptFooter`: first 8 hex, kebab -> Copy, Replay, Evidence,
  Calculation, CSV, RECEIPT.json, Cite; a footer holding only a receipt replays it on demand).

Screenshots of the screen at 1440 px and 390 px are under `web/docs/screenshots/`
(`13-ask-disabled.jpg` is the dock without the key; `14-globe.jpg` the globe with its
atmosphere, `15-3d-terrain.jpg` the 3D view; `16-welcome.jpg` the first-visit explainer's
first screen and `16b-welcome-3.jpg` its third, with the number and "View source";
`17-other-territories.jpg` the hover on Gilgit-Baltistan showing the shared `Other` cell and
`17b-other-card.jpg` its detail card; `18-about.jpg` the `/about` page).
