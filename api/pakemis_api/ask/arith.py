"""The assistant's arithmetic, done exactly on the server: `add_up` (sum the rows of a result this turn
already fetched, grouped as asked) and `calculate` (a few numbers combined by + - * / and powers).

WHY (November 2026). The assistant now writes its own numbers (render.py no longer withholds a typed
figure), because the questions people ask of the activity records are sums, breakdowns, shares and
changes that no single row holds - "vehicles in Punjab by class" is ten sums over 36 districts. A
language model adding 288 seven-digit numbers in its head makes small, plausible mistakes nobody would
catch. So the model decides WHAT to add and how to group it, and the server adds.

NOTHING HERE KNOWS A TABLE. The rows are the result's own (records.record_rows for an activity result;
the cells' `group` keys for any other), and the only rules applied are arithmetic ones: figures in
different units or of different measures are never added together (they are always kept apart, as if
grouped by), and a row with no value is skipped and counted. Everything else the release says about
adding - its combinable rules, its use notes, overlapping levels, printed totals, cumulative reports -
is REPORTED beside the sum as a warning, for the model to weigh; the model reads the same rules in the
rows it was shown.
"""
import ast
import decimal
import re
from decimal import Decimal

from pakemis_api.ask.records import record_rows

# never added together, whatever the grouping asked for
ALWAYS_APART = ("Measure", "Unit")
MAX_GROUPS = 300
MAX_EXPRESSIONS = 20
MAX_EXPRESSION_CHARS = 500


class ArithError(ValueError):
    """An add_up or calculate input that cannot be answered; the message says what would be."""


def _rows(env):
    """[{column: text}] and the column names, for any envelope."""
    calc = env.get("calculation") or {}
    if calc.get("kind") == "records" or env.get("request_type") == "query_activity":
        rows = [r for _, r in record_rows(env)]
        columns = list(rows[0].keys()) if rows else []
        return rows, columns
    rows, columns = [], []
    for v in env.get("values") or []:
        if not isinstance(v, dict):
            continue
        row = {str(k): str(val if val is not None else "") for k, val in (v.get("group") or {}).items()}
        row["Unit"] = str(v.get("unit") or "")
        row["Value"] = str(v.get("exact") if v.get("exact") is not None else "")
        rows.append(row)
        columns.extend(c for c in row if c not in columns)
    return rows, columns


def _number(text):
    try:
        x = Decimal(str(text).replace(",", ""))
    except (decimal.InvalidOperation, ValueError):
        return None
    return x if x.is_finite() else None


def fmt(x):
    """A Decimal as plain text: integral without a point, otherwise without trailing zeros."""
    if x == x.to_integral_value():
        return str(x.quantize(Decimal(1)))
    out = format(x.normalize(), "f")
    return out


def _pct(part, whole):
    if not whole:
        return None
    return fmt((part / whole * 100).quantize(Decimal("0.1")))


def _resolve(name, columns):
    match = next((c for c in columns if c.lower() == str(name).strip().lower()), None)
    if match is None:
        raise ArithError("%r is not a column of that result; its columns are: %s" % (name, ", ".join(columns)))
    return match


