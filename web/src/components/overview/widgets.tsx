"use client";
/**
 * The briefing's widgets, each a Widget card (title, toolbar: info -> Result details on the
 * widget's envelope, download -> its CSV, share -> the link; a sentence with bold server
 * strings; the figure; an optional amber note; a caption). Every printed number is a server
 * string: `display_short`, `share_pct_short`, `share_phrase`, `interval_short`,
 * `quantiles_short`, `change.*`, `derived.*`, `axis.ticks_short`; the only client arithmetic
 * is counting rows (NE categories, streams). A refused scope shows the API's typed refusal.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import type { Briefing } from "@/lib/queries";
import { shown, type Cell, type Envelope } from "@/lib/envelope";
import { cellUnit, configLabel, gasLabel, geographyName, gwpLabel, gwpTooltip, lulucfCompact, periodShort, periodSpanWords, sectorLabel, viewLabel } from "@/lib/labels";
import { headlineCell, magnitudeOf } from "@/lib/uncertainty";
import { gasColor, sectorColor, ACCENT } from "@/lib/palette";
import { hrefForState } from "@/lib/urlState";
import { Widget } from "@/components/ui/Widget";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { IntervalBar, type IntervalRow } from "@/components/charts/IntervalBar";
import { StackedBar, type Segment } from "@/components/charts/StackedBar";
import { AXIS_LABEL, evidenceClassText, type EvidenceAxis } from "@/components/methods/evidenceClassText";
import { GAS_WORDS, LINKS, NOTES, WIDGETS } from "./copy";
import { lowerName } from "./OpeningStatement";

export type WidgetProps = { data: Briefing; geo: string | null; place: string };

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
export function SectorWidget({ data, place, onHover, onSelect, selected }: WidgetProps & { onHover: (id: string | null) => void; onSelect: (id: string) => void; selected: string | null }) {
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
    <Widget id="sectors" className="scroll-mt-28" title={`${WIDGETS.sectors} in ${place}`} env={env} labels={labels} sentence={sentence} caption={<span title={gwpTooltip(labels, state.gwp)}>{caption}</span>} testId="sector-widget">
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
export function TrendWidget({ data, place }: WidgetProps) {
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
    <Widget id="trend" className="scroll-mt-28" title={WIDGETS.trend} env={env} labels={labels} sentence={sentence} note={limitation ? String(limitation.message ?? limitation.id) : undefined} caption={["Annual totals", span].filter(Boolean).join(" · ")} testId="trend-widget">
      {env ? <ColumnChart points={points} ticks={env.axis?.ticks_short} /> : <Pending q={data.series} what="the annual series" />}
    </Widget>
  );
}

// --- HOW CERTAIN IS THE ESTIMATE
export function UncertaintyWidget({ data, geo }: WidgetProps) {
  const { labels } = useExplorer();
  const env = data.uncertainty.data;
  const head = headlineCell(env);
  const rows: IntervalRow[] = (env?.values ?? [])
    .filter((x) => x.interval_short && x.quantiles_short && typeof x.value === "number")
    .sort((x, y) => (x === head ? -1 : y === head ? 1 : 0))
    .map((x) => {
      const q = x.quantiles_short as Record<string, string>;
      const low = q["P2.5"] ?? "";
      const high = q["P97.5"] ?? "";
      return { id: String(x.scenario ?? x.scenario_label ?? ""), label: x.scenario_label ?? x.scenario ?? "", low, high, lowValue: Number(low), highValue: Number(high), median: shown(x), medianValue: x.value as number, headline: x === head };
    })
    .filter((r) => Number.isFinite(r.lowValue) && Number.isFinite(r.highValue));
  const national = geo ? null : data.total.data?.values[0];
  const marker = national && typeof national.value === "number" ? { label: "reference estimate", display: shown(national), value: national.value } : null;
  const how = head?.scenario === "cross_sector" ? "when emission factors are shared across modules" : head?.scenario_label ? `(${head.scenario_label})` : "";
  const sentence: ReactNode = head ? (
    <>
      The 95 % interval spans <b className="num whitespace-nowrap">{head.interval_short} {cellUnit(head)}</b> {how}; the Monte-Carlo median is <Figure cell={head} />.
    </>
  ) : null;
  const caption = [rows.map((r) => r.label).filter(Boolean).join(" · "), geo ? NOTES.intervalNational : "The reference estimate is marked; the interval bounds the national total."].filter(Boolean).join(". ");
  return (
    <Widget id="uncertainty" className="scroll-mt-28" title={WIDGETS.uncertainty} env={env} labels={labels} sentence={sentence} caption={caption} testId="uncertainty-widget">
      {env ? <IntervalBar rows={rows} ticks={env.axis?.ticks_short} marker={marker} unit={head ? cellUnit(head) : ""} /> : <Pending q={data.uncertainty} what="the uncertainty" />}
    </Widget>
  );
}

// --- EMISSIONS BY GAS
export function GasWidget({ data, place }: WidgetProps) {
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
    <Widget id="gases" className="scroll-mt-28" title={`${WIDGETS.gases} in ${place}`} env={env} labels={labels} sentence={sentence} caption={<span title={gwpTooltip(labels, state.gwp)}>CO₂-equivalent on {gwpLabel(labels, state.gwp)} warming potentials</span>} testId="gas-widget">
      {env ? <StackedBar segments={segments} unit={a ? magnitudeOf(a) : ""} /> : <Pending q={data.byGas} what="the gases" />}
    </Widget>
  );
}

// --- WHERE EMISSIONS ARE PLACED
export function PlacesWidget({ data, geo, onPick }: WidgetProps & { onPick: (name: string) => void }) {
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
    <Widget id="places" className="scroll-mt-28" title={WIDGETS.places} env={env} labels={labels} sentence={sentence} caption={`Allocated at province level · ${view.split(":")[0]}`} testId="places-widget">
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

// --- WHAT IS NOT ESTIMATED
export const NE_LISTED = 8;
export function CompletenessWidget({ data }: WidgetProps) {
  const { labels } = useExplorer();
  const env = data.completeness.data;
  const rows = env?.values ?? [];
  const ne = rows.filter((x) => String((x as Record<string, unknown>).notation_key ?? "") === "NE");
  const listed = ne.slice(0, NE_LISTED);
  const sentence: ReactNode = env ? (
    <>
      <b className="num">{ne.length}</b> of {rows.length} category–gas combinations are not estimated; a blank is not a zero.
    </>
  ) : null;
  return (
    <Widget id="completeness" className="scroll-mt-28" title={WIDGETS.completeness} env={env} labels={labels} sentence={sentence} note={env ? NOTES.notEstimated : undefined} testId="completeness-widget">
      {env ? (
        <>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2" data-testid="ne-list">
            {listed.map((x, i) => {
              const r = x as Record<string, unknown>;
              return (
                <li key={i} className="flex items-baseline gap-2 truncate" title={String(r.justification ?? "")}>
                  <span className="mono shrink-0 text-muted">{String(r.code ?? "")}</span>
                  <span className="truncate text-fg">{String(r.category ?? "")}</span>
                  <span className="shrink-0 text-muted">{String(r.gas ?? "")}</span>
                </li>
              );
            })}
          </ul>
          {ne.length > listed.length && (
            <div className="mt-2 flex justify-end">
              <Link href="/methods" className={LINK} data-testid="ne-more">{LINKS.more(ne.length - listed.length)}</Link>
            </div>
          )}
        </>
      ) : (
        <Pending q={data.completeness} what="the completeness ledger" />
      )}
    </Widget>
  );
}

// --- EVIDENCE BEHIND THE NUMBERS
const CLASS_ORDER: Record<EvidenceAxis, { field: string; classes: string[] }> = {
  E: { field: "evidence_class", classes: ["E1", "E2", "E3", "E4"] },
  TE: { field: "temporal_class", classes: ["T1", "T2", "T3", "T4"] },
  S: { field: "spatial_class_measured", classes: ["S1", "S2", "S3", "S4", "NA"] },
};
const CLASS_OPACITY = [1, 0.7, 0.45, 0.25, 0.15];

/** Streams per class on one axis, in the axis's class order (a count of rows, the only arithmetic). */
export function classCounts(rows: Record<string, unknown>[], axis: EvidenceAxis): { id: string; count: number }[] {
  const { field, classes } = CLASS_ORDER[axis];
  return classes.map((id) => ({ id, count: rows.filter((r) => String(r[field] ?? "") === id).length })).filter((c) => c.count > 0);
}

