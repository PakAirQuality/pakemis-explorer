"use client";
/**
 * Explore data — a Grapher over the release (plan §1). One control row, one dominant canvas, one
 * query: the URL state resolves (lib/explore/query.ts) to exactly one contract call —
 * query_emissions with a single group_by, get_timeseries for a year range, compare_emissions
 * for the two estimates — and the canvas shows that envelope as a chart, a table or a map.
 * Under the canvas, four actions and no more: Explain (Ask with this scope and "Explain this
 * result"), Evidence (Result details at Sources), Download (the receipt's CSV), Share (the
 * permalink); then one expandable "Reading this result" line. Every number is a server
 * string; the page computes nothing.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, Link2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { markStage } from "@/components/shell/bootstrap";
import { api } from "@/lib/api";
import { shown, type Cell, type Envelope } from "@/lib/envelope";
import { cellUnit, configLabel, configWords, envelopeUnitLine, groupValueLabel, gwpTooltip, isSectorKey, periodShort, reportingSectorLabel, sectorLabel } from "@/lib/labels";
import { useAir, useCompare, useCompleteness, useEmissions, useTimeseries } from "@/lib/queries";
import { magnitudeOf } from "@/lib/uncertainty";
import { canvasTitle, placeWords, possessive, showingWords, POLLUTANT_LABELS, type ExploreState, type QueryPlan } from "@/lib/explore/query";
import { useExploreState } from "@/lib/explore/useExploreState";
import { NavHeader } from "@/components/shell/NavCapsule";
import { ShowingLine } from "@/components/ui/ShowingLine";
import { ResultTabs } from "@/components/ui/ResultTabs";
import { Controls } from "./Controls";
import { HeaderCard } from "./HeaderCard";
import { ResultChips } from "./ResultChips";
import { OverviewCard } from "./OverviewCard";
import { AirScreeningNote } from "@/components/ui/AirScreeningNote";
import { AIR_NOT_AMBIENT } from "@/lib/selection";
import { Canvas, sidesOf } from "./Canvas";
import { EXPLORE } from "./copy";

const ACTION = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft";

/** The envelope the canvas shows: the plan's filter applied (several provinces out of the ADM1 envelope), never a changed value. */
export function visibleEnvelope(env: Envelope | null | undefined, plan: QueryPlan): Envelope | null {
  if (!env) return null;
  // an air plan carries the same filter (several provinces out of the provincial envelope); it was
  // dropped for air, which is half of why choosing Punjab under a pollutant listed every province
  if ((plan.kind !== "emissions" && plan.kind !== "air") || !plan.filterTo) return env;
  const { key, ids } = plan.filterTo;
  return { ...env, values: env.values.filter((c) => ids.includes(c.group?.[key] ?? "")) };
}

/** The first numeric cell (the largest: every breakdown is ordered by value). */
export function topCell(env: Envelope | null | undefined): Cell | null {
  return env?.values.find((c) => typeof c.value === "number") ?? null;
}

