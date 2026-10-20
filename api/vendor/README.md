# api/vendor/pakemis_query

A copy of `src/pakemis_query` of the emissions repository (/Users/rehanahmad/Desktop/emissions) at commit `3dccf78ffc667ab900912dfe5873d86042c372ed`, written by
`scripts/vendor_query_core.py` for the container image, which has no emissions checkout. In
development the API imports the checkout itself (`PAKEMIS_QUERY_PATH`, default the sibling
checkout) and falls back to this copy only when the checkout is absent. Do not edit here: refresh
with `make vendor`; `VENDOR.json` records the commit and every file's sha256 (10 files, digest
`1a8909c39b49c9f25a0a98714725490c0a094009d5f71c3858b4a1ddf3aee04f`), and `api/tests/test_vendor.py` proves the copy against it.

The goldens in `goldens/` are the frozen answers of commit `5915e0c0fe59ba242473f2a650acb7e85f51d175`: the served release's own, because the core is ahead of the release it serves.

On top of that commit, these patches from `patches/` are applied in order (digests in
`VENDOR.json`): `0001-province-names-its-districts.patch`. Each repeats a commit of the inventory's core, named on its first line.
