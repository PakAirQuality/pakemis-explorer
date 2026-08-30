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
import re

from pakemis_query import placeholders as P

MULTI = re.compile(r"\{\{result_(?:(\d+)_)?cell_(\d+)(?:\.(exact|unit|value|short))?\}\}")
SERVICE_ATTRS = {"short": ("display_short", "display"), "unit": ("unit_short", "unit")}     # (service field, the core's fallback); the rest are the core's


class BareNumberError(P.PlaceholderError):
    """A decimal that is not a placeholder."""


def check_bare_numbers(template, allowlist=()):
    """Raise BareNumberError if the template carries a decimal outside a placeholder."""
    stripped = MULTI.sub("", template)
    for word in allowlist:
        if word:
            stripped = stripped.replace(word, "")
    try:
        P.reject_bare_numbers(stripped)
    except P.PlaceholderError as exc:
        raise BareNumberError(str(exc)) from exc


def render_multi(template, results, allowlist=()):
    """-> (text, citations). results[k-1] is the envelope of tool call k (None for a call that
    returned no envelope). Raises PlaceholderError (BareNumberError for a bare decimal)."""
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
            text = str(cell.get(field) or cell.get(fallback) or cell["display"])
        else:
            single = "{{result_cell_%s%s}}" % (n_text, "." + attr if attr else "")
            text = P.render(single, env)
        citations.append({"k": k, "cell": int(n_text), "attr": attr or "display",
                          "receipt": env.get("receipt", ""), "text": text})
        return '<cite k="%d" cell="%s" receipt="%s">%s</cite>' % (k, n_text, html.escape(env.get("receipt", ""), quote=True), html.escape(text, quote=False))

    return MULTI.sub(sub, template), citations


def placeholders_in(template):
    return [(int(m.group(1)) if m.group(1) else None, int(m.group(2)), m.group(3)) for m in MULTI.finditer(template)]
