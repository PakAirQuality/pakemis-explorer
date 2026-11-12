"""Multi-result placeholders over the query core's single-result guardrail.

The agent writes `{{result_k_cell_n}}` (k = the 1-based tool call of this turn, n = the 0-based
cell of that result), or `.exact` / `.unit` / `.value` / `.short` variants; the legacy
`{{result_cell_n}}` names the last result. Each placeholder is delegated to
`pakemis_query.placeholders.render` on the one envelope it names, so the core's index and
attribute rules hold (`.short` is the service's own attribute, `display_short` minted by
presentation.py, and is resolved here under the same index rule); then the core's
`reject_bare_numbers` runs over the text with every placeholder and every allowlisted string
removed, so an invented decimal never reaches a reader.

Citation encoding (the one the web dock parses): every rendered number is wrapped inline as
    <cite k="1" cell="0" receipt="5eb40940d01be992a296f658fb91ab9e">452.34662</cite>
`k` links the number to its tool card, `cell` to the row, `receipt` to the envelope. The rest
of the answer is plain text (Markdown allowed). `render_multi` also returns the citations as a
list so a consumer that strips tags still knows what was cited.
"""
import html
import json
import re

from pakemis_query import placeholders as P

MULTI = re.compile(r"\{\{result_(?:(\d+)_)?cell_(\d+)(?:\.(exact|unit|value|short|share|pct))?\}\}")
# (service field, the fallback when it is absent); the rest are the core's. A fallback of None means
# there IS no sensible substitute, so an absent field raises rather than silently printing something
# else - `.share` quietly falling back to `display` would print a tonnage where a share was asked for.
#
# `.share` AND `.pct` EXIST BECAUSE THE MODEL ASKED FOR THEM. It wrote
# "{{result_2_cell_0.attrs.share_phrase}}", which looks like an invention and was not: presentation.py
# computes `share_phrase` ("nearly half", "over half") and `share_pct_short` on every cell that
# partitions a total, and loop.py hands `share_phrase` to the model inside `attrs` - its twin
# `share_pct_short` is in _CELL_SKIP and it is not. So the model could SEE a share it was forbidden to
# retype, and the only sanctioned way to print server-computed text is a placeholder. It composed the
# path from the JSON it was shown. Banning the guess would have left the good sentence unwritable.
SERVICE_ATTRS = {"short": ("display_short", "display"), "unit": ("unit_short", "unit"),
                 "share": ("share_phrase", None), "pct": ("share_pct_short", None)}

# ANYTHING STILL BRACE-WRAPPED AFTER SUBSTITUTION. This is the hole that let
# "{{result_2_cell_0.attrs.share_phrase}}" print verbatim to a reader: `.attrs.share_phrase` is not
# in MULTI's alternation, so the string matched NOTHING - MULTI.sub left it alone, and
# check_bare_numbers strips the placeholders it recognises and then looks for a decimal, which the
# leftover does not contain. Every guard here was about placeholders the renderer RECOGNISED but
# could not resolve; a form it did not recognise was invisible to all of them.
UNKNOWN = re.compile(r"\{\{.*?\}\}", re.S)

# LINKS TO THIS SITE'S OWN PAGES, NEVER A URL THE MODEL WROTE. The model writes a link the way it
# writes a number - as a placeholder - and the server checks it against what the release actually
# serves before it becomes a tag the web app can draw:
#     {{link:downloads}}                    the Downloads page
#     {{link:downloads:<section>}}          one of its sections (DOWNLOAD_SECTIONS)
#     {{link:file:<table>}}                 the Downloads entry of one served table, e.g. fact_activity_vehicles
# rendered as <plink to="downloads:activity">Downloads</plink>. The web app turns `to` into the
# route and, for a file, the entry's title; nothing here is ever an href. A link to a section or a
# table that does not exist is not recognised, so it is an unknown placeholder: one redraft, then
# struck - the same path as an invented field.
LINK = re.compile(r"\{\{link:(?:downloads(?::(?P<section>[a-z]+))?|file:(?P<table>[a-z0-9_]+))\}\}")
LINK_LABEL = "Downloads"
# The Downloads page's sections (web/src/components/downloads/catalogue.ts, COLLECTION_IDS);
# tests/test_ask_links.py holds the two lists together.
DOWNLOAD_SECTIONS = ("emissions", "activity", "air", "methods", "maps")
# ONE DOWNLOADS ENTRY, WHOLE (2026-11-09): {{download:<table>}} is drawn by the web app as the entry's
# title (a link to it, as {{link:file:<table>}} is), its description and its coverage, all three from
# the Downloads page's own catalogue - so a listed file reads exactly as the page reads, and the model
# never retypes a description (or the "101,808 records" in a coverage line, which the bare-number
# gate would rightly reject). Rendered as <pdownload to="file:<table>"><table></pdownload>; the same
# check as a file link: only a table the release serves.
DOWNLOAD_ENTRY = re.compile(r"\{\{download:(?P<table>[a-z0-9_]+)\}\}")
# A link tag in the model's own text would be drawn as a link without having been checked: strip it.
FORGED_LINK = re.compile(r"</?(?:plink|pdownload|pchart)\b[^>]*>", re.I)

