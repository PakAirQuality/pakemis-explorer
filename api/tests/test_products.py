"""GET /products lists every downloadable file of the served release with its digest and schema,
grouped into the four families; GET /products/{name}.{ext} streams the payload's bytes with the
digest as ETag, an immutable cache, an attachment disposition and range support; anything outside
the allowlist is a 404 (no path is ever resolved from the request)."""
import hashlib
import json
import os

import pytest

PREFIX = "/api/v1/emissions"


@pytest.fixture(scope="module")
def listing(client):
    r = client.get(PREFIX + "/products")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def contract(settings):
    with open(os.path.join(settings.semantic_dir, "semantic_release.json"), encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def manifest(settings):
    with open(settings.manifest_path, encoding="utf-8") as handle:
        return json.load(handle)


def by_name(listing):
    return {p["name"]: p for p in listing["products"]}


REGISTRIES = ("emission_factors", "parameters", "national_uncertainty_parameters", "source_documents", "pakemis_source_register",
              "public_documents", "temporal_profiles", "pakemis_temporal_profiles", "stream_grid_proxy", "stream_geometry",
              "allowed_grid_fallbacks", "geometry_sets", "release_heights", "pakemis_grid_fallbacks", "validation_catalog",
              "pakemis_validation_catalog", "pakemis_validation_scorecard", "pakemis_validation_sector_scorecard", "benchmarks",
              "data_gaps", "pakemis_source_streams")


def test_listing_shape(listing, contract):
    assert set(listing) == {"release", "version", "count", "products", "families", "note"}
    products = by_name(listing)
    tables = {n for n, p in products.items() if p["kind"] == "table"}
    assert tables == set(contract["dimensions"]) | set(contract["facts"])
    # 29 at the air beta: dim_pollutant + the four air facts joined the contract.
    assert len(tables) == 29
    assert {n for n, p in products.items() if p["kind"] == "cube"} == {"pakemis_grid_0p05_monthly", "pakemis_grid_0p05_monthly_survey"}
    assert {n for n, p in products.items() if p["kind"] == "metadata"} == {"semantic_release", "release_manifest"}
    assert {n for n, p in products.items() if p["kind"] == "registry"} == set(REGISTRIES)
    # 33 + 21 at the air beta: five more tables joined the set
    assert listing["count"] == 33 + 21 == len(listing["products"])
    for p in listing["products"]:
        for f in p["formats"]:
            assert set(f) == {"ext", "filename", "bytes", "sha256", "identity", "url"}
            assert f["bytes"] > 0 and len(f["sha256"]) == 64
            assert f["url"].endswith(PREFIX + "/products/" + f["filename"])
            assert f["url"].startswith("http")


def test_table_entries_carry_the_contract_schema(listing, contract):
    p = by_name(listing)["fact_annual"]
    entry = contract["facts"]["fact_annual"]
    assert p["columns"] == entry["columns"]
    assert p["primary_key"] == entry["primary_key"]
    assert p["rows"] == entry["rows"]
    assert p["aggregation_rule"] == entry["aggregation"]["rule"] == "additive"
    assert p["closure"] == entry["aggregation"]["closure"]
    formats = {f["ext"]: f for f in p["formats"]}
    assert set(formats) == {"csv", "parquet"}
    assert formats["csv"]["sha256"] == entry["sha256_csv"] and formats["csv"]["identity"] == "contract"
    assert formats["parquet"]["identity"] == "computed"
    assert by_name(listing)["dim_gas"]["table_kind"] == "dimension" and p["table_kind"] == "fact"


def test_cube_and_metadata_digests(listing, manifest, settings):
    products = by_name(listing)
    by_path = {m["path"]: m["sha256"] for m in manifest["products"]}
    for name in ("pakemis_grid_0p05_monthly", "pakemis_grid_0p05_monthly_survey"):
        (f,) = products[name]["formats"]
        assert f["ext"] == "nc" and f["sha256"] == by_path["outputs/%s.nc" % name] and f["identity"] == "manifest"
    (f,) = products["release_manifest"]["formats"]
    assert f["ext"] == "json" and f["identity"] == "verification"
    with open(settings.manifest_path, "rb") as handle:
        assert f["sha256"] == hashlib.sha256(handle.read()).hexdigest()
    (f,) = products["semantic_release"]["formats"]
    with open(os.path.join(settings.semantic_dir, "semantic_release.json"), "rb") as handle:
        assert f["sha256"] == hashlib.sha256(handle.read()).hexdigest()


def test_families(listing):
    fam = {f["id"]: f for f in listing["families"]}
    assert list(fam) == ["annual", "monthly", "spatial", "uncertainty", "evidence", "air", "complete"]
    names = set(by_name(listing))
    for f in fam.values():
        assert set(f) - {"archive"} == {"id", "title", "description", "tables", "formats"}
        assert set(f["tables"]) <= names and f["tables"]
    assert {"fact_annual", "fact_annual_calendar", "dim_gas", "dim_period", "dim_configuration"} <= set(fam["annual"]["tables"])
    assert all(t.startswith("dim_") for t in fam["annual"]["tables"] if t not in ("fact_annual", "fact_annual_calendar"))
    assert fam["monthly"]["tables"] == ["fact_monthly"]
    assert fam["spatial"]["tables"] == ["fact_adm1_month", "fact_adm2_month", "fact_unallocated", "fact_evidence",
                                        "pakemis_grid_0p05_monthly", "pakemis_grid_0p05_monthly_survey"]
    assert fam["spatial"]["formats"] == ["csv", "parquet", "nc"]
    assert fam["uncertainty"]["tables"] == ["fact_uncertainty", "fact_uncertainty_series", "fact_completeness",
                                            "fact_completeness_mass", "fact_transfer", "dim_configuration"]
    assert fam["uncertainty"]["formats"] == fam["annual"]["formats"] == ["csv", "parquet"]


@pytest.mark.parametrize("filename,media", [("dim_gas.csv", "text/csv"), ("dim_gas.parquet", "application/vnd.apache.parquet"),
                                            ("pakemis_grid_0p05_monthly_survey.nc", "application/x-netcdf"),
                                            ("release_manifest.json", "application/json")])
def test_download_bytes_match_the_digest(client, listing, filename, media):
    name, ext = filename.rsplit(".", 1)
    f = next(f for f in by_name(listing)[name]["formats"] if f["ext"] == ext)
    r = client.get(PREFIX + "/products/" + filename)
    assert r.status_code == 200, r.text
    assert hashlib.sha256(r.content).hexdigest() == f["sha256"]
    assert len(r.content) == f["bytes"]
    assert r.headers["etag"] == '"%s"' % f["sha256"]
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert r.headers["content-disposition"] == 'attachment; filename="%s"' % filename
    assert r.headers["content-type"].startswith(media)
    assert r.headers["x-pakemis-sha256"] == f["sha256"]


def test_download_equals_the_manifest_digest(client, manifest):
    """The cube's bytes hash to what the release manifest records for it."""
    digest = {m["path"]: m["sha256"] for m in manifest["products"]}["outputs/pakemis_grid_0p05_monthly_survey.nc"]
    r = client.get(PREFIX + "/products/pakemis_grid_0p05_monthly_survey.nc")
    assert hashlib.sha256(r.content).hexdigest() == digest


def test_range_request(client):
    full = client.get(PREFIX + "/products/dim_gas.csv").content
    r = client.get(PREFIX + "/products/dim_gas.csv", headers={"Range": "bytes=0-9"})
    assert r.status_code == 206, r.text
    assert r.content == full[:10]
    assert r.headers["content-range"] == "bytes 0-9/%d" % len(full)


def test_head(client):
    r = client.head(PREFIX + "/products/dim_gas.csv")
    assert r.status_code == 200 and r.content == b"" and r.headers["etag"]


@pytest.mark.parametrize("path", ["nope.csv", "dim_gas.txt", "fact_annual", "../release_manifest.json", "..%2F..%2FFETCH.json",
                                  "%2e%2e/semantic_release.json", "semantic/dim_gas.csv", "receipts.json", "method_registry.csv"])
def test_unknown_product_is_404(client, path):
    r = client.get(PREFIX + "/products/" + path)
    assert r.status_code == 404, (path, r.status_code, r.text[:200])
    if r.headers.get("content-type", "").startswith("application/json"):
        assert r.json().get("error") in ("unknown_product", None) or "detail" in r.json()


def test_allowlist_is_the_listing(client, listing):
    """Every filename the allowlist serves is in the listing, and nothing else is."""
    catalog = client.app.state.service.products
    listed = {f["filename"] for p in listing["products"] for f in p["formats"]}
    assert set(catalog.files) == listed
    for filename, (path, sha256, _) in catalog.files.items():
        assert os.path.basename(path) == filename and os.path.isfile(path)


# --- the registries, the evidence and complete families, the streamed archive -----------------

def test_registry_entries_carry_fetch_identities(listing, manifest, settings, client):
    products = by_name(listing)
    with open(os.path.join(settings.release_dir, "FETCH.json"), encoding="utf-8") as handle:
        fetch = json.load(handle)["files"]
    sources = {s["path"]: s["sha256"] for s in manifest["sources"]}
    for name in REGISTRIES:
        p = products[name]
        assert p["kind"] == "registry" and len(p["formats"]) == 1 and p["formats"][0]["ext"] == "csv"
        rec = fetch["data/registries/%s.csv" % name]
        assert p["formats"][0]["sha256"] == rec["sha256"] and p["formats"][0]["identity"] == rec["identity"] and p["source_path"] == rec["source_path"]
    ef = products["emission_factors"]["formats"][0]
    assert ef["identity"] == "manifest_sources" and ef["sha256"] == sources["data/emission_factors.csv"]
    assert products["national_uncertainty_parameters"]["formats"][0]["identity"] == "fetch"
    r = client.get(PREFIX + "/products/emission_factors.csv")
    assert r.status_code == 200 and hashlib.sha256(r.content).hexdigest() == ef["sha256"] and r.headers["etag"] == '"%s"' % ef["sha256"]
    assert r.text.startswith("ef_id,category,item,value,unit,uncert_pct,vintage,source,note")


def test_evidence_and_complete_families(listing):
    fam = {f["id"]: f for f in listing["families"]}
    evidence = fam["evidence"]
    assert evidence["tables"][:5] == ["fact_evidence", "dim_evidence_class", "dim_stream", "fact_completeness", "fact_completeness_mass"]
    assert set(evidence["tables"][5:]) == set(REGISTRIES) and evidence["formats"] == ["csv", "parquet"]
    complete = fam["complete"]
    assert complete["tables"] == [p["name"] for p in listing["products"]] and len(complete["tables"]) == 54
    assert complete["formats"] == ["csv", "parquet", "nc", "json", "zip"]
    assert complete["archive"]["filename"] == "complete.zip" and complete["archive"]["url"].endswith(PREFIX + "/products/complete.zip")
    assert complete["archive"]["members"] == len({f["filename"] for p in listing["products"] for f in p["formats"]}) + 2


def test_complete_zip_streams_every_file_with_sums(client, listing, settings):
    import io
    import zipfile
    r = client.get(PREFIX + "/products/complete.zip")
    assert r.status_code == 200, r.text[:200]
    assert r.headers["content-type"] == "application/zip"
    assert r.headers["content-disposition"] == 'attachment; filename="pakemis_%s_complete.zip"' % settings.version
    assert "etag" not in r.headers and r.headers["cache-control"] == "no-store"
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert zf.testzip() is None
    names = zf.namelist()
    digests = {f["filename"]: f["sha256"] for p in listing["products"] for f in p["formats"]}
    members = [n for n in names if n not in ("SHA256SUMS", "FETCH.json")]
    assert len(members) == len(digests) and "SHA256SUMS" in names and "FETCH.json" in names
    assert {os.path.basename(n) for n in members} == set(digests)
    assert "outputs/semantic/fact_annual.csv" in names and "data/registries/emission_factors.csv" in names and "outputs/pakemis_grid_0p05_monthly.nc" in names
    sums = dict(line.split("  ", 1)[::-1] for line in zf.read("SHA256SUMS").decode().splitlines())
    assert set(sums) == set(members)
    for arcname in members:
        info = zf.getinfo(arcname)
        assert info.compress_type == zipfile.ZIP_DEFLATED
        assert hashlib.sha256(zf.read(arcname)).hexdigest() == sums[arcname] == digests[os.path.basename(arcname)], arcname
    assert json.loads(zf.read("FETCH.json"))["version"] == settings.version
