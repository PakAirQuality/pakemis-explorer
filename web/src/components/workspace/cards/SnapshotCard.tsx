"use client";
/**
 * The deck's first card: what is selected, as one figure. The total in large type with the
 * cell's own unit and, where the release bounds it, its interval badge; then the saffron chip —
 * for Pakistan "49.4 % from agriculture" (the rank-1 cell of the sector partition), for a
 * sector, a gas or a province the share the SERVER attached to that cell in its partition, with
 * the rank beside it; then the opening sentence. (The meta line — "Reference estimate · land use
 * excluded · evidence and uncertainty available" — was removed on 2026-08-31; the estimate, the
 * basis and the land-use exclusion are stated by the filter panel's Showing line and by
 * this card's own envelope.)
 *
 * Every number is a server string: `display_short`, `share_pct_short`, `rank`. The share and the
 * rank are read off the partition envelope's own cell — where the release attaches neither (an
 * ADM2 partition, whose cells are bounded intervals), the card prints neither rather than
 * dividing two numbers in the browser.
 */
import type { ReactNode } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { shown } from "@/lib/envelope";
import { cellUnit, gasLabel, geographyName, periodShort, sectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { SNAPSHOT } from "@/components/overview/copy";
import type { Scope } from "../cards";
import { DeckCard, Pending, Figure } from "./DeckCard";
import { cellFor, lowerName, rankedCells } from "./data";

export const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-amber/50 bg-amber/15 px-3 py-1 text-xs font-medium text-fg";

export function SnapshotCard({ id, scope, deck, place, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; place: string; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { state, labels } = useExplorer();
  const env = deck.total.data;
  const cell = env?.values[0];
  const period = periodShort(labels, state.period);

  // the chip: nationally the largest sector of the partition; elsewhere the selected cell's own share
  const ranked = deck.bodies.ranked;
  const mine = ranked ? cellFor(deck.ranked.data, ranked.key, ranked.id) : null;
  const top = scope.kind === "national" ? rankedCells(deck.breakdown.data)[0] : null;
  const topName = top ? sectorLabel(labels, top.group?.[deck.bodies.breakdown.key]) : "";
  const chip: ReactNode =
    top && top.share_pct_short ? (
      <span className={CHIP} data-testid="snapshot-chip">{SNAPSHOT.from(top.share_pct_short, lowerName(topName))}</span>
    ) : mine && mine.share_pct_short ? (
      <span className={CHIP} data-testid="snapshot-chip">
        <b className="num">{mine.share_pct_short} %</b> of {scopeWholeWords(scope)}
        {typeof mine.rank === "number" && deck.ranked.data ? <> · rank <b className="num">{String(mine.rank)}</b> of <b className="num">{String(deck.ranked.data.values.length)}</b></> : null}
      </span>
    ) : null;

  const sentence: ReactNode = cell ? sentenceOf({ scope, place, period, cell, top, topName, labels }) : null;

  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence}>
      {cell ? (
        <div className="relative" data-testid="snapshot-figure">
          <ContourMotif corner="bottom-right" />
          <div className="relative flex flex-wrap items-baseline gap-x-2">
            <span className="num text-3xl font-semibold tracking-tight text-accent" data-testid="snapshot-display" title={`${cell.display} ${cell.unit}`}>{shown(cell)}</span>
            <span className="text-sm text-muted" data-testid="snapshot-unit">{cellUnit(cell)}</span>
            {isBounded(cell) && <IntervalBadge cell={cell} title={String((cell as Record<string, unknown>).interpretation ?? "")} />}
          </div>
          {chip && <div className="relative mt-2">{chip}</div>}
        </div>
      ) : (
        <Pending q={deck.total} what={whatWords(scope, place)} />
      )}
    </DeckCard>
  );
}

/** "the reconstructed inventory" / "the province's allocated total": what the share is a share OF. */
export function scopeWholeWords(scope: Scope): string {
  if (scope.kind === "sector" || scope.kind === "gas") return "the national total";
  if (scope.kind === "province") return "the national allocated total";
  return "the total";
}

function whatWords(scope: Scope, place: string): string {
  if (scope.kind === "sector") return "the sector total";
  if (scope.kind === "gas") return "the gas total";
  if (scope.kind === "national") return "the national total";
  return `the ${place} total`;
}

/**
 * The opening sentence, in the release's own words and the server's own strings: "In 2023–24,
 * Pakistan emitted an estimated 452.35 Mt CO₂e. Agriculture contributed 223.45 Mt, accounting
 * for 49.4 % of the total."
 */
export function sentenceOf({ scope, place, period, cell, top, topName, labels }: { scope: Scope; place: string; period: string; cell: NonNullable<ReturnType<typeof rankedCells>>[number]; top: ReturnType<typeof rankedCells>[number] | null; topName: string; labels: Parameters<typeof sectorLabel>[0] }): ReactNode {
  const figure = (
    <b className="num whitespace-nowrap">
      {shown(cell)} {cellUnit(cell)}
    </b>
  );
  if (scope.kind === "sector")
    return (
      <>
        In <b>{period}</b>, {lowerName(sectorLabel(labels, scope.sector))} emitted {figure} across Pakistan.
      </>
    );
  if (scope.kind === "gas")
    return (
      <>
        In <b>{period}</b>, Pakistan emitted {figure} of {lowerName(gasLabel(labels, scope.gas))}, on the release&apos;s reported warming potentials.
      </>
    );
  if (scope.kind === "province" || scope.kind === "district")
    return (
      <>
        In <b>{period}</b>, {geographyName(labels, place)}&apos;s allocated emissions were {figure}.
      </>
    );
  return (
    <>
      In <b>{period}</b>, {place} emitted an estimated {figure}.
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
  );
}
