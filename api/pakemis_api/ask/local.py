"""The local-first answer: a prepared explanation, with no model call and no budget spent.

WHY THIS SITS IN FRONT OF THE LOOP. Most of what a visitor asks an emissions site is not a
question about a number. It is what emissions are, what methane does, what an emission factor is,
what Monte Carlo means and why anyone would do it, and what drives a sector's estimate. Those have
one right answer that does not change per selection, and paying a model to reproduce it each time
is both slower and less reliable than reading it out of a reviewed library.

WHAT IT WILL NOT DO. It never answers a number. The moment the router classifies a question as
asking for the selected result - a value, a pattern, an uncertainty, a coverage or a provenance
question about THIS selection - it declines and the tool loop behind it does the work, because
that path holds the typed query functions and mints a receipt. The library's own scope refusals
come with it: a question naming a different place, period, sector or gas than the selection is
answered with a request to select it, never with the selection's number.

The event shape is the loop's own - one `answer`, then `done` with a zero usage - so the browser
cannot tell which path served it, and no front-end change is needed.
"""
from __future__ import annotations

import time
from pathlib import Path
from types import SimpleNamespace

from pakemis_api.ask.library.knowledge import Knowledge
from pakemis_api.ask.library.routing import route

ROOT = Path(__file__).resolve().parent / "library"

# ui_state carries the Explorer's real release ids; the library's router wants a small view
# context. Only the fields the router actually reads are mapped, and every one is optional -
# an absent field must not invent a selection.
_VIEWS = {"overview", "explore", "map", "analyze", "methods", "learn"}
_METRICS = {"CO2e", "CO2", "CH4", "N2O", "NH3", "NOx", "NO2", "SO2", "CO",
            "PM2.5", "PM10", "BC", "NMVOC", "O3", "HFCs", "SF6"}


def _context(ui_state):
    ui = ui_state or {}
    metric = ui.get("pol") or ui.get("gas") or "CO2e"
    return SimpleNamespace(
        view=ui.get("tab") if ui.get("tab") in _VIEWS else "learn",
        metric=metric if metric in _METRICS else "CO2e",
        sector=ui.get("sector") or "all",
        geography_id=ui.get("geo") or "PK",
        start_period=ui.get("period") or "", end_period=ui.get("period") or "",
        configuration=ui.get("config") or "", release_id=ui.get("release_id") or "",
    )


# THE CARDS THAT ARE NOT ANSWERS. The router returns these when it recognises a question as
# being about the SELECTED DATA but has no number to give - they were the standalone service's
# "you need the engine for this" placeholders. In the merged assistant the loop behind this layer
# does have the number, so serving one of these locally would answer a data question with a
# definition. They are served only when the question names no inventory entity at all, which is
# what makes "what is uncertainty?" educational and "how uncertain is enteric fermentation?" a
# query. That distinction is the whole guard, and it is why this set exists rather than a
# keyword blocklist: the router already knows which cards are placeholders.
DEFER_WHEN_SPECIFIC = {"uncertainty", "patterns", "not_estimated", "live_required",
                       "source_chain", "coverage", "industry_mapping"}


