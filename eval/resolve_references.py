#!/usr/bin/env python3
"""Establish every case's reference answer by EXECUTION against the pinned release.

    python3 eval/resolve_references.py                 # both splits
    python3 eval/resolve_references.py --split dev

Each case's truth spec is run through the same Service the API serves from, and the resolved
values are written beside the case file as <name>.resolved.json, keyed by case id. A case whose
spec does not resolve is a FAILURE OF THE CASE, not of the agent, and the run exits non-zero
naming it - so a release that moves under the set is caught here rather than scored as a wrong
answer later.

The resolved file records the release version and the payload's semantic digest, so a scorecard
can state which data its reference answers came from.
"""
import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = os.path.join(ROOT, "api")
sys.path.insert(0, API)
sys.path.insert(0, HERE)
os.environ.setdefault("PAKEMIS_API_LAZY", "1")
os.environ.setdefault("PAKEMIS_QUERY_PATH", "/Users/rehanahmad/Desktop/emissions/src")

import yaml  # noqa: E402

from pakemis_api.settings import Settings  # noqa: E402

FILES = {"dev": os.path.join(HERE, "cases", "dev.yaml"),
         "holdout": os.path.join(HERE, "holdout", "holdout.yaml")}


def load(split):
    with open(FILES[split], encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=("dev", "holdout", "both"), default="both")
    args = ap.parse_args()

    settings = Settings.from_env()
    sys.path.insert(0, settings.query_path)
    from pakemis_api.app import Service
    from lib.truth import resolve_case

    service = Service(settings)
    manifest_digest = hashlib.sha256(open(settings.manifest_path, "rb").read()).hexdigest()[:16]

    splits = ("dev", "holdout") if args.split == "both" else (args.split,)
    failures = []
    for split in splits:
        doc = load(split)
        out = {"release_version": settings.version, "manifest_sha256_16": manifest_digest,
               "split": split, "cases": {}}
        for case in doc["cases"]:
            try:
                out["cases"][case["id"]] = resolve_case(service, case)
            except Exception as exc:                       # noqa: BLE001 - reported, not swallowed
                failures.append("%s/%s: %s: %s" % (split, case["id"], type(exc).__name__, exc))
        path = FILES[split].replace(".yaml", ".resolved.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(out, handle, indent=1, sort_keys=True)
            handle.write("\n")
        print("%s: %d/%d cases resolved -> %s" % (split, len(out["cases"]), len(doc["cases"]), path))
    for f in failures:
        print("[FAIL] " + f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
