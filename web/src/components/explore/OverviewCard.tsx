"use client";
/**
 * The Data page's national overview card, the left column's anchor figure: whatever the canvas
 * is dissecting, this card holds the year's national total in large type with the largest
 * sector's saffron chip and the opening sentence — the workspace SnapshotCard's composition,
 * self-sourced because the Grapher has no deck: two envelopes of its own (the national total
 * and the sector partition), scoped to the selected period and estimate. Collapsing it is
 * chrome, not state. Every number is a server string (`display_short`, `share_pct_short`,
 * `share_phrase`); where the release attaches no share, the card prints none rather than
 * dividing in the browser. A refused scope (a calendar year, the survey estimate off its own
 * year) shows the release's typed refusal by name.
 */
import { useMemo, useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown } from "@/lib/envelope";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { useEmissions } from "@/lib/queries";
import type { ExploreState } from "@/lib/explore/query";
import { Widget } from "@/components/ui/Widget";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { DECK_CARD } from "@/components/overview/deck";
import { Figure, Pending } from "@/components/workspace/cards/DeckCard";
import { lowerName } from "@/components/workspace/cards/data";
import { EXPLORE } from "./copy";

const D = EXPLORE.data;
const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-amber/50 bg-amber/15 px-3 py-1 text-xs font-medium text-fg";

export function OverviewCard({ state }: { state: ExploreState }) {
  const { labels } = useExplorer();
  const [open, setOpen] = useState(true);
  const scope = useMemo(() => ({ periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp }), [state.period, state.config, state.gwp]);
  const total = useEmissions(scope, open);
  const breakdown = useEmissions(useMemo(() => ({ ...scope, group_by: ["sector_id"], order_by: "value desc" }), [scope]), open);

  const cell = total.data?.values.find((c) => typeof c.value === "number") ?? null;
  const top = breakdown.data?.values.find((c) => typeof c.value === "number") ?? null;
  const topName = top ? sectorLabel(labels, top.group?.sector_id) : "";
  const period = periodShort(labels, state.period);

  const sentence = cell ? (
    <>
      In <b>{period}</b>, Pakistan emitted an estimated <Figure cell={cell} unit={cellUnit(cell)} />.
      {top ? (
        <>
          {" "}
          {topName} contributed <Figure cell={top} unit={magnitudeOf(top)} />
          {top.share_pct_short ? (
            <>
              , accounting for <b className="num">{top.share_pct_short} %</b> of the total
            </>
          ) : null}
          .
        </>
      ) : null}
    </>
  ) : null;

  return (
    <Widget id="overview-card" testId="overview-card" chrome={DECK_CARD} title={D.overview} env={total.data} labels={labels} toolbar={false} open={open} onToggle={setOpen} sentence={sentence}>
      {cell ? (
        <div className="relative" data-testid="overview-figure">
          <ContourMotif corner="bottom-right" />
          <div className="relative flex flex-wrap items-baseline gap-x-2">
            <span className="num text-3xl font-semibold tracking-tight text-accent" data-testid="overview-display" title={`${cell.display} ${cell.unit}`}>{shown(cell)}</span>
            <span className="text-sm text-muted" data-testid="overview-unit">{cellUnit(cell)}</span>
          </div>
          {top && top.share_pct_short && (
            <div className="relative mt-2">
              <span className={CHIP} data-testid="overview-chip"><b className="num">{top.share_pct_short} %</b> from {lowerName(topName)}</span>
            </div>
          )}
        </div>
      ) : (
        <Pending q={total} what={D.overviewWhat} />
      )}
    </Widget>
  );
}
