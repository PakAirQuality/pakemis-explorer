# Releases served by PakEmis Explorer

One release is pinned at a time. The pinned version is the directory `data/releases/<version>/`
that `data/fetch_release.py` writes and `data/verify_release.py` proves; the two digests below
are the bytes of `outputs/semantic/semantic_release.json` (the semantic contract, which itself
carries the sha256 of every semantic table) and `outputs/release_manifest.json` (the
release manifest, which carries the sha256 of every product including the two grid cubes).

pinned: 1.0.0rc55

| version | semantic_release.json sha256 | release_manifest.json sha256 | source |
|---|---|---|---|
| 1.0.0rc55 | 8cf24cd0d6bab300fd9aee82cb7eb6014bc037bd6c19f1bc5434adc1b8b7b71b | a89b3e04e3c5de9f4395496f9d3e9bc40c33e2eeaec3eebb326594fc0a59d68a | git 5044572a (the activity release: the data behind the estimates published so it can be used without running PakEmis - eight fact_activity_* tables over 79,676 rows from the hand-verified ingest tree, every row answering what the quantity is, where and when it applies, what kind of evidence it is, where it came from, what was changed and whether it may be combined; five registers carry the judgements and an unmapped source status fails the build; tonnes of product never become tonnes of nitrogen, monthly power is generation, and a declared district split is an allocation not an observation. No national number moves); Zenodo: no deposit yet |
| 1.0.0rc54 | df635dc28af834adf819f0c8821b21d5f16e192bae39a489cf9dcb43b73cd1a5 | e338c2fc25d67a6d683c12792d90f038658c6c4762782f39ce0f07c4cb17359a | git 30c5a697 (one meaning of "industry" across the product: the district tables carry the reporting-sector axis, so industry and power read 28.13 and 57.82 at national, provincial and district grain alike; the per-stream district vector published for all nine periods; the acceptance policy rewritten to separate a constraint from a validation from an untested input, with the official series scored on constraints too; a pinned verdict retracted; the brick scale-out defect repaired against the source's own national figure. No national number moves); Zenodo: no deposit yet |
| 1.0.0rc53 | e5832c1b7100fe08a7f47f892e1514f5ef6aafc869d407281220a011740de6c9 | ab3ba2f9a7bb53d80d512e047fce5ef4f34886fd11a61bf52cf4e8df64ee4f8d | git 09b4445a (the industrial boundary, the DIAGNOSIS release - no national number moves: the source-vintage ledger separates a reporting reallocation from a change in consumption, the reporting_sector axis files captive generation under industry where IPCC 2006 reports it, the coal account is reconciled with its residual retained, brick coal is estimated from a counted kiln fleet for the first time, and the decision record adopts nothing); Zenodo: no deposit yet |
| 1.0.0rc52 | 75bb03f5ab15bcc7089f027cddbe2c4a0fd3b06b340cb2bb2417ea66b714e8f0 | 78a16eee67fe8e2d19e5a8ef06eb5522c6c56d641853c0d229f7d0d856155717 | git 06643c3a (the industrial boundary, Waves B and C: ammonia 2.B.1, iron and steel 2.C.1 and lubricant use 2.D.1 enter the reference as nine-year series - the second deliberate re-base of the program, FY2023-24 +3.72 to L 469.63822 / S 464.50543 and every year moved by exactly its activated atoms; the brick residual narrowed by HDIP's own footnote; nitric acid a pair, soda ash NA, HFC household bank and industrial wastewater as bands beside the totals); Zenodo: no deposit yet |
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
