"use client";
/**
 * The claim record (`GET /claim`): the structured evidence behind one number. Validated
 * loosely with zod at the boundary (the sections are the API's own objects and rows; the web
 * reads them as received and computes nothing), typed for the record's renderer, with the
 * permalink form the Methods page uses (`?claim=<receipt>:<cell>`) and the section helpers
 * that decide whether a block has data or says "Not carried by this release".
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fetchClaim, type ClaimSelector } from "./api";
import { districtName, gasLabel, geographyName, periodShort, sectorLabel, type Dims } from "./labels";
import type { Labels } from "./release";

export type { ClaimSelector } from "./api";

const Str = z.string().nullable().optional();
const Row = z.record(z.string(), z.unknown());

export const BreadcrumbSchema = z.object({ level: z.string(), id: z.string().nullable(), label: z.string(), n: z.number().nullable().optional(), ids: z.array(z.string()).nullable().optional() }).passthrough();

export const ReportedSchema = z
  .object({
    display: Str,
    display_short: Str,
    exact: Str,
    exact_high: Str,
    unit: Str,
    unit_short: Str,
    unit_words: Str,
    exactness: Str,
    interpretation: Str,
    n_rows: z.number().nullable().optional(),
    gwp: z.object({ basis: Str, label: Str, factors: z.record(z.string(), z.unknown()).nullable().optional() }).passthrough().nullable().optional(),
    configuration: z.object({ id: Str, label: Str, letter: Str }).passthrough().nullable().optional(),
    period: z.object({ ids: z.array(z.string()).nullable().optional(), labels: z.array(z.string()).nullable().optional(), months: z.array(z.string()).nullable().optional(), basis: Str }).passthrough().nullable().optional(),
    geography: z.object({ level: Str, ids: z.array(z.string()).nullable().optional(), spatial_view: Str }).passthrough().nullable().optional(),
    release: z.object({ release: Str, version: Str, commit: Str }).passthrough().nullable().optional(),
    request_type: Str,
  })
  .passthrough();

export const MissingSchema = z.object({ section: z.string(), message: z.string() }).passthrough();

export const ClaimSchema = z
  .object({
    selector: z.object({ receipt: Str, cell: z.number().nullable().optional(), row_ids: z.array(z.string()).nullable().optional() }).passthrough().nullable().optional(),
    breadcrumb: z.array(BreadcrumbSchema),
    reported: ReportedSchema.nullable().optional(),
    calculation: Row.nullable().optional(),
    activity: z.array(Row).nullable().optional(),
    emission_factors: z.array(Row).nullable().optional(),
    method: z.array(Row).nullable().optional(),
    monthly_basis: Row.nullable().optional(),
    spatial_basis: Row.nullable().optional(),
    uncertainty: z.array(Row).nullable().optional(),
    sources: z.array(Row).nullable().optional(),
    validation: z.array(Row).nullable().optional(),
    limitations: z.array(Row).nullable().optional(),
    completeness: Row.nullable().optional(),
    rows: Row.nullable().optional(),
    class_definitions: z.record(z.string(), z.string()).nullable().optional(),
    provenance: z.array(Row).nullable().optional(),
    missing: z.array(MissingSchema).nullable().optional(),
    release: z.object({ release: Str, version: Str, commit: Str }).passthrough().nullable().optional(),
  })
  .passthrough();

export type Breadcrumb = z.infer<typeof BreadcrumbSchema>;
export type Reported = z.infer<typeof ReportedSchema>;
export type ClaimRow = z.infer<typeof Row>;
export type Claim = z.infer<typeof ClaimSchema>;

/** The sections of the record, in the order the page shows them; each maps to the API's key(s). */
export const CLAIM_SECTIONS = [
  { id: "reported", title: "Reported estimate" },
  { id: "calculation", title: "Calculation" },
  { id: "activity", title: "Activity data" },
  { id: "emission_factors", title: "Emission factors" },
  { id: "monthly_basis", title: "Monthly allocation basis" },
  { id: "spatial_basis", title: "Spatial allocation basis" },
  { id: "uncertainty", title: "Uncertainty" },
  { id: "sources", title: "Source documents and pages" },
  { id: "validation", title: "Validation tests" },
  { id: "limitations", title: "Known limitation" },
  { id: "rows", title: "Exact machine-readable rows" },
] as const;
export type ClaimSectionId = (typeof CLAIM_SECTIONS)[number]["id"];

export const NOT_CARRIED = "Not carried by this release";

