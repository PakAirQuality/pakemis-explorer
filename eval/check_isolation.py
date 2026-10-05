#!/usr/bin/env python3
"""Prove the three things the holdout's isolation claim rests on, and nothing more.

1. The frozen digests still match holdout.yaml and its resolved reference answers.
2. No module the agent loads at runtime names the holdout path.
3. No holdout question string occurs anywhere under api/, assistant/ or web/ - which is where
   the agent's prompt, its prepared-knowledge library and the front end live.

It cannot prove secrecy and does not claim to: see HOLDOUT.md. Exit 0 when all three hold.
"""
import hashlib
import os
import re
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HOLDOUT_DIR = os.path.join(HERE, "holdout")
SEARCHED = ("api", "assistant", "web/src", "web/public", "scripts")
SKIP_DIRS = {"node_modules", "__pycache__", ".next", "out", ".pytest_cache", "vendor", "releases"}
TEXT = re.compile(r"\.(py|ts|tsx|js|jsx|json|md|txt|yaml|yml|html|css)$")


def digests_hold():
    bad = []
    with open(os.path.join(HOLDOUT_DIR, "holdout.sha256"), encoding="utf-8") as handle:
        for line in handle:
            want, name = line.split()
            path = os.path.join(HOLDOUT_DIR, name)
            got = hashlib.sha256(open(path, "rb").read()).hexdigest()
            if got != want:
                bad.append("%s moved since the freeze (%s != %s)" % (name, got[:12], want[:12]))
    return bad


def _files():
    for top in SEARCHED:
        base = os.path.join(ROOT, top)
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                if TEXT.search(name):
                    yield os.path.join(dirpath, name)


def leaks():
    with open(os.path.join(HOLDOUT_DIR, "holdout.yaml"), encoding="utf-8") as handle:
        cases = yaml.safe_load(handle)["cases"]
    questions = {c["id"]: c["question"].strip() for c in cases}
    bad = []
    for path in _files():
        try:
            text = open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        rel = os.path.relpath(path, ROOT)
        # The RUNTIME rule: nothing the agent loads while answering may name the holdout. The
        # test suite is not loaded while answering, and the guard that enforces this very rule
        # has to name the path to find it - so api/tests is exempt from the path rule and from
        # nothing else. The question-text rule below still applies to it.
        runtime = not rel.startswith(os.path.join("api", "tests"))
        if runtime and ("eval/holdout" in text or "holdout.yaml" in text):
            bad.append("%s names the holdout path" % rel)
        for cid, q in questions.items():
            if q and q in text:
                bad.append("%s contains the %s question verbatim" % (rel, cid))
    return bad


def main():
    problems = digests_hold() + leaks()
    for p in problems:
        print("[FAIL] " + p)
    if not problems:
        print("holdout isolation: digests match; no runtime module names it; no question text leaks "
              "into api/, assistant/, web/ or scripts/.")
        print("NOT a secrecy claim - same repository, same filesystem, no access control (HOLDOUT.md).")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
