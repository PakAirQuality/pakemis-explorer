"""The local-first explanation layer: what it answers, and — more importantly — what it declines.

A layer that answers before the tool loop is only safe if it knows what it is not for. It carries
prepared explanations of concepts and methods, which have one right answer that does not vary by
selection. It must never answer a question about a number, because the loop behind it holds the
typed query functions and mints a receipt, and a definition served where a value was available is
a worse answer that looks like a better one.

Two guards do that work, and both were written after a real failure:
  - a card that is one of the router's DATA PLACEHOLDERS is not served when the question names
    something this inventory holds ("what is uncertainty?" is a lesson, "how uncertain is enteric
    fermentation?" is a query);
  - a non-explicit match must also be the top-ranked card and clear a score, because a keyword can
    match by accident - "bad input" contains "input", which the source-intent pattern read as a
    question about data sources, and that stole a turn from the loop.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pakemis_api.ask.local import Library, LocalTurn        # noqa: E402
from pakemis_api.ask.memory import Memory                   # noqa: E402


class Dims:
    """The release names the guard is built from; the real one comes from the release."""
    categories = ["Enteric fermentation", "Manure management", "Rice cultivation"]
    sectors = ["agriculture", "power", "industry", "transport"]
    adm1_names = ["Punjab", "Sindh"]
    adm2 = [{"name": "Lahore"}]
    fiscal_periods = ["FY2015-16", "FY2023-24"]
    calendar_periods = []


@pytest.fixture(scope="module")
def lib():
    return Library(dims=Dims())


@pytest.fixture(scope="module")
def bare():
    return Library()                                        # no release: the entity guard never fires


EDUCATIONAL = [
    "what are emissions?", "why do emissions matter?", "what is methane?",
    "what is a greenhouse gas?", "what does CO2e mean?", "what is an emission factor?",
    "what are monte carlo estimates?", "what is uncertainty?",
    "what data drive agriculture?", "what sources does PakEmis use?",
]
QUERIES = [
    "how much did industry emit here?", "what is the uncertainty of this result?",
    "how uncertain is enteric fermentation?", "what is the uncertainty of agriculture?",
    "which province is highest?", "compare Punjab and Sindh",
    "what changed between the selected years?",
]


@pytest.mark.parametrize("q", EDUCATIONAL)
def test_an_explanation_is_answered_locally(lib, q):
    a = lib.answer(q, {})
    assert a and a["text"] and a["citations"], q


@pytest.mark.parametrize("q", QUERIES)
def test_a_question_about_the_data_goes_to_the_loop(lib, q):
    assert lib.answer(q, {}) is None, q


def test_the_entity_guard_is_what_separates_the_two(lib, bare):
    """The guard is built from the RELEASE's names, not a word list, so it recognises exactly what
    this inventory holds. A library with no release cannot fire it - which is the honest failure
    mode for a test harness, and the reason the real one is always constructed with dims."""
    assert lib.answer("what is uncertainty?", {}) is not None          # a lesson
    assert lib.answer("how uncertain is enteric fermentation?", {}) is None   # a query
    assert lib.names_an_entity("how uncertain is enteric fermentation?")
    assert lib.names_an_entity("what happened in Punjab?")
    assert not lib.names_an_entity("what is uncertainty?")
    assert not bare.entities and not bare.names_an_entity("enteric fermentation")


def test_an_incidental_keyword_does_not_steal_a_turn(lib):
    """"bad input" contains "input". The router's source-intent pattern matched it and served an
    explanation of where PakEmis gets its data. The confidence gate is why it no longer does."""
    assert lib.answer("bad input", {}) is None
    assert lib.answer("show me", {}) is None
    assert lib.answer("hello there", {}) is None


def test_a_follow_up_continues_the_topic(lib):
    """A bare "why do this?" scores nothing on its own words, so the confidence gate would throw
    it away. It is allowed only when a previous explanation exists to continue."""
    assert lib.answer("why do this?", {}, "mc")["titles"][0] == "Why use Monte Carlo?"
    assert lib.answer("why are they important?", {}, "emissions") is not None
    assert lib.answer("why do this?", {}) is None            # nothing to continue


def test_this_gas_follows_the_selection(lib):
    assert "Methane" in lib.answer("what is this gas?", {"gas": "CH4"})["titles"][0]
    assert "CO" in lib.answer("what is this gas?", {"gas": "CO2"})["titles"][0]
    # CO2e is the selected metric and is NOT a gas; the card must say so rather than name one
    assert "CO₂e" in lib.answer("what is this gas?", {})["titles"][0]


def test_the_local_turn_emits_the_loops_own_events_and_no_usage(lib):
    """The browser cannot tell which path served it, and the cost of this one is known to be zero
    rather than unknown - hence 0.0 and not None."""
    conv = Memory().get_or_create()
    events = list(LocalTurn(conv, "what are emissions?", lib.answer("what are emissions?", {})).events())
    names = [n for n, _ in events]
    assert names == ["answer", "done"]
    answer = dict(events)["answer"]
    done = dict(events)["done"]
    assert answer["text"] and answer["citations"] and answer["receipts"] == []
    assert answer["source"] == "library"
    # THE TITLES RIDE WITH THE IDS. The panel's provenance line names the cards this answer was
    # built from, and it has no card list to resolve a slug against - so an id without its title
    # leaves that line with nothing true to say.
    assert answer["card_ids"] == ["emissions"]
    assert answer["titles"] and all(isinstance(t, str) and t for t in answer["titles"])
    assert len(answer["titles"]) == len(answer["card_ids"])
    assert done["usage"] == {"input_tokens": 0, "output_tokens": 0}
    assert done["cost_estimate_usd"] == 0.0
    assert conv.last_card_id() == "emissions"               # the topic is remembered for a follow-up


def test_no_answer_states_a_number(lib):
    """The layer has no access to a value and must never appear to. Every published figure of this
    release is a five-decimal string; none of them may appear in a prepared explanation."""
    for q in EDUCATIONAL:
        a = lib.answer(q, {})
        for forbidden in ("469.63", "464.50", "223.45", "28.13", "13.63"):
            assert forbidden not in a["text"], q


def test_every_citation_resolves_and_none_is_one_of_our_papers(lib):
    kinds = {s["kind"] for s in lib.k.sources.values()}
    assert "project_document" not in kinds
    for cid, card in lib.k.cards.items():
        for ref in card["citations"]:
            assert ref["source_id"] in lib.k.sources, cid
            assert not ref.get("pages"), "%s cites a page on an unpaginated source" % cid


def test_the_library_digest_covers_what_decides_the_evidence(lib):
    """cards, sources, conflicts and the citation map. A change to any of them changes what the
    assistant asserts and to whom it attributes it, so each must move the digest."""
    assert len(lib.digest) == 64
    root = Path(lib.k.root)
    for f in ("cards.json", "sources.json", "conflicts.json", "citation_map.json"):
        assert (root / f).exists(), f


def test_the_explanations_answer_with_no_provider_key(settings):
    """THE POINT OF THE WHOLE LAYER. A site with no model key must still answer what emissions
    are; only a question about the selected data needs the loop, and that one says so plainly
    rather than the endpoint being off entirely."""
    import json as _json

    from fastapi.testclient import TestClient

    from pakemis_api.app import create_app

    with TestClient(create_app(settings, model_client=None)) as client:
        assert client.get("/api/v1/emissions/release").json()["agent"]["enabled"] is False

        r = client.post("/api/v1/emissions/ask", json={"message": "what are emissions?"})
        assert r.status_code == 200
        events = [l[6:] for l in r.text.splitlines() if l.startswith("data: ")]
        answer = next(_json.loads(e) for e in events if "text" in _json.loads(e))
        assert answer["text"] and answer["source"] == "library"
        assert answer["citations"]

        r = client.post("/api/v1/emissions/ask", json={"message": "how much did agriculture emit in FY2023-24?"})
        assert r.status_code == 503
        assert r.json()["error"] == "agent_disabled"
        assert "Explanations of the concepts and methods still work" in r.json()["message"]
