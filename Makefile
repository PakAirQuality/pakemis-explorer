# PakEmis Explorer - one numerical truth layer; every target below is a view of it.
EMISSIONS ?= /Users/rehanahmad/Desktop/emissions
REF       ?= HEAD
VERSION   ?= $(shell sed -n 's/^pinned:[[:space:]]*//p' RELEASES.md)
export PAKEMIS_QUERY_PATH ?= $(EMISSIONS)/src

BUCKET    ?= pakemis-releases

.PHONY: fetch verify library api web types openapi tiles raster test test-api test-web build vendor docker-build docker-run push-release deploy

fetch:              ## copy a semantic release out of the emissions checkout at $(REF)
	python3 data/fetch_release.py --from-git $(EMISSIONS) --ref $(REF)

verify:             ## prove data/releases/$(VERSION) against the contract, the manifest, FETCH.json and RELEASES.md
	python3 data/verify_release.py $(VERSION)

api: verify         ## serve the API on :8000 under /api/v1/emissions (one process, one DuckDB engine, threads=1); api/.env (gitignored) is sourced for the agent's key
	set -a; [ -f api/.env ] && . api/.env; set +a; \
	cd api && python3 -m uvicorn pakemis_api.app:app --host 0.0.0.0 --port 8000 --workers 1

openapi:            ## regenerate api/openapi.json from the app
	python3 api/export_openapi.py

types: openapi      ## regenerate web/src/types.gen.ts from api/openapi.json
	cd web && npx --yes openapi-typescript ../api/openapi.json -o src/types.gen.ts

tiles:              ## ADM1/ADM2/grid PMTiles (geometry + ids only) + bboxes.json into data/releases/$(VERSION)/tiles (served by the API; copied to web/public/tiles for one release)
	python3 tiles/build_tiles.py

raster:             ## visual-only grid rasters (2 configurations x 3 gases x 13 frames) + bboxes.json; numpy + Pillow, no tippecanoe
	python3 tiles/build_tiles.py --raster

library:            ## rebuild the assistant's cards + source register from the pinned payload, then copy them into the API package the server imports
	python3 assistant/scripts/build_sources.py
	python3 scripts/vendor_library.py

vendor:             ## copy pakemis_query out of $(EMISSIONS) at $(REF) into api/vendor for the image (VENDOR.json: commit + digests)
	python3 scripts/vendor_query_core.py --emissions $(EMISSIONS) --ref $(REF)

docker-build: vendor  ## the Cloud Run image, built from the repository root (api/Dockerfile)
	docker build -t pakemis -f api/Dockerfile .

docker-run:         ## serve the image on :8080 with the local release payload mounted; api/.env is NOT passed
	docker run --rm -p 8080:8080 -v $(PWD)/data/releases:/app/data/releases:ro -e PAKEMIS_RELEASE_VERSION=$(VERSION) pakemis

push-release:       ## upload data/releases/$(VERSION) (payload + tiles) to gs://$(BUCKET)/releases/$(VERSION) for the service to pull
	gsutil -m rsync -r data/releases/$(VERSION) gs://$(BUCKET)/releases/$(VERSION)

deploy:             ## Cloud Build: image + Cloud Run service `pakemis` (cloudbuild.yaml)
	gcloud builds submit --config cloudbuild.yaml --substitutions _RELEASES_BUCKET=$(BUCKET),_RELEASE_VERSION=$(VERSION) .

web:                ## Next.js dev server on :3000 (NEXT_PUBLIC_API_BASE defaults to http://localhost:8000/api/v1/emissions)
	cd web && npm run dev

build:              ## production build of the web app
	cd web && npm run build

test-api:
	cd api && python3 -m pytest tests -q

test-web:
	cd web && npm test -- --run

test: test-api test-web
