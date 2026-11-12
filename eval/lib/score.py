"""Deterministic scoring of one agent transcript against one case.

SIX AXES, each decided by fixed checks over the event stream - never by a model's opinion of the
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
    format       the answer is shaped for its reader: the checked links a case names
                 (`must_links`), the Downloads entries it must list in that order
                 (`must_downloads`), a Markdown table where the answer is a breakdown
                 (`must_table`), a checked chart (`must_chart`) or either (`must_visual`)

WHY `forbid` IS CONDITIONAL. A good answer to "what is the survey total" may well mention the
reference total beside it, so a forbidden value counts against the answer only when the required
value is MISSING - that is, when the wrong boundary's figure was given instead of the right one,
not merely alongside it. A case with no required value (a refusal case) fails on the forbidden
value appearing at all.

Numbers are read out of the RENDERED answer, a chart's data included. Until November 2026 the
agent could not type a digit; it now writes its own figures (computed on the server), so a figure
is matched as the reader reads it ("401.09 million tonnes" is 401.09 Mt as well as 401,090,000).
"""
import html
import json
import re

NUMBER = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")
# years and fiscal years ("2022", "2023-24", "FY 2023-24"), set aside by forbid_any_number
DATES = re.compile(r"\b(?:FY\s?)?(?:19|20)\d{2}(?:\s?[-–/]\s?\d{2,4})?\b")
CITE = re.compile(r"<cite [^>]*>([^<]*)</cite>")
PHRASE_AXIS_ORDER = ("uncertainty", "boundary", "numeric", "refusal", "source", "format")

AXES = ("numeric", "boundary", "source", "uncertainty", "refusal", "format")

# THE FORMAT AXIS (2026-11-05): what the reader is handed, not only what it says. A checked link is
# the server's tag (api/pakemis_api/ask/render.py), never a URL, so `must_links` names the `to`
# values the answer must carry; `must_table` asks for a Markdown table (a header row and its
# separator) where the answer is a breakdown.
PLINK = re.compile(r'<plink to="([^"]*)">[^<]*</plink>')
# `must_downloads` (2026-11-09): the tables whose whole Downloads entry ({{download:<table>}}) the answer
# must list, in that order - the page's order, which list_activity_files hands the model.
PDOWNLOAD = re.compile(r'<pdownload to="file:([^"]*)">[^<]*</pdownload>')
# a checked chart as the server renders it (render.py chart_tag): `must_chart` asks for one, and
# `must_visual` for a table OR a chart, where either shape serves the reader
CHART = re.compile(r"<pchart>[^<]*</pchart>")
TABLE = re.compile(r"^\s*\|.*\|\s*\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$", re.M)


# A FIGURE AS THE READER SEES IT (2026-11-07). The server writes a large count rounded and scaled -
# Lahore's 1,561,386 cars as "1.56 million" - and the scorer read that as 1.56, along with digits
# from inside the tags (a receipt's hex, `k="1"`, `cell="0"`). Tags are dropped before reading, a
# scaled figure is read at its scale, and it matches anything that rounds to what was printed.
TAG = re.compile(r"<(?:cite|plink|pdownload)\b[^>]*>|</(?:cite|plink|pdownload)>")
SCALED = re.compile(r"(-?\d+(?:,\d{3})*(?:\.(\d+))?)\s*(thousand|million|billion)\b", re.IGNORECASE)
SCALE = {"thousand": 1e3, "million": 1e6, "billion": 1e9}


def figures_in(text):
    """(value, slack) for every number in the answer's words: a scaled figure carries half a step
    of its printed precision as slack ("1.56 million" -> 1,560,000 +/- 5,000), a plain one none."""
    out = []
    # A CHART'S FIGURES ARE THE READER'S TOO (they are on its axis and in its tooltips), read from its
    # data rather than its text: "[7745864,8484280]" is two values, not one with a thousands comma
    for block in CHART.findall(text or ""):
        try:
            spec = json.loads(html.unescape(block[len("<pchart>"):-len("</pchart>")]))
        except ValueError:
            continue
        for series in spec.get("series") or []:
            for v in series.get("values") or []:
                try:
                    out.append((float(str(v).replace(",", "")), 0.0))
                except ValueError:
                    pass
    words = TAG.sub("", CHART.sub(" ", text or ""))
    for m in SCALED.finditer(words):
        decimals = len(m.group(2) or "")
        scale = SCALE[m.group(3).lower()]
        out.append((float(m.group(1).replace(",", "")) * scale, 0.5 * 10 ** -decimals * scale))
        # ...and as printed, for a reference already held in that scale: since the agent writes its
        # own figures (Nov 2026) "401.09 million tonnes" is how it says 401.09 Mt, and "35,505.3
        # million cubic metres" a figure held in million cubic metres
        out.append((float(m.group(1).replace(",", "")), 0.5 * 10 ** -decimals))
    for raw in NUMBER.findall(SCALED.sub(" ", words)):
        try:
            out.append((float(raw.replace(",", "")), 0.0))
        except ValueError:
            pass
    return out


def numbers_in(text):
    return [value for value, _ in figures_in(text)]


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
    figures = figures_in(text)
    nums = [value for value, _ in figures]
    out = []

    def add(name, axis, ok, detail=""):
        out.append({"name": name, "axis": axis, "ok": bool(ok), "detail": detail})

    # A FIGURE HELD IN A SCALED UNIT. A record in "thousand passengers" holds 42,130, and the reader
    # is better served by "42.1 million passengers": `scales: {ref: [1000]}` lets the reference
    # match at those multiples too (each with its own tolerance), never instead of the unit check.
    scales = checks.get("scales") or {}

    def matches(ref_name):
        ref = _ref_value(resolved, ref_name)
        if ref is None:
            return None, None
        for k in [1] + list(scales.get(ref_name) or []):
            want = ref * float(k)
            band = tolerance(want, tol)
            hit = [n for n, slack in figures if abs(n - want) <= max(band, slack)]
            if hit:
                return ref, hit[0]
        return ref, None

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
        # A DATE IS NOT A FIGURE: "not estimated in 2023-24" names the year it is about
        figures = [n for n in numbers_in(DATES.sub(" ", text))]
        refusal_expected = bool(checks.get("expect_refusal"))
        ok = (not figures) or (refusal_expected and bool(refusals))
        add("forbid_any_number", "refusal" if "refusal" in axes else phrase_axis, ok,
            ("answer carried %s" % figures[:8]) + ("; refusal surfaced" if refusals else "; no refusal event"))

    # --- format ---------------------------------------------------------------------------
    links = PLINK.findall(text)
    for to in (checks.get("must_links") or []):
        add("link:%s" % to, "format", to in links, "links: %s" % links)
    if checks.get("must_downloads"):
        listed, wanted = PDOWNLOAD.findall(text), list(checks["must_downloads"])
        add("downloads", "format", listed == wanted,
            "listed %d of %d in order" % (len(listed), len(wanted)) if listed != wanted else "every entry, in order")
    if checks.get("must_table"):
        add("table", "format", bool(TABLE.search(text)), "a Markdown table" if TABLE.search(text) else "no table")
    if checks.get("must_chart"):
        add("chart", "format", bool(CHART.search(text)), "a chart" if CHART.search(text) else "no chart")
    if checks.get("must_visual"):
        shapes = [n for n, rx in (("table", TABLE), ("chart", CHART)) if rx.search(text)]
        add("visual", "format", bool(shapes), "has %s" % shapes if shapes else "neither a table nor a chart")

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
