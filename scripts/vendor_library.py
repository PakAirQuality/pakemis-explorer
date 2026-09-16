"""Copy the assistant's knowledge files into the API package that serves them.

THE PACKAGE UNDER assistant/ IS THE SOURCE OF TRUTH; api/pakemis_api/ask/library/ is a COPY,
because the API must import its knowledge from inside its own package (the Cloud Run image
carries api/ and not assistant/). The copy was first made by hand, which meant a rebuilt
register did not reach the running server until someone remembered to copy it - the kind of
step that is skipped exactly once and then debugged for an hour. This is that step, written down.

It copies only the files the server imports, verifies each copy byte-for-byte, and prints the
content digest the review gate pins, so a changed digest is visible at the moment it changes
rather than at the next review.
"""
import hashlib
import os
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "assistant")
DST = os.path.join(HERE, "api", "pakemis_api", "ask", "library")

# knowledge/ holds the content; the two modules are the loader and the router that read it
FILES = [("knowledge/cards.json", "cards.json"),
         ("knowledge/sources.json", "sources.json"),
         ("knowledge/conflicts.json", "conflicts.json"),
         ("knowledge/citation_map.json", "citation_map.json")]


def digest(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    if not os.path.isdir(DST):
        raise SystemExit("no library package at %s" % DST)
    moved = []
    for rel, name in FILES:
        src, dst = os.path.join(SRC, rel), os.path.join(DST, name)
        if not os.path.exists(src):
            raise SystemExit("missing source file: %s" % src)
        before = digest(dst) if os.path.exists(dst) else None
        shutil.copyfile(src, dst)
        after = digest(dst)
        if after != digest(src):
            raise SystemExit("copy of %s does not match its source" % rel)
        moved.append((name, after, before != after))
    print("library -> %s" % os.path.relpath(DST, HERE))
    for name, sha, changed in moved:
        print("  %-20s %s%s" % (name, sha[:16], "  CHANGED" if changed else ""))
    if any(c for _, _, c in moved):
        print("  content moved: the owner review digest must be re-set before this is shipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
