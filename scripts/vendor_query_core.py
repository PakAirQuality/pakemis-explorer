#!/usr/bin/env python3
"""Copy pakemis_query out of the emissions checkout into api/vendor/pakemis_query, recording where
it came from, so the container image (which has no emissions checkout) can import the query core.

    python3 scripts/vendor_query_core.py [--emissions PATH] [--ref HEAD]   # refresh the copy
    python3 scripts/vendor_query_core.py --check                          # exit 1 if the copy differs from VENDOR.json

The files are read through `git show <ref>:src/pakemis_query/<file>` (never the working tree, so
a dirty checkout cannot leak in); api/vendor/VENDOR.json records the repository, the commit, the
sha256 of every file and one digest over them; api/vendor/README.md restates the commit.
In development the API still imports the checkout itself when it is present
(pakemis_api.settings.default_query_path): the vendored copy is the fallback, and the image's only source.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VENDOR = os.path.join(ROOT, "api", "vendor")
PACKAGE = "pakemis_query"
SOURCE_SUBDIR = "src/" + PACKAGE
# The goldens are vendored FROM THE SAME COMMIT as the engine, and for the same reason.
# Until they were, conftest read them in place from a live checkout while the app served a
# pinned release: when the emissions tree moved past the vendored commit, four fixtures that
# a later release had refrozen produced twenty value mismatches across three test modules,
# none of which said anything about the API. Paired at one vintage the same suite is green.
GOLDEN_SUBDIR = "tests/semantic/golden"
GOLDEN_DIR = "goldens"
DEFAULT_EMISSIONS = "/Users/rehanahmad/Desktop/emissions"
SCHEMA = "pakemis_explorer.vendor/v1"


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True).stdout


def vendored_files():
    out = {}
    pkg = os.path.join(VENDOR, PACKAGE)
    for base, dirs, files in os.walk(pkg):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for f in files:
            if f.endswith(".pyc"):
                continue
            path = os.path.join(base, f)
            with open(path, "rb") as handle:
                out[os.path.relpath(path, pkg).replace(os.sep, "/")] = sha256_bytes(handle.read())
    return out


def vendored_goldens():
    out = {}
    base = os.path.join(VENDOR, GOLDEN_DIR)
    if not os.path.isdir(base):
        return out
    for f in sorted(os.listdir(base)):
        if not f.endswith(".json"):
            continue
        with open(os.path.join(base, f), "rb") as handle:
            out[f] = sha256_bytes(handle.read())
    return out


def combined_digest(files):
    return sha256_bytes("".join("%s %s\n" % (k, files[k]) for k in sorted(files)).encode("utf-8"))


def record_path():
    return os.path.join(VENDOR, "VENDOR.json")


def check():
    """0 when every vendored file has its recorded digest and nothing is missing or extra."""
    if not os.path.exists(record_path()):
        print("api/vendor/VENDOR.json is absent; run scripts/vendor_query_core.py", file=sys.stderr)
        return 1
    with open(record_path(), encoding="utf-8") as handle:
        rec = json.load(handle)
    got = vendored_files()
    for rel in sorted(set(rec["files"]) | set(got)):
        if rec["files"].get(rel) != got.get(rel):
            print("api/vendor/%s/%s differs from VENDOR.json (recorded %s, present %s)" % (PACKAGE, rel, rec["files"].get(rel), got.get(rel)), file=sys.stderr)
            return 1
    if combined_digest(got) != rec["digest"]:
        print("VENDOR.json digest mismatch", file=sys.stderr)
        return 1
    recorded = rec.get("goldens")
    if recorded:
        present = vendored_goldens()
        for rel in sorted(set(recorded["files"]) | set(present)):
            if recorded["files"].get(rel) != present.get(rel):
                print("api/vendor/%s/%s differs from VENDOR.json (recorded %s, present %s)"
                      % (GOLDEN_DIR, rel, recorded["files"].get(rel), present.get(rel)), file=sys.stderr)
                return 1
        if combined_digest(present) != recorded["digest"]:
            print("VENDOR.json goldens digest mismatch", file=sys.stderr)
            return 1
    print("api/vendor/%s intact: %d files, commit %s, digest %s" % (PACKAGE, len(got), rec["source"]["commit"], rec["digest"][:16]))
    return 0


def vendor(emissions, ref):
    if not os.path.isdir(os.path.join(emissions, SOURCE_SUBDIR)):
        raise SystemExit("%s has no %s" % (emissions, SOURCE_SUBDIR))
    commit = git(emissions, "rev-parse", ref).decode().strip()
    listing = git(emissions, "ls-tree", "-r", "--name-only", commit, SOURCE_SUBDIR).decode().split("\n")
    rels = [p[len(SOURCE_SUBDIR) + 1:] for p in listing if p and not p.endswith(".pyc") and "__pycache__" not in p]
    pkg = os.path.join(VENDOR, PACKAGE)
    if os.path.isdir(pkg):
        for base, dirs, files in os.walk(pkg, topdown=False):
            for f in files:
                os.remove(os.path.join(base, f))
            for d in dirs:
                os.rmdir(os.path.join(base, d))
    files = {}
    for rel in rels:
        data = git(emissions, "show", "%s:%s/%s" % (commit, SOURCE_SUBDIR, rel))
        path = os.path.join(pkg, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
        files[rel] = sha256_bytes(data)
    # the goldens, at the same commit
    gdir = os.path.join(VENDOR, GOLDEN_DIR)
    if os.path.isdir(gdir):
        for f in os.listdir(gdir):
            os.remove(os.path.join(gdir, f))
    os.makedirs(gdir, exist_ok=True)
    glisting = git(emissions, "ls-tree", "-r", "--name-only", commit, GOLDEN_SUBDIR).decode().split("\n")
    goldens = {}
    for path_in_repo in glisting:
        if not path_in_repo.endswith(".json"):
            continue
        rel = path_in_repo[len(GOLDEN_SUBDIR) + 1:]
        data = git(emissions, "show", "%s:%s" % (commit, path_in_repo))
        with open(os.path.join(gdir, rel), "wb") as handle:
            handle.write(data)
        goldens[rel] = sha256_bytes(data)

    dirty = bool(git(emissions, "status", "--short", "--", SOURCE_SUBDIR).strip())
    rec = {"schema": SCHEMA, "package": PACKAGE,
           "source": {"kind": "git", "repository": emissions, "ref": ref, "commit": commit, "subdir": SOURCE_SUBDIR,
                      "working_tree_dirty_at_vendoring": dirty},
           "vendored_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
           "files": files, "digest": combined_digest(files),
           "goldens": {"subdir": GOLDEN_SUBDIR, "files": goldens, "digest": combined_digest(goldens)},
           "rule": "a copy for the container image only; development imports the checkout (PAKEMIS_QUERY_PATH); refresh with scripts/vendor_query_core.py, never edit here"}
    with open(record_path(), "w", encoding="utf-8") as handle:
        json.dump(rec, handle, indent=1, sort_keys=True)
        handle.write("\n")
    with open(os.path.join(VENDOR, "README.md"), "w", encoding="utf-8") as handle:
        handle.write("# api/vendor/%s\n\nA copy of `%s` of the emissions repository (%s) at commit `%s`, written by\n"
                     "`scripts/vendor_query_core.py` for the container image, which has no emissions checkout. In\n"
                     "development the API imports the checkout itself (`PAKEMIS_QUERY_PATH`, default the sibling\n"
                     "checkout) and falls back to this copy only when the checkout is absent. Do not edit here: refresh\n"
                     "with `make vendor`; `VENDOR.json` records the commit and every file's sha256 (%d files, digest\n"
                     "`%s`), and `api/tests/test_vendor.py` proves the copy against it.\n"
                     % (PACKAGE, SOURCE_SUBDIR, emissions, commit, len(files), rec["digest"]))
    print("vendored %d files of %s at %s%s into api/vendor/%s (digest %s)" % (len(files), SOURCE_SUBDIR, commit[:12], " (working tree dirty)" if dirty else "", PACKAGE, rec["digest"][:16]))
    print("vendored %d goldens of %s at the same commit (digest %s)" % (len(goldens), GOLDEN_SUBDIR, rec["goldens"]["digest"][:16]))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--emissions", default=os.environ.get("EMISSIONS", DEFAULT_EMISSIONS))
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--check", action="store_true", help="verify api/vendor against VENDOR.json; write nothing")
    args = ap.parse_args(argv)
    if args.check:
        return check()
    if not os.path.isdir(os.path.join(args.emissions, SOURCE_SUBDIR)):
        # no checkout on this machine (CI, the container build): the committed copy must be intact
        print("%s is absent; checking the committed copy instead" % args.emissions)
        return check()
    return vendor(args.emissions, args.ref)


if __name__ == "__main__":
    sys.exit(main())
