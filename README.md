# PakEmis Explorer

The public frontend of PakEmis, Pakistan's national greenhouse-gas inventory (ten sectors,
FY2015-16 to FY2023-24, LULUCF excluded), the deterministic query API under it, and Ask
PakEmis, a tool-calling agent whose every number is a server-inserted envelope value.

**One numerical truth layer.** The map, the cards, the downloads, the API and the agent are
different views of the same verified release. The rule this repository enforces at every layer:

- Every number shown anywhere is a string from an API envelope that carries a receipt: by
  default the cell's `display_short` (the server's two-decimal rendering of `exact`, described
  by `/release.rounding.presentation`), with the contract's `display` and the `exact` decimal
  one step away (Result details, the table's "full precision" toggle, a headline's title). The
  web app computes nothing: no sums, no rounding, no percentages, no unit changes. A cell's
  `value` may only size a bar or shade a polygon.
- The API adds no number either. It returns `pakemis_query`'s Envelope unchanged (values with
  `exact` beside `display`, the context bar, the calculation SQL, provenance digests, unallocated
  mass, limitations hit, citation, `result_sha256`, receipt).
- A request the release cannot answer is refused by name (HTTP 422 with the error class and
  the `limitation_id`), never approximated. The agent reports refusals verbatim.
- A receipt is replayed, never served from a stored result. `GET /api/v1/emissions/receipt/{r}` recomputes the
  stored canonical request and fails loudly if the receipt no longer reproduces.
- Map tiles and rasters carry geometry and identifiers only; values are painted through Mapbox GL
  `feature-state` from `/api/v1/emissions/query/emissions` envelopes; the grid raster is visual shading and
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
api/                    FastAPI over pakemis_query, every route under /api/v1/emissions (imported from
                        PAKEMIS_QUERY_PATH, the emissions checkout, in development; the container
                        image imports the vendored copy api/vendor/pakemis_query, see Deploying the API)
api/pakemis_api/tiles.py the PMTiles reader and the /tiles routes (TileJSON, z/x/y, TILES.json, rasters)
api/Dockerfile, api/start.sh, cloudbuild.yaml   the Cloud Run image and its build (Deploying the API)
api/pakemis_api/ask/    Ask PakEmis: tools from the generated request models, the system prompt,
                        the loop over an injectable model client, the placeholder renderer, limits
api/openapi.json        committed schema; web/src/types.gen.ts is generated from it
tiles/build_tiles.py    ADM1, ADM2 and 0.05 degree grid PMTiles keyed by name / shape_id / cell_id;
                        bboxes.json; --raster: visual-only shading PNGs of the two grid cubes; all
                        written into data/releases/<v>/tiles/, where the API serves them from
web/                    Next.js 15 + TypeScript, a static export (next.config.ts: output
                        "export"): the public Overview (/, components/overview), the Map page
                        (/map: the Mapbox GL JS v3 choropleth painted through feature-state,
                        components/map; the tiles reach it as TileJSON from the API's /tiles
                        routes; detail card and panels, components/detail, components/panels),
                        Ask PakEmis (/ask, components/ask), Methods & evidence (/methods) and
                        Downloads (/downloads: receipt replay at /downloads?receipt=<hash>,
                        downloads, digests, evidence browser); /about and /data redirect there.
                        Every page reads one URL state (lib/urlState.ts) through the shared
                        ExplorerProvider (components/shell); request bodies are pure functions
                        of it (lib/requests.ts); the dark theme is globals.css tokens read by
                        lib/theme.ts for the charts and the map layers
