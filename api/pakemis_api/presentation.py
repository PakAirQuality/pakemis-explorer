"""Presentation rounding: a server-side short display for every envelope cell.

The web computes nothing, so the number a screen prints at reading precision is minted here,
beside the contract's `display` and the `exact` decimal, never in place of them.  `display_short`
is the cell's `exact` at two decimal places (Decimal, ROUND_HALF_EVEN, the contract's own
rounding mode) for every numeric cell whatever its unit; `/release` publishes the rule as
`rounding.presentation` with a sentence a person can read.  `unit_words` is the unit as words and
`unit_short` the unit as a reader sees it beside a number ("Mt CO₂e"), the same mappings the web's
`unitWords` / `unitShort` use, so a caption and a sentence agree; neither carries the GWP basis
token, which the release's labels name once.

Two derived presentation fields sit beside it, declared under `rounding.presentation.derived`:
`share_pct_short` (a cell's share of the sum of the cells, one decimal, only when a query_emissions
envelope grouped by exactly one key partitions a total; the envelope names the partition in
`partition`) and `interval_short` (the P2.5–P97.5 interval of an uncertainty cell as one string,
from `quantiles_short`, with `scenario_label` naming the draw scenario in words).  A spatial envelope
whose `unallocated` block carries per-province exacts gains `unallocated_total_short` (their sum) and
`placed_short` (the sum of the cells minus that), on the block and under `env.derived`, for the
map's one sentence.

The decoration runs after the query core has minted `result_sha256` and the receipt, so neither
moves: a decorated envelope replays to the same receipt, and the CSV download (a data product,
not a screen) is served undecorated.
"""
import copy
import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_EVEN

COUNT_UNITS = ("rows", "count")
DECIMALS = 2
Q = Decimal("0.01")
BELOW = "<0.01"          # a non-zero value that would print as 0.00
ABOVE = ">-0.01"         # its negative twin (-0.00 is never printed)

SHARE_DECIMALS = 1
SHARE_Q = Decimal("0.1")
SHARE_BELOW = "<0.1"     # a non-zero share that would print as 0.0
SHARE_ABOVE = ">-0.1"
SHARE_FIELD = "share_pct_short"
INTERVAL_FIELD = "interval_short"
UNALLOCATED_FIELD = "unallocated_total_short"
PLACED_FIELD = "placed_short"
EN_DASH = "\u2013"

# the draw scenarios of fact_uncertainty_series in words (an unknown scenario prints as itself)
SCENARIO_LABELS = {
    "time_correlated": "time-correlated draws",
    "time_independent": "time-independent draws",
    "parameter_typed": "parameter-typed draws",
    "cross_sector": "factors shared across modules",
    "within_sector": "factors shared within a module",
}

PARTITION_RULE = (
    "share_pct_short is 100 x exact / the sum of exact over these cells, rounded half to even to one decimal "
    "place with the trailing zero kept (49.4, 7.0); a zero prints as 0.0; a non-zero share that would print as "
    "0.0 prints as <0.1 (>-0.1 when negative). It is added only to a query_emissions envelope whose request "
    "groups by exactly one key and whose cells are all exact (a numeric exact, no bounded interval, no "
    "left/right, one unit) and sum to a non-zero total, so the shares are a partition of that sum; it is not "
    "added when the request groups by no key or by two or more, to a compare, timeseries, uncertainty or "
    "completeness envelope, or to a download."
)