# CHARTS (2026-11). The model draws a chart by writing its data, never markup:
#     ```chart
#     {"type": "bar", "title": "...", "unit": "vehicles", "labels": ["Lahore", "Multan"],
#      "series": [{"name": "Registered vehicles", "values": [6100000, 1200000]}]}
#     ```
# checked here (chart_spec) and rendered as <pchart>{escaped JSON}</pchart>, a paragraph of its own,
# which the web app draws with ECharts. Types: bar (options horizontal, stacked), line, area
# (option stacked) and pie (option donut, one series). A block that does not check is the
# unknown-placeholder path: one redraft, then struck.
CHART_BLOCK = re.compile(r"```chart[ \t]*\n(.*?)\n[ \t]*```", re.S)
CHART_OPEN = re.compile(r"```chart\b")
CHART_TYPES = ("bar", "line", "area", "pie")
CHART_MAX_LABELS = 60
CHART_MAX_SERIES = 8
CHART_TAG = re.compile(r"<pchart>[^<]*</pchart>")


def link_tag(to, label):
    return '<plink to="%s">%s</plink>' % (html.escape(to, quote=True), html.escape(label, quote=False))


def download_tag(table):
    return '<pdownload to="file:%s">%s</pdownload>' % (html.escape(table, quote=True), html.escape(table, quote=False))


def render_links(text, tables=frozenset()):
    """Replace every recognised link and download placeholder with its tag. `tables` is the set of
    table names the release serves as files; a file link or entry for anything else, or a section the
    page does not have, is left in place for the unknown-placeholder check to catch."""
    def sub(match):
        section, table = match.group("section"), match.group("table")
        if table is not None:
            return link_tag("file:" + table, table) if table in tables else match.group(0)
        if section is None:
            return link_tag("downloads", LINK_LABEL)
        return link_tag("downloads:" + section, LINK_LABEL) if section in DOWNLOAD_SECTIONS else match.group(0)

    def entry(match):
        table = match.group("table")
        return download_tag(table) if table in tables else match.group(0)
    return DOWNLOAD_ENTRY.sub(entry, LINK.sub(sub, text))


class BareNumberError(P.PlaceholderError):
    """A decimal that is not a placeholder."""


class UnknownPlaceholderError(P.PlaceholderError):
    """Brace syntax the renderer does not recognise - an invented field, not a real one.

    A DISTINCT CLASS BECAUSE IT IS TREATED DIFFERENTLY. A bare decimal is a correctness failure and
    the answer is withheld; an invented field name is a cosmetic one, and withholding a whole
    correct answer over a missing share phrase serves nobody. The loop asks for one redraft and then
    ships without the phrase. What must never happen either way is template syntax on screen.
    """


class ChartError(UnknownPlaceholderError):
    """A chart block whose data does not check: redrafted once, then struck, like an invented field."""


def _chart_number(x, where):
    if x is None:
        return None
    if isinstance(x, bool):
        raise ChartError("%s: %r is not a number" % (where, x))
    if isinstance(x, (int, float)):
        if x != x or x in (float("inf"), float("-inf")):
            raise ChartError("%s: %r is not a finite number" % (where, x))
        return x
    if isinstance(x, str):
        try:
            v = float(x.replace(",", "").strip())
        except ValueError:
            raise ChartError("%s: %r is not a number (write the figure alone, no unit)" % (where, x)) from None
        return int(v) if v == int(v) and "." not in x else v
    raise ChartError("%s: %r is not a number" % (where, x))


