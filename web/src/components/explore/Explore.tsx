"use client";
/**
 * Explore the inventory (plan §/explore): the controls card (Period, Break down by, Measure,
 * Sector; More settings: Estimate, Warming potentials, Spatial view), the "Showing:" sentence
 * from the labels, three stat cards (the national envelope's `display_short`, the top cell's
 * `share_pct_short` of the sector or category breakdown, the national uncertainty's
 * `interval_short`), the result widget (the breakdown as chart | table with the server's Share
 * column, a sentence from the top cell's share, Show calculation / Inspect evidence and the
 * toolbar's Result details / download / share) and the "Interpret this result" widget. Every
 * request is a pure function of the URL state (`period, sector, gas, config, gwp, view` and
 * `by`); every number is a server string; the page computes nothing.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Calculator, ScrollText, Sparkles } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { BREAKDOWNS, BREAKDOWN_META, breakdownBody, categoriesBody, sectorsBody, showingSentence, type Breakdown } from "@/lib/breakdown";
import { neRowsFor, sectorCodes, type CodedCell } from "@/lib/completeness";
import { cellUnit, configLabel, configWords, envelopeUnitLine, gasLabel, groupValueLabel, gwpLabel, gwpTooltip, periodShort, sectorLabel, viewLabel } from "@/lib/labels";
import { shown, type Cell, type Envelope } from "@/lib/envelope";
import { useCompleteness, useEmissions, useEvidence, useUncertainty } from "@/lib/queries";
import { scopeBody } from "@/lib/requests";
import { TopNav } from "@/components/shell/TopNav";
import { CurrentView } from "@/components/shell/CurrentView";
import { ACTION_CLASS, PageHeader } from "@/components/shell/PageHeader";
import { ControlsCard, Field, Select } from "@/components/ui/ControlsCard";
import { ShowingLine } from "@/components/ui/ShowingLine";
import { StatCard } from "@/components/ui/StatCard";
import { ResultTabs } from "@/components/ui/ResultTabs";
import { Widget } from "@/components/ui/Widget";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { BarChart } from "@/components/ui/BarChart";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { useEnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { headlineCell, magnitudeOf } from "@/components/overview/TotalCard";
import { EXPLORE } from "./copy";

type ShareCell = Cell & { share_pct_short?: string };

const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";

/** The first numeric cell of a breakdown: the largest, since every breakdown is ordered by value. */
export function topCell(env: Envelope | null | undefined): ShareCell | null {
  return ((env?.values ?? []) as ShareCell[]).find((c) => typeof c.value === "number") ?? null;
}

