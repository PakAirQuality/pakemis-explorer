"""Suggestion answers remain exact, replayable engine results, with no model call."""
import pytest

from pakemis_api.ask.quick import QuickTurn
from pakemis_api.ask.router import AskBody
from pakemis_query.models import QueryEmissions, TimeseriesRequest
from test_ask import ask_client, fake, only  # noqa: F401


def run(client, intent, ui=None, conversation_id=None):
    turn = client.app.state.ask.turn(AskBody(message="A suggested question", intent=intent,
                                           ui_state=ui or {}, conversation_id=conversation_id))
    assert isinstance(turn, QuickTurn)
    return list(turn.events()), turn


@pytest.mark.parametrize("ui", [
    {}, {"gas": "CH4"}, {"period": "FY2015-16"},
    {"geo": "Punjab", "level": "adm2"},
    {"geo": "Punjab", "period": "FY2015-16"},
    {"config": "S_2023_24"}, {"gwp": "AR6"}, {"view": "physical", "geo": "Punjab"},
])
def test_largest_source_matches_the_deck_and_replays(ask_client, fake, ui):
    fake.load()
    events, turn = run(ask_client, "largest_source", ui)
    # Independent dashboard-body equivalent: national scope leaves grain/view/basis defaulted.
    expected = ask_client.app.state.service.run(QueryEmissions(
        periods=(ui.get("period", "FY2023-24"),),
        configuration_id=ui.get("config", "REF_2023_24"), gwp_basis=ui.get("gwp", "AR5"),
        gases=(ui["gas"],) if ui.get("gas") else (),
        geography_level="adm1" if ui.get("geo") else "",
        geography_ids=(ui["geo"],) if ui.get("geo") else (),
        spatial_view=ui.get("view", "all") if ui.get("geo") else "",
        group_by=("reporting_sector",), order_by="value desc"))
    result = only(events, "tool_result")[0]
    assert result["receipt"] == expected["receipt"]
    assert result["cells"][0]["display_short"] == expected["values"][0]["display_short"]
    answer = only(events, "answer")[0]
    assert answer["citations"][0]["cell"] == 0
    assert all(c["receipt"] == expected["receipt"] for c in answer["citations"])
    assert not fake.calls and not only(events, "map_action")
    assert only(events, "done")[0]["cost_estimate_usd"] == 0
    assert not any(only(events, "done")[0]["usage"].values())
    assert ask_client.app.state.service.replay(result["receipt"])["result_sha256"] == expected["result_sha256"]


def test_district_rank_and_historical_trend_preserve_geography(ask_client, fake):
    fake.load()
    district = next(r["shape_id"] for r in ask_client.app.state.ask.dims.adm2 if r["name"] == "Lahore District")
    for intent in ("largest_source", "annual_trend"):
        events, turn = run(ask_client, intent, {"geo": district, "period": "FY2017-18", "level": "adm1"})
        result = only(events, "tool_result")[0]
        assert result["context"]["geography_level"] == "adm2"
        assert tuple(result["context"]["geography_ids"]) == (district,)
        assert "allocated estimates" in only(events, "answer")[0]["text"]
        assert ask_client.app.state.service.replay(result["receipt"])["receipt"] == result["receipt"]
    assert not fake.calls


@pytest.mark.parametrize("ui", [{}, {"sector": "industry"}, {"gas": "N2O"}, {"geo": "Punjab"}])
def test_trend_matches_published_series_and_is_retained(ask_client, fake, ui):
    fake.load()
    events, turn = run(ask_client, "annual_trend", ui)
    _, request = turn._request()
    q = QueryEmissions(**{k: tuple(v) if isinstance(v, list) else v for k, v in request["query"].items()})
    expected = ask_client.app.state.service.run(TimeseriesRequest(q))
    answer = only(events, "answer")[0]
    assert answer["receipts"] == [expected["receipt"]]
    assert len(only(events, "tool_result")[0]["cells"]) == len(expected["values"])
    assert len(answer["citations"]) == 4
    assert turn.conv.messages[-1]["content"] == answer["text"]
    assert expected["receipt"] in turn.conv.receipts
    assert turn.conv.tokens_spent == 0 and not fake.calls


@pytest.mark.parametrize("intent,ui", [
    ("largest_source", {"geo": "made-up"}),
    ("largest_source", {"geo": ["Punjab"]}),
    ("largest_source", {"period": "FY1900-01"}),
    ("largest_source", {"period": 0}),
    ("largest_source", {"gas": []}),
    ("largest_source", {"gwp": "AR6", "geo": "district"}),
    ("annual_trend", {"config": "S_2023_24"}),
])
def test_invalid_or_unpublished_scopes_are_refused_without_substitution(ask_client, fake, intent, ui):
    fake.load()
    events, _ = run(ask_client, intent, ui)
    refusal = only(events, "refusal")[0]
    assert refusal["message"]
    assert not only(events, "tool_result")
    assert only(events, "answer")[0]["receipts"] == []
    assert not fake.calls


@pytest.mark.parametrize("ui", [{"pol": "PM2.5"}, {"month": "202307"}, {"level": "grid"}, {"cell": "30,70"}])
def test_other_scopes_keep_the_existing_path(ask_client, ui):
    turn = ask_client.app.state.ask.turn(AskBody(message="A selected result", intent="annual_trend", ui_state=ui))
    assert not isinstance(turn, QuickTurn)


def test_typed_question_omits_the_fast_path_even_when_wording_matches(ask_client):
    turn = ask_client.app.state.ask.turn(AskBody(message="What is Pakistan's largest source?"))
    assert not isinstance(turn, QuickTurn)


def test_quick_answer_does_not_need_a_model_key(ask_client, monkeypatch):
    monkeypatch.setattr(ask_client.app.state.ask, "model", None)
    response = ask_client.post("/api/v1/emissions/ask", json={"message": "What is Pakistan's largest source?", "intent": "largest_source"})
    assert response.status_code == 200 and 'event: answer' in response.text
    assert '"source": "query"' in response.text
    assert 'event: done' in response.text


def test_unknown_intent_is_a_validation_error(ask_client):
    response = ask_client.post("/api/v1/emissions/ask", json={"message": "Question", "intent": "arbitrary_sql"})
    assert response.status_code == 422
