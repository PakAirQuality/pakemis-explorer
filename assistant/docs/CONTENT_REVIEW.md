# Documentation conflict review

These are explicitly identified conflicts, not automatically repaired source text. They must be resolved by the matching generated products or by a documented editorial decision. The raw document-search index preserves the original statements.

## ippu_activation
National Table 4 lists ammonia, steel and lubricant estimates; prose still marks those categories NE.

Required resolution: Generated product catalogue, fact_annual and completeness records from the same release.

Behaviour: block_current_scope.

Source locations:
- National data-description article: page(s) 10, 11, 12, 16.
- TN07 · Industrial processes and product use: page(s) 1, 5.

## uncertainty_centre
Printed about-median/about-reference percentage summaries differ across prose and Table 6. Do not silently repair or pool them.

Required resolution: Original generated uncertainty CSV, percentile endpoints, centre definition and release receipt.

Behaviour: block_derived_percentage.

Source locations:
- National data-description article: page(s) 34, 37.

## road_air_scope
Older diagnostic/exhaust-only prose conflicts with later factor and panel descriptions covering wear and evaporation.

Required resolution: Activated air atoms and coverage matrix.

Behaviour: block_current_scope.

Source locations:
- TN03 · Road and off-road transport: page(s) 2, 4.
- Transport supplementary methods: page(s) 6, 7.
- National supplement: page(s) 2, 4.

## industry_air_status
An industry screening is described while Table S1 says no industry layer. Screening is not a covered estimate.

Required resolution: Air coverage matrix and separate screening catalogue.

Behaviour: block_current_scope.

Source locations:
- National supplement: page(s) 2, 3.

## agriculture_frame
README and sector prose use different district counts; release-frame, native-frame and residual semantics need explicit reconciliation.

Required resolution: Product catalogue and geography dimension; do not pool district denominators.

Behaviour: block_coverage_denominator.

Source locations:
- TN01 · Agriculture: page(s) 1, 3.
- Technical-note collection README: page(s) 1.

## spatial_status
Narrative summaries and spatial-profile tables do not uniformly use current per-stream allocation classes.

Required resolution: Per-stream spatial profile and placement_status, not a prose-derived completeness percentage.

Behaviour: block_current_scope.

Source locations:
- National data-description article: page(s) 47.
- National supplement: page(s) 8, 9.

## Review procedure

Verify current facts against the release catalogue and source-to-stream evidence. For each changed card, record reviewer, date, underlying source, claim scope and the evidence decision. The approval must distinguish documented methods from current numerical values. Re-run tests and export the new knowledge digest. Do not set the production approval to an unreviewed digest just to remove the preview label.

The draft cards intentionally do not repeat numerical claims whose centre, scope or current activation is unresolved. Ordinary gas definitions remain usable while those narrower conflicts are resolved.
