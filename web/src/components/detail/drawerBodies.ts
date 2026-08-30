/**
 * The selection drawer's requests, a pure function of the URL state: the selection kind
 * (Pakistan when nothing is selected; a province; a district; a grid cell), the total, the
 * one-key sector breakdown (`sector_id` at national grain, `module` at ADM grain — the release
 * carries sector_id nationally only), the spatial-view breakdown at ADM grain, the annual
 * series (refused by the release off the national scope, shown by name), the lineage at ADM
 * grain and the province envelope whose `derived` carries the placed / unallocated strings.
 */
import type { QueryEmissions, TimeseriesRequest } from "@/lib/api";
import { adm1Body, detailBodies, gridCellBody, scopeBody, seriesBody, type LineageRequest } from "@/lib/requests";
import type { ExplorerState } from "@/lib/urlState";
import type { GridCellRequest } from "@/lib/api";

export type Selection = { kind: "national" } | { kind: "province"; id: string } | { kind: "district"; id: string } | { kind: "cell"; id: string };

export function selectionOf(s: ExplorerState): Selection {
  if (s.level === "grid") return s.cell ? { kind: "cell", id: s.cell } : { kind: "national" };
  if (!s.geo) return { kind: "national" };
  return s.level === "adm1" ? { kind: "province", id: s.geo } : { kind: "district", id: s.geo };
}

export type DrawerBodies = {
  selection: Selection;
  total: QueryEmissions;
  bySector: QueryEmissions;
  sectorKey: "sector_id" | "module";
  byView: QueryEmissions | null;
  series: TimeseriesRequest;
  lineage: LineageRequest | null;
  /** The province envelope (every province) whose `unallocated` and `derived` blocks the summary quotes; the map's own request at ADM1. */
  provinces: QueryEmissions;
  cell: GridCellRequest | null;
};

export function drawerBodies(s: ExplorerState, months: string[]): DrawerBodies {
  const selection = selectionOf(s);
  const provinces = adm1Body(s);
  if (selection.kind === "province" || selection.kind === "district") {
    const d = detailBodies({ ...s, cell: null }, months);
    if (d.kind === "province" || d.kind === "district") {
      return {
        selection,
        total: d.total,
        bySector: d.byModule,
        sectorKey: "module",
        byView: { ...d.total, group_by: ["spatial_view"] },
        series: { query: { configuration_id: s.config, gwp_basis: s.gwp, ...(s.sector ? { sectors: [s.sector] } : {}), ...(s.gas ? { gases: [s.gas] } : {}), geography_level: s.level, geography_ids: [selection.id], spatial_view: s.view }, step: "annual" },
        lineage: d.lineage,
        provinces,
        cell: null,
      };
    }
  }
  const national = scopeBody(s);
  return {
    selection,
    total: national,
    bySector: { ...national, group_by: ["sector_id"], order_by: "value desc" },
    sectorKey: "sector_id",
    byView: null,
    series: seriesBody(s),
    lineage: null,
    provinces,
    cell: selection.kind === "cell" ? gridCellBody(s) : null,
  };
}
