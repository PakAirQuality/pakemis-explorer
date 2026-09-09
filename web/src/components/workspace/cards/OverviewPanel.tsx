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
 *   the three gases              CO2 . CH4 . N2O from the gas partition envelope - the
 *                                total is not CO2e alone, and each gas prints the
 *                                server's own display and share strings.
 *
 * National scope only: a sector, gas, province or district keeps its own card set.
 */
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { shown } from "@/lib/envelope";
import { cellUnit, gasLabel, periodShort, periodSpanWords } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { SNAPSHOT } from "@/components/overview/copy";
import type { Scope } from "../cards";
import { DeckCard, Pending } from "./DeckCard";
import { CHIP, sentenceOf } from "./SnapshotCard";
import { lowerName, rankedCells } from "./data";
import { sectorLabel } from "@/lib/labels";

/** The atlas-style year rail: one tick per fiscal period, the chosen one flagged. */
function YearRail({ periods, current, onPick, labels }: { periods: string[]; current: string; onPick: (id: string) => void; labels: Parameters<typeof periodShort>[0] }) {
  return (
    <div className="mt-4 flex items-end justify-between gap-1" role="radiogroup" aria-label="Fiscal year" data-testid="year-rail">
      {periods.map((id) => {
        const on = id === current;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(id)}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1"
            data-testid={`rail-${id}`}
          >
            <span className={`h-3 w-0.5 rounded-full transition-colors ${on ? "h-4 w-1 bg-accent" : "bg-line group-hover:bg-muted"}`} aria-hidden="true" />
            <span className={`num text-[10px] leading-none ${on ? "font-semibold text-accent" : "text-muted group-hover:text-fg"}`}>
              {periodShort(labels, id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OverviewPanel({ id, scope, deck, place, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; place: string; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { state, setState, labels, dims, release } = useExplorer();
  const env = deck.total.data;
  const cell = env?.values[0];
  const period = periodShort(labels, state.period);

  const top = rankedCells(deck.breakdown.data)[0] ?? null;
  const topName = top ? sectorLabel(labels, top.group?.[deck.bodies.breakdown.key]) : "";
  const sentence = cell ? sentenceOf({ scope, place, period, cell, top, topName, labels }) : null;

  const series = deck.series.data;
  const change = series?.change;
  const seriesCells = series?.values.filter((x) => typeof x.value === "number") ?? [];
  const reference = dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
  const points: ColumnPoint[] = seriesCells.map((x) => ({ id: x.group?.period_id ?? "", name: periodShort(labels, x.group?.period_id ?? ""), value: x.value as number, label: shown(x), reference: x.group?.period_id === reference }));
  const last = seriesCells[seriesCells.length - 1];
  const verb = change?.direction === "rose" ? "increased" : change?.direction === "fell" ? "decreased" : "changed";
  const limitation = release.known_limitations.find((l) => /longitudinal|trend/i.test(String(l.id ?? "")));

  const gases = (deck.gases.data?.values ?? []).filter((c) => typeof c.value === "number");

  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence} note={limitation ? String(limitation.message ?? limitation.id) : undefined}>
      {cell ? (
        <div className="relative" data-testid="overview-figure">
          <ContourMotif corner="bottom-right" />
          <div className="relative flex flex-wrap items-baseline gap-x-2">
            <span className="num text-4xl font-semibold tracking-tight text-accent" data-testid="overview-display" title={`${cell.display} ${cell.unit}`}>{shown(cell)}</span>
            <span className="text-sm text-muted">{cellUnit(cell)}</span>
          </div>
          {top && top.share_pct_short ? (
            <span className={`${CHIP} mt-2`} data-testid="overview-chip">{SNAPSHOT.from(top.share_pct_short, lowerName(topName))}</span>
          ) : null}
        </div>
      ) : (
        <Pending q={deck.total} what="the national total" />
      )}

      <YearRail periods={dims.fiscalPeriods} current={state.period} onPick={(p) => setState({ period: p })} labels={labels} />

      <div className="mt-4" data-testid="overview-series">
        {series ? <ColumnChart points={points} ticks={series.axis?.ticks_short} /> : <Pending q={deck.series} what="the annual series" />}
        {change && last ? (
          <p className="mt-2 text-xs text-muted" data-testid="overview-change">
            Between <b>{periodShort(labels, change.from_period)}</b> and <b>{periodShort(labels, change.to_period)}</b>, emissions {verb} by <b className="num whitespace-nowrap">{change.change_pct_short} %</b>, from <b className="num whitespace-nowrap">{change.from_short} {magnitudeOf(last)}</b> to <b className="num whitespace-nowrap">{change.to_short} {cellUnit(last)}</b>. <span className="text-muted/80">{periodSpanWords(labels, reference)}</span>
          </p>
        ) : null}
      </div>

      {gases.length > 0 && (
        <div className="mt-4 border-t border-line pt-3" data-testid="overview-gases">
          <div className="micro mb-2">By gas</div>
          <div className="grid grid-cols-3 gap-2">
            {gases.map((g) => (
              <div key={String(g.group?.gas ?? "")} className="rounded-xl border border-line bg-surface px-3 py-2" data-testid={`gas-${g.group?.gas}`}>
                <div className="text-xs font-medium text-muted">{gasLabel(labels, g.group?.gas ?? "")}</div>
                <div className="num mt-0.5 text-sm font-semibold text-fg">{shown(g)}</div>
                <div className="text-micro normal-case tracking-normal text-muted">
                  {cellUnit(g)}{g.share_pct_short ? <> · <span className="num">{g.share_pct_short} %</span></> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DeckCard>
  );
}