def add_up(env, group_by=(), where=()):
    """Sum a result's rows: filtered by `where` ([{column, values}]), grouped by `group_by` (column
    names), always kept apart by Measure and Unit. -> a dict for the model."""
    rows, columns = _rows(env)
    if not rows:
        raise ArithError("that result has no rows to add up")
    if "Value" not in columns:
        raise ArithError("that result carries no values to add up")
    selectable = [c for c in columns if c != "Value"]
    filters = []
    for f in where or ():
        if not isinstance(f, dict):
            raise ArithError("each `where` entry is {column, values}")
        column = _resolve(f.get("column", ""), selectable)
        wanted = [str(v).strip().lower() for v in (f.get("values") or [])]
        if not wanted:
            raise ArithError("`where` on %s names no values" % column)
        held = {r[column] for r in rows}
        missing = [v for v in wanted if v not in {h.lower() for h in held}]
        if missing:
            listed = sorted(h for h in held if h)[:30]
            raise ArithError("%s holds no %s; it holds: %s%s" % (
                column, ", ".join(repr(m) for m in missing), "; ".join(listed), " ..." if len(held) > 30 else ""))
        filters.append((column, set(wanted)))
    chosen = [r for r in rows if all(r[c].lower() in wanted for c, wanted in filters)]
    keys = [_resolve(g, selectable) for g in (group_by or ())]
    apart = [c for c in ALWAYS_APART if c in selectable and c not in keys and len({r[c] for r in chosen}) > 1]
    group_keys = keys + apart

    groups, skipped = {}, 0
    for r in chosen:
        x = _number(r["Value"])
        if x is None:
            skipped += 1
            continue
        key = tuple(r[c] for c in group_keys)
        g = groups.setdefault(key, {"sum": Decimal(0), "rows": 0, "_unit": r.get("Unit", ""), "_measure": r.get("Measure", ""),
                                    "_periods": set()})
        g["sum"] += x
        g["rows"] += 1
        g["_periods"].add(r.get("Period", ""))
    if not groups:
        raise ArithError("none of the %d rows selected has a value to add" % len(chosen))

    # the total of each (measure, unit): what a group's share is a share of
    totals = {}
    for g in groups.values():
        t = totals.setdefault((g["_measure"], g["_unit"]), {"sum": Decimal(0), "rows": 0})
        t["sum"] += g["sum"]
        t["rows"] += g["rows"]
    # a share of a sum across periods means nothing, so a grouping by period carries none
    by_period = any(k.lower() == "period" for k in keys)
    # EACH GROUP'S OWN DATE, when the groups do not all share one: "by province" over the provinces'
    # registers answers with every province's date beside its sum, in this one call
    dated = ("Period" in selectable and "Period" not in group_keys
             and len({p for g in groups.values() for p in g["_periods"]}) > 1)
    out_groups = []
    for key, g in groups.items():
        item = dict(zip(group_keys, key))
        item["sum"] = fmt(g["sum"])
        item["rows"] = g["rows"]
        share = (_pct(g["sum"], totals[(g["_measure"], g["_unit"])]["sum"])
                 if len(groups) > 1 and not by_period else None)
        if share is not None:
            item["share_pct"] = share
        if "Unit" not in group_keys:
            item["unit"] = g["_unit"]
        if dated:
            held = sorted(p for p in g["_periods"] if p)
            if len(held) == 1:
                item["Period"] = held[0]
            elif held:
                item["periods"] = "%d periods, %s to %s" % (len(held), held[0], held[-1])
        out_groups.append((g["sum"], item))
    if by_period:
        out_groups.sort(key=lambda gi: tuple(gi[1].get(k, "") for k in group_keys))
    else:
        out_groups.sort(key=lambda gi: -gi[0])
    result = {"rows_added": sum(g["rows"] for g in groups.values()),
              "groups": [item for _, item in out_groups[:MAX_GROUPS]]}
    if len(out_groups) > MAX_GROUPS:
        result["groups_not_listed"] = len(out_groups) - MAX_GROUPS
    result["totals"] = [{"Measure": m, "unit": u, "sum": fmt(t["sum"]), "rows": t["rows"]}
                        for (m, u), t in totals.items()]
    if apart:
        result["kept_apart"] = "rows of different %s are never added together, so they are grouped apart" % " and ".join(apart)
    if skipped:
        result["rows_without_a_value"] = skipped
    result["covers"] = _covers(chosen, group_keys)
    warnings = _warnings(chosen, group_keys)
    if warnings:
        result["check_before_reporting"] = warnings
    return result


def _covers(rows, grouped):
    out = {}
    for column in ("Location", "Province", "Period"):
        if column in grouped or not rows or column not in rows[0]:
            continue
        values = sorted({r[column] for r in rows if r[column]})
        if not values:
            continue
        out[column] = values if len(values) <= 8 else "%d values, %s to %s" % (len(values), values[0], values[-1])
    return out


