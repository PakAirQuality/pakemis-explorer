# PakEmis Explorer - one numerical truth layer; every target below is a view of it.
EMISSIONS ?= /Users/rehanahmad/Desktop/emissions
REF       ?= HEAD
VERSION   ?= $(shell sed -n 's/^pinned:[[:space:]]*//p' RELEASES.md)
export PAKEMIS_QUERY_PATH ?= $(EMISSIONS)/src

.PHONY: fetch verify api web types openapi tiles test test-api test-web build

fetch:              ## copy a semantic release out of the emissions checkout at $(REF)
	python3 data/fetch_release.py --from-git $(EMISSIONS) --ref $(REF)

verify:             ## prove data/releases/$(VERSION) against the contract, the manifest, FETCH.json and RELEASES.md
	python3 data/verify_release.py $(VERSION)

api: verify         ## serve the API on :8000 (one process, one DuckDB engine, threads=1)
	cd api && python3 -m uvicorn pakemis_api.app:app --host 0.0.0.0 --port 8000 --workers 1

openapi:            ## regenerate api/openapi.json from the app
	python3 api/export_openapi.py

types: openapi      ## regenerate web/src/types.gen.ts from api/openapi.json
	cd web && npx --yes openapi-typescript ../api/openapi.json -o src/types.gen.ts

tiles:              ## ADM1/ADM2/grid PMTiles (geometry + ids only) into tiles/out and web/public/tiles
	python3 tiles/build_tiles.py

web:                ## Next.js dev server on :3000 (NEXT_PUBLIC_PAKEMIS_API defaults to http://localhost:8000)
	cd web && npm run dev

build:              ## production build of the web app
	cd web && npm run build

test-api:
	cd api && python3 -m pytest tests -q

test-web:
	cd web && npm test -- --run

test: test-api test-web
