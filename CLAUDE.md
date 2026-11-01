# PakEmis Explorer — repo instructions for Claude

The public frontend (`emissions.hawanama.org`), its query API and Ask PakEmis. The README is the
reference; this file holds the rules that have bitten.

## Where things are

- The inventory is a separate public repository, `PakAirQuality/pakistan-emissions-sectors`, cloned
  beside this one (`../pakistan-emissions-sectors`, the default of `EMISSIONS` and of
  `PAKEMIS_QUERY_PATH` outside `make`). The explorer never writes into it; it reads one release at a
  git ref (`make fetch`) and serves that pin.
- The manuscripts are private (`PakAirQuality/pakemis-manuscripts`). This public repository never
  names a manuscript path.
- The restricted source layers are not needed here and are not shared.

## Invariants

- **The web app computes no number.** Every figure is a string from an API envelope; a `value` may
  only size a bar or shade a polygon. The API adds no number either. Tests enforce both
  (`__tests__/naming.test.tsx`, the decimal walks in the component tests, the agent's bare-number gate).
- **One release is pinned** (`RELEASES.md`, `pinned:`). The API refuses to start unless that payload
  verifies byte for byte (`make verify`). To move the pin: `make fetch REF=<commit>`, `make verify`,
  edit `RELEASES.md`, `make tiles raster library`, then `make facts`, `make test`.
- **Secrets live only in ignored env files**: `api/.env`, `web/.env.local`,
  `web/.env.production.local`. Never print, commit or paste them. A web deploy from a machine without
  `web/.env.production.local` silently ships the old unrestricted Mapbox token.
- **The vendored core is a pinned commit plus patches** (`api/vendor/`, `scripts/vendor_query_core.py`,
  `api/vendor/patches/`); it is what the image ships. Goldens are vendored at the same commit.
- Tests: `make test` (API pytest + web vitest). Run them before every push.

## Deploying (needs access to GCP project `hawanama-2`)

- API: `make push-release` (payload to `gs://pakemis-releases/releases/<v>/`), then `make deploy`
  (Cloud Build → Cloud Run service `pakemis`, asia-south1). App Check is enforcing (`_APP_CHECK` in
  `cloudbuild.yaml`). Cloud Run traffic has been pinned to a revision before, so check that a deploy
  actually receives traffic.
- Web: `make deploy-web` (public static build → Firebase Hosting target `pakemis`). After any pin
  change run `make facts` first: the loading screen's numbers come from the served release.

## Open work (November 2026)

- **Re-pin rc59 → rc70.** The inventory's layout migrated after rc59: `data/fetch_release.py` still
  names pre-migration paths (`data/gis/PAK_ADM1.geojson`, `data/method_registry.csv`,
  `data/adm2_canonical.csv`, …; now under `data/shared/…`), and the two month facts ship as
  `outputs/semantic/fact_adm{1,2}_month.parquet`. The current core speaks the ten-year
  configuration ids, so the vendored core and its patches move with the pin.
- Who decides what: see `PROJECT_RESPONSIBILITIES.md` in the manuscripts repository.
