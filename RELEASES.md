# Releases served by PakEmis Explorer

One release is pinned at a time. The pinned version is the directory `data/releases/<version>/`
that `data/fetch_release.py` writes and `data/verify_release.py` proves; the two digests below
are the bytes of `outputs/semantic/semantic_release.json` (the semantic contract, which itself
carries the sha256 of every one of the 22 tables) and `outputs/release_manifest.json` (the
release manifest, which carries the sha256 of every product including the two grid cubes).

pinned: 1.0.0rc47

| version | semantic_release.json sha256 | release_manifest.json sha256 | source |
|---|---|---|---|
| 1.0.0rc47 | 1c8717bd16747c4f245beb00e5f76b5dd1e0a7b7a7859022bac30d56807895ca | 58ebe5c1bdfa06179b871c09ab759d43a18f55913fd334aa74dafca6d0f00c99 | git 88ab2489a3b5 (manifest describes 4903262f); Zenodo: no deposit yet |
| 1.0.0rc42 | 0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d | 630d11228d768eef5e3889a916bdf5c7610f330f4327689ba38ef845e203c9ce | git 5e42b7cb125e9ba13a986c1df47129cdff6a9f8e (manifest describes bc1716d6df797d3232daf95122197eaee25fa8bd); Zenodo: no deposit yet |

The payload also carries, under `data/registries/`, the twenty-one registries `GET /claim` joins
(emission factors, parameters, the uncertainty parameters, source documents and the source
register, public documents, temporal profiles, the spatial registries, validation catalogue and
scorecards, benchmarks, data gaps, the source-stream table). `FETCH.json` records each one's
source path and identity: `manifest_sources` or `manifest_products` when `release_manifest.json`
hashes the source path, `fetch` for `outputs/national_uncertainty_parameters.csv`, which neither
list carries. `verify_release.py` refuses a registry whose bytes differ from that digest. The
fetch ref is `5e42b7cb` (the commit whose contract and manifest carry the two digests above;
the manifest describes `bc1716d6`, whose tree holds no `outputs/semantic/`, so a fetch there
cannot copy the contract); every registry hashes the same at both commits.

To change the pin: fetch the new version, run `python3 data/verify_release.py <version>`, then
replace the `pinned:` line and add the row. The API refuses to start unless the pinned version
verifies.
