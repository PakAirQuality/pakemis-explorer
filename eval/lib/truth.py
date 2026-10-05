"""Execute a case's truth spec against the pinned release and return the reference value.

A case never carries a hand-typed number. It carries a REQUEST - the same typed request the
agent's own tools take - and the resolver runs it through the same Service the API serves from.
The reference answer is therefore established by execution, not by transcription, and it moves
with the release instead of going stale in a fixture. A spec that names a source document
instead (kind `pointer`) carries the pointer and no value, and is scored on wording only.

resolve_case(service, case) -> {name: {"value", "unit", "display", "exact"}} for the value specs,
plus {"__refusal__": {"error_class", "message"}} when the spec expects a typed refusal. A spec
that does not resolve raises: an unresolvable reference answer is a defect in the case, never a
score of zero for the agent.
"""
import sys

REQUEST_TYPES = ("QueryEmissions", "QueryAir", "CompareRequest", "TimeseriesRequest",
                 "UncertaintyRequest", "CompletenessRequest", "EvidenceRequest", "MethodRequest",
                 "SpatialLineageRequest", "TransferRequest", "GridCellRequest")


def _models():
    from pakemis_query import models as M
    return M


def build_request(spec):
    """{"type": "QueryEmissions", ...fields} -> the frozen dataclass, tuples restored from lists."""
    M = _models()
    spec = dict(spec)
    name = spec.pop("type")
    if name not in REQUEST_TYPES:
        raise ValueError("unknown request type %r" % name)
    cls = getattr(M, name)
    fields = {f.name: f for f in __import__("dataclasses").fields(cls)}
    kwargs = {}
    for key, raw in spec.items():
        if key not in fields:
            raise ValueError("%s has no field %r" % (name, key))
        if isinstance(raw, dict) and "type" in raw:
            kwargs[key] = build_request(raw)
        elif isinstance(raw, list):
            kwargs[key] = tuple(raw)
        else:
            kwargs[key] = raw
    return cls(**kwargs)


def _pick(env, sel):
    """Select one cell of an envelope: by index, or by the group a cell carries."""
    values = env["values"]
    if "cell" in sel:
        i = sel["cell"]
        if i >= len(values):
            raise ValueError("cell %d of %d" % (i, len(values)))
        return values[i]
    if "group" in sel:
        want = sel["group"]
        hits = [v for v in values if all((v.get("group") or {}).get(k) == w for k, w in want.items())]
        if len(hits) != 1:
            raise ValueError("group %r matched %d cells" % (want, len(hits)))
        return hits[0]
    if "where" in sel:
        want = sel["where"]
        hits = [v for v in values if all(str(v.get(k)) == str(w) for k, w in want.items())]
        if len(hits) != 1:
            raise ValueError("where %r matched %d cells" % (want, len(hits)))
        return hits[0]
    if "n_cells" in sel:
        return {"display": str(len(values)), "exact": str(len(values)), "unit": "cells",
                "value": float(len(values))}
    raise ValueError("a value spec needs cell, group, where or n_cells")


def resolve_case(service, case):
    out = {}
    truth = case.get("truth") or {}
    for name, spec in (truth.get("values") or {}).items():
        env = service.run(build_request(spec["request"]))
        cell = _pick(env, spec)
        out[name] = {"display": cell.get("display"), "exact": cell.get("exact"),
                     "unit": cell.get("unit"), "value": cell.get("value"),
                     "context": {k: env["context"].get(k) for k in
                                 ("basis", "periods", "configuration_id", "gwp_basis",
                                  "geography_level", "spatial_view")}}
    ref = truth.get("refusal")
    if ref:
        from pakemis_query import errors as E
        try:
            service.run(build_request(ref["request"]))
        except E.QueryError as exc:
            got = type(exc).__name__
            if ref.get("error") and got != ref["error"]:
                raise AssertionError("%s: expected %s, got %s (%s)" % (case["id"], ref["error"], got, exc))
            out["__refusal__"] = {"error_class": got, "message": str(exc)}
        else:
            raise AssertionError("%s: the refusal spec did not refuse" % case["id"])
    for name, spec in (truth.get("counts") or {}).items():
        rows = service.engine._fetch(spec["sql"])
        out[name] = {"display": str(len(rows)) if spec.get("count_rows") else str(rows[0][list(rows[0])[0]]),
                     "exact": None, "unit": spec.get("unit", ""), "value": None, "rows": rows[:12]}
    return out
