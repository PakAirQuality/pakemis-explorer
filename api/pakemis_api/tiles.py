"""The map's tiles, served by the API from the release payload (data/releases/<v>/tiles/).

  GET /tiles/meta                           TILES.json (the builder's record: digests, promote ids, the raster block)
  GET /tiles/bboxes                         bboxes.json ({adm1: {name: [w, s, e, n]}, adm2: {shape_id: [...]}})
  GET /tiles/{name}                         TileJSON 3.0.0 for adm1 | adm2 | grid, absolute tile URLs on the
                                            request's origin (X-Forwarded-Proto/Host behind Firebase / Cloud Run)
  GET /tiles/{name}/{z}/{x}/{y}.mvt         one vector tile as stored (the archive's gzip declared through
                                            Content-Encoding, never recompressed); 204 when the archive holds none
  GET /tiles/raster/{config}/{gas}/{frame}.png   one visual-only shading PNG

The archives carry geometry and identifiers only; no value is read or written here.  The PMTiles
v3 reader below is a port of web/src/lib/pmtilesServer.ts (itself the `pmtiles` package's header
and directory walk) over plain seek/read range reads: the 127-byte header, varint directories
delta-coded by tile id with run lengths, leaf directories one level down, Hilbert tile ids.
"""
import bisect
import gzip
import hashlib
import json
import os
import re
import struct
import threading

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

TILE_NAMES = ("adm1", "adm2", "grid")
HEADER_SIZE = 127
MAGIC = b"PMTiles"
COMPRESSION_NONE, COMPRESSION_GZIP = 1, 2
COMPRESSION_NAMES = {0: "unknown", 1: "none", 2: "gzip", 3: "brotli", 4: "zstd"}
TILE_TYPES = {0: ("application/octet-stream", ""), 1: ("application/vnd.mapbox-vector-tile", ".mvt"),
              2: ("image/png", ".png"), 3: ("image/jpeg", ".jpg"), 4: ("image/webp", ".webp"), 5: ("image/avif", ".avif")}
IMMUTABLE = "public, max-age=31536000, immutable"
SHORT = "public, max-age=3600"
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_-]+$")


# --- PMTiles v3 -------------------------------------------------------------------------------

def zxy_to_tile_id(z, x, y):
    """Hilbert-curve tile id, as pmtiles' zxyToTileId (the ids of all lower zooms come first)."""
    if z > 26 or x < 0 or y < 0 or x >= 1 << z or y >= 1 << z:
        raise ValueError("tile %d/%d/%d outside the zoom level" % (z, x, y))
    acc = ((1 << (2 * z)) - 1) // 3
    a = z - 1
    while a >= 0:
        s = 1 << a
        rx, ry = x & s, y & s
        acc += ((3 * rx) ^ ry) << a
        if ry == 0:
            if rx:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        a -= 1
    return acc


def read_varints(data):
    """Every unsigned LEB128 varint in `data`, in order."""
    out, pos, n = [], 0, len(data)
    while pos < n:
        shift = result = 0
        while True:
            b = data[pos]
            pos += 1
            result |= (b & 0x7F) << shift
            if b < 0x80:
                break
            shift += 7
        out.append(result)
    return out


def deserialize_directory(data):
    """(tile_ids, run_lengths, lengths, offsets), four parallel lists sorted by tile id."""
    values = read_varints(data)
    n = values[0]
    deltas, runs, lengths, raw_offsets = (values[1 + k * n:1 + (k + 1) * n] for k in range(4))
    ids, last = [], 0
    for d in deltas:
        last += d
        ids.append(last)
    offsets = []
    for i, v in enumerate(raw_offsets):
        offsets.append(offsets[i - 1] + lengths[i - 1] if (i > 0 and v == 0) else v - 1)
    return ids, runs, lengths, offsets


def find_tile(directory, tile_id):
    """The index of the entry holding tile_id (a run may cover it; a leaf pointer covers a range), or None."""
    ids, runs, _, _ = directory
    k = bisect.bisect_right(ids, tile_id) - 1
    if k < 0:
        return None
    if ids[k] == tile_id or runs[k] == 0 or tile_id - ids[k] < runs[k]:
        return k
    return None


def parse_header(buf):
    if len(buf) < HEADER_SIZE or buf[:7] != MAGIC:
        raise ValueError("not a PMTiles archive")
    if buf[7] != 3:
        raise ValueError("PMTiles version %d; only v3 is read" % buf[7])

    def u64(o):
        return struct.unpack_from("<Q", buf, o)[0]

    def deg(o):
        return struct.unpack_from("<i", buf, o)[0] / 1e7

    return {"root_offset": u64(8), "root_length": u64(16), "metadata_offset": u64(24), "metadata_length": u64(32),
            "leaf_offset": u64(40), "leaf_length": u64(48), "tile_data_offset": u64(56), "tile_data_length": u64(64),
            "addressed_tiles": u64(72), "tile_entries": u64(80), "tile_contents": u64(88), "clustered": buf[96] == 1,
            "internal_compression": buf[97], "tile_compression": buf[98], "tile_type": buf[99],
            "min_zoom": buf[100], "max_zoom": buf[101],
            "min_lon": deg(102), "min_lat": deg(106), "max_lon": deg(110), "max_lat": deg(114),
            "center_zoom": buf[118], "center_lon": deg(119), "center_lat": deg(123)}


