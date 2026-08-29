# PakEmis Explorer API for Cloud Run, modelled on hawanama-main/apps/api/Dockerfile.
# Build from the repository root (the context carries api/, data/verify_release.py, RELEASES.md):
#     docker build -t pakemis -f api/Dockerfile .
# The query core is the vendored copy api/vendor/pakemis_query (scripts/vendor_query_core.py,
# VENDOR.json names the emissions commit). The release payload is NOT baked in: api/start.sh pulls
# gs://$PAKEMIS_RELEASES_BUCKET/releases/<version>/ when the directory is absent (locally, mount
# data/releases instead), verifies it against its digests, then starts one uvicorn worker.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PAKEMIS_QUERY_PATH=/app/api/vendor \
    PAKEMIS_RELEASES_ROOT=/app/data/releases \
    PAKEMIS_RECEIPT_STORE=/app/data/receipts.json \
    PORT=8080

WORKDIR /app

COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api/ api/
COPY data/verify_release.py data/verify_release.py
COPY RELEASES.md RELEASES.md

RUN chmod +x api/start.sh \
    && groupadd -r pakemis && useradd -r -g pakemis -d /app pakemis \
    && mkdir -p data/releases \
    && chown -R pakemis:pakemis /app
USER pakemis

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python3 -c "import os, sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT', '8080')).status == 200 else 1)"

CMD ["/app/api/start.sh"]
