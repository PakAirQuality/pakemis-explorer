"""Response headers on every route: hawanama's baseline security headers, and the deprecation
signal on the legacy `/v1/*` alias; HEAD answered as GET without the body.

Pure ASGI (no BaseHTTPMiddleware) so the SSE stream of POST /ask and the pass-through gzip of the
tile bytes are untouched; only the `http.response.start` message is edited.
"""
from starlette.datastructures import MutableHeaders

SECURITY_HEADERS = (
    ("Strict-Transport-Security", "max-age=31536000; includeSubDomains"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
)


class ResponseHeadersMiddleware:
    """Adds SECURITY_HEADERS (setdefault) to every response; a request under `legacy_prefix`
    is answered with `Deprecation: true` and a `Link` to the same path under `prefix`."""

    def __init__(self, app, prefix, legacy_prefix):
        self.app = app
        self.prefix = prefix
        self.legacy_prefix = legacy_prefix

    def successor(self, path):
        if path == self.legacy_prefix or path.startswith(self.legacy_prefix + "/"):
            return self.prefix + path[len(self.legacy_prefix):]
        return None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        successor = self.successor(scope.get("path", ""))

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS:
                    headers.setdefault(name, value)
                if successor is not None:
                    headers["Deprecation"] = "true"
                    headers["Link"] = '<%s>; rel="successor-version"' % successor
            await send(message)

        await self.app(scope, receive, send_with_headers)


class HeadAsGetMiddleware:
    """HEAD runs the GET handler and drops the body: FastAPI's `get` routes answer HEAD with 405,
    and `curl -I` on a tile or the release is the natural check of a deployment."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "HEAD":
            await self.app(scope, receive, send)
            return
        scope = dict(scope, method="GET")

        async def send_without_body(message):
            if message["type"] == "http.response.body":
                message = {"type": "http.response.body", "body": b"", "more_body": message.get("more_body", False)}
            await send(message)

        await self.app(scope, receive, send_without_body)
