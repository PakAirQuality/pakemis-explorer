"use client";
/**
 * The hover tip: the feature's name and its cell's `display` + unit verbatim (an interval badge
 * and the cell's `interpretation` when bounded); for polygons without a cell, why (the
 * territories that sit in the ADM1 "Other" row; census units sharing one shape are listed).
 */
import type { Cell } from "@/lib/envelope";
import { adm2RowsForShape } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import type { Dims } from "@/components/ExplorerContext";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import type { Hover } from "./useMapInteractions";

export function HoverTip({ hover, cell, labels, dims, refused, container }: { hover: Hover; cell: Cell | null; labels: Labels; dims: Dims; refused: boolean; container: { width: number; height: number } }) {
  if (!hover) return null;
  const left = Math.min(hover.x + 14, Math.max(0, container.width - 300));
  const top = Math.min(hover.y + 14, Math.max(0, container.height - 140));
  let title = hover.id;
  let sub: string | null = null;
  if (hover.level === "adm2") {
    const rows = adm2RowsForShape(dims, hover.id);
    title = rows[0]?.shape_name || (hover.props.shape_name as string) || hover.id;
    if (rows.length > 1) sub = `one shape for ${rows.map((r) => r.name).join(", ")} (shared_shape)`;
    else if (rows[0]) sub = `${rows[0].name} · ${rows[0].parent_id.replace(/^ADM1:/, "")}`;
  } else if (hover.level === "grid") {
    title = `Grid cell ${String(hover.props.cell_id ?? "")}`;
    sub = `row ${String(hover.props.row ?? "")} · col ${String(hover.props.col ?? "")} · ${String(hover.props.lat ?? "")}, ${String(hover.props.lon ?? "")}`;
  }
  const otherRow = dims.adm1.find((r) => r.has_polygon === "no");
  return (
    <div className="glass pointer-events-none absolute z-30 max-w-[300px] rounded-card px-3 py-2 text-xs" style={{ left, top }} data-testid="hover-tip">
      <div className="font-semibold text-ink">{title}</div>
      {sub && <div className="text-muted">{sub}</div>}
      {hover.level === "grid" ? (
        <div className="mt-1 text-muted">Click to read this cell from the cube (get_grid_cell).</div>
      ) : refused ? (
        <div className="mt-1 text-warn">Refused for this scope: see the legend.</div>
      ) : cell ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="num text-md font-semibold text-ink" data-testid="hover-display">{cell.display}</span>
          <span className="text-muted">{cell.unit}</span>
          {isBounded(cell) && <IntervalBadge cell={cell} title={String((cell as Record<string, unknown>).interpretation ?? "")} />}
          {isBounded(cell) && <div className="w-full text-muted">{String((cell as Record<string, unknown>).interpretation ?? "")}</div>}
        </div>
      ) : (
        <div className="mt-1 text-muted">
          No cell: {hover.level === "adm1" ? `this territory's mass is carried in the "${otherRow?.name ?? "Other"}" row at ADM1 (has_polygon: no)` : labels.limitations.no_polygon_units ?? "no envelope cell for this polygon"}.
        </div>
      )}
    </div>
  );
}
