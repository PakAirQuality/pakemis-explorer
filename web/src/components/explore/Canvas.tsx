"use client";
/**
 * The Explore canvas: one envelope under three representations. Chart picks the figure by the
 * plan's chart kind — horizontal bars for sectors, categories and places (sector hues inside
 * the chart only), a stacked bar for gases, a line for the annual series, columns for months,
 * grouped bars for the two estimates — every axis label from the envelope's `axis.ticks_short`
 * and every printed number a server string (`display_short`, `share_pct_short`). Table is the
 * EnvelopeTable with its Share column and full-precision toggle. Map is the ExplorerMap in its
 * compact variant for a province or district breakdown - greenhouse gases or a pollutant, the
 * map reading the canvas's own request rather than one of its own - and the typed reason otherwise.
 *
 * A map that cannot be drawn (no WebGL in this browser, or a context the browser took away) is
 * never a blank canvas: the canvas says so in the workspace's own sentence and shows the CHART
 * of the same envelope in the map's place, with one click to make Chart or Table the page's
 * representation. The URL is not rewritten behind the reader's back, so a context that comes
 * back finds the map still asked for.
 */
import { useState, type ReactNode } from "react";
import type { Level } from "@/lib/urlState";
import type { Cell, Envelope } from "@/lib/envelope";
import { shown } from "@/lib/envelope";
import { cellUnit, groupValueLabel, isSectorKey, monthTiny, periodShort, type Dims as GeoDims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { gasColor, rampByRank } from "@/lib/palette";
import { magnitudeOf } from "@/lib/uncertainty";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { StackedBar, type Segment } from "@/components/charts/StackedBar";
import { GroupedBars, type GroupedRow } from "@/components/charts/GroupedBars";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { ExplorerMap, type ExplorerMapProps, type MapRequest, type MapStatus } from "@/components/map/ExplorerMap";
import { MAP_FAILURE } from "@/components/workspace/copy";
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

// A SELECTION THE RELEASE HOLDS NOTHING FOR IS SAID TO BE EMPTY. An empty envelope used to fall
// through to an empty chart under the place's name, which reads as "zero"; and the alternative -
// quietly showing the nation or every place instead - is the bug this page had under a pollutant.
const NO_ROWS = { error: "no_rows", error_class: "NoRows", message: "The release holds no rows for this selection. Nothing else is shown in its place: not the national figure, and not other places.", limitation_id: null, detail: {} };
const MAP_REFUSAL = { error: EXPLORE.mapUnavailable.error, error_class: EXPLORE.mapUnavailable.error_class, message: EXPLORE.mapUnavailable.message, limitation_id: null, detail: { available_at: [...EXPLORE.mapUnavailable.available_at] } };

/**
 * The plan as the map can draw it: a breakdown by place - every province, or every district - of
 * greenhouse gases or of one pollutant, with the level its body asks at. Anything else (one
 * place's sectors, a series, the two estimates) has no polygon per cell, and the canvas says so.
 *
 * WHAT COMES BACK IS THE PLAN'S OWN BODY, and the map asks exactly that (MapRequest). The map
 * used to build a body of its own for the same places, without the plan's `order_by`: a second
 * request, a second receipt and a second cell order under one heading. The level is read off the
 * body for the same reason - the request says what was asked, and nothing else is consulted.
 */
function mapRequestOf(plan: ActivePlan): { request: MapRequest; level: Level } | null {
  if (plan.kind !== "emissions" && plan.kind !== "air") return null;
  if (plan.groupBy !== "province" && plan.groupBy !== "shape_id") return null;
  const level: Level = plan.groupBy === "shape_id" ? "adm2" : "adm1";
  if (plan.body.geography_level !== level) return null;
  return { request: plan.kind === "air" ? { kind: "air", body: plan.body } : { kind: "emissions", body: plan.body }, level };
}

export function Canvas({ state, plan, ctx, env, error, isLoading, labels, dims, dispatch }: CanvasProps) {
  if (plan.kind === "refused") return <RefusalCard refusal={plan.refusal} />;
  const active: ActivePlan = plan;
  /** The envelope as a figure or a table: the canvas's own answer, and what stands in for a map that cannot be drawn. */
  const answer = (rep: "chart" | "table"): ReactNode => {
    if (!env) {
      if (error) return <RefusalCard error={error} compact />;
      return isLoading ? <Loading what="the inventory" /> : null;
    }
    if (env.values.length === 0) return <RefusalCard refusal={NO_ROWS} compact />;
    if (rep === "table") return <EnvelopeTable env={env} labels={labels} dims={dims} dense onRowClick={(cell) => select(cell, active.groupBy, dispatch)} />;
    return <Figure state={state} plan={active} ctx={ctx} env={env} labels={labels} dims={dims} dispatch={dispatch} />;
  };
  if (state.rep === "map") {
    // A pollutant is drawn as greenhouse gases are: the polygons are the same and the map shades
    // whatever envelope it is handed. (This branch used to refuse every pollutant with a note
    // sending the reader to another page, from when the page had no air request to hand over.)
    const mapped = mapRequestOf(active);
    if (!mapped) return <RefusalCard refusal={MAP_REFUSAL} compact />;
    const { request, level } = mapped;
    const onPick = (lvl: Level, id: string) => {
      if (lvl === "adm1") dispatch({ control: "geography", value: "province", id });
      else if (lvl === "adm2") dispatch({ control: "geography", value: "district", id });
    };
    return (
      // `pol` is the page's RESOLVED pollutant, said outright: the URL's own value is not checked
      // against the species the release carries, and the map must not take its metric from it
      <MapOrFallback override={{ level, geo: null, cell: null, month: null, sector: state.sector, gas: state.gas, pol: state.pollutant, period: state.period, config: state.config, gwp: state.gwp, view: state.view }} request={request} onPick={onPick} dispatch={dispatch}>
        {answer("chart")}
      </MapOrFallback>
    );
  }
  return answer(state.rep);
}

const FALLBACK_ACTION = "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft";

/**
 * The map, or — while it reports `failed` or `lost` — the sentence, the two one-click
 * representations and the chart handed in as children. The map stays MOUNTED and hidden while it
 * is down: a lost context can only return to the instance that lost it, and when it does the
 * frame simply comes back.
 */
function MapOrFallback({ override, request, onPick, dispatch, children }: { override: ExplorerMapProps["override"]; request: ExplorerMapProps["request"]; onPick: ExplorerMapProps["onPick"]; dispatch: (a: Action) => void; children: ReactNode }) {
  const [status, setStatus] = useState<MapStatus>("loading");
  const down = status === "failed" || status === "lost";
  return (
    <>
      {down && (
        <div data-testid="canvas-map-fallback" data-status={status}>
          <div className="mb-3 rounded-card border-l-4 border-warn bg-refusal px-3 py-2" role="status" data-testid="map-unavailable">
            <p className="text-sm text-fg" data-testid="map-unavailable-text">{MAP_FAILURE.explanation}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => dispatch({ control: "rep", value: "chart" })} className={FALLBACK_ACTION} data-testid="map-unavailable-chart">{MAP_FAILURE.chart}</button>
              <button type="button" onClick={() => dispatch({ control: "rep", value: "table" })} className={FALLBACK_ACTION} data-testid="map-unavailable-table">{MAP_FAILURE.table}</button>
            </div>
          </div>
          {children}
        </div>
      )}
      <div className={`map-frame relative h-[560px] w-full overflow-hidden${down ? " hidden" : ""}`} data-testid="canvas-map" aria-hidden={down ? true : undefined}>
        <ExplorerMap variant="briefing" override={override} request={request} onPick={onPick} onStatus={setStatus} />
      </div>
    </>
  );
}