/** The API's message for a section named in `missing` (exact key, or a dotted sub-key such as `sources.pages`), else "". */
export function missingMessage(claim: Pick<Claim, "missing">, section: string): string {
  return (claim.missing ?? []).find((m) => m.section === section)?.message ?? "";
}

/** Whether a section carries data: a non-empty array, an object with at least one non-null field, or a string. */
export function hasData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));
  return String(value).length > 0;
}

export type SectionState = { kind: "data" } | { kind: "missing"; message: string };

/** A section's state: data, or missing with the API's message (the section's entry in `missing`, else the sentence alone). */
export function sectionState(claim: Claim, section: ClaimSectionId): SectionState {
  const named = missingMessage(claim, section);
  if (named) return { kind: "missing", message: named };
  const value = section === "limitations" ? [...(claim.limitations ?? []), ...(hasData(claim.completeness) ? [claim.completeness] : [])] : claim[section];
  return hasData(value) ? { kind: "data" } : { kind: "missing", message: "" };
}

/** `receipt:cell` — the `?claim=` form the Methods page reopens. */
export function claimParam(selector: { receipt: string; cell: number }): string {
  return `${selector.receipt}:${selector.cell}`;
}
export function parseClaimParam(value: string | null | undefined): { receipt: string; cell: number } | null {
  if (!value) return null;
  const m = /^([0-9a-f]{32}):(\d+)$/i.exec(value.trim());
  return m ? { receipt: m[1].toLowerCase(), cell: Number(m[2]) } : null;
}
export function claimHref(selector: { receipt: string; cell: number }): string {
  return `/methods/evidence?claim=${encodeURIComponent(claimParam(selector))}`;
}

export async function loadClaim(selector: ClaimSelector): Promise<Claim> {
  return ClaimSchema.parse(await fetchClaim(selector));
}

export function useClaim(selector: ClaimSelector | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["claim", selector], queryFn: () => loadClaim(selector!), enabled: enabled && !!selector, retry: false, staleTime: 5 * 60 * 1000 });
}

/**
 * A breadcrumb item's label as a reader sees it: the API's own label, re-read through the
 * release's labels when it is still the id (a sector id, a gas id, a period id, a geography
 * id); a level spanning several values keeps the API's "All categories" wording.
 */
export function crumbLabel(labels: Labels, dims: Dims, crumb: Breadcrumb): string {
  const { level, id, label } = crumb;
  if (id === null || id === undefined) return label;
  if (label && label !== id) return label;
  switch (level) {
    case "sector":
      return sectorLabel(labels, id);
    case "gas":
      return gasLabel(labels, id);
    case "period":
      return periodShort(labels, id);
    case "geography": {
      if (id === "PK") return "Pakistan";
      const bare = id.replace(/^ADM[12]:/, "");
      const named = geographyName(labels, bare);
      if (named !== bare) return named;
      return dims.adm2.some((r) => r.shape_id === bare) ? districtName(dims, bare) : bare;
    }
    default:
      return label || id;
  }
}

/** "Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24". */
export function breadcrumbText(labels: Labels, dims: Dims, claim: Pick<Claim, "breadcrumb">): string {
  return claim.breadcrumb.map((c) => crumbLabel(labels, dims, c)).join(" → ");
}

/** Line breaks before the SQL clauses so the statement reads; no token is changed. */
export function formatSql(sql: string): string {
  return sql.replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|JOIN|UNION ALL|UNION|WITH|SELECT)\b/g, "\n$1").replace(/\s+(AND|OR)\b/g, "\n  $1").trim();
}

/** A record's `rows.records` as strings: the API sends every field as text; anything else is printed as it is. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(cellText).join("; ");
  return JSON.stringify(v);
}

/** A row's field as text, "" when absent. */
export function field(row: ClaimRow | null | undefined, key: string): string {
  return row ? cellText(row[key]) : "";
}

/** A row's field as an array of rows, [] when absent. */
export function rowsOf(row: ClaimRow | null | undefined, key: string): ClaimRow[] {
  const v = row?.[key];
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as ClaimRow[]) : [];
}

/** A row's nested object, null when absent. */
export function objOf(row: ClaimRow | null | undefined, key: string): ClaimRow | null {
  const v = row?.[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as ClaimRow) : null;
}

/** A row's list-of-strings field, [] when absent (a ';'-joined string is split). */
export function listOf(row: ClaimRow | null | undefined, key: string): string[] {
  const v = row?.[key];
  if (Array.isArray(v)) return v.map(cellText).filter(Boolean);
  if (typeof v === "string") return v.split(";").map((s) => s.trim()).filter(Boolean);
  return [];
}
