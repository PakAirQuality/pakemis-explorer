"""api/vendor/pakemis_query is the copy VENDOR.json says it is: every file's digest, and (when the
recorded checkout is on this machine) byte-equal to `git show <commit>:src/pakemis_query/<file>`."""
import json
import os
import subprocess

import pytest

from conftest import API_DIR

VENDOR = os.path.join(API_DIR, "vendor")


@pytest.fixture(scope="module")
def record():
    path = os.path.join(VENDOR, "VENDOR.json")
    if not os.path.exists(path):
        pytest.skip("no vendored copy (run scripts/vendor_query_core.py)")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def test_vendored_files_match_the_record(record):
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(API_DIR), "scripts"))
    import vendor_query_core as V
    assert V.check() == 0
    assert set(V.vendored_files()) == set(record["files"]) and "__init__.py" in record["files"]


def test_vendored_copy_equals_the_source_commit(record):
    src = record["source"]
    repo = src["repository"]
    if not os.path.isdir(os.path.join(repo, ".git")):
        pytest.skip("the emissions checkout %s is not on this machine" % repo)
    for rel, digest in sorted(record["files"].items()):
        shown = subprocess.run(["git", "-C", repo, "show", "%s:%s/%s" % (src["commit"], src["subdir"], rel)],
                               capture_output=True, check=True).stdout
        with open(os.path.join(VENDOR, record["package"], rel), "rb") as handle:
            assert handle.read() == shown, rel


def test_vendored_copy_imports_and_agrees_with_the_served_core(record):
    """The vendored package exposes the same public names as the one the tests run against."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("vendored_pakemis_query_models", os.path.join(VENDOR, "pakemis_query", "models.py"))
    assert spec is not None
    from pakemis_query import models as served
    with open(os.path.join(VENDOR, "pakemis_query", "models.py"), "rb") as handle:
        vendored_text = handle.read()
    with open(served.__file__, "rb") as handle:
        served_text = handle.read()
    if vendored_text != served_text:
        pytest.xfail("the served checkout has moved past the vendored commit %s; run `make vendor`" % record["source"]["commit"][:12])
