"use client";
/**
 * The rail's KEY FINDING card: the span-level answer in words - the bold sentence,
 * the largest contributor, the overall relative change (the compare function's own
 * percent cell) and the largest offsetting source. Its compare bodies are identical
 * to the change card's, so the cache serves both from one fetch. The drill never
 * reaches this card: the rail always states the whole span.
 */
import { useExplorer } from "@/components/ExplorerContext";
import { useCompare } from "@/lib/queries";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { type Cell } from "@/lib/envelope";
import { DECK_CARD } from "@/components/overview/deck";
import { ANALYZE } from "./copy";
import { alignedDeltas, side, signed } from "./ChangeSection";
import type { AnalyzeSettings } from "./Analyze";

export function KeyFindingCard({ settings }: { settings: AnalyzeSettings }) {
  const { labels } = useExplorer();
  const { from: fromP, to: toP, gases } = settings;
  const gasFilter = gases ? { gases } : {};
  const enabled = !!fromP && !!toP && fromP !== toP;
  const total = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "absolute" }, enabled);
  const relative = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "relative" }, enabled);
  const cmp = useCompare({ left: { periods: [fromP], group_by: ["sector_id"], ...gasFilter }, right: { periods: [toP], group_by: ["sector_id"], ...gasFilter }, mode: "absolute" }, enabled);

  const totalCell = total.data?.values[0];
  const relCell = relative.data?.values[0];
  const tLeft = totalCell ? side(totalCell, "left") : undefined;
  const deltas = alignedDeltas(cmp.data?.values, "sector_id");
  const top = deltas[0];
  const largestOffset = deltas.find(({ c }) => (c.value as number) < 0);
  const unit = tLeft ? cellUnit(tLeft as Cell) : "Mt CO₂e";
  const grew = (totalCell?.value ?? 0) >= 0;

  return (
    <section className={DECK_CARD} data-testid="change-key-finding">
      <div className="micro text-accent">{ANALYZE.change.keyFinding}</div>
      {totalCell && top ? (
        <>
          <p className="mt-2 text-[17px] font-semibold leading-snug text-fg" data-testid="change-finding">
            Emissions {grew ? "increased" : "decreased"} by <span className="num whitespace-nowrap">{signed(totalCell)} {unit}</span> between {periodShort(labels, fromP)} and {periodShort(labels, toP)}.
          </p>
          <p className="mt-1.5 text-sm text-muted" data-testid="change-finding-top">
            {sectorLabel(labels, top.id)} contributed the largest {(top.c.value as number) >= 0 ? "increase" : "decrease"}: <b className="num whitespace-nowrap text-fg">{signed(top.c)} {unit}</b>.
          </p>
          <dl className="mt-3.5 flex flex-col gap-1.5 text-sm">
            {relCell && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                <dt className="text-muted">{ANALYZE.change.overallChange}</dt>
                <dd className="num font-semibold text-fg" data-testid="change-overall-pct">{signed(relCell)} %</dd>
              </div>
            )}
            {largestOffset && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                <dt className="text-muted">{ANALYZE.change.largestOffset}</dt>
                <dd className="num font-semibold text-fg" data-testid="change-largest-offset">{sectorLabel(labels, largestOffset.id)} {signed(largestOffset.c)}</dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Comparing…</p>
      )}
    </section>
  );
}
