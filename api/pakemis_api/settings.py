"""Settings: where the query core lives, which release is served, where receipts are kept.

PAKEMIS_QUERY_PATH      the `src/` directory that holds pakemis_query (default: the sibling
                        emissions checkout, /Users/rehanahmad/Desktop/emissions/src); the package
                        is imported from there and never copied into this repository.
PAKEMIS_RELEASES_ROOT   data/releases (default) - the directory fetch_release.py writes into.
PAKEMIS_RELEASE_VERSION the version to serve (default: the `pinned:` line of RELEASES.md).
PAKEMIS_RECEIPT_STORE   a JSON file mapping receipt -> canonical request (default data/receipts.json);
                        receipts are replayed from the request, never served from a stored result.
"""
import os
import re
import sys
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT_QUERY_PATH = "/Users/rehanahmad/Desktop/emissions/src"


def pinned_version(releases_md):
    with open(releases_md, encoding="utf-8") as handle:
        for line in handle:
            m = re.match(r"^\s*pinned:\s*(\S+)", line)
            if m:
                return m.group(1)
    raise RuntimeError("%s carries no 'pinned:' line" % releases_md)


@dataclass(frozen=True)
class Settings:
    query_path: str
    releases_root: str
    version: str
    receipt_store: str
    releases_md: str

    @classmethod
    def from_env(cls, **override):
        releases_md = override.get("releases_md") or os.path.join(ROOT, "RELEASES.md")
        version = override.get("version") or os.environ.get("PAKEMIS_RELEASE_VERSION") or pinned_version(releases_md)
        return cls(
            query_path=override.get("query_path") or os.environ.get("PAKEMIS_QUERY_PATH", DEFAULT_QUERY_PATH),
            releases_root=override.get("releases_root") or os.environ.get("PAKEMIS_RELEASES_ROOT", os.path.join(ROOT, "data", "releases")),
            version=version,
            receipt_store=override.get("receipt_store") or os.environ.get("PAKEMIS_RECEIPT_STORE", os.path.join(ROOT, "data", "receipts.json")),
            releases_md=releases_md,
        )

    @property
    def release_dir(self):
        return os.path.join(self.releases_root, self.version)

    @property
    def semantic_dir(self):
        return os.path.join(self.release_dir, "outputs", "semantic")

    @property
    def manifest_path(self):
        return os.path.join(self.release_dir, "outputs", "release_manifest.json")

    @property
    def method_registry(self):
        return os.path.join(self.release_dir, "data", "method_registry.csv")

    @property
    def cube_paths(self):
        return {"REF_2023_24": os.path.join(self.release_dir, "outputs", "pakemis_grid_0p05_monthly.nc"),
                "S_2023_24": os.path.join(self.release_dir, "outputs", "pakemis_grid_0p05_monthly_survey.nc")}


def import_query_core(query_path=None):
    """Put PAKEMIS_QUERY_PATH on sys.path and import pakemis_query from there."""
    path = query_path or os.environ.get("PAKEMIS_QUERY_PATH", DEFAULT_QUERY_PATH)
    if path not in sys.path:
        sys.path.insert(0, path)
    import pakemis_query  # noqa: F401
    return pakemis_query