def _warnings(rows, grouped):
    """What the release says about adding these rows, said beside the sum."""
    out = []

    def several(column):
        return column not in grouped and rows and column in rows[0] and len({r[column] for r in rows}) > 1

    if several("Period"):
        periods = sorted({r["Period"] for r in rows})
        dates = {}
        for r in rows:
            dates.setdefault(r.get("Location", ""), set()).add(r["Period"])
        if any(len(held) > 1 for held in dates.values()):
            out.append("these sums run across %d periods (%s to %s): right for a flow over time (fuel sold in a "
                       "year's months), wrong for a stock (a register, a herd), which would count the same items "
                       "once per date" % (len(periods), periods[0], periods[-1]))
        else:
            # each place once, but not every place at the same date (provinces' registers differ)
            out.append("these sums add places reported at different dates (%s to %s), each place once: say so "
                       "beside the sum and give each part's own date" % (periods[0], periods[-1]))
    if several("Period type"):
        out.append("these rows mix period types (%s): a year's row already holds its months, so add one kind, "
                   "or group by Period type" % ", ".join(sorted({r["Period type"] for r in rows})))
    if several("Location level"):
        out.append("these rows mix location levels (%s): a national or provincial row already contains the "
                   "places below it" % ", ".join(sorted({r["Location level"] for r in rows})))
    if several("Evidence"):
        out.append("these rows mix evidence classes (%s)" % ", ".join(sorted({r["Evidence"] for r in rows})))
    if rows and "Reporting interval" in rows[0] and any("cumulative" in r["Reporting interval"].lower() for r in rows):
        out.append("some rows are cumulative reports, which overlap the single-month reports of the same year")
    # a column whose chosen values include both printed totals and other rows: the parts and their total
    totals_named = []
    for column in (rows[0].keys() if rows else ()):
        if column in ("Value", "Note", "Rule", "Source status", "Source series") or column in grouped:
            continue
        values = {r[column] for r in rows if r[column]}
        named = {v for v in values if re.search(r"\btotal\b|\bsubtotal\b", v, re.I)}
        if named and named != values:
            totals_named.extend(sorted(named))
    if totals_named:
        out.append("some rows are printed totals of other rows (%s): added with their parts they count twice"
                   % "; ".join(totals_named[:6]))
    if rows and "Rule" in rows[0]:
        rules = {}
        for r in rows:
            if r["Rule"]:
                rules[r["Rule"]] = rules.get(r["Rule"], 0) + 1
        barred = {t: n for t, n in rules.items() if not t.lower().startswith("yes")}
        if barred:
            out.append("the release's rule for adding %s: %s" % (
                "some of these rows" if len(barred) < len(rules) else "these rows",
                "; ".join("%r (%d rows)" % (t, n) for t, n in barred.items())))
        elif len(rules) == 1 and any(word in next(iter(rules)).lower() for word in ("within", "never", "only")):
            out.append("the release's rule for adding these rows: %r" % next(iter(rules)))
    return out


# -- calculate ---------------------------------------------------------------------------------

_OPS = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
        ast.Div: lambda a, b: a / b, ast.Pow: lambda a, b: a ** b}
# 4,012,345 -> 4012345 (a thousands comma between digits; a comma anywhere else is an error)
_THOUSANDS = re.compile(r"(?<=\d),(?=\d{3}(?!\d))")


def _eval(node, names):
    if isinstance(node, ast.Expression):
        return _eval(node.body, names)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return Decimal(str(node.value))
    if isinstance(node, ast.Name):
        if node.id not in names:
            raise ArithError("%r is not a number or the name of an earlier expression in this call" % node.id)
        return names[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        x = _eval(node.operand, names)
        return -x if isinstance(node.op, ast.USub) else x
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        a, b = _eval(node.left, names), _eval(node.right, names)
        if isinstance(node.op, ast.Div) and b == 0:
            raise ArithError("division by zero")
        if isinstance(node.op, ast.Pow) and (abs(b) > 100 or (a < 0 and b != b.to_integral_value())):
            raise ArithError("that power is out of range")
        return _OPS[type(node.op)](a, b)
    raise ArithError("only numbers, + - * / ** and parentheses are allowed")


def calculate(expressions):
    """[{name, expression}] -> {"results": [{name, expression, result}]}. An expression may use the
    name of an earlier one in the same call."""
    if not expressions:
        raise ArithError("give at least one {name, expression}")
    if len(expressions) > MAX_EXPRESSIONS:
        raise ArithError("at most %d expressions per call" % MAX_EXPRESSIONS)
    names, out = {}, []
    with decimal.localcontext() as ctx:
        ctx.prec = 34
        for i, item in enumerate(expressions):
            if not isinstance(item, dict):
                raise ArithError("each entry is {name, expression}")
            name = str(item.get("name") or "x%d" % (i + 1)).strip()
            text = str(item.get("expression") or "")
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
                raise ArithError("%r is not a usable name (letters, digits and _)" % name)
            if not text or len(text) > MAX_EXPRESSION_CHARS:
                raise ArithError("expression %r is empty or longer than %d characters" % (name, MAX_EXPRESSION_CHARS))
            clean = _THOUSANDS.sub("", text.replace("×", "*").replace("÷", "/").replace("^", "**"))
            try:
                tree = ast.parse(clean, mode="eval")
            except SyntaxError:
                raise ArithError("expression %r is not arithmetic: %s" % (name, text)) from None
            try:
                x = _eval(tree, names)
            except (decimal.InvalidOperation, decimal.Overflow, OverflowError):
                raise ArithError("expression %r cannot be computed" % name) from None
            names[name] = x
            rounded = x.quantize(Decimal("0.000001")) if x != x.to_integral_value() else x
            out.append({"name": name, "expression": text, "result": fmt(rounded)})
    return {"results": out}
