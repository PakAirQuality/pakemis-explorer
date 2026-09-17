"""The app refuses to start on a tampered release, naming the file."""
import os
import shutil

import pytest

from pakemis_api.settings import Settings


def _copy_release(settings, tmp_path):
    root = tmp_path / "releases"
    shutil.copytree(settings.release_dir, root / settings.version)
    return Settings(query_path=settings.query_path, releases_root=str(root), version=settings.version,
                    receipt_store=str(tmp_path / "receipts.json"), releases_md=settings.releases_md)


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
    _flip_last_byte(os.path.join(tampered.semantic_dir, "dim_gas.csv"))
    _refuses(tampered, "outputs/semantic/dim_gas.csv")


def test_tampered_cube_refused(settings, tmp_path):
    tampered = _copy_release(settings, tmp_path)
    _flip_last_byte(tampered.cube_paths["REF_2023_24"])
    _refuses(tampered, "pakemis_grid_0p05_monthly.nc")


def test_tampered_boundary_refused(settings, tmp_path):
    tampered = _copy_release(settings, tmp_path)
    _flip_last_byte(os.path.join(tampered.release_dir, "data", "gis", "PAK_ADM1.geojson"))
    _refuses(tampered, "PAK_ADM1.geojson")


def test_pinned_release_starts(client):
    body = client.get("/api/v1/emissions/release").json()
    assert body["version"] == client.app.state.service.settings.version
    # 29 at the air beta: dim_pollutant and the four air facts entered the contract
    # (24 was the adm1year follower; this pin exists to notice tables arriving).
    assert len(body["digests"]["tables"]) == 52
    assert body["context_bar"]["lulucf"]["status"] == "excluded"
