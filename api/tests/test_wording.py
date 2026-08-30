"""Refusal messages worded: the contract's message stays verbatim; message_worded beside it
names periods and configurations by the release's labels, never by their ids."""
import re

PREFIX = "/api/v1/emissions"


def test_refusal_carries_a_worded_message(client):
    r = client.post(PREFIX + "/query/emissions", json={"periods": ["FY2020-21"], "configuration_id": "S_2023_24"})
    assert r.status_code == 422, r.text
    body = r.json()
    assert "FY2023-24" in body["message"]                      # the contract's text, verbatim
    assert "FY" not in body["message_worded"]
    assert "2023\u201324" in body["message_worded"]
    assert not re.search(r"\b[SREF]+_2023_24\b", body["message_worded"])


def test_the_service_words_configuration_ids(client):
    service = client.app.state.service
    worded = service.word("configuration S exists for FY2023-24 only; REF_2023_24 is the reference")
    assert worded.startswith("the survey-based estimate exists for 2023\u201324 only")
    assert "REF_2023_24" not in worded and "the reference estimate" in worded
