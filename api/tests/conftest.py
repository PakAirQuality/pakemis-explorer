"""Fixtures: the pinned release served by one app per test session, and the emissions checkout's
golden files read in place (never copied)."""
import glob
import json
import os
import sys

import pytest

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(API_DIR)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)
os.environ.setdefault("PAKEMIS_API_LAZY", "1")

from pakemis_api.settings import Settings, default_query_path  # noqa: E402


def query_path():
    """The path the API itself would choose: the override, the checkout, or the vendored copy when
    the checkout is on a branch older than it."""
    return default_query_path()


def golden_dir():
    """The goldens VENDORED at the engine's pinned commit, or the checkout's if none are.

    Reading them from the live checkout is what produced twenty meaningless failures: the
    app serves a pinned release while the emissions tree moves on, so a later release that
    refroze four fixtures made four goldens disagree with the data this API actually
    serves. Paired at one vintage the same suite is green. The vendored copy is written by
    scripts/vendor_query_core.py from the same commit as pakemis_query, so a golden failure
    now means behaviour changed rather than somebody's checkout moved.
    """
    vendored = os.path.join(API_DIR, "vendor", "goldens")
    if os.path.isdir(vendored) and glob.glob(os.path.join(vendored, "*.json")):
        return vendored
    return os.path.join(os.path.dirname(query_path()), "tests", "semantic", "golden")


def load_goldens():
    out = []
    for path in sorted(glob.glob(os.path.join(golden_dir(), "*.json"))):
        with open(path, encoding="utf-8") as handle:
            out.append((os.path.basename(path), json.load(handle)))
    return out


@pytest.fixture(scope="session")
def settings(tmp_path_factory):
    base = Settings.from_env()
    return Settings(query_path=base.query_path, releases_root=base.releases_root, version=base.version,
                    receipt_store=str(tmp_path_factory.mktemp("receipts") / "receipts.json"), releases_md=base.releases_md)


@pytest.fixture(scope="session")
def client(settings):
    from fastapi.testclient import TestClient
    from pakemis_api.app import create_app
    with TestClient(create_app(settings)) as c:
        yield c
