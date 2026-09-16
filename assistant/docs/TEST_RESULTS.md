# Test record

## Backend

Executed on 14 September 2026 with Python 3.13.5, FastAPI 0.128.2, Pydantic 2.13.4, HTTPX 0.28.1, Uvicorn 0.48.0 and pytest 9.0.2.

`python -m pytest -q --disable-warnings`: **136 passed**. The captured output is `pytest-results.txt`. These are automated software tests, not independent verification of the science or a production security audit.

Coverage includes common educational wording and misspellings; selected gases; basic follow-up questions; source references and page ranges; live-query refusal when disconnected; fiscal/calendar and sector mismatches; explicit document conflicts; overlapping particulate fractions; prompt-injection-shaped inputs; schema/body-size validation; source-file path handling; rate limits; production content approval; canonical-context cache separation; absence of raw prompts in local state; atomic concurrent budget reservations; unknown-cost retention; idempotent settlement; billing circuit behaviour; provider output validation; model failures without retries; and exact pinned-export matching.

The educational evaluation script ran 14 demonstration questions with **zero model calls** and no connected numerical results. See `EXAMPLE_ANSWERS.json`. Source-file hash validation passed for all 17 supplied project documents. The library has 72 explanations and 269 index units: 268 PDF pages and the README.

The API was also started through Uvicorn locally; an HTTP health request and a Monte Carlo explanation request succeeded. The optional provider was **not called with a live key**. Its request construction and response/usage handling were exercised with mocks. The exact-inventory adapter was exercised with explicitly labelled test fixtures, not an actual rc54 semantic export.

## Interface

Chromium with Playwright 1.57.0 was used for an offline DOM/interaction harness. Browser requests were bridged to FastAPI's TestClient because direct browser navigation was blocked in this environment. The harness checked the initial interface, a Monte Carlo answer with expanded detail and citation display, selected CH4 context, visible IPPU conflict, the explanation-library dialog, and desktop/mobile horizontal overflow. It reported no JavaScript errors and no horizontal overflow at 1440px or 390px widths.

The rendered desktop, answer and mobile views were inspected. See `preview/` and `browser_results.json`. This was **not a deployed end-to-end networking/CSP test**. Actual HTTPS hosting, reverse-proxy behaviour, browser PDF navigation, cross-origin iframe embedding, authentication integration, CSP enforcement and full accessibility testing remain deployment checks.

The offline harness can be repeated after installing Playwright separately:

```bash
python -m pip install playwright
# Use an installed Chromium via CHROMIUM_PATH, or install Playwright's browser.
python scripts/browser_smoke.py
```

This optional script writes its screenshots/results to a temporary directory, not the source tree.

## Not exercised

No Docker image was built; the Dockerfile is supplied for integration review. No live provider call, public deployment, full inventory API connection, paid spend, repository push/tag, complete penetration test, exhaustive natural-language benchmark or independent validation of all source claims was performed. Production content remains pending owner review.
