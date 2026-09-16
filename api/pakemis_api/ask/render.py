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


class BareNumberError(P.PlaceholderError):
    """A decimal that is not a placeholder."""


class UnknownPlaceholderError(P.PlaceholderError):
    """Brace syntax the renderer does not recognise - an invented field, not a real one.

    A DISTINCT CLASS BECAUSE IT IS TREATED DIFFERENTLY. A bare decimal is a correctness failure and
    the answer is withheld; an invented field name is a cosmetic one, and withholding a whole
    correct answer over a missing share phrase serves nobody. The loop asks for one redraft and then
    ships without the phrase. What must never happen either way is template syntax on screen.
    """


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
    stripped = MULTI.sub("", template)
    for word in allowlist:
        if word:
            stripped = stripped.replace(word, "")
    try:
        P.reject_bare_numbers(stripped)
    except P.PlaceholderError as exc:
        raise BareNumberError(str(exc)) from exc


def render_multi(template, results, allowlist=(), drop_unknown=False):
    """-> (text, citations). results[k-1] is the envelope of tool call k (None for a call that
    returned no envelope). Raises PlaceholderError (BareNumberError for a bare decimal,
    UnknownPlaceholderError for brace syntax this renderer does not know).

    `drop_unknown` is the loop's second pass: the model has already been asked to redraft once, so
    the unknown phrase is removed rather than the answer withheld.
    """
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

    out = MULTI.sub(sub, template)
    left = UNKNOWN.findall(out)
    if left:
        if not drop_unknown:
            raise UnknownPlaceholderError(
                "template uses %s, which is not a placeholder; the only forms are {{result_k_cell_n}} "
                "and its .short/.exact/.unit/.value/.share/.pct variants" % ", ".join(sorted(set(left))[:3]))
        out = strip_unknown(out)
    return out, citations


def placeholders_in(template):
    return [(int(m.group(1)) if m.group(1) else None, int(m.group(2)), m.group(3)) for m in MULTI.finditer(template)]