class PMTilesReader:
    """One local archive: header once, directories cached by (offset, length), tiles as stored."""

    def __init__(self, path):
        self.path = path
        self.header = parse_header(self.read(0, HEADER_SIZE))
        if self.header["internal_compression"] not in (COMPRESSION_NONE, COMPRESSION_GZIP):
            raise ValueError("%s: internal compression %s is not read" % (path, COMPRESSION_NAMES.get(self.header["internal_compression"])))
        if self.header["tile_compression"] not in (0, COMPRESSION_NONE, COMPRESSION_GZIP):
            raise ValueError("%s: tile compression %s is not served" % (path, COMPRESSION_NAMES.get(self.header["tile_compression"])))
        self._directories = {}
        self._metadata = None
        self._lock = threading.Lock()

    def read(self, offset, length):
        with open(self.path, "rb") as handle:
            handle.seek(offset)
            return handle.read(length)

    def _inflate(self, data):
        return gzip.decompress(data) if self.header["internal_compression"] == COMPRESSION_GZIP else data

    def directory(self, offset, length):
        key = (offset, length)
        with self._lock:
            d = self._directories.get(key)
            if d is None:
                d = self._directories[key] = deserialize_directory(self._inflate(self.read(offset, length)))
            return d

    def metadata(self):
        with self._lock:
            if self._metadata is None:
                h = self.header
                self._metadata = json.loads(self._inflate(self.read(h["metadata_offset"], h["metadata_length"])).decode("utf-8")) if h["metadata_length"] else {}
            return self._metadata

    @property
    def content_type(self):
        return TILE_TYPES.get(self.header["tile_type"], TILE_TYPES[0])[0]

    @property
    def extension(self):
        return TILE_TYPES.get(self.header["tile_type"], TILE_TYPES[0])[1]

    @property
    def encoding(self):
        return "gzip" if self.header["tile_compression"] == COMPRESSION_GZIP else None

    def tile(self, z, x, y):
        """The stored bytes of tile z/x/y, or None when the archive holds none."""
        h = self.header
        if z < h["min_zoom"] or z > h["max_zoom"] or x < 0 or y < 0 or x >= 1 << z or y >= 1 << z:
            return None
        tile_id = zxy_to_tile_id(z, x, y)
        offset, length = h["root_offset"], h["root_length"]
        for _ in range(4):                              # root + up to three leaf levels, as the reference reader
            d = self.directory(offset, length)
            k = find_tile(d, tile_id)
            if k is None:
                return None
            _, runs, lengths, offsets = d
            if runs[k] > 0:
                return self.read(h["tile_data_offset"] + offsets[k], lengths[k])
            offset, length = h["leaf_offset"] + offsets[k], lengths[k]
        raise ValueError("%s: maximum directory depth exceeded" % self.path)

    def tilejson(self, name, base_url):
        """TileJSON 3.0.0; base_url is this tileset's own absolute URL (origin + mount path)."""
        h = self.header
        meta = self.metadata()
        doc = {"tilejson": "3.0.0", "name": name, "scheme": "xyz",
               "tiles": ["%s/{z}/{x}/{y}%s" % (base_url, self.extension)],
               "minzoom": h["min_zoom"], "maxzoom": h["max_zoom"],
               "bounds": [h["min_lon"], h["min_lat"], h["max_lon"], h["max_lat"]],
               "center": [h["center_lon"], h["center_lat"], h["center_zoom"]]}
        if "vector_layers" in meta:
            doc["vector_layers"] = meta["vector_layers"]
        if meta.get("attribution"):
            doc["attribution"] = meta["attribution"]
        return doc


