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
 *
 * THE ANCHOR IS IN THE CANVAS'S METRIC. This card asked the greenhouse query whatever was
 * selected, so a PM₂.₅ chart sat beside "Pakistan emitted an estimated 469.64 Mt CO₂e" - two
 * quantities in two units presented as one page. Under a pollutant it holds that pollutant's
 * covered total for the same year, from the same request the workspace cards send
 * (lib/requests.ts airDeckBodies), and says what its share is a share of.
 */
import { useMemo, useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown } from "@/lib/envelope";
import { cellUnit, periodShort, reportingSectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { useAir, useEmissions } from "@/lib/queries";
import type { ExploreState } from "@/lib/explore/query";
import { airDeckBodies } from "@/lib/requests";
import { AIR_NOT_AMBIENT } from "@/lib/selection";
import { sectorLabel } from "@/lib/labels";
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
  const pol = state.pollutant;
  const scope = useMemo(() => ({ periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp }), [state.period, state.config, state.gwp]);
  const air = useMemo(() => (pol ? airDeckBodies({ pol, period: state.period, sector: null, geo: null }, []) : null), [pol, state.period]);
  const ghgTotal = useEmissions(pol ? null : scope, open);
  const ghgBreakdown = useEmissions(useMemo(() => (pol ? null : { ...scope, group_by: ["reporting_sector"], order_by: "value desc" }), [pol, scope]), open);
  const airTotal = useAir(air?.total ?? null, open);
  const airSources = useAir(air?.sources ?? null, open);
  const total = pol ? airTotal : ghgTotal;
  const breakdown = pol ? airSources : ghgBreakdown;

  const cell = total.data?.values.find((c) => typeof c.value === "number") ?? null;
  const top = breakdown.data?.values.find((c) => typeof c.value === "number") ?? null;
  // READ THE KEY THIS CARD ASKED FOR. The breakdown above groups by `reporting_sector`; this
  // line read `sector_id`, so the group value was undefined and the card's opening sentence and
  // chip both lost the sector's name - "49.4 % from all sectors" where the bar says agriculture.
  // `sector_id` stays as the fallback for a cached module-keyed envelope.
  const topName = top ? (pol ? sectorLabel(labels, top.group?.sector_id) : reportingSectorLabel(labels, top.group?.reporting_sector ?? top.group?.sector_id)) : "";
  const period = periodShort(labels, state.period);

  const sentence = !cell ? null : pol ? (
    <>
      In <b>{period}</b>, the sources this release estimates emitted <Figure cell={cell} unit={cellUnit(cell)} /> in Pakistan.
      {top ? (
        <>
          {" "}
          {topName} is the largest of them, at <Figure cell={top} unit={magnitudeOf(top)} />
          {top.share_pct_short ? (
            <>
              {" "}(<b className="num">{top.share_pct_short} %</b> of the sources estimated here)
            </>
          ) : null}
          .
        </>
      ) : null}{" "}
      {AIR_NOT_AMBIENT}
    </>
  ) : cell ? (
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