DERIVED = {
    SHARE_FIELD: {
        "field": SHARE_FIELD,
        "derived_from": "exact",
        "mode": "ROUND_HALF_EVEN",
        "decimals": SHARE_DECIMALS,
        "unit": "percent",
        "applies_to": "query_emissions cells when the request groups by exactly one key and every cell is exact; "
                      "the envelope carries partition {of, n, share_field, rule}",
        "zero": "0.0",
        "below_precision": "%s (%s when negative)" % (SHARE_BELOW, SHARE_ABOVE),
        "sentence": PARTITION_RULE,
    },
    INTERVAL_FIELD: {
        "field": INTERVAL_FIELD,
        "derived_from": "quantiles_short",
        "decimals": DECIMALS,
        "applies_to": "uncertainty cells that carry quantiles P2.5 and P97.5 (get_uncertainty scope series and "
                      "national); scenario_label names the cell's scenario in words beside it",
        "sentence": (
            "interval_short is the cell's quantiles_short P2.5 and P97.5 joined by an en dash (400.27%s514.28), "
            "each end the two-decimal rendering of the quantile; scenario_label is the draw scenario in words "
            "(time_correlated -> time-correlated draws), or the scenario id itself when it has no words." % EN_DASH
        ),
        "scenario_labels": dict(SCENARIO_LABELS),
    },
    UNALLOCATED_FIELD: {
        "field": UNALLOCATED_FIELD,
        "derived_from": "unallocated.by_province[].exact",
        "mode": "ROUND_HALF_EVEN",
        "decimals": DECIMALS,
        "unit": "Mt CO2e (the unit of fact_unallocated)",
        "applies_to": "a query_emissions envelope whose unallocated block lists provinces with a numeric exact each "
                      "(adm1 and adm2 grain); written on unallocated.total_short and derived.unallocated_total_short",
        "sentence": (
            "unallocated_total_short is the sum of exact over unallocated.by_province (the mass retained at ADM1 and "
            "placed no finer, within the request's configuration, months and sectors), rounded half to even to two "
            "decimal places (9.01); it is added only when every province row carries a numeric exact, and never to a download."
        ),
    },
    PLACED_FIELD: {
        "field": PLACED_FIELD,
        "derived_from": "values[].exact and unallocated.by_province[].exact",
        "mode": "ROUND_HALF_EVEN",
        "decimals": DECIMALS,
        "unit": "Mt CO2e",
        "applies_to": "the same envelopes, when every cell is exact (a numeric exact, no bounded interval, no left/right) "
                      "and the request carries no limit, so the cells sum to the scope's total; written on "
                      "unallocated.placed_short and derived.placed_short",
        "sentence": (
            "placed_short is the sum of exact over the cells minus the sum of exact over unallocated.by_province, rounded "
            "half to even to two decimal places (443.34): the mass the release places at the request's grain. It is "
            "added only beside unallocated_total_short, when every cell is exact and the request has no limit, and never to a download."
        ),
    },
}

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
    "derived": DERIVED,
}

# the web's unitWords / unitShort: a four-entry magnitude map, digits subscripted in the species,
# the GWP basis token DROPPED (the basis is named once, by the release's labels.gwp, never inside
# a unit a reader sees); any unit outside that shape passes through
MAGNITUDE_WORDS = {"Mt": "million tonnes", "Gg": "thousand tonnes", "kt": "thousand tonnes", "t": "tonnes"}
SUBSCRIPT_DIGITS = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


def is_gwp_token(t):
    return len(t) == 3 and t.startswith("AR") and t[2].isdigit()


def _species(tokens):
    return [t.translate(SUBSCRIPT_DIGITS) for t in tokens if not is_gwp_token(t)]


def unit_words(unit):
    """'Mt CO2e AR5' -> 'million tonnes CO₂e'; 'Gg' -> 'thousand tonnes'; else the unit."""
    tokens = str(unit or "").split()
    if not tokens or tokens[0] not in MAGNITUDE_WORDS:
        return unit
    return " ".join([MAGNITUDE_WORDS[tokens[0]]] + _species(tokens[1:]))


def unit_short(unit):
    """'Mt CO2e AR5' -> 'Mt CO₂e'; 'Gg' -> 'Gg'; 't CH4' -> 't CH₄'; else the unit."""
    tokens = str(unit or "").split()
    if not tokens or tokens[0] not in MAGNITUDE_WORDS:
        return unit
    return " ".join([tokens[0]] + _species(tokens[1:]))


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


def share_short(part, total):
    """One share at one decimal, half to even: 100 x part / total; the sub-precision forms for a
    non-zero share that would print as 0.0."""
    if part == 0:
        return "0.0"
    q = (part * 100 / total).quantize(SHARE_Q, rounding=ROUND_HALF_EVEN)
    if q == 0:
        return SHARE_BELOW if part * total > 0 else SHARE_ABOVE
    return format(q, "f")


def interval_short(quantiles_short):
    """'400.27' and '514.28' -> '400.27\u2013514.28'; None when either end is missing."""
    if not isinstance(quantiles_short, dict):
        return None
    low, high = quantiles_short.get("P2.5"), quantiles_short.get("P97.5")
    if low in ("", None) or high in ("", None):
        return None
    return "%s%s%s" % (low, EN_DASH, high)


def scenario_label(scenario):
    return SCENARIO_LABELS.get(scenario, scenario)


def _group_keys(env):
    """The request's group_by, read from the envelope's canonical request; None when the
    envelope is not a query_emissions answer."""
    if env.get("request_type") != "query_emissions":
        return None
    try:
        req = json.loads(env.get("request") or "")
    except (TypeError, ValueError):
        return None
    if not isinstance(req, dict) or req.get("_type", "QueryEmissions") != "QueryEmissions":
        return None
    keys = req.get("group_by") or ()
    return list(keys) if isinstance(keys, (list, tuple)) else None


