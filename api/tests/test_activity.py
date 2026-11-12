"""Activity records as queryable evidence, and the six questions that found the gap.

"How many cars are in Lahore?" used to end in a refusal: the release held the register (the
vehicle table, Lahore, the provincial bureau's stock at 30 June) and nothing typed could read
it. These tests hold the route and the assistant's tool to the answers a reader was owed:

    How many cars are in Lahore?            the count, its date, its source, and that it is a registered stock
    Does that include motorcycles?          two-wheelers are their own class
    How many vehicles altogether?           the sum over the classes held at the same date, marked as computed
    How many are driving today?             a register is a stock, not traffic
    What is the 2026 count?                 no later figure is held, and the span that is
    How much pollution do those cars make?  a count is never turned into an emission

No figure is typed here: every expected number is read from the release's own table, so the
tests follow the release they run against. The model is scripted; what is under test is what
the server hands it and what the server lets through to a reader.
"""
import csv
import json
import os
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from test_ask import CITE, FakeModel, ask, only, stop, text, tool_use

ROUTE = "/api/v1/emissions/query/activity"
VEHICLES = "fact_activity_vehicles"
REGISTERED = "Registered vehicles"
CARS, MOTORCYCLES = "Small cars (4W1)", "Two-wheelers (2W)"
# the map is somewhere else entirely: another province, a gas, a fiscal year
ELSEWHERE = {"level": "adm1", "geo": "Sindh", "gas": "CH4", "period": "FY2023-24"}


@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


@pytest.fixture(scope="module")
def lahore(settings):
    """Lahore's newest register, straight from the release's table: {class: row}."""
    path = os.path.join(settings.semantic_dir, VEHICLES + ".csv")
    with open(path, encoding="utf-8-sig", newline="") as handle:
        rows = [r for r in csv.DictReader(handle) if r["Location"] == "Lahore" and r["Measure"] == REGISTERED]
    assert rows, "the release holds no Lahore register"
    newest = max(r["Period"] for r in rows)
    return {"period": newest, "first": min(r["Period"] for r in rows),
            "rows": {r["Vehicle class"]: r for r in rows if r["Period"] == newest}}


def seen(fake):
    """The activity table the model was handed for the first tool call (ask/records.py)."""
    return json.loads(fake.calls[1]["messages"][-1]["content"][0]["content"])


def grouped(value):
    return "{:,}".format(int(Decimal(value)))


def lahore_call(**more):
    payload = {"table": VEHICLES, "locations": ["Lahore"], "measure": REGISTERED}
    payload.update(more)
    return payload


# --- the route ---------------------------------------------------------------------------------

def test_the_route_returns_the_record_with_its_definitions(client, lahore):
    r = client.post(ROUTE, json=lahore_call(categories=[CARS]))
    assert r.status_code == 200, r.text
    env = r.json()
    assert env["request_type"] == "query_activity" and env["receipt"]
    assert len(env["values"]) == 1
    v, row = env["values"][0], lahore["rows"][CARS]
    assert Decimal(v["exact"]) == Decimal(row["Value"])
    assert v["display"] == grouped(row["Value"])                 # as printed, grouped, unrounded
    assert (v["location"], v["location_level"], v["category"], v["unit"]) == ("Lahore", "District", CARS, "vehicles")
    assert v["period"] == lahore["period"] and v["period_type"] == "Snapshot date"
    assert v["period_label"].split()[-1] == lahore["period"][:4] and not v["period_label"][0] == "0"
    assert v["evidence"] and v["source_series"] and v["source_reference"]
    assert "not traffic" in v["use_note"]
    assert v["source_table"].endswith(".csv") and v["source_row"].isdigit()
    assert "periods" in env["context"]["defaults_applied"]       # nobody named a date: the newest was taken, and said
    calc = env["calculation"]
    assert calc["kind"] == "records" and calc["class_columns"][0] == "Vehicle class"
    assert {"Period", "Location", "Measure", "Value", "Unit"} <= set(calc["definitions"])


def test_a_count_is_not_rounded_to_two_decimals(client, lahore):
    """presentation.py gives every numeric cell two decimals; a register's count is not that kind of number."""
    env = client.post(ROUTE, json=lahore_call()).json()
    for v in env["values"]:
        assert "." not in v["display"] and not v["display_short"].endswith(".00"), v["display_short"]
        if Decimal(v["exact"]) >= 1_000_000:
            assert v["display_short"].endswith(" million")
        else:
            assert v["display_short"] == v["display"]


