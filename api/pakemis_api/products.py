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
import zipfile

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

router = APIRouter(prefix="/products", tags=["products"])

MEDIA_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "parquet": "application/vnd.apache.parquet",
    "nc": "application/x-netcdf",
    "json": "application/json",
}
CACHE_CONTROL = "public, max-age=31536000, immutable"

CUBES = ("pakemis_grid_0p05_monthly.nc", "pakemis_grid_0p05_monthly_survey.nc")
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
     "tables": ("fact_adm1_month", "fact_adm2_month", "fact_unallocated", "fact_evidence") + tuple(c.rsplit(".", 1)[0] for c in CUBES),
     "formats": ("csv", "parquet", "nc")},
    {"id": "uncertainty", "title": "Uncertainty and scenarios",
     "description": "Common correlated draws, uncertainty summaries, completeness ledgers, transfers and the named structural configurations.",
     "tables": ("fact_uncertainty", "fact_uncertainty_series", "fact_completeness", "fact_completeness_mass", "fact_transfer", "dim_configuration"),
     "formats": ("csv", "parquet")},
    {"id": "evidence", "title": "Evidence and provenance",
     "description": "The evidence classes behind every stream, the stream register, the completeness ledgers, and the registries the "
                    "claim record joins: emission factors, parameters, source documents, temporal profiles, spatial registries, validation rows, benchmarks, data gaps.",
     "tables": ("fact_evidence", "dim_evidence_class", "dim_stream", "fact_completeness", "fact_completeness_mass", "registries"), "formats": ("csv", "parquet")},
    {"id": "complete", "title": "Complete release",
     "description": "Every file of the release payload: the 22 tables as CSV and Parquet, the two grid cubes, the contract and manifest, and every registry; "
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
        for name in sorted(release.tables):
            table = release.tables[name]
            formats = []
            csv_path = os.path.join(semantic_dir, os.path.basename(table["path"]))
            formats.append(self._format(name, "csv", csv_path, table["sha256_csv"], "contract"))
            pq_path = os.path.join(semantic_dir, os.path.basename(table["parquet"]["path"]))
            if os.path.exists(pq_path):
                formats.append(self._format(name, "parquet", pq_path, sha256_file(pq_path), "computed"))
            agg = table.get("aggregation") or {}
            self.entries.append({
                "name": name, "kind": "table", "table_kind": table.get("kind", ""), "formats": formats,
                "rows": table.get("rows"), "columns": list(table.get("columns") or ()),
                "primary_key": list(table.get("primary_key") or ()),
                "aggregation_rule": agg.get("rule", ""), "closure": agg.get("closure", ""),
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
        for rel, rec in sorted((fetch_files or {}).items()):
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
        self.families = self._families()

    def _format(self, name, ext, path, sha256, identity):
        filename = "%s.%s" % (name, ext)
        self.files[filename] = (path, sha256, MEDIA_TYPES[ext])
        return {"ext": ext, "filename": filename, "bytes": os.path.getsize(path), "sha256": sha256, "identity": identity}

    def _families(self):
        names = {e["name"] for e in self.entries}
        dims = sorted(n for n in names if n.startswith("dim_"))
        registries = [e["name"] for e in self.entries if e["kind"] == "registry"]
        everything = [e["name"] for e in self.entries]
        out = []
        for family in FAMILIES:
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
                entry["archive"] = {"filename": ARCHIVE, "members": len(self.files) + 2,
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

    def archive_members(self):
        """(arcname, path, sha256) for every catalogued file, by payload path."""
        members = []
        for filename, (path, sha256, _) in sorted(self.files.items()):
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
