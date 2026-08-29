# PakEmis Explorer

The public frontend of PakEmis, Pakistan's national greenhouse-gas inventory (ten sectors,
FY2015-16 to FY2023-24, LULUCF excluded), and the deterministic query API under it.

**One numerical truth layer.** The paper, the charts, the downloads, the API and the future
Ask PakEmis agent are different views of the same verified release. The rule this repository
enforces at every layer:

- Every number shown anywhere is a `display` string from an API envelope that carries a
  receipt. The web app computes nothing: no sums, no rounding, no percentages, no unit changes.
- The API adds no number either. It returns `pakemis_query`'s Envelope unchanged (values with
  `exact` beside `display`, the context bar, the calculation SQL, provenance digests, unallocated
  mass, limitations hit, citation, `result_sha256`, receipt).
- A request the release cannot answer is refused by name (HTTP 422 with the error class and
  the `limitation_id`), never approximated.
- A receipt is replayed, never served from a stored result. `GET /v1/receipt/{r}` recomputes the
  stored canonical request and fails loudly if the receipt no longer reproduces.
- Map tiles carry geometry and identifiers only; values are painted through MapLibre
  `feature-state` from `/v1/spatial/*` envelopes.
- The API refuses to start unless the pinned release verifies byte-for-byte.

## Layout

```
data/fetch_release.py   copy outputs/semantic/*, the manifest, geometry and the two grid cubes
                        out of the emissions checkout at a git ref (never touching its tree)
data/verify_release.py  every table digest vs semantic_release.json; products vs the manifest;
                        every byte vs FETCH.json; the pin vs RELEASES.md
data/releases/<v>/      the payload (gitignored) + FETCH.json (committed)
RELEASES.md             the pinned version and its two digests
api/                    FastAPI over pakemis_query (imported from PAKEMIS_QUERY_PATH, never copied)
api/openapi.json        committed schema; web/src/types.gen.ts is generated from it
tiles/build_tiles.py    ADM1, ADM2 and 0.05 degree grid PMTiles keyed by name / shape_id / cell_id;
                        bboxes.json; --raster: visual-only shading PNGs of the two grid cubes
web/                    Next.js 15 + TypeScript: seven pages, ContextBar, ChartFrame, EnvelopeTable
```

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
make api      # http://localhost:8000  (docs at /docs; GET /v1/release shows the context bar and digests)
make tiles    # once per release: PMTiles + bboxes.json into web/public/tiles (needs tippecanoe)
make raster   # once per release: 78 grid-shading PNGs (2 configurations x 3 gases x 12 months + annual)
              # into web/public/tiles/raster; visual only, every value shown comes from get_grid_cell
make web      # http://localhost:3000
make types    # regenerate web/src/types.gen.ts after any API change (CI checks openapi.json is fresh)
make test     # api pytest + web vitest
docker compose up   # api + web (mounts the release and the query core read-only)
```

Python needs `fastapi uvicorn pydantic>=2 duckdb pyarrow netCDF4 numpy Pillow httpx pytest` (`api/requirements.txt`).

## The API

| route | function |
|---|---|
| `GET /v1/release` | identity, defaults, dims summary, digests, context-bar fields, placeholders |
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

Request bodies are pydantic models generated at import time from the `pakemis_query.models`
dataclasses (`api/pakemis_api/models_gen.py`); a test asserts they mirror the dataclass fields.

## What is NOT here

- No authentication, no users, no PostgreSQL. Receipts live in an in-memory map mirrored to
  `data/receipts.json`; a database is the declared home for users and conversations later.
- No agent. The Ask PakEmis page is a disabled beta card that states the rule: the agent may only
  call the typed functions above, with `{{result_cell_n}}` placeholders inserted server-side.
- No deployment, no object storage, no CDN. Tiles are static files under `web/public/tiles`.
- No copy of `pakemis_query` or of the release. Both are read from where they live.

Licences: code MIT; data and text CC-BY-4.0; OSM-derived tables ODbL (see the release's
`licences.odbl_note`). Cite as the envelope's `citation` field, which names the receipt.
