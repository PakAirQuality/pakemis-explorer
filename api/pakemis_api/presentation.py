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
map's one sentence, and each province row (and the cell that names the province) `unallocated_short`.
The map's evidence layers read `spatial_class` and its companions on every adm2 cell (the rule is
declared here as DERIVED["spatial_class"]; spatial_fields.py applies it with the release's tables).

Three more serve the briefing's widgets: `axis_ticks_short` (an envelope whose cells all carry a
number in one unit gains `axis`: four to six round tick labels from 0 to at least the largest cell,
steps from {1, 2, 2.5, 5} x 10^n, so a chart carries a real axis while the browser computes
nothing); `change_short` (a get_timeseries envelope at the annual step gains `change`: the first and
last period's exacts, their signed difference at two decimals and the signed percentage at one, with
a direction word; it compares the two endpoints only); and `share_phrase` beside `share_pct_short`
(the share in words from bands declared once, "nearly half" for 45-55 %, from the unrounded share)
with `rank` (1-based by exact, largest first) on the same partition cells.

The decoration runs after the query core has minted `result_sha256` and the receipt, so neither
moves: a decorated envelope replays to the same receipt, and the CSV download (a data product,
not a screen) is served undecorated.
"""
import copy
import json
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_EVEN

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
            "decimal places (0.25); it is added only when every province row carries a numeric exact, and never to a download."
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
            "half to even to two decimal places (465.67): the mass the release places at the request's grain. It is "
            "added only beside unallocated_total_short, when every cell is exact and the request has no limit, and never to a download."
        ),
    },
}

PROVINCE_UNALLOCATED_FIELD = "unallocated_short"
PROVINCE_UNALLOCATED_RULE = (
    "unallocated_short is one province's unallocated.by_province[].exact rounded half to even to two decimal places "
    "(4.84), written on that province row and, when a cell's group names the province, on the cell, with "
    "derived.unallocated_by_province_short mapping each province to it; added wherever unallocated_total_short is "
    "(a query_emissions envelope at adm1 or adm2 grain whose unallocated block lists provinces with numeric exacts), "
    "and never to a download."
)
SPATIAL_CLASS_FIELD = "spatial_class"
SPATIAL_COMPANIONS = ["allocation_status", "placement_class", "allocation_surface", "dominant_module", "dominant_stream", "spatial_class_basis"]
SPATIAL_CLASS_RULE = (
    "spatial_class is the spatial_class_measured (fact_evidence) of the cell's dominant stream, placement_class and "
    "allocation_surface that stream's, on every cell of a query_emissions envelope at adm2 grain. The cell's module is "
    "the module its group names, else the one sector the request filters, else the module whose rows sum to the largest "
    "co2e_Mt_AR5 among the rows the cell sums (a server-side sum used only to choose, never printed); the module's "
    "dominant stream is the stream (of the cell's gas when the cell names one) with the largest fact_annual co2e_Mt_AR5 "
    "at the reference period and configuration, compared as decimals, ties broken by source_stream_id. allocation_status "
    "is the distinct allocation_status values of the cell's rows joined by ';'. dominant_module, dominant_stream and "
    "spatial_class_basis say which stream the class came from and why. These are labels about the evidence behind an "
    "allocation, not observations of the district; a cell that sums several modules carries the class of one of them. "
    "Never added to a download."
)
DERIVED_SPATIAL_CLASS = {
    "field": SPATIAL_CLASS_FIELD,
    "companion_fields": SPATIAL_COMPANIONS,
    "derived_from": "fact_evidence.spatial_class_measured / placement_class / allocation_surface of the dominant stream; "
                    "fact_adm2_month.allocation_status of the cell's rows",
    "applies_to": "every cell of a query_emissions envelope at adm2 grain; the envelope carries spatial_fields {rule, reference}",
    "values": "S1 | S2 | S3 | S4 | NA (dim_evidence_class, axis S)",
    "sentence": SPATIAL_CLASS_RULE,
}


AXIS_FIELD = "axis_ticks_short"
CHANGE_FIELD = "change_short"
CHANGE_PCT_FIELD = "change_pct_short"
PHRASE_FIELD = "share_phrase"
RANK_FIELD = "rank"

# the tick step is a mantissa from this set times a power of ten; a step is never finer than the
# two-decimal rule (0.01); the count of ticks is four to six, the one nearest five preferred, and
# between two counts as near, the finer step
TICK_MANTISSAS = (Decimal("1"), Decimal("2"), Decimal("2.5"), Decimal("5"))
TICK_MIN, TICK_MAX, TICK_TARGET = 4, 6, 5
TICK_FLOOR_STEP = Q

AXIS_RULE = (
    "axis.ticks_short are round tick labels for a chart of these cells: from 0 (or the lowest cell when a cell is "
    "negative) to at least the highest cell, at a step of 1, 2, 2.5 or 5 times a power of ten, never finer than "
    "0.01, chosen so that the axis carries four to six ticks (the count nearest five, and between two as near the "
    "finer step); each tick is rendered at two decimal places with trailing zeros trimmed (0, 100, 200; 0, 0.25, "
    "0.5). max_short (min_short) is the highest (lowest) number among the cells at two decimal places. The range "
    "covers every number a cell carries: exact, and exact_high or the quantiles when present. It is added to any "
    "envelope whose cells all carry a numeric exact in one unit that is not a count (a query_emissions total or "
    "breakdown, a compare, a timeseries, an uncertainty series), never to a download; an envelope with a cell "
    "that carries no number, or whose numbers are all zero, carries no axis. The ticks are labels, not data."
)

CHANGE_RULE = (
    "change compares the two endpoints of an annual timeseries (or of a query_air series grouped by period_id): from_period and to_period are the lowest "
    "and highest period_id among the cells, from_short and to_short their exact at two decimal places, "
    "change_short is (last - first) rounded half to even to two decimal places with an explicit sign (+79.95, "
    "-5.13; a difference below the precision prints <0.01 or >-0.01), change_pct_short is 100 x (last - first) / "
    "first rounded half to even to one decimal place with an explicit sign (+21.5), or null when the first "
    "value is zero, and direction is rose, fell or unchanged by the sign of the exact difference. It says nothing "
    "about the years between the endpoints. It is added only to a get_timeseries envelope whose step is annual "
    "with at least two cells that each carry a numeric exact in one unit, and never to a download."
)

# the share in words: lower bound inclusive, checked from the top; from the UNROUNDED share
SHARE_BANDS = (
    (Decimal("90"), "almost all"),
    (Decimal("60"), "most"),
    (Decimal("55"), "over half"),
    (Decimal("45"), "nearly half"),
    (Decimal("30"), "about a third"),
    (Decimal("20"), "about a quarter"),
    (Decimal("10"), "about a tenth"),
    (Decimal("5"), "a small share"),
    (Decimal("0"), "a marginal share"),
)

PHRASE_RULE = (
    "share_phrase is the cell's share of the sum of these cells in words, from the unrounded share (100 x exact / "
    "the sum of exact, before share_pct_short's rounding) against bands whose lower bound is inclusive: 90 or more "
    "'almost all'; 60 to 90 'most'; 55 to 60 'over half'; 45 to 55 'nearly half'; 30 to 45 'about a third'; 20 to "
    "30 'about a quarter'; 10 to 20 'about a tenth'; 5 to 10 'a small share'; below 5 'a marginal share'; a "
    "negative share has no phrase. rank beside it is the cell's 1-based position by exact, largest first (equal "
    "exacts keep the envelope's order). Both are added to exactly the cells that carry share_pct_short, and never "
    "to a download."
)


def _band_rows():
    return [{"from": format(lo, "f"), "phrase": phrase} for lo, phrase in SHARE_BANDS]


DERIVED[PROVINCE_UNALLOCATED_FIELD] = {
    "field": PROVINCE_UNALLOCATED_FIELD,
    "derived_from": "unallocated.by_province[].exact",
    "mode": "ROUND_HALF_EVEN",
    "decimals": DECIMALS,
    "unit": "Mt CO2e (the unit of fact_unallocated)",
    "applies_to": "each unallocated.by_province row (and the cell whose group names that province) of the envelopes that "
                  "carry unallocated_total_short; derived.unallocated_by_province_short maps province -> value",
    "sentence": PROVINCE_UNALLOCATED_RULE,
}
DERIVED[SPATIAL_CLASS_FIELD] = DERIVED_SPATIAL_CLASS
DERIVED[AXIS_FIELD] = {
    "field": AXIS_FIELD,
    "derived_from": "exact (and exact_high or quantiles when a cell carries them)",
    "mode": "ROUND_HALF_EVEN",
    "decimals": DECIMALS,
    "unit": "the cells' unit",
    "applies_to": "any envelope whose cells all carry a numeric exact in one unit that is not a count; written on "
                  "env.axis = {ticks_short, min_short, max_short, unit_short, note}",
    "steps": [format(m, "f") for m in TICK_MANTISSAS],
    "ticks": {"min": TICK_MIN, "max": TICK_MAX, "target": TICK_TARGET, "finest_step": format(TICK_FLOOR_STEP, "f")},
    "trailing_zeros": "trimmed (0, 100, 0.25, 0.5)",
    "sentence": AXIS_RULE,
}
DERIVED[CHANGE_FIELD] = {
    "field": CHANGE_FIELD,
    "companion_fields": [CHANGE_PCT_FIELD, "direction"],
    "derived_from": "exact of the first and last cells by period_id",
    "mode": "ROUND_HALF_EVEN",
    "decimals": DECIMALS,
    "pct_decimals": SHARE_DECIMALS,
    "applies_to": "a get_timeseries envelope at the annual step, or a query_air envelope grouped by period_id, with at least two exact cells in one unit; written on "
                  "env.change = {from_period, to_period, from_short, to_short, change_short, change_pct_short, "
                  "direction, unit_short, note}",
    "directions": ["rose", "fell", "unchanged"],
    "sentence": CHANGE_RULE,
}
DERIVED[PHRASE_FIELD] = {
    "field": PHRASE_FIELD,
    "companion_fields": [RANK_FIELD],
    "derived_from": "the unrounded share 100 x exact / the sum of exact over the cells",
    "applies_to": "exactly the cells that carry share_pct_short (a query_emissions envelope grouped by one key whose "
                  "cells partition a total)",
    "bands": _band_rows(),
    "sentence": PHRASE_RULE,
}

PRESENTATION_ROUNDING = {
    "id": "PRESENTATION_ROUNDING",
    "field": "display_short",
    "derived_from": "exact",
    "mode": "ROUND_HALF_EVEN",
    "decimals": DECIMALS,
    "sentence": (
        "display_short is the exact decimal rounded half to even to two decimal places, in plain notation with "
        "trailing zeros kept (465.92, 0.25, 0.30), for every numeric cell whatever its unit; a zero prints as 0.00; "
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
    "trailing_zeros": "kept (465.92, 63.37, 0.25, 0.39, 0.30, 248.75)",
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
    envelope is not a query_emissions or query_air answer. query_air joined on 2026-09-08:
    one pollutant's cells partition its own total the same way (the one-unit rule guarantees
    one species) - except a year or period grouping, which is a series, not a partition; a
    share of a 35-year (or nine-period) sum is a number nobody asked for."""
    if env.get("request_type") not in ("query_emissions", "query_air"):
        return None
    try:
        req = json.loads(env.get("request") or "")
    except (TypeError, ValueError):
        return None
    if not isinstance(req, dict) or req.get("_type", "QueryEmissions") not in ("QueryEmissions", "QueryAir"):
        return None
    keys = req.get("group_by") or ()
    if env.get("request_type") == "query_air" and list(keys) in (["year"], ["period_id"]):
        return None
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
    """Adds share_pct_short, share_phrase and rank to every cell and `partition` to the envelope when
    the cells partition a total; leaves the envelope alone otherwise."""
    cells = partition_cells(env)
    if cells is None:
        return env
    exacts = [Decimal(str(c["exact"])) for c in cells]
    total = sum(exacts)
    for c, x, rank in zip(cells, exacts, ranks(exacts)):
        c[SHARE_FIELD] = share_short(x, total)
        phrase = share_phrase(x, total)
        if phrase is not None:
            c[PHRASE_FIELD] = phrase
        c[RANK_FIELD] = rank
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
    by_province = {}
    for row, x in zip(block["by_province"], exacts):
        row[PROVINCE_UNALLOCATED_FIELD] = round_value(x)
        by_province[row.get("province")] = row[PROVINCE_UNALLOCATED_FIELD]
    derived["unallocated_by_province_short"] = by_province
    for c in env.get("values") or ():
        province = (c.get("group") or {}).get("province") if isinstance(c, dict) and isinstance(c.get("group"), dict) else None
        if province in by_province:
            c[PROVINCE_UNALLOCATED_FIELD] = by_province[province]
    block["total_short"] = derived[UNALLOCATED_FIELD]
    if PLACED_FIELD in derived:
        block["placed_short"] = derived[PLACED_FIELD]
    env["derived"] = dict(env.get("derived") or {}, **derived)
    return env


