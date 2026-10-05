"""Deterministic scoring of one agent transcript against one case.

FIVE AXES, each decided by fixed checks over the event stream - never by a model's opinion of the
prose. An axis with no applicable check scores n/a and is excluded from its rate.

    numeric      the reference figure (within tolerance) appears in the rendered answer
    boundary     the scope the release computed on matches what the question assumed, the unit is
                 the right one, and the wrong boundary's figure was not given INSTEAD of the right
                 one
    source       the answer carries at least one receipt from a tool call of this turn, or - for a
                 case the release refuses - the refusal reached the reader
    uncertainty  an interval, or a stated absence, is reported as such: the case's wording checks
    refusal      the typed refusal was surfaced with its own error class and nothing was inferred
                 around it

WHY `forbid` IS CONDITIONAL. A good answer to "what is the survey total" may well mention the
reference total beside it, so a forbidden value counts against the answer only when the required
value is MISSING - that is, when the wrong boundary's figure was given instead of the right one,
not merely alongside it. A case with no required value (a refusal case) fails on the forbidden
value appearing at all.

Numbers are read out of the RENDERED answer: the agent is forbidden from typing a digit, and the
server fills every figure from a tool result, so a number in the answer text is a number the
release produced for this turn.
"""
import re

NUMBER = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")
CITE = re.compile(r"<cite [^>]*>([^<]*)</cite>")
PHRASE_AXIS_ORDER = ("uncertainty", "boundary", "numeric", "refusal", "source")

AXES = ("numeric", "boundary", "source", "uncertainty", "refusal")


def numbers_in(text):
    out = []
    for raw in NUMBER.findall(text or ""):
        try:
            out.append(float(raw.replace(",", "")))
        except ValueError:
            pass
    return out


def tolerance(ref_value, tol):
    tol = tol or {}
    if "abs" in tol:
        return float(tol["abs"])
    rel = float(tol.get("rel", 0.0005))
    return max(0.011, abs(ref_value) * rel)


def _ref_value(resolved, name):
    cell = (resolved or {}).get(name) or {}
    for key in ("exact", "display", "value"):
        raw = cell.get(key)
        if raw in (None, ""):
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    return None


def _phrase_axis(axes):
    for axis in PHRASE_AXIS_ORDER:
        if axis in axes:
            return axis
    return "boundary"


