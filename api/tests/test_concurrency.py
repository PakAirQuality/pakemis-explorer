"""Parallel requests through the one-engine process: FastAPI runs sync handlers on a threadpool,
and a DuckDB connection under concurrent use hung the first browser session (five POSTs at
once). The service serialises engine work; this test would hang or crash without that lock."""
import concurrent.futures


def test_parallel_posts_complete(client):
    bodies = [{"periods": ["FY2023-24"], "group_by": ["sector_id"], "limit": i + 1} for i in range(8)]
    bodies += [{"periods": ["FY2023-24"], "geography_level": "adm1"}, {"periods": ["FY2023-24"], "configuration_id": "S_2023_24"}]
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda b: client.post("/api/v1/emissions/query/emissions", json=b, timeout=60), bodies))
    assert [r.status_code for r in results] == [200] * len(bodies)
    receipts = [r.json()["receipt"] for r in results]
    # the same bodies again, serially, give the same receipts: no cross-talk between requests
    again = [client.post("/api/v1/emissions/query/emissions", json=b).json()["receipt"] for b in bodies]
    assert receipts == again
