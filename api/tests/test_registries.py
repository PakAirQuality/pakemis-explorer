"""The registries GET /claim joins travel in the release payload under data/registries/ with a
declared identity: FETCH.json names each one's source path and whether release_manifest.json's
`sources` or `products` hashes it (or FETCH.json alone), and data/verify_release.py refuses a copy
whose bytes differ from that digest."""
import importlib.util
import json
import os
import shutil

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

EXPECTED = {
    "emission_factors.csv": ("data/emission_factors.csv", "manifest_sources"),
    "parameters.csv": ("data/parameters.csv", "manifest_sources"),
    "national_uncertainty_parameters.csv": ("outputs/national_uncertainty_parameters.csv", "fetch"),
    "source_documents.csv": ("data/source_documents.csv", "manifest_sources"),
    "pakemis_source_register.csv": ("outputs/pakemis_source_register.csv", "manifest_products"),
    "public_documents.csv": ("data/public_documents.csv", "manifest_sources"),
    "temporal_profiles.csv": ("data/temporal_profiles.csv", "manifest_sources"),
    "pakemis_temporal_profiles.csv": ("outputs/pakemis_temporal_profiles.csv", "manifest_products"),
    "stream_grid_proxy.csv": ("data/stream_grid_proxy.csv", "manifest_sources"),
    "stream_geometry.csv": ("data/stream_geometry.csv", "manifest_sources"),
    "allowed_grid_fallbacks.csv": ("data/allowed_grid_fallbacks.csv", "manifest_sources"),
    "geometry_sets.csv": ("data/geometry_sets.csv", "manifest_sources"),
    "release_heights.csv": ("data/release_heights.csv", "manifest_sources"),
    "pakemis_grid_fallbacks.csv": ("outputs/pakemis_grid_fallbacks.csv", "manifest_products"),
    "validation_catalog.csv": ("data/validation_catalog.csv", "manifest_sources"),
    "pakemis_validation_catalog.csv": ("outputs/pakemis_validation_catalog.csv", "manifest_products"),
    "pakemis_validation_scorecard.csv": ("outputs/pakemis_validation_scorecard.csv", "manifest_products"),
    "pakemis_validation_sector_scorecard.csv": ("outputs/pakemis_validation_sector_scorecard.csv", "manifest_products"),
    "benchmarks.csv": ("data/benchmarks.csv", "manifest_sources"),
    "data_gaps.csv": ("data/data_gaps.csv", "manifest_sources"),
    "pakemis_source_streams.csv": ("outputs/pakemis_source_streams.csv", "manifest_products"),
}


def _module(name):
    path = os.path.join(ROOT, "data", "%s.py" % name)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def fetch(settings):
    with open(os.path.join(settings.release_dir, "FETCH.json"), encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def manifest(settings):
    with open(settings.manifest_path, encoding="utf-8") as handle:
        return json.load(handle)


def test_fetch_records_every_registry_with_its_identity(fetch, settings):
    fetch_mod = _module("fetch_release")
    assert [os.path.basename(p) for p in fetch_mod.REGISTRIES] == list(EXPECTED)
    assert fetch["registries"] == sorted("data/registries/%s" % n for n in EXPECTED)
    for name, (source_path, identity) in EXPECTED.items():
        rec = fetch["files"]["data/registries/%s" % name]
        assert rec["source_path"] == source_path and rec["identity"] == identity, name
        assert os.path.exists(os.path.join(settings.release_dir, "data", "registries", name))
        assert rec["bytes"] > 0 and len(rec["sha256"]) == 64


def test_manifest_identities_are_the_manifests_digests(fetch, manifest):
    sources = {s["path"]: s["sha256"] for s in manifest["sources"]}
    products = {p["path"]: p["sha256"] for p in manifest["products"]}
    for name, (source_path, identity) in EXPECTED.items():
        rec = fetch["files"]["data/registries/%s" % name]
        if identity == "manifest_sources":
            assert sources[source_path] == rec["sha256"], name
        elif identity == "manifest_products":
            assert products[source_path] == rec["sha256"], name
        else:
            assert source_path not in sources and source_path not in products, name


def test_verify_passes_and_refuses_a_tampered_registry(settings, tmp_path):
    verify = _module("verify_release")
    out = verify.verify(settings.version, settings.releases_root, settings.releases_md, log=lambda *a: None)
    assert out["version"] == settings.version
    root = tmp_path / "releases"
    copy = root / settings.version
    shutil.copytree(settings.release_dir, copy, ignore=shutil.ignore_patterns("tiles"))
    verify.verify(settings.version, str(root), settings.releases_md, log=lambda *a: None)
    target = copy / "data" / "registries" / "emission_factors.csv"
    with open(target, "a", encoding="utf-8") as handle:
        handle.write("tampered,,,,,,,,\n")
    with pytest.raises(verify.Mismatch) as err:
        verify.verify(settings.version, str(root), settings.releases_md, log=lambda *a: None)
    assert "data/registries/emission_factors.csv" in str(err.value)
    # the FETCH.json check catches the bytes first; an identity claim the manifest cannot honour is refused too
    shutil.copy(os.path.join(settings.release_dir, "data", "registries", "emission_factors.csv"), target)
    fetch_path = copy / "FETCH.json"
    with open(fetch_path, encoding="utf-8") as handle:
        fetch = json.load(handle)
    fetch["files"]["data/registries/national_uncertainty_parameters.csv"]["identity"] = "manifest_products"
    with open(fetch_path, "w", encoding="utf-8") as handle:
        json.dump(fetch, handle)
    with pytest.raises(verify.Mismatch) as err:
        verify.verify(settings.version, str(root), settings.releases_md, log=lambda *a: None)
    assert "manifest does not list outputs/national_uncertainty_parameters.csv" in str(err.value)
