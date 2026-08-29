"""Presentation rounding: a server-side short display for every envelope cell.

The web computes nothing, so the number a screen prints at reading precision is minted here,
beside the contract's `display` and the `exact` decimal, never in place of them.  `display_short`
is derived from the cell's `exact` (Decimal, ROUND_HALF_EVEN, the contract's own rounding mode)
by the one rule declared below, and `/release` publishes the rule as `rounding.presentation`
with a sentence a person can read.  `unit_words` is the unit as words, the same mapping the web's
`unitWords` uses, so a caption and a sentence agree.

The decoration runs after the query core has minted `result_sha256` and the receipt, so neither
moves: a decorated envelope replays to the same receipt, and the CSV download (a data product,
not a screen) is served undecorated.
"""
import copy
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN

APPROX = "≈"          # the prefix of a bounded cell whose ends coincide at the contract's precision
MASS_PREFIXES = ("Mt", "Gg", "kt", "t")
PERCENT_MARKS = ("%", "pct", "percent")
SHARE_UNITS = ("", "ratio", "share")
COUNT_UNITS = ("rows", "count")

PRESENTATION_ROUNDING = {
    "id": "PRESENTATION_ROUNDING",
    "field": "display_short",
    "derived_from": "exact",
    "mode": "ROUND_HALF_EVEN",
    "sentence": (
        "display_short is a reading-precision rendering of the exact decimal, rounded half to even: "
        "a mass (Mt, Gg, t) at or above 10 keeps one decimal, between 1 and 10 two decimals, below 1 three "
        "significant figures, and a zero prints as 0; a percentage keeps one decimal; a share or ratio keeps "
        "three significant figures; a count is printed as it is; any other unit prints the contract display. "
        "A bounded cell rounds both ends by the same rule and, when they coincide, adds decimals up to the "
        "contract display's precision until they differ, else prints the single value with an "
        "approximately-equal prefix. display and exact are unchanged beside it."
    ),
    "rules": {
        "mass": {"units": "unit starts with Mt, Gg, kt or t",
                 "abs_ge_10": "1 decimal", "abs_1_to_10": "2 decimals", "abs_lt_1": "3 significant figures", "zero": "0"},
        "percent": {"units": "unit contains %, pct or percent", "decimals": 1, "zero": "0.0"},
        "share": {"units": "unit empty, ratio or share", "significant_figures": 3, "zero": "0"},
        "count": {"units": "rows, count", "rendering": "display unchanged"},
        "other": {"rendering": "display unchanged"},
        "bounded": {"rendering": "[low, high] by the same rule; equal ends widen up to the contract display's precision, "
                                 "else ≈value; two exactly equal ends print the single value"},
    },
    "trailing_zeros": "kept (452.3, 63.4, 9.01, 0.394, 0.350)",
}

# the web's unitWords: a four-entry magnitude map, digits subscripted in the species, a GWP basis
# token in parentheses; any unit outside that shape passes through
MAGNITUDE_WORDS = {"Mt": "million tonnes", "Gg": "thousand tonnes", "kt": "thousand tonnes", "t": "tonnes"}
SUBSCRIPT_DIGITS = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


def unit_words(unit):
    """'Mt CO2e AR5' -> 'million tonnes CO₂e (AR5)'; 'Gg' -> 'thousand tonnes'; else the unit."""
    tokens = str(unit or "").split()
    if not tokens or tokens[0] not in MAGNITUDE_WORDS:
        return unit
    out = [MAGNITUDE_WORDS[tokens[0]]]
    for t in tokens[1:]:
        if len(t) == 3 and t.startswith("AR") and t[2].isdigit():
            out.append("(%s)" % t)
        else:
            out.append(t.translate(SUBSCRIPT_DIGITS))
    return " ".join(out)


# --- the rule ---------------------------------------------------------------------------------

def unit_kind(unit):
    """mass | percent | share | count | other."""
    u = str(unit or "").strip()
    if u in COUNT_UNITS:
        return "count"
    if u in SHARE_UNITS:
        return "share"
    first = u.split()[0] if u.split() else ""
    if first in MASS_PREFIXES:
        return "mass"
    if any(m in u for m in PERCENT_MARKS):
        return "percent"
    return "other"


