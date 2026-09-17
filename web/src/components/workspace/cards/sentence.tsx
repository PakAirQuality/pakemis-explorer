"use client";
/**
 * The overview panel's words: the opening sentence in the release's own words and the server's
 * own strings, what a share is a share OF, and what the pending figure is called. Every number
 * here is a server string (`display_short`, `share_pct_short`, `rank`) - the browser divides
 * nothing. (These were the snapshot card's until 2026-09-17, when the overview panel took over
 * every scope and the single-year snapshot and trend cards went.)
 */
import type { ReactNode } from "react";
import { shown } from "@/lib/envelope";
import { cellUnit, gasLabel, geographyName, sectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import type { Scope } from "../cards";
import { Figure } from "./DeckCard";
import { lowerName, rankedCells } from "./data";

export const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-amber/50 bg-amber/15 px-3 py-1 text-xs font-medium text-fg";

/** "the reconstructed inventory" / "the province's allocated total": what the share is a share OF. */
export function scopeWholeWords(scope: Scope): string {
  if (scope.kind === "sector" || scope.kind === "gas") return "the national total";
  if (scope.kind === "province") return "the national allocated total";
  return "the total";
}

export function whatWords(scope: Scope, place: string): string {
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
