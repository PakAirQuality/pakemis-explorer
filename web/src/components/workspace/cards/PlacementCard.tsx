"use client";
/**
 * What is placed and what is not: the province's own `unallocated_short` beside the release's
 * `derived.placed_short` and `derived.unallocated_total_short`, said as one sentence, and then
 * the mass every province retains, from `derived.unallocated_by_province_short`. These are the
 * server's strings; the card never subtracts a placed total from a whole one, and where the
 * envelope carries no such block it says so rather than inventing a residual.
 */
import type { ReactNode } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { cellUnit, geographyName, periodShort } from "@/lib/labels";
import type { Scope } from "../cards";
import { DeckCard, Pending } from "./DeckCard";

type Derived = { unallocated_total_short?: string; placed_short?: string; unallocated_by_province_short?: Record<string, string> };

export function PlacementCard({ id, scope, deck, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { labels } = useExplorer();
  const env = deck.total.data;
  const cell = env?.values[0];
  const derived = (env?.derived ?? {}) as Derived;
  const unit = cellUnit(cell);
  const retained = typeof (cell as Record<string, unknown> | undefined)?.unallocated_short === "string" ? String((cell as Record<string, unknown>).unallocated_short) : derived.unallocated_total_short ?? "";
  const place = scope.kind === "province" || scope.kind === "district" ? geographyName(labels, scope.geo) : "";
  // THE YEAR IS THE BLOCK'S OWN. The API says which periods the retained mass is for
  // (`unallocated.periods`); for most of this card's life it was the reference year's under every
  // year's heading, and the card had no way to know. It is said from the answer, not the selection.
  const of = (env?.unallocated as { periods?: unknown } | undefined)?.periods;
  const year = Array.isArray(of) && of.length === 1 && typeof of[0] === "string" ? ` in ${periodShort(labels, of[0])}` : "";
  const sentence: ReactNode =
    derived.placed_short && derived.unallocated_total_short ? (
      <>
        Of {place}&apos;s allocated total{year}, <b className="num whitespace-nowrap">{derived.placed_short} {unit}</b> is placed at a finer grain and <b className="num whitespace-nowrap">{derived.unallocated_total_short} {unit}</b> is retained at province level, which no district receives.
      </>
    ) : retained ? (
      <>
        <b className="num whitespace-nowrap">{retained} {unit}</b> of {place}&apos;s allocated total{year} is retained at province level and placed no finer.
      </>
    ) : null;
  const rows = Object.entries(derived.unallocated_by_province_short ?? {});
  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence} caption="Retained where the release places it no finer">
      {env ? (
        rows.length ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs" data-testid="placement-rows">
            {rows.map(([province, value]) => (
              <div key={province} className="contents">
                <dt className="text-muted">{geographyName(labels, province)}</dt>
                <dd className="num text-right text-fg">{value} {unit}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted" data-testid="placement-none">The envelope carries no unallocated block for this scope.</p>
        )
      ) : (
        <Pending q={deck.total} what="the placement" />
      )}
    </DeckCard>
  );
}
