"""Derive the assistant's citation register from the release payload the Explorer verifies.

WHY DERIVED AND NOT TRANSCRIBED. The first version of this library cited the project's own
published PDFs by page - 112 citations across 69 of the 72 cards - and carried a 9.7 MB copy of
them so the page numbers would resolve. Two things were wrong with that. The copies go stale at
every release fixpoint, so a page citation silently drifts onto a superseded document. And citing
our own methods note as the evidence for our own method is circular: it tells a reader where we
wrote it down, not what it rests on.

WHAT REPLACES IT, in three kinds:

  inventory_source   the actual input documents, from data/registries/pakemis_source_register.csv
                     in the verified payload - the Pakistan Economic Survey chapter, the NEPRA
                     report, the PBS table. 196 of them, each with its archival state, its licence
                     status and how to obtain it. This is what "what data drive agriculture" cites.

  release_vocabulary the release's own MACHINE-READABLE declarations - the notation keys, the
                     evidence classes, the configurations, the contract's known limitations. These
                     are generated, hashed and in the payload, so a claim about what NE means or
                     what E1 means cites the table that defines it rather than a paragraph.

  general_science    unchanged: the primary science and methodology authorities (IPCC, EPA, NASA,
                     CCAC) for concepts that are not ours to define.

None of these are paginated the way a PDF is, so `pages` is invalid on the first two kinds and the
validator refuses it rather than ignoring it.

Writes knowledge/sources.json, merging the hand-authored science records in sources.science.json.
Re-run it when the pinned release changes; the content digest moves and owner review is required
again, which is the review gate working rather than an obstacle.
"""
import csv
import json
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPLORER = os.path.dirname(HERE)


def rows(path):
    with open(path, encoding="utf-8") as handle:
        return list(csv.DictReader(l for l in handle if not l.startswith("#")))


def slug(data_file):
    """A stable citation id from the input file's path: the tail, minus the extension."""
    stem = re.sub(r"\.(csv|json|geojson|txt)$", "", data_file)
    stem = re.sub(r"^(data|outputs)/", "", stem)
    return "src:" + re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


def sector_of(data_file):
    for s in ("agriculture", "power", "transport", "waste", "residential",
              "fugitives", "ippu", "industry", "railways", "aviation"):
        if "/%s/" % s in data_file or "_%s" % s in data_file:
            return s
    return "national"


# THE REGISTER'S `primary_source` IS NOT A TITLE. It is whatever identified the input to the
# person who registered it: a document name for most rows (126 of 196), but also a bare URL (12),
# a bare filename (11), a "derived:" note for a file this release computes rather than reads (8),
# and 39 rows written as a lowercase description rather than a name. Pasting it verbatim into a
# citation produced lines like "the hierarchical (province/division/district) transcription of
# Table 4/6; ..." - a note where the reader expects a document. The rule below turns each of the
# four shapes into something a reader can act on, and never invents a name for a row that has
# none: an unnamed row keeps its own words, sentence-cased.
GENERIC_SEGMENTS = {"view", "index", "default", "download", "en", "home", "detail", "details"}
URLISH = re.compile(r"^https?://", re.I)
FILEISH = re.compile(r"^[\w.,()\[\]+-]+\.(pdf|csv|xlsx?|docx?|zip|json|geojson)$", re.I)


def cite_title(primary):
    """A readable citation line, and the URL when the register gave one."""
    if URLISH.match(primary):
        # the register named a web address, so the citation can LINK. The visible name comes from
        # the address's own last segment plus its host - "ocac.org.pk - July 2021 Pak Provinces" -
        # because a bare URL as a title tells a reader nothing about what is at the end of it.
        host = re.sub(r"^www\.", "", primary.split("/")[2])
        tail = [p for p in primary.split("?")[0].split("/")[3:] if p]
        # a generic last segment names the page, not the document, so step back one
        while len(tail) > 1 and tail[-1].lower() in GENERIC_SEGMENTS:
            tail.pop()
        stem = re.sub(r"\.[a-z0-9]{2,5}$", "", tail[-1], flags=re.I) if tail else ""
        stem = re.sub(r"[-_+]+", " ", urllib.parse.unquote(stem)).strip()
        return ("%s - %s" % (host, stem) if stem else host), primary
    if primary.startswith("derived:"):
        # not an external source at all: a file this release computes from files it already holds
        return "Derived in this release - " + primary[len("derived:"):].strip(), None
    if FILEISH.match(primary):
        return primary, None               # a filename IS a checkable citation; leave it exact
    if primary[:1].islower() and " " in primary:
        return primary[0].upper() + primary[1:], None      # a description, not a name
    return primary, None


