"use client";
/**
 * The Explore canvas: one envelope under three representations. Chart picks the figure by the
 * plan's chart kind — horizontal bars for sectors, categories and places (sector hues inside
 * the chart only), a stacked bar for gases, a line for the annual series, columns for months,
 * grouped bars for the two estimates — every axis label from the envelope's `axis.ticks_short`
 * and every printed number a server string (`display_short`, `share_pct_short`). Table is the
 * EnvelopeTable with its Share column and full-precision toggle. Map is the ExplorerMap in its
 * compact variant for a province or district breakdown, and the typed reason otherwise.
 */
import type { Level } from "@/lib/urlState";
import type { Cell, Envelope } from "@/lib/envelope";
import { shown } from "@/lib/envelope";
import { cellUnit, groupValueLabel, monthTiny, periodShort, type Dims as GeoDims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { ACCENT, gasColor, sectorColor } from "@/lib/palette";
import { magnitudeOf } from "@/lib/uncertainty";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { StackedBar, type Segment } from "@/components/charts/StackedBar";
import { GroupedBars, type GroupedRow } from "@/components/charts/GroupedBars";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import type { Action, ExploreContext, ExploreState, QueryPlan } from "@/lib/explore/query";
import { EXPLORE } from "./copy";

export type ActivePlan = Exclude<QueryPlan, { kind: "refused" }>;

export type CanvasProps = {
  state: ExploreState;
  plan: QueryPlan;
  ctx: ExploreContext;
  env: Envelope | null;
  error: unknown;
  isLoading: boolean;
  labels: Labels;
  dims: GeoDims;
  dispatch: (a: Action) => void;
};

type Side = Cell & { group?: Record<string, string | null> };

/** A compare cell's left and right estimates (the envelope's own nested cells). */
export function sidesOf(cell: Cell): { left: Side; right: Side } | null {
  const r = cell as Record<string, unknown>;
  const left = r.left as Side | undefined;
  const right = r.right as Side | undefined;
  return left && right ? { left, right } : null;
}

const MAP_REFUSAL = { error: EXPLORE.mapUnavailable.error, error_class: EXPLORE.mapUnavailable.error_class, message: EXPLORE.mapUnavailable.message, limitation_id: null, detail: { available_at: [...EXPLORE.mapUnavailable.available_at] } };

export function Canvas({ state, plan, ctx, env, error, isLoading, labels, dims, dispatch }: CanvasProps) {
  if (plan.kind === "refused") return <RefusalCard refusal={plan.refusal} />;
  const active: ActivePlan = plan;
  if (state.rep === "map") {
    const placeKey = active.kind === "emissions" && (active.groupBy === "province" || active.groupBy === "shape_id");
    if (!placeKey) return <RefusalCard refusal={MAP_REFUSAL} compact />;
    const level: Level = state.level === "adm2" ? "adm2" : "adm1";
    const onPick = (lvl: Level, id: string) => {
      if (lvl === "adm1") dispatch({ control: "geography", value: "province", id });
      else if (lvl === "adm2") dispatch({ control: "geography", value: "district", id });
    };
    return (
      <div className="map-frame relative h-[560px] w-full overflow-hidden" data-testid="canvas-map">
        <ExplorerMap variant="briefing" override={{ level, geo: null, cell: null, month: null, sector: state.sector, gas: state.gas, period: state.period, config: state.config, gwp: state.gwp, view: state.view }} onPick={onPick} />
      </div>
    );
  }
  if (!env) {
    if (error) return <RefusalCard error={error} compact />;
    return isLoading ? <Loading what="the inventory" /> : null;
  }
  if (state.rep === "table") return <EnvelopeTable env={env} labels={labels} dims={dims} dense onRowClick={(cell) => select(cell, active.groupBy, dispatch)} />;
  return <Figure state={state} plan={active} ctx={ctx} env={env} labels={labels} dims={dims} dispatch={dispatch} />;
}

/** A row or bar click narrows the controls to what was clicked (the same transition the control would make). */
function select(cell: Cell, key: string, dispatch: (a: Action) => void) {
  const g = cell.group ?? sidesOf(cell)?.left.group ?? {};
  const id = g[key];
  if (!id) return;
  if (key === "sector_id" || key === "module") dispatch({ control: "sector", value: id });
  else if (key === "category") dispatch({ control: "category", value: id });
  else if (key === "gas") dispatch({ control: "gas", value: id });
  else if (key === "province") dispatch({ control: "geography", value: "province", id });
  else if (key === "shape_id") dispatch({ control: "geography", value: "district", id });
}

function nameOf(labels: Labels, dims: GeoDims, key: string, id: string | null | undefined): string {
  if (key === "month") return monthTiny(labels, id ?? "");
  return groupValueLabel(labels, dims, key, id) || (id ?? "");
}

function colorOf(key: string, id: string | null | undefined): string {
  if (key === "sector_id" || key === "module") return sectorColor(id);
  if (key === "gas") return gasColor(id);
  return ACCENT;
}

/** The bar label: the value, with the server's share when the cells partition a total; the share alone under Measure = Share of total. */
function labelOf(cell: Cell, share: boolean): string {
  const s = cell.share_pct_short;
  if (share && s) return `${s} %`;
  return s ? `${shown(cell)} · ${s} %` : shown(cell);
}

function Figure({ state, plan, ctx, env, labels, dims, dispatch }: Omit<CanvasProps, "error" | "isLoading" | "env" | "plan"> & { env: Envelope; plan: ActivePlan }) {
  const key = plan.groupBy;
  const cells = env.values.filter((c) => typeof c.value === "number");
  const ticks = env.axis?.ticks_short;
  switch (plan.chart) {
    case "stacked": {
      const segments: Segment[] = cells.map((c) => ({ id: c.group?.[key] ?? "", name: nameOf(labels, dims, key, c.group?.[key]), value: c.value as number, label: shown(c), share: c.share_pct_short, color: colorOf(key, c.group?.[key]) }));
      return (
        <div className="py-2">
          <StackedBar segments={segments} unit={magnitudeOf(cells[0])} />
        </div>
      );
    }
    case "line": {
      const points: LinePoint[] = cells.map((c) => ({ id: c.group?.period_id ?? "", name: periodShort(labels, c.group?.period_id ?? ""), value: c.value as number, label: shown(c), reference: c.group?.period_id === ctx.referencePeriod }));
      return <LineChart points={points} ticks={ticks} height={300} />;
    }
    case "column": {
      const points: ColumnPoint[] = cells.map((c) => ({ id: c.group?.month ?? "", name: monthTiny(labels, c.group?.month ?? ""), value: c.value as number, label: shown(c) }));
      return <ColumnChart points={points} ticks={ticks} height={260} />;
    }
    case "grouped": {
      const rows: GroupedRow[] = env.values.flatMap((c) => {
        const sides = sidesOf(c);
        if (!sides || typeof sides.left.value !== "number" || typeof sides.right.value !== "number") return [];
        const id = sides.left.group?.[key] ?? sides.right.group?.[key] ?? "";
        return [{ id, name: nameOf(labels, dims, key, id), left: { value: sides.left.value, label: shown(sides.left) }, right: { value: sides.right.value, label: shown(sides.right) }, difference: shown(c) }];
      });
      const left = plan.kind === "compare" ? labels.configurations[String(plan.body.left?.configuration_id ?? "")]?.label ?? "Left" : "Left";
      const right = plan.kind === "compare" ? labels.configurations[String(plan.body.right?.configuration_id ?? "")]?.label ?? "Right" : "Right";
      return <GroupedBars rows={rows} leftName={left} rightName={right} unit={cellUnit(env.values[0])} />;
    }
    default: {
      const items: BarItem[] = cells.map((c) => {
        const id = c.group?.[key] ?? "";
        return { id, name: nameOf(labels, dims, key, id), value: c.value as number, label: labelOf(c, state.share), color: colorOf(key, id) };
      });
      return <BarsWithAxis items={items} ticks={ticks} onSelect={(id) => select({ ...cells[0], group: { [key]: id } } as Cell, key, dispatch)} />;
    }
  }
}