def partition_cells(env):
    """The cells of `env` when they partition a total under PARTITION_RULE, else None: a
    query_emissions request grouped by exactly one key, every cell numeric and exact (no bounded
    interval, no left/right), one unit across the cells, a non-zero sum."""
    keys = _group_keys(env)
    if keys is None or len(keys) != 1:
        return None
    cells = env.get("values") or []
    if not cells or not all(isinstance(c, dict) for c in cells):
        return None
    units = {c.get("unit") for c in cells}
    if len(units) != 1 or is_count(next(iter(units))):
        return None
    for c in cells:
        if c.get("exact_high") not in ("", None) or "left" in c or "right" in c or _decimal(c.get("exact")) is None:
            return None
    if sum(Decimal(str(c["exact"])) for c in cells) == 0:
        return None
    return cells


def decorate_partition(env):
    """Adds share_pct_short to every cell and `partition` to the envelope when the cells partition
    a total; leaves the envelope alone otherwise."""
    cells = partition_cells(env)
    if cells is None:
        return env
    total = sum(Decimal(str(c["exact"])) for c in cells)
    for c in cells:
        c[SHARE_FIELD] = share_short(Decimal(str(c["exact"])), total)
    env["partition"] = {"of": "the sum of these cells", "n": len(cells), "share_field": SHARE_FIELD, "rule": PARTITION_RULE}
    return env


def _exact_cells(env):
    """The exact decimals of the cells when every cell is numeric and exact (no bounded interval,
    no left/right) and the request truncates nothing; None otherwise."""
    cells = env.get("values") or []
    if not cells or not all(isinstance(c, dict) for c in cells):
        return None
    try:
        req = json.loads(env.get("request") or "")
    except (TypeError, ValueError):
        req = {}
    if isinstance(req, dict) and req.get("limit"):
        return None
    out = []
    for c in cells:
        if c.get("exact_high") not in ("", None) or "left" in c or "right" in c or is_count(c.get("unit")):
            return None
        x = _decimal(c.get("exact"))
        if x is None:
            return None
        out.append(x)
    return out


def decorate_unallocated(env):
    """Adds unallocated_total_short (and placed_short when the cells are all exact) to a
    query_emissions envelope whose unallocated block lists provinces with numeric exacts: on the
    block as total_short / placed_short and under env.derived; leaves every other envelope alone."""
    if env.get("request_type") != "query_emissions":
        return env
    block = env.get("unallocated")
    if not isinstance(block, dict) or not isinstance(block.get("by_province"), list) or not block["by_province"]:
        return env
    exacts = [_decimal(r.get("exact")) if isinstance(r, dict) else None for r in block["by_province"]]
    if any(x is None for x in exacts):
        return env
    unallocated_total = sum(exacts)
    derived = {UNALLOCATED_FIELD: round_value(unallocated_total)}
    cells = _exact_cells(env)
    if cells is not None:
        derived[PLACED_FIELD] = round_value(sum(cells) - unallocated_total)
    block["total_short"] = derived[UNALLOCATED_FIELD]
    if PLACED_FIELD in derived:
        block["placed_short"] = derived[PLACED_FIELD]
    env["derived"] = dict(env.get("derived") or {}, **derived)
    return env


# --- the envelope -----------------------------------------------------------------------------

def decorate_cell(cell):
    """Adds display_short, unit_words and unit_short to one cell, in place; nested left/right cells and the
    quantiles get the same treatment (quantiles_short beside quantiles)."""
    if not isinstance(cell, dict):
        return cell
    unit = cell.get("unit", "")
    cell["display_short"] = short_display(cell.get("exact"), unit, cell.get("exact_high"), cell.get("display", ""))
    cell["unit_words"] = unit_words(unit)
    cell["unit_short"] = unit_short(unit)
    for side in ("left", "right"):
        if isinstance(cell.get(side), dict):
            decorate_cell(cell[side])
    q = cell.get("quantiles")
    if isinstance(q, dict):
        cell["quantiles_short"] = {k: short_display(v, unit, None, str(v)) for k, v in q.items()}
        interval = interval_short(cell["quantiles_short"])
        if interval is not None:
            cell[INTERVAL_FIELD] = interval
        if isinstance(cell.get("scenario"), str):
            cell["scenario_label"] = scenario_label(cell["scenario"])
    return cell


def decorate(envelope, in_place=True):
    """Every cell of `values` gains display_short, unit_words and unit_short (an uncertainty cell
    interval_short and scenario_label too); a one-key partition gains share_pct_short per cell and
    `partition` on the envelope; a spatial envelope with per-province unallocated exacts gains
    unallocated_total_short and placed_short (see decorate_unallocated). The envelope's receipt and result_sha256 were minted by the core
    before this runs and are not touched; pass in_place=False to keep the caller's envelope as the
    core returned it."""
    env = envelope if in_place else copy.deepcopy(envelope)
    for cell in env.get("values") or ():
        decorate_cell(cell)
    decorate_partition(env)
    decorate_unallocated(env)
    return env
