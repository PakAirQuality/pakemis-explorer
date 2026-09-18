"""The optional sign-in gate (auth.py): off by default, and when a deployment turns it on, no
route but the health check answers without an admitted identity.

The verifier is stubbed here - minting a real Firebase token would need a Firebase project and a
network - so what these tests hold is the GATE's own contract: which requests are refused, which
pass, what the browser is told, and that the open default is untouched. The token's cryptography
is google-auth's and is not re-tested.
"""
import pytest

from pakemis_api.auth import AuthGateMiddleware, AuthPolicy, Denied, bearer
from pakemis_api.settings import API_PREFIX, Settings

P = API_PREFIX
POLICY = AuthPolicy(mode="firebase", project="hawanama-2", domains=("pakairquality.com",), emails=("guest@example.org",))


class StubVerifier:
    """Accepts one token string and reports the claims of the person holding it."""

    def __init__(self, accepts, claims=None):
        self.accepts = accepts
        self.claims_for = claims or {"email": "someone@pakairquality.com", "email_verified": True}
        self.calls = 0

    async def claims(self, token):
        self.calls += 1
        if token != self.accepts:
            raise Denied("invalid_token", "the sign-in token was not accepted")
        ok, reason = POLICY.admits(self.claims_for.get("email", ""), bool(self.claims_for.get("email_verified")))
        if not ok:
            raise Denied("not_admitted", reason)
        return self.claims_for


@pytest.fixture
def gated(settings):
    """A factory for the app with the gate installed around it, as create_app does when the policy
    is on. The client is entered (the lifespan builds the service) and closed with the test."""
    from contextlib import ExitStack
    from fastapi.testclient import TestClient
    from pakemis_api.app import create_app

    stack = ExitStack()

    def build(verifier):
        app = create_app(settings)
        app.add_middleware(AuthGateMiddleware, policy=POLICY, verifier=verifier)
        return stack.enter_context(TestClient(app))

    yield build
    stack.close()


# --- the open default ------------------------------------------------------------------------

def test_the_default_is_open(settings, client):
    """Nothing set: the policy is off and the API answers anyone, as a public-data API does."""
    assert settings.auth_policy.on is False
    assert client.get(P + "/release").status_code == 200


def test_a_policy_that_admits_everyone_is_refused_at_startup():
    """A gate with no allowlist would be theatre; the settings refuse to start rather than pretend."""
    with pytest.raises(RuntimeError, match="not a gate"):
        AuthPolicy(mode="firebase", project="hawanama-2").validate()
    with pytest.raises(RuntimeError, match="PAKEMIS_AUTH_PROJECT"):
        AuthPolicy(mode="firebase", domains=("example.org",)).validate()
    with pytest.raises(RuntimeError, match="PAKEMIS_REQUIRE_AUTH"):
        AuthPolicy(mode="yes").validate()


def test_settings_read_the_gate_from_the_environment(monkeypatch, settings):
    monkeypatch.setenv("PAKEMIS_REQUIRE_AUTH", "firebase")
    monkeypatch.setenv("PAKEMIS_AUTH_PROJECT", "hawanama-2")
    monkeypatch.setenv("PAKEMIS_AUTH_DOMAINS", "pakairquality.com, example.org")
    monkeypatch.setenv("PAKEMIS_AUTH_EMAILS", "guest@example.net")
    policy = Settings.from_env(releases_md=settings.releases_md).auth_policy
    assert policy.on and policy.project == "hawanama-2"
    assert policy.domains == ("pakairquality.com", "example.org") and policy.emails == ("guest@example.net",)


# --- the gate --------------------------------------------------------------------------------

def test_an_anonymous_request_is_refused_by_name(gated):
    c = gated(StubVerifier("good"))
    r = c.get(P + "/release")
    assert r.status_code == 401
    assert r.json() == {"error": "not_signed_in",
                        "message": "this deployment serves people who have signed in; open it from the dashboard that embeds it"}
    assert r.headers["www-authenticate"].startswith("Bearer")


def test_the_health_check_still_answers_without_a_token(gated):
    """Cloud Run calls /healthz unsigned; a gate that failed it would take the service down."""
    c = gated(StubVerifier("good"))
    assert c.get("/healthz").status_code == 200
    assert c.get(P + "/healthz").status_code == 200


def test_a_signed_in_request_passes_through(gated):
    v = StubVerifier("good")
    c = gated(v)
    r = c.get(P + "/release", headers={"Authorization": "Bearer good"})
    assert r.status_code == 200 and r.json()["version"]
    assert v.calls == 1


def test_a_token_from_elsewhere_is_refused(gated):
    c = gated(StubVerifier("good"))
    r = c.get(P + "/release", headers={"Authorization": "Bearer someone-elses"})
    assert r.status_code == 401 and r.json()["error"] == "invalid_token"


def test_an_address_outside_the_allowlist_is_refused_by_name(gated):
    v = StubVerifier("good", {"email": "stranger@gmail.com", "email_verified": True})
    r = gated(v).get(P + "/release", headers={"Authorization": "Bearer good"})
    assert r.status_code == 401 and r.json()["error"] == "not_admitted"
    assert "stranger@gmail.com" in r.json()["message"]


def test_an_unverified_address_is_refused(gated):
    v = StubVerifier("good", {"email": "someone@pakairquality.com", "email_verified": False})
    r = gated(v).get(P + "/release", headers={"Authorization": "Bearer good"})
    assert r.status_code == 401 and "not verified" in r.json()["message"]


def test_the_gate_covers_the_data_routes_and_the_assistant(gated):
    """The whole point: no number and no model call without an identity."""
    c = gated(StubVerifier("good"))
    for method, path, body in (("post", P + "/query/emissions", {"periods": ["FY2023-24"]}),
                               ("post", P + "/ask", {"messages": []}),
                               ("get", P + "/tiles/adm1", None),
                               ("get", "/openapi.json", None)):
        r = c.post(path, json=body) if method == "post" else c.get(path)
        assert r.status_code == 401, path


def test_a_preflight_is_not_refused(gated):
    """A CORS preflight carries no Authorization by construction; refusing it would turn a
    readable 401 into an opaque network error in the browser."""
    c = gated(StubVerifier("good"))
    r = c.options(P + "/query/emissions", headers={"Origin": "https://example.org",
                                                   "Access-Control-Request-Method": "POST"})
    assert r.status_code < 400


def test_a_verifier_that_cannot_reach_google_refuses_rather_than_admits(gated):
    class Broken:
        async def claims(self, token):
            raise OSError("no route to host")

    r = gated(Broken()).get(P + "/release", headers={"Authorization": "Bearer good"})
    assert r.status_code == 503 and r.json()["error"] == "sign_in_unavailable"


def test_bearer_reads_the_header_the_browser_sends():
    assert bearer([(b"authorization", b"Bearer abc")]) == "abc"
    assert bearer([(b"Authorization", b"bearer abc")]) == "abc"      # case-insensitive, both parts
    assert bearer([(b"authorization", b"Basic abc")]) == ""          # another scheme is not a token
    assert bearer([]) == ""
