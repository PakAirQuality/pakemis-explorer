"""The app refuses to start on a tampered release, naming the file."""
import os
import shutil

import pytest

from pakemis_api.settings import Settings


def _copy_release(settings, tmp_path):
    """The pinned release mirrored as symlinks, one per top-level entry: nothing is copied here.

    The tree used to be copied whole for each test. A release directory that was a checkout of the
    emissions tree (18 GB of sources and caches the app never opens) cost 54 GB of temp per run of
    these three tests. _tamper copies the one file a test changes."""
    source = os.path.realpath(settings.release_dir)
    root = tmp_path / "releases"
    os.makedirs(root / settings.version)
    for name in os.listdir(source):
        os.symlink(os.path.join(source, name), root / settings.version / name)
    return Settings(query_path=settings.query_path, releases_root=str(root), version=settings.version,
                    receipt_store=str(tmp_path / "receipts.json"), releases_md=settings.releases_md)


def _tamper(tampered, path):
    """Flip a byte of `path` in a private copy of that one file.

    Every symlink on the way down becomes a real directory of symlinks and the file itself is
    copied, so the write lands in tmp_path and never in the release the mirror points at."""
    here = tampered.release_dir
    for part in os.path.relpath(path, here).split(os.sep):
        here = os.path.join(here, part)
        if not os.path.islink(here):
            continue
        target = os.path.realpath(here)
        os.unlink(here)
        if os.path.isdir(target):
            os.mkdir(here)
            for name in os.listdir(target):
                os.symlink(os.path.join(target, name), os.path.join(here, name))
        else:
            shutil.copyfile(target, here)
    assert os.path.realpath(path).startswith(os.path.realpath(tampered.releases_root) + os.sep), path
    _flip_last_byte(path)


def _flip_last_byte(path):
    data = bytearray(open(path, "rb").read())
    data[-2] = (data[-2] + 1) % 256
    open(path, "wb").write(bytes(data))


def _refuses(tampered, needle):
    from fastapi.testclient import TestClient
    from pakemis_api.app import create_app
    with pytest.raises(RuntimeError) as info:
        with TestClient(create_app(tampered)):
            pass
    assert needle in str(info.value)


def test_tampered_semantic_csv_refused(settings, tmp_path):
    tampered = _copy_release(settings, tmp_path)
    _tamper(tampered, os.path.join(tampered.semantic_dir, "dim_gas.csv"))
    _refuses(tampered, "outputs/semantic/dim_gas.csv")


def test_tampered_cube_refused(settings, tmp_path):
    tampered = _copy_release(settings, tmp_path)
    _tamper(tampered, tampered.cube_paths["REF_2023_24"])
    _refuses(tampered, "pakemis_grid_0p05_monthly.nc")


def test_tampered_boundary_refused(settings, tmp_path):
    tampered = _copy_release(settings, tmp_path)
    _tamper(tampered, os.path.join(tampered.release_dir, "data", "gis", "PAK_ADM1.geojson"))
    _refuses(tampered, "PAK_ADM1.geojson")


def test_pinned_release_starts(client):
    body = client.get("/api/v1/emissions/release").json()
    assert body["version"] == client.app.state.service.settings.version
    # 29 at the air beta: dim_pollutant and the four air facts entered the contract
    # (24 was the adm1year follower; this pin exists to notice tables arriving).
    assert len(body["digests"]["tables"]) == 54
    assert body["context_bar"]["lulucf"]["status"] == "excluded"
