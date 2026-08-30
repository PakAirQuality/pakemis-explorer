"use client";
/**
 * The briefing's four widgets (Sectors, Trend, Gases, Places), each a Widget in the deck's card
 * chrome (title, toolbar: info -> Result details on the widget's envelope, download -> its CSV,
 * share -> the link, then the switch that collapses the card to its header row; a sentence
 * with bold server strings; the figure; an optional amber note; a caption). `open` and
 * `onToggle` are the Overview's per-card state (the deck's collapse-all flips them together).
 * Every printed number is a server string: `display_short`, `share_pct_short`,
 * `share_phrase`, `change.*`, `derived.*`, `axis.ticks_short`; the client computes nothing. A
 * refused scope shows the API's typed refusal. The interval, completeness and evidence
 * widgets left the Overview on 2026-08-30; Explore and Methods carry those envelopes.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import type { Briefing } from "@/lib/queries";
import { shown, type Cell, type Envelope } from "@/lib/envelope";
import { cellUnit, configLabel, gasLabel, geographyName, gwpLabel, gwpTooltip, lulucfCompact, periodShort, periodSpanWords, sectorLabel, viewLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { gasColor, sectorColor, ACCENT } from "@/lib/palette";
import { hrefForState } from "@/lib/urlState";
import { Widget } from "@/components/ui/Widget";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { StackedBar, type Segment } from "@/components/charts/StackedBar";
import { GAS_WORDS, LINKS, WIDGETS } from "./copy";
import { DECK_CARD } from "./deck";
import { lowerName } from "./OpeningStatement";

export type WidgetProps = { data: Briefing; geo: string | null; place: string; open: boolean; onToggle: (open: boolean) => void };

const LINK = "inline-flex items-center text-xs font-semibold text-accent hover:underline";

/** The numeric cells of a one-key breakdown in rank order (the server's `rank`, else the envelope's order). */
export function rankedCells(env: Envelope | null | undefined): Cell[] {
  const cells = (env?.values ?? []).filter((c) => typeof c.value === "number");
  return cells.every((c) => typeof c.rank === "number") ? [...cells].sort((a, b) => (a.rank as number) - (b.rank as number)) : cells;
}

/** The widget body while an envelope is loading or refused. */
function Pending({ q, what }: { q: { error?: unknown; isLoading?: boolean }; what: string }) {
  if (q.error) return <RefusalCard error={q.error} compact />;
  return <Loading what={what} />;
}

function Figure({ cell, unit }: { cell: Cell; unit?: string }) {
  return <b className="num whitespace-nowrap">{shown(cell)} {unit ?? magnitudeOf(cell)}</b>;
}
function Share({ cell }: { cell: Cell }) {
  return <b className="num whitespace-nowrap">{cell.share_pct_short} %</b>;
}

// --- EMISSIONS BY SECTOR
export function SectorWidget({ data, place, open, onToggle, onHover, onSelect, selected }: WidgetProps & { onHover: (id: string | null) => void; onSelect: (id: string) => void; selected: string | null }) {
  const { state, labels, defaults } = useExplorer();
  const env = data.bySector.data;
  const key = data.bodies.sectorKey;
  const cells = rankedCells(env);
  const id = (c: Cell) => c.group?.[key] ?? "";
  const [a, b, c] = cells;
  const sentence: ReactNode = a ? (
    <>
      In <b>{periodShort(labels, state.period)}</b>, {lowerName(sectorLabel(labels, id(a)))} was the largest source at <Figure cell={a} />{a.share_pct_short ? <> (<Share cell={a} />)</> : null}
      {b ? <>, followed by {lowerName(sectorLabel(labels, id(b)))} (<Figure cell={b} />{b.share_pct_short ? <>, <Share cell={b} /></> : null})</> : null}
      {c ? <> and {lowerName(sectorLabel(labels, id(c)))} (<Figure cell={c} />{c.share_pct_short ? <>, <Share cell={c} /></> : null})</> : null}.
    </>
  ) : null;
  const items: BarItem[] = cells.map((x) => ({ id: id(x), name: sectorLabel(labels, id(x)), value: x.value as number, label: x.share_pct_short ? `${shown(x)} · ${x.share_pct_short} %` : shown(x), color: sectorColor(id(x)), dim: !!selected && selected !== id(x) }));
  const caption = [configLabel(labels, state.config), `${gwpLabel(labels, state.gwp)} warming potentials`, lulucfCompact(labels)].filter(Boolean).join(" · ");
  return (
    <Widget id="sectors" chrome={DECK_CARD} open={open} onToggle={onToggle} title={`${WIDGETS.sectors} in ${place}`} env={env} labels={labels} sentence={sentence} caption={<span title={gwpTooltip(labels, state.gwp)}>{caption}</span>} testId="sector-widget">
      {env ? (
        <>
          <BarsWithAxis items={items} ticks={env.axis?.ticks_short} onHover={onHover} onSelect={onSelect} />
          <div className="mt-1 flex justify-end">
            <Link href={hrefForState({ ...state, sector: selected }, defaults, "/explore")} className={LINK} data-testid="sectors-link">Explore the inventory →</Link>
          </div>
        </>
      ) : (
        <Pending q={data.bySector} what="the sectors" />
      )}
    </Widget>
  );
}

