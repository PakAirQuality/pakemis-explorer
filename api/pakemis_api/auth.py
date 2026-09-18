"""An OPTIONAL sign-in gate in front of every route, off unless the deployment asks for it.

WHY A GATE AT ALL. The API is a public-data product and its default is open: run it with nothing
set and it answers anyone, as it always has. But a deployment can be an internal one - the
Hawanama internal dashboard embeds this app beside its own modules - and there the operator wants
what that dashboard already has: only people who signed in with a Google account of the
organisation. A dashboard's sign-in is a CLIENT-side gate; it hides pages, it cannot hide files or
an API. So the enforcement has to be here: when the gate is on, a request without a valid identity
gets 401 and no number leaves the process. That also settles the assistant's model key, which is
the one expensive route: it is spendable only by someone who signed in.

WHAT IT VERIFIES. A Firebase ID token (the thing `user.getIdToken()` returns in the browser),
carried as `Authorization: Bearer <token>`. The token is a JWT signed by Google; the gate checks
the signature against Google's published certificates, then `iss`, `aud` (the Firebase project),
`exp`, that the address is verified, and that it is in the operator's allowlist - a domain
(`pakairquality.com`) or a named guest. Nothing here ever mints a token, and nothing is trusted
from the request except the signature.

WHAT IT DOES NOT DO. It does not authorise per route: every signed-in person sees the whole
release, exactly as a public visitor would on the open deployment. It does not protect the static
HTML (a file server has no opinion about who asks); it protects the data, which is what makes the
page worth loading.

Env (all read in settings.py):
  PAKEMIS_REQUIRE_AUTH   ""|off (default) -> open, as today; "firebase" -> the gate below
  PAKEMIS_AUTH_PROJECT   the Firebase project whose tokens are accepted (the `aud` claim)
  PAKEMIS_AUTH_DOMAINS   comma list of email domains allowed, e.g. "pakairquality.com"
  PAKEMIS_AUTH_EMAILS    comma list of individual addresses allowed beside those domains
"""
import json
import time
from dataclasses import dataclass, field

CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
ISSUER = "https://securetoken.google.com/%s"
MODES = ("", "off", "firebase")
#

# The routes that answer without an identity: the container's health check (Cloud Run calls it with
# no token at all, and a failing health check would take the service down), under either prefix.
# On Cloud Run the ROOT /healthz never arrives - Google's front end answers that exact path with
# its own 404 before the container sees it - so a deployment there checks the prefixed one.
EXEMPT_SUFFIXES = ("/healthz",)
CERT_TTL = 3600.0          # Google rotates the securetoken certs slowly; an hour is their own hint


@dataclass(frozen=True)
class AuthPolicy:
    """What the deployment asks for. `mode == ""` is the open default: the gate is not installed."""

    mode: str = ""
    project: str = ""
    domains: tuple = ()
    emails: tuple = ()

    @property
    def on(self):
        return self.mode == "firebase"

    def validate(self):
        if self.mode not in MODES:
            raise RuntimeError("PAKEMIS_REQUIRE_AUTH must be one of %s, not %r" % (", ".join(m or '""' for m in MODES), self.mode))
        if self.on and not self.project:
            raise RuntimeError("PAKEMIS_REQUIRE_AUTH=firebase needs PAKEMIS_AUTH_PROJECT (the Firebase project whose tokens are accepted)")
        if self.on and not (self.domains or self.emails):
            raise RuntimeError("PAKEMIS_REQUIRE_AUTH=firebase needs PAKEMIS_AUTH_DOMAINS or PAKEMIS_AUTH_EMAILS: "
                               "a gate that admits every Google account in the world is not a gate")
        return self

    def admits(self, email, verified):
        """(ok, reason): the allowlist, applied to a verified address."""
        if not email:
            return False, "the token carries no email address"
        if not verified:
            return False, "the account's email address is not verified"
        if email.lower() in {e.lower() for e in self.emails}:
            return True, ""
        domain = email.rsplit("@", 1)[-1].lower()
        if domain in {d.lower().lstrip("@") for d in self.domains}:
            return True, ""
        return False, "%s is not an address this deployment admits" % email


