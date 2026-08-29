"""The tiles routes over the real archives of the pinned release: TileJSON from the header and
metadata, one stored tile with the gzip magic, 204/404, the raster PNG, forwarded-host URLs; the
pure-Python reader against the `pmtiles` package when it is installed."""
import gzip
import json
import os

import pytest

from pakemis_api.settings import API_PREFIX
from pakemis_api.tiles import PMTilesReader, TileStore, zxy_to_tile_id

P = API_PREFIX + "/tiles"


@pytest.fixture(scope="module")
def tiles_dir(settings):
    if not os.path.isfile(os.path.join(settings.tiles_dir, "TILES.json")):
        pytest.skip("tiles are not built under %s" % settings.tiles_dir)
    return settings.tiles_dir


def test_meta_is_tiles_json(client, tiles_dir):
    r = client.get(P + "/meta")
    assert r.status_code == 200
    with open(os.path.join(tiles_dir, "TILES.json"), encoding="utf-8") as handle:
        assert r.json() == json.load(handle)
    assert r.json()["version"] == client.app.state.service.settings.version


def test_bboxes(client, tiles_dir):
    r = client.get(P + "/bboxes")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"adm1", "adm2"} and len(body["adm1"]) == 7 and len(body["adm2"]) >= 100
    assert all(len(v) == 4 for v in body["adm1"].values())


@pytest.mark.parametrize("name", ["adm1", "adm2", "grid"])
def test_tilejson_from_the_archive(client, tiles_dir, name):
    r = client.get(P + "/" + name)
    assert r.status_code == 200
    doc = r.json()
    reader = PMTilesReader(os.path.join(tiles_dir, name + ".pmtiles"))
    h = reader.header
    assert doc["tilejson"] == "3.0.0" and doc["name"] == name and doc["scheme"] == "xyz"
    assert doc["tiles"] == ["http://testserver%s/%s/{z}/{x}/{y}.mvt" % (P, name)]
    assert doc["minzoom"] == h["min_zoom"] and doc["maxzoom"] == h["max_zoom"]
    assert doc["bounds"] == [h["min_lon"], h["min_lat"], h["max_lon"], h["max_lat"]]
    # Pakistan, roughly
    w, s, e, n = doc["bounds"]
    assert 60 < w < 65 and 23 < s < 26 and 75 < e < 79 and 35 < n < 38
    assert [l["id"] for l in doc["vector_layers"]] == [name]
    assert r.headers["cache-control"] == "public, max-age=3600"


def test_tilejson_honours_forwarded_host(client, tiles_dir):
    r = client.get(P + "/adm2", headers={"X-Forwarded-Host": "pakemis.web.app", "X-Forwarded-Proto": "https"})
    assert r.json()["tiles"] == ["https://pakemis.web.app%s/adm2/{z}/{x}/{y}.mvt" % P]


def test_one_real_tile_is_gzip_passthrough(client, tiles_dir):
    with client.stream("GET", P + "/adm2/6/44/26.mvt") as r:
        raw = b"".join(r.iter_raw())
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.mapbox-vector-tile"
    assert r.headers["content-encoding"] == "gzip"
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert raw[:2] == b"\x1f\x8b"
    reader = PMTilesReader(os.path.join(tiles_dir, "adm2.pmtiles"))
    assert raw == reader.tile(6, 44, 26)                         # exactly the stored bytes, not recompressed
    mvt = gzip.decompress(raw)
    assert b"adm2" in mvt and b"shape_id" in mvt                  # the layer name and the id property


def test_head_on_a_tile(client, tiles_dir):
    """`curl -sI` on a tile: the GET's headers, no body."""
    r = client.head(P + "/adm2/6/44/26.mvt")
    assert r.status_code == 200 and r.content == b""
    assert r.headers["content-type"] == "application/vnd.mapbox-vector-tile" and r.headers["content-encoding"] == "gzip"
    assert int(r.headers["content-length"]) > 0


def test_absent_tile_is_204(client, tiles_dir):
    for path in (P + "/adm2/6/0/0.mvt", P + "/adm2/15/1/1.mvt", P + "/grid/2/1/1.mvt"):
        r = client.get(path)
        assert r.status_code == 204 and r.content == b"" and r.headers["cache-control"] == "public, max-age=31536000, immutable", path


def test_unknown_name_is_404(client, tiles_dir):
    assert client.get(P + "/roads").status_code == 404
    assert client.get(P + "/roads/6/44/26.mvt").status_code == 404
    assert client.get(P + "/adm2/x/44/26.mvt").status_code == 404      # the int convertor does not match


def test_raster_png(client, tiles_dir):
    r = client.get(P + "/raster/REF_2023_24/CO2/annual.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert client.get(P + "/raster/REF_2023_24/CO2/nope.png").status_code == 404
    assert client.get(P + "/raster/REF_2023_24/CO2/..png").status_code == 404


def test_store_refuses_a_tampered_archive(tiles_dir, tmp_path):
    import shutil
    copy = tmp_path / "tiles"
    shutil.copytree(tiles_dir, copy, ignore=shutil.ignore_patterns("raster", "grid.pmtiles"))
    meta = json.load(open(copy / "TILES.json"))
    meta["outputs"].pop("grid.pmtiles")                              # absent outputs are not listed in this copy
    json.dump(meta, open(copy / "TILES.json", "w"))
    store = TileStore(str(copy), meta["version"])
    assert store.verify() == 3
    with open(copy / "adm1.pmtiles", "r+b") as handle:
        handle.seek(-2, 2)
        byte = handle.read(1)[0]
        handle.seek(-2, 2)
        handle.write(bytes([byte ^ 0xFF]))
    with pytest.raises(TileStore.Mismatch) as info:
        store.verify()
    assert "adm1.pmtiles" in str(info.value)
    with pytest.raises(TileStore.Mismatch):
        TileStore(str(copy), "0.0.0").verify()


def test_tile_ids_match_the_reference_reader():
    pmtiles = pytest.importorskip("pmtiles.tile")
    for z, x, y in ((0, 0, 0), (1, 1, 0), (6, 44, 26), (10, 700, 420), (12, 2900, 1700), (26, 1 << 25, (1 << 26) - 1)):
        assert zxy_to_tile_id(z, x, y) == pmtiles.zxy_to_tileid(z, x, y)


def test_reader_matches_the_reference_reader(tiles_dir):
    pmtiles = pytest.importorskip("pmtiles.reader")
    for name, samples in (("adm1", ((0, 0, 0), (4, 11, 6), (8, 178, 106))),
                          ("adm2", ((6, 44, 26), (10, 712, 424), (7, 90, 53))),
                          ("grid", ((6, 44, 26), (10, 712, 424), (8, 178, 106)))):
        path = os.path.join(tiles_dir, name + ".pmtiles")
        mine = PMTilesReader(path)
        with open(path, "rb") as handle:
            ref = pmtiles.Reader(pmtiles.MmapSource(handle))
            for z, x, y in samples:
                assert mine.tile(z, x, y) == ref.get(z, x, y), (name, z, x, y)
