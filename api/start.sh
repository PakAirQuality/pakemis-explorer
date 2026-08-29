#!/usr/bin/env bash
# Container entrypoint (Cloud Run): make sure the pinned release is on disk, prove it, serve.
#   PAKEMIS_RELEASE_VERSION   the version to serve (default: RELEASES.md's `pinned:` line)
#   PAKEMIS_RELEASES_ROOT     where releases live (default /app/data/releases; a mounted volume locally)
#   PAKEMIS_RELEASES_BUCKET   when set and the release directory is absent, gs://<bucket>/releases/<version>/
#                             is downloaded first (api/pull_release.py; the payload is never baked into the image)
#   PORT                      8080 unless Cloud Run says otherwise
set -euo pipefail
export PYTHONUNBUFFERED=1
cd /app

VERSION="${PAKEMIS_RELEASE_VERSION:-$(sed -n 's/^pinned:[[:space:]]*//p' RELEASES.md)}"
export PAKEMIS_RELEASE_VERSION="$VERSION"
ROOT="${PAKEMIS_RELEASES_ROOT:-/app/data/releases}"
export PAKEMIS_RELEASES_ROOT="$ROOT"

if [ ! -f "$ROOT/$VERSION/outputs/semantic/semantic_release.json" ]; then
  if [ -n "${PAKEMIS_RELEASES_BUCKET:-}" ]; then
    echo "release $VERSION is absent under $ROOT; pulling gs://$PAKEMIS_RELEASES_BUCKET/releases/$VERSION/"
    python3 api/pull_release.py "$PAKEMIS_RELEASES_BUCKET" "$VERSION" "$ROOT"
  else
    echo "release $VERSION is absent under $ROOT and PAKEMIS_RELEASES_BUCKET is not set" >&2
    exit 1
  fi
fi

echo "verifying release $VERSION under $ROOT"
python3 - "$VERSION" "$ROOT" <<'PY'
import sys
sys.path.insert(0, "data")
import verify_release as V
try:
    out = V.verify(sys.argv[1], releases_root=sys.argv[2])
except V.Mismatch as exc:
    print("VERIFY FAILED: %s" % exc, file=sys.stderr)
    sys.exit(1)
print("OK %s verified in %s" % (out["release_id"], out["directory"]))
PY

echo "starting uvicorn on :${PORT:-8080}"
exec python3 -m uvicorn pakemis_api.app:app --app-dir api --host 0.0.0.0 --port "${PORT:-8080}" --workers 1 --proxy-headers --forwarded-allow-ips='*'
