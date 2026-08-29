# Releases served by PakEmis Explorer

One release is pinned at a time. The pinned version is the directory `data/releases/<version>/`
that `data/fetch_release.py` writes and `data/verify_release.py` proves; the two digests below
are the bytes of `outputs/semantic/semantic_release.json` (the semantic contract, which itself
carries the sha256 of every one of the 22 tables) and `outputs/release_manifest.json` (the
release manifest, which carries the sha256 of every product including the two grid cubes).

pinned: 1.0.0rc42

| version | semantic_release.json sha256 | release_manifest.json sha256 | source |
|---|---|---|---|
| 1.0.0rc42 | 0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d | 630d11228d768eef5e3889a916bdf5c7610f330f4327689ba38ef845e203c9ce | git 5e42b7cb125e9ba13a986c1df47129cdff6a9f8e (manifest describes bc1716d6df797d3232daf95122197eaee25fa8bd); Zenodo: no deposit yet |

To change the pin: fetch the new version, run `python3 data/verify_release.py <version>`, then
replace the `pinned:` line and add the row. The API refuses to start unless the pinned version
verifies.
