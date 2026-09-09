"""Pydantic request models GENERATED from pakemis_query.models' frozen dataclasses.

Nothing here is written by hand per field: each model is built with pydantic.create_model over
`dataclasses.fields(...)` of the query core, so the API's request bodies cannot drift from the
contract's request dataclasses.  Field descriptions come from the trailing `# ...` comments in
models.py.  Type mapping: tuple -> list[str] (JSON arrays), str/int/float unchanged, a nested
dataclass -> its generated model.  `defaults_applied` (compare=False) is server-set and omitted.

`to_request(model)` turns a validated body back into the frozen dataclass the engine takes;
`from_canonical(text)` rebuilds a dataclass from the canonical JSON a receipt was hashed over.
"""
import dataclasses
import inspect
import json
import re
import typing

from pydantic import ConfigDict, Field, create_model

from pakemis_api.settings import import_query_core

import_query_core()
from pakemis_query import models as M  # noqa: E402

REQUEST_TYPES = [M.QueryEmissions, M.QueryAir, M.CompareRequest, M.TimeseriesRequest, M.UncertaintyRequest,
                 M.CompletenessRequest, M.EvidenceRequest, M.MethodRequest, M.SpatialLineageRequest,
                 M.TransferRequest, M.GridCellRequest, M.DownloadRequest]
BY_NAME = {t.__name__: t for t in REQUEST_TYPES}

_COMMENT = re.compile(r"^\s*(\w+)\s*:\s*[^#]*#\s*(.*?)\s*$")


def _descriptions(dc):
    """{field: trailing comment} from the dataclass source."""
    out = {}
    try:
        src = inspect.getsource(dc)
    except OSError:
        return out
    for line in src.splitlines():
        m = _COMMENT.match(line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def _pydantic_type(field, models):
    t = field.type
    if isinstance(t, str):              # postponed annotations, resolve by name
        t = {"tuple": tuple, "str": str, "int": int, "float": float}.get(t) or BY_NAME.get(t)
    if dataclasses.is_dataclass(t):
        return models[t.__name__], ...
    if t is tuple:
        return typing.List[str], Field(default_factory=list)
    default = field.default if field.default is not dataclasses.MISSING else ...
    return t, default


def build_models():
    models = {}
    for dc in REQUEST_TYPES:                       # nested types come first in REQUEST_TYPES
        descriptions = _descriptions(dc)
        fields = {}
        for f in dataclasses.fields(dc):
            if not f.compare:                      # defaults_applied: recorded by the engine
                continue
            typ, default = _pydantic_type(f, models)
            desc = descriptions.get(f.name)
            if isinstance(default, type(Field())):
                if desc:
                    default.description = desc
                fields[f.name] = (typ, default)
            else:
                fields[f.name] = (typ, Field(default, description=desc) if desc else default)
        # extra="forbid", NOT pydantic's silent default: a field this contract does not
        # know (a request from a NEWER web app hitting a stale server - `periods` on the
        # rc47 vendor was the live case) must be a 422, never a request quietly answered
        # at the wrong scope. A plausible number that is wrong is worse than a refusal.
        models[dc.__name__] = create_model(dc.__name__, __doc__=(dc.__doc__ or "").strip() or None,
                                           __config__=ConfigDict(extra="forbid"), **fields)
    return models


MODELS = build_models()
QueryEmissionsModel = MODELS["QueryEmissions"]
QueryAirModel = MODELS["QueryAir"]
CompareRequestModel = MODELS["CompareRequest"]
TimeseriesRequestModel = MODELS["TimeseriesRequest"]
UncertaintyRequestModel = MODELS["UncertaintyRequest"]
CompletenessRequestModel = MODELS["CompletenessRequest"]
EvidenceRequestModel = MODELS["EvidenceRequest"]
MethodRequestModel = MODELS["MethodRequest"]
SpatialLineageRequestModel = MODELS["SpatialLineageRequest"]
TransferRequestModel = MODELS["TransferRequest"]
GridCellRequestModel = MODELS["GridCellRequest"]
DownloadRequestModel = MODELS["DownloadRequest"]


def _coerce(dc, payload):
    kwargs = {}
    for f in dataclasses.fields(dc):
        if f.name not in payload:
            continue
        v = payload[f.name]
        t = f.type
        if isinstance(t, str):
            t = {"tuple": tuple, "str": str, "int": int, "float": float}.get(t) or BY_NAME.get(t)
        if dataclasses.is_dataclass(t):
            kwargs[f.name] = _coerce(t, v) if isinstance(v, dict) else v
        elif t is tuple or f.name == "defaults_applied":
            kwargs[f.name] = tuple(v) if v is not None else ()
        else:
            kwargs[f.name] = v
    return dc(**kwargs)


def to_request(model):
    """A validated pydantic body -> the frozen dataclass of the same name."""
    return _coerce(BY_NAME[type(model).__name__], model.model_dump())


def from_canonical(text):
    """The canonical JSON a receipt was hashed over -> the dataclass it names in `_type`."""
    payload = json.loads(text)
    dc = BY_NAME[payload.pop("_type")]
    return _coerce(dc, payload)
