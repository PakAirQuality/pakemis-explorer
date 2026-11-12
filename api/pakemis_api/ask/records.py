"""What the model is shown of an activity result (query_activity): the rows as a table, every
figure in it, and every definition ONCE.

WHY (November 2026). The model used to receive an activity result as the same per-cell JSON as an
emission estimate: each row carried its use note, source reference, source series, record id and two
pre-formatted displays, about 900 characters, and only the first 60 rows were shown. "How many
vehicles are in Punjab" returned 288 district rows; the model saw 60, was told to "use group_by"
(which query_activity does not have), and spent its turn on ten lookups and 480,000 tokens. The
release's own definitions are what make a row readable, but a definition that is the same for all
288 rows is one sentence, not 288.

THE SHAPE, for every activity table without a line written per table:
    shared   a column whose value is the same in every row: said once ("Measure": "Registered vehicles")
    columns  the columns that vary, in the table's order, led by `i`, the row's cell index
    rows     one list per row: [i, value of each varying column...]
    notes    the use notes, each once, under a short code (N1, N2) when they differ by row
    rules    the release's combinable rules (what may be added to what), each once, coded R1, R2
Dropped: the record id, the source reference and the source's deposit locator (the receipt and the
reader's "View details" keep them), the two pre-formatted displays, a column that is empty in every
row, and a column that repeats another (power_monthly's Location is its Power plant).

TOO BIG TO READ. A selection whose table would not fit `budget_chars` is not sent row by row: the
model gets the row count and each varying column's distinct values, and is told to add the rows up
on the server (add_up) or to narrow the request. The whole envelope stays on the server either way.
"""
import re

# (column shown to the model, envelope field). Class columns are inserted after Measure, in the
# table's own order (calculation.class_columns).
LEAD = (("Period", "period"), ("Location", "location"), ("Province", "province"), ("Locality", "locality"),
        ("Location level", "location_level"), ("Measure", "measure"))
TAIL = (("Value", "exact"), ("Unit", "unit"), ("Evidence", "evidence"), ("Source status", "source_status"),
        ("Source series", "source_series"), ("Reporting interval", "reporting_interval"),
        ("Period type", "period_type"), ("Note", "use_note"), ("Rule", "combinable"))
# coded columns: their text is long and repeats, so a row carries a code and the text goes once
CODED = {"Note": ("N", "notes"), "Rule": ("R", "rules")}
# shown to the model as a whole even when only some rows vary in them
NEVER_DEDUPE = {"Value"}
# the most distinct values of one column listed when the rows are not sent
SUMMARY_VALUES = 40


def is_derived(v):
    """The server's own `total` cell, appended after the rows."""
    return v.get("derived") == "sum"


def record_columns(env):
    """The column names of an activity envelope's rows, in order: LEAD, the class columns, TAIL."""
    classes = list((env.get("calculation") or {}).get("class_columns") or [])
    return [name for name, _ in LEAD] + classes + [name for name, _ in TAIL]


def record_rows(env):
    """[(cell index, {column: text})] for every row of an activity envelope that the source printed
    (the server's `total` cell is left out). Every value is the envelope's own string."""
    classes = list((env.get("calculation") or {}).get("class_columns") or [])
    out = []
    for i, v in enumerate(env.get("values") or []):
        if is_derived(v):
            continue
        row = {name: str(v.get(field) or "") for name, field in LEAD}
        row.update({c: str((v.get("classes") or {}).get(c) or "") for c in classes})
        row.update({name: str(v.get(field) or "") for name, field in TAIL})
        out.append((i, row))
    return out


_WHOLE = re.compile(r"^(-?\d+)\.0+$")


def _plain(value):
    """"2599.0" -> "2599": the same number, as the source's register counts it."""
    m = _WHOLE.match(value)
    return m.group(1) if m else value


def _code(texts, prefix):
    """{text: code} in first-seen order."""
    codes = {}
    for t in texts:
        if t and t not in codes:
            codes[t] = "%s%d" % (prefix, len(codes) + 1)
    return codes


def activity_view(env, budget_chars):
    """The model's view of a query_activity envelope (see the module docstring)."""
    calc = env.get("calculation") or {}
    rows = record_rows(env)
    columns = record_columns(env)
    view = {"table": calc.get("table") or "", "rows_held": len(rows)}
    if calc.get("truncated"):
        view["truncated"] = ("the selection is larger than the query's row cap; these are the first %d rows. "
                             "Narrow the request (a measure, a place, a category, a period)." % len(rows))
    shared, varying = {}, []
    for c in columns:
        seen = {r[c] for _, r in rows}
        if seen == {""}:
            continue                                       # empty in every row
        if len(seen) == 1 and c not in NEVER_DEDUPE:
            shared[c] = seen.pop()
        else:
            varying.append(c)
    # a column that repeats another column, row for row, is dropped (the later one)
    kept = []
    for c in varying:
        if c in NEVER_DEDUPE or not any(all(r[c] == r[k] for _, r in rows) for k in kept):
            kept.append(c)
    varying = kept
    for c, (prefix, key) in CODED.items():
        if c in shared:
            # said once, in full, under its own name
            view[key] = {"all rows": shared.pop(c)}
        elif c in varying:
            codes = _code([r[c] for _, r in rows], prefix)
            view[key] = {code: text for text, code in codes.items()}
            for _, r in rows:
                r[c] = codes.get(r[c], "")
    view["shared"] = shared
    body = [[i] + [_plain(r[c]) if c == "Value" else r[c] for c in varying] for i, r in rows]
    size = sum(len(str(x)) + 3 for row in body for x in row)
    if size <= budget_chars:
        view["columns"] = ["i"] + varying
        view["rows"] = body
    else:
        summary = {}
        for c in varying:
            if c == "Value":
                continue
            counts = {}
            for _, r in rows:
                counts[r[c]] = counts.get(r[c], 0) + 1
            listed = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:SUMMARY_VALUES]
            summary[c] = {"distinct": len(counts), "values": [v for v, _ in listed]}
        view["rows_not_sent"] = ("%d rows are too many to read here. They are held on the server: add them up "
                                 "with add_up (result=k, group_by and where on the columns below), or narrow the "
                                 "request." % len(rows))
        view["columns_held"] = summary
    total = next((v for v in env.get("values") or [] if is_derived(v)), None)
    if total is not None:
        view["server_total"] = {"i": (env.get("values") or []).index(total), "value": total.get("exact"),
                                "unit": total.get("unit"), "what": total.get("interpretation") or ""}
    older = calc.get("older_only") or []
    if older:
        view["older_only"] = {"note": "places in this selection whose own records stop earlier, so they are not in "
                                      "these rows (a renamed or split district, a closed airport): mention them "
                                      "only if they matter, and never add their older figures to these",
                              "places": ["%s (latest %s)" % (o.get("location"), o.get("latest_period")) for o in older]}
    return view
