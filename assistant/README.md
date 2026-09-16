# Emission Flow evidence assistant

A runnable, local-first educational assistant for the PakEmis **1.0.0rc54** documentation. It explains emissions, gases and particles, sources, methods, patterns, and uncertainty. It does not change the inventory.

**Included:** 72 prepared explanations; 16 supplied PDFs (268 PDF pages) plus the supplied README; 13 separate general-science source references; page-linked citations; local document search; six documented conflict records; a responsive interface and embeddable widget; a pinned numerical-result integration contract; an optional, budget-controlled Gemini topic selector.

**Default inference bill: $0.** Prepared explanations, local matching, document search and cached responses make no model calls. Hosting, storage and bandwidth are still costs. This is a code delivery, not a deployed service. The numerical adapter is disconnected, and the drafted educational content requires owner review before public release.

## Run locally

Python 3.11 or newer is the intended target; the delivered tests were executed on Python 3.13. Create a virtual environment from this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn emissionflow.app:create_app --factory --host 127.0.0.1 --port 8000 --no-proxy-headers --no-access-log
```

Open `http://127.0.0.1:8000`. Windows activation: `.venv\Scripts\activate`.
No API key, database server, vector service or GPU is needed. A small local SQLite file is created in `runtime/`. The `.env.example` is documentation: this application does not load dotenv files automatically. Set environment variables explicitly.

## Try these questions

“What are emissions?” • “Why do emissions matter?” • “What is methane?” • “What is this gas?” • “What sources do you have for agriculture?” • “What is Monte Carlo?” • “Why do this?” after the Monte Carlo answer • “Give a Monte Carlo example” • “What data are behind this?” • “Is ammonia included?”

Each prepared answer has a short explanation, a fuller explanation, references and relevant caveats. The gas selector supplies the meaning of “this gas.” CO₂e is explained as a comparison metric, not as a gas. The interface separates gases from particles and source emissions from exposure.

Unmatched questions return related cards and explicitly labelled search excerpts, not an invented synthesis. This first version is deliberately not a general-purpose chatbot. It does not yet support multilingual conversations, arbitrary analytical queries, arbitrary document uploads or unrestricted web research.

## Three answer paths

1. **Prepared explanation:** deterministic topic matching and source-linked content. No inference call.
2. **Optional topic selection:** one bounded model call may select up to two existing explanation IDs. It cannot author public factual prose, invent a value, call tools or choose a new scenario. Disabled by default and requires visitor consent.
3. **Selected-view result:** an exact match against an owner-reviewed, hash-pinned inventory export. No numerical export is supplied here. Unsupported requests stay unavailable rather than falling back to a different year, boundary, gas or geography.

The document search index is for finding evidence. It is not the source of current numerical facts. PDF extraction can misread a table; the original page is linked. The release catalogue/fact tables must resolve current product availability and values.

## Integrate with the existing website

Read **AGENT_HANDOFF.md** first. The existing website repository, deployment environment and live semantic tables were not supplied. This package therefore does not patch or deploy your website.

The backend is framework-independent. A React/Next/Vue application can call `POST /api/ask` through a same-origin proxy, or use `web/widget.js` to embed this interface. Keep the API credential on the server and share the current, validated filter context rather than scraped chart text.

Example request:

```json
{
  "question": "What is this gas?",
  "depth": "simple",
  "context": {
    "release_id": "1.0.0rc54",
    "view": "map",
    "boundary": "ipcc",
    "sector": "agriculture",
    "metric": "CH4",
    "gwp": "AR5",
    "geography_id": "PK",
    "start_period": "FY2023-24",
    "end_period": "FY2023-24",
    "configuration": "L",
    "spatial_view": "combined",
    "language": "en"
  }
}
```

The demo geography identifiers are adapter identifiers, **not claims about the existing inventory's identifiers**. Translate from the project's actual dimensions when integrating. The same applies to the configuration and boundary fields. No client-supplied emissions value is accepted.

## Tests and evaluation

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
python scripts/evaluate.py
python scripts/inspect_library.py
```

See `docs/TEST_RESULTS.md` for the tested environment and remaining deployment checks. The optional provider is covered with mocked HTTP responses; no credential-backed provider call was made. No live inventory connection or hosted deployment was tested.

## Public release and spending

Do not treat local startup as approval for public hosting. Review `docs/CONTENT_REVIEW.md`, the draft answers in `docs/KNOWLEDGE_REVIEW.md`, and `docs/OPERATIONS.md`. After review, production startup requires a content digest approval and a unique secret. This gate records approval; it does not perform the scientific review itself.

Optional model configuration is described in `docs/OPERATIONS.md`. You can leave it disabled permanently. The $25/month number discussed during design was an illustration, not an approved budget, and is **not enabled** here.

## Package contents

| Path | Role |
|---|---|
| `emissionflow/` | API, context validation, routing, source lookup, cache, spending admission and pinned export adapter |
| `web/` | Responsive interface and framework-independent embed |
| `knowledge/cards.json` | Editable prepared explanations and their citations |
| `knowledge/pages.jsonl` | Local search index; not a canonical numerical database |
| `knowledge/sources.json` | Source identities, file hashes and general-science URLs |
| `knowledge/conflicts.json` | Known documentation conflicts and required resolution evidence |
| `sources/` | Exact supplied project documents under stable local filenames |
| `examples/` | Context, schemas, export template and embed example |
| `tests/` | Deterministic routing, scientific-boundary, API, adapter and budget tests |
| `docs/` | Integration, review, operating and test records |

No repository push, tag, remote upload, paid call or inventory modification was performed.