# --- the store -------------------------------------------------------------------------------

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class TileStore:
    """The tiles directory of one release: readers cached per archive, TILES.json, bboxes.json, raster/."""

    class Mismatch(Exception):
        pass

    def __init__(self, tiles_dir, version=None):
        self.dir = tiles_dir
        self.version = version
        self._readers = {}
        self._lock = threading.Lock()

    @property
    def available(self):
        return os.path.isfile(os.path.join(self.dir, "TILES.json"))

    def path(self, *parts):
        return os.path.join(self.dir, *parts)

    def meta(self):
        with open(self.path("TILES.json"), encoding="utf-8") as handle:
            return json.load(handle)

    def verify(self):
        """Every output TILES.json lists that is present has its recorded sha256; the record names this version."""
        meta = self.meta()
        if self.version and meta.get("version") != self.version:
            raise self.Mismatch("TILES.json records version %s, not %s" % (meta.get("version"), self.version))
        checked = 0
        for rel, rec in sorted(meta.get("outputs", {}).items()):
            path = self.path(rel)
            if not os.path.exists(path):
                raise self.Mismatch("%s is recorded in TILES.json but absent" % rel)
            got = sha256_file(path)
            if got != rec["sha256"]:
                raise self.Mismatch("%s: sha256 %s != TILES.json %s" % (rel, got, rec["sha256"]))
            checked += 1
        return checked

    def reader(self, name):
        if name not in TILE_NAMES:
            return None
        with self._lock:
            r = self._readers.get(name)
            if r is None:
                path = self.path(name + ".pmtiles")
                if not os.path.isfile(path):
                    return None
                r = self._readers[name] = PMTilesReader(path)
            return r

    def raster(self, config, gas, frame):
        """The PNG's path when every segment is a plain token and the file exists, else None."""
        if not all(SAFE_SEGMENT.match(s or "") for s in (config, gas, frame)):
            return None
        path = self.path("raster", config, gas, frame + ".png")
        return path if os.path.isfile(path) else None


# --- the routes ------------------------------------------------------------------------------

router = APIRouter(prefix="/tiles", tags=["tiles"])


def store(request):
    s = getattr(request.app.state, "service", None)
    tiles = getattr(s, "tiles", None)
    if tiles is None or not tiles.available:
        raise HTTPException(404, {"error": "tiles_not_built", "message": "no tiles under the release payload; run tiles/build_tiles.py"})
    return tiles


def request_origin(request):
    """The origin the browser used: the forwarded host and protocol behind a proxy, else the request's."""
    headers = request.headers
    host = headers.get("x-forwarded-host") or headers.get("host") or request.url.netloc
    proto = headers.get("x-forwarded-proto") or request.url.scheme
    return "%s://%s" % (proto.split(",")[0].strip(), host.split(",")[0].strip())


def _not_found(name):
    return JSONResponse(status_code=404, content={"error": "unknown_tile_set", "message": "%r is not one of %s" % (name, ", ".join(TILE_NAMES))})


@router.get("/meta", summary="TILES.json: the tile builder's record")
def tiles_meta(request: Request):
    return JSONResponse(content=store(request).meta(), headers={"Cache-Control": SHORT})


@router.get("/bboxes", summary="bboxes.json: [w, s, e, n] per ADM1 name and ADM2 shape_id")
def tiles_bboxes(request: Request):
    path = store(request).path("bboxes.json")
    if not os.path.isfile(path):
        raise HTTPException(404, {"error": "bboxes_not_built", "message": "bboxes.json is absent; run tiles/build_tiles.py"})
    with open(path, "rb") as handle:
        return Response(content=handle.read(), media_type="application/json", headers={"Cache-Control": SHORT})


@router.get("/raster/{config}/{gas}/{frame}.png", summary="One visual-only grid shading PNG",
            responses={200: {"content": {"image/png": {}}}, 404: {"description": "no such frame"}})
def tiles_raster(config: str, gas: str, frame: str, request: Request):
    path = store(request).raster(config, gas, frame)
    if path is None:
        raise HTTPException(404, {"error": "unknown_raster", "message": "no raster for %s/%s/%s; TILES.json's raster.files lists them" % (config, gas, frame)})
    with open(path, "rb") as handle:
        return Response(content=handle.read(), media_type="image/png", headers={"Cache-Control": IMMUTABLE})


@router.get("/{name}", summary="TileJSON 3.0.0 for adm1 | adm2 | grid")
def tiles_tilejson(name: str, request: Request):
    reader = store(request).reader(name)
    if reader is None:
        return _not_found(name)
    base = request_origin(request) + request.url.path.rstrip("/")
    return JSONResponse(content=reader.tilejson(name, base), headers={"Cache-Control": SHORT})


@router.get("/{name}/{z:int}/{x:int}/{y:int}.mvt", summary="One vector tile as stored in the archive",
            responses={200: {"content": {"application/vnd.mapbox-vector-tile": {}}}, 204: {"description": "the archive holds no such tile"},
                       404: {"description": "unknown tile set"}})
def tiles_tile(name: str, z: int, x: int, y: int, request: Request):
    reader = store(request).reader(name)
    if reader is None:
        return _not_found(name)
    data = reader.tile(z, x, y)
    if data is None:
        return Response(status_code=204, headers={"Cache-Control": IMMUTABLE})
    headers = {"Cache-Control": IMMUTABLE, "Content-Length": str(len(data))}
    if reader.encoding:
        headers["Content-Encoding"] = reader.encoding
    return Response(content=data, media_type=reader.content_type, headers=headers)
