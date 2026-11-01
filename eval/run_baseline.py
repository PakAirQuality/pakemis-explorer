#!/usr/bin/env python3
"""Run the CURRENT agent over a split and score it deterministically.

    python3 eval/run_baseline.py --split dev
    python3 eval/run_baseline.py --split holdout --allow-holdout      # a checkpoint, not iteration

The agent is driven in-process through the real app over POST /ask, with the real provider client
that `install_ask` builds from settings - the same path the deployed service takes. One fresh
conversation per case, so no case can see another's context. Every SSE event is kept, so a score
can be re-derived from the transcript without paying for the run again.

    --dry-run          score a previous run's transcripts without calling the model
    --only D01,D12     a subset
    --transcripts PATH read transcripts from here instead of calling the model

Nothing here writes to the emissions checkout, and no transcript is sent anywhere.
"""
import argparse
import datetime
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "api"))
sys.path.insert(0, HERE)
os.environ.setdefault("PAKEMIS_API_LAZY", "1")
os.environ.setdefault("PAKEMIS_QUERY_PATH", os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "pakistan-emissions-sectors", "src")))

import yaml  # noqa: E402

FILES = {"dev": (os.path.join(HERE, "cases", "dev.yaml"), os.path.join(HERE, "cases", "dev.resolved.json")),
         "holdout": (os.path.join(HERE, "holdout", "holdout.yaml"), os.path.join(HERE, "holdout", "holdout.resolved.json"))}
RESULTS = os.path.join(HERE, "results")


def sse(client, message, conversation_id):
    events = []
    body = {"message": message, "ui_state": {}, "conversation_id": conversation_id}
    with client.stream("POST", "/api/v1/emissions/ask", json=body) as r:
        if r.status_code != 200:
            return [("http_error", {"status": r.status_code, "body": r.read().decode("utf-8", "replace")[:800]})]
        name, data = None, []
        for line in r.iter_lines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].strip())
            elif line == "" and name:
                try:
                    events.append((name, json.loads("\n".join(data))))
                except json.JSONDecodeError:
                    events.append((name, {"_unparsed": "\n".join(data)[:400]}))
                name, data = None, []
    return events


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=("dev", "holdout"), default="dev")
    ap.add_argument("--allow-holdout", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--transcripts", default="")
    ap.add_argument("--label", default="baseline")
    args = ap.parse_args()
    if args.split == "holdout" and not args.allow_holdout:
        print("refusing to run the held-out split without --allow-holdout (see eval/holdout/HOLDOUT.md)")
        return 2

    case_file, resolved_file = FILES[args.split]
    cases = yaml.safe_load(open(case_file, encoding="utf-8"))["cases"]
    resolved = json.load(open(resolved_file, encoding="utf-8"))
    if args.only:
        want = {c.strip() for c in args.only.split(",")}
        cases = [c for c in cases if c["id"] in want]

    from lib.score import score_case
    transcripts, meta = {}, {}
    if args.transcripts:
        blob = json.load(open(args.transcripts, encoding="utf-8"))
        transcripts = {k: [(n, d) for n, d in v] for k, v in blob["transcripts"].items()}
        meta = blob.get("meta", {})
        print("scoring %d stored transcripts from %s" % (len(transcripts), args.transcripts))
    else:
        from fastapi.testclient import TestClient
        from pakemis_api.settings import Settings
        settings = Settings.from_env()
        sys.path.insert(0, settings.query_path)
        from pakemis_api.app import create_app
        app = create_app(settings)
        with TestClient(app) as client:
            status = client.get("/api/v1/emissions/release").json().get("agent") or {}
            meta = {"release_version": settings.version, "agent": status,
                    "run_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                    "split": args.split, "label": args.label, "allow_holdout": args.allow_holdout}
            print("agent: %s" % json.dumps(status))
            if not status.get("enabled"):
                print("[BLOCKED] no model client: %s" % status.get("reason"))
                meta["blocked"] = status.get("reason")
            for i, case in enumerate(cases, 1):
                t0 = time.time()
                events = sse(client, case["question"], "eval-%s-%s" % (args.split, case["id"]))
                transcripts[case["id"]] = events
                done = [d for n, d in events if n == "done"]
                ans = [d for n, d in events if n == "answer"]
                print("  %2d/%d %s  %5.1fs  tools=%d  answer=%s  usage=%s"
                      % (i, len(cases), case["id"], time.time() - t0,
                         len([1 for n, _ in events if n == "tool_call"]),
                         "yes" if ans else "NO",
                         (done[0].get("usage") if done else {})))

    scored = []
    for case in cases:
        tr = transcripts.get(case["id"], [])
        scored.append(score_case(case, (resolved["cases"] or {}).get(case["id"], {}), tr))

    os.makedirs(RESULTS, exist_ok=True)
    stamp = "%s_%s" % (args.label, args.split)
    tpath = os.path.join(RESULTS, "transcripts_%s.json" % stamp)
    if not args.transcripts:
        with open(tpath, "w", encoding="utf-8") as handle:
            json.dump({"meta": meta, "transcripts": transcripts}, handle, indent=1)
    spath = os.path.join(RESULTS, "scorecard_%s.json" % stamp)
    summary = summarise(scored, resolved, meta)
    with open(spath, "w", encoding="utf-8") as handle:
        json.dump({"meta": meta, "reference_release": resolved.get("release_version"),
                   "reference_manifest": resolved.get("manifest_sha256_16"),
                   "summary": summary, "cases": scored}, handle, indent=1)
    print_summary(summary, scored)
    print("\ntranscripts: %s\nscorecard:   %s" % (tpath, spath))
    return 0


def summarise(scored, resolved, meta):
    from lib.score import AXES
    rates = {}
    for axis in AXES:
        applicable = [s for s in scored if s["axes"][axis] != "n/a"]
        passed = [s for s in applicable if s["axes"][axis] == "pass"]
        rates[axis] = {"n": len(applicable), "pass": len(passed),
                       "rate": round(len(passed) / len(applicable), 3) if applicable else None}
    clean = [s for s in scored if all(v != "fail" for v in s["axes"].values())]
    return {"n_cases": len(scored), "all_axes_pass": len(clean),
            "all_axes_pass_rate": round(len(clean) / len(scored), 3) if scored else None,
            "axes": rates,
            "by_path": {p: len([s for s in scored if s["path"] == p])
                        for p in sorted({s["path"] for s in scored})},
            "no_answer": [s["id"] for s in scored if not (s["answer_text"] or "").strip()],
            "turn_limit": [s["id"] for s in scored if "turn_limit" in (s["errors"] or [])]}


def print_summary(summary, scored):
    print("\n%-14s %5s %5s %6s" % ("axis", "n", "pass", "rate"))
    for axis, r in summary["axes"].items():
        print("%-14s %5d %5d %6s" % (axis, r["n"], r["pass"], r["rate"]))
    print("\nall five axes clean: %d/%d (%s)" % (summary["all_axes_pass"], summary["n_cases"],
                                                 summary["all_axes_pass_rate"]))
    print("answered by: %s" % summary["by_path"])
    bad = [s for s in scored if any(v == "fail" for v in s["axes"].values())]
    if bad:
        print("\nfailures:")
        for s in bad:
            failed = [c for c in s["checks"] if not c["ok"]]
            print("  %s [%s] %s" % (s["id"], s["topic"],
                                    "; ".join("%s(%s)" % (c["name"], c["axis"]) for c in failed)))


if __name__ == "__main__":
    sys.exit(main())