# --- the derived fields: an axis, a change, a phrase ------------------------------------------

def tick_short(x):
    """One tick label: the two-decimal rendering with trailing zeros trimmed (100, 0.25, 0.5, 0)."""
    q = x.quantize(Q, rounding=ROUND_HALF_EVEN)
    if q == 0:
        return "0"
    return format(q.normalize(), "f")


def axis_ticks(low, high):
    """The tick values (Decimals) for a range that always includes zero: steps of 1, 2, 2.5, 5 x 10^n,
    never finer than TICK_FLOOR_STEP, the count within TICK_MIN..TICK_MAX nearest TICK_TARGET (the finer
    step between two as near); None when no step gives such a count or the range is empty."""
    low, high = min(low, Decimal(0)), max(high, Decimal(0))
    span = high - low
    if span <= 0:
        return None
    e = span.adjusted()
    best = None
    for n in range(e - 2, e + 2):
        for m in TICK_MANTISSAS:
            step = m.scaleb(n)
            if step < TICK_FLOOR_STEP:
                continue
            lo_t = (low / step).to_integral_value(rounding=ROUND_FLOOR) * step
            hi_t = (high / step).to_integral_value(rounding=ROUND_CEILING) * step
            count = int((hi_t - lo_t) / step) + 1
            if not TICK_MIN <= count <= TICK_MAX:
                continue
            key = (abs(count - TICK_TARGET), step)
            if best is None or key < best[0]:
                best = (key, step, lo_t, count)
    if best is None:
        return None
    _, step, lo_t, count = best
    return [lo_t + step * i for i in range(count)]


