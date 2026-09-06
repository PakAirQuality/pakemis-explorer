"use client";
/**
 * What the selection is made of, as one bar chart of the server's own one-key breakdown. The key
 * is the scope's, and the card says which one it used: `sector_id` for Pakistan and for a gas
 * ("which sectors emit it"), `category` for a chosen sector ("what makes it up" — its IPCC
 * categories), `module` for a province or a district. The release carries `category` and
 * `sector_id` at national grain only, so a sector chosen while a place is selected asks for the
 * key the reader asked about and the card prints the release's own typed refusal by name — it
 * never falls back to another key behind the reader's back.
 *
 * Bars are sized by `value` and coloured by rank (the PAQI ramp); every label beside a bar is
 * the cell's `display_short` and, where the partition has one, `share_pct_short`. Clicking a
 * sector bar steers the map without touching the URL (the hover/pick stays local, as the
 * workspace's own rule has it); the "Explore the inventory" link carries the scope to /data.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, configLabel, gasLabel, gwpLabel, gwpTooltip, periodShort, sectorLabel } from "@/lib/labels";
import { rampByRank } from "@/lib/palette";
import { hrefForState } from "@/lib/urlState";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { LINKS } from "@/components/overview/copy";
import type { Scope } from "../cards";
import { DeckCard, Pending, Figure, Share } from "./DeckCard";
import { lowerName, rankedCells } from "./data";

const LINK = "inline-flex items-center text-xs font-semibold text-accent hover:underline";

export function BreakdownCard({ id, scope, deck, title, open, onToggle, onSector, selected }: { id: string; scope: Scope; deck: Deck; title: string; open: boolean; onToggle: (open: boolean) => void; onSector?: (id: string | null) => void; selected?: string | null }) {
  const { state, labels, defaults } = useExplorer();
  const env = deck.breakdown.data;
  const key = deck.bodies.breakdown.key;
  const cells = rankedCells(env);
  const name = (c: Cell) => nameOf(labels, key, c.group?.[key] ?? "");
  const [a, b, c] = cells;
  const sentence: ReactNode = a ? (
    <>
      In <b>{periodShort(labels, state.period)}</b>, {lowerName(name(a))} was the largest source of emissions, contributing <Figure cell={a} unit={cellUnit(a)} />
      {a.share_pct_short ? <> (<Share cell={a} />)</> : null}.
      {b ? (
        <>
          {" "}
          {name(b)} followed at <Figure cell={b} />
          {b.share_pct_short ? <> (<Share cell={b} />)</> : null}
          {c ? (
            <>
              , with {lowerName(name(c))} at <Figure cell={c} />
              {c.share_pct_short ? <> (<Share cell={c} />)</> : null}
            </>
          ) : null}
          .
        </>
      ) : null}
    </>
  ) : null;
  const items: BarItem[] = cells.map((x, i) => {
    const gid = x.group?.[key] ?? "";
    return { id: gid, name: nameOf(labels, key, gid), value: x.value as number, label: x.share_pct_short ? `${shown(x)} · ${x.share_pct_short} %` : shown(x), color: rampByRank(i, cells.length), dim: !!selected && selected !== gid };
  });
  const caption = [configLabel(labels, state.config), `${gwpLabel(labels, state.gwp)} warming potentials`].filter(Boolean).join(" · ");
  const sectorBars = key === "sector_id" || key === "module";
  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence} caption={<span title={gwpTooltip(labels, state.gwp)}>{caption}</span>}>
      {env ? (
        <>
          <BarsWithAxis items={items} ticks={env.axis?.ticks_short} onHover={sectorBars ? (x) => onSector?.(x ?? selected ?? null) : undefined} onSelect={sectorBars ? (x) => onSector?.(selected === x ? null : x) : undefined} testId={`${id}-bars`} />
          <div className="mt-1 flex justify-end">
            <Link href={hrefForState({ ...state, sector: selected ?? state.sector }, defaults, "/data")} className={LINK} data-testid={`${id}-link`}>{LINKS.inventory}</Link>
          </div>
        </>
      ) : (
        <Pending q={deck.breakdown} what={whatWords(scope, key)} />
      )}
    </DeckCard>
  );
}

/** A group value's words: a sector or a module through the release's sector labels, a category as the release names it. */
function nameOf(labels: Parameters<typeof sectorLabel>[0], key: string, value: string): string {
  if (key === "category") return value;
  if (key === "gas") return gasLabel(labels, value);
  return sectorLabel(labels, value);
}

function whatWords(scope: Scope, key: string): string {
  if (key === "category") return "the categories";
  if (scope.kind === "province" || scope.kind === "district") return "the composition";
  return "the sectors";
}