def chart_spec(text):
    """The JSON of one chart block, checked -> the spec the web app draws. Raises ChartError."""
    try:
        raw = json.loads(text)
    except ValueError as exc:
        raise ChartError("the chart block is not valid JSON (%s)" % exc) from None
    if not isinstance(raw, dict):
        raise ChartError("the chart block is a JSON object")
    kind = str(raw.get("type") or "").strip().lower()
    if kind not in CHART_TYPES:
        raise ChartError("chart type %r is not one of %s" % (raw.get("type"), ", ".join(CHART_TYPES)))
    labels = raw.get("labels")
    if not isinstance(labels, list) or not labels or len(labels) > CHART_MAX_LABELS:
        raise ChartError("a chart has 1 to %d labels (the categories or periods along its axis)" % CHART_MAX_LABELS)
    labels = [str(label)[:80] for label in labels]
    series = raw.get("series")
    if not isinstance(series, list) or not series or len(series) > CHART_MAX_SERIES:
        raise ChartError("a chart has 1 to %d series, each {name, values}" % CHART_MAX_SERIES)
    if kind == "pie" and len(series) != 1:
        raise ChartError("a pie chart has exactly one series")
    out_series = []
    for si, s in enumerate(series):
        if not isinstance(s, dict) or not isinstance(s.get("values"), list):
            raise ChartError("series %d is {name, values}" % (si + 1))
        values = [_chart_number(v, "series %d value %d" % (si + 1, vi + 1)) for vi, v in enumerate(s["values"])]
        if len(values) != len(labels):
            raise ChartError("series %d has %d values for %d labels" % (si + 1, len(values), len(labels)))
        if kind == "pie" and any(v is not None and v < 0 for v in values):
            raise ChartError("a pie chart's values are not negative")
        out_series.append({"name": str(s.get("name") or "")[:80], "values": values})
    spec = {"type": kind, "title": str(raw.get("title") or "")[:140], "unit": str(raw.get("unit") or "")[:40],
            "labels": labels, "series": out_series}
    words = [spec["title"], spec["unit"]] + labels + [s["name"] for s in out_series]
    if any("{{" in w or "}}" in w or "<" in w for w in words):
        raise ChartError("a chart's title, unit, labels and series names are plain words: no placeholder, no markup")
    for flag, kinds in (("stacked", ("bar", "area")), ("horizontal", ("bar",)), ("donut", ("pie",))):
        if raw.get(flag) is True and kind in kinds:
            spec[flag] = True
    return spec


def chart_tag(spec):
    return "<pchart>%s</pchart>" % html.escape(json.dumps(spec, ensure_ascii=False, separators=(",", ":")), quote=True)


def render_charts(text, drop_invalid=False):
    """Every ```chart block -> its tag, as a paragraph of its own. An invalid block raises ChartError,
    or is removed when `drop_invalid` (the loop's second pass); an unclosed one likewise."""
    def sub(match):
        try:
            return "\n\n" + chart_tag(chart_spec(match.group(1))) + "\n\n"
        except ChartError:
            if drop_invalid:
                return "\n\n"
            raise
    out = CHART_BLOCK.sub(sub, text)
    if CHART_OPEN.search(out):
        if not drop_invalid:
            raise ChartError("a ```chart block is not closed with ``` on a line of its own")
        out = re.sub(r"```chart\b.*", "", out, flags=re.S)
    return re.sub(r"\n{3,}", "\n\n", out)


def strip_unknown(text):
    """Remove unrecognised placeholders AND tidy up after them.

    Dropping the placeholder alone would leave "...at 151.66 Mt CO2e ." - a gap and a stranded stop.
    """
    out = UNKNOWN.sub("", text)
    out = re.sub(r"\(\s*\)|\[\s*\]", "", out)        # parentheses the phrase was alone inside
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\s+([.,;:!?])", r"\1", out)          # " ." -> "."
    out = re.sub(r"[ \t]+\n", "\n", out)
    return out.strip()


def check_bare_numbers(template, allowlist=()):
    """Raise BareNumberError if the template carries a decimal outside a placeholder."""
    stripped = CHART_TAG.sub("", DOWNLOAD_ENTRY.sub("", LINK.sub("", MULTI.sub("", template))))
    for word in allowlist:
        if word:
            stripped = stripped.replace(word, "")
    try:
        P.reject_bare_numbers(stripped)
    except P.PlaceholderError as exc:
        raise BareNumberError(str(exc)) from exc


