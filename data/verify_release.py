#!/usr/bin/env python3
"""verify_release: prove that data/releases/<version>/ is the release it claims to be.

Checks, in order, naming the first file that fails and exiting non-zero:
  1. every semantic table's CSV sha256 equals semantic_release.json's sha256_csv;
  2. every Parquet twin re-serialises (canonical CSV text over the primary key) to that digest;
  3. every product listed in release_manifest.json or in the contract's `products` that is present
     in the release directory has the listed sha256 (the two NetCDF cubes, adm2_canonical.csv);
  4. every file FETCH.json recorded still has its recorded digest (the boundary files, the method
     registry, the manifest and the contract themselves);
  5. every registry under data/registries/ whose FETCH.json entry claims a manifest identity
     (manifest_sources | manifest_products) hashes to the digest release_manifest.json lists for its
     source path; a claimed identity the manifest does not carry is a mismatch too;
  6. the version's row in RELEASES.md pins the same two digests FETCH.json recorded.

Usage: python3 data/verify_release.py [version]   (default: the version pinned in RELEASES.md)
"""
import csv
import hashlib
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "api"))
from pakemis_api.assets import ReleaseAssets
RELEASES = os.path.join(HERE, "releases")


class Mismatch(Exception):
    pass


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parquet_digest(path, table):
    import pyarrow.parquet as pq
    rows = pq.read_table(path).to_pylist()
    ordered = sorted(rows, key=lambda r: tuple(str(r[k]) for k in table["primary_key"]))
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=list(table["columns"]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(ordered)
    return hashlib.sha256(buf.getvalue().encode("utf-8")).hexdigest()


def pinned_version(releases_md):
    with open(releases_md, encoding="utf-8") as handle:
        for line in handle:
            m = re.match(r"^\s*pinned:\s*(\S+)", line)
            if m:
                return m.group(1)
    raise Mismatch("RELEASES.md carries no 'pinned:' line")


def pinned_digests(releases_md, version):
    """The `| version | semantic_release.json sha256 | release_manifest.json sha256 |` row."""
    with open(releases_md, encoding="utf-8") as handle:
        for line in handle:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 3 and cells[0] == version and re.fullmatch(r"[0-9a-f]{64}", cells[1] or ""):
                return cells[1], cells[2]
    raise Mismatch("RELEASES.md has no digest row for %s" % version)


def verify(version, releases_root=RELEASES, releases_md=os.path.join(ROOT, "RELEASES.md"), log=print):
    d = os.path.join(releases_root, version)
    if not os.path.isdir(d):
        raise Mismatch("%s: release directory is absent (run data/fetch_release.py)" % d)
    contract_path = os.path.join(d, "outputs", "semantic", "semantic_release.json")
    with open(contract_path, encoding="utf-8") as handle:
        contract = json.load(handle)
    if contract["release"]["version"] != version:
        raise Mismatch("%s: contract names version %s" % (contract_path, contract["release"]["version"]))
    # Cache only within this audit: every fresh startup still verifies current bytes.
    file_digests = {}
    def digest(path):
        path = os.path.realpath(path)
        if path not in file_digests:
            file_digests[path] = sha256_file(path)
        return file_digests[path]

    checked = 0
    tables = dict(contract["dimensions"], **contract["facts"])
    for name, table in tables.items():
        csv_path = os.path.join(d, table["path"])
        if not os.path.exists(csv_path):
            raise Mismatch("%s: %s is absent" % (name, csv_path))
        got = digest(csv_path)
        if got != table["sha256_csv"]:
            raise Mismatch("%s: sha256 %s != contract %s" % (table["path"], got, table["sha256_csv"]))
        checked += 1
        pq_path = os.path.join(d, table["parquet"]["path"])
        if os.path.exists(pq_path):
            got = parquet_digest(pq_path, table)
            if got != table["sha256_csv"]:
                raise Mismatch("%s: canonical text %s != contract %s" % (table["parquet"]["path"], got, table["sha256_csv"]))
            checked += 1
    log("  %d semantic tables (CSV + Parquet twins) match semantic_release.json" % checked)

    assets = ReleaseAssets(contract, d)
    for asset in assets.entries.values():
        if not asset.get("packaged"):
            continue
        path = assets.path(asset)
        if not os.path.isfile(path) or digest(path) != asset["sha256"]:
            raise Mismatch("release asset missing or changed: %s" % asset["path"])
    for table in contract.get("activity_inputs", {}).get("tables", []) if not assets.catalog else []:
        path = os.path.join(d, table["path"])
        if not os.path.isfile(path):
            raise Mismatch("canonical input is absent: %s" % table["path"])
        if digest(path) != table["sha256"]:
            raise Mismatch("canonical input differs from the contract: %s" % table["path"])

    manifest_path = os.path.join(d, "outputs", "release_manifest.json")
    with open(manifest_path, encoding="utf-8") as handle:
        manifest = json.load(handle)
    if manifest["version"] != version:
        raise Mismatch("%s: manifest names version %s" % (manifest_path, manifest["version"]))
    listed = 0
    for product in list(manifest["products"]) + list(contract["products"]):
        path = os.path.join(d, product["path"])
        if os.path.exists(path):
            got = digest(path)
            if got != product["sha256"]:
                raise Mismatch("%s: sha256 %s != listed %s" % (product["path"], got, product["sha256"]))
            listed += 1
    log("  %d listed products present in the copy match their manifest digest" % listed)

    fetch_path = os.path.join(d, "FETCH.json")
    with open(fetch_path, encoding="utf-8") as handle:
        fetch = json.load(handle)
    for rel, rec in fetch["files"].items():
        path = os.path.join(d, rel)
        if not os.path.exists(path):
            raise Mismatch("%s: recorded in FETCH.json but absent" % rel)
        got = digest(path)
        if got != rec["sha256"]:
            raise Mismatch("%s: sha256 %s != FETCH.json %s" % (rel, got, rec["sha256"]))
    log("  %d fetched files match FETCH.json" % len(fetch["files"]))

    listed_sources = {s.get("path"): s.get("sha256") for s in manifest.get("sources") or []}
    listed_products = {p.get("path"): p.get("sha256") for p in manifest.get("products") or []}
    registries = 0
    for rel, rec in fetch["files"].items():
        identity = rec.get("identity")
        if identity is None:
            continue
        source_path = rec.get("source_path") or rel
        if identity == "manifest_sources":
            listed = listed_sources.get(source_path)
        elif identity == "manifest_products":
            listed = listed_products.get(source_path)
        elif identity == "fetch":
            listed = rec["sha256"]
        else:
            raise Mismatch("%s: unknown identity %r in FETCH.json" % (rel, identity))
        if listed is None:
            raise Mismatch("%s: FETCH.json claims identity %s but the manifest does not list %s" % (rel, identity, source_path))
        got = digest(os.path.join(d, rel))
        if got != listed:
            raise Mismatch("%s: sha256 %s != the manifest's %s for %s (%s)" % (rel, got, listed, source_path, identity))
        registries += 1
    log("  %d registries match their declared identity (manifest sources/products or FETCH.json)" % registries)

    if os.path.exists(releases_md):
        sem, man = pinned_digests(releases_md, version)
        if sem != fetch["digests"]["semantic_release.json"]:
            raise Mismatch("RELEASES.md pins semantic_release.json %s; the copy is %s" % (sem, fetch["digests"]["semantic_release.json"]))
        if man != fetch["digests"]["release_manifest.json"]:
            raise Mismatch("RELEASES.md pins release_manifest.json %s; the copy is %s" % (man, fetch["digests"]["release_manifest.json"]))
        log("  RELEASES.md pins both digests")
    return {"version": version, "release_id": contract["release"]["release_id"], "directory": d,
            "semantic_release_sha256": fetch["digests"]["semantic_release.json"],
            "release_manifest_sha256": fetch["digests"]["release_manifest.json"],
            "commit": fetch["source"]["commit"],
            "semantic_tables": {name: table["sha256_csv"] for name, table in tables.items()},
            "file_digests": file_digests}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    releases_md = os.path.join(ROOT, "RELEASES.md")
    version = argv[0] if argv else pinned_version(releases_md)
    try:
        out = verify(version)
    except Mismatch as exc:
        print("VERIFY FAILED: %s" % exc, file=sys.stderr)
        return 1
    print("OK %s verified in %s" % (out["release_id"], out["directory"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