export function Explore() {
  const { labels, dims, defaults, contract } = useExplorer();
  const { state, plan, ctx, dispatch } = useExploreState();
  const [copied, setCopied] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);

  const emissions = useEmissions(plan.kind === "emissions" ? plan.body : null, plan.kind === "emissions");
  const series = useTimeseries(plan.kind === "timeseries" ? plan.body : null, plan.kind === "timeseries");
  const compare = useCompare(plan.kind === "compare" ? plan.body : null, plan.kind === "compare");
  const air = useAir(plan.kind === "air" ? plan.body : null, plan.kind === "air");
  const active = plan.kind === "timeseries" ? series : plan.kind === "compare" ? compare : plan.kind === "air" ? air : emissions;
  const raw = plan.kind === "refused" ? null : active.data;
  // the loading screen's last stage on this page: the canvas's first envelope answered (or refused)
  useEffect(() => {
    if (raw || plan.kind === "refused" || active.isError) markStage("envelope");
  }, [raw, plan.kind, active.isError]);
  const env = useMemo(() => visibleEnvelope(raw, plan), [raw, plan]);
  // the sector's categories for the Category control: the same body as the category breakdown, so one request serves both
  const categoriesBody = useMemo(() => (state.sector && state.level === "national" ? { periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp, reporting_sectors: [state.sector], group_by: ["category"], order_by: "value desc" } : null), [state.sector, state.level, state.period, state.config, state.gwp]);
  const categoriesQ = useEmissions(categoriesBody, !!categoriesBody);
  const categories = useMemo(() => (categoriesQ.data?.values ?? []).map((c) => c.group?.category ?? "").filter(Boolean), [categoriesQ.data]);
  const completeness = useCompleteness({ notation_keys: ["NE"] }, readingOpen);

  const gwps = contract?.gwp?.length ? contract.gwp : Object.keys(labels.gwp).length ? Object.keys(labels.gwp) : [state.gwp];
  const configs = dims.configurations.length ? dims.configurations : [state.config];
  const views = Object.keys(labels.views).length ? Object.keys(labels.views) : [state.view];
  const partitions = plan.kind === "emissions";
  const sentence = showingWords(state, ctx, labels, dims);
  const place = placeWords(state, dims);
  const result = resultSentence(state, plan, env, labels, dims, place, possessive(place));
  const others = configs.filter((c) => c !== state.config).map((c) => configLabel(labels, c));
  const neCount = completeness.data?.values.length ?? null;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the address bar holds the link */
    }
  };

  return (
    <div className="min-h-dvh bg-surface" data-testid="explore-page">
      <NavHeader />
      <main className="px-5 pb-5 pt-3">
        <div className="grid grid-cols-1 gap-5 xl:min-h-[calc(100dvh-112px)] xl:grid-cols-[420px_minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <HeaderCard state={state} dispatch={dispatch} labels={labels} dims={dims} env={env} />
          <ResultChips state={state} ctx={ctx} dispatch={dispatch} labels={labels} place={place} />
          <OverviewCard state={state} />
        </div>

        <section className="card p-5 md:p-6" data-testid="canvas" data-receipt={env?.receipt ?? ""} data-chart={plan.kind === "refused" ? "" : plan.chart}>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-fg" data-testid="canvas-title">{canvasTitle(state)}</h2>
              <ShowingLine className="mt-1.5" testId="showing-line">{sentence}</ShowingLine>
            </div>
            <ResultTabs<ExploreState["rep"]> ariaLabel="Representation" tabs={[{ id: "chart", label: EXPLORE.reps.chart }, { id: "table", label: EXPLORE.reps.table }, { id: "map", label: EXPLORE.reps.map }]} value={state.rep} onChange={(rep) => dispatch({ control: "rep", value: rep })} testId="rep-tabs" />
          </header>
          {result && <p className="mt-4 text-md text-fg" data-testid="canvas-sentence">{result}</p>}
          {env && state.rep !== "map" && (
            <div className="mt-3 text-xs text-muted" data-testid="frame-unit" title={state.pollutant ? AIR_NOT_AMBIENT : gwpTooltip(labels, state.gwp)}>{envelopeUnitLine(env)}</div>
          )}
          {plan.kind === "air" && <AirScreeningNote env={env} labels={labels} />}
          <div className="mt-2">
            <Canvas state={state} plan={plan} ctx={ctx} env={env} error={plan.kind === "refused" ? null : active.error} isLoading={plan.kind !== "refused" && active.isLoading} labels={labels} dims={dims} dispatch={dispatch} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-line pt-3" data-testid="actions">
            <a href={env ? api.downloadCsvUrl(env.receipt) : undefined} aria-disabled={!env} className={`${ACTION} ${env ? "" : "pointer-events-none opacity-50"}`} data-testid="action-download" title="Download the canonical CSV of this result">
              <Download size={14} aria-hidden="true" /> {EXPLORE.actions.download}
            </a>
            <button type="button" onClick={share} className={ACTION} data-testid="action-share" aria-label={copied ? EXPLORE.actions.copied : "Copy the link to this view"}>
              <Link2 size={14} aria-hidden="true" /> {copied ? EXPLORE.actions.copied : EXPLORE.actions.share}
            </button>
          </div>

          <details className="mt-3 text-sm" open={readingOpen} onToggle={(e) => setReadingOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="reading">
            <summary className="cursor-pointer select-none text-sm font-semibold text-muted hover:text-fg">{EXPLORE.reading.title}</summary>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
              <Row label={state.by === "estimate" ? "Two estimates" : configLabel(labels, state.config)} testId="reading-estimate">
                {state.by === "estimate"
                  ? `The reference estimate and the survey-based estimate are two structural readings of the same year; the difference is right minus left, never an uncertainty.`
                  : `Every number on this page is the ${configWords(labels, state.config)}.${others.length ? ` Structural alternatives (${others.join(", ")}) are selectable under ${EXPLORE.controls.estimate}.` : ""}`}
              </Row>
              <Row label={EXPLORE.reading.notOfficial.label} testId="reading-not-official">{EXPLORE.reading.notOfficial.text}</Row>
              <Row label={EXPLORE.reading.ne.label} testId="reading-ne">
                {EXPLORE.reading.ne.text}
                {neCount !== null ? <> {neCount === 1 ? "One category is" : `${neCount} categories are`} marked NE in this release.</> : null}{" "}
                <Link href="/methods/sectors" className="text-accent hover:underline">See the gaps →</Link>
              </Row>
              <Row label={EXPLORE.reading.exact.label} testId="reading-exact">
                {EXPLORE.reading.exact.text}
                {plan.kind === "emissions" && plan.filterTo ? ` ${EXPLORE.reading.filtered}` : ""}
              </Row>
            </dl>
          </details>
        </section>

        <Controls state={state} ctx={ctx} dispatch={dispatch} labels={labels} dims={dims} categories={categories} gwps={gwps} configs={configs} views={views} partitions={partitions} defaultGwp={defaults.gwp_basis} />
        </div>
      </main>
    </div>
  );
}

