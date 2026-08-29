"""Every route lives under /api/v1/emissions; the legacy /v1 alias still answers, marked
deprecated; the schema names only the prefixed paths; the middleware adds the baseline headers."""
import gzip

from pakemis_api.settings import API_PREFIX, LEGACY_PREFIX, parse_origins

P = API_PREFIX


def test_prefixed_release_answers(client):
    r = client.get(P + "/release")
    assert r.status_code == 200 and r.json()["version"] == client.app.state.service.settings.version
    assert "deprecation" not in r.headers


def test_legacy_alias_answers_with_deprecation(client):
    r = client.get(LEGACY_PREFIX + "/release")
    assert r.status_code == 200
    assert r.headers["deprecation"] == "true"
    assert r.headers["link"] == '<%s/release>; rel="successor-version"' % P
    assert r.json() == client.get(P + "/release").json()


def test_legacy_alias_covers_every_route(client):
    body = {"periods": ["FY2023-24"]}
    new, old = client.post(P + "/query/emissions", json=body).json(), client.post(LEGACY_PREFIX + "/query/emissions", json=body).json()
    assert new["receipt"] == old["receipt"]
    r = client.get(LEGACY_PREFIX + "/download/%s.csv" % new["receipt"])
    assert r.status_code == 200 and r.headers["deprecation"] == "true"
    assert client.get(LEGACY_PREFIX + "/tiles/adm1").status_code == 200


def test_openapi_paths_are_prefixed_only(client):
    paths = client.app.openapi()["paths"]
    assert paths and all(p.startswith(P + "/") for p in paths), sorted(paths)
    assert P + "/ask" in paths and P + "/tiles/{name}" in paths and P + "/release" in paths


def test_healthz_inside_and_outside_the_prefix(client):
    for path in ("/healthz", P + "/healthz"):
        r = client.get(path)
        assert r.status_code == 200 and r.json()["ok"] is True


def test_security_headers_on_every_response(client):
    for path in (P + "/release", P + "/receipt/0000", LEGACY_PREFIX + "/release"):
        h = client.get(path).headers
        assert h["x-content-type-options"] == "nosniff"
        assert h["strict-transport-security"] == "max-age=31536000; includeSubDomains"
        assert h["referrer-policy"] == "strict-origin-when-cross-origin"


def test_json_is_gzipped_when_accepted(client):
    with client.stream("GET", P + "/release", headers={"Accept-Encoding": "gzip"}) as r:
        raw = b"".join(r.iter_raw())
    assert r.headers.get("content-encoding") == "gzip" and raw[:2] == b"\x1f\x8b"
    assert b'"api_version"' in gzip.decompress(raw)


def test_allowed_origins_from_env(client):
    assert parse_origins("") == ("*",)
    assert parse_origins("https://a.web.app, https://b.web.app") == ("https://a.web.app", "https://b.web.app")
    # the default (`*`) settings answer a preflight from anywhere
    r = client.options(P + "/query/emissions", headers={"Origin": "https://example.org", "Access-Control-Request-Method": "POST"})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == "*"


def test_restricted_origins(settings):
    from fastapi.testclient import TestClient
    from pakemis_api.app import create_app
    from pakemis_api.settings import Settings
    import dataclasses
    strict = dataclasses.replace(settings, allowed_origins=("https://pakemis.web.app",))
    assert isinstance(strict, Settings)
    with TestClient(create_app(strict)) as c:
        ok = c.options(P + "/release", headers={"Origin": "https://pakemis.web.app", "Access-Control-Request-Method": "GET"})
        assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == "https://pakemis.web.app"
        no = c.options(P + "/release", headers={"Origin": "https://elsewhere.example", "Access-Control-Request-Method": "GET"})
        assert "access-control-allow-origin" not in no.headers


def test_head_answers_as_get_without_a_body(client):
    r = client.head(P + "/release")
    assert r.status_code == 200 and r.content == b"" and r.headers["content-type"].startswith("application/json")
    r = client.head(LEGACY_PREFIX + "/release")
    assert r.status_code == 200 and r.headers["deprecation"] == "true"
    assert client.head(P + "/receipt/0000").status_code == 404