/** A row or bar click narrows the controls to what was clicked (the same transition the control would make). */
function select(cell: Cell, key: string, dispatch: (a: Action) => void) {
  const g = cell.group ?? sidesOf(cell)?.left.group ?? {};
  const id = g[key];
  if (!id) return;
  if (isSectorKey(key)) dispatch({ control: "sector", value: id });
  else if (key === "category") dispatch({ control: "category", value: id });
  else if (key === "gas") dispatch({ control: "gas", value: id });
  else if (key === "province") dispatch({ control: "geography", value: "province", id });
  else if (key === "shape_id") dispatch({ control: "geography", value: "district", id });
}

function nameOf(labels: Labels, dims: GeoDims, key: string, id: string | null | undefined): string {
  if (key === "month") return monthTiny(labels, id ?? "");
  return groupValueLabel(labels, dims, key, id) || (id ?? "");
}

/** The gases keep their three hues; every other set takes the PAQI ramp by rank — the cell's own order in the envelope. A colour here prints nothing. */
function colorOf(key: string, id: string | null | undefined, index: number, count: number): string {
  if (key === "gas") return gasColor(id);
  return rampByRank(index, count);
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
      const segments: Segment[] = cells.map((c, i) => ({ id: c.group?.[key] ?? "", name: nameOf(labels, dims, key, c.group?.[key]), value: c.value as number, label: shown(c), share: c.share_pct_short, color: colorOf(key, c.group?.[key], i, cells.length) }));
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
      const items: BarItem[] = cells.map((c, i) => {
        const id = c.group?.[key] ?? "";
        return { id, name: nameOf(labels, dims, key, id), value: c.value as number, label: labelOf(c, state.share), color: colorOf(key, id, i, cells.length) };
      });
      return <BarsWithAxis items={items} ticks={ticks} onSelect={(id) => select({ ...cells[0], group: { [key]: id } } as Cell, key, dispatch)} />;
    }
  }
}
