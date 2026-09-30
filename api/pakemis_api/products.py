"""The downloadable products of the served release: an allowlisted catalogue and a file route.

`GET {prefix}/products` lists every file the release payload publishes for reuse - the 22
semantic tables as CSV and Parquet (schema fields from semantic_release.json: columns,
primary_key, rows, the CSV digest the contract carries, the aggregation rule and closure), the two
grid cubes (digests from the release manifest's products) and the two metadata files
(semantic_release.json and release_manifest.json, digests as data/verify_release.py proved them)
- plus the registries GET /claim joins (data/registries/*.csv, kind `registry`, digests and
identities from FETCH.json: the manifest's sources or products, or the fetch itself) - and groups
them into the six families the Downloads page shows: annual, monthly, spatial, uncertainty,
evidence (fact_evidence, dim_evidence_class, dim_stream, the completeness ledgers and every
registry) and complete (every file, also as one archive).  `GET {prefix}/products/{name}.{ext}`
streams one of those files from the payload with `Content-Disposition: attachment`, `ETag` equal
to the file's sha256, an immutable one-year `Cache-Control`, and range requests (Starlette's
FileResponse).  `GET {prefix}/products/complete.zip` streams every catalogued file as a deflated
zip archive under its payload path with a SHA256SUMS member (sha256sum format, the catalogue's
digests) and FETCH.json, built on the fly (no archive is stored; the zip's own bytes carry no
digest, its members do).  Anything not in the catalogue is a 404: the route resolves a filename
through the allowlist, never through the path, so there is nothing to traverse.

Every digest here is read from the release (the contract, the manifest, the verification) except
the Parquet twins', which the contract deliberately leaves unhashed ("the CSV is the identity");
those bytes are hashed once at startup and the entry says so (`identity: "computed"`).
"""
import hashlib
import os
import re
import zipfile

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pakemis_api.assets import ReleaseAssets

router = APIRouter(prefix="/products", tags=["products"])

MEDIA_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "parquet": "application/vnd.apache.parquet",
    "nc": "application/x-netcdf",
    "json": "application/json",
    "geojson": "application/geo+json",
    "md": "text/markdown; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
    "pdf": "application/pdf",
    "zip": "application/zip",
}
CACHE_CONTROL = "public, max-age=31536000, immutable"

# ⚠ THE ANNUAL CUBE WAS SHIPPING AND UNREACHABLE. All six cubes are hashed in the release manifest,
# but only the four below were catalogued - so `/products/pakemis_grid_0p05_annual_ref_...nc` 404'd on
# the nine-year GHG grid, which is the one a modeller most wants, and on the EDGAR-parity lattice that
# exists to be compared against. Nothing is generated here: the files ship and the manifest already
# carries their digests; they were simply never named.
GHG_CUBES = ("pakemis_grid_0p05_monthly.nc", "pakemis_grid_0p05_monthly_survey.nc",
             "pakemis_grid_0p05_annual_ref_fy2015_16_fy2023_24.nc",
             "pakemis_grid_0p1_edgar_aligned.nc")
# the rc49 air family: nine annual periods, seven species, one file per configuration
AIR_CUBES = ("pakemis_air_grid_0p05_annual_fy2015_16_fy2023_24.nc",
             "pakemis_air_grid_0p05_annual_survey_fy2015_16_fy2023_24.nc")
CUBES = GHG_CUBES + AIR_CUBES
METADATA = ("semantic_release.json", "release_manifest.json")
REGISTRIES_DIR = "data/registries"
ARCHIVE = "complete.zip"
ZIP_CHUNK = 1 << 20