// --- EMISSIONS OVER TIME
export function TrendWidget({ data, place, open, onToggle }: WidgetProps) {
  const { labels, release, dims } = useExplorer();
  const env = data.series.data;
  const change = env?.change;
  const cells = env?.values.filter((x) => typeof x.value === "number") ?? [];
  const reference = dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
  const last = cells[cells.length - 1];
  const sentence: ReactNode = change ? (
    <>
      From <b>{periodShort(labels, change.from_period)}</b> to <b>{periodShort(labels, change.to_period)}</b>, {place}&apos;s emissions {change.direction || "changed"} from <b className="num whitespace-nowrap">{change.from_short} {magnitudeOf(last)}</b> to <b className="num whitespace-nowrap">{change.to_short} {cellUnit(last)}</b>, a change of <b className="num whitespace-nowrap">{change.change_short} {magnitudeOf(last)}</b> (<b className="num whitespace-nowrap">{change.change_pct_short} %</b>).
    </>
  ) : null;
  const points: ColumnPoint[] = cells.map((x) => ({ id: x.group?.period_id ?? "", name: periodShort(labels, x.group?.period_id ?? ""), value: x.value as number, label: shown(x), reference: x.group?.period_id === reference }));
  const limitation = release.known_limitations.find((l) => /longitudinal|trend/i.test(String(l.id ?? "")));
  const span = periodSpanWords(labels, reference);
  return (
    <Widget id="trend" chrome={DECK_CARD} open={open} onToggle={onToggle} title={WIDGETS.trend} env={env} labels={labels} sentence={sentence} note={limitation ? String(limitation.message ?? limitation.id) : undefined} caption={["Annual totals", span].filter(Boolean).join(" · ")} testId="trend-widget">
      {env ? <ColumnChart points={points} ticks={env.axis?.ticks_short} /> : <Pending q={data.series} what="the annual series" />}
    </Widget>
  );
}

// --- EMISSIONS BY GAS
export function GasWidget({ data, place, open, onToggle }: WidgetProps) {
  const { state, labels } = useExplorer();
  const env = data.byGas.data;
  const cells = rankedCells(env);
  const gasId = (x: Cell) => x.group?.gas ?? "";
  const word = (x: Cell, lower = false) => {
    const w = GAS_WORDS[gasId(x).toUpperCase()] ?? gasLabel(labels, gasId(x));
    return lower ? lowerName(w) : w;
  };
  const [a, ...rest] = cells;
  const sentence: ReactNode = a ? (
    <>
      {word(a)} made up <Figure cell={a} />{a.share_pct_short ? <> (<Share cell={a} />)</> : null} of {place}&apos;s CO₂-equivalent total
      {rest.length ? (
        <>
          ; {rest.map((x, i) => (
            <span key={gasId(x)}>
              {i > 0 ? " and " : ""}
              {word(x, true)} <Figure cell={x} />{x.share_pct_short ? <> (<Share cell={x} />)</> : null}
            </span>
          ))}
        </>
      ) : null}.
    </>
  ) : null;
  const segments: Segment[] = cells.map((x) => ({ id: gasId(x), name: gasLabel(labels, gasId(x)), value: x.value as number, label: shown(x), share: x.share_pct_short, color: gasColor(gasId(x)) }));
  return (
    <Widget id="gases" chrome={DECK_CARD} open={open} onToggle={onToggle} title={`${WIDGETS.gases} in ${place}`} env={env} labels={labels} sentence={sentence} caption={<span title={gwpTooltip(labels, state.gwp)}>CO₂-equivalent on {gwpLabel(labels, state.gwp)} warming potentials</span>} testId="gas-widget">
      {env ? <StackedBar segments={segments} unit={a ? magnitudeOf(a) : ""} /> : <Pending q={data.byGas} what="the gases" />}
    </Widget>
  );
}

// --- WHERE EMISSIONS ARE PLACED
export function PlacesWidget({ data, geo, open, onToggle, onPick }: WidgetProps & { onPick: (name: string) => void }) {
  const { state, labels, defaults } = useExplorer();
  const env = data.provinces.data;
  const cells = rankedCells(env);
  const name = (x: Cell) => x.group?.province ?? "";
  const chosen = geo ? cells.find((x) => name(x) === geo) ?? null : cells[0] ?? null;
  const derived = (geo ? data.total.data?.derived : env?.derived) as Record<string, unknown> | undefined;
  const retained = typeof derived?.unallocated_total_short === "string" ? derived.unallocated_total_short : "";
  const sentence: ReactNode = chosen ? (
    <>
      <b>{geographyName(labels, name(chosen))}</b> carried <Figure cell={chosen} /> of the allocated total
      {retained ? <>; <b className="num whitespace-nowrap">{retained} {magnitudeOf(chosen)}</b> was retained at provincial level and placed no finer</> : null}.
    </>
  ) : null;
  const items: BarItem[] = cells.map((x) => ({ id: name(x), name: geographyName(labels, name(x)), value: x.value as number, label: x.share_pct_short ? `${shown(x)} · ${x.share_pct_short} %` : shown(x), color: ACCENT, dim: !!geo && name(x) !== geo }));
  const view = viewLabel(labels, state.view);
  return (
    <Widget id="places" chrome={DECK_CARD} open={open} onToggle={onToggle} title={WIDGETS.places} env={env} labels={labels} sentence={sentence} caption={`Allocated at province level · ${view.split(":")[0]}`} testId="places-widget">
      {env ? (
        <>
          <BarsWithAxis items={items} ticks={env.axis?.ticks_short} onSelect={onPick} testId="places-bars" />
          <div className="mt-1 flex justify-end">
            <Link href={hrefForState({ ...state, geo, level: "adm1" }, defaults, "/map")} className={LINK} data-testid="places-link">{LINKS.openMap}</Link>
          </div>
        </>
      ) : (
        <Pending q={data.provinces} what="the provinces" />
      )}
    </Widget>
  );
}