export function Explore() {
  const { state, setState, labels, dims, defaults, contract } = useExplorer();
  const [byRaw, setBy] = useQueryState("by", parseAsStringLiteral(BREAKDOWNS));
  const by: Breakdown = byRaw ?? "sector";
  const [figure, setFigure] = useState<"chart" | "table">("chart");
  const months = useMemo(() => dims.monthsByPeriod[state.period] ?? [], [dims.monthsByPeriod, state.period]);
  const gwps = contract?.gwp?.length ? contract.gwp : Object.keys(labels.gwp).length ? Object.keys(labels.gwp) : [state.gwp];
  const configs = dims.configurations.length ? dims.configurations : [state.config];
  const views = Object.keys(labels.views).length ? Object.keys(labels.views) : [state.view];

  const nationalBody = useMemo(() => scopeBody(state), [state]);
  const bodyBy = useMemo(() => breakdownBody(state, by, months), [state, by, months]);
  const bodySectors = useMemo(() => sectorsBody(state), [state]);
  const bodyCategories = useMemo(() => (state.sector ? categoriesBody(state, state.sector) : null), [state]);
  const national = useEmissions(nationalBody);
  const breakdown = useEmissions(bodyBy, !!bodyBy);
  const sectors = useEmissions(bodySectors, !state.sector);
  const categories = useEmissions(bodyCategories, !!state.sector);
  // the release's parametric interval bounds the reference year's national total (per module when a sector is chosen); another year's total is bounded by the series draws
  const defaultBasis = state.config === defaults.configuration_id && state.gwp === defaults.gwp_basis && !state.gas && !state.month;
  const uncBody = useMemo(() => {
    if (!defaultBasis) return null;
    if (state.period === defaults.period_id) return { scope: "national", ...(state.sector ? { module: state.sector } : {}) };
    return state.sector ? null : { scope: "series", period_id: state.period };
  }, [defaultBasis, state.period, state.sector, defaults.period_id]);
  const unc = useUncertainty(uncBody, !!uncBody);
  const completeness = useCompleteness({ notation_keys: ["NE"] });
  const evidence = useEvidence("_", state.sector ? { module: state.sector } : {}, !!state.sector);
  const drawer = useEnvelopeDrawer(labels);

  const sentence = showingSentence(labels, state, by, state.gas ? gasLabel(labels, state.gas) : undefined);
  const kpi = national.data?.values[0];
  const largestEnv = state.sector ? categories.data : sectors.data;
  const largestQuery = state.sector ? categories : sectors;
  const largest = topCell(largestEnv);
  const largestName = largest ? (state.sector ? groupValueLabel(labels, dims, "category", largest.group?.category) : sectorLabel(labels, largest.group?.sector_id)) : "";
  const interval = headlineCell(unc.data);
  const env = breakdown.data;
  const top = topCell(env);
  const meta = BREAKDOWN_META[by];
  const topName = top ? groupValueLabel(labels, dims, meta.groupBy, top.group?.[meta.groupBy]) : "";
  const selectedIndex = env && by === "sector" && state.sector ? env.values.findIndex((c) => c.group?.sector_id === state.sector) : env && by === "gas" && state.gas ? env.values.findIndex((c) => c.group?.gas === state.gas) : -1;
  const neCells = (completeness.data?.values ?? []) as CodedCell[];
  const neRows = state.sector ? neRowsFor(neCells, sectorCodes((evidence.data?.values ?? []) as CodedCell[])) : neCells;
  const others = configs.filter((c) => c !== state.config).map((c) => configLabel(labels, c));
  const selectable = by === "sector" || by === "gas";

  const select = (cell: Cell) => {
    const g = cell.group ?? {};
    if (by === "sector" && g.sector_id) {
      setState({ sector: g.sector_id });
      setBy("ipcc");
    } else if (by === "gas" && g.gas) {
      setState({ gas: state.gas === g.gas ? null : g.gas });
    }
  };
  const askHref = `/ask?q=${encodeURIComponent(`${sentence} ${EXPLORE.askSuffix}`)}`;
  const resultSentence = top?.share_pct_short && topName ? (
    <>
      <b>{topName}</b> accounts for <b className="num">{top.share_pct_short}%</b> of the {periodShort(labels, state.period)} {configWords(labels, state.config)}.
    </>
  ) : env ? (
    <>
      {env.values.length} {meta.noun === "category" ? "categories" : `${meta.noun}s`} in the {periodShort(labels, state.period)} {configWords(labels, state.config)}.
    </>
  ) : null;

  return (
    <div className="min-h-dvh bg-surface" data-testid="explore-page">
      <TopNav compact />
      <CurrentView compact />
      <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-8 md:px-6">
        <PageHeader
          title={EXPLORE.title}
          dek={EXPLORE.dek}
          action={
            <Link href={askHref} className={ACTION_CLASS} data-testid="ask-about-view">
              <Sparkles size={15} /> {EXPLORE.ask}
            </Link>
          }
        />

        <ControlsCard
          className="mt-6"
          more={
            <>
              <Field label={EXPLORE.controls.estimate} title={labels.configurations[state.config]?.tooltip}>
                <Select value={state.config} onChange={(v) => setState({ config: v })} options={configs.map((c) => ({ value: c, label: configLabel(labels, c), title: labels.configurations[c]?.tooltip }))} ariaLabel={EXPLORE.controls.estimate} testId="config-select" />
              </Field>
              <Field label={EXPLORE.controls.gwp} hint={gwpTooltip(labels, state.gwp) || undefined}>
                <Select value={state.gwp} onChange={(v) => setState({ gwp: v })} options={gwps.map((g) => ({ value: g, label: gwpLabel(labels, g), title: gwpTooltip(labels, g) }))} ariaLabel={EXPLORE.controls.gwp} testId="gwp-select" />
              </Field>
              <Field label={EXPLORE.controls.view} hint="Applies to the Map's province and district results; a national total is the same under every view.">
                <Select value={state.view} onChange={(v) => setState({ view: v })} options={views.map((v) => ({ value: v, label: viewLabel(labels, v) }))} ariaLabel={EXPLORE.controls.view} testId="view-select" />
              </Field>
            </>
          }
        >
          <Field label={EXPLORE.controls.period} hint={labels.periods[state.period]?.label}>
            <Select value={state.period} onChange={(v) => setState({ period: v })} options={dims.fiscalPeriods.map((p) => ({ value: p, label: periodShort(labels, p), title: labels.periods[p]?.label }))} ariaLabel={EXPLORE.controls.period} testId="period-select" />
          </Field>
          <Field label={EXPLORE.controls.by} hint={meta.unavailable}>
            <Select value={by} onChange={(v) => setBy(v as Breakdown)} options={BREAKDOWNS.map((b) => ({ value: b, label: BREAKDOWN_META[b].label, disabled: !!BREAKDOWN_META[b].unavailable, title: BREAKDOWN_META[b].unavailable }))} ariaLabel={EXPLORE.controls.by} testId="by-select" />
          </Field>
          <Field label={EXPLORE.controls.measure} hint={state.gas ? "Native gas mass is served at province and district grain; a national total stays CO₂-equivalent." : undefined}>
            <Select value={state.gwp} onChange={(v) => setState({ gwp: v })} options={gwps.map((g) => ({ value: g, label: `${EXPLORE.measure} · ${gwpLabel(labels, g)}`, title: gwpTooltip(labels, g) }))} ariaLabel={EXPLORE.controls.measure} testId="measure-select" />
          </Field>
          <Field label={EXPLORE.controls.sector}>
            <Select value={state.sector ?? ""} onChange={(v) => setState({ sector: v || null })} options={[{ value: "", label: sectorLabel(labels, null) }, ...dims.sectors.map((s) => ({ value: s, label: sectorLabel(labels, s) }))]} ariaLabel={EXPLORE.controls.sector} testId="sector-select" />
          </Field>
        </ControlsCard>

        <ShowingLine className="mt-4">{sentence}</ShowingLine>

        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="stat-cards">
          <StatCard
            label={EXPLORE.stats.national.label}
            value={kpi ? shown(kpi) : null}
            unit={kpi ? cellUnit(kpi) : undefined}
            title={kpi ? `${kpi.display} ${kpi.unit} (contract precision) · exact ${kpi.exact}` : undefined}
            caption={EXPLORE.stats.national.caption}
            env={national.data}
            error={national.error}
            isLoading={national.isLoading}
            labels={labels}
            testId="stat-national"
          />
          <StatCard
            label={state.sector ? EXPLORE.stats.largestCategory : EXPLORE.stats.largestSector}
            value={largest ? largest.share_pct_short ?? shown(largest) : null}
            unit={largest ? (largest.share_pct_short ? "%" : cellUnit(largest)) : undefined}
            title={largest ? `${largest.display} ${largest.unit} (contract precision)` : undefined}
            caption={largest ? `${largestName} · ${shown(largest)} ${cellUnit(largest)}` : undefined}
            env={largestEnv}
            error={largestQuery.error}
            isLoading={largestQuery.isLoading}
            labels={labels}
            testId="stat-largest"
          />
          <StatCard
            label={EXPLORE.stats.interval.label}
            value={interval?.interval_short ?? null}
            unit={interval ? magnitudeOf(interval) : undefined}
            title={interval ? `${interval.scenario_label ?? String(interval.scenario ?? "")} · the draws' median ${shown(interval)} ${cellUnit(interval)}` : undefined}
            caption={EXPLORE.stats.interval.caption}
            env={unc.data}
            error={unc.error}
            isLoading={!!uncBody && unc.isLoading}
            labels={labels}
            testId="stat-interval"
            empty="No draws bound this scope; the interval covers the release's national totals."
          />
        </section>

        <Widget
          className="mt-4"
          title={meta.title}
          env={env}
          labels={labels}
          infoTab="sources"
          tools={env && <ResultTabs size="xs" ariaLabel="Figure" tabs={[{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }]} value={figure} onChange={setFigure} testId="figure-tabs" />}
          sentence={resultSentence}
          caption={
            env ? (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {selectable && <span data-testid="result-caption">{by === "sector" ? EXPLORE.result.selectSector : "Select a row to filter the view to that gas."}</span>}
                <button type="button" className={TEXT_BUTTON} onClick={() => drawer.open(env, "calculation")} data-testid="show-calculation">
                  <Calculator size={12} /> {EXPLORE.result.showCalculation}
                </button>
                <button type="button" className={TEXT_BUTTON} onClick={() => drawer.open(env, "sources")} data-testid="inspect-evidence">
                  <ScrollText size={12} /> {EXPLORE.result.inspectEvidence}
                </button>
              </span>
            ) : null
          }
          testId="result-card"
        >
          {!bodyBy ? (
            <div data-testid="breakdown-unavailable">
              <p className="text-sm text-muted">{meta.unavailable}</p>
              <Link href="/map" className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">Open the Map →</Link>
            </div>
          ) : env ? (
            <>
              <div className="text-xs text-muted" data-testid="frame-unit" title={gwpTooltip(labels, state.gwp)}>{envelopeUnitLine(env)}</div>
              {figure === "chart" ? (
                <BarChart env={env} horizontal height={Math.max(160, 28 * env.values.length + 24)} labels={labels} dims={dims} colorBy={by === "sector" ? "sector" : "accent"} onClick={selectable ? select : undefined} selectedIndex={selectedIndex >= 0 ? selectedIndex : null} />
              ) : (
                <EnvelopeTable env={env} labels={labels} dims={dims} dense onRowClick={selectable ? select : undefined} selectedIndex={selectedIndex >= 0 ? selectedIndex : null} />
              )}
            </>
          ) : breakdown.error ? (
            <RefusalCard error={breakdown.error} compact />
          ) : (
            <Loading what={meta.title.toLowerCase()} />
          )}
        </Widget>

        <Widget className="mt-4" title={EXPLORE.interpret.title} share={false} sentence={EXPLORE.interpret.dek} testId="interpret-card">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            <Row label={configLabel(labels, state.config)} testId="interpret-estimate">
              Every number on this page is the {configWords(labels, state.config)}.{others.length ? ` Structural alternatives (${others.join(", ")}) are selectable under ${EXPLORE.controls.more}.` : ""}
            </Row>
            <Row label={EXPLORE.interpret.notOfficial.label} testId="interpret-not-official">{EXPLORE.interpret.notOfficial.text}</Row>
            <Row label={EXPLORE.interpret.ne.label} testId="interpret-ne">
              {EXPLORE.interpret.ne.text}
              {completeness.data ? <> {neRows.length === 1 ? "One category is" : `${neRows.length} categories are`} marked NE {state.sector ? `under ${sectorLabel(labels, state.sector)}` : "in this release"}.</> : null}
              {completeness.data && <> <Link href="/methods" className="text-accent hover:underline">See the gaps →</Link></>}
            </Row>
            <Row label={EXPLORE.interpret.exact.label} testId="interpret-exact">{EXPLORE.interpret.exact.text}</Row>
          </dl>
        </Widget>
      </main>
      {drawer.node}
    </div>
  );
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-3/60 px-3 py-2.5" data-testid={testId}>
      <dt className="text-sm font-semibold text-fg">{label}</dt>
      <dd className="mt-0.5 text-xs text-muted">{children}</dd>
    </div>
  );
}