def test_the_route_refuses_what_the_release_does_not_hold(client, lahore):
    later = client.post(ROUTE, json=lahore_call(periods=["2026"]))
    assert later.status_code == 422
    body = later.json()
    assert body["error"] == "unknown_dimension_value" and "nothing later is held" in body["message"]
    assert body["detail"]["last_period"] == lahore["period"] and body["detail"]["first_period"] == lahore["first"]
    assert "fact_activity" not in body["message"]                # the sentence is shown to a reader as written
    for payload in ({"table": "fact_annual"}, {"table": "fact_activity_source_details"}, {}):
        refused = client.post(ROUTE, json=payload)
        assert refused.status_code == 422 and refused.json()["error"] == "unknown_dimension_value", payload
    assert client.post(ROUTE, json=lahore_call(location_level="city")).status_code == 422
    assert client.post(ROUTE, json=lahore_call(location_level="district")).status_code == 200


def test_the_same_request_gives_the_same_receipt(client):
    a = client.post(ROUTE, json=lahore_call(total=True)).json()
    b = client.post(ROUTE, json=lahore_call(total=True)).json()
    assert a["receipt"] == b["receipt"] and a["receipt"] != client.post(ROUTE, json=lahore_call()).json()["receipt"]


# --- the assistant's tool ----------------------------------------------------------------------

def test_the_tool_is_offered_and_describes_the_tables_from_the_release(ask_client):
    tools = {t["name"]: t for t in ask_client.app.state.ask.tools}
    tool = tools["query_activity"]
    schema = tool["input_schema"]["properties"]
    assert VEHICLES in schema["table"]["enum"] and "fact_activity_source_details" not in schema["table"]["enum"]
    assert "District" in schema["location_level"]["enum"]
    assert schema["total"]["type"] == "boolean"
    # the catalogue is read from the release: the table's own measures and classes, never remembered ones
    line = next(l for l in tool["description"].splitlines() if l.startswith(VEHICLES + ":"))
    assert REGISTERED in line and CARS in line and MOTORCYCLES in line and "District" in line
    assert "never convert a count into an emission" in tool["description"]


def test_the_prompt_carries_the_count_rule(ask_client, fake):
    fake.load([text("ok"), stop()])
    ask(ask_client, "hello")
    system = fake.calls[0]["system"]
    for phrase in ("A COUNT IS ANSWERED FROM THE ACTIVITY RECORDS", "THE PLACE IN THE QUESTION", "WINS",
                   "Never infer an emission from a count", "not traffic", "no later figure is held",
                   # the release labels the register's whole car class "Small cars"; the answer must not
                   "motor cars, jeeps and station wagons", 'never "small cars"'):
        assert phrase in system, phrase


# --- the six questions -------------------------------------------------------------------------

def test_how_many_cars_are_in_lahore(ask_client, fake, lahore):
    fake.load([tool_use("query_activity", lahore_call(categories=[CARS])), stop("tool_use")],
              [text("Lahore's register held {{result_1_cell_0}} {{result_1_cell_0.unit}} in the small-car class, "
                    "about {{result_1_cell_0.short}}. It is a registered stock, not the cars on the road."), stop()])
    events = ask(ask_client, "How many cars are in Lahore?", ui_state=ELSEWHERE)
    assert not only(events, "error") and not only(events, "refusal")
    result = only(events, "tool_result")[0]
    assert result["request_type"] == "query_activity" and result["n_values"] == 1
    # what the model was handed (ask/records.py): the count, and its date, source and qualification said once
    table = seen(fake)
    shared = table["shared"]
    assert (shared["Location"], shared["Vehicle class"], shared["Measure"]) == ("Lahore", CARS, REGISTERED)
    assert shared["Period"] == lahore["period"] and shared["Period type"] == "Snapshot date"
    assert shared["Source series"] and "not traffic" in table["notes"]["all rows"]
    assert table["columns"] == ["i", "Value"]
    assert Decimal(table["rows"][0][1]) == Decimal(lahore["rows"][CARS]["Value"])
    # ids and references are for the receipt and the reader's details, not for prose
    for key in ("Record ID", "record_id", "Source reference", "source_reference", "source_table", "source_row"):
        assert '"%s"' % key not in json.dumps(table)
    # what the reader got: the register's own figure, cited to its receipt
    answer = only(events, "answer")[0]
    cites = CITE.findall(answer["text"])
    assert cites[0] == ("1", "0", result["receipt"], grouped(lahore["rows"][CARS]["Value"]))
    assert cites[2][3].endswith(" million")
    # the place in the question won: the answer's scope is Lahore's record, and the map did not move
    scope = answer["scope"]
    assert scope["request_type"] == "query_activity" and scope["geography_ids"] == ["Lahore"]
    assert scope["periods"] == [lahore["period"]] and not scope["gwp_basis"] and not scope["configuration_id"]
    assert not only(events, "map_action")


def test_does_that_include_motorcycles(ask_client, fake, lahore):
    fake.load([tool_use("query_activity", lahore_call(categories=[CARS, MOTORCYCLES])), stop("tool_use")],
              [text("No. Motorcycles are their own class: {{result_1_cell_1.short}} against {{result_1_cell_0.short}} cars."), stop()])
    events = ask(ask_client, "Does that include motorcycles?", ui_state=ELSEWHERE)
    table = seen(fake)
    assert table["columns"] == ["i", "Vehicle class", "Value"]
    assert [r[1] for r in table["rows"]] == [CARS, MOTORCYCLES]               # two rows, never one
    assert table["shared"]["Period"] == lahore["period"]                      # one date, said once
    assert [Decimal(r[2]) for r in table["rows"]] == [Decimal(lahore["rows"][k]["Value"]) for k in (CARS, MOTORCYCLES)]
    assert only(events, "answer")[0]["text"].startswith("No.")


