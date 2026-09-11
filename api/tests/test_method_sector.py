"""/method/{x}: a method id, a category, or a sector of the registry; a sector answers with every
rule of that sector (tier, equation, notes), the context naming the sector."""
import csv
import os

import pytest

PREFIX = "/api/v1/emissions"


@pytest.fixture(scope="module")
def registry(settings):
    with open(settings.method_registry, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(l for l in handle if not l.startswith("#")))


def test_agriculture(client, registry):
    r = client.get(PREFIX + "/method/agriculture")
    assert r.status_code == 200, r.text
    env = r.json()
    assert env["request_type"] == "get_method"
    assert len(env["values"]) == 10 == sum(1 for row in registry if row["sector"] == "agriculture")
    for v in env["values"]:
        assert v["sector"] == "agriculture"
        assert v["tier"] and v["equation"] and v["notes"] and v["method_id"]
        assert v["display"] == v["method_id"] and v["formula"] == v["equation"]
        assert "display_short" in v
    assert env["context"]["sector"] == "agriculture"
    assert "10 registry rows" in env["context"]["sector_filter"]
    assert env["provenance"]["tables"][0]["path"] == "data/method_registry.csv"


@pytest.mark.parametrize("sector,n", [("power", 6), ("transport", 6), ("ippu", 4)])
def test_every_sector(client, registry, sector, n):
    env = client.get(PREFIX + "/method/%s" % sector).json()
    assert len(env["values"]) == n == sum(1 for row in registry if row["sector"] == sector)
    assert {v["sector"] for v in env["values"]} == {sector}


def test_sectors_are_the_registry_column(client, registry):
    assert client.app.state.service.method_sectors == sorted({r["sector"] for r in registry})


def test_method_id_and_category_still_answer(client, registry):
    row = registry[0]
    env = client.get(PREFIX + "/method/%s" % row["method_id"]).json()
    assert [v["method_id"] for v in env["values"]] == [row["method_id"]]
    assert "sector" not in env["context"]
    env = client.get(PREFIX + "/method/%s" % row["category"]).json()
    assert env["values"] and all(v["category"] == row["category"] for v in env["values"])
    env = client.get(PREFIX + "/method/no-such-thing").json()
    assert env["values"] == []


def test_sector_receipt_is_not_stored(client):
    """The receipt is the core's for an unfiltered request; replaying it would answer every rule,
    so it is not remembered."""
    env = client.get(PREFIX + "/method/agriculture").json()
    r = client.get(PREFIX + "/receipt/%s" % env["receipt"])
    assert r.status_code == 404 and r.json()["detail"]["error"] == "unknown_receipt"