export function EvidenceWidget({ data }: WidgetProps) {
  const { labels } = useExplorer();
  const env = data.evidence.data;
  const rows = (env?.values ?? []) as Record<string, unknown>[];
  const sentence: ReactNode = env ? (
    <>
      The inventory rests on <b className="num">{rows.length}</b> source streams, each graded on annual activity, monthly timing and spatial placement.
    </>
  ) : null;
  return (
    <Widget id="evidence" className="scroll-mt-28" title={WIDGETS.evidence} env={env} labels={labels} sentence={sentence} caption="One dot per source stream; hover a class for its definition." testId="evidence-widget">
      {env ? (
        <>
          <div className="space-y-3" data-testid="evidence-rows">
            {(Object.keys(CLASS_ORDER) as EvidenceAxis[]).map((axis) => (
              <div key={axis} className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3" data-testid={`evidence-axis-${axis}`}>
                <div className="text-xs font-semibold text-fg">{AXIS_LABEL[axis]}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {classCounts(rows, axis).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-1.5" title={evidenceClassText(c.id)} data-testid="evidence-class" data-class={c.id} data-count={c.count}>
                      <span className="text-xs text-muted">{c.id} · {c.count}</span>
                      <span className="flex max-w-[220px] flex-wrap gap-px" aria-hidden="true">
                        {Array.from({ length: c.count }, (_, k) => (
                          <span key={k} className="inline-block h-1.5 w-1.5 rounded-full bg-accent" style={{ opacity: CLASS_OPACITY[Math.min(i, CLASS_OPACITY.length - 1)] }} />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Link href="/methods" className={LINK} data-testid="evidence-link">{LINKS.methods}</Link>
          </div>
        </>
      ) : (
        <Pending q={data.evidence} what="the evidence streams" />
      )}
    </Widget>
  );
}
