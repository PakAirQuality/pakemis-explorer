#!/usr/bin/env python3
"""Download one release payload out of a Google Cloud Storage bucket, mirroring its paths:
gs://<bucket>/releases/<version>/**  ->  <root>/<version>/**   (the payload data/fetch_release.py
wrote, tiles/ included; `make push-release` is the upload).  Credentials: Application Default
Credentials (the Cloud Run service account), else anonymous for a public bucket.

    python3 api/pull_release.py <bucket> <version> [<root>]
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor


def client():
    from google.auth.exceptions import DefaultCredentialsError
    from google.cloud import storage
    try:
        return storage.Client()
    except DefaultCredentialsError:
        return storage.Client.create_anonymous_client()


def pull(bucket_name, version, root, workers=8):
    prefix = "releases/%s/" % version
    bucket = client().bucket(bucket_name)
    blobs = [b for b in bucket.list_blobs(prefix=prefix) if not b.name.endswith("/")]
    if not blobs:
        raise SystemExit("gs://%s/%s holds no objects" % (bucket_name, prefix))
    target = os.path.join(root, version)

    def fetch(blob):
        rel = blob.name[len(prefix):]
        path = os.path.join(target, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        blob.download_to_filename(path)
        return rel, blob.size or 0

    total = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for rel, size in pool.map(fetch, blobs):
            total += size
    print("pulled %d objects, %.1f MB, into %s" % (len(blobs), total / 1e6, target))
    return len(blobs)


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    root = argv[2] if len(argv) > 2 else os.environ.get("PAKEMIS_RELEASES_ROOT", "/app/data/releases")
    pull(argv[0], argv[1], root)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
