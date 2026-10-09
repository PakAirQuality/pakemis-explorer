"""A packaged asset the source commit does not hold is taken from the checkout only on the
contract's own digest.

The fetcher reads a release out of git, so its bytes are a commit's and not a working tree's.
The engine's contract nevertheless packages three derived GIS files its repository gitignores
(the ADM2 x grid partition and two boundary files), and the first fetch of a release with an
asset catalog stopped on `git show` for one of them. The copy on disk is admitted when, and only
when, it hashes to what the contract pins - so the bytes are still the release's - and anything
else is refused by name."""
import hashlib
import importlib.util
import os

import pytest

from conftest import ROOT

spec = importlib.util.spec_from_file_location("fetch_release", os.path.join(ROOT, "data", "fetch_release.py"))
fetch_release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_release)

REL = "data/shared/gis/partition.csv"
COMMIT = "0123456789abcdef" * 2 + "01234567"


@pytest.fixture
def checkout(tmp_path):
    path = tmp_path / REL
    path.parent.mkdir(parents=True)
    path.write_bytes(b"row,col,shape_id\n1,2,PK\n")
    return tmp_path


def test_the_checkout_copy_is_taken_when_it_is_the_pinned_bytes(checkout):
    pinned = hashlib.sha256((checkout / REL).read_bytes()).hexdigest()
    assert fetch_release.untracked_asset(str(checkout), COMMIT, REL, pinned) == (checkout / REL).read_bytes()


def test_a_copy_that_differs_from_the_contract_is_refused(checkout):
    with pytest.raises(SystemExit) as exc:
        fetch_release.untracked_asset(str(checkout), COMMIT, REL, "0" * 64)
    assert "the contract pins" in str(exc.value) and REL in str(exc.value)


def test_a_path_the_contract_does_not_pin_has_no_identity_outside_the_commit(checkout):
    with pytest.raises(SystemExit) as exc:
        fetch_release.untracked_asset(str(checkout), COMMIT, REL, None)
    assert "pins no digest" in str(exc.value)


def test_an_asset_held_nowhere_is_named(checkout):
    with pytest.raises(SystemExit) as exc:
        fetch_release.untracked_asset(str(checkout), COMMIT, "data/shared/gis/absent.csv", "0" * 64)
    assert "absent" in str(exc.value)
    with pytest.raises(ValueError):                                  # and the path cannot leave the checkout
        fetch_release.untracked_asset(str(checkout), COMMIT, "../outside.csv", "0" * 64)
