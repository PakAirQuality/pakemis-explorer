"""A page load is a burst of queries at once, and the service has ONE database connection.

`Service.run` serialises the query core behind a lock because DuckDB's connection is not safe to
share between threads. On 2026-10-07 a second read was added to the same path - the per-period
unallocated block (unallocated.py), which queries the engine's connection - and it was added AFTER
the lock was released. Every province or district answer then ran a query on the shared connection
while another request's query could be running on it.

Nothing failed in the suite, which asks one question at a time. On the live site the default view
is the province map: the map's province query and the deck's national queries arrive together, and
some of them came back as HTTP 500 (the hosting proxy shows it as a 502). It was found a day later,
by a script that asked nine questions in parallel.

This is that burst. Written to FAIL before the read was moved inside the lock.
"""
import threading

PREFIX = "/api/v1/emissions"

BURST = [
    ("/query/emissions", {}),
    ("/query/emissions", {"group_by": ["reporting_sector"], "order_by": "value desc"}),
    ("/query/emissions", {"group_by": ["category"], "order_by": "value desc"}),
    ("/query/emissions", {"geography_level": "adm1", "group_by": ["province"], "order_by": "value desc"}),
    ("/query/emissions", {"geography_level": "adm1", "group_by": ["province"], "periods": ["FY2015-16"]}),
    ("/query/emissions", {"geography_level": "adm2", "group_by": ["province"]}),
    ("/query/emissions", {"group_by": ["gas"], "order_by": "value desc"}),
    ("/query/timeseries", {"query": {}, "step": "annual"}),
    ("/query/air", {"pollutants": ["PM2.5"], "periods": ["FY2023-24"], "group_by": ["sector_id"]}),
]


def test_a_burst_of_queries_is_answered_not_crashed(client):
    alone = {i: client.post(PREFIX + route, json=body).json() for i, (route, body) in enumerate(BURST)}
    failures, answers = [], {}
    start = threading.Barrier(len(BURST) * 4)

    def ask(i, route, body, turn):
        start.wait()
        try:
            r = client.post(PREFIX + route, json=body)
        except Exception as exc:  # an unhandled server error reaches the test client as a raise
            failures.append((i, turn, repr(exc)[:200]))
            return
        if r.status_code != 200:
            failures.append((i, turn, r.status_code, r.text[:200]))
        else:
            answers[(i, turn)] = r.json()

    threads = [threading.Thread(target=ask, args=(i, route, body, turn))
               for turn in range(4) for i, (route, body) in enumerate(BURST)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert failures == [], failures
    # and every answer given under load is the answer given alone: same cells, same receipt, and
    # the same unallocated block (the read that was racing)
    for (i, turn), env in answers.items():
        assert env["receipt"] == alone[i]["receipt"], (i, turn)
        assert env["values"] == alone[i]["values"], (i, turn)
        assert env["unallocated"] == alone[i]["unallocated"], (i, turn)
