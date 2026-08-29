#!/usr/bin/env python3
"""build_tiles: boundaries and grid cells -> PMTiles for the map, carrying NO emission values.

  tiles/out/adm1.pmtiles   ADM1 polygons; properties: shape_id, name, level        (promoteId name)
  tiles/out/adm2.pmtiles   ADM2 polygons; properties: shape_id, name, level        (promoteId shape_id)
  tiles/out/grid.pmtiles   0.05 degree cell polygons from the cube's lat_bnds/lon_bnds;
                           properties: cell_id, row, col, lat, lon               (promoteId cell_id)
  tiles/out/TILES.json     digests of the inputs and outputs

Values are painted through MapLibre feature-state from /v1/spatial/* envelopes; a tile never
holds a number the API did not return.  ADM1 features are keyed by `name` because the release's
dim_geography carries no ADM1 shape_id; the ADM1 shapeID is kept as a property.  Every cell of the
267 x 340 cube is emitted (90,780 squares); the cube's mass is not read.

Usage: python3 tiles/build_tiles.py [--version V] [--copy-to web/public/tiles]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "out")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pinned_version():
    for line in open(os.path.join(ROOT, "RELEASES.md"), encoding="utf-8"):
        if line.strip().startswith("pinned:"):
            return line.split(":", 1)[1].strip()
    sys.exit("RELEASES.md has no pinned: line")


def adm_features(path, level):
    with open(path, encoding="utf-8") as handle:
        src = json.load(handle)
    out = []
    for f in src["features"]:
        p = f["properties"]
        out.append({"type": "Feature", "geometry": f["geometry"],
                    "properties": {"shape_id": p.get("shapeID", ""), "name": p.get("shapeName", ""), "level": level}})
    return {"type": "FeatureCollection", "features": out}


def grid_features(cube_path):
    from netCDF4 import Dataset
    ds = Dataset(cube_path)
    try:
        lat_b, lon_b = ds["lat_bnds"][:], ds["lon_bnds"][:]
        lats, lons = ds["lat"][:], ds["lon"][:]
    finally:
        ds.close()
    feats = []
    for i in range(len(lats)):
        y0, y1 = float(lat_b[i][0]), float(lat_b[i][1])
        for j in range(len(lons)):
            x0, x1 = float(lon_b[j][0]), float(lon_b[j][1])
            ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
            feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                          "properties": {"cell_id": "r%03dc%03d" % (i, j), "row": i, "col": j,
                                         "lat": round(float(lats[i]), 3), "lon": round(float(lons[j]), 3)}})
    return {"type": "FeatureCollection", "features": feats}


def tippecanoe(geojson, out, layer, zmin, zmax, extra=()):
    cmd = ["tippecanoe", "-o", out, "-l", layer, "-Z", str(zmin), "-z", str(zmax), "--force", "--quiet", *extra, geojson]
    subprocess.run(cmd, check=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default=None)
    ap.add_argument("--copy-to", default=os.path.join(ROOT, "web", "public", "tiles"))
    ap.add_argument("--no-grid", action="store_true", help="skip the 90,780-cell grid layer")
    args = ap.parse_args(argv)
    version = args.version or pinned_version()
    rel = os.path.join(ROOT, "data", "releases", version)
    adm1 = os.path.join(rel, "data", "gis", "PAK_ADM1.geojson")
    adm2 = os.path.join(rel, "data", "gis", "PAK_ADM2.geojson")
    cube = os.path.join(rel, "outputs", "pakemis_grid_0p05_monthly.nc")
    for p in (adm1, adm2, cube):
        if not os.path.exists(p):
            sys.exit("%s is absent; run data/fetch_release.py first" % p)
    if not shutil.which("tippecanoe"):
        sys.exit("tippecanoe is not on PATH")
    os.makedirs(OUT, exist_ok=True)
    record = {"version": version, "inputs": {}, "outputs": {}, "promote_id": {"adm1": "name", "adm2": "shape_id", "grid": "cell_id"},
              "rule": "tiles carry geometry and identifiers only; every value is painted from an API envelope via feature-state"}
    with tempfile.TemporaryDirectory() as tmp:
        for name, src, level, zr in (("adm1", adm1, "adm1", (0, 8)), ("adm2", adm2, "adm2", (0, 10))):
            gj = os.path.join(tmp, name + ".geojson")
            with open(gj, "w", encoding="utf-8") as handle:
                json.dump(adm_features(src, level), handle)
            out = os.path.join(OUT, name + ".pmtiles")
            tippecanoe(gj, out, name, *zr, extra=("--detect-shared-borders", "--no-tile-size-limit"))
            record["inputs"][os.path.relpath(src, rel)] = sha256_file(src)
            record["outputs"][name + ".pmtiles"] = {"sha256": sha256_file(out), "bytes": os.path.getsize(out)}
            print("  %s.pmtiles  %d bytes" % (name, os.path.getsize(out)))
        if not args.no_grid:
            gj = os.path.join(tmp, "grid.geojson")
            fc = grid_features(cube)
            with open(gj, "w", encoding="utf-8") as handle:
                json.dump(fc, handle)
            out = os.path.join(OUT, "grid.pmtiles")
            tippecanoe(gj, out, "grid", 5, 10, extra=("--no-feature-limit", "--no-tile-size-limit", "--no-simplification-of-shared-nodes"))
            record["inputs"][os.path.relpath(cube, rel)] = sha256_file(cube)
            record["outputs"]["grid.pmtiles"] = {"sha256": sha256_file(out), "bytes": os.path.getsize(out), "cells": len(fc["features"])}
            print("  grid.pmtiles  %d bytes, %d cells" % (os.path.getsize(out), len(fc["features"])))
    with open(os.path.join(OUT, "TILES.json"), "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=1, sort_keys=True)
        handle.write("\n")
    if args.copy_to:
        os.makedirs(args.copy_to, exist_ok=True)
        for name in os.listdir(OUT):
            shutil.copy2(os.path.join(OUT, name), os.path.join(args.copy_to, name))
        print("copied to %s" % args.copy_to)


if __name__ == "__main__":
    main()
