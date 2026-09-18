"""Settings: where the query core lives, which release is served, where receipts are kept.

PAKEMIS_QUERY_PATH      the directory that holds pakemis_query. Default: the sibling emissions
                        checkout's src/ (/Users/rehanahmad/Desktop/emissions/src) when it exists,
                        else the vendored copy api/vendor/ (written by scripts/vendor_query_core.py
                        from a recorded commit; the container image carries only that copy).
ALLOWED_ORIGINS         comma-separated CORS origins (default `*`, the development setting).
PAKEMIS_RELEASES_ROOT   data/releases (default) - the directory fetch_release.py writes into.
PAKEMIS_RELEASE_VERSION the version to serve (default: the `pinned:` line of RELEASES.md).
PAKEMIS_RECEIPT_STORE   a JSON file mapping receipt -> canonical request (default data/receipts.json);
                        receipts are replayed from the request, never served from a stored result.
PAKEMIS_REQUIRE_AUTH    ""/off (default) -> the API answers anyone, as a public-data API does;
                        "firebase" -> every route but /healthz needs a Firebase ID token from
                        PAKEMIS_AUTH_PROJECT held by PAKEMIS_AUTH_DOMAINS/PAKEMIS_AUTH_EMAILS
                        (auth.py). An internal deployment turns it on; nothing else changes.
PAKEMIS_ASK_PROVIDER    auto (default) | anthropic | gemini. auto picks gemini when PAKEMIS_ASK_MODEL
                        starts with "gemini" or when GEMINI_API_KEY (or GOOGLE_API_KEY) is set and
                        ANTHROPIC_API_KEY is not; otherwise anthropic.
PAKEMIS_ASK_MODEL       the model id; empty -> the provider's default (claude-sonnet-5 for anthropic,
                        gemini-3.1-pro-preview for gemini, which falls back to gemini-2.5-pro then
                        gemini-2.5-flash when the key cannot use it).
The keys themselves are read by the provider SDKs from the environment; nothing here reads them.
"""
import os
import re
import sys
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT_QUERY_PATH = "/Users/rehanahmad/Desktop/emissions/src"
VENDOR_QUERY_PATH = os.path.join(os.path.dirname(HERE), "vendor")     # api/vendor/pakemis_query
API_PREFIX = "/api/v1/emissions"     # every route; Firebase Hosting rewrites this prefix to the Cloud Run service
LEGACY_PREFIX = "/v1"                # the pre-prefix paths, answered with `Deprecation: true` for one release
DEFAULT_ASK_MODEL = "claude-sonnet-5"
DEFAULT_ASK_MODELS = {"anthropic": DEFAULT_ASK_MODEL, "gemini": "gemini-3.1-pro-preview"}
GEMINI_FALLBACKS = ("gemini-2.5-pro", "gemini-2.5-flash")
ASK_PROVIDERS = ("auto", "anthropic", "gemini")
KEY_VARS = {"anthropic": ("ANTHROPIC_API_KEY",), "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY")}


def _key_present(provider):
    return any(os.environ.get(v) for v in KEY_VARS[provider])


def default_query_path():
    """PAKEMIS_QUERY_PATH, else the emissions checkout when it is present (development: its golden
    files sit beside it), else the vendored copy (the container)."""
    explicit = os.environ.get("PAKEMIS_QUERY_PATH")
    if explicit:
        return explicit
    if os.path.isdir(os.path.join(DEFAULT_QUERY_PATH, "pakemis_query")):
        return DEFAULT_QUERY_PATH
    if os.path.isdir(os.path.join(VENDOR_QUERY_PATH, "pakemis_query")):
        return VENDOR_QUERY_PATH
    return DEFAULT_QUERY_PATH


def parse_origins(text):
    """'a, b' -> ('a', 'b'); empty -> ('*',)."""
    return parse_list(text) or ("*",)


def parse_list(text):
    """'a, b' -> ('a', 'b'); empty -> (). Unlike parse_origins, empty means EMPTY - an allowlist
    nobody wrote admits nobody, where an origin list nobody wrote admits everyone."""
    return tuple(o.strip() for o in (text or "").split(",") if o.strip())


def pinned_version(releases_md):
    with open(releases_md, encoding="utf-8") as handle:
        for line in handle:
            m = re.match(r"^\s*pinned:\s*(\S+)", line)
            if m:
                return m.group(1)
    raise RuntimeError("%s carries no 'pinned:' line" % releases_md)