firebase.json           Firebase Hosting for web/out: the rewrite /api/v1/emissions/** -> Cloud Run
                        service `pakemis`; .firebaserc names the project and the `pakemis` target
```

## The pages (2026-08-30)

Every page carries the `TopNav` (Overview, Explore data, Map, Methods & evidence, Downloads,
the green Ask PakEmis button) and, where numbers are shown, the `CurrentView` bar ("Current
view: 2023–24 · Pakistan · Reference estimate · excludes land use and forestry", the IPCC basis
and the LULUCF note as its tooltip; "Change view" opens the Explore controls, which write the
same URL state). The theme is dark (`globals.css` semantic tokens; the charts and the Mapbox
outline colours read them through `lib/theme.ts`); the map keeps the light `streets-v12`
basemap inside a framed dark container because the choropleth ramp and the raster colormap
are calibrated on light.

`/` is the public Overview: the hero beside the Estimated national total card (the KPI as the
server's `display_short` with `unit_short`; "Uncertainty interval: approximately
407.28–533.73 Mt" is `get_uncertainty(scope="national")`'s `cross_sector` cell's
`interval_short`, the scenario named by its `scenario_label`, the draws' median set beside the
reference-estimate headline, each envelope with its Result details; the interval is shown only
while the view is the release's own national scope), the question box (to `/ask?q=`; three
chips from `useSuggestions("overview")`), "Where emissions come from" (the five largest
sectors, bars sized by `value`, labelled with `display_short`; the caption reads the top
cell's `share_pct_short`, a server field, and carries no share when the server sends none;
selecting a sector explains it from `get_evidence` -> `ipcc_category` -> `get_method`, with
its evidence classes and a link to the Map filtered to it), "How emissions changed" (the
national series as the TrendChart), three explainer cards, "Ready to go deeper?" and a footer
with the licences and no version.

`/map` is the console: the framed map with floating scope chips, the Ask pill, raster / 3D /
frame buttons, time rail, legend and context pill, the detail card over the map's right edge,
and a right column that is the national context panel or, with `ask=1`, the Ask dock. Every
control reads and writes the URL (`level`, `period`, `month`, `sector`, `gas`, `config`,
`gwp`, `view`, `geo`, `cell`, `panel`, `ask`, `c`, `cam`, `raster`, `view3d`), so a copied URL
opens with identical receipts. `/ask` is the dock as a page (`?q=` seeds one question and is
then cleared; "moved the map" and a tool card's "Show on map" link to `/map?…`). `/methods`
carries the methodology prose; `/downloads` replays receipts and lists the release identity
(the one place the version is printed). There is no first-visit modal: the Overview is the
introduction.

The map is hawanama.org's: Mapbox GL JS v3 rendering `mapbox://styles/mapbox/streets-v12`
with hawanama's flags (maxPitch 45, no drag-rotate, no world copies) and v3's default globe
projection, so the national view is a globe with the atmosphere halo below zoom ~5 and flattens
as you zoom into a province; the choropleth, hatch and grid raster sit below the style's label
layers. The 3D button (`view3d=1`) applies the ops dashboard's recipe: `mapbox-dem` terrain
(exaggeration 1.5 tapering to 1.0), fog, pitch 30, bearing -10, with the choropleth draped. Spatial products exist for FY2023-24 only: other years drive national numbers and
show the typed refusal in the legend's place.

The territories at province level: the release's ADM1 table has one row without a polygon
(`has_polygon: no`, named `Other`) while the boundary file draws Gilgit-Baltistan, Azad
Kashmir and Islamabad Capital Territory separately. `src/lib/geography.ts` derives the
members (the drawn ADM1 polygons no province row claims; nothing is hard-coded), the map
paints the row's one cell on each member verbatim with a dotted outline (feature-state
`shared`, `shared_with`), the hover and legend say the cell is shared, and clicking a member
selects `geo=Other`, the release's own id, which the detail card and the API answer as one
unit. Coverage of the three differs by sector; `/methods` says how.

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
make api      # http://localhost:8000  (docs at /api/v1/emissions/docs and /docs; GET /api/v1/emissions/release shows the context
              # bar, dims, labels, defaults and the agent block; /v1/* still answers, deprecated)
make tiles    # once per release: PMTiles + bboxes.json into data/releases/<v>/tiles (needs tippecanoe);
              # served by the API at /api/v1/emissions/tiles/*; copied to web/public/tiles for one release
make raster   # once per release: 78 grid-shading PNGs (2 configurations x 3 gases x 12 months + annual)
              # into data/releases/<v>/tiles/raster; visual only, every value shown comes from get_grid_cell
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
docker compose up   # api (:8080, the Cloud Run image with the release mounted read-only) + web
```

### Deploying the web app

The web app is a static export: `cd web && npm run export` (the same as `npm run build`) writes
`web/out/` with `/`, `/map/`, `/ask/`, `/methods/`, `/downloads/`, the `/about/` and `/data/`
redirect stubs and `404.html`; there are no server routes, so a receipt's URL is
`/downloads?receipt=<hash>`. Build it with the production base baked in, then
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
make api                            # /api/v1/emissions/release .agent.enabled becomes true
```

Without the key the API answers `POST /api/v1/emissions/ask` with 503 `agent_disabled` and the dock shows the
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
  before the first token; a begun stream is never restarted). `/api/v1/emissions/release` `.agent.model`
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
`/api/v1/emissions/release` `.agent.enabled` is false and the dock shows the disabled card with the reason
(the name of the missing variable). With an invalid key the provider's answer is shown
verbatim in the dock as a model-error card; nothing is retried or hidden.

## The API

Every route lives under the prefix `/api/v1/emissions` (the prefix Firebase Hosting rewrites to
the Cloud Run service; in development `http://localhost:8000/api/v1/emissions`). The same routes
answer under the legacy `/v1` prefix for one more release, out of the schema, with
`Deprecation: true` and a `Link: <successor>; rel="successor-version"` header.

| route (under `/api/v1/emissions`) | function |
|---|---|
| `GET /release` | identity, defaults, dims (periods, months by period, ADM1/ADM2 rows, sectors, gases), server-built labels, digests, context-bar fields, the agent block, placeholders |
| `POST /query/emissions` | `query_emissions` |
| `POST /query/compare` | `compare_emissions` (two configurations or two periods; never two bases) |
| `POST /query/timeseries` | `get_timeseries` |
| `POST /query/uncertainty` | `get_uncertainty` |
| `POST /query/completeness` | `get_completeness` |
| `GET /evidence/{stream_id}` | `get_evidence` (`_` for every stream; `?module=` `?category=`) |
| `GET /method/{method_id_or_category}` | `get_method` |
| `GET /transfers?ledger_id=` | `get_cross_sector_transfer` |
| `GET /spatial/lineage/{shape_id_or_province}` | `get_spatial_lineage` |
| `POST /spatial/grid` | `get_grid_cell` (reads the NetCDF cube) |
| `GET /receipt/{receipt}` | replay |
| `GET /download/{receipt}.csv`, `.receipt.json` | `download_query_result` (canonical CSV; RECEIPT.json with the ODbL note when an OSM-derived surface is in scope) |
| `POST /ask` | Ask PakEmis: one user message in, server-sent events out |
| `GET /tiles/meta`, `GET /tiles/bboxes` | `TILES.json` (the tile builder's record) and `bboxes.json` |
| `GET /tiles/{adm1\|adm2\|grid}` | TileJSON 3.0.0 from the archive's header and metadata, absolute tile URLs on the request's (forwarded) origin |
| `GET /tiles/{name}/{z}/{x}/{y}.mvt` | one vector tile as stored (`Content-Encoding: gzip` passed through, `Cache-Control: immutable`; 204 when the archive holds none, 404 for an unknown name) |
| `GET /tiles/raster/{config}/{gas}/{frame}.png` | one visual-only grid shading PNG |
| `GET /healthz` (also at the root) | liveness: the release id and the receipt count |

The tiles come from `data/releases/<v>/tiles/` (`tiles/build_tiles.py`); the service refuses to
start when an archive present there differs from the digest `TILES.json` records, as it refuses a
tampered table. Responses over 1 KB are gzip-compressed (the SSE stream and the pre-compressed
tiles are not touched); every response carries `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy`; CORS origins come from `ALLOWED_ORIGINS`
(comma-separated; `*` by default, the development setting).

Request bodies are pydantic models generated at import time from the `pakemis_query.models`
dataclasses (`api/pakemis_api/models_gen.py`); a test asserts they mirror the dataclass fields.

### Presentation rounding

The web computes nothing, so the number a screen prints at reading precision is minted by the
API: every envelope cell (and a compare cell's nested `left`/`right`, and the `quantiles` of an
uncertainty cell as `quantiles_short`) carries `display_short` beside the contract's `display`
and `exact`, plus `unit_words` (the unit as words, `Mt CO2e AR5` → `million tonnes CO₂e`) and `unit_short` (`Mt CO₂e`); neither carries the GWP basis token, which `/release.labels.gwp` names once (`IPCC 2013 (AR5)`, with its tooltip quoting the release's own factors).
`display_short` is `exact` quantised to two decimal places with `Decimal` and `ROUND_HALF_EVEN`,
in plain notation with trailing zeros kept (`452.35`, `63.37`, `9.01`, `0.39`, `0.30`,
`248.75`), for every numeric cell whatever its unit; a zero prints as `0.00`; a non-zero value
that would print as `0.00` prints as `<0.01` (`>-0.01` when negative, so `-0.00` never appears);
a negative keeps its sign (`-5.13`); a bounded cell prints both ends at two decimals
(`[12.2565, 12.2769]` → `[12.26, 12.28]`), or the single value when the ends round equal; a
count and a non-numeric cell print their `display` unchanged. `api/pakemis_api/presentation.py`
declares the rule and `GET /release` publishes it as `rounding.presentation` with a sentence.
The decoration runs after the query core has minted `result_sha256` and the receipt, so both
stand and a golden replays to its frozen receipt; the CSV download is the core's data product
and carries no presentation column. In Ask PakEmis the compact tool result and the
`tool_result` event carry `display_short`, and the placeholder `{{result_k_cell_n.short}}`
renders it (the form the prompt asks for in prose); `{{result_k_cell_n}}` keeps rendering
`display`, and the bare-number gate is unchanged.

Two derived presentation fields sit beside `display_short`, declared under
`/release.rounding.presentation.derived` with a sentence each. `share_pct_short` is a cell's
share of the sum of the cells (`100 × exact / Σ exact`, `Decimal`, `ROUND_HALF_EVEN`, one decimal
with the trailing zero kept: `49.4`, `7.0`; a zero prints `0.0`; a non-zero share that would print
`0.0` prints `<0.1`, `>-0.1` when negative). It is added only to a `query_emissions` envelope whose
request groups by exactly one key and whose cells are all exact (a numeric `exact`, no bounded
interval, no `left`/`right`, one unit) with a non-zero sum, so the shares are a partition of that
sum; the envelope then carries `partition: {of: "the sum of these cells", n, share_field:
"share_pct_short", rule}`. No share is added when the request groups by no key or by two or more,
to a compare, timeseries, uncertainty or completeness envelope, or to a download. An uncertainty
cell with `quantiles` (`get_uncertainty` scope `series` or `national`) carries `interval_short`,
its `quantiles_short` P2.5 and P97.5 joined by an en dash (`400.27–514.28`), and `scenario_label`,
the draw scenario in words (`time_correlated` → `time-correlated draws`, `time_independent` →
`time-independent draws`, `parameter_typed` → `parameter-typed draws`, `cross_sector` →
`factors shared across modules`, `within_sector` → `factors shared within a module`; an unknown
scenario prints as itself). The three FY2023-24 `annual_level` scenarios bound the same total
differently (parameter-typed `400.27–514.28`, time-correlated `406.52–507.61`, time-independent
`406.19–506.31`), so a screen that prints one interval names its scenario. Neither derived figure
reaches the Ask model's compact tool result (no placeholder prints it).

## Ask PakEmis: the contract

`POST /api/v1/emissions/ask` takes `{conversation_id?, message, ui_state, client_history?}` and streams:

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

## Deploying the API

The API ships as one Cloud Run service, `pakemis`, behind the Firebase Hosting rewrite of
`/api/v1/emissions/**` (the pattern hawanama uses for its own API; `firebase.json` carries the
rewrite, and the web app is a static export on the same site, so the browser sees one origin).

```
make vendor                     # api/vendor/pakemis_query from the emissions checkout at $(REF)
make docker-build               # docker build -t pakemis -f api/Dockerfile .   (context: the repo root)
make docker-run                 # :8080 with data/releases mounted read-only; api/.env is not passed
curl -s localhost:8080/api/v1/emissions/release | head -c 200
make push-release BUCKET=...    # gsutil rsync data/releases/<v> (payload + tiles) to gs://<bucket>/releases/<v>
make deploy BUCKET=...          # gcloud builds submit --config cloudbuild.yaml (build, push, run deploy)
```

- **The image** (`api/Dockerfile`, python:3.11-slim, non-root, port 8080) carries `api/`,
  `data/verify_release.py` and `RELEASES.md`, nothing else: no release payload, no `web/`, and
  `.dockerignore` keeps `api/.env` and every `.env*` out.
- **The query core** cannot be imported from an emissions checkout inside the image, so
  `scripts/vendor_query_core.py` copies `src/pakemis_query` out of the checkout through
  `git show <ref>:...` (a dirty tree cannot leak in) into `api/vendor/pakemis_query`;
  `api/vendor/VENDOR.json` records the repository, the commit, every file's sha256 and one digest,
  and `api/tests/test_vendor.py` proves the copy byte-equal to that commit whenever the checkout
  is on the machine. `PAKEMIS_QUERY_PATH` still overrides: development imports the checkout
  itself (its golden files sit beside it) and falls back to the vendored copy only when the
  checkout is absent; the image sets `PAKEMIS_QUERY_PATH=/app/api/vendor`. The copy is committed
  so Cloud Build, which sees only this repository, can build; `make vendor` refreshes it.
- **The release** is pulled on start: `api/start.sh` downloads
  `gs://$PAKEMIS_RELEASES_BUCKET/releases/$PAKEMIS_RELEASE_VERSION/` (`api/pull_release.py`,
  Application Default Credentials, anonymous for a public bucket) when the directory is absent,
  runs `verify_release.py` against it (a mismatch stops the container), then starts one uvicorn
  worker with `--proxy-headers` so the rewrite's `X-Forwarded-Proto/Host` reach the TileJSON
  URLs. Locally `make docker-run` mounts `data/releases` instead and pulls nothing. The runtime
  service account needs `roles/storage.objectViewer` on the bucket.
- **Environment**: `PAKEMIS_RELEASES_BUCKET`, `PAKEMIS_RELEASE_VERSION`, `ALLOWED_ORIGINS`
  (the hosting site's origins; `*` in development), `PAKEMIS_ASK_PROVIDER=gemini`;
  `GEMINI_API_KEY` from Secret Manager (`--set-secrets`). `cloudbuild.yaml` sets 2 CPU / 2 GiB,
  concurrency 20, timeout 300 s, min-instances 1 (DuckDB + netCDF4 cold starts).
- **Prefix change**: clients on `/v1/*` keep working for one release and receive
  `Deprecation: true`; `api/openapi.json` names only the `/api/v1/emissions/*` paths, so
  `make types` regenerates `web/src/types.gen.ts` with the new paths.

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
  URL yields the same receipts; `stateFromRequest` is the inverse (`/downloads?receipt=` and
  the dock's "Show on map"). `src/lib/urlState.test.tsx` round-trips it.
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
`19-static-export.jpg` the static export (`web/out`, served by a plain file server) reading every
tile, raster and envelope from the API at `/api/v1/emissions`;
`17-other-territories.jpg` the hover on Gilgit-Baltistan showing the shared `Other` cell and
`17b-other-card.jpg` its detail card; `18-about.jpg` the `/about` page, now `/methods`;
`30-overview.jpg` the public Overview and `33-ask.jpg` the `/ask` page, both dark).