class Denied(Exception):
    """A request the gate refuses, with the sentence the browser is allowed to see."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class FirebaseVerifier:
    """Verifies Firebase ID tokens against Google's certificates, which it caches.

    The signature check is google-auth's (`google.auth.jwt.decode`, which also checks `exp` and
    `aud`); the certificates are fetched with httpx and kept for an hour, so a request costs one
    RSA verification and no network call. Imports are deferred so that the open deployment - and
    every test that never turns the gate on - needs neither library at import time.
    """

    policy: AuthPolicy
    _certs: dict = field(default_factory=dict)
    _fetched_at: float = 0.0

    async def certs(self):
        if self._certs and (time.monotonic() - self._fetched_at) < CERT_TTL:
            return self._certs
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(CERT_URL)
            response.raise_for_status()
            self._certs = response.json()
        self._fetched_at = time.monotonic()
        return self._certs

    async def claims(self, token):
        """The token's claims when it is signed by Google, current, minted for this project and
        held by somebody the policy admits; else Denied, whose message is safe to show."""
        from google.auth import jwt as google_jwt

        certs = await self.certs()
        try:
            claims = google_jwt.decode(token, certs=certs, audience=self.policy.project)
        except ValueError as exc:
            raise Denied("invalid_token", "the sign-in token was not accepted: %s" % exc)
        if claims.get("iss") != ISSUER % self.policy.project:
            raise Denied("invalid_token", "the sign-in token was issued for another project")
        ok, reason = self.policy.admits(claims.get("email", ""), bool(claims.get("email_verified")))
        if not ok:
            raise Denied("not_admitted", reason)
        return claims


def bearer(headers):
    """The bearer token of an ASGI header list, or "" - case-insensitive, scheme required."""
    for name, value in headers:
        if name.lower() == b"authorization":
            text = value.decode("latin-1").strip()
            if text.lower().startswith("bearer "):
                return text[7:].strip()
    return ""


class AuthGateMiddleware:
    """Pure ASGI (like the other two): it inspects the request line and either passes the call
    through untouched or answers 401 itself, so the SSE stream and the pass-through tile bytes are
    never buffered. Installed only when the policy is on.

    OPTIONS passes: a CORS preflight carries no Authorization header by construction, and refusing
    it would turn every cross-origin request into a network error instead of a readable 401.
    """

    def __init__(self, app, policy, verifier=None):
        self.app = app
        self.policy = policy
        self.verifier = verifier or FirebaseVerifier(policy)

    def exempt(self, scope):
        # the trailing slash is stripped first: /healthz and /healthz/ are one route to a health
        # checker, and an exemption that turned on a slash would be a trap rather than a rule
        path = (scope.get("path", "") or "/").rstrip("/") or "/"
        return scope.get("method") == "OPTIONS" or any(path == s or path.endswith(s) for s in EXEMPT_SUFFIXES)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or self.exempt(scope):
            await self.app(scope, receive, send)
            return
        token = bearer(scope.get("headers", []))
        if not token:
            await self.refuse(send, "not_signed_in", "this deployment serves people who have signed in; "
                                                     "open it from the dashboard that embeds it")
            return
        try:
            claims = await self.verifier.claims(token)
        except Denied as denied:
            await self.refuse(send, denied.code, denied.message)
            return
        except Exception:                                  # a cert fetch that failed: say so, do not admit
            await self.refuse(send, "sign_in_unavailable", "the sign-in check could not be completed; try again", status=503)
            return
        scope = dict(scope, state={**scope.get("state", {}), "user_email": claims.get("email", "")})
        await self.app(scope, receive, send)

    async def refuse(self, send, code, message, status=401):
        body = json.dumps({"error": code, "message": message}).encode("utf-8")
        headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode("ascii"))]
        if status == 401:
            headers.append((b"www-authenticate", b'Bearer realm="pakemis"'))
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})
