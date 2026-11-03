"""The release controls public table membership and readable input downloads."""
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from pakemis_api.products import ProductCatalog


def payload(tmp_path):
    root = tmp_path / "test"
    path = root / "data/canonical/activity/example.csv"
    path.parent.mkdir(parents=True)
    text = "Fuel,Value,Record ID,Source row\nGas,1.00,row-a,1\n"
    path.write_bytes(text.encode("utf-8"))  # bytes: write_text would turn \n into \r\n on Windows
    table = {"table_id": "activity.example", "path": "data/canonical/activity/example.csv",
             "source_path": "data/activity/example.csv", "title": "Example fuel", "role": "input",
             "row_count": 1, "sha256": hashlib.sha256(text.encode()).hexdigest(),
             "columns": [{"field_id": "fuel", "name": "Fuel"}, {"field_id": "value", "name": "Value"}]}
    catalog = {"schema": "pakemis.download_catalog/v1", "collections": [{"id": "activity", "title": "Source activity", "dek": "Model inputs", "downloads": [
        {"id": "fuel", "title": "Example fuel", "dek": "Shared input", "coverage": "One record", "icon": "Fuel", "files": ["input_activity_example.csv"]}]}]}
    contract = {"release": {"version": "test", "release_id": "test"}, "dimensions": {}, "facts": {}, "products": [],
                "activity_inputs": {"tables": [table]}, "download_catalog": catalog}
    semantic = root / "outputs/semantic/semantic_release.json"
    semantic.parent.mkdir(parents=True)
    semantic.write_text(json.dumps(contract), encoding="utf-8")
    manifest = root / "outputs/release_manifest.json"
    manifest.write_text(json.dumps({"version": "test", "products": []}), encoding="utf-8")
    files = {str(p.relative_to(root)): {"sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in [path, semantic, manifest]}
    (root / "FETCH.json").write_text(json.dumps({"files": files, "source": {"commit": "test"}, "digests": {
        "semantic_release.json": files[str(semantic.relative_to(root))]["sha256"],
        "release_manifest.json": files[str(manifest.relative_to(root))]["sha256"]}}), encoding="utf-8")
    return root, path, contract


def test_catalog_serves_the_same_canonical_input_bytes(tmp_path):
    root, path, contract = payload(tmp_path)
    release = SimpleNamespace(contract=contract, version="test", tables={})
    catalog = ProductCatalog(release, {}, {}, str(root))
    product = next(p for p in catalog.entries if p["kind"] == "input")
    actual, digest, media = catalog.files["input_activity_example.csv"]
    assert Path(actual).read_bytes() == path.read_bytes()
    assert digest == hashlib.sha256(path.read_bytes()).hexdigest()
    assert product["columns"] == ["Fuel", "Value", "Record ID", "Source row"]
    assert catalog.families[0]["title"] == "Source activity"
    assert catalog.families[0]["tables"] == ["input_activity_example"]
    contract["download_catalog"]["collections"][0]["downloads"][0]["files"] = ["missing.csv"]
    with pytest.raises(RuntimeError, match="unavailable file"):
        ProductCatalog(release, {}, {}, str(root))


def verifier():
    path = Path(__file__).resolve().parents[2] / "data/verify_release.py"
    spec = importlib.util.spec_from_file_location("catalog_verifier", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_one_audit_hashes_each_file_once_and_refuses_changed_input(tmp_path, monkeypatch):
    root, path, _ = payload(tmp_path)
    module = verifier()
    calls, original = [], module.sha256_file
    def hashed(name):
        calls.append(name)
        return original(name)
    monkeypatch.setattr(module, "sha256_file", hashed)
    result = module.verify("test", str(tmp_path), str(tmp_path / "absent.md"), log=lambda _: None)
    assert result["semantic_tables"] == {}
    assert len(calls) == len(set(calls))
    path.write_text(path.read_text(encoding="utf-8").replace("1.00", "9.00"), encoding="utf-8")
    with pytest.raises(module.Mismatch, match="canonical input differs"):
        module.verify("test", str(tmp_path), str(tmp_path / "absent.md"), log=lambda _: None)


def test_ignored_inputs_reconstruct_exactly_from_pinned_source():
    path = Path(__file__).resolve().parents[2] / "data/fetch_release.py"
    spec = importlib.util.spec_from_file_location("catalog_fetch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    schema = "pkinv.canonical-inputs/v1"
    source = b"# source metadata\nfuel,value\nGas,1.00\nCoal,\n"
    table = {"table_id": "activity.example", "source_path": "data/activity/example.csv", "row_count": 2,
             "source_sha256": hashlib.sha256(source).hexdigest(),
             "columns": [{"field_id": "fuel", "name": "Fuel"}, {"field_id": "value", "name": "Value"}]}
    ids = [hashlib.sha256((schema + "\x1factivity.example\x1f" + str(i)).encode()).hexdigest()[:24] for i in [1, 2]]
    expected = ("Fuel,Value,Record ID,Source row\nGas,1.00,%s,1\nCoal,,%s,2\n" % tuple(ids)).encode()
    table["sha256"] = hashlib.sha256(expected).hexdigest()
    assert module.canonical_input_bytes(table, source, schema) == expected
    with pytest.raises(ValueError, match="source digest differs"):
        module.canonical_input_bytes(table, source.replace(b"1.00", b"9.00"), schema)
    with pytest.raises(ValueError, match="unsupported canonical"):
        module.canonical_input_bytes(table, source, "future")
