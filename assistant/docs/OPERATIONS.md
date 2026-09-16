# Operating and funding the assistant

## Start at zero inference spend

The package defaults to `EF_ALLOW_PAID=0` and `EF_MONTHLY_BUDGET_USD=0`. No inference account is required for prepared answers or document search. A $25/month pilot was previously discussed as an example only; this package does not authorise or enable it.

Do not publish draft content without reviewing it. Confirm which supplied technical reports may be made public; they are served through the source library when the app is hosted.

## Production review gate

Run `python scripts/inspect_library.py` to obtain the current knowledge digest. Review `docs/KNOWLEDGE_REVIEW.md`, source pages, known conflicts, wording and the site's public-data policy. Then set:

```bash
export EF_PRODUCTION=1
export EF_STATE_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
export EF_REVIEWED_CONTENT_DIGEST="<digest of the reviewed knowledge files>"
export EF_STATE_PATH="/persistent/local/volume/assistant-state.sqlite3"
export EF_ALLOWED_ORIGINS="https://your-actual-site.example"
```

Replace the illustrative origin; do not use a wildcard. Production gate checks a digest supplied by the operator, not whether a human actually completed a review. When content changes, review the changes and update approval. Persist the secret and state database; do not regenerate them at each request or restart.

## Optional Gemini selector

Explicit owner approval for the chosen cap is required before enabling paid matching. Export variables in the service environment, not in client code:

```bash
export GEMINI_API_KEY="<server-side secret>"
export EF_ALLOW_PAID=1
export EF_MONTHLY_BUDGET_USD="<explicitly approved amount>"
```

The only enabled model adapter is `gemini-3.1-flash-lite`, with configured text-input/output rates of $0.25/$1.50 per million tokens, checked against Google's official pricing on 14 September 2026. Output accounting includes reported thinking tokens. Re-check prices, model availability and the provider's request/usage contract before enabling. Changing the model requires code, schema, pricing and budget-test review; request input cannot choose another model.

The provider call is bounded to one request, 20,000 input bytes, 512 output tokens and a 12-second client timeout; it has no retries or tools. A conservative $0.02 reservation is made before admission. On successful usage reporting it is reconciled against the calculated cost; unreported/failed/timed-out requests retain the reservation. A crash retains the reservation too. These numbers are engineering controls, not measured per-question cost or a legal billing guarantee.

The model only helps map unfamiliar questions to existing cards. A browser visitor must opt in; that choice is not authentication or proof that the caller is human. All direct prepared-card questions remain free of model calls, including after the model allowance is exhausted.

## Admission and budget safety

Amounts are integer millionths of a US dollar. SQLite `BEGIN IMMEDIATE` serialises reservation checks. Pending reservations count against the shared monthly allowance. Per-peer daily paid requests are limited to five; ordinary ask/search requests are limited to twenty per minute. These defaults are configured in `settings.py`.

This is local **admission accounting**, not an absolute guarantee about a third-party invoice. Provider prices, rounding, unexpected billing terms, concurrent calls already admitted and inaccurate usage metadata can affect final charges. An observed charge above its reservation opens a circuit breaker that rejects later paid requests. Keep a provider-side project spending limit and alert as an independent control.

Inspect `python scripts/inspect_library.py --budget`. Do not automatically refund unknown-cost reservations. Reconcile them against provider records. The circuit switch must only be reset by an operator after reconciliation, never through a public endpoint. Consider retaining billing records for a short documented operational period and aggregating/deleting older client identifiers under the site's privacy policy.

## Public abuse and proxy routing

CORS prevents certain browser reads; it does not prevent scripts, bots or distributed callers from spending an exposed public allowance. Deploy behind the site's normal gateway with TLS, request-size/time limits, burst and concurrent-connection limits, and risk-based challenge/authentication where appropriate. Keep basic definitions and the website's data tools available without requiring every visitor to register.

The standalone command disables access logging and forwarded-header trust. Search queries can appear in GET URLs, so keep URL/query logging disabled or appropriately redacted at the proxy as well. Behind a proxy, all clients otherwise appear to have the proxy's address; configure trusted proxy handling for specific proxy addresses, and ensure the proxy overwrites untrusted incoming forwarding headers. Do not blindly trust arbitrary `X-Forwarded-For`. Shared NAT users can share an IP quota; prefer existing authenticated identities for higher quotas.

The static PDFs and local search still consume infrastructure resources. Inference credits are only one cost. Use static asset caching/CDN where authorised, monitor bandwidth and disk growth, and set hosting limits.

## Hosting choices

A single small persistent Python deployment is the supported layout. The Dockerfile is supplied but was not built in this environment. Mount a writable `runtime/` volume for its non-root user. The source/content directories should be read-only to the running application. Start with one process; evaluate CPU/memory and source-index loading before adding workers.

On serverless platforms or multiple replicas, replace the state layer with one shared transactional budget store before allowing paid calls. A network filesystem is not a substitute for a properly shared transactional service. Never deploy one independent SQLite budget per replica.

## Unavailable provider or exhausted allowance

Return saved explanations and local source search. Show that optional language matching is unavailable. Do not break the site's map, filters, plots, data downloads or source pages. Do not silently switch to a different paid provider or more expensive model.

## Remaining production checks

Verify real domain routing, reverse-proxy paths, trusted client identity, TLS, CSP, cross-origin iframe policy, PDF links, cache headers, accessibility, mobile behaviour, secret storage and authorised model use on the actual hosting platform. Source-document editorial approval, full security testing and a representative natural-language evaluation remain necessary. No claim of production certification is made.
