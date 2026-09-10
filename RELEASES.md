# Releases served by PakEmis Explorer

One release is pinned at a time. The pinned version is the directory `data/releases/<version>/`
that `data/fetch_release.py` writes and `data/verify_release.py` proves; the two digests below
are the bytes of `outputs/semantic/semantic_release.json` (the semantic contract, which itself
carries the sha256 of every semantic table) and `outputs/release_manifest.json` (the
release manifest, which carries the sha256 of every product including the two grid cubes).

pinned: 1.0.0rc51

| version | semantic_release.json sha256 | release_manifest.json sha256 | source |
|---|---|---|---|
| 1.0.0rc51 | aff51ddb9e74c251bc2ec23b761a3e2c4ebddf0a859469c85c134a30f072bf87 | c11fe8783cab39cfaefe3f020f16a74972ee4b4da1c68d34e63124a0fd07eb8b | git 9acbf489 (the industrial boundary, Wave A: the `industry_reported_fuel_series` limitation now leads with the covered-sources reading, the `economic_sector_view` limitation enters the contract beside the query core's derived `economic_sector` group key, the rc50 bridge repaired, the nine-year EDGAR diagnostic; national pins unmoved); Zenodo: no deposit yet |
| 1.0.0rc50 | 014cfcfce78ae439b4b5f9f110f0302e1bbdb6df47a87e4805f9fe5c18b8a9c6 | 5a82b58bd742a8426154941776f1592c06568e5e3afa9619201a03171105615f | git 19fb48c3 (the clinker re-base: eight historical 2.A.1 years on the census-implied fraction, national pins unmoved; the industrial-coal reconstruction held open beside it - the `industry_reported_fuel_series` limitation enters the contract); Zenodo: no deposit yet |
| 1.0.0rc49 | a608bb378551258ebe15e69564e57abfe94049db515b9cdb83843c78858b2ff8 | 714f62b19c8e08e558e2bb03077a12555f90a04e7866b73c9bd4737583bc747f | git latest record (air spatial family + exact district CO2e + the absence-screening ledger); Zenodo: no deposit yet |
| 1.0.0rc47 | 3fbe78f1263e5047993809f65e38706f021948277b2d31e2c9ffde0e56818957 | 848a1460559da96a74766b93c9cc1eb7955ccf906767803e7cd557afb4ddb56d | git 51b5acf9 (the air spatial lane: all-sector fact_air_adm1/adm2 on the canonical frame, the per-stream ADM2 reference, the join repairs); Zenodo: no deposit yet |
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
