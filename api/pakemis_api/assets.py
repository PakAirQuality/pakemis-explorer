"""Path-independent readers for the assets bound by a verified release contract."""
import csv
import os

SCHEMA = "pakemis.asset_catalog/v1"


def safe_path(root, relative):
    if os.path.isabs(relative) or ".." in relative.replace("\\", "/").split("/"):
        raise ValueError("asset path escapes release: %s" % relative)
    return os.path.join(root, relative)


class ReleaseAssets:
    def __init__(self, contract, root):
        self.root = root
        self.catalog = contract.get("asset_catalog")
        if self.catalog and self.catalog.get("schema") != SCHEMA:
            raise ValueError("unsupported asset catalog schema")
        self.entries = {asset["asset_id"]: asset for asset in (self.catalog or {}).get("assets", [])}
        if len(self.entries) != len((self.catalog or {}).get("assets", [])):
            raise ValueError("duplicate release asset ID")

    def bound(self, name, group=None):
        if not self.catalog:
            return None
        bindings = self.catalog["bindings"]
        if group:
            bindings = bindings.get(group, {})
        asset_id = bindings.get(name)
        if asset_id not in self.entries:
            raise ValueError("release has no asset binding for %s" % name)
        asset = self.entries[asset_id]
        if not asset.get("packaged"):
            raise ValueError("runtime asset is not packaged: %s" % asset_id)
        return asset

    def path(self, asset):
        return safe_path(self.root, asset["path"])

    def binding_path(self, name, fallback, group=None):
        asset = self.bound(name, group)
        return self.path(asset) if asset else fallback

    def rows(self, asset):
        with open(self.path(asset), encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(line for line in handle if not line.startswith("#")))
        if asset.get("table_id"):
            return [{column["field_id"]: row[column["name"]] for column in asset["columns"]}
                    for row in rows]
        return rows
