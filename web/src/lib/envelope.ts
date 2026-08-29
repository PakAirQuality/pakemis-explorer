/**
 * The Envelope as pakemis_query returns it, validated with zod at the boundary.
 * The frontend never computes with it: `display` is printed, `value` is used only to size a
 * bar or shade a polygon, `exact` is shown on request, everything else is shown as received.
 */
import { z } from "zod";

export const CellSchema = z
  .object({
    exact: z.string(),
    value: z.number().nullable(),
    display: z.string(),
    unit: z.string(),
    result_row_ids: z.array(z.string()),
    formula: z.string(),
    group: z.record(z.string(), z.string().nullable()).optional(),
    n_rows: z.number().optional(),
    exact_high: z.string().optional(),
    exactness: z.string().optional(),
    /** The server's reading-precision rendering (release.rounding.presentation), beside `display`, never in its place. */
    display_short: z.string().optional(),
    /** The unit as words, per cell ("million tonnes CO₂e"; no GWP basis token). */
    unit_words: z.string().optional(),
    /** The unit as a reader sees it beside the number ("Mt CO₂e"; no GWP basis token). */
    unit_short: z.string().optional(),
  })
  .passthrough();

export const EnvelopeSchema = z
  .object({
    request_type: z.string(),
    request: z.string(),
    context: z
      .object({
        release: z.string(),
        version: z.string(),
        commit: z.string().nullable(),
        basis: z.string().nullable().optional(),
        periods: z.array(z.string()).nullable().optional(),
        configuration_id: z.string().nullable().optional(),
        gwp_basis: z.string().nullable().optional(),
        geography_level: z.string().nullable().optional(),
        geography_ids: z.array(z.string()).nullable().optional(),
        spatial_view: z.string().nullable().optional(),
        lulucf: z.object({ status: z.string(), notation_key: z.string(), note: z.string() }),
        defaults_applied: z.array(z.string()),
      })
      .passthrough(),
    values: z.array(CellSchema),
    calculation: z.record(z.string(), z.unknown()),
    provenance: z.record(z.string(), z.unknown()),
    uncertainty: z.record(z.string(), z.unknown()),
    evidence: z.record(z.string(), z.unknown()),
    unallocated: z.record(z.string(), z.unknown()),
    completeness: z.array(z.record(z.string(), z.unknown())),
    limitations_hit: z.array(z.record(z.string(), z.unknown())),
    citation: z.string(),
    result_sha256: z.string(),
    receipt: z.string(),
  })
  .passthrough();

export type Cell = z.infer<typeof CellSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * The value a reader sees by default: the server's `display_short` (the release's
 * rounding.presentation rule, derived from `exact` with ROUND_HALF_EVEN) when the cell carries
 * one, else the contract's `display`. The browser rounds nothing: both strings arrive in the
 * envelope, and `display` and `exact` stay visible in Result details and the table's
 * full-precision mode.
 */
export function shown(cell: { display: string | null; display_short?: string | null }): string {
  return cell.display_short ?? cell.display ?? "";
}

export const RefusalSchema = z.object({
  error: z.string(),
  error_class: z.string(),
  message: z.string(),
  limitation_id: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
});
export type Refusal = z.infer<typeof RefusalSchema>;

export const ReleaseSchema = z
  .object({
    api_version: z.string(),
    version: z.string(),
    release_id: z.string(),
    commit: z.string().nullable(),
    defaults: z.record(z.string(), z.unknown()),
    context_bar: z.object({
      release: z.string(),
      basis: z.string(),
      configuration_id: z.string(),
      gwp_basis: z.string(),
      geography_id: z.string(),
      reporting_period: z.object({ label: z.string(), start: z.string(), end: z.string() }).nullable(),
      lulucf: z.object({ status: z.string(), notation_key: z.string(), note: z.string() }),
      /** The same ids worded for a reader ("July–June years", "Reference estimate", "IPCC 2013 (AR5)"). */
      basis_label: z.string().optional(),
      configuration_label: z.string().optional(),
      gwp_label: z.string().optional(),
    }),
    dims: z.record(z.string(), z.unknown()),
    digests: z.object({
      semantic_release_json: z.string(),
      release_manifest_json: z.string(),
      tables: z.record(z.string(), z.string()),
      products: z.record(z.string(), z.string()),
    }),
    known_limitations: z.array(z.record(z.string(), z.unknown())),
    query_contract: z.record(z.string(), z.unknown()),
    licences: z.record(z.string(), z.unknown()),
    placeholders: z.record(z.string(), z.string()),
  })
  .passthrough();
export type ReleaseInfo = z.infer<typeof ReleaseSchema>;

/** A cell's label: its group values joined, or the request type. */
export function cellLabel(cell: Cell, fallback = "all"): string {
  const left = (cell as Record<string, unknown>).left as { group?: Record<string, string | null> } | undefined;
  const g = cell.group ?? left?.group ?? {};
  const parts = Object.values(g).filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.length ? parts.join(" · ") : fallback;
}
