/**
 * The known spatial exceptions, derived from the release's own registers and never typed:
 * dim_geography (rows without a polygon; shapes several census units share; the territories
 * carried as the 'Other' province row) and known_limitations (the no-polygon rule, the
 * bounded CH₄ modules, the ADM2 gas basis). The exceptions layer draws what has a polygon and
 * lists everything, each item with the register's own wording.
 */
import type { Adm2Row } from "@/lib/release";
import type { Residual } from "@/lib/geography";
import { joinNames } from "@/lib/geography";
import type { Dims } from "@/components/ExplorerContext";
import type { ReleaseInfo } from "@/lib/envelope";

export type ExceptionIndex = {
  /** ADM2 shape ids drawn once for several census units. */
  sharedShapes: Set<string>;
  /** ADM2 shape ids of the territories under the residual province row. */
  otherShapes: Set<string>;
  sharedGroups: { shape_id: string; shape_name: string; rows: Adm2Row[] }[];
  noPolygon: Adm2Row[];
  otherRows: Adm2Row[];
};

export function exceptionIndex(dims: Dims, residualName: string | null): ExceptionIndex {
  const byShape = new Map<string, Adm2Row[]>();
  for (const r of dims.adm2) {
    if (!r.shape_id) continue;
    const list = byShape.get(r.shape_id) ?? [];
    list.push(r);
    byShape.set(r.shape_id, list);
  }
  const sharedGroups = Array.from(byShape.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([shape_id, rows]) => ({ shape_id, shape_name: rows[0].shape_name || rows[0].name, rows }))
    .sort((a, b) => b.rows.length - a.rows.length || a.shape_name.localeCompare(b.shape_name));
  const otherRows = residualName ? dims.adm2.filter((r) => r.parent_id === `ADM1:${residualName}` && r.shape_id) : [];
  return {
    sharedShapes: new Set(sharedGroups.map((g) => g.shape_id)),
    otherShapes: new Set(otherRows.map((r) => r.shape_id)),
    sharedGroups,
    noPolygon: dims.adm2.filter((r) => r.has_polygon !== "yes"),
    otherRows,
  };
}

export type ExceptionItem = { kind: string; title: string; detail: string; source: string };

type Limitation = { id?: unknown; message?: unknown; scope?: unknown };

function limitation(release: ReleaseInfo, id: string): Limitation | undefined {
  return (release.known_limitations as Limitation[]).find((l) => l.id === id);
}

/** A dim_geography note block, whatever its shape (`notes` as a record, a list of rows, or absent). */
export function geographyNotes(release: ReleaseInfo): { name: string; note: string }[] {
  const g = (release.dims as Record<string, unknown>).dim_geography as Record<string, unknown> | undefined;
  const raw = g?.notes;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((r) => (typeof r === "string" ? { name: "", note: r } : { name: String((r as Record<string, unknown>).name ?? (r as Record<string, unknown>).geography_id ?? ""), note: String((r as Record<string, unknown>).note ?? "") })).filter((r) => r.note);
  if (typeof raw === "object") return Object.entries(raw as Record<string, unknown>).map(([name, note]) => ({ name, note: String(note) }));
  return [];
}

/** The side list of the exceptions layer, each item from a register row or a limitation. */
export function exceptionItems(release: ReleaseInfo, ex: ExceptionIndex, residual: Residual | null): ExceptionItem[] {
  const items: ExceptionItem[] = [];
  const noPoly = limitation(release, "no_polygon_units");
  if (residual) items.push({ kind: "other_unit", title: `Shared '${residual.name}' cell`, detail: `${joinNames(residual.members)} are carried as one province row; the map paints that one cell on each and outlines them together.`, source: "dim_geography" });
  for (const r of ex.noPolygon) {
    const active = r.status === "active";
    items.push({ kind: "no_polygon", title: `${r.name} · no polygon`, detail: active ? `an active ${r.unit_kind.replace(/_/g, " ")} the boundary file does not draw (the distributor's shape is missing); its rows stay at ${r.parent_id.replace(/^ADM1:/, "")} level as shape_missing.` : `${r.unit_kind.replace(/_/g, " ")} (${r.status}) with no geometry; its mass is carried at ${r.parent_id.replace(/^ADM1:/, "")} level.`, source: noPoly ? `known_limitations · ${String(noPoly.id)}` : "dim_geography" });
  }
  for (const g of ex.sharedGroups) items.push({ kind: "shared_shape", title: `${g.shape_name} · one shape for ${g.rows.length} units`, detail: `${g.rows.map((r) => r.name).join(", ")} draw one polygon; the district cell is their sum (shared_shape).`, source: "dim_geography" });
  const bounded = limitation(release, "adm2_co2e_bounded_power_residential");
  if (bounded) items.push({ kind: "bounded", title: "Bounded CH₄ modules: power, residential", detail: String(bounded.message), source: `known_limitations · ${String(bounded.id)}` });
  const ar6 = limitation(release, "ar6_adm2_ne");
  if (ar6) items.push({ kind: "basis", title: "AR6 not carried at district level", detail: String(ar6.message), source: `known_limitations · ${String(ar6.id)}` });
  if (noPoly) items.push({ kind: "rule", title: "Rows without geometry", detail: String(noPoly.message), source: `known_limitations · ${String(noPoly.id)}` });
  for (const n of geographyNotes(release)) items.push({ kind: "note", title: n.name || "Geography note", detail: n.note, source: "dim_geography · notes" });
  return items;
}