const B = ({ children }: { children: ReactNode }) => <b className="num whitespace-nowrap">{children}</b>;

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <dt className="text-sm font-semibold text-fg">{label}</dt>
      <dd className="mt-0.5 text-xs text-muted">{children}</dd>
    </div>
  );
}

/**
 * The canvas sentence, every figure a server string: the series' `change` ("rose from 372.40
 * to 452.35 Mt CO₂e, +79.95 Mt (+21.5 %)"), the largest cell's share of a partition, the two
 * places' values, or the largest difference between the two estimates.
 */
function resultSentence(state: ExploreState, plan: QueryPlan, env: Envelope | null, labels: Parameters<typeof configWords>[0], dims: Parameters<typeof groupValueLabel>[1], place: string, owner: string): ReactNode {
  if (!env || plan.kind === "refused") return null;
  if (plan.kind === "air") {
    const p = POLLUTANT_LABELS[state.pollutant ?? ""] ?? state.pollutant;
    if (plan.groupBy === "period_id") {
      const first = env.values.find((c) => typeof c.value === "number");
      const last = topCell({ ...env, values: [...env.values].reverse() });
      if (!first || !last) return null;
      return (
        <>
          {owner} covered {p} emissions: <B>{shown(first)} {cellUnit(first)}</B> in {periodShort(labels, String(first.group?.period_id ?? ""))}, <B>{shown(last)} {cellUnit(last)}</B> in {periodShort(labels, String(last.group?.period_id ?? ""))}.
        </>
      );
    }
    const top = topCell(env);
    if (!top) return null;
    const id = top.group?.[plan.groupBy] ?? "";
    const name = groupValueLabel(labels, dims, plan.groupBy, id) || id;
    // WHAT THE SHARE IS A SHARE OF. The server's share is over the cells it returned: the sources
    // the release estimates, or the places listed. It is never "of the total" - grid power is not
    // in it, and saying otherwise is how a covered total gets read as a national inventory.
    const of = plan.groupBy === "sector_id" ? "of the sources estimated here" : "of the places shown";
    return (
      <>
        <b>{name}</b> {plan.groupBy === "sector_id" ? `is the largest estimated source${place !== "Pakistan" ? ` in ${place}` : ""}` : "emitted the most"}, at <B>{shown(top)} {cellUnit(top)}</B>
        {top.share_pct_short ? <> (<B>{top.share_pct_short} %</B> {of})</> : null}.
      </>
    );
  }
  if (plan.kind === "timeseries") {
    const change = env.change;
    const last = topCell({ ...env, values: [...env.values].reverse() });
    if (!change || !last) return null;
    return (
      <>
        {owner} emissions {change.direction || "changed"} from <B>{change.from_short}</B> to <B>{change.to_short} {change.unit_short ?? cellUnit(last)}</B>, <B>{change.change_short} {magnitudeOf(last)}</B> (<B>{change.change_pct_short} %</B>) between {periodShort(labels, change.from_period)} and {periodShort(labels, change.to_period)}.
      </>
    );
  }
  if (plan.kind === "compare") {
    const cells = env.values.filter((c) => typeof c.value === "number");
    const largest = cells.reduce<Cell | null>((m, c) => (m === null || Math.abs(c.value as number) > Math.abs(m.value as number) ? c : m), null);
    const sides = largest ? sidesOf(largest) : null;
    if (!largest || !sides) return null;
    const key = plan.groupBy;
    const name = sides.left.group?.[key] ?? "";
    const left = labels.configurations[String(plan.body.left?.configuration_id ?? "")]?.label ?? "the left estimate";
    const right = labels.configurations[String(plan.body.right?.configuration_id ?? "")]?.label ?? "the right estimate";
    return (
      <>
        {right} differs most from the {left.toLowerCase()} in <b>{isSectorKey(key) ? reportingSectorLabel(labels, name) : key === "gas" ? labels.gases[name] ?? name : name}</b>: <B>{shown(largest)} {cellUnit(largest)}</B> (<B>{shown(sides.left)}</B> → <B>{shown(sides.right)}</B>).
      </>
    );
  }
  if (plan.filterTo) {
    const cells = env.values.filter((c) => typeof c.value === "number");
    if (!cells.length) return null;
    return (
      <>
        {cells.map((c, i) => (
          <span key={c.group?.[plan.groupBy] ?? i}>
            {i > 0 ? "; " : ""}
            <b>{c.group?.[plan.groupBy]}</b>: <B>{shown(c)} {cellUnit(c)}</B>
            {c.share_pct_short ? <> (<B>{c.share_pct_short} %</B>{i === 0 ? " of the provinces' allocated total" : ""})</> : null}
          </span>
        ))}
        .
      </>
    );
  }
  const top = topCell(env);
  if (!top) return null;
  const key = plan.groupBy;
  const id = top.group?.[key] ?? "";
  const name = isSectorKey(key) ? reportingSectorLabel(labels, id) : key === "gas" ? labels.gases[id] ?? id : key === "month" ? labels.months[id] ?? id : id;
  if (!top.share_pct_short) {
    return (
      <>
        {env.values.length} rows in {owner} {periodShort(labels, state.period)} {configWords(labels, state.config)}.
      </>
    );
  }
  return (
    <>
      <b>{name}</b> accounts for <B>{top.share_pct_short} %</B>{top.share_phrase ? ` (${top.share_phrase})` : ""} of {owner} {periodShort(labels, state.period)} {state.level === "national" ? "" : "allocated "}{configWords(labels, state.config)}
      {state.sector ? ` in ${sectorLabel(labels, state.sector).toLowerCase()}` : ""}.
    </>
  );
}
