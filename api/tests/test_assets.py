"""Moved tracked assets retain bindings, download aliases, and immutable identities."""
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from pakemis_api.assets import ReleaseAssets
from pakemis_api.products import ProductCatalog


def fixture(root):
    relative = "data/power/canonical/fuel.csv"
    path = root / relative
    path.parent.mkdir(parents=True)
    payload = b"Fuel,Amount,Record ID,Source row\nGas,1.00,kept,1\n"
    path.write_bytes(payload)
    asset = {"asset_id": "activity.power.fuel", "table_id": "activity.power.fuel",
             "legacy_path": "data/activity/power/fuel.csv", "path": relative,
             "filename": "fuel.csv", "aliases": ["input_activity_power_fuel.csv"],
             "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload),
             "columns": [{"field_id": "fuel", "name": "Fuel"}, {"field_id": "amount", "name": "Amount"}],
             "row_count": 1, "owner_sector": "shared", "sectors": ["power", "industry"],
             "purpose": "activity", "kind": "table", "title": "Fuel records", "description": "Shared observations",
             "source_refs": ["publication-one"], "license": "own-work-compilation",
             "publication": "library", "downloadable": True, "packaged": True}
    catalog = {"schema": "pakemis.asset_catalog/v1", "assets": [asset],
               "bindings": {"method_registry": asset["asset_id"], "claim_registries": {"parameters": asset["asset_id"]}}}
    contract = {"release": {"version": "test", "release_id": "test"}, "facts": {}, "dimensions": {}, "products": [],
                "asset_catalog": catalog, "activity_inputs": {"schema_version": "pkinv.canonical-inputs/v1", "tables": [asset]}}
    return contract, path, payload


def load_script(name):
    path = Path(__file__).resolve().parents[2] / "data" / (name + ".py")
    spec = importlib.util.spec_from_file_location("assets_" + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_readable_csv_drives_runtime_and_existing_download_alias(tmp_path):
    contract, path, payload = fixture(tmp_path)
    assets = ReleaseAssets(contract, str(tmp_path))
    assert assets.rows(assets.bound("parameters", "claim_registries")) == [{"fuel": "Gas", "amount": "1.00"}]
    release = SimpleNamespace(contract=contract, version="test", tables={})
    catalog = ProductCatalog(release, {}, {}, str(tmp_path))
    assert catalog.files["fuel.csv"] == catalog.files["input_activity_power_fuel.csv"]
    assert Path(catalog.files["fuel.csv"][0]).read_bytes() == payload
    assert len(catalog.archive_members()) == 1
    library = catalog.library_listing("https://example.test/products")
    assert library["assets"][0]["formats"][0]["url"].endswith("/fuel.csv")
    assert library["assets"][0]["sectors"] == ["power", "industry"]
    assert library["sectors"] == ["industry", "power", "shared"]
    assert assets.binding_path("method_registry", "old/missing.csv") == str(path)


def test_internal_and_unlicensed_assets_do_not_become_downloads(tmp_path):
    contract, _, _ = fixture(tmp_path)
    private = dict(contract["asset_catalog"]["assets"][0], asset_id="private", publication="internal",
                   filename="private.csv", aliases=[], downloadable=False)
    restricted = dict(private, asset_id="restricted", publication="library", filename="restricted.csv",
                      license="not-established", downloadable=False, packaged=False)
    contract["asset_catalog"]["assets"] += [private, restricted]
    catalog = ProductCatalog(SimpleNamespace(contract=contract, version="test", tables={}), {}, {}, str(tmp_path))
    assert "private.csv" not in catalog.files and "restricted.csv" not in catalog.files
    assert {asset["asset_id"] for asset in catalog.library["assets"]} == {"activity.power.fuel", "restricted"}
    assert next(asset for asset in catalog.library["assets"] if asset["asset_id"] == "restricted")["formats"] == []
    restricted["downloadable"] = True
    restricted["packaged"] = True
    with pytest.raises(RuntimeError, match="redistribution"):
        ProductCatalog(SimpleNamespace(contract=contract, version="test", tables={}), {}, {}, str(tmp_path))


def test_fetch_uses_tracked_bytes_at_commit_without_staging_sources(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    contract, canonical, payload = fixture(repo)
    semantic = repo / "outputs/semantic/semantic_release.json"
    semantic.parent.mkdir(parents=True)
    semantic.write_text(json.dumps(contract))
    (repo / "outputs/release_manifest.json").write_text(json.dumps({"version": "test", "products": []}))
    def git(*args):
        return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.PIPE)
    git("init", "-q")
    git("add", ".")
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "release fixture")
    canonical.write_bytes(payload.replace(b"1.00", b"9.00"))
    fetch = load_script("fetch_release")
    releases = tmp_path / "releases"
    assert fetch.fetch_from_git(str(repo), "HEAD", str(releases)) == "test"
    assert (releases / "test" / canonical.relative_to(repo)).read_bytes() == payload
    assert not (releases / "test/data/registries").exists()
    verify = load_script("verify_release")
    verify.verify("test", str(releases), str(tmp_path / "absent.md"), log=lambda _: None)
    (releases / "test" / canonical.relative_to(repo)).write_bytes(b"damaged")
    with pytest.raises(verify.Mismatch, match="asset missing or changed"):
        verify.verify("test", str(releases), str(tmp_path / "absent.md"), log=lambda _: None)