# AN INSTRUCTION ECHOED AS THE ANSWER'S FIRST WORDS (12 November 2026, eval D20). Told to answer
# before the deadline, the model opened its answer with its own paraphrase of prompt rule 10 -
# " Write your answer in full, as its own message.In 2023-24, ..." - and the reader saw it. Only a
# sentence at the very start that tells someone to write an answer as a message is removed.
INSTRUCTION_ECHO = re.compile(
    r"\A\s*(?:now\s+)?(?:write|give|answer|restate)\b[^.\n]{0,80}?\b(?:answer|message)\b[^.\n]{0,80}?"
    r"\b(?:own message|in full)\b[^.\n]*\.\s*", re.IGNORECASE)


def render_multi(template, results, allowlist=(), drop_unknown=False, tables=frozenset(), check_numbers=True):
    """-> (text, citations). results[k-1] is the envelope of tool call k (None for a call that
    returned no envelope). Raises PlaceholderError (BareNumberError for a bare decimal,
    UnknownPlaceholderError for brace syntax this renderer does not know, ChartError for a chart
    block that does not check).

    `drop_unknown` is the loop's second pass: the model has already been asked to redraft once, so
    the unknown phrase (or the chart) is removed rather than the answer withheld. `tables` is the set
    of table names a `{{link:file:<table>}}` may name (the release's served files); empty, no file
    link is recognised. `check_numbers` False lets the model's own figures stand (Limits.typed_numbers).
    """
    template = render_charts(FORGED_LINK.sub("", INSTRUCTION_ECHO.sub("", template, count=1)), drop_invalid=drop_unknown)
    if check_numbers:
        check_bare_numbers(template, allowlist)
    citations = []

    def sub(match):
        k_text, n_text, attr = match.group(1), match.group(2), match.group(3)
        if k_text is None:
            k = len(results)
            if k == 0:
                raise P.PlaceholderError("template names result_cell_%s but no tool returned a result this turn" % n_text)
        else:
            k = int(k_text)
        if k < 1 or k > len(results):
            raise P.PlaceholderError("template names result_%d but this turn made %d tool call(s)" % (k, len(results)))
        env = results[k - 1]
        if env is None:
            raise P.PlaceholderError("template names result_%d but tool call %d returned no cells" % (k, k))
        if attr in SERVICE_ATTRS:
            index, values = int(n_text), env["values"]
            if index >= len(values):
                raise P.PlaceholderError("template names result_cell_%d; the result has %d cells" % (index, len(values)))
            cell = values[index]
            field, fallback = SERVICE_ATTRS[attr]
            found = cell.get(field) or (cell.get(fallback) if fallback else None) or (cell.get("display") if fallback else None)
            if not found:
                raise P.PlaceholderError("result_%d cell %d carries no %s; it is not a share of a total"
                                         % (k, index, field))
            text = str(found)
        else:
            single = "{{result_cell_%s%s}}" % (n_text, "." + attr if attr else "")
            try:
                text = P.render(single, env)
            except KeyError as exc:
                # the core does cell[attr]; a cell missing that key raised KeyError, which the loop
                # does not catch, so the turn died as a 500 instead of asking for one redraft
                raise P.PlaceholderError("result_%d cell %s carries no %s" % (k, n_text, attr or "display")) from exc
        citations.append({"k": k, "cell": int(n_text), "attr": attr or "display",
                          "receipt": env.get("receipt", ""), "text": text})
        return '<cite k="%d" cell="%s" receipt="%s">%s</cite>' % (k, n_text, html.escape(env.get("receipt", ""), quote=True), html.escape(text, quote=False))

    out = render_links(MULTI.sub(sub, template), tables)
    left = UNKNOWN.findall(out)
    if left:
        if not drop_unknown:
            raise UnknownPlaceholderError(
                "template uses %s, which is not a placeholder; the only forms are {{result_k_cell_n}} "
                "and its .short/.exact/.unit/.value/.share/.pct variants, the links {{link:downloads}}, "
                "{{link:downloads:<section>}} (sections: %s) and {{link:file:<table>}}, and the entry "
                "{{download:<table>}}, both for a table the release serves"
                % (", ".join(sorted(set(left))[:3]), ", ".join(DOWNLOAD_SECTIONS)))
        out = strip_unknown(out)
    return out, citations


def placeholders_in(template):
    return [(int(m.group(1)) if m.group(1) else None, int(m.group(2)), m.group(3)) for m in MULTI.finditer(template)]
