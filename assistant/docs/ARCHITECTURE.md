# Architecture and boundaries

The runnable code has three non-overlapping roles: prepared content, a topic selector and a numerical-result adapter. It intentionally does not implement a general retrieval-augmented answer generator.

## Prepared content

`knowledge/cards.json` contains summaries, details, references, caveats, topics, common wording and optional source chains. Deterministic routing handles common aliases, spelling variants, gases, simple contextual references, source questions and basic follow-ups. Related-card scoring orders suggestions but is not an uncertainty estimate or calibrated confidence score.

Unrecognised questions return suggestions and raw document-search excerpts. Excerpts have explicit warnings and original-page links. The 269 index units comprise 268 PDF pages and the README. Text extraction is for retrieval; source tables and figures are not reinterpreted into canonical facts by the app.

## Optional model

The model receives only the current question, a short list of candidate descriptions and small topic context. It may output at most two allowed card IDs. Unknown IDs, extra answer fields and malformed responses are rejected. Public text is copied from prepared cards, never from the provider's prose. There are no model tools, autonomous iterations, retries, public browsing or inventory writes.

This restriction prevents newly generated factual numbers or prose, but does not prove that a selected card addresses a visitor's intent. Semantic misrouting is still possible. Evaluate unusual and adversarial phrasing before enabling the feature. The live provider interface was not exercised with credentials.

## Read-only numerical adapter

The supplied implementation serves owner-reviewed pre-rendered answers from a pinned export. It is not connected to a live inventory service and does not execute the underlying Monte Carlo. The integration bridge must obtain the canonical products and render values and explanations deterministically. Knowledge documentation and numerical export must match the same release.

Exact query keys include release, operation, view, boundary, sector, category, stream, geography, periods, month, metric, GWP, configuration, spatial view and language. No automatic period/metric substitution is permitted. No values from user text or parent-page messages can enter an answer.

## Cache and privacy

The shared cache contains prepared content keyed by validated public context, card IDs, depth, knowledge digest and adapter digest. It does not store visitor questions, conversation histories or private model-generated replies. There is no cache of arbitrary user prose. Cache storage is bounded at 2,000 entries.

A day's peer identifier is HMAC-derived with an operator secret. This is pseudonymous operational data, not a guarantee of anonymity. The local state ledger records admission/charged cost and this identifier, not prompts. Raw question strings are held transiently in request memory and in the browser conversation. Optional AI receives the current question with visitor consent. Proxy/CDN access logging and provider retention are outside this application's control and require separate configuration and disclosure.

## Deployment assumptions

One persistent Python service, a local writable state volume, and immutable reviewed source/content files. SQLite transactions protect concurrent admission on a single shared local database. Independent replicas with separate databases do not share the budget and are not supported for paid deployment.

The UI uses text nodes rather than model-authored HTML. Request schemas reject additional fields. Body size is limited before JSON parsing, API source downloads use an allowlist, production hides interactive API docs, and explicit origins control CORS and iframe ancestry. These are safeguards, not a completed penetration test, identity system or denial-of-service defence.

The optional API key never reaches the browser. No primary source or PDF is sent to a model during the local path; optional matching sends only the current question and short candidate summaries. There is no runtime URL-fetch tool, user-upload ingestion endpoint or arbitrary SQL/code path.