@dataclass(frozen=True)
class Settings:
    query_path: str
    releases_root: str
    version: str
    receipt_store: str
    releases_md: str
    ask_model: str = ""                           # ask: PAKEMIS_ASK_MODEL; empty -> the provider's default; caps are read by ask/limits.py
    ask_provider: str = "auto"                    # ask: PAKEMIS_ASK_PROVIDER
    allowed_origins: tuple = ("*",)               # ALLOWED_ORIGINS (CORS); `*` in development
    require_auth: str = ""                        # PAKEMIS_REQUIRE_AUTH; "" -> open, "firebase" -> the gate
    auth_project: str = ""                        # PAKEMIS_AUTH_PROJECT
    auth_domains: tuple = ()                      # PAKEMIS_AUTH_DOMAINS
    auth_emails: tuple = ()                       # PAKEMIS_AUTH_EMAILS

    @classmethod
    def from_env(cls, **override):
        releases_md = override.get("releases_md") or os.path.join(ROOT, "RELEASES.md")
        version = override.get("version") or os.environ.get("PAKEMIS_RELEASE_VERSION") or pinned_version(releases_md)
        return cls(
            query_path=override.get("query_path") or default_query_path(),
            releases_root=override.get("releases_root") or os.environ.get("PAKEMIS_RELEASES_ROOT", os.path.join(ROOT, "data", "releases")),
            version=version,
            receipt_store=override.get("receipt_store") or os.environ.get("PAKEMIS_RECEIPT_STORE", os.path.join(ROOT, "data", "receipts.json")),
            releases_md=releases_md,
            ask_model=override.get("ask_model") or os.environ.get("PAKEMIS_ASK_MODEL", ""),
            ask_provider=override.get("ask_provider") or os.environ.get("PAKEMIS_ASK_PROVIDER", "auto"),
            allowed_origins=override.get("allowed_origins") or parse_origins(os.environ.get("ALLOWED_ORIGINS", "*")),
            require_auth=override.get("require_auth") or os.environ.get("PAKEMIS_REQUIRE_AUTH", ""),
            auth_project=override.get("auth_project") or os.environ.get("PAKEMIS_AUTH_PROJECT", ""),
            auth_domains=override.get("auth_domains") or parse_list(os.environ.get("PAKEMIS_AUTH_DOMAINS", "")),
            auth_emails=override.get("auth_emails") or parse_list(os.environ.get("PAKEMIS_AUTH_EMAILS", "")),
        )

    @property
    def auth_policy(self):
        """The sign-in gate this deployment asks for; `.on` is False for the open default."""
        from pakemis_api.auth import AuthPolicy

        return AuthPolicy(mode=(self.require_auth or "").strip().lower(), project=self.auth_project,
                          domains=self.auth_domains, emails=self.auth_emails).validate()

    @property
    def resolved_ask_provider(self):
        """anthropic | gemini: the explicit setting, else the model id's prefix, else which key is set."""
        provider = (self.ask_provider or "auto").lower()
        if provider not in ASK_PROVIDERS:
            raise RuntimeError("PAKEMIS_ASK_PROVIDER must be one of %s, not %r" % (", ".join(ASK_PROVIDERS), self.ask_provider))
        if provider != "auto":
            return provider
        if self.ask_model.startswith("gemini"):
            return "gemini"
        if _key_present("gemini") and not _key_present("anthropic"):
            return "gemini"
        return "anthropic"

    @property
    def resolved_ask_model(self):
        return self.ask_model or DEFAULT_ASK_MODELS[self.resolved_ask_provider]

    @property
    def ask_enabled(self):
        """The agent runs only when the API's environment carries the chosen provider's key; the value is never read here."""
        return _key_present(self.resolved_ask_provider)

    @property
    def ask_disabled_reason(self):
        """Names the missing variable(s); never a value."""
        if self.ask_enabled:
            return None
        if (self.ask_provider or "auto").lower() == "auto" and not self.ask_model:
            return "neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set in the API's environment"
        return "%s is not set in the API's environment" % " or ".join(KEY_VARS[self.resolved_ask_provider])

    @property
    def release_dir(self):
        return os.path.join(self.releases_root, self.version)

    @property
    def semantic_dir(self):
        return os.path.join(self.release_dir, "outputs", "semantic")

    @property
    def manifest_path(self):
        return os.path.join(self.release_dir, "outputs", "release_manifest.json")

    @property
    def method_registry(self):
        return os.path.join(self.release_dir, "data", "method_registry.csv")

    @property
    def registries_dir(self):
        """fetch_release.py's copies of the registries GET /claim joins (data/registries/<basename>)."""
        return os.path.join(self.release_dir, "data", "registries")

    @property
    def tiles_dir(self):
        """tiles/build_tiles.py's output inside the release payload: the PMTiles, TILES.json,
        bboxes.json and raster/."""
        return os.path.join(self.release_dir, "tiles")

    @property
    def cube_paths(self):
        return {"REF_2023_24": os.path.join(self.release_dir, "outputs", "pakemis_grid_0p05_monthly.nc"),
                "S_2023_24": os.path.join(self.release_dir, "outputs", "pakemis_grid_0p05_monthly_survey.nc")}


def import_query_core(query_path=None):
    """Put the query core's directory on sys.path and import pakemis_query from there."""
    path = query_path or default_query_path()
    if path not in sys.path:
        sys.path.insert(0, path)
    import pakemis_query  # noqa: F401
    return pakemis_query
