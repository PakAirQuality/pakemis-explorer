"use client";
/**
 * Where the mass sits, and how the selection stands among its own kind — one card, two faces.
 *
 * · **Where it is placed** (Pakistan, or a chosen sector): every province ordered by the server,
 *   with the envelope's `derived` placed / unallocated sentence beneath, so the reader sees at
 *   once how much of the total the release places at all.
 * · **How it compares** (a province, a district): the same bars for the provinces (four and the combined remainder), or the
 *   districts of the selected district's own province, with the selection marked. The order is
 *   the server's — its `rank` where it attaches one, else the `order_by: "value desc"` it was
 *   asked for. The browser never ranks by value itself, and where the release attaches no rank
 *   (an ADM2 partition of bounded intervals) the card names no position.
 *
 * The release answers provinces and districts annually for every fiscal year, so off the reference
 * year the card still ranks; only what the release refuses (a month of an earlier year, say) is
 * carried as its typed refusal by name instead of an empty chart.
 */
import type { ReactNode } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { shown, type Cell } from "@/lib/envelope";
import { districtName, geographyName, viewLabel } from "@/lib/labels";
import { rampByRank } from "@/lib/palette";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import type { Scope } from "../cards";
import { DeckCard, Pending, Figure } from "./DeckCard";
import { rankedCells } from "./data";


export function RankingCard({ id, scope, deck, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { state, setState, labels, dims } = useExplorer();
  const districts = id === "peers" && scope.kind === "district";
  const q = districts ? deck.peers : deck.provinces;
  const env = q.data;
  const key = districts ? "shape_id" : "province";
  const cells = rankedCells(env);
  const selected = scope.kind === "province" || scope.kind === "district" ? scope.geo : null;
  const label = (x: Cell) => {
    const gid = x.group?.[key] ?? "";
    return districts ? districtName(dims, gid) : geographyName(labels, gid);
  };
  const chosen = selected ? cells.find((x) => x.group?.[key] === selected) ?? null : cells[0] ?? null;
  const sentence: ReactNode = chosen ? (id === "places" ? <PlacedSentence chosen={chosen} n={cells.length} /> : <StandingSentence cell={chosen} name={label(chosen)} n={cells.length} what={districts ? "districts in the same province" : "provinces"} />) : null;
  const items: BarItem[] = cells.map((x, i) => ({ id: x.group?.[key] ?? "", name: label(x), value: x.value as number, label: x.share_pct_short ? `${shown(x)} · ${x.share_pct_short} %` : shown(x), color: rampByRank(i, cells.length), dim: !!selected && x.group?.[key] !== selected }));
  const view = viewLabel(labels, state.view);
  const pick = (gid: string) => (districts ? setState({ level: "adm2", geo: gid }) : setState({ level: "adm1", geo: gid === selected ? null : gid }));
  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence} caption={`${districts ? "Allocated at district level" : "Allocated at province level"} · ${view.split(":")[0]}`}>
      {env ? (
        <BarsWithAxis items={items} ticks={env.axis?.ticks_short} onSelect={pick} testId={`${id}-bars`} />
      ) : (
        <Pending q={q} what={districts ? "the districts" : "the provinces"} />
      )}
    </DeckCard>
  );
}

/**
 * "Punjab carried 228.72 Mt of the allocated total — 50.6 %, the largest provincial share."
 * The share and the rank are the server's own; the retained mass stays on the placement card
 * and in the envelope's unallocated block, not in this sentence.
 */
function PlacedSentence({ chosen, n }: { chosen: Cell; n: number }) {
  const { labels } = useExplorer();
  const rank = typeof chosen.rank === "number" ? chosen.rank : null;
  return (
    <>
      <b>{geographyName(labels, chosen.group?.province ?? "")}</b> carried <Figure cell={chosen} /> of the allocated total
      {chosen.share_pct_short ? (
        <>
          {" "}
          — <b className="num">{chosen.share_pct_short} %</b>
          {rank === 1 ? ", the largest provincial share" : rank ? <>, ranked <b className="num">{String(rank)}</b> of <b className="num">{String(n)}</b> provinces</> : null}
        </>
      ) : null}
      .
    </>
  );
}

/** "Punjab is 1 of 5 provinces, at 228.72 Mt (50.6 %)" — the rank and the share are the server's. */
function StandingSentence({ cell, name, n, what }: { cell: Cell; name: string; n: number; what: string }) {
  return (
    <>
      <b>{name}</b>
      {typeof cell.rank === "number" ? (
        <>
          {" "}
          is <b className="num">{String(cell.rank)}</b> of <b className="num">{String(n)}</b> {what}, at{" "}
        </>
      ) : (
        <> is one of <b className="num">{String(n)}</b> {what}, at </>
      )}
      <Figure cell={cell} />
      {cell.share_pct_short ? (
        <>
          {" "}
          (<b className="num">{cell.share_pct_short} %</b>)
        </>
      ) : null}
      .
    </>
  );
}
