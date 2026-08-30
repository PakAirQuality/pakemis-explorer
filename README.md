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
same URL state; the Overview replaces it with the province dropdown). The theme is light
(2026-08-30): a warm off-white ground, white cards without borders (the ground gives the
contrast), near-black text, one emerald accent for links and primary buttons, sector colours
inside charts only, an amber note box; `globals.css` holds the semantic tokens (the names the
components use are kept: `surface` = ground, `surface-2` = card, `surface-3` a darker ground)
and the utilities `card`, `widget-title`, `note`, `caption`, `toolbar-icon`; the charts and the
Mapbox outline colours read the tokens through `lib/theme.ts`. Page containers sit at the
analytical width `max-w-[1500px]`; the Map page stays full-bleed.

**House style (2026-08-30, from emissions.web.app).** The Explorer carries the Pakistan Air
Quality Initiative look of the user's Transport Emissions app, read from the deployed site
(nothing of its source exists locally): the PAQI logo (`web/public/brand/paqi-logo.png`, the
"Pakistan Air Quality Initiative" wordmark with the golden Urdu mark; origin and sha256 in
`public/brand/README.md`) in the nav at `h-8`, above the Overview eyebrow at `h-10`, in the
footer at `h-6` and on the loading screen at `h-20`; the favicon (`public/favicon.svg`,
`app/icon.svg`) copied from the same site; the palette — ground `#f9fafb`, cards white, text
`#030213`, muted `#717182`, hairlines `#e5e7eb`, the one accent blue `#2563eb`, a `brand-gold`
`#ffbb12` for the active nav underline only, radius 0.625rem, white glass pills
(`bg-white/90 backdrop-blur shadow-md border border-gray-200/50`) over the map, the system font
stack; the YlOrRd choropleth ramp (`#ffffcc` → `#800026`) for the magnitude layer with a
"Low ▬▬ High" gradient bar above the class list (the class breaks stay the server's strings);
and the round blue Ask FAB bottom-right on every page (`components/shell/AskFab.tsx`, toggles
the drawer). **The loading screen** (`components/shell/LoadingScreen.tsx`) is the app's:
a `#f8f9fa` overlay with a drifting particle canvas, the floating logo, "PakEmis" over
"Pakistan Air Quality Initiative", a 256×4 progress bar and a rotating status line — but the
progress is real (`components/shell/bootstrap.ts`: `/release` resolved 35 %, labels 60 %, the
page's first envelope 85 %, the map's `load` 100 % on `/` and `/map`; a 6 s ceiling, a 900 ms
minimum, a 700 ms fade), it shows once per session (`sessionStorage`; `?loading=1` forces it,
`&stage=<name>` holds it for captures), and its eight lines (`loadingLines.ts`) carry no digit,
because a number on this site is a string the release returned.

`/` is the public Overview as a country briefing (2026-08-30, in Global Mangrove Watch's
frame): under the 56 px nav a fixed two-pane app frame — a 560 px dashboard panel on the
left with its own vertical scroll (white, a right-edge shadow over the map) and the map filling
the remaining width and the full height on the right; under 1024 px a column, the panel first
and the map at 60 vh below it. The panel stacks cards with 16 px gutters: the header block
(eyebrow "Pakistan's explainable emissions inventory" as its first line — the logo is in the
nav only —, the title Pakistan or the selected province, the "Select a province" dropdown over
the release's ADM1 rows which writes `geo` so every widget re-scopes and the map flies there,
Share · Download); the opening statement with the numbers in bold ("In 2023–24, Pakistan
emitted an estimated 452.35 Mt CO₂e. Agriculture accounted for 223.45 Mt — 49.4 %, nearly
half — of the reconstructed inventory, which excludes land use and forestry.", every figure a
server string: `display_short`, `unit_short`, `share_pct_short`, `share_phrase`, the LULUCF
phrase the release's label; province scope: "Punjab's allocated emissions were 228.72 Mt CO₂e
… of the province's allocated total") and the muted independence line; the sticky tab strip
(anchors Summary · Sectors · Trend · Gases · Places, the one in view marked); four widgets,
each a `Widget` card with its envelope's toolbar: Emissions by sector (the sentence from ranks
1–3, ten bars with an x-axis from the envelope's `axis.ticks_short`, value · share labels),
Emissions over time (the sentence from the series' server-derived `change`, a column chart
with a y-axis from its ticks, the reference year in the accent), Emissions by gas (a stacked
bar with `share_pct_short`), Where emissions are placed (the rank-1 province and the
`derived.unallocated_total_short` retained at ADM1; five bars; "Open the map"); then the
footer with the licences, the independence line and the repository. The interval,
completeness and evidence widgets and the routes strip were removed from the Overview
(Explore and Methods carry those envelopes). The map is the `ExplorerMap` in its briefing
variant on the light basemap (Mapbox `light-v11`: grey land, white water, pale borders):
a Provinces | Districts glass toggle, the frame button and, in the legend's place, a compact
bottom-left pill — `Low ▬▬▬ High | Opacity ──●── 80%`, the YlOrRd gradient and a slider
that sets the choropleth's `fill-opacity` (a display setting, local state); the values stay
in the hover tip, which also explains the shared "Other" cell under its dotted outline. The
map follows the widget in view (a hovered or selected sector bar filters the choropleth;
Places shows provinces) and the province dropdown. In province scope the sector breakdown is
asked by `module` (the release carries `sector_id` at national grain only) and the annual
series is refused by the release and the refusal is shown by name. The charts
(`components/charts/`) print axis labels only from `axis.ticks_short` and value labels only
from `display_short` / `share_pct_short`; the browser computes nothing.

`/map` — Map allocated emissions (2026-08-30, the immersive allocation map). Full-bleed under
a dark chrome (the tokens re-valued on the page wrapper; the map itself stays the light
`light-v11`): a collapsible filter panel on the left (Geography level and place, Period,
Sector, Gas, Estimate and warming potentials, Spatial view; a rail of icons when collapsed),
the map, a timeline beneath it (the fiscal years as chips, Annual plus the twelve months of the
reference year; any other year is "national only" and shows the release's typed refusal in its
own words) and the selected-geography drawer on the right (`components/detail/SelectionDrawer`,
420 px; a bottom sheet on mobile) with the tabs Summary · Breakdown · Trend · Evidence ·
Sources on the URL key `tab`. The drawer is titled "{Place} · allocated emissions" (Pakistan
when nothing is selected) and its Summary reads the cell's `display_short` and the envelope's
`derived` sentence ("Of this total, 443.34 Mt CO₂e is spatially placed and 9.01 Mt CO₂e remains
explicitly unallocated"); Breakdown asks `sector_id` nationally and `module` at ADM grain with
the server's shares, or the spatial views; Trend shows the national series with its `change`
and, off the national scope, the typed refusal by name; Evidence shows the district cell's
`spatial_class`, its basis sentence, dominant stream, placement and allocation status with the
lineage rows; Sources the lineage, the provenance tables and the release. The layer switch
(URL key `layer`, `components/map/layerModes.ts`) paints five readings of the same envelope,
each with its own legend and one sentence ending "this is an inventory allocation, not an
observation": Emission magnitude (the choropleth), Spatial evidence (districts by
`spatial_class` S1–S4/NA with the class definitions and counts), Allocation method
(`allocation_status` × `placement_class`), Unallocated mass (provinces shaded by their
`unallocated_short` over greyed districts) and Known spatial exceptions (the shared "Other"
cell, shapes shared by several census units, units without a polygon — Larkana's active
district among them — and the bounded CH₄ modules, hatched or outlined, with a named list from
`dim_geography` and `known_limitations`). Every control reads and writes the URL (`level`,
`period`, `month`, `sector`, `gas`, `config`, `gwp`, `view`, `geo`, `cell`, `layer`, `tab`,
`c`, `cam`, `raster`, `view3d`), so a copied URL opens with identical receipts.

Ask PakEmis (2026-08-30) is a right-side drawer on every page (`components/ask/AskDrawer`,
mounted once in the layout; the nav button and `lib/askBus.ts`'s `openAsk({question, scope})`
open it; `/ask` remains the permalink form with `?q=`). It inherits the page's scope ("Scope:
Punjab · agriculture · 2023–24 · reference estimate"), offers suggested questions generated
from that scope (`suggestions.ts`: with Punjab and agriculture selected — Why is Punjab's
estimate high? · How much comes from livestock? · Which parts are proxy-allocated? · Compare
Punjab with Sindh · Download the rows used here) and renders every answer as a structured card
(`AnswerCard`): the answer with its server-inserted figures, the applied scope and filters
(from `answer.scope`), the principal result as a figure, bars or a table sized from the
replayed envelope, the uncertainty rows the API attaches (`tool_result.uncertainty`, else
"Uncertainty not requested" with a one-click follow-up), the evidence qualification
(limitations hit, exactness), the exact source rows (`n_rows` per cell, Open rows), the
expandable query and calculation receipt, and Open in Explore · Download CSV · Reproduce.
Explore's Explain action opens the drawer with the canvas scope and "Explain this result".

`/explore` — Explore data as a Grapher (2026-08-30): one control row (Geography: Pakistan · a
province · Compare provinces · a district · All districts; Period: a year · All years · Months
of 2023–24; Sector and, nationally, its Category; Gas: All · By gas · one gas; Measure: CO₂e on
either warming-potential basis · Share of total; More: Estimate incl. Compare estimates,
Spatial view), one canvas with a Chart · Table · Map switch over the same query, and exactly
four actions under it: Explain · Evidence · Download · Share. `lib/explore/query.ts` maps the
control state to exactly one contract call — `query_emissions` with a single `group_by`
inferred from the control varied last (`sector_id` nationally, `module` at ADM grain,
`category`, `gas`, `month`, `province`, `shape_id`), `get_timeseries` for a year range,
`compare_emissions` for the two estimates — or a typed `GrainUnavailable` for a category
filter off the national grain; two provinces are the ADM1-by-province envelope kept to the
two (a filter, never arithmetic). The five model questions work by controls alone: the
nine-year change (a line with the server's `change` sentence), what makes up agriculture
(its categories), which gases dominate (a stacked bar with `share_pct_short`), Punjab against
Sindh, and the reference against the survey-based estimate (grouped bars with the difference
cells). The "Showing:" sentence stays as the canvas subtitle; the notes fold into one
"Reading this result" line.

`/methods` — Methods & evidence, the inventory microscope (2026-08-30). Every number on every
page opens a claim record: the Result details drawer's first tab, Evidence, fetches
`GET /claim?receipt=…&cell=n` for the chosen cell and renders `components/claim/ClaimRecord`
— a breadcrumb header (Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24) and
the sections Reported estimate · Calculation · Activity data · Emission factors · Monthly
allocation basis · Spatial allocation basis · Uncertainty · Source documents and pages ·
Validation tests · Known limitation · Exact machine-readable rows, each filled from the
payload's tables and registries as strings, or reading "Not carried by this release" with the
API's reason (today only source page numbers). The page keeps the sector cards, the search and
the methodology prose, and adds the claim-record browser: Sector → Category → Gas → Place →
Period issue one `query_emissions` and open its cell's record inline (`?claim=<receipt>:<cell>`
is the permalink); a category with a province is sent as asked and the `GrainUnavailable`
refusal is shown by name.

`/downloads` — Downloads & API, purpose-first (2026-08-30). "What do you want to study?" leads
with seven purposes — National and sector totals · Monthly emissions · Province and district
allocations · Gridded emissions · Uncertainty and configurations · Evidence and provenance ·
Complete release — mapped to the API's product families (`?purpose=`); only after a choice do
the matching products appear with CSV · Parquet · NetCDF buttons where each format exists, the
schema panel, the checksums, the complete-archive button (`GET /products/complete.zip`) and
the citation and identity table, the one place the version string appears. The API card and
the receipt replay sit below.

The map is Mapbox GL JS v3 rendering `mapbox://styles/mapbox/light-v11` (emissions.web.app's
look: light grey land, white water, pale borders, few labels; `basemap.ts`) with hawanama's flags (maxPitch 45, no drag-rotate, no world copies) and v3's default globe
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
              # renders Mapbox light-v11 on v3's globe. Mapbox GL JS v3 authenticates every map
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
| `GET /method/{method_id_or_category_or_sector}` | `get_method`; a sector name (`agriculture`, `power`, ...) answers with every rule of that sector |
| `GET /claim?receipt=&cell=n` or `?row_ids=a,b,c` | the claim record behind one number: breadcrumb, reported estimate, calculation, activity, emission factors, method, monthly and spatial basis, uncertainty, sources, validation, limitations, completeness, rows, provenance (see below) |
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
| `GET /products` | every downloadable file of the release (the tables, the cubes, the metadata, the registries) with digests, schema and the six families |
| `GET /products/{name}.{ext}` | one product file from the release payload (attachment; `ETag` = sha256; immutable; ranges) |
| `GET /products/complete.zip` | every product file as one streamed zip (deflated, `SHA256SUMS` and `FETCH.json` inside) |
| `GET /healthz` (also at the root) | liveness: the release id and the receipt count |

The tiles come from `data/releases/<v>/tiles/` (`tiles/build_tiles.py`); the service refuses to
start when an archive present there differs from the digest `TILES.json` records, as it refuses a
tampered table. Responses over 1 KB are gzip-compressed (the SSE stream and the pre-compressed
tiles are not touched); every response carries `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy`; CORS origins come from `ALLOWED_ORIGINS`
(comma-separated; `*` by default, the development setting).

Request bodies are pydantic models generated at import time from the `pakemis_query.models`
dataclasses (`api/pakemis_api/models_gen.py`); a test asserts they mirror the dataclass fields.

### Products and citation

`GET /products` is the Downloads page's catalogue: `{release, version, count, products, families,
note}`. Each product is `{name, kind: table|cube|metadata, formats: [{ext, filename, bytes,
sha256, identity, url}]}`, a table adding `table_kind`, `rows`, `columns`, `primary_key`,
`aggregation_rule` and `closure` from `semantic_release.json`; the 22 semantic tables come as CSV
and Parquet, the two grid cubes as NetCDF, and `semantic_release.json` and `release_manifest.json`
as themselves. Every digest is the release's own (`identity`: the contract's `sha256_csv` for a
CSV, the manifest's for a cube, the verified digest for a metadata file); the Parquet twins, which
the contract leaves unhashed because the CSV is the identity, are hashed once at startup
(`identity: computed`). The twenty-one registries `fetch_release.py` copies under
`data/registries/` are products of kind `registry` (digest and `identity` from `FETCH.json`:
`manifest_sources`, `manifest_products` or `fetch`, with `source_path`). `families` groups the
names into `annual`, `monthly`, `spatial`, `uncertainty`, `evidence` (fact_evidence,
dim_evidence_class, dim_stream, the completeness ledgers and every registry) and `complete` (every
file, with `archive: {filename, url, members}`), each with a title, a description and the formats
offered. `GET /products/{name}.{ext}` streams the file from the payload with `Content-Disposition:
attachment`, `ETag` equal to the sha256, `Cache-Control: public, max-age=31536000, immutable` and
range requests; the filename is looked up in that catalogue and nothing else is served (a 404 for
every other path). `GET /products/complete.zip` streams every catalogued file deflated under its
payload path, member by member, with a `SHA256SUMS` member in `sha256sum` format (the catalogue's
digests) and `FETCH.json`; the archive itself carries no digest, its members do.

`/release` carries `identity_line` ("PakEmis · public-data reconstruction of Pakistan's
emissions, excluding land use and forestry · 2015–16 to 2023–24", no version: the web's sub-header) and `citation`
`{apa, bibtex, doi, doi_note, cite_as, version, author, year, title, repository, commit,
period_span}` built from the manifest's `product.cite_as`, `product.repository` and
`git.describes_commit`, the release version and the reporting window read from the dims. While
the manifest's DOI slots are empty the strings carry no DOI and `doi_note` reads "DOI to be
inserted at release freeze"; a data DOI, once present, is cited in both.

Two further things live beside the query surface. A spatial `query_emissions` envelope whose
`unallocated` block lists provinces (adm1 and adm2 grain) gains the declared derived fields
`unallocated_total_short` (the sum of the provinces' exacts, two decimals: 9.01) and
`placed_short` (the cells' sum minus that, when every cell is exact: 443.34), on the block as
`total_short` / `placed_short` and under `derived`; never on a download. And a `group_by` key the
release has no column for at the request's grain (`spatial_view`, `province`, `module`,
`shape_id`, `month` at national grain) is a typed 422 `grain_unavailable` / `GrainUnavailable`
naming the grains that carry it ("available at adm1/adm2 grain"), where DuckDB's binder error
used to surface as a 500.

### The claim record

`GET /claim?receipt=<r>&cell=<n>` replays the receipt through the service and takes cell n's
`result_row_ids`; `GET /claim?row_ids=<a,b,c>` names result rows directly (24-hex ids, found in
the calculation's table or the first fact table that carries them all). The record is built in
`api/pakemis_api/claim.py` from the explorer's own read-only DuckDB session over the fact tables
(loaded as text) and Python indexes over the registries; the query core is not touched, and no
value is computed: every field is a string from a table (the only renderings are the two-decimal
`_short` twins beside an exact). Its sections:

| section | from |
|---|---|
| `breadcrumb` | `[{level, id, label}]` for sector, category, gas, geography, period; `id: null` with `label: "All sectors"`, `n`, `ids` where the rows span several |
| `reported` | the cell (`display`, `display_short`, `exact`, `unit`, `unit_short`, `exactness`, `n_rows`) with `gwp`, `configuration`, `period`, `geography`, `release` from the envelope's context |
| `calculation` | `sql`, `table`, `column`, `formula`, `rows`, `result_sha256`, `receipt`, the canonical `request` |
| `activity` | per stream × period: `dim_stream` descriptors, the `fact_annual` atom's `native_mass`, `native_unit`, `activity_status`, `method_id`; `activity_uncertainty` by `dependency_group` |
| `emission_factors` | `dim_stream.factor_parameter_ids` (`ef:` stripped) → `emission_factors.csv` (`value`, `unit`, `uncert_pct`, `vintage`, `source`, `note`), `national_uncertainty_parameters.csv` by `dependency_group`, `parameters.csv`; `found_in` names the registries |
| `method` | `data/method_registry.csv` rows by the atoms' `method_id` (`tier`, `equation`, `notes`) |
| `monthly_basis` | `fact_evidence` T-class, profile id, grade; `temporal_profiles.csv` prose; `fact_monthly` closure basis; the twelve profile weights for a single stream-year |
| `spatial_basis` | `fact_evidence` measured S-class, placement class, surface, fallback events and mass (`_short` beside); `geometry_sets.csv`, `release_heights.csv`, `pakemis_grid_fallbacks.csv` joined to `allowed_grid_fallbacks.csv`; rationale rows from `stream_geometry.csv` / `stream_grid_proxy.csv` |
| `uncertainty` | every `fact_uncertainty` row of the categories (all resolutions, all strings) |
| `sources` | `source_documents.csv` + `pakemis_source_register.csv` per document id (`document_sha256`, `how_to_obtain`, licence); `public_documents.csv` by `read_by` |
| `validation` | validation catalogue and sector scorecard rows by module (declared absences included), `benchmarks.csv` by engine category; `kind` names the source |
| `limitations` | the envelope's hits, the adm2 three, `completeness:<gap>` ids in scope, each with its `worded` message |
| `completeness` | the `fact_completeness` row for the category × gas with its `data_gaps.csv` row; every row under the scope's codes; the mass ledger |
| `rows` | table, digest, ids, up to 100 records, download and replay urls |
| `class_definitions` | `dim_evidence_class` for the classes present |
| `provenance` | every table and registry read, with its contract / manifest / FETCH digest |
| `missing` | the sections that are `null`, each with "not carried by this release" (page numbers always: no register carries them) |

The basis sections carry the one value the streams share at the top level and `null` where they
differ, with `by_stream` listing each; a mass is never summed across streams. `fact_adm2_month`
and `fact_annual_calendar` carry no stream column, so their streams are the module × gas streams
of `dim_stream` (`stream_basis` says so). Typed 4xx: `unknown_cell`, `no_rows` (a compare
difference cell), `invalid_row_id`, `unknown_rows`, `missing_selector`, `one_selector`,
`unknown_receipt`. `/release.registries` lists the registries the payload carries.

Two guards sit beside it. `categories` or `ipcc_codes` with a non-national `geography_level`
(alone or inside a compare or timeseries) is a typed 422 `GrainUnavailable` ("category filters
are national-grain only in this release"): the core applies both filters at national grain
only, and a Punjab request for one category would otherwise silently answer with every row of
the sector. And every cell of an adm2 envelope carries the map's evidence fields
`allocation_status`, `spatial_class`, `placement_class`, `allocation_surface`, `dominant_module`,
`dominant_stream` and `spatial_class_basis` under the rule declared as
`rounding.presentation.derived.spatial_class` (the measured class of the cell's dominant stream:
the cell's module, else the request's one sector, else the module with the largest mass among the
rows summed; the module's largest reference-year atom, compared as decimals); an adm1 envelope's
province rows and cells carry `unallocated_short` (`derived.unallocated_short`).

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

Three more derived fields serve the Overview's widgets, declared the same way. `axis_ticks_short`:
any envelope whose cells all carry a numeric `exact` in one unit that is not a count (a total, a
breakdown, a compare, a timeseries, an uncertainty series) gains an envelope-level `axis =
{ticks_short, min_short, max_short, unit_short, note}`, four to six round tick labels from 0 (or
the lowest cell when one is negative) to at least the highest number any cell carries (`exact`,
`exact_high`, the quantiles), at a step of 1, 2, 2.5 or 5 × 10ⁿ never finer than 0.01, the count
nearest five (and between two as near, the finer step), each tick the two-decimal rendering with
trailing zeros trimmed: the national series gives `["0", "100", "200", "300", "400", "500"]`, the
sector breakdown `["0", "50", "100", "150", "200", "250"]`, a 0–0.9 range `["0", "0.25", "0.5",
"0.75", "1"]`, the S-vs-L compare `["-6", "-4", "-2", "0"]`. The ticks are labels, not data. `change`
on a `get_timeseries` envelope at the annual step with two or more cells: `{from_period, to_period,
from_short, to_short, change_short, change_pct_short, direction, unit_short, note}`, the endpoints
by `period_id`, `last − first` signed at two decimals (`+79.95`), `100 × (last − first) / first`
signed at one decimal (`+21.5`, `null` when the first value is zero) and `rose` / `fell` /
`unchanged`; it compares the two endpoints only and says nothing about the years between. And
beside `share_pct_short`, on exactly the same partition cells, `share_phrase` (the unrounded share
against bands with an inclusive lower bound: ≥ 90 "almost all", 60–90 "most", 55–60 "over half",
45–55 "nearly half", 30–45 "about a third", 20–30 "about a quarter", 10–20 "about a tenth", 5–10 "a
small share", < 5 "a marginal share"; agriculture's 49.4 % is "nearly half") and `rank` (1-based by
`exact`, largest first; equal exacts keep the envelope's order). None of the three reaches a
download, and no receipt moves.

## Ask PakEmis: the contract

`POST /api/v1/emissions/ask` takes `{conversation_id?, message, ui_state, client_history?}` and streams:

| event | payload |
|---|---|
| `status` | `{phase: model \| tool \| correction \| tool_limit, turn?, k?, name?, reason?}` |
| `thinking` | `{text}` summarised reasoning deltas |
| `tool_call` | `{k, id, name, input}` k = the 1-based tool call of this turn |
| `tool_result` | `{k, id, name, receipt, request_type, context, n_values, cells: [{i, display, display_short, unit, n_rows, group?, exactness?, attrs?}], limitations_hit, uncertainty, unallocated?, truncated?, download?}`; `uncertainty` is `{rows, interpretation, source: envelope\|fact_uncertainty, resolution?}` (the fact_uncertainty rows for a query_emissions scope at its resolution) or null; `n_rows` and `uncertainty` are on the event only, the model's view is unchanged |
| `refusal` | `{k, id, name, error, error_class, limitation_id, message, detail}` the typed refusal, verbatim |
| `map_action` | `{level?, geo?, period?, month?, sector?, gas?, config?, gwp?, view?}` from `set_map_view` |
| `answer` | `{text, receipts, citations, scope, elapsed_s}`; every number in `text` is `<cite k cell receipt>display</cite>`; `scope` is the last tool result's compact context plus `k`, `request_type`, `receipt`, `name`, or null |
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
`30-overview.jpg` the Overview's two-pane frame (the dashboard panel, the light basemap, the
opacity pill; `31-map.jpg` the Map page on the same basemap) and `30b-overview-scroll.jpg` its
widgets in the earlier single-column layout, `36-light-explore.jpg` the Explore page under the light theme, `33-ask.jpg` the `/ask`
page).
