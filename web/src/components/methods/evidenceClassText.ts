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

/**
 * The public sector page's wording of each class: no codes, ordinary words, still keyed by
 * the classes the release itself assigns. The composer sentences follow the mockup's
 * register ("Based mainly on published national statistics.").
 */
const PLAIN: Record<string, string> = {
  E1: "measured or metered records",
  E2: "published national statistics",
  E3: "figures derived from published statistics",
  E4: "estimates using related data",
  T1: "monthly records",
  T2: "monthly administrative records",
  T3: "seasonal patterns",
  T4: "limited monthly evidence",
  S1: "measured locations",
  S2: "facility records",
  S3: "provincial statistics and census data",
  S4: "no location data yet",
  NA: "",
};

function plainList(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const w = PLAIN[id];
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

/** One plain sentence per axis, from the classes the release assigns to the sector's sources. */
export function plainGlance(axis: EvidenceAxis, ids: string[]): string {
  const words = plainList(ids);
  if (!words.length) return "Not yet graded for this sector.";
  if (axis === "E") return `Based mainly on ${joinWords(words)}.`;
  if (axis === "TE") {
    const monthly = words.some((w) => w.includes("monthly records") || w.includes("administrative"));
    const seasonal = words.some((w) => w === "seasonal patterns" || w === "limited monthly evidence");
    if (monthly && seasonal) return "Monthly records are used where available. Seasonal patterns are used where monthly data are missing.";
    if (monthly) return "Based on monthly records.";
    return "Based on seasonal patterns where monthly data are missing.";
  }
  return `${joinWords(words).charAt(0).toUpperCase()}${joinWords(words).slice(1)} are used to place the estimates.`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
}


/**
 * The allocation surfaces, in words.
 *
 * THE RELEASE HAS NO TABLE FOR THESE. There is no `dim_allocation_surface`, nothing in
 * /release.labels, and the only existing treatment is `String(value).replace(/_/g, " ")` in the
 * claim record — which prints "builtup" and "flare points+uniform fallback". These are the 21
 * distinct values in fact_evidence; the compounds are `primary+fallback`, so they split on "+".
 */
const SURFACE_WORDS: Record<string, string> = {
  road_density: "road density",
  builtup: "built-up area",
  population: "population",
  cropland: "cropland",
  glw_livestock: "livestock density",
  manure_applied: "manure application",
  spam_rice: "rice area",
  firms_fire: "detected fires",
  uniform: "an even spread",
  none: "",
  flare_points: "flare locations",
  grid_station_points: "grid station locations",
  rail_yard_points: "rail yard locations",
  rail_network_line_density: "rail network density",
  ippu_register_points: "industrial plant locations",
  brick_kiln_points: "brick kiln locations",
  captive_register_points: "captive plant locations",
  airport_points: "airport locations",
  lng_terminal_points: "LNG terminal locations",
  wwtp_points: "treatment plant locations",
  waste_site_points: "waste site locations",
  uniform_fallback: "an even spread where none is known",
  builtup_fallback: "built-up area where none is known",
  population_fallback: "population where none is known",
};

/** "road density", "flare locations, then an even spread where none is known"; "" when unknown. */
export function allocationSurfaceWords(surface: string | null | undefined): string {
  const raw = (surface ?? "").trim();
  if (!raw) return "";
  const parts = raw.split("+").map((p) => SURFACE_WORDS[p] ?? "").filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]}, then ${parts.slice(1).join(", ")}`;
}
