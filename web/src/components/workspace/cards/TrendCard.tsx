"use client";
/**
 * How the selection changed across the release's nine years: the annual series in the current
 * scope as columns, the reference year marked, and the server's own `change` block as the
 * sentence — from-period, to-period, direction, `from_short`, `to_short`, `change_short` and
 * `change_pct_short`. The browser subtracts nothing. The release's longitudinal limitation, when
 * it carries one, is the card's amber note.
 */
import type { ReactNode } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { shown } from "@/lib/envelope";
import { cellUnit, periodShort, periodSpanWords } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import type { Scope } from "../cards";
import { DeckCard, Pending } from "./DeckCard";

export function TrendCard({ id, scope, deck, place, title, open, onToggle }: { id: string; scope: Scope; deck: Deck; place: string; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { labels, release, dims } = useExplorer();
  const env = deck.series.data;
  const change = env?.change;
  const cells = env?.values.filter((x) => typeof x.value === "number") ?? [];
  const reference = dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
  const last = cells[cells.length - 1];
  const subject = scope.kind === "national" ? `${place}'s emissions` : "it";
  // the server's typed direction, in the sentence's own verbs; the signed pct stays verbatim
  const verb = change?.direction === "rose" ? "increased" : change?.direction === "fell" ? "decreased" : "changed";
  const sentence: ReactNode = change ? (
    <>
      Between <b>{periodShort(labels, change.from_period)}</b> and <b>{periodShort(labels, change.to_period)}</b>, {subject} {verb} by <b className="num whitespace-nowrap">{change.change_pct_short} %</b>, from <b className="num whitespace-nowrap">{change.from_short} {magnitudeOf(last)}</b> to <b className="num whitespace-nowrap">{change.to_short} {cellUnit(last)}</b>.
    </>
  ) : null;
  const points: ColumnPoint[] = cells.map((x) => ({ id: x.group?.period_id ?? "", name: periodShort(labels, x.group?.period_id ?? ""), value: x.value as number, label: shown(x), reference: x.group?.period_id === reference }));
  const limitation = release.known_limitations.find((l) => /longitudinal|trend/i.test(String(l.id ?? "")));
  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} sentence={sentence} note={limitation ? String(limitation.message ?? limitation.id) : undefined} caption={["Annual totals", periodSpanWords(labels, reference)].filter(Boolean).join(" · ")}>
      {env ? <ColumnChart points={points} ticks={env.axis?.ticks_short} /> : <Pending q={deck.series} what="the annual series" />}
    </DeckCard>
  );
}
