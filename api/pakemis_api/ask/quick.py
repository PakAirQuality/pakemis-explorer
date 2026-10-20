"""Explicit suggestion actions over the same typed tools as the model loop.

Free text is never classified here. The browser supplies an intent only when a supported
suggestion is clicked; every figure still passes through Service and render_multi.
"""
import html
import logging
import time

from pakemis_api.ask import prompt
from pakemis_api.ask.loop import ModelEvent, Turn
from pakemis_api.ask.render import render_multi
from pakemis_api.ask.tools import ToolInputError

log = logging.getLogger("pakemis_api.ask")


def supported(intent, ui):
    return bool(intent and not any(ui.get(k) for k in ("pol", "month", "cell"))
                and ui.get("metric") in (None, "greenhouse_gases")
                and ui.get("level") != "grid"
                and (intent != "largest_source" or not ui.get("sector")))


class QuickTurn(Turn):
    def __init__(self, *args, intent, **kwargs):
        super().__init__(*args, **kwargs)
        self.intent = intent

    def _request(self):
        ui, dims = self.ui_state, self.dims
        # Only release identifiers enter a request. In particular, `level` describes the map,
        # while the selected `geo` determines the grain of the answer.
        choices = {"period": dims.fiscal_periods, "config": dims.configurations,
                   "gwp": dims.gwp_bases, "view": dims.views, "gas": dims.gases,
                   "sector": dims.sectors}
        for key, allowed in choices.items():
            value = ui.get(key)
            if value is not None and value != "" and (not isinstance(value, str) or value not in allowed):
                raise ToolInputError("The selected %s is not available in this release." % key)
        geo = ui.get("geo")
        if geo is not None and geo != "" and (not isinstance(geo, str) or geo not in dims.adm1_names and geo not in dims.adm2_shape_ids):
            raise ToolInputError("The selected place is not available in this release.")
        query = {"configuration_id": ui.get("config") or dims.defaults["configuration_id"],
                 "gwp_basis": ui.get("gwp") or dims.defaults["gwp_basis"]}
        if geo:
            query.update(geography_level="adm1" if geo in dims.adm1_names else "adm2",
                         geography_ids=[geo], spatial_view=ui.get("view") or dims.defaults["spatial_view"])
        if ui.get("gas"):
            query["gases"] = [ui["gas"]]
        if ui.get("sector"):
            query["reporting_sectors"] = [ui["sector"]]
        if self.intent == "largest_source":
            query.update(periods=[ui.get("period") or dims.defaults["period_id"]],
                         group_by=["reporting_sector"], order_by="value desc")
            return "query_emissions", query
        return "get_timeseries", {"query": query, "step": "annual"}

    def _template(self, env):
        values = env.get("values") or []
        if not values:
            return "This release carries no estimates for the selected scope."
        if self.intent == "largest_source":
            labels = self.service.labels()["reporting_sectors"]
            top = values[0]
            # The engine ordered the partition; keep tied leaders rather than pick one.
            leaders = [i for i, v in enumerate(values) if v.get("exact") == top.get("exact")]
            parts = ["%s at {{result_1_cell_%d.short}} {{result_1_cell_%d.unit}}"
                     % (html.escape(labels.get(values[i]["group"]["reporting_sector"], values[i]["group"]["reporting_sector"])), i, i)
                     for i in leaders]
            text = ("The largest estimated reporting sector is " if len(parts) == 1 else "The largest estimated reporting sectors are tied: ")
            text += "; ".join(parts) + "."
        else:
            ordered = sorted(range(len(values)), key=lambda i: values[i]["group"]["period_id"])
            first, last = ordered[0], ordered[-1]
            labels = self.service.labels()["periods"]
            def point(i):
                period = values[i]["group"]["period_id"]
                label = labels.get(period, {}).get("short", period)
                return "{{result_1_cell_%d.short}} {{result_1_cell_%d.unit}} in %s" % (i, i, html.escape(label))
            text = "The annual estimate is %s" % point(first)
            text += (" and %s" % point(last)) if last != first else ""
            text += ". The table shows the published annual series."
        if self.ui_state.get("geo"):
            text += " These are allocated estimates; historical geography can be reconstructed from the reference year's pattern."
        return text

    def events(self):
        started = time.monotonic()
        name = "query_emissions" if self.intent == "largest_source" else "get_timeseries"
        try:
            name, request = self._request()
        except ToolInputError as exc:
            # Use the loop's validation/refusal event shape even before an engine call.
            from pakemis_api.ask.loop import refusal_payload
            yield "tool_call", {"k": 1, "id": "quick_1", "name": name, "input": {}}
            out = [("refusal", refusal_payload(1, "quick_1", name, exc, self.service))]
            failed = True
        else:
            yield "tool_call", {"k": 1, "id": "quick_1", "name": name, "input": request}
            yield "status", {"phase": "tool", "k": 1, "name": name}
            _, failed, out = self._execute(1, ModelEvent("tool_use", id="quick_1", name=name, input=request))
        for event in out:
            yield event
        if failed:
            text = html.escape(next(p["message"] for n, p in out if n == "refusal"))
            citations = []
        else:
            text, citations = render_multi(self._template(self.results[0]), self.results,
                                           allowlist=(self.dims.version, self.dims.release_id))
        self.conv.append("user", prompt.user_message(self.message, self.ui_state))
        self.conv.append("assistant", text)
        self.conv.last_card = None
        elapsed = time.monotonic() - started
        log.info("ask quick intent=%s tool=%s elapsed_s=%.3f refused=%s", self.intent, name, elapsed, failed)
        yield "answer", {"text": text, "receipts": self.receipts, "citations": citations,
                         "scope": self.scope, "source": "query", "elapsed_s": round(elapsed, 3)}
        yield "done", {"conversation_id": self.conv.id, "usage": dict(self.usage), "cost_estimate_usd": 0.0}
