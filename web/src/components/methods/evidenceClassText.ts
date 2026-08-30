/**
 * The evidence-class definitions, quoted verbatim from the release's dim_evidence_class table
 * (data/releases/<version>/outputs/semantic/dim_evidence_class.csv: class_id, axis, definition).
 * /release.dims exposes the table's shape only, so the wording is mirrored here; the digest of
 * the table is under /release.digests.tables.dim_evidence_class. Three axes: E (activity
 * evidence), TE (timing), S (placement).
 */
export type EvidenceAxis = "E" | "TE" | "S";

export const EVIDENCE_CLASS_TEXT: Record<string, { axis: EvidenceAxis; definition: string }> = {
  E1: { axis: "E", definition: "measured or metered quantity for this source and period" },
  E2: { axis: "E", definition: "published statistic for this source and period, not independently verified" },
  E3: { axis: "E", definition: "derived from a related published quantity (a share, a ratio, a balance)" },
  E4: { axis: "E", definition: "declared judgement or default, with no quantity specific to this source" },
  NA: { axis: "S", definition: "no sub-provincial placement: controlled at ADM1 and retained there, not spread" },
  S1: { axis: "S", definition: "native source geometry (facility coordinate, network segment, trajectory)" },
  S2: { axis: "S", definition: "facility or network proxy without per-object activity" },
  S3: { axis: "S", definition: "administrative statistic (provincial sales, registrations, census counts)" },
  S4: { axis: "S", definition: "population or area fallback with no source-specific basis" },
  T1: { axis: "TE", definition: "observed monthly activity for this source and year" },
  T2: { axis: "TE", definition: "reconstructed from cumulative or related monthly administrative records" },
  T3: { axis: "TE", definition: "process-based seasonal profile (degree days, crop calendar, fire counts)" },
  T4: { axis: "TE", definition: "flat or weakly-informed profile; no monthly evidence for this source" },
};

/** The axis names a reader sees. */
export const AXIS_LABEL: Record<EvidenceAxis, string> = { E: "Annual activity", TE: "Monthly timing", S: "Spatial placement" };

/** "E2 — published statistic for this source and period, not independently verified"; a class the table does not define prints as itself. */
export function evidenceClassText(id: string): string {
  const d = EVIDENCE_CLASS_TEXT[id];
  return d ? `${id} — ${d.definition}` : id;
}
