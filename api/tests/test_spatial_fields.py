"""The map's evidence fields: every adm2 cell carries allocation_status, spatial_class (the measured
class of the cell's dominant stream), placement_class, allocation_surface and the stream the class
came from, under a rule declared on /release; ADM1 province rows and cells carry unallocated_short;
neither reaches a download, and no other envelope is touched."""
from decimal import Decimal

import pytest

from pakemis_api.presentation import DERIVED, PROVINCE_UNALLOCATED_FIELD, SPATIAL_CLASS_FIELD, SPATIAL_CLASS_RULE, SPATIAL_COMPANIONS

PREFIX = "/api/v1/emissions"
FIELDS = [SPATIAL_CLASS_FIELD] + SPATIAL_COMPANIONS


@pytest.fixture(scope="module")
def adm2(client):
    r = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "group_by": ["shape_id"]})
    assert r.status_code == 200, r.text
    return r.json()


def test_every_adm2_cell_carries_the_fields(adm2):
    assert adm2["spatial_fields"]["rule"] == SPATIAL_CLASS_RULE and adm2["spatial_fields"]["fields"] == FIELDS
    assert adm2["spatial_fields"]["reference"] == {"period_id": "FY2023-24", "configuration_id": "REF_2023_24"}
    assert len(adm2["values"]) == 126        # the shapes with rows (one carries no mass)
    for c in adm2["values"]:
        assert all(f in c for f in FIELDS), c["group"]
        assert c[SPATIAL_CLASS_FIELD] in ("S1", "S2", "S3", "S4", "NA"), c
        assert c["allocation_status"] and set(c["allocation_status"].split(";")) <= {"one_to_one", "shared_shape", "outside_all_shapes", "shape_missing"}
        assert c["dominant_module"] and c["dominant_stream"].startswith(c["dominant_module"] + "|")
        assert c["spatial_class_basis"].startswith("%s of %s" % (c[SPATIAL_CLASS_FIELD], c["dominant_stream"]))
        assert "the module whose rows sum to the largest" in c["spatial_class_basis"]
    statuses = {c["allocation_status"] for c in adm2["values"]}
    assert "one_to_one" in statuses and any("shared_shape" in s for s in statuses)


def test_the_class_is_the_dominant_streams_evidence_row(client, adm2):
    evidence = client.get(PREFIX + "/evidence/_").json()
    by_stream = {v["source_stream_id"]: v for v in evidence["values"]}
    for c in adm2["values"][:20]:
        ev = by_stream[c["dominant_stream"]]
        assert c[SPATIAL_CLASS_FIELD] == ev["spatial_class_measured"] and c["placement_class"] == ev["placement_class"]
        assert c["allocation_surface"] == ev["allocation_surface"]
    # the dominant stream of a module is its largest reference-year atom (a comparison of decimals)
    annual = client.post(PREFIX + "/query/emissions", json={"sectors": ["agriculture"], "group_by": ["component_id"]}).json()
    largest = max(annual["values"], key=lambda v: Decimal(v["exact"]))["group"]["component_id"]
    cell = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "sectors": ["agriculture"], "limit": 1}).json()["values"][0]
    assert cell["dominant_module"] == "agriculture" and cell["dominant_stream"] == largest and "the request's one sector" in cell["spatial_class_basis"]
    assert cell[SPATIAL_CLASS_FIELD] == "S3" and cell["allocation_surface"] == "glw_livestock"


def test_module_and_gas_groups_narrow_the_stream(client):
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "group_by": ["shape_id", "module", "gas"], "geography_ids": ["60131773B12131197496886"]}).json()
    seen = {}
    for c in env["values"]:
        g = c["group"]
        assert c["dominant_module"] == g["module"] and c["dominant_stream"].startswith(g["module"] + "|") and "the cell's module" in c["spatial_class_basis"]
        assert c["dominant_stream"].endswith("|" + g["gas"].lower()) or g["gas"] not in ("CO2", "CH4", "N2O"), c
        seen.setdefault(g["module"], set()).add(c[SPATIAL_CLASS_FIELD])
    assert "power" in seen and "agriculture" in seen
    power = next(c for c in env["values"] if c["group"]["module"] == "power")
    assert power[SPATIAL_CLASS_FIELD] in ("S1", "S2", "S3") and power["placement_class"]


def test_adm1_province_rows_and_cells_carry_unallocated_short(client):
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "group_by": ["province"]}).json()
    rows = {r["province"]: r for r in env["unallocated"]["by_province"]}
    for province, r in rows.items():
        assert r[PROVINCE_UNALLOCATED_FIELD] == str(Decimal(r["exact"]).quantize(Decimal("0.01")))
    assert env["derived"]["unallocated_by_province_short"] == {p: r[PROVINCE_UNALLOCATED_FIELD] for p, r in rows.items()}
    # 0.04 at rc47: Punjab's retained mass is its cruise-fuel share alone
    assert env["derived"]["unallocated_by_province_short"]["Punjab"] == "0.04"
    for c in env["values"]:
        assert c[PROVINCE_UNALLOCATED_FIELD] == rows[c["group"]["province"]][PROVINCE_UNALLOCATED_FIELD]
    assert not any(f in c for c in env["values"] for f in FIELDS)          # adm1 carries no spatial class
    national = client.post(PREFIX + "/query/emissions", json={"group_by": ["sector_id"]}).json()
    assert "spatial_fields" not in national and not any(f in c for c in national["values"] for f in FIELDS + [PROVINCE_UNALLOCATED_FIELD])


def test_downloads_and_declaration(client, adm2):
    csv = client.get(PREFIX + "/download/%s.csv" % adm2["receipt"]).text
    assert "spatial_class" not in csv and "dominant_stream" not in csv
    replay = client.get(PREFIX + "/receipt/%s" % adm2["receipt"]).json()
    assert replay["result_sha256"] == adm2["result_sha256"] and replay["values"][0][SPATIAL_CLASS_FIELD] == adm2["values"][0][SPATIAL_CLASS_FIELD]
    derived = client.get(PREFIX + "/release").json()["rounding"]["presentation"]["derived"]
    assert derived[SPATIAL_CLASS_FIELD] == DERIVED[SPATIAL_CLASS_FIELD] and derived[SPATIAL_CLASS_FIELD]["companion_fields"] == SPATIAL_COMPANIONS
    assert derived[PROVINCE_UNALLOCATED_FIELD]["decimals"] == 2 and "4.84" in derived[PROVINCE_UNALLOCATED_FIELD]["sentence"]
    assert "never to a download" in derived[PROVINCE_UNALLOCATED_FIELD]["sentence"].lower() or "never to a download" in derived[PROVINCE_UNALLOCATED_FIELD]["sentence"]
    assert "Never added to a download" in derived[SPATIAL_CLASS_FIELD]["sentence"]