def _cell_numbers(cell):
    """Every number a cell carries for an axis: exact, exact_high, the quantiles; None when the cell
    is a count, non-numeric, or carries no exact."""
    if not isinstance(cell, dict) or is_count(cell.get("unit")):
        return None
    x = _decimal(cell.get("exact"))
    if x is None:
        return None
    out = [x]
    high = _decimal(cell.get("exact_high"))
    if high is not None:
        out.append(high)
    q = cell.get("quantiles")
    if isinstance(q, dict):
        for v in q.values():
            d = _decimal(v)
            if d is not None:
                out.append(d)
    return out


def axis_block(cells):
    """The axis block for cells that all carry a number in one unit, else None."""
    if not cells or not all(isinstance(c, dict) for c in cells):
        return None
    units = {c.get("unit") for c in cells}
    if len(units) != 1:
        return None
    numbers = []
    for c in cells:
        got = _cell_numbers(c)
        if got is None:
            return None
        numbers.extend(got)
    low, high = min(numbers), max(numbers)
    ticks = axis_ticks(low, high)
    if ticks is None:
        return None
    return {"ticks_short": [tick_short(t) for t in ticks], "min_short": round_value(low), "max_short": round_value(high),
            "unit_short": unit_short(next(iter(units))), "note": AXIS_RULE}


