"use client";
/**
 * The deck's first card: what is selected, as one figure. The total in large type with the
 * cell's own unit and, where the release bounds it, its interval badge; then the saffron chip —
 * for Pakistan "49.4 % from agriculture" (the rank-1 cell of the sector partition), for a
 * sector, a gas or a province the share the SERVER attached to that cell in its partition, with
 * the rank beside it; then the opening sentence; then the meta line, "Reference estimate · land
 * use excluded · evidence and uncertainty available", whose last part opens Result details on
 * this card's own envelope.
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
import { cellUnit, configLabel, gasLabel, geographyName, lulucfCompact, lulucfShort, periodShort, sectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { useEnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { RESULT_DETAILS_TITLE } from "@/components/ui/ReceiptFooter";
import { SNAPSHOT } from "@/components/overview/copy";
import type { Scope } from "../cards";
import { DeckCard, Pending, Figure } from "./DeckCard";
import { cellFor, lowerName, rankedCells } from "./data";

const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-amber/50 bg-amber/15 px-3 py-1 text-xs font-medium text-fg";

export function SnapshotCard({ id, scope, deck, place, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; place: string; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { state, labels } = useExplorer();
  const drawer = useEnvelopeDrawer(labels);
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
  const meta = [configLabel(labels, state.config), lulucfCompact(labels)].filter(Boolean).join(" · ");

  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence}>
      {cell ? (
        <div data-testid="snapshot-figure">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="num text-3xl font-semibold tracking-tight text-fg" data-testid="snapshot-display" title={`${cell.display} ${cell.unit}`}>{shown(cell)}</span>
            <span className="text-sm text-muted" data-testid="snapshot-unit">{cellUnit(cell)}</span>
            {isBounded(cell) && <IntervalBadge cell={cell} title={String((cell as Record<string, unknown>).interpretation ?? "")} />}
          </div>
          {chip && <div className="mt-2">{chip}</div>}
          <p className="caption mt-3" data-testid="snapshot-meta">
            {meta}
            {env ? (
              <>
                {" · "}
                <button type="button" onClick={() => drawer.open(env, "sources")} className="font-semibold text-accent hover:underline" title={RESULT_DETAILS_TITLE} data-testid="snapshot-details">
                  {SNAPSHOT.evidence}
                </button>
              </>
            ) : null}
          </p>
          {drawer.node}
        </div>
      ) : (
        <Pending q={deck.total} what={whatWords(scope, place)} />
      )}
    </DeckCard>
  );
}

/** "the reconstructed inventory" / "the province's allocated total": what the share is a share OF. */
function scopeWholeWords(scope: Scope): string {
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
 * Pakistan emitted an estimated 452.35 Mt CO₂e. Agriculture accounted for 223.45 Mt — 49.4 %,
 * nearly half — of the reconstructed inventory, which excludes land use and forestry."
 */
function sentenceOf({ scope, place, period, cell, top, topName, labels }: { scope: Scope; place: string; period: string; cell: NonNullable<ReturnType<typeof rankedCells>>[number]; top: ReturnType<typeof rankedCells>[number] | null; topName: string; labels: Parameters<typeof sectorLabel>[0] }): ReactNode {
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
          {topName} accounted for <Figure cell={top} unit={magnitudeOf(top)} />
          {top.share_pct_short ? (
            <>
              {" "}
              — <b className="num">{top.share_pct_short} %</b>
              {top.share_phrase ? `, ${top.share_phrase}` : ""} —
            </>
          ) : null}{" "}
          of the reconstructed inventory, which {lulucfShort(labels)}.
        </>
      ) : null}
    </>
  );
}
