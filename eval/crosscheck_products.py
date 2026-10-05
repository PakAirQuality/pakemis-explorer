#!/usr/bin/env python3
"""Cross-check the resolved reference answers against the EMISSIONS REPOSITORY'S OWN PRODUCTS.

The references in `*.resolved.json` come from the release's query engine. That is the right place
for them - it is the surface the agent queries - but it makes them engine-circular: if the engine
read a table wrongly, the case and the agent would agree on the same wrong number and the set
would never notice. This script re-derives a sample of them straight out of the published CSV
products in the emissions checkout, which were written by a different code path (the sector
builders and the paper's claim getters), and reports any disagreement.

    python3 eval/crosscheck_products.py [--emissions /path/to/emissions]

It reads only; it writes a small report to eval/results/crosscheck_products.json.
"""
import argparse
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_EMISSIONS = "/Users/rehanahmad/Desktop/emissions"

# case id -> value name -> (product file, row predicate, column)
CHECKS = {
    "D01": {"total": ("national_all_sectors.csv", {"row_kind": "national_total"}, "co2e_Mt_AR5")},
    "D02": {"agriculture": ("national_all_sectors.csv", {"row_kind": "sector", "sector": "agriculture"}, "co2e_Mt_AR5"),
            "power": ("national_all_sectors.csv", {"row_kind": "sector", "sector": "power"}, "co2e_Mt_AR5")},
    "D12": {"ar6": ("national_all_sectors.csv", {"row_kind": "national_total"}, "co2e_Mt_AR6"),
            "ar5": ("national_all_sectors.csv", {"row_kind": "national_total"}, "co2e_Mt_AR5")},
    "D16": {"module": ("national_all_sectors.csv", {"row_kind": "sector", "sector": "power"}, "co2e_Mt_AR5")},
    "D18": {"total": ("national_all_sectors.csv", {"row_kind": "national_total"}, "co2e_Mt_AR5")},
    "D19": {"module": ("national_all_sectors.csv", {"row_kind": "sector", "sector": "industry"}, "co2e_Mt_AR5")},
    "D23": {"s_total": ("national_all_sectors_survey.csv", {"row_kind": "national_total"}, "co2e_Mt_AR5")},
}


def product_value(root, name, where, column):
    path = os.path.join(root, "outputs", name)
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if all(row.get(k) == v for k, v in where.items()):
                return float(row[column]), "outputs/%s#%s#%s" % (name, ";".join("%s=%s" % kv for kv in where.items()), column)
    raise LookupError("%s: no row matching %s" % (name, where))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emissions", default=DEFAULT_EMISSIONS)
    args = ap.parse_args()
    resolved = json.load(open(os.path.join(HERE, "cases", "dev.resolved.json"), encoding="utf-8"))

    report, bad = [], []
    for cid, values in CHECKS.items():
        for name, (file_name, where, column) in values.items():
            engine = resolved["cases"].get(cid, {}).get(name, {})
            got = engine.get("exact") or engine.get("display")
            if got is None:
                bad.append("%s/%s: no resolved reference to check" % (cid, name))
                continue
            want, pointer = product_value(args.emissions, file_name, where, column)
            # the products ship rounded to five decimals; agree to that
            agrees = abs(float(got) - want) <= 0.00001 + abs(want) * 1e-9
            report.append({"case": cid, "value": name, "engine": float(got), "product": want,
                           "pointer": pointer, "agrees": agrees})
            if not agrees:
                bad.append("%s/%s: engine %s vs product %s (%s)" % (cid, name, got, want, pointer))

    out = {"emissions_checkout": args.emissions, "reference_release": resolved.get("release_version"),
           "n_checked": len(report), "n_disagree": len(bad), "rows": report, "problems": bad}
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(os.path.join(HERE, "results", "crosscheck_products.json"), "w", encoding="utf-8") as handle:
        json.dump(out, handle, indent=1)
    for b in bad:
        print("[FAIL] " + b)
    print("%d reference values re-derived from the published products; %d disagree."
          % (len(report), len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