def score_case(case, resolved, transcript):
    """-> {"checks": [{name, axis, ok, detail}], "axes": {axis: pass|fail|n/a}, "path": ...}"""
    checks = case.get("checks") or {}
    axes = tuple(checks.get("axes") or ())
    tol = checks.get("tol")
    phrase_axis = _phrase_axis(axes)

    answers = [d for n, d in transcript if n == "answer"]
    refusals = [d for n, d in transcript if n == "refusal"]
    tool_results = [d for n, d in transcript if n == "tool_result"]
    tool_calls = [d for n, d in transcript if n == "tool_call"]
    errors = [d for n, d in transcript if n == "error"]
    answer = answers[-1] if answers else {}
    text = answer.get("text") or ""
    low = text.lower()
    nums = numbers_in(text)
    out = []

    def add(name, axis, ok, detail=""):
        out.append({"name": name, "axis": axis, "ok": bool(ok), "detail": detail})

    def matches(ref_name):
        ref = _ref_value(resolved, ref_name)
        if ref is None:
            return None, None
        band = tolerance(ref, tol)
        hit = [n for n in nums if abs(n - ref) <= band]
        return ref, (hit[0] if hit else None)

    # --- numeric ---------------------------------------------------------------------------
    musts = checks.get("must") or []
    for name in musts:
        ref, hit = matches(name)
        if ref is None:
            add("must:%s" % name, "numeric", False, "the case's reference value did not resolve")
        else:
            add("must:%s" % name, "numeric", hit is not None,
                "want %s +/- %.4g, answer had %s" % (ref, tolerance(ref, tol), nums[:8]))
    any_of = checks.get("must_any_of") or []
    if any_of:
        hits = [n for n in any_of if matches(n)[1] is not None]
        add("must_any_of:%s" % ",".join(any_of), "numeric", bool(hits),
            "matched %s; answer had %s" % (hits, nums[:8]))
    if checks.get("require_two_numbers"):
        add("require_two_numbers", "numeric", len({round(n, 6) for n in nums}) >= 2,
            "distinct numbers: %s" % sorted({round(n, 6) for n in nums})[:8])

    # --- boundary --------------------------------------------------------------------------
    want_scope = checks.get("scope") or {}
    if want_scope:
        got = answer.get("scope") or {}
        bad = []
        for key, want in want_scope.items():
            have = got.get(key)
            if isinstance(want, list):
                if sorted(want) != sorted(have or []):
                    bad.append("%s: want %s, got %s" % (key, want, have))
            elif have != want:
                bad.append("%s: want %r, got %r" % (key, want, have))
        add("scope", "boundary", not bad, "; ".join(bad) or "matches %s" % want_scope)
    unit = checks.get("unit_expect")
    if unit:
        units = {c.get("unit") for d in tool_results for c in (d.get("cells") or [])}
        add("unit_expect", "boundary", unit in units or unit.lower() in low,
            "want %r, tool cells carried %s" % (unit, sorted(u for u in units if u)))
    satisfied_must = (not musts or all(matches(n)[1] is not None for n in musts)) and \
                     (not any_of or any(matches(n)[1] is not None for n in any_of))
    for entry in (checks.get("forbid") or []):
        if "literal" in entry:
            ref, band = float(entry["literal"]), tolerance(float(entry["literal"]), tol)
        else:
            ref = _ref_value(resolved, entry["ref"])
            band = tolerance(ref, tol) if ref is not None else None
        if ref is None:
            continue
        present = any(abs(n - ref) <= band for n in nums)
        ok = (not present) or (satisfied_must and (musts or any_of))
        add("forbid:%s" % (entry.get("ref") or entry.get("literal")), "boundary", ok,
            ("%s present" % ref if present else "%s absent" % ref) + " - " + entry.get("why", ""))

    # --- source ----------------------------------------------------------------------------
    if "source" in axes:
        receipts = answer.get("receipts") or []
        citations = answer.get("citations") or []
        supported = bool(receipts or citations or refusals or tool_results)
        add("supported", "source", supported,
            "receipts=%d citations=%d tool_results=%d refusals=%d"
            % (len(receipts), len(citations), len(tool_results), len(refusals)))
        add("no_bare_numbers", "source", not [e for e in errors if e.get("code") == "bare_numbers"],
            "errors: %s" % [e.get("code") for e in errors])

    # --- wording (attributed to the case's own axis) ----------------------------------------
    for phrase in (checks.get("must_phrases_all") or []):
        add("phrase_all:%s" % phrase, phrase_axis, phrase.lower() in low, "")
    any_phrases = checks.get("must_phrases_any") or []
    if any_phrases:
        hits = [p for p in any_phrases if p.lower() in low]
        add("phrase_any", phrase_axis, bool(hits), "matched %s of %s" % (hits, any_phrases))
    for phrase in (checks.get("forbid_phrases") or []):
        add("phrase_forbid:%s" % phrase, phrase_axis, phrase.lower() not in low, "")

    # --- refusal ---------------------------------------------------------------------------
    if checks.get("expect_refusal"):
        want = checks.get("expect_error_class")
        got = [r.get("error_class") or r.get("error") for r in refusals]
        add("refusal_surfaced", "refusal", bool(refusals), "refusal events: %s" % got)
        if want:
            add("refusal_class", "refusal", any(want in (g or "") for g in got),
                "want %s, got %s" % (want, got))
    if checks.get("forbid_any_number"):
        # THE SANCTIONED NEARBY ANSWER IS NOT A VIOLATION. The contract tells the agent that a
        # refusal is an answer and that it should name the question the release CAN answer, so an
        # answer that surfaces the typed refusal and then offers the figure for a neighbouring
        # scope is correct behaviour, not a fabricated number. The check therefore bites in two
        # places only: a figure given while the refusal never reached the reader, and a figure
        # given for a question NO tool refuses - where the right answer is a notation key, an
        # absent cell or "the release cannot compare itself to another inventory", and any digit
        # at all is inferred.
        refusal_expected = bool(checks.get("expect_refusal"))
        ok = (not nums) or (refusal_expected and bool(refusals))
        add("forbid_any_number", "refusal" if "refusal" in axes else phrase_axis, ok,
            ("answer carried %s" % nums[:8]) + ("; refusal surfaced" if refusals else "; no refusal event"))

    verdicts = {}
    for axis in AXES:
        mine = [c for c in out if c["axis"] == axis]
        if axis not in axes and not mine:
            verdicts[axis] = "n/a"
        elif not mine:
            verdicts[axis] = "n/a"
        else:
            verdicts[axis] = "pass" if all(c["ok"] for c in mine) else "fail"

    # HOW THE ANSWER WAS PRODUCED, read off the token usage rather than guessed from the absence
    # of tool calls. The prepared-explanation path spends nothing, so a `done` event with no
    # tokens is the library; a turn that spent tokens and called no tool is the model answering
    # out of the system prompt alone, with no tool result and therefore no receipt behind it -
    # a different thing entirely, and the one worth counting.
    done = [d for n, d in transcript if n == "done"]
    spent = sum((done[-1].get("usage") or {}).get(k, 0) or 0 for k in
                ("input_tokens", "output_tokens", "cache_read_input_tokens",
                 "cache_creation_input_tokens")) if done else 0
    if not answers and not refusals:
        path = "none"
    elif tool_calls or refusals:
        path = "loop"
    elif spent == 0:
        path = "library"
    else:
        path = "prompt_only"
    return {"id": case["id"], "topic": case.get("topic"), "checks": out, "axes": verdicts,
            "path": path, "n_tool_calls": len(tool_calls), "n_refusals": len(refusals),
            "errors": [e.get("code") for e in errors], "answer_text": text}