class Library:
    """Loaded once per process; the files are read-only and the digest identifies them."""

    def __init__(self, root: Path = ROOT, dims=None):
        self.k = Knowledge(root)
        self.entities = self._entities(dims)

    @staticmethod
    def _entities(dims):
        """The release's own names, lowercased - categories, sectors, gases, provinces, periods.

        Built from the release rather than typed here, so a question naming something this
        inventory actually holds is recognised as a data question even when the wording looks
        conversational. An absent `dims` yields an empty set and the guard simply never fires,
        which keeps the layer usable in a test that has no release.
        """
        if dims is None:
            return set()
        out = set()
        for name in list(getattr(dims, "categories", [])) + list(getattr(dims, "sectors", [])):
            out.add(str(name).casefold())
        for name in getattr(dims, "adm1_names", []) or []:
            out.add(str(name).casefold())
        for row in getattr(dims, "adm2", []) or []:
            out.add(str(row.get("name", "")).casefold())
        for p in list(getattr(dims, "fiscal_periods", [])) + list(getattr(dims, "calendar_periods", [])):
            out.add(str(p).casefold())
        return {e for e in out if len(e) > 3}

    def names_an_entity(self, message):
        q = " %s " % message.casefold()
        return any(" %s " % e in q or e in q for e in self.entities)

    @property
    def digest(self):
        return self.k.digest

    def plan(self, message, ui_state, last_card_id=None):
        req = SimpleNamespace(question=message, context=_context(ui_state),
                              card_id=None, last_card_id=last_card_id)
        try:
            return route(req, self.k)
        except ValueError:
            return None

    MIN_SCORE = 2.0

    @staticmethod
    def _follow_up(card_id, last_card_id):
        """A bare "why do this?" continues the topic and scores nothing on its own words, so the
        confidence gate would throw it away. It is a deliberate routing branch: the router only
        reaches it when a previous explanation exists, and it answers either that card or its
        declared continuation (mc -> mc_why, emissions -> importance)."""
        if not last_card_id:
            return False
        return card_id == last_card_id or card_id.split("_")[0] == last_card_id.split("_")[0] \
            or (last_card_id, card_id) in {("emissions", "importance")}

    def _confident(self, message, card_id):
        ranked = self.k.rank_cards(message, 3)
        return bool(ranked) and ranked[0][1] == card_id and ranked[0][0] >= self.MIN_SCORE

    def answer(self, message, ui_state, last_card_id=None):
        """A rendered local answer, or None when this question belongs to the tool loop."""
        plan = self.plan(message, ui_state, last_card_id)
        if plan is None or not plan.card_ids:
            return None
        # `operation` is the router saying "this asks about the SELECTED RESULT". That is the
        # loop's job: it has the typed query functions and it mints a receipt. Declining here is
        # the whole separation of concerns, and it is why this layer can never state a number.
        if plan.operation:
            return None
        if any(i in DEFER_WHEN_SPECIFIC for i in plan.card_ids) and self.names_an_entity(message):
            return None
        # CONFIDENCE. The router's last resort is keyword intent, and a keyword can match by
        # accident: "bad input" contains "input", which the source-intent pattern reads as a
        # question about data sources. In the standalone assistant that produced a slightly odd
        # answer; here it would STEAL a question from the tool loop, which is worse, because the
        # visitor gets a definition where a number was available. So a non-explicit match must
        # also be the top-ranked card and clear a real score. Editor-authored aliases and the
        # deliberate routing branches carry explicit=True and are not gated.
        if not plan.explicit and not self._confident(message, plan.card_ids[0]) \
                and not self._follow_up(plan.card_ids[0], last_card_id):
            return None
        cards = [self.k.cards[i] for i in plan.card_ids if i in self.k.cards]
        if not cards:
            return None
        refs, seen = [], set()
        for c in cards:
            for ref in c["citations"]:
                if ref["source_id"] in seen:
                    continue
                seen.add(ref["source_id"])
                refs.append(self.k.cite(ref))
        text = "\n\n".join(c["summary"] for c in cards)
        if plan.notice:
            text = "%s\n\n%s" % (plan.notice, text)
        return {"text": text, "citations": refs, "card_ids": [c["id"] for c in cards],
                "titles": [c["title"] for c in cards]}


class LocalTurn:
    """A turn served from the library. Same events as the model turn, zero usage."""

    def __init__(self, conv, message, answer):
        self.conv = conv
        self.message = message
        self.answer = answer
        self.usage = {"input_tokens": 0, "output_tokens": 0}

    def events(self):
        started = time.time()
        self.conv.append("user", self.message)
        self.conv.append("assistant", self.answer["text"])
        self.conv.last_card = self.answer["card_ids"][0] if self.answer["card_ids"] else None
        # `titles` rides beside `card_ids` because the panel's provenance line names the cards this
        # answer was built from ("Project overview / Release scope"), and the ids are slugs. It was
        # already computed in Library.answer and thrown away here; the client has no card list to
        # resolve an id against, so dropping it left the line with nothing true to say.
        yield "answer", {"text": self.answer["text"], "receipts": [],
                         "citations": self.answer["citations"], "scope": None,
                         "source": "library", "card_ids": self.answer["card_ids"],
                         "titles": self.answer.get("titles") or [],
                         "elapsed_s": round(time.time() - started, 3)}
        # cost_estimate_usd is 0.0 and not None on purpose: None reads as "unknown", and this
        # path's cost is known exactly
        yield "done", {"conversation_id": self.conv.id, "usage": dict(self.usage),
                       "cost_estimate_usd": 0.0}
