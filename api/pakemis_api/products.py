"""The downloadable products of the served release: an allowlisted catalogue and a file route.

`GET {prefix}/products` lists every file the release payload publishes for reuse - the 22
semantic tables as CSV and Parquet (schema fields from semantic_release.json: columns,
primary_key, rows, the CSV digest the contract carries, the aggregation rule and closure), the two
grid cubes (digests from the release manifest's products) and the two metadata files
(semantic_release.json and release_manifest.json, digests as data/verify_release.py proved them)
- and groups them into the four families the Downloads page shows.  `GET {prefix}/products/
{name}.{ext}` streams one of those files from the payload with `Content-Disposition:
attachment`, `ETag` equal to the file's sha256, an immutable one-year `Cache-Control`, and range
requests (Starlette's FileResponse).  Anything not in the catalogue is a 404: the route resolves
a filename through the allowlist, never through the path, so there is nothing to traverse.

Every digest here is read from the release (the contract, the manifest, the verification) except
the Parquet twins', which the contract deliberately leaves unhashed ("the CSV is the identity");
those bytes are hashed once at startup and the entry says so (`identity: "computed"`).
"""
import hashlib
import os

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse

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

    def __init__(self, release, manifest, verification, release_dir):
        semantic_dir = os.path.join(release_dir, "outputs", "semantic")
        outputs_dir = os.path.join(release_dir, "outputs")
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
        self.families = self._families()

    def _format(self, name, ext, path, sha256, identity):
        filename = "%s.%s" % (name, ext)
        self.files[filename] = (path, sha256, MEDIA_TYPES[ext])
        return {"ext": ext, "filename": filename, "bytes": os.path.getsize(path), "sha256": sha256, "identity": identity}

    def _families(self):
        names = {e["name"] for e in self.entries}
        dims = sorted(n for n in names if n.startswith("dim_"))
        out = []
        for family in FAMILIES:
            tables = []
            for t in family["tables"]:
                tables.extend(dims if t == "dims" else ([t] if t in names else []))
            out.append({"id": family["id"], "title": family["title"], "description": family["description"],
                        "tables": tables, "formats": list(family["formats"])})
        return out

    def listing(self, base_url):
        """The catalogue with an absolute url per format (base_url = origin + the products mount)."""
        products = []
        for entry in self.entries:
            e = dict(entry)
            e["formats"] = [dict(f, url="%s/%s" % (base_url, f["filename"])) for f in entry["formats"]]
            products.append(e)
        return products


def products_base(request):
    from pakemis_api.tiles import request_origin
    path = request.url.path.rstrip("/")
    return request_origin(request) + path


@router.get("", summary="Every downloadable product of the served release, with digests, schema and families")
def products(request: Request):
    svc = request.app.state.service
    catalog = svc.products
    return {"release": svc.release.release_id, "version": svc.release.version,
            "count": len(catalog.entries), "products": catalog.listing(products_base(request)),
            "families": catalog.families,
            "note": "sha256 is the file's identity: the contract's CSV digest for a table's CSV, the manifest's for a cube, the "
                    "verified digest for a metadata file; a Parquet twin is hashed by this service at startup (the contract "
                    "leaves it unhashed: the CSV is the identity). ETag on a download equals the sha256."}


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
