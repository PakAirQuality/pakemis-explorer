"use client";
/**
 * The legend. Five swatches at the ranks 0, n/4, n/2, 3n/4, n-1 of the envelope's cells sorted
 * by value, labelled with THOSE cells' display strings (no client-computed breaks), a hatch row
 * when any cell is bounded, a dotted-outline row when the residual ADM1 unit's members share
 * one cell, a no-cell row only while some polygon still has none, the scope and the
 * ReceiptFooter. A refused map
 * request puts the RefusalCard here. At grid level: the raster's gradient labelled with two
 * real displays fetched through get_grid_cell at the builder's anchor cells.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope, Cell } from "@/lib/envelope";
import type { Residual } from "@/lib/geography";
import { rampColor, RAMP, NO_CELL } from "@/lib/palette";
import { gridCellBody } from "@/lib/requests";
import type { ExplorerState } from "@/lib/urlState";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { shown } from "@/lib/envelope";
import { cellUnit, unitShort } from "@/lib/labels";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import type { CellIndex } from "./paint";
import type { RasterInfo } from "./tiles";

export function legendRanks(cells: Cell[]): Cell[] {
  const sorted = cells.filter((c) => typeof c.value === "number").sort((a, b) => (a.value as number) - (b.value as number));
  const n = sorted.length;
  if (!n) return [];
  const ranks = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  const out: Cell[] = [];
  for (const r of ranks) if (!out.includes(sorted[r])) out.push(sorted[r]);
  return out;
}

export function Legend({ state, scope, env, index, error, isLoading, raster, rasterOn, hasCells, shared = null }: { state: ExplorerState; scope: string; env: Envelope | null | undefined; index: CellIndex | null; error: unknown; isLoading: boolean; raster: RasterInfo | undefined; rasterOn: boolean; hasCells: boolean; shared?: (Residual & { cell: Cell }) | null }) {
  return (
    <div className="glass w-[272px] rounded-card text-xs" data-testid="legend">
      <div className="px-3 pt-2">
        <div className="micro">Legend</div>
        <div className="truncate text-xs text-fg" title={scope}>{scope}</div>
      </div>
      {state.level === "grid" ? (
        <RasterLegend state={state} raster={raster} on={rasterOn} />
      ) : error ? (
        <div className="px-2 pb-2 pt-1"><RefusalCard error={error} compact /></div>
      ) : env && index ? (
        <div className="px-3 pb-2 pt-1">
          <ul className="space-y-0.5">
            {legendRanks(env.values).map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 rounded-sm border border-line-strong" style={{ background: rampColor(c.value as number, index.min, index.max) }} />
                <span className="num text-fg" data-testid="legend-label" title={`${c.display} (contract precision)`}>{shown(c)}</span>
              </li>
            ))}
            {index.anyBounded && (
              <li className="flex items-center gap-2">
                <span className="hatch-swatch inline-block h-3 w-5 rounded-sm border border-line-strong" style={{ backgroundColor: RAMP[2] }} />
                <span className="text-muted">interval [low, high] (mixed CH₄ origin)</span>
              </li>
            )}
            {shared && (
              <li className="flex items-center gap-2" data-testid="legend-shared">
                <span className="inline-block h-3 w-5 rounded-sm border-2 border-dotted border-fg/80" style={{ background: typeof shared.cell.value === "number" ? rampColor(shared.cell.value, index.min, index.max) : NO_CELL }} />
                <span className="text-muted">{shared.name}: {shared.members.join(" + ")} share one cell</span>
              </li>
            )}
            {hasCells && (
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 rounded-sm border border-line-strong" style={{ background: NO_CELL }} />
                <span className="text-muted">no cell</span>
              </li>
            )}
          </ul>
          <div className="mt-1 text-muted">{unitShort(index.unit)}</div>
        </div>
      ) : isLoading ? (
        <div className="px-3 pb-2 pt-1"><Loading what="the map envelope" /></div>
      ) : null}
      {env && state.level !== "grid" && <ReceiptFooter env={env} className="border-t border-line/70 px-3 py-1" />}
    </div>
  );
}

function RasterLegend({ state, raster, on }: { state: ExplorerState; raster: RasterInfo | undefined; on: boolean }) {
  const key = `${state.config}/${state.gas ?? ""}`;
  const anchors = raster?.anchor_cells[key];
  const median = useQuery({ queryKey: ["anchor", "median", state.config, state.gas, state.month], queryFn: () => api.gridCell(gridCellBody(state, anchors!.median)), enabled: !!anchors });
  const max = useQuery({ queryKey: ["anchor", "max", state.config, state.gas, state.month], queryFn: () => api.gridCell(gridCellBody(state, anchors!.max)), enabled: !!anchors });
  const stops = raster?.colormap ?? [...RAMP];
  return (
    <div className="px-3 pb-2 pt-1">
      {!on && <div className="mb-1 text-muted">Raster off (toggle in the layers control).</div>}
      <div className="h-3 w-full rounded-sm border border-line-strong" style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }} />
      <div className="mt-1 text-muted">{raster?.stretch ?? "log stretch"}; {raster?.note ?? "shading only"}.</div>
      {anchors ? (
        <ul className="mt-1 space-y-1">
          <AnchorRow label="median non-zero cell" q={median} />
          <AnchorRow label="cell of the annual maximum" q={max} />
        </ul>
      ) : (
        <div className="mt-1 text-muted">No raster built for {key}.</div>
      )}
    </div>
  );
}

function AnchorRow({ label, q }: { label: string; q: { data?: Envelope; error?: unknown; isLoading: boolean } }) {
  const cell = q.data?.values[0];
  return (
    <li>
      <div className="text-muted">{label}</div>
      {cell ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-fg" data-testid="raster-anchor" title={`${cell.display} (contract precision)`}>{shown(cell)} {cellUnit(cell)}</span>
          <span className="mono text-muted" title={q.data!.receipt}>{q.data!.receipt.slice(0, 8)}</span>
        </div>
      ) : q.error ? (
        <RefusalCard error={q.error} compact />
      ) : (
        <Loading what="the anchor cell" />
      )}
    </li>
  );
}