# the four families the Downloads page offers, named table by table (dims are every dim_* table)
FAMILIES = (
    {"id": "annual", "title": "Annual inventory",
     "description": "Nine fiscal years by sector, IPCC category, component, gas, configuration and GWP basis, with every dimension table.",
     "tables": ("fact_annual", "fact_annual_calendar", "dims"), "formats": ("csv", "parquet")},
    {"id": "monthly", "title": "Monthly inventory",
     "description": "All 108 months with annual closure, temporal profiles and evidence classifications.",
     "tables": ("fact_monthly",), "formats": ("csv", "parquet")},
    {"id": "spatial", "title": "Spatial inventory",
     "description": "Reference-year administrative and 0.05-degree allocations with fallback, lineage and unallocated-mass tables.",
     "tables": ("fact_adm1_month", "fact_adm2_month", "fact_unallocated", "fact_evidence") + tuple(c.rsplit(".", 1)[0] for c in GHG_CUBES),
     "formats": ("csv", "parquet", "nc")},
    {"id": "uncertainty", "title": "Uncertainty and scenarios",
     "description": "Common correlated draws, uncertainty summaries, completeness ledgers, transfers and the named structural configurations.",
     "tables": ("fact_uncertainty", "fact_uncertainty_series", "fact_completeness", "fact_completeness_mass", "fact_transfer", "dim_configuration"),
     "formats": ("csv", "parquet")},
    {"id": "evidence", "title": "Evidence and provenance",
     "description": "The evidence classes behind every stream, the stream register, the completeness ledgers, and the registries the "
                    "claim record joins: emission factors, parameters, source documents, temporal profiles, spatial registries, validation rows, benchmarks, data gaps.",
     "tables": ("fact_evidence", "dim_evidence_class", "dim_stream", "fact_completeness", "fact_completeness_mass", "registries"), "formats": ("csv", "parquet")},
    {"id": "air", "title": "Air quality (beta)",
     "description": "The companion air-pollutant layer: seven sectors' NOx, SO2, CO, NMVOC, PM\u2082.\u2085, BC and NH3 in native kilotonnes - "
                    "the nine-fiscal-year covered-sources panel, its provincial and district allocations for every year and both "
                    "configurations, the two 0.05-degree annual cubes, the single-year all-sector layers and agriculture's "
                    "1990-2024 national series. A beta of uneven assurance, outside every greenhouse-gas total.",
     "tables": ("fact_air_annual", "fact_air_timeseries", "fact_air_panel", "fact_air_adm1", "fact_air_adm2",
                "fact_air_adm1_year", "fact_air_adm2_year", "fact_air_absence_screening", "dim_pollutant",
                "pakemis_air_grid_0p05_annual_fy2015_16_fy2023_24",
                "pakemis_air_grid_0p05_annual_survey_fy2015_16_fy2023_24"),
     "formats": ("csv", "parquet", "nc")},
    {"id": "complete", "title": "Complete release",
     "description": "Every file of the release payload: every semantic table as CSV and Parquet, the grid cubes, the contract and manifest, and every registry; "
                    "also as one zip archive with SHA256SUMS.",
     "tables": ("all",), "formats": ("csv", "parquet", "nc", "json", "zip")},
)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class ProductCatalog:
    """Built once at startup from the verified release; `entries` is the list the route returns
    (without urls), `files` the allowlist filename -> (path, sha256, media type)."""

    def __init__(self, release, manifest, verification, release_dir, fetch_files=None):
        semantic_dir = os.path.join(release_dir, "outputs", "semantic")
        outputs_dir = os.path.join(release_dir, "outputs")
        self.release_dir = release_dir
        self.version = release.version
        self.files = {}
        self.entries = []
        self.download_catalog = release.contract.get("download_catalog")
        assets = ReleaseAssets(release.contract, release_dir)
        self.library = None
        for name in sorted(release.tables):
            table = release.tables[name]
            formats = []
            csv_path = os.path.join(semantic_dir, os.path.basename(table["path"]))
            formats.append(self._format(name, "csv", csv_path, table["sha256_csv"], "contract"))
            pq_path = os.path.join(semantic_dir, os.path.basename(table["parquet"]["path"]))
            if os.path.exists(pq_path):
                digest = verification.get("file_digests", {}).get(os.path.realpath(pq_path)) or sha256_file(pq_path)
                formats.append(self._format(name, "parquet", pq_path, digest, "computed"))
            agg = table.get("aggregation") or {}
            self.entries.append({
                "name": name, "kind": "table", "table_kind": table.get("kind", ""), "formats": formats,
                "rows": table.get("rows"), "columns": list(table.get("columns") or ()),
                "primary_key": list(table.get("primary_key") or ()),
                "aggregation_rule": agg.get("rule", ""), "closure": agg.get("closure", ""),
            })
        for table in release.contract.get("activity_inputs", {}).get("tables", []) if not assets.catalog else []:
            name = "input_" + re.sub(r"[^a-zA-Z0-9_]", "_", table["table_id"])
            path = os.path.join(release_dir, table["path"])
            if not os.path.isfile(path):
                raise RuntimeError("canonical input is absent: %s" % table["path"])
            self.entries.append({
                "name": name, "kind": "input", "title": table["title"],
                "source_path": table["source_path"], "rows": table["row_count"],
                "columns": [c["name"] for c in table["columns"]] + ["Record ID", "Source row"],
                "primary_key": ["Record ID"],
                "formats": [self._format(name, "csv", path, table["sha256"], "contract")],
            })
        by_path = {p["path"]: p["sha256"] for p in manifest.get("products", [])}
        for cube in CUBES:
            path = os.path.join(outputs_dir, cube)
            if not os.path.exists(path):
                continue
            name, ext = cube.rsplit(".", 1)
            digest = by_path.get("outputs/" + cube) or sha256_file(path)
            self.entries.append({"name": name, "kind": "cube", "formats": [self._format(name, ext, path, digest, "manifest")]})
        metadata_digests = {"semantic_release.json": verification.get("semantic_release_sha256"),
                            "release_manifest.json": verification.get("release_manifest_sha256")}
        metadata_paths = {"semantic_release.json": os.path.join(semantic_dir, "semantic_release.json"),
                          "release_manifest.json": os.path.join(outputs_dir, "release_manifest.json")}
        for filename in METADATA:
            path = metadata_paths[filename]
            if not os.path.exists(path):
                continue
            name, ext = filename.rsplit(".", 1)
            self.entries.append({"name": name, "kind": "metadata",
                                 "formats": [self._format(name, ext, path, metadata_digests[filename] or sha256_file(path), "verification")]})
        # the registries GET /claim joins: FETCH.json names each one's identity (the manifest's
        # sources or products list, or the fetch alone) and its digest
        for rel, rec in sorted((fetch_files or {}).items()) if not assets.catalog else []:
            if not rel.startswith(REGISTRIES_DIR + "/") or not rel.endswith(".csv"):
                continue
            path = os.path.join(release_dir, rel)
            if not os.path.exists(path):
                continue
            name = os.path.basename(rel)[:-4]
            if name in {e["name"] for e in self.entries}:
                continue
            self.entries.append({"name": name, "kind": "registry", "source_path": rec.get("source_path", rel),
                                 "formats": [self._format(name, "csv", path, rec["sha256"], rec.get("identity", "fetch"))]})
        if assets.catalog:
            library = []
            for asset in assets.entries.values():
                formats = []
                if asset.get("downloadable"):
                    if not asset.get("packaged") or asset.get("publication") not in {"library", "compatibility"}:
                        raise RuntimeError("public asset is not packaged: %s" % asset["asset_id"])
                    if asset.get("license") not in {"own-work", "own-work-compilation", "public-licence"}:
                        raise RuntimeError("public asset has no redistribution grant: %s" % asset["asset_id"])
                    path = assets.path(asset)
                    filename = asset["filename"]
                    name, ext = filename.rsplit(".", 1)
                    formats.append(self._format(name, ext, path, asset["sha256"], "contract"))
                    for alias in asset.get("aliases", []):
                        if alias in self.files and self.files[alias][0] != path:
                            raise RuntimeError("public filename collision: %s" % alias)
                        self.files[alias] = self.files[filename]
                    columns = [column["name"] for column in asset.get("columns", [])]
                    if asset.get("table_id"):
                        columns += ["Record ID", "Source row"]
                    self.entries.append({"name": name, "asset_id": asset["asset_id"],
                                         "kind": "input" if asset.get("table_id") else "asset",
                                         "title": asset["title"], "formats": formats,
                                         "columns": columns, "rows": asset.get("row_count"),
                                         "primary_key": asset.get("primary_key", []),
                                         "source_path": asset.get("legacy_path", "")})
                if asset.get("publication") == "library":
                    fields = ("asset_id", "table_id", "owner_sector", "sectors", "purpose", "kind", "title",
                              "description", "license", "source_refs", "producer", "row_count", "columns",
                              "bundle_id", "downloadable")
                    library.append(dict({key: asset[key] for key in fields if key in asset}, formats=formats))
            self.library = {"schema": "pakemis.data_library/v1", "assets": library,
                            "sectors": sorted({sector for asset in library for sector in [asset["owner_sector"], *asset["sectors"]]}),
                            "purposes": sorted({asset["purpose"] for asset in library})}
        if self.download_catalog:
            for collection in self.download_catalog["collections"]:
                for item in collection["downloads"]:
                    for filename in item["files"]:
                        if filename not in self.files:
                            raise RuntimeError("download catalogue names an unavailable file: %s" % filename)
        self.families = self._families()

    def _format(self, name, ext, path, sha256, identity):
        filename = "%s.%s" % (name, ext)
        if filename in self.files and self.files[filename][0] != path:
            raise RuntimeError("public filename collision: %s" % filename)
        self.files[filename] = (path, sha256, MEDIA_TYPES.get(ext, "application/octet-stream"))
        return {"ext": ext, "filename": filename, "bytes": os.path.getsize(path), "sha256": sha256, "identity": identity}

    def _families(self):
        names = {e["name"] for e in self.entries}
        dims = sorted(n for n in names if n.startswith("dim_"))
        registries = [e["name"] for e in self.entries if e["kind"] == "registry"]
        everything = [e["name"] for e in self.entries]
        out = []
        families = FAMILIES
        if self.download_catalog:
            families = tuple({"id": c["id"], "title": c["title"], "description": c["dek"],
                              "tables": tuple(dict.fromkeys(f.rsplit(".", 1)[0] for item in c["downloads"] for f in item["files"])),
                              "formats": tuple(sorted({f.rsplit(".", 1)[1] for item in c["downloads"] for f in item["files"]}))}
                             for c in self.download_catalog["collections"]) + (FAMILIES[-1],)
        for family in families:
            tables = []
            for t in family["tables"]:
                if t == "dims":
                    tables.extend(dims)
                elif t == "registries":
                    tables.extend(registries)
                elif t == "all":
                    tables.extend(everything)
                elif t in names:
                    tables.append(t)
            entry = {"id": family["id"], "title": family["title"], "description": family["description"],
                     "tables": tables, "formats": list(family["formats"])}
            if family["id"] == "complete":
                entry["archive"] = {"filename": ARCHIVE, "members": len(self.archive_members()) + 2,
                                    "note": "every catalogued file under its payload path, plus SHA256SUMS (the digests above) and FETCH.json; streamed, deflated, not itself hashed"}
            out.append(entry)
        return out

    def listing(self, base_url):
        """The catalogue with an absolute url per format (base_url = origin + the products mount)."""
        products = []
        for entry in self.entries:
            e = dict(entry)
            e["formats"] = [dict(f, url="%s/%s" % (base_url, f["filename"])) for f in entry["formats"]]
            products.append(e)
        return products

    def families_listing(self, base_url):
        out = []
        for f in self.families:
            f = dict(f)
            if "archive" in f:
                f["archive"] = dict(f["archive"], url="%s/%s" % (base_url, f["archive"]["filename"]))
            out.append(f)
        return out

    def library_listing(self, base_url):
        if self.library is None:
            return None
        assets = [dict(asset, formats=[dict(f, url="%s/%s" % (base_url, f["filename"]))
                                      for f in asset["formats"]]) for asset in self.library["assets"]]
        return dict(self.library, assets=assets)

    def archive_members(self):
        """(arcname, path, sha256) for every catalogued file, by payload path."""
        members, seen = [], set()
        for filename, (path, sha256, _) in sorted(self.files.items()):
            if os.path.realpath(path) in seen:
                continue
            seen.add(os.path.realpath(path))
            members.append((os.path.relpath(path, self.release_dir), path, sha256))
        return members

    def stream_archive(self):
        """The complete.zip bytes, member by member: every catalogued file deflated under its
        payload path, SHA256SUMS (sha256sum format), FETCH.json."""
        sink = _Sink()
        members = self.archive_members()
        with zipfile.ZipFile(sink, mode="w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
            for arcname, path, _ in members:
                info = zipfile.ZipInfo.from_file(path, arcname)
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(path, "rb") as src, zf.open(info, "w") as dest:
                    for chunk in iter(lambda: src.read(ZIP_CHUNK), b""):
                        dest.write(chunk)
                        yield sink.drain()
                yield sink.drain()
            sums = "".join("%s  %s\n" % (sha256, arcname) for arcname, _, sha256 in members)
            zf.writestr("SHA256SUMS", sums, compress_type=zipfile.ZIP_DEFLATED)
            fetch_path = os.path.join(self.release_dir, "FETCH.json")
            if os.path.exists(fetch_path):
                zf.write(fetch_path, "FETCH.json", compress_type=zipfile.ZIP_DEFLATED)
            yield sink.drain()
        yield sink.drain()


class _Sink:
    """An unseekable write target zipfile can stream into; drain() hands out what was written."""

    def __init__(self):
        self._parts = []

    def write(self, data):
        self._parts.append(bytes(data))
        return len(data)

    def flush(self):
        pass

    def drain(self):
        out = b"".join(self._parts)
        self._parts = []
        return out


def products_base(request):
    from pakemis_api.tiles import request_origin
    path = request.url.path.rstrip("/")
    return request_origin(request) + path


@router.get("", summary="Every downloadable product of the served release, with digests, schema and families")
def products(request: Request):
    svc = request.app.state.service
    catalog = svc.products
    base = products_base(request)
    return {"release": svc.release.release_id, "version": svc.release.version,
            "count": len(catalog.entries), "products": catalog.listing(base),
            "families": catalog.families_listing(base),
            **({"download_catalog": catalog.download_catalog} if catalog.download_catalog else {}),
            **({"data_library": catalog.library_listing(base)} if catalog.library is not None else {}),
            "note": "sha256 is the file's identity: the contract's CSV digest for a table's CSV, the manifest's for a cube, the "
                    "verified digest for a metadata file, the manifest's sources/products digest (or FETCH.json's) for a registry; "
                    "a Parquet twin is hashed by this service at startup (the contract leaves it unhashed: the CSV is the identity). "
                    "ETag on a download equals the sha256. complete.zip streams every file with SHA256SUMS and is not itself hashed."}


@router.get("/" + ARCHIVE, summary="Every product file as one streamed zip archive (deflated, SHA256SUMS + FETCH.json inside)")
def product_archive(request: Request):
    svc = request.app.state.service
    catalog = svc.products
    filename = "pakemis_%s_%s" % (svc.release.version, ARCHIVE)
    return StreamingResponse(catalog.stream_archive(), media_type="application/zip",
                             headers={"Content-Disposition": 'attachment; filename="%s"' % filename,
                                      "Cache-Control": "no-store", "X-PakEmis-Release": svc.release.release_id})


@router.get("/{filename}", summary="One product file from the release payload (attachment; ETag = sha256; immutable; ranges)")
def product_file(filename: str, request: Request):
    catalog = request.app.state.service.products
    found = catalog.files.get(filename)
    if found is None:
        return JSONResponse(status_code=404, content={"error": "unknown_product",
                                                      "message": "%r is not a product of this release; GET the products list for the names" % filename})
    path, sha256, media_type = found
    return FileResponse(path, media_type=media_type, filename=filename,
                        headers={"ETag": '"%s"' % sha256, "Cache-Control": CACHE_CONTROL, "X-PakEmis-SHA256": sha256,
                                 "X-PakEmis-Release": request.app.state.service.release.release_id})