def _decimals(x, kind):
    """The rule's number of decimals for a non-zero Decimal x of the given kind."""
    a = abs(x)
    if kind == "percent":
        return 1
    if kind == "share":
        return max(0, 2 - a.adjusted())            # three significant figures
    if a >= 10:
        return 1
    if a >= 1:
        return 2
    return 2 - a.adjusted()                        # three significant figures below 1


def _plain(q):
    """A Decimal in plain notation (no exponent), '-0.0' normalised to '0.0'."""
    text = format(q, "f")
    return text[1:] if text.startswith("-") and not any(c not in "0." for c in text[1:]) else text


def _quantize(x, decimals):
    return x.quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_EVEN)


def _zero(kind):
    return "0.0" if kind == "percent" else "0"


def round_value(x, kind):
    """One Decimal under the rule -> (text, decimals used)."""
    if x == 0:
        return _zero(kind), 0
    decimals = _decimals(x, kind)
    q = _quantize(x, decimals)
    # rounding can cross a band (0.9996 -> 1.000): the band of the rounded value decides once more
    if q != 0 and _decimals(q, kind) != decimals:
        decimals = _decimals(q, kind)
        q = _quantize(x, decimals)
    if q == 0:
        return _zero(kind), decimals
    return _plain(q), decimals


def _display_precision(display, exact, exact_high):
    """The contract display's decimals (the low end of an interval), else the exacts' own."""
    text = str(display or "")
    if text.startswith("["):
        text = text[1:].split(",")[0]
    if text and "." in text and text.replace("-", "").replace(".", "").isdigit():
        return len(text.split(".")[1])
    best = 0
    for e in (exact, exact_high):
        try:
            best = max(best, -Decimal(str(e)).as_tuple().exponent)
        except (InvalidOperation, TypeError):
            pass
    return best


def short_display(exact, unit, exact_high=None, display=""):
    """The reading-precision rendering of a cell (see PRESENTATION_ROUNDING)."""
    kind = unit_kind(unit)
    if kind in ("count", "other") or exact in ("", None):
        return display if display not in ("", None) else str(exact or "")
    try:
        low = Decimal(str(exact))
    except InvalidOperation:
        return display if display else str(exact)
    if exact_high in ("", None):
        return round_value(low, kind)[0]
    try:
        high = Decimal(str(exact_high))
    except InvalidOperation:
        return round_value(low, kind)[0]
    if low == high:                                   # a degenerate interval is one value, exactly
        return round_value(low, kind)[0]
    lo_text, lo_dec = round_value(low, kind)
    hi_text, hi_dec = round_value(high, kind)
    if lo_text != hi_text:
        return "[%s, %s]" % (lo_text, hi_text)
    limit = _display_precision(display, exact, exact_high)
    decimals = max(lo_dec, hi_dec)
    while decimals < limit:
        decimals += 1
        lo_text, hi_text = _plain(_quantize(low, decimals)), _plain(_quantize(high, decimals))
        if lo_text != hi_text:
            return "[%s, %s]" % (lo_text, hi_text)
    return APPROX + lo_text


# --- the envelope -----------------------------------------------------------------------------

def decorate_cell(cell):
    """Adds display_short and unit_words to one cell, in place; nested left/right cells and the
    quantiles get the same treatment (quantiles_short beside quantiles)."""
    if not isinstance(cell, dict):
        return cell
    unit = cell.get("unit", "")
    cell["display_short"] = short_display(cell.get("exact"), unit, cell.get("exact_high"), cell.get("display", ""))
    cell["unit_words"] = unit_words(unit)
    for side in ("left", "right"):
        if isinstance(cell.get(side), dict):
            decorate_cell(cell[side])
    q = cell.get("quantiles")
    if isinstance(q, dict):
        cell["quantiles_short"] = {k: short_display(v, unit, None, str(v)) for k, v in q.items()}
    return cell


def decorate(envelope, in_place=True):
    """Every cell of `values` gains display_short and unit_words. The envelope's receipt and
    result_sha256 were minted by the core before this runs and are not touched; pass
    in_place=False to keep the caller's envelope as the core returned it."""
    env = envelope if in_place else copy.deepcopy(envelope)
    for cell in env.get("values") or ():
        decorate_cell(cell)
    return env
