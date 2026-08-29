"""Presentation rounding: a server-side short display for every envelope cell.

The web computes nothing, so the number a screen prints at reading precision is minted here,
beside the contract's `display` and the `exact` decimal, never in place of them.  `display_short`
is the cell's `exact` at two decimal places (Decimal, ROUND_HALF_EVEN, the contract's own
rounding mode) for every numeric cell whatever its unit; `/release` publishes the rule as
`rounding.presentation` with a sentence a person can read.  `unit_words` is the unit as words, the same mapping the web's
`unitWords` uses, so a caption and a sentence agree.

The decoration runs after the query core has minted `result_sha256` and the receipt, so neither
moves: a decorated envelope replays to the same receipt, and the CSV download (a data product,
not a screen) is served undecorated.
"""
import copy
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN

COUNT_UNITS = ("rows", "count")
DECIMALS = 2
Q = Decimal("0.01")
BELOW = "<0.01"          # a non-zero value that would print as 0.00
ABOVE = ">-0.01"         # its negative twin (-0.00 is never printed)

PRESENTATION_ROUNDING = {
    "id": "PRESENTATION_ROUNDING",
    "field": "display_short",
    "derived_from": "exact",
    "mode": "ROUND_HALF_EVEN",
    "decimals": DECIMALS,
    "sentence": (
        "display_short is the exact decimal rounded half to even to two decimal places, in plain notation with "
        "trailing zeros kept (452.35, 9.01, 0.30), for every numeric cell whatever its unit; a zero prints as 0.00; "
        "a non-zero value that would print as 0.00 prints as <0.01 (>-0.01 when negative, so -0.00 never appears); "
        "a negative keeps its sign; a bounded cell prints both ends at two decimals as [low, high], or the single "
        "value when the two ends round equal; a count and a non-numeric cell print their display unchanged. "
        "display and exact are unchanged beside it."
    ),
    "rules": {
        "numeric": {"units": "every unit except a count (rows, count)", "decimals": DECIMALS, "zero": "0.00",
                    "below_precision": "<0.01 (>-0.01 when negative)", "negative": "sign kept (-5.13)"},
        "count": {"units": "rows, count", "rendering": "display unchanged"},
        "non_numeric": {"rendering": "display unchanged"},
        "bounded": {"rendering": "[low, high] at two decimals; ends that round equal print the single value"},
        "quantiles": {"field": "quantiles_short", "decimals": DECIMALS},
    },
    "trailing_zeros": "kept (452.35, 63.37, 9.01, 0.39, 0.30, 248.75)",
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

def is_count(unit):
    return str(unit or "").strip() in COUNT_UNITS


def _decimal(text):
    if text in ("", None):
        return None
    try:
        return Decimal(str(text))
    except InvalidOperation:
        return None


def round_value(x):
    """One Decimal at two decimals, half to even, plain notation; the sub-precision forms for a
    non-zero value that would print as 0.00."""
    if x == 0:
        return "0.00"
    q = x.quantize(Q, rounding=ROUND_HALF_EVEN)
    if q == 0:
        return BELOW if x > 0 else ABOVE
    return format(q, "f")


def short_display(exact, unit, exact_high=None, display=""):
    """The two-decimal rendering of a cell (see PRESENTATION_ROUNDING): a count or a non-numeric
    cell gives its display; a bounded cell gives [low, high], or the one value when both ends
    round to it."""
    fallback = display if display not in ("", None) else str(exact or "")
    if is_count(unit):
        return fallback
    low = _decimal(exact)
    if low is None:
        return fallback
    high = _decimal(exact_high)
    if high is None:
        return round_value(low)
    lo_text, hi_text = round_value(low), round_value(high)
    return lo_text if lo_text == hi_text else "[%s, %s]" % (lo_text, hi_text)


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
