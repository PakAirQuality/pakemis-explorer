# api/vendor/pakemis_query

A copy of `src/pakemis_query` of the emissions repository (/Users/rehanahmad/Desktop/emissions) at commit `3dccf78ffc667ab900912dfe5873d86042c372ed`, written by
`scripts/vendor_query_core.py` for the container image, which has no emissions checkout. In
development the API imports the checkout itself (`PAKEMIS_QUERY_PATH`, default the sibling
checkout) and falls back to this copy only when the checkout is absent. Do not edit here: refresh
with `make vendor`; `VENDOR.json` records the commit and every file's sha256 (10 files, digest
`4b91667dc70e2bade2b39bb78537997f11860d6c3bcdcace1b72c5b89e9fdcfd`), and `api/tests/test_vendor.py` proves the copy against it.

The goldens in `goldens/` are the frozen answers of commit `5915e0c0fe59ba242473f2a650acb7e85f51d175`: the served release's own, because the core is ahead of the release it serves.