def decorate_axis(env):
    """Adds `axis` to an envelope whose cells all carry a number in one unit (see AXIS_RULE)."""
    block = axis_block(env.get("values") or [])
    if block is not None:
        env["axis"] = block
    return env


def signed_short(x, q=Q):
    """A signed rendering at the quantum q: +79.95, -5.13, 0.00 (0.0 at SHARE_Q); a non-zero value
    below the precision keeps round_value's <0.01 / >-0.01 forms (with the share forms at SHARE_Q)."""
    if x == 0:
        return format(Decimal(0).quantize(q), "f")
    r = x.quantize(q, rounding=ROUND_HALF_EVEN)
    if r == 0:
        below, above = (BELOW, ABOVE) if q == Q else (SHARE_BELOW, SHARE_ABOVE)
        return below if x > 0 else above
    text = format(r, "f")
    return "+" + text if r > 0 else text


def _timeseries_step(env):
    if env.get("request_type") != "get_timeseries":
        return None
    try:
        req = json.loads(env.get("request") or "")
    except (TypeError, ValueError):
        return None
    return req.get("step") if isinstance(req, dict) else None


def _air_period_series(env):
    """Whether `env` is a query_air answer grouped by exactly period_id - the air family's own
    fiscal series (2026-09-09), which gains the same `change` block as an annual timeseries."""
    if env.get("request_type") != "query_air":
        return False
    try:
        req = json.loads(env.get("request") or "")
    except (TypeError, ValueError):
        return False
    return isinstance(req, dict) and list(req.get("group_by") or ()) == ["period_id"]


