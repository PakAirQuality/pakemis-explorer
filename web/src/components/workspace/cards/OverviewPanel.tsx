"use client";
/**
 * The national overview as ONE larger panel (the atlas pattern the briefing pointed at),
 * folding what were the snapshot and trend cards into a single composition:
 *
 *   sentence + figure + chip     the snapshot's own pieces, unchanged;
 *   the year rail                nine fiscal ticks, the chosen one flagged - CLICKING a
 *                                tick writes `period`, the same key the year slider
 *                                writes, so the map and every card follow;
 *   the nine-year series         the trend card's columns and the SERVER's change
 *                                sentence (the browser subtracts nothing);
 *   the gas rail                 every gas the release estimates (greenhouse three +
 *                                the seven air species) as a selector: clicking one
 *                                re-scopes the panel to that gas's metrics.
 *
 * Serves the national AND the chosen-gas scope; a sector, province or district
 * keeps its own card set, and a pollutant swaps to the air deck (which carries the
 * same rail).
 */
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { shown } from "@/lib/envelope";
import { cellUnit, gasLabel, periodShort, periodSpanWords } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import type { Scope } from "../cards";
import { DeckCard, Pending } from "./DeckCard";
import { scopeWholeWords, sentenceOf } from "./SnapshotCard";
import { GasRail } from "../GasRail";
import { YearRail } from "../YearRail";
import { cellFor, rankedCells } from "./data";
import { sectorLabel } from "@/lib/labels";

export function OverviewPanel({ id, scope, deck, place, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; place: string; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { state, setState, labels, dims, release } = useExplorer();
  const env = deck.total.data;
  const cell = env?.values[0];
  const period = periodShort(labels, state.period);

  const top = scope.kind === "national" ? rankedCells(deck.breakdown.data)[0] ?? null : null;
  const topName = top ? sectorLabel(labels, top.group?.[deck.bodies.breakdown.key]) : "";
  // a chosen gas's share of the gas partition, from the server's own cell - folded
  // into the sentence (the chip it used to ride on is gone)
  const ranked = deck.bodies.ranked;
  const mine = scope.kind === "gas" && ranked ? cellFor(deck.ranked.data, ranked.key, ranked.id) : null;
  const gasShare = mine && mine.share_pct_short ? (
    <> That is <b className="num">{mine.share_pct_short} %</b> of {scopeWholeWords(scope)}
      {typeof mine.rank === "number" && deck.ranked.data ? <> — rank <b className="num">{String(mine.rank)}</b> of <b className="num">{String(deck.ranked.data.values.length)}</b></> : null}.
    </>
  ) : null;
  const sentence = cell ? <>{sentenceOf({ scope, place, period, cell, top, topName, labels })}{gasShare}</> : null;

  const series = deck.series.data;
  const change = series?.change;
  const seriesCells = series?.values.filter((x) => typeof x.value === "number") ?? [];
  const reference = dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
  const points: ColumnPoint[] = seriesCells.map((x) => ({ id: x.group?.period_id ?? "", name: periodShort(labels, x.group?.period_id ?? ""), value: x.value as number, label: shown(x), reference: x.group?.period_id === reference }));
  const last = seriesCells[seriesCells.length - 1];
  const verb = change?.direction === "rose" ? "had risen to" : change?.direction === "fell" ? "had fallen to" : "were unchanged at";
  const upDown = change?.direction === "rose" ? "up" : change?.direction === "fell" ? "down" : null;
  const pct = change?.change_pct_short ? change.change_pct_short.replace(/^[+-]/, "") : null;
  const limitation = release.known_limitations.find((l) => /longitudinal|trend/i.test(String(l.id ?? "")));

  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence} note={limitation ? String(limitation.message ?? limitation.id) : undefined}>
      {cell ? (
        <div className="relative" data-testid="overview-figure">
          <ContourMotif corner="bottom-right" />
          <div className="relative flex flex-wrap items-baseline gap-x-2">
            <span className="num text-4xl font-semibold tracking-tight text-accent" data-testid="overview-display" title={`${cell.display} ${cell.unit}`}>{shown(cell)}</span>
            <span className="text-sm text-muted">{cellUnit(cell)}</span>
          </div>
        </div>
      ) : (
        <Pending q={deck.total} what="the national total" />
      )}

      <YearRail periods={dims.fiscalPeriods} current={state.period} onPick={(p) => setState({ period: p })} labels={labels} />

      <div className="mt-4" data-testid="overview-series">
        {series ? <ColumnChart points={points} ticks={series.axis?.ticks_short} /> : <Pending q={deck.series} what="the annual series" />}
        {change && last ? (
          <p className="mt-2 text-xs text-muted" data-testid="overview-change">
            By <b>{periodShort(labels, change.to_period)}</b>, emissions {verb} <b className="num whitespace-nowrap">{change.to_short} {cellUnit(last)}</b>{upDown && pct ? <>, {upDown} <b className="num whitespace-nowrap">{pct} %</b> from <b className="num whitespace-nowrap">{change.from_short} {magnitudeOf(last)}</b> in <b>{periodShort(labels, change.from_period)}</b></> : null}. <span className="text-muted/80">{periodSpanWords(labels, reference)}</span>
          </p>
        ) : null}
      </div>

      <GasRail />
    </DeckCard>
  );
}
