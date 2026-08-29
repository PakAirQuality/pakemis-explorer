# Wave 6 report: PakEmis Explorer shell and deterministic query API

Repository: `/Users/rehanahmad/Desktop/pakemis-explorer` (new, no remote). Nothing under
`/Users/rehanahmad/Desktop/emissions` was created, modified or deleted; the release was read with
`git show HEAD:<path>` (HEAD `5e42b7cb`; the manifest describes `bc1716d6`, the rc42 fixpoint) and
the golden files are read in place from `<emissions>/tests/semantic/golden/`.

## What was delivered

| item | state |
|---|---|
| `data/fetch_release.py --from-git ... --ref HEAD` | done: 53 files (22 CSV + 22 Parquet + contract + manifest + 2 NetCDF cubes + adm2_canonical + ADM1/ADM2 GeoJSON + BOUNDARY_SOURCES + method_registry) mirrored under `data/releases/1.0.0rc42/` with FETCH.json (ref, commit, manifest commit, sha256 + bytes per file). `--zenodo` is a declared stub (no deposit exists; the DOI slots are empty). |
| `data/verify_release.py` | done: 44 table digests (CSV bytes; Parquet re-serialised over the primary key), listed products vs manifest/contract, every byte vs FETCH.json, the RELEASES.md pin. Names the file and exits 1 on the first mismatch. |
| `RELEASES.md` | pins 1.0.0rc42, semantic_release.json `0d612d2e...`, release_manifest.json `630d1122...`. Payload gitignored, FETCH.json committed. |
| `api/` | FastAPI, one `Engine(threads=1)` per process, engine access serialised behind a lock (see defects). 13 routes; envelopes returned unchanged; `QueryError` -> 422 with `error_class` + `limitation_id`; startup refuses on any verification failure and logs the file. Request models generated from the dataclasses at import (`pakemis_api/models_gen.py`), asserted 1:1 by a test. `openapi.json` committed; `make types` -> `web/src/types.gen.ts`. |
| receipts | in-memory map + `data/receipts.json` mirror of receipt -> the CALLER's canonical request; `GET /v1/receipt/{r}` replays and answers `receipt_not_reproduced` if the recomputed receipt differs. Downloads (`.csv`, `.receipt.json`) are replays too; the ODbL block is attached when a spatial table is in provenance and an OSM-derived surface (rail/road/osm/landfill) backs a module in scope. |
| `tiles/build_tiles.py` | done: adm1 (61 KB, promoteId `name`), adm2 (632 KB, `shape_id`), grid (9.1 MB, 90,780 cells from the cube's lat/lon bounds, `cell_id`), TILES.json with input/output digests. No values in any tile. |
| `web/` | Next.js 15.5 + TypeScript, seven pages, `ContextBar`, `ChartFrame` (view data / inspect evidence / show calculation / download / cite, all from the envelope), `EnvelopeTable`, `BarChart` (ECharts; bar length from the envelope's own `value`, every label from `display`), `AdmMap` (MapLibre + pmtiles, feature-state painting). `next build` passes; vitest smoke (3 tests) passes. |
| `docker-compose.yml`, `Makefile`, `README.md` | done (images written, not built). |

## Verification

```
$ python3 data/verify_release.py
  44 semantic tables (CSV + Parquet twins) match semantic_release.json
  3 listed products present in the copy match their manifest digest
  53 fetched files match FETCH.json
  RELEASES.md pins both digests
OK PakEmis 1.0.0rc42 verified in .../data/releases/1.0.0rc42          exit 0

# one byte of fact_annual.csv flipped:
VERIFY FAILED: outputs/semantic/fact_annual.csv: sha256 d7fdaf2c... != contract 8e141394...   exit 1
```

`pytest api/tests`: 35 passed. The 16 goldens replay over HTTP with the frozen receipts and
display values (the five refusal goldens as 422 of the right class); three startup-refusal tests
(tampered CSV, cube, boundary file); openapi freshness; model/dataclass mirror; receipt
determinism across two app instances; a refusal matrix; the grid cell; envelope shape; ten
parallel POSTs.

`curl localhost:8000/v1/release` (excerpt):
```
version 1.0.0rc42   release_id "PakEmis 1.0.0rc42"   commit bc1716d6df797d3232daf95122197eaee25fa8bd
context_bar {release, basis fiscal, configuration_id REF_2023_24, gwp_basis AR5, geography_id PK,
             reporting_period FY2023-24 2023-07-01..2024-06-30, lulucf excluded (NE)}
digests.semantic_release_json 0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d
digests.release_manifest_json 630d11228d768eef5e3889a916bdf5c7610f330f4327689ba38ef845e203c9ce
digests.tables: 22 entries (fact_annual 8e141394...); digests.products: the two .nc cubes
```

`npm run types && git diff --exit-code`: clean. `python3 api/export_openapi.py --check`: fresh.
`next build`: 8 routes, all static, no type or lint errors.

### Manual walk (production build on :3000 against the API on :8000, read through Chrome)

| page | shows | one real number | receipt |
|---|---|---|---|
| Overview | L/S x AR5/AR6 totals, sector bars | L AR5 452.34662 Mt CO2e (S AR5 447.21383; L AR6 445.43983; S AR6 440.45244) | `cd4341a5...` (the body names configuration and GWP explicitly; the golden's `5eb40940...` is the defaults-only request and is reproduced by the test suite) |
| Inventory Explorer | period/configuration/GWP selectors, sector and category x gas frames | agriculture 223.454 Mt | `93aa968b...` |
| Spatial Explorer | ADM1 envelope, unallocated table beside the map, grid-cell lookup, province bars | Punjab 228.7168 Mt; unallocated Punjab exact `4.837161474822386761` | `3ddaf21e...` |
| Compare | S minus L national and by sector; two periods by sector; the annual series | S minus L -5.133 Mt (exact -5.13279) | `9da13e3f...`; series `1440719b...` (= golden) |
| Evidence & Methods | stream lineage (189 streams), method registry row, national uncertainty, the 37 NE rows | buffalo enteric grade E2 / T4 / S3; national P50 456.914 [407.282, 533.733] | `fc2d3aeb...`; completeness `cc11fb8a...` (= golden) |
| Ask PakEmis | disabled beta card listing the 11 typed functions and the placeholder rule | none by design | n/a |
| Downloads & API | sector x gas table with CSV/RECEIPT.json links, receipt replay box, all 22 table digests + cube digests | agriculture CH4 181.926 Mt | `73607b6c...` |

## Defects found while building

1. Parallel requests hung the API. FastAPI runs sync handlers on a threadpool; the first browser
   page fired five POSTs at once and DuckDB's single connection deadlocked (even `/healthz` hung).
   Fixed by serialising all engine work behind one lock in `Service.run`;
   `api/tests/test_concurrency.py` fires ten parallel POSTs and asserts the receipts match a serial run.
2. Receipt replay stored the wrong request. Storing the envelope's `request` (the engine's filled
   request, with `defaults_applied`) and replaying it re-derived a different receipt; the store now
   keeps the caller's canonical request and the goldens replay to their frozen receipts.
3. `openapi-typescript` marks every defaulted field required; the client wraps the generated types
   in `DeepPartial` (the contract fills every omitted field server-side) instead of hand-editing them.

## What is incomplete, and why

- The choropleth was not visually confirmed. The Chrome automation window is hidden
  (`document.visibilityState === "hidden"`; `requestAnimationFrame` never fires) and MapLibre
  loads its style on an animation frame, so the map stayed at its background colour there. The
  container, canvas, attribution control, PMTiles range requests (HTTP 206) and the feature-state
  painting code are in place, and the `/v1/spatial/*` numbers beside the map are live; it needs one
  look in a visible browser. A `Map error:` banner surfaces any MapLibre error on the page and
  `window.__pakemisMap` is exposed for inspection (it holds no numbers).
- The grid layer (90,780 cells) is built and served but not drawn; the grid-cell lookup uses map
  clicks against the cube through `/v1/spatial/grid`.
- ADM2 is drawn as outlines only; an ADM2 choropleth needs a colour convention for the bounded
  `[low, high]` cells, which the envelope states and the map does not yet decide.
- `get_method` and `get_grid_cell` carry a `null` provenance digest: `data/method_registry.csv` is
  in neither manifest (a finding for the emissions repo; FETCH.json is its only digest here) and
  the cubes are manifest products, not semantic products, which is what `product_digest` reads.
- "Other" (the residual territories row) has no polygon; ADM1 features are keyed by name because
  `dim_geography` carries no ADM1 shape_id.
- Docker images written, not built or run. No auth, PostgreSQL, agent or object storage: declared
  placeholders in `/v1/release.placeholders`.

## How to run

```
export PAKEMIS_QUERY_PATH=/Users/rehanahmad/Desktop/emissions/src
make verify && make api                      # :8000
make tiles                                   # once per release
cd web && npm run build && npm run start     # :3000
```
