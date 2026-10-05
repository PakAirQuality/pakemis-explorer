"""The bot check on the assistant (appcheck.py): a Firebase App Check token is accepted only when
it is signed by the key set, minted for this project (and, when asked, this app) and unexpired;
`report` logs a failure and answers, `enforce` refuses it; unset, nothing is asked of anyone.

No network: the tokens are signed here with a key made here, and the verifier is handed that
key's public half through its `signing_key` seam."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from pakemis_api.appcheck import AUDIENCE, HEADER, ISSUER, AppCheckError, AppCheckPolicy, AppCheckVerifier

PROJECT = "152782825429"
APP = "1:152782825429:web:0000000000000000000000"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(key=KEY, alg="RS256", headers=None, **claims):
    body = {"iss": ISSUER % PROJECT, "aud": [AUDIENCE % PROJECT, "projects/some-project-id"], "sub": APP,
            "iat": int(time.time()) - 5, "exp": int(time.time()) + 3600}
    body.update(claims)
    return jwt.encode({k: v for k, v in body.items() if v is not None}, key, algorithm=alg, headers=headers)


def verifier(mode="enforce", apps=()):
    return AppCheckVerifier(AppCheckPolicy(mode=mode, project=PROJECT, apps=tuple(apps)).validate(), signing_key=lambda _token: KEY.public_key())


def reason(v, tok):
    with pytest.raises(AppCheckError) as exc:
        v.claims(tok)
    return str(exc.value)


def test_a_token_minted_for_this_project_is_accepted():
    claims = verifier().claims(token())
    assert claims["sub"] == APP
    assert verifier().verdict({HEADER: token()}) == "ok"
    # and for this app, when the deployment names its apps
    assert verifier(apps=[APP]).verdict({HEADER: token()}) == "ok"


def test_every_way_a_token_is_wrong_is_refused_by_name():
    v = verifier()
    assert reason(v, "") == "missing"
    assert v.verdict({}) == "missing"
    assert reason(v, token(exp=int(time.time()) - 10)) == "expired"
    assert reason(v, token(aud=["projects/999"])) == "wrong-project"
    assert reason(v, token(iss=ISSUER % "999")) == "wrong-issuer"
    assert reason(v, token(key=OTHER)).startswith("invalid:")              # signed by somebody else
    assert reason(v, "not.a.token").startswith("invalid:")
    assert reason(v, token(sub=None)).startswith("invalid:")               # no app named at all
    # a symmetric token must never be checked against a public key as though it were a secret
    assert reason(v, token(key="a-shared-secret-of-thirty-two-bytes!!", alg="HS256")) == "wrong-algorithm"
    assert reason(verifier(apps=["1:152782825429:web:another"]), token()) == "wrong-app"


def test_a_key_set_that_cannot_be_reached_refuses_rather_than_admits():
    def unreachable(_token):
        raise OSError("no route to the key set")
    v = AppCheckVerifier(AppCheckPolicy(mode="enforce", project=PROJECT).validate(), signing_key=unreachable)
    assert v.verdict({HEADER: token()}) == "unverifiable:OSError"


def test_the_policy_refuses_to_start_half_configured(monkeypatch):
    for var in ("PAKEMIS_APP_CHECK", "PAKEMIS_APP_CHECK_PROJECT", "PAKEMIS_APP_CHECK_APPS"):
        monkeypatch.delenv(var, raising=False)
    off = AppCheckPolicy.from_env()
    assert not off.on and not off.enforced                                # the repository's default
    monkeypatch.setenv("PAKEMIS_APP_CHECK", "enforce")
    with pytest.raises(ValueError):                                       # on, with no project to check against
        AppCheckPolicy.from_env()
    monkeypatch.setenv("PAKEMIS_APP_CHECK_PROJECT", "hawanama-2")
    with pytest.raises(ValueError):                                       # an id where the tokens carry a number
        AppCheckPolicy.from_env()
    monkeypatch.setenv("PAKEMIS_APP_CHECK_PROJECT", PROJECT)
    monkeypatch.setenv("PAKEMIS_APP_CHECK_APPS", " %s , " % APP)
    on = AppCheckPolicy.from_env()
    assert on.enforced and on.apps == (APP,)
    monkeypatch.setenv("PAKEMIS_APP_CHECK", "strict")
    with pytest.raises(ValueError):
        AppCheckPolicy.from_env()


def _ask(client, headers=None):
    return client.post("/api/v1/emissions/ask", json={"message": "hello", "ui_state": {}}, headers=headers or {})


def test_the_assistant_route_under_each_mode(settings):
    from pakemis_api.app import create_app
    from pakemis_api.ask.loop import ModelEvent

    class Model:
        model_id = "fake-model"

        def stream(self, system, messages, tools):
            yield ModelEvent("text_delta", text="Ask me for a figure.")
            yield ModelEvent("stop", stop_reason="end_turn", usage={"input_tokens": 10, "output_tokens": 5})

    with TestClient(create_app(settings, model_client=Model())) as c:
        runtime = c.app.state.ask
        assert runtime.app_check is None                                  # unset: nothing is asked of anyone
        assert _ask(c).status_code == 200

        runtime.app_check = verifier("report")                            # logs, and answers regardless
        assert _ask(c).status_code == 200
        assert _ask(c, {HEADER: "garbage"}).status_code == 200

        runtime.app_check = verifier("enforce")
        refused = _ask(c)
        assert refused.status_code == 401 and refused.json()["error"] == "app_check_failed"
        assert _ask(c, {HEADER: token(exp=int(time.time()) - 10)}).status_code == 401
        assert _ask(c, {HEADER: token()}).status_code == 200
        # only the assistant is checked: the data stays open to anyone
        assert c.get("/api/v1/emissions/release").status_code == 200