def inventory_sources(release_dir, release_id):
    """One record per input the release actually reads."""
    reg = os.path.join(release_dir, "data", "registries", "pakemis_source_register.csv")
    out = []
    for r in rows(reg):
        primary = (r.get("primary_source") or "").strip()
        if not primary:
            continue                      # no citable statement: better absent than invented
        title, url = cite_title(primary)
        out.append({
            "id": slug(r["data_file"]),
            "title": title[:180],
            "kind": "inventory_source",
            "sector": sector_of(r["data_file"]),
            "data_file": r["data_file"],
            "archival_state": r.get("archival_state", ""),
            "licence_status": r.get("licence_status") or r.get("inbound_use", ""),
            "how_to_obtain": (r.get("how_to_obtain") or "").strip()[:400],
            "file": None, "pages": None, "url": url,
            "release_id": release_id,
        })
    seen, unique = set(), []
    for rec in out:                        # a document can back several ingests; cite it once
        if rec["id"] in seen:
            continue
        seen.add(rec["id"])
        unique.append(rec)
    return unique


def release_vocabularies(release_dir, release_id):
    """The release's own declarations, as citable artefacts."""
    sem = os.path.join(release_dir, "outputs", "semantic")
    contract = json.load(open(os.path.join(sem, "semantic_release.json"), encoding="utf-8"))
    named = {
        "dim_notation_key": "what NE, IE, NO and NA mean in this release",
        "dim_evidence_class": "what E1-E4, T1-T4 and S1-S3 mean in this release",
        "dim_configuration": "the named configurations and which are queryable",
        "dim_gas": "the gases the facts carry, and which origins each has",
        "dim_gwp": "the global warming potentials this release applies, per basis and gas",
        "dim_pollutant": "the air pollutants, and which are contained in which - the rule that "
                         "forbids adding overlapping particulate fractions together",
        "dim_period": "the fiscal and calendar periods, and which are available",
        "fact_completeness": "the notation key per IPCC code, category and gas",
        "fact_uncertainty": "the per-category intervals and their aggregation rule",
    }
    out = []
    for table, what in named.items():
        path = os.path.join(sem, table + ".csv")
        if not os.path.exists(path):
            continue
        out.append({
            "id": "rel:" + table, "title": "%s - %s" % (table, what),
            "kind": "release_vocabulary", "table": table,
            "rows": len(rows(path)),
            "file": None, "pages": None, "url": None, "release_id": release_id,
        })
    reg = os.path.join(release_dir, "data", "method_registry.csv")
    if os.path.exists(reg):
        out.append({
            "id": "rel:method_registry",
            "title": "the method and uncertainty model behind every estimated atom - each row names "
                     "its IPCC 2006 volume, chapter and equation, its tier and its uncertainty model",
            "kind": "release_vocabulary", "table": "method_registry.csv", "rows": len(rows(reg)),
            "file": None, "pages": None, "url": None, "release_id": release_id,
        })
    out.append({
        "id": "rel:known_limitations",
        "title": "the release contract's declared limitations (%d)" % len(contract.get("known_limitations", [])),
        "kind": "release_vocabulary", "table": "semantic_release.json",
        "rows": len(contract.get("known_limitations", [])),
        "file": None, "pages": None, "url": None, "release_id": release_id,
    })
    return out


def main():
    release_id = open(os.path.join(EXPLORER, "RELEASES.md"), encoding="utf-8").read()
    release_id = re.search(r"^pinned:\s*(\S+)", release_id, re.M).group(1)
    release_dir = os.path.join(EXPLORER, "data", "releases", release_id)
    if not os.path.isdir(release_dir):
        raise SystemExit("no payload for %s; run `make fetch` first" % release_id)

    science = json.load(open(os.path.join(HERE, "knowledge", "sources.science.json"), encoding="utf-8"))
    records = science + inventory_sources(release_dir, release_id) + release_vocabularies(release_dir, release_id)

    ids = [r["id"] for r in records]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit("duplicate citation ids: %s" % sorted(dupes))

    out = os.path.join(HERE, "knowledge", "sources.json")
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(records, handle, indent=1, ensure_ascii=False)
        handle.write("\n")
    kinds = {}
    for r in records:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print("sources -> %s" % os.path.relpath(out, EXPLORER))
    for k, n in sorted(kinds.items()):
        print("  %-20s %4d" % (k, n))
    print("  %-20s %4d" % ("TOTAL", len(records)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