def decorate_change(env):
    """Adds `change` to a get_timeseries envelope at the annual step - and, since 2026-09-09, to a
    query_air series grouped by period_id - with two or more exact cells in one unit: the endpoints
    by period_id, the signed difference and percentage, a direction word."""
    if _timeseries_step(env) != "annual" and not _air_period_series(env):
        return env
    cells = env.get("values") or []
    rows = []
    for c in cells:
        if not isinstance(c, dict) or is_count(c.get("unit")):
            return env
        period = (c.get("group") or {}).get("period_id") if isinstance(c.get("group"), dict) else None
        x = _decimal(c.get("exact"))
        if not period or x is None:
            return env
        rows.append((period, x, c.get("unit")))
    if len(rows) < 2 or len({r[2] for r in rows}) != 1:
        return env
    rows.sort(key=lambda r: r[0])
    (p0, x0, unit), (p1, x1, _) = rows[0], rows[-1]
    delta = x1 - x0
    env["change"] = {
        "from_period": p0, "to_period": p1,
        "from_short": round_value(x0), "to_short": round_value(x1),
        CHANGE_FIELD: signed_short(delta),
        CHANGE_PCT_FIELD: signed_short(delta * 100 / x0, SHARE_Q) if x0 != 0 else None,
        "direction": "rose" if delta > 0 else "fell" if delta < 0 else "unchanged",
        "unit_short": unit_short(unit),
        "note": "compares the first and last period only",
    }
    return env


def share_phrase(part, total):
    """The share of `part` in `total` in words (SHARE_BANDS, from the unrounded share); None for a
    negative share."""
    share = part * 100 / total
    if share < 0:
        return None
    for lower, phrase in SHARE_BANDS:
        if share >= lower:
            return phrase
    return None


def ranks(exacts):
    """1-based ranks by value, largest first; equal values keep their order."""
    order = sorted(range(len(exacts)), key=lambda i: (-exacts[i], i))
    out = [0] * len(exacts)
    for position, i in enumerate(order):
        out[i] = position + 1
    return out


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
    `partition` on the envelope (share_phrase and rank beside the share); a spatial envelope with
    per-province unallocated exacts gains unallocated_total_short and placed_short (see
    decorate_unallocated); an envelope whose cells all carry a number in one unit gains `axis`
    (decorate_axis) and an annual timeseries gains `change` (decorate_change). The envelope's receipt and result_sha256 were minted by the core
    before this runs and are not touched; pass in_place=False to keep the caller's envelope as the
    core returned it."""
    env = envelope if in_place else copy.deepcopy(envelope)
    for cell in env.get("values") or ():
        decorate_cell(cell)
    decorate_partition(env)
    decorate_unallocated(env)
    decorate_axis(env)
    decorate_change(env)
    return env
