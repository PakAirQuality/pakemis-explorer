"""The bot check on the assistant: Firebase App Check, off unless the deployment asks for it.

An open API cannot tell a reader's browser from a script, and the assistant is the one route
where the difference costs money. App Check closes most of that gap: the site's own page obtains
a short-lived token from Firebase (which grants it on the strength of a reCAPTCHA assessment made
in that browser), sends it as `X-Firebase-AppCheck`, and this module verifies it - signature
against the keys Google publishes, issuer and audience against the project, expiry, and
optionally the app it was minted for. A request made with curl has no token to send.

    PAKEMIS_APP_CHECK           unset = off (the repository's default) | report | enforce
    PAKEMIS_APP_CHECK_PROJECT   the Firebase project NUMBER the tokens are minted for
    PAKEMIS_APP_CHECK_APPS      optional comma list of Firebase app ids; empty admits any app of the project

`report` verifies and logs and answers regardless: it is how a deployment finds out that its real
readers carry valid tokens BEFORE it starts refusing the ones who do not - a reader with a tab
opened yesterday has a page that never learned to ask for one.

⚠ IT RAISES THE COST OF ABUSE; IT DOES NOT END IT. Someone driving a real browser passes. The
budgets in ask/limits.py and the provider's quota on the key are what bound that case.

The JOSE work is PyJWT's (imported on first use, so a deployment that leaves this off needs
neither it nor a network path to the key set).
"""
import logging
import os
from dataclasses import dataclass

log = logging.getLogger("pakemis_api.ask")

JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks"
ISSUER = "https://firebaseappcheck.googleapis.com/%s"
AUDIENCE = "projects/%s"
HEADER = "x-firebase-appcheck"
KEYS_TTL = 6 * 3600          # Google's own guidance for this key set
MODES = ("", "report", "enforce")


@dataclass(frozen=True)
class AppCheckPolicy:
    mode: str = ""
    project: str = ""
    apps: tuple = ()

    @classmethod
    def from_env(cls):
        return cls(mode=(os.environ.get("PAKEMIS_APP_CHECK") or "").strip().lower(),
                   project=(os.environ.get("PAKEMIS_APP_CHECK_PROJECT") or "").strip(),
                   apps=tuple(a.strip() for a in (os.environ.get("PAKEMIS_APP_CHECK_APPS") or "").split(",") if a.strip())).validate()

    @property
    def on(self):
        return self.mode != ""

    @property
    def enforced(self):
        return self.mode == "enforce"

    def validate(self):
        if self.mode not in MODES:
            raise ValueError("PAKEMIS_APP_CHECK=%r is not one of: unset, report, enforce" % self.mode)
        if self.on and not self.project.isdigit():
            # the tokens name the project by NUMBER; an id here would refuse every reader
            raise ValueError("PAKEMIS_APP_CHECK is on but PAKEMIS_APP_CHECK_PROJECT=%r is not a project number" % self.project)
        return self


class AppCheckError(Exception):
    """Why a token was not accepted, in a word a log line can carry."""


class AppCheckVerifier:
    """Verifies one token against the policy. `signing_key` is the seam the tests use: given a
    token it returns the public key that should have signed it (by default, from Google's set)."""

    def __init__(self, policy, signing_key=None):
        self.policy = policy
        self._signing_key = signing_key
        self._jwks = None

    def _key_for(self, token):
        if self._signing_key is not None:
            return self._signing_key(token)
        import jwt
        if self._jwks is None:
            self._jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True, lifespan=KEYS_TTL, timeout=5)
        return self._jwks.get_signing_key_from_jwt(token).key

    def claims(self, token):
        """The token's claims, or AppCheckError naming what was wrong with it."""
        if not token:
            raise AppCheckError("missing")
        import jwt
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or header.get("typ") != "JWT":
                raise AppCheckError("wrong-algorithm")
            claims = jwt.decode(token, self._key_for(token), algorithms=["RS256"],
                                audience=AUDIENCE % self.policy.project, issuer=ISSUER % self.policy.project,
                                options={"require": ["exp", "iss", "aud", "sub"]})
        except AppCheckError:
            raise
        except jwt.ExpiredSignatureError:
            raise AppCheckError("expired") from None
        except jwt.InvalidAudienceError:
            raise AppCheckError("wrong-project") from None
        except jwt.InvalidIssuerError:
            raise AppCheckError("wrong-issuer") from None
        except jwt.PyJWTError as exc:
            raise AppCheckError("invalid:%s" % type(exc).__name__) from None
        except Exception as exc:                     # the key set unreachable, a malformed key
            raise AppCheckError("unverifiable:%s" % type(exc).__name__) from None
        if self.policy.apps and claims.get("sub") not in self.policy.apps:
            raise AppCheckError("wrong-app")
        return claims

    def verdict(self, headers):
        """`ok`, or the reason the request's token was not accepted. Never raises."""
        try:
            self.claims(headers.get(HEADER) or "")
        except AppCheckError as exc:
            return str(exc)
        return "ok"
