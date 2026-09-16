# Integrate the evidence assistant into Emission Flow

## Objective

Add a read-only educational and evidence assistant to the existing application. The primary questions concern what emissions mean, why individual gases matter, the data sources and methods, patterns, uncertainty, and Monte Carlo. Do not turn the public interface into an autonomous research or inventory-writing agent.

Deliver the explanation interface first. Do not block that work on completing the inventory's coverage or resolving every paper inconsistency. Unsupported numerical/coverage questions must disclose what is unavailable.

## Preserve the existing inventory

Inspect the application's framework, existing API routes and the repository's actual semantic-query contract before changing anything. This package is a standalone FastAPI service, not a guessed patch for an unseen repository. Prefer integrating its prepared content and contracts into the existing backend rather than duplicating the emissions engine.

Use current generated products for values, categories, completeness and release status. Use approved technical notes for methods and caveats. Use the separately labelled general-science glossary for basic definitions. Use primary sources for underlying provenance. Document authority is per claim: a release catalogue can settle what ships, but cannot by itself prove scientific accuracy.

Do not copy numerical values from PDF paragraphs into a new assistant database and call them current inventory values. Do not recompute emissions in the language model. Do not append scenarios to baseline totals. Do not resolve contradictory documents by retrieval rank. Do not add all gases/particles together: overlapping particulate fractions and native gases versus CO₂e have distinct aggregation rules.

## Integrate the explanatory interface

Place “Ask about this” next to each chart, gas selector and evidence/uncertainty panel. Send the active release, reporting boundary, module or category, stream, geography, fiscal periods, month, metric, GWP, configuration and spatial view. The starter supports English only.

The `ViewContext` schema is in `examples/view-context.schema.json`. It is a new adapter contract. Map actual inventory codes to these fields explicitly, preserving the original IDs in the authoritative query receipt. `category_id` is separate from the broad `sector` field. A broad module is not an IPCC reporting category.

Initial requests to support well:

| Request | Route |
|---|---|
| What are emissions? Why are they important? | Prepared glossary |
| What is this gas? | Prepared glossary using selected metric |
| What is Monte Carlo? Why use it? | Prepared uncertainty explanation |
| What sources drive agriculture/power/waste? | Approved sector data-chain explanation |
| What data produced this result? | Source-to-stream query plus explanatory template |
| What happened between the selected years? | Canonical comparison result, evidence classes and limitations |
| What is this result's uncertainty? | Matching grain/configuration/metric uncertainty record |
| Is this category included? | Generated completeness/catalogue record, not a sector-note guess |

The prototype does not parse arbitrary natural-language analytical filters, rankings or multi-region comparison queries. Select them in the real UI or implement and test a typed query parser. The prototype's limited scope guards are not a comprehensive geographic/entity parser.

## Connect exact numerical answers

The shipped adapter reads `emission-flow/engine-answers/v1`, a pre-rendered, **read-only pinned export**. This is a low-risk first integration, not a claim that pkinv already exposes a function with that name. A later adapter may call the existing query service directly under the same validation constraints.

The documentation names the following useful products; inspect their actual schemas and release membership before coding against them:

- `outputs/pakemis_product_catalog.csv`, `outputs/pakemis_product_facts.csv` and the release manifest;
- `semantic/semantic_release.json`, canonical annual, monthly, ADM1/ADM2 and uncertainty/completeness/evidence facts and dimensions;
- `outputs/pakemis_source_register.csv` and `outputs/pakemis_source_streams.csv`;
- `outputs/national_uncertainty_montecarlo.csv`, `outputs/pakemis_trend_uncertainty.csv`, `outputs/pakemis_longitudinal_uncertainty.csv`, and the joint/common-ensemble products where applicable;
- current spatial/temporal profiles, air-pollutant coverage matrices, scenario registries and source hashes.

The exported answer must carry its exact context, operation (`value`, `pattern`, `uncertainty`, `provenance`, `coverage`), title, deterministic paragraphs, source references, limitations, result kind, and replayable query receipt. Every citation ID must exist in the assistant's source register. Extend that register with real primary-source records as necessary, never fabricated URLs. Updating the register changes the content hash and requires renewed review.

Use `examples/engine-answers.template.json` and `examples/engine-answer.schema.json`. The template has `synthetic=true` and is intentionally rejected by the production adapter. Populate it from real generated queries, record the reviewer, mark it non-synthetic only after verification, then compute the file SHA-256. Set all three:

```text
EF_ENGINE_SNAPSHOT=/absolute/path/to/engine-answers.json
EF_ENGINE_SNAPSHOT_SHA256=<SHA-256 of those exact bytes>
EF_ENGINE_MANIFEST_SHA256=<full SHA-256 of the matching inventory manifest>
```

The adapter matches every context field exactly, including the view and optional fields. An answer for annual national L/AR5 cannot answer district/monthly S/AR6. An unsupported context must be unavailable, not a narrower or older substitute. Add valid export entries for the supported views, or replace the adapter with an equivalent tested query-service bridge. Reload the service after changing an export; the existing instance never silently changes releases.

Do not manufacture a zero for NE/unavailable. Do not transfer a national interval to a district or borrow an annual interval for a trend. Trend distributions must come from the canonical paired-draw products. A named structural scenario must retain its scenario label and must not be averaged into a central estimate without a justified probabilistic model.

## Resolve the flagged documentation conflicts at the data boundary

The six initial cases are in `knowledge/conflicts.json`, with source pages and the required resolution product. Particularly important: national Table 4 lists ammonia/steel/lubricants while IPPU prose says those categories are unestimated. The public explanatory library flags this; the catalogue-backed coverage answer should establish what actually ships.

Do not silently edit the papers as part of the assistant integration. Resolve assistant claims using the authoritative generated product, and submit documentation changes separately with a source-linked review record.

## Keep costs controlled

Keep paid matching disabled at launch. Most requested educational questions already route locally. Only after testing unfamiliar wording should the owner decide whether paid routing is useful. The optional provider selects prepared IDs; it never produces the public answer. No embeddings service, web-search tool or autonomous loop is required.

The existing SQLite budget is for one persistent host, with shared local storage across workers. On a serverless/multi-replica platform, replace it with one transactional shared store before enabling paid access. Do not use a per-process counter or independent SQLite files: those multiply the intended allowance.

Protect model admission behind provider billing controls, global budget reservation, per-client rate controls, request/output limits and the site's existing abuse protections. CORS is not authentication. The prototype has no account system; use existing authenticated user IDs where available rather than inventing a second identity database.

## Acceptance criteria

Educational and methodological answers cite the correct source/page and remain available without a provider key. “This gas” follows the selected metric; CO₂e is not called a gas and PM₂.₅ is not called a gas. Monte Carlo samples are not described as measurements; source assumptions and scientific uncertainty remain visible.

Every displayed number matches the canonical selected query, metric, geography, time basis, boundary and scenario. Citation IDs and pages exist. All unresolved queries fail explicitly; source conflicts cannot be silently bypassed. Model output cannot change public factual prose or numerical results. Exhausting the inference allowance leaves the core map, filters, downloads, saved explanations and source search available.

Run the included backend tests, then add repository-specific query fixtures. Test the actual hosted UI for CSP, proxy routing, cross-origin embedding, keyboard navigation and mobile layout. Test an explicitly authorised small live-provider sample separately; the supplied provider tests use mocks only. Review wording for the intended public audience before setting the production content digest.

No push, tag, paid enablement or external deployment is authorised merely by this handoff. Perform only the deployment/write actions the owner has separately requested.
