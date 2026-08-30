#!/usr/bin/env python3
"""fetch_release: copy one PakEmis semantic release into data/releases/<version>/.

Source A (implemented): a git checkout of the emissions repository, read at a ref through
`git show` so the working tree of that repository is never touched and a dirty tree cannot leak
into the copy.  Source B (declared, not implemented): a Zenodo record URL.

The copy mirrors the source repository's relative paths (outputs/semantic/..., data/gis/...) so
every `path` in semantic_release.json and release_manifest.json resolves inside the release
directory unchanged.  The registries the claim record joins (emission factors, parameters, source
documents, temporal profiles, the spatial registries, validation rows, benchmarks, data gaps) are
copied under data/registries/<basename> and each FETCH.json entry names its `source_path` and its
`identity`: `manifest_sources` or `manifest_products` when release_manifest.json hashes the source
path (verify_release.py then checks the copy against that digest), `fetch` when neither list
carries it (FETCH.json is its only digest).  A registry absent at the ref is skipped and said so.
FETCH.json records the ref, the commit, and a sha256 of every byte copied; verify_release.py
checks the copy against the contract, the manifest and FETCH.json.

Usage:
    python3 data/fetch_release.py --from-git /path/to/emissions --ref HEAD
    python3 data/fetch_release.py --zenodo https://zenodo.org/records/<id>   (not implemented)
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RELEASES = os.path.join(HERE, "releases")
FETCH_SCHEMA = "pakemis_explorer.fetch/v1"

# What a release directory carries beyond outputs/semantic/* and the manifest.
GEOMETRY = [
    "data/adm2_canonical.csv",
    "data/gis/PAK_ADM1.geojson",
    "data/gis/PAK_ADM2.geojson",
    "data/gis/BOUNDARY_SOURCES.json",
]
# The method registry backs get_method; it is a data file of the source repository that neither
# manifest hashes (see REPORT.md), so FETCH.json is its only digest.
EXTRA = ["data/method_registry.csv"]
# The registries GET /claim joins (api/pakemis_api/claim.py), copied to data/registries/<basename>;
# the manifest's `sources` hashes the data/ files and its `products` the outputs/ files, except
# national_uncertainty_parameters.csv, which neither list carries.
REGISTRIES_DIR = "data/registries"
REGISTRIES = [
    "data/emission_factors.csv",
    "data/parameters.csv",
    "outputs/national_uncertainty_parameters.csv",
    "data/source_documents.csv",
    "outputs/pakemis_source_register.csv",
    "data/public_documents.csv",
    "data/temporal_profiles.csv",
    "outputs/pakemis_temporal_profiles.csv",
    "data/stream_grid_proxy.csv",
    "data/stream_geometry.csv",
    "data/allowed_grid_fallbacks.csv",
    "data/geometry_sets.csv",
    "data/release_heights.csv",
    "outputs/pakemis_grid_fallbacks.csv",
    "data/validation_catalog.csv",
    "outputs/pakemis_validation_catalog.csv",
    "outputs/pakemis_validation_scorecard.csv",
    "outputs/pakemis_validation_sector_scorecard.csv",
    "data/benchmarks.csv",
    "data/data_gaps.csv",
    "outputs/pakemis_source_streams.csv",
]


def git(repo, *args, binary=False):
    out = subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True)
    return out.stdout if binary else out.stdout.decode("utf-8")


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def list_tree(repo, ref, prefix):
    names = git(repo, "ls-tree", "-r", "--name-only", ref, prefix).split("\n")
    return [n for n in names if n]


def exists_at(repo, ref, rel):
    out = subprocess.run(["git", "-C", repo, "cat-file", "-e", "%s:%s" % (ref, rel)], capture_output=True)
    return out.returncode == 0


def manifest_identity(manifest, rel):
    """(identity, sha256) for a source path: manifest_sources / manifest_products when the manifest
    hashes it, else fetch (FETCH.json is the only digest)."""
    for s in manifest.get("sources") or []:
        if s.get("path") == rel:
            return "manifest_sources", s["sha256"]
    for p in manifest.get("products") or []:
        if p.get("path") == rel:
            return "manifest_products", p["sha256"]
    return "fetch", None


def fetch_from_git(repo, ref, out_root):
    commit = git(repo, "rev-parse", ref).strip()
    contract = json.loads(git(repo, "show", "%s:outputs/semantic/semantic_release.json" % ref))
    manifest = json.loads(git(repo, "show", "%s:outputs/release_manifest.json" % ref))
    version = contract["release"]["version"]
    if manifest["version"] != version:
        sys.exit("manifest version %s != contract version %s" % (manifest["version"], version))
    paths = list_tree(repo, ref, "outputs/semantic") + ["outputs/release_manifest.json"]
    paths += [p["path"] for p in manifest["products"] if p["path"].endswith(".nc")]
    paths += GEOMETRY + EXTRA
    dest = os.path.join(out_root, version)
    files = {}
    for rel in paths:
        data = git(repo, "show", "%s:%s" % (ref, rel), binary=True)
        target = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as handle:
            handle.write(data)
        files[rel] = {"sha256": sha256_bytes(data), "bytes": len(data)}
        print("  %s  %s  %d" % (files[rel]["sha256"][:12], rel, len(data)))
    registries = {}
    for rel in REGISTRIES:
        if not exists_at(repo, ref, rel):
            print("  registry %s: absent at %s, skipped" % (rel, ref))
            continue
        data = git(repo, "show", "%s:%s" % (ref, rel), binary=True)
        dest_rel = "%s/%s" % (REGISTRIES_DIR, os.path.basename(rel))
        if dest_rel in files or dest_rel in registries:
            sys.exit("registry basename collision: %s" % dest_rel)
        target = os.path.join(dest, dest_rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as handle:
            handle.write(data)
        identity, listed = manifest_identity(manifest, rel)
        digest = sha256_bytes(data)
        if listed is not None and listed != digest:
            sys.exit("registry %s at %s hashes to %s; the manifest lists %s (fetch at the manifest's commit)" % (rel, ref, digest[:12], listed[:12]))
        registries[dest_rel] = {"sha256": digest, "bytes": len(data), "source_path": rel, "identity": identity}
        print("  %s  %s  %d  (%s <- %s)" % (digest[:12], dest_rel, len(data), identity, rel))
    files.update(registries)
    record = {
        "schema": FETCH_SCHEMA,
        "version": version,
        "release_id": contract["release"]["release_id"],
        "source": {"kind": "git", "repository": os.path.abspath(repo), "ref": ref, "commit": commit,
                   "manifest_describes_commit": (manifest.get("git") or {}).get("describes_commit")},
        "fetched_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "digests": {"semantic_release.json": files["outputs/semantic/semantic_release.json"]["sha256"],
                    "release_manifest.json": files["outputs/release_manifest.json"]["sha256"]},
        "files": dict(sorted(files.items())),
        "registries": sorted(registries),
    }
    with open(os.path.join(dest, "FETCH.json"), "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=1, sort_keys=True)
        handle.write("\n")
    print("fetched %s (%d files, %d registries) at %s -> %s" % (record["release_id"], len(files), len(registries), commit[:12], dest))
    return version


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-git", metavar="REPO", help="path to a checkout of the emissions repository")
    ap.add_argument("--ref", default="HEAD", help="git ref to read (default HEAD)")
    ap.add_argument("--zenodo", metavar="URL", help="Zenodo record URL (declared; not implemented)")
    ap.add_argument("--out", default=RELEASES, help="releases root (default data/releases)")
    args = ap.parse_args(argv)
    if args.zenodo:
        sys.exit("--zenodo is a declared placeholder: no deposit exists yet (release_manifest.json doi slots are empty)")
    if not args.from_git:
        ap.error("one of --from-git or --zenodo is required")
    fetch_from_git(args.from_git, args.ref, args.out)


if __name__ == "__main__":
    main()
