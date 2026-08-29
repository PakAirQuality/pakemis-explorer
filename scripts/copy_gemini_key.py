#!/usr/bin/env python3
"""Copy GEMINI_API_KEY from another project's .env into api/.env (gitignored), by name only.

    python3 scripts/copy_gemini_key.py /path/to/other/.env [api/.env]

Reads the one line `GEMINI_API_KEY=...` from the source, writes or replaces that line in the
target, and prints only "written, length N". The value is never printed, logged or echoed.
"""
import os
import re
import sys

NAME = "GEMINI_API_KEY"
LINE = re.compile(r"^\s*(?:export\s+)?%s\s*=\s*(.*?)\s*$" % NAME)


def read_key(path):
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            m = LINE.match(line)
            if m:
                value = m.group(1)
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                return value
    raise SystemExit("%s: no %s line" % (path, NAME))


def write_key(target, value):
    lines = []
    if os.path.exists(target):
        with open(target, encoding="utf-8") as handle:
            lines = [l for l in handle.read().splitlines() if not LINE.match(l)]
    lines.append("%s=%s" % (NAME, value))
    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    with open(target, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    os.chmod(target, 0o600)


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    source = argv[1]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = argv[2] if len(argv) > 2 else os.path.join(root, "api", ".env")
    value = read_key(source)
    if not value:
        raise SystemExit("%s: %s is empty" % (source, NAME))
    write_key(target, value)
    print("written, length %d" % len(value))


if __name__ == "__main__":
    main(sys.argv)
