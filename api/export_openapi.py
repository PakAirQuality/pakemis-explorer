#!/usr/bin/env python3
"""Write api/openapi.json from the app's schema (no release needed: the schema is static).

    python3 api/export_openapi.py            # writes api/openapi.json
    python3 api/export_openapi.py --check    # exit 1 if the committed file is stale
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("PAKEMIS_API_LAZY", "1")

from pakemis_api.app import create_app  # noqa: E402


def schema_text():
    app = create_app()
    return json.dumps(app.openapi(), indent=1, sort_keys=True) + "\n"


def main(argv):
    path = os.path.join(HERE, "openapi.json")
    text = schema_text()
    if "--check" in argv:
        current = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        if current != text:
            print("api/openapi.json is stale; run `make openapi`", file=sys.stderr)
            return 1
        print("api/openapi.json is fresh")
        return 0
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    print("wrote %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
