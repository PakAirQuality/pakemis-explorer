#!/usr/bin/env python3
"""build_tiles: boundaries and grid cells -> PMTiles for the map, carrying NO emission values;
with --raster, visual-only shading PNGs of the two grid cubes.

  tiles/out/adm1.pmtiles   ADM1 polygons; properties: shape_id, name, level        (promoteId name)
  tiles/out/adm2.pmtiles   ADM2 polygons; properties: shape_id, name, level        (promoteId shape_id)
  tiles/out/grid.pmtiles   0.05 degree cell polygons from the cube's lat_bnds/lon_bnds;
                           properties: cell_id, row, col, lat, lon               (promoteId cell_id)
  tiles/out/bboxes.json    {adm1: {name: [w, s, e, n]}, adm2: {shape_id: [w, s, e, n]}} for fitBounds
  tiles/out/raster/<configuration>/<gas>/<YYYYMM|annual>.png   (--raster)
                           340 x 267 RGBA at native cell resolution: log10 of Gg stretched at the
                           gas's p2-p98 over all twelve months (the annual frame at the p2-p98 of
                           the annual sums), zero and missing cells transparent.  Shading only:
                           every value the UI shows is read through get_grid_cell.
  tiles/out/TILES.json     digests of the inputs and outputs (+ the raster block)

Values are painted through MapLibre feature-state from /v1/spatial/* envelopes; a tile never
holds a number the API did not return.  ADM1 features are keyed by `name` because the release's
dim_geography carries no ADM1 shape_id; the ADM1 shapeID is kept as a property.  Every cell of the
267 x 340 cube is emitted (90,780 squares); the cube's mass is not read for the PMTiles.

Usage: python3 tiles/build_tiles.py [--version V] [--copy-to web/public/tiles] [--no-grid]
       python3 tiles/build_tiles.py --raster          (numpy + Pillow; no tippecanoe, no GDAL)
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

# the explorer's sequential ramp (design system, 7 stops), light -> dark
RAMP = ("#f1f5f4", "#d7e8e4", "#a8cfd4", "#6faec5", "#3f88ad", "#23618f", "#0f3d66")
# API gas id -> cube variable
GAS_VARIABLES = {"CO2": "co2_Gg", "CH4": "ch4_Gg", "N2O": "n2o_Gg"}
CUBES = {"REF_2023_24": "pakemis_grid_0p05_monthly.nc", "S_2023_24": "pakemis_grid_0p05_monthly_survey.nc"}
STRETCH_PERCENTILES = (2, 98)


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


# --- bounding boxes ----------------------------------------------------------------------------

def _walk_positions(coords, acc):
    if isinstance(coords[0], (int, float)):
        x, y = coords[0], coords[1]
        acc[0] = min(acc[0], x); acc[1] = min(acc[1], y); acc[2] = max(acc[2], x); acc[3] = max(acc[3], y)
    else:
        for c in coords:
            _walk_positions(c, acc)


def bbox_of(geometry):
    acc = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    _walk_positions(geometry["coordinates"], acc)
    return [round(v, 4) for v in acc]


def bboxes(adm1_path, adm2_path):
    """{adm1: {shapeName: [w, s, e, n]}, adm2: {shapeID: [w, s, e, n]}} from the boundary files."""
    out = {"adm1": {}, "adm2": {}}
    for key, path, prop in (("adm1", adm1_path, "shapeName"), ("adm2", adm2_path, "shapeID")):
        with open(path, encoding="utf-8") as handle:
            for f in json.load(handle)["features"]:
                out[key][f["properties"][prop]] = bbox_of(f["geometry"])
        out[key] = dict(sorted(out[key].items()))
    return out


# --- rasters -----------------------------------------------------------------------------------

def colormap_lut(ramp=RAMP, n=256):
    """n RGB rows interpolating the ramp linearly in sRGB."""
    import numpy as np
    stops = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in ramp], dtype=np.float64)
    x = np.linspace(0.0, 1.0, n)
    pos = np.linspace(0.0, 1.0, len(ramp))
    lut = np.stack([np.interp(x, pos, stops[:, k]) for k in range(3)], axis=1)
    return np.rint(lut).astype(np.uint8)


def stretch_of(values):
    """(log10 lo, log10 hi) at the percentiles of the positive finite values."""
    import numpy as np
    positive = values[np.isfinite(values) & (values > 0)]
    lo, hi = np.percentile(np.log10(positive), STRETCH_PERCENTILES)
    if hi <= lo:
        hi = lo + 1e-9
    return float(lo), float(hi)


def render_png(values, lo, hi, lut, path):
    """values (rows north-first) -> RGBA PNG; zero/NaN transparent, fixed metadata (deterministic)."""
    import numpy as np
    from PIL import Image
    valid = np.isfinite(values) & (values > 0)
    t = np.zeros(values.shape, dtype=np.float64)
    t[valid] = np.clip((np.log10(values[valid]) - lo) / (hi - lo), 0.0, 1.0)
    idx = np.rint(t * (len(lut) - 1)).astype(np.intp)
    rgba = np.zeros(values.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = lut[idx]
    rgba[..., 3] = 255
    rgba[~valid] = 0
    Image.fromarray(rgba, "RGBA").save(path, format="PNG", compress_level=9)


def build_rasters(rel, out_dir):
    """78 PNGs under out_dir/<configuration>/<gas>/<month|annual>.png and the TILES.json block."""
    import numpy as np
    from netCDF4 import Dataset
    lut = colormap_lut()
    block = {
        "visual_only": True,
        "note": "shading only; every value is read through get_grid_cell",
        "inputs": {}, "colormap": list(RAMP),
        "stretch": "log10, p2-p98 per gas over all months (annual.png: p2-p98 of the twelve-month sums)",
        "stretch_log10_Gg": {}, "variables": dict(GAS_VARIABLES),
        "size": None, "bounds": None, "image_coordinates": None,
        "orientation": "row 0 is the northern edge; column 0 the western edge",
        "files": {}, "anchor_cells": {},
    }
    months = []
    for config, filename in CUBES.items():
        cube = os.path.join(rel, "outputs", filename)
        block["inputs"]["outputs/" + filename] = sha256_file(cube)
        ds = Dataset(cube)
        try:
            lats, lons = np.asarray(ds["lat"][:], dtype=np.float64), np.asarray(ds["lon"][:], dtype=np.float64)
            lat_b, lon_b = np.asarray(ds["lat_bnds"][:], dtype=np.float64), np.asarray(ds["lon_bnds"][:], dtype=np.float64)
            months = [str(m) for m in ds["month_label"][:]]
            north_first = lats[0] > lats[-1]
            if not lons[0] < lons[-1]:
                sys.exit("%s: lon is not ascending; the builder assumes column 0 is west" % filename)
            bounds = {"west": float(lon_b.min()), "south": float(lat_b.min()), "east": float(lon_b.max()), "north": float(lat_b.max())}
            coords = [[bounds["west"], bounds["north"]], [bounds["east"], bounds["north"]],
                      [bounds["east"], bounds["south"]], [bounds["west"], bounds["south"]]]
            size = [int(len(lons)), int(len(lats))]
            for key, value in (("bounds", bounds), ("image_coordinates", coords), ("size", size)):
                if block[key] is None:
                    block[key] = value
                elif block[key] != value:
                    sys.exit("%s: grid differs from the first cube (%s)" % (filename, key))
            rows_lat = lats if north_first else lats[::-1]
            for gas, var in GAS_VARIABLES.items():
                arr = np.ma.filled(ds[var][:], np.nan).astype(np.float64)   # (time, lat, lon)
                if not north_first:
                    arr = arr[:, ::-1, :]
                if arr.shape != (len(months), len(lats), len(lons)):
                    sys.exit("%s/%s: shape %s" % (filename, var, arr.shape))
                lo, hi = stretch_of(arr)
                annual = np.where(np.isfinite(arr).any(axis=0), np.nansum(arr, axis=0), np.nan)
                alo, ahi = stretch_of(annual)
                gas_dir = os.path.join(out_dir, config, gas)
                os.makedirs(gas_dir, exist_ok=True)
                frames = list(zip(months, arr)) + [("annual", annual)]
                for label, frame in frames:
                    f_lo, f_hi = (alo, ahi) if label == "annual" else (lo, hi)
                    path = os.path.join(gas_dir, label + ".png")
                    render_png(frame, f_lo, f_hi, lut, path)
                    block["files"]["raster/%s/%s/%s.png" % (config, gas, label)] = sha256_file(path)
                block["stretch_log10_Gg"]["%s/%s" % (config, gas)] = {
                    "months": {"lo": lo, "hi": hi, "Gg_lo": 10 ** lo, "Gg_hi": 10 ** hi},
                    "annual": {"lo": alo, "hi": ahi, "Gg_lo": 10 ** alo, "Gg_hi": 10 ** ahi},
                    "percentiles": list(STRETCH_PERCENTILES)}
                # anchor cells: the UI fetches their REAL displays through get_grid_cell
                flat = np.where(np.isfinite(annual), annual, -np.inf)
                i_max, j_max = np.unravel_index(int(flat.argmax()), annual.shape)
                month_of_max = months[int(np.nanargmax(arr[:, i_max, j_max]))]
                nz = np.flatnonzero(np.isfinite(annual) & (annual > 0))
                order = nz[np.argsort(annual.ravel()[nz], kind="stable")]
                i_med, j_med = np.unravel_index(int(order[len(order) // 2]), annual.shape)
                block["anchor_cells"]["%s/%s" % (config, gas)] = {
                    "max": {"row": int(i_max), "col": int(j_max), "lat": float(rows_lat[i_max]), "lon": float(lons[j_max]), "month_of_max": month_of_max},
                    "median": {"row": int(i_med), "col": int(j_med), "lat": float(rows_lat[i_med]), "lon": float(lons[j_med])},
                    "n_nonzero_cells": int(len(nz))}
                print("  raster %s/%s  %d frames  stretch log10 [%.2f, %.2f]" % (config, gas, len(frames), lo, hi))
        finally:
            ds.close()
    block["months"] = months
    return block


# --- main --------------------------------------------------------------------------------------

def load_record(version):
    path = os.path.join(OUT, "TILES.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            record = json.load(handle)
        if record.get("version") == version:
            return record
    return {"version": version, "inputs": {}, "outputs": {}, "promote_id": {"adm1": "name", "adm2": "shape_id", "grid": "cell_id"},
            "rule": "tiles carry geometry and identifiers only; every value is painted from an API envelope via feature-state"}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default=None)
    ap.add_argument("--copy-to", default=os.path.join(ROOT, "web", "public", "tiles"))
    ap.add_argument("--no-grid", action="store_true", help="skip the 90,780-cell grid layer")
    ap.add_argument("--raster", action="store_true", help="build the visual-only grid rasters (and bboxes.json) instead of the PMTiles")
    args = ap.parse_args(argv)
    version = args.version or pinned_version()
    rel = os.path.join(ROOT, "data", "releases", version)
    adm1 = os.path.join(rel, "data", "gis", "PAK_ADM1.geojson")
    adm2 = os.path.join(rel, "data", "gis", "PAK_ADM2.geojson")
    cube = os.path.join(rel, "outputs", CUBES["REF_2023_24"])
    for p in (adm1, adm2, cube):
        if not os.path.exists(p):
            sys.exit("%s is absent; run data/fetch_release.py first" % p)
    os.makedirs(OUT, exist_ok=True)
    record = load_record(version)
    if args.raster:
        record["raster"] = build_rasters(rel, os.path.join(OUT, "raster"))
        print("  %d raster files" % len(record["raster"]["files"]))
    else:
        if not shutil.which("tippecanoe"):
            sys.exit("tippecanoe is not on PATH (--raster needs none)")
        with tempfile.TemporaryDirectory() as tmp:
            for name, src, level, zr in (("adm1", adm1, "adm1", (0, 8)), ("adm2", adm2, "adm2", (0, 10))):
                gj = os.path.join(tmp, name + ".geojson")
                with open(gj, "w", encoding="utf-8") as handle:
                    json.dump(adm_features(src, level), handle)
                out = os.path.join(OUT, name + ".pmtiles")
                tippecanoe(gj, out, name, *zr, extra=("--detect-shared-borders", "--no-tile-size-limit"))
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
    # bboxes.json is written on both paths: it needs only the boundary files
    boxes = bboxes(adm1, adm2)
    with open(os.path.join(OUT, "bboxes.json"), "w", encoding="utf-8") as handle:
        json.dump(boxes, handle, indent=1, sort_keys=True)
        handle.write("\n")
    record["inputs"][os.path.relpath(adm1, rel)] = sha256_file(adm1)
    record["inputs"][os.path.relpath(adm2, rel)] = sha256_file(adm2)
    record["outputs"]["bboxes.json"] = {"sha256": sha256_file(os.path.join(OUT, "bboxes.json")),
                                        "adm1": len(boxes["adm1"]), "adm2": len(boxes["adm2"]), "keys": {"adm1": "name", "adm2": "shape_id"}}
    print("  bboxes.json  %d adm1, %d adm2" % (len(boxes["adm1"]), len(boxes["adm2"])))
    with open(os.path.join(OUT, "TILES.json"), "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=1, sort_keys=True)
        handle.write("\n")
    if args.copy_to:
        shutil.copytree(OUT, args.copy_to, dirs_exist_ok=True)
        print("copied to %s" % args.copy_to)


if __name__ == "__main__":
    main()