def test_how_many_vehicles_altogether(ask_client, fake, lahore):
    n = len(lahore["rows"])
    fake.load([tool_use("query_activity", lahore_call(total=True)), stop("tool_use")],
              [text("Altogether the classes held sum to {{result_1_cell_%d}} {{result_1_cell_%d.unit}}." % (n, n)), stop()])
    events = ask(ask_client, "How many vehicles altogether?", ui_state=ELSEWHERE)
    table = seen(fake)
    assert len(table["rows"]) == n
    expected = sum(Decimal(r["Value"]) for r in lahore["rows"].values())
    total = table["server_total"]
    assert Decimal(total["value"]) == expected and total["i"] == n
    assert "not a figure the source printed" in total["what"]
    # the reader's cells still carry the total's own record of what it summed
    cell = only(events, "tool_result")[0]["cells"][-1]
    assert cell["attrs"]["derived"] == "sum" and cell["attrs"]["period"] == lahore["period"]
    assert set(cell["attrs"]["classes_summed"].split("; ")) == set(lahore["rows"])
    assert CITE.findall(only(events, "answer")[0]["text"])[0][3] == grouped(expected)


def test_a_total_across_years_or_places_is_refused_not_added(ask_client, fake):
    fake.load([tool_use("query_activity", lahore_call(total=True, periods=["2022", "2023"])), stop("tool_use")],
              [text("A register is not summed across years."), stop()])
    events = ask(ask_client, "How many vehicles over the last two years?")
    refusal = only(events, "refusal")[0]
    assert refusal["error"] == "grain_unavailable" and "one period" in refusal["message"]
    assert not only(events, "tool_result")


def test_how_many_are_driving_today(ask_client, fake, lahore):
    fake.load([tool_use("query_activity", lahore_call(total=True)), stop("tool_use")],
              [text("That is not recorded. The register counts registrations, not traffic."), stop()])
    events = ask(ask_client, "How many are driving today?", ui_state=ELSEWHERE)
    note = seen(fake)["notes"]["all rows"]       # the qualification, said once for every row
    assert "not traffic" in note and "not an active fleet" in note
    assert only(events, "answer")


def test_what_is_the_2026_count(ask_client, fake, lahore):
    fake.load([tool_use("query_activity", lahore_call(periods=["2026"])), stop("tool_use")],
              [text("No count for that year is held; the newest register is the one already given."), stop()])
    events = ask(ask_client, "What is the 2026 count?", ui_state=ELSEWHERE)
    refusal = only(events, "refusal")[0]
    assert refusal["error"] == "unknown_dimension_value" and refusal["name"] == "query_activity"
    assert "nothing later is held" in refusal["message"] and "fact_activity" not in refusal["message"]
    assert refusal["detail"]["last_period"] == lahore["period"]
    # the model is told the span as an error result, which is its evidence for "no later figure is held"
    seen = fake.calls[1]["messages"][-1]["content"][0]
    assert seen["is_error"] is True and lahore["period"] in seen["content"]
    assert not only(events, "tool_result") and only(events, "answer")


def test_how_much_pollution_do_those_cars_produce(ask_client, fake, gate):
    """The server cannot stop a model reasoning badly, but with the bare-number gate on it can refuse to print
    a figure it did not compute. Since November 2026 the gate is off by default (the model writes its own
    figures) and the prompt is what keeps an emission from being inferred from a count."""
    fake.load([tool_use("query_activity", lahore_call(categories=[CARS])), stop("tool_use")],
              [text("Those cars emit about 3.4 Mt of CO2 a year."), stop()],
              [text("Those cars emit roughly 3.4 Mt."), stop()])
    events = ask(ask_client, "How much pollution do those cars produce?", ui_state=ELSEWHERE)
    # an inferred emission never reaches the reader: corrected once, then the answer is withheld
    assert not only(events, "answer")
    assert only(events, "error")[0]["code"] == "bare_numbers"
    assert len([d for d in only(events, "status") if d.get("phase") == "correction"]) == 1
    fake.load([tool_use("query_activity", lahore_call(categories=[CARS])), stop("tool_use")],
              [text("The register gives a count, not an emission. Turning one into the other needs the distance "
                    "each car drives or the fuel it burns, and an emission factor; none of that is in the register."), stop()])
    events = ask(ask_client, "How much pollution do those cars produce?", ui_state=ELSEWHERE)
    assert "needs the distance" in only(events, "answer")[0]["text"] and not only(events, "refusal")
