"use client";
/**
 * The right column: the national KPI for the scope, sector bars, gas chips, S minus L when the
 * survey configuration covers the period, the annual series with clickable bars (-> period),
 * limitation chips. Bodies from contextBodies(state).
 */
import { useMemo } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies } from "@/lib/requests";
import { configCoversPeriod, useCompare, useEmissions, useTimeseries } from "@/lib/queries";
import { cellUnit, configLabel, configTooltip, configWords, envelopeUnitLine, gasLabel, gwpTooltip, lulucfShort, lulucfTooltip, monthLabel, scopeWords, sectorLabel } from "@/lib/labels";
import { Frame } from "@/components/ui/Frame";
import { BarChart } from "@/components/ui/BarChart";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { shown } from "@/lib/envelope";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";

export function useSurveyPair() {
  const { state, labels, release, dims } = useExplorer();
  return useMemo(() => {
    const rows = ((release.dims as Record<string, Record<string, unknown>>).dim_configuration?.queryable as { configuration_id: string; available_periods: string }[] | undefined) ?? [];
    const reference = rows.find((r) => labels.configurations[r.configuration_id]?.kind === "reference");
    const survey = rows.find((r) => labels.configurations[r.configuration_id]?.kind === "survey" && configCoversPeriod(r.available_periods, state.period, dims.fiscalPeriods));
    return reference && survey ? { reference: reference.configuration_id, survey: survey.configuration_id } : null;
  }, [release.dims, labels.configurations, state.period, dims.fiscalPeriods]);
}

export function ContextPanel() {
  const { state, setState, labels, dims, defaults } = useExplorer();
  const pair = useSurveyPair();
  const bodies = useMemo(() => contextBodies(state, pair), [state, pair]);
  const national = useEmissions(bodies.national);
  const bySector = useEmissions(bodies.bySector);
  const byGas = useEmissions(bodies.byGas);
  const series = useTimeseries(bodies.series);
  const compare = useCompare(bodies.compareSL, !!bodies.compareSL);
  const kpi = national.data?.values[0];
  const scope = scopeWords(labels, state, defaults.gwp_basis, state.sector ? sectorLabel(labels, state.sector) : null, state.gas ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null);
  const unitTitle = gwpTooltip(labels, state.gwp);
  return (
    <div className="flex flex-col" data-testid="context-panel">
      <div className="border-b border-line px-4 py-3">
        <div className="micro">Pakistan · national</div>
        <div className="text-xs text-muted">{scope}</div>
        {kpi ? (
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="num text-3xl font-semibold tracking-tight text-ink" data-testid="national-kpi" title={`${kpi.display} ${kpi.unit} (contract precision) · exact ${kpi.exact}`}>{shown(kpi)}</span>
              <span className="text-xs text-muted" title={unitTitle} data-testid="national-kpi-unit">{cellUnit(kpi)}</span>
            </div>
            <div className="text-xs text-muted" data-testid="national-kpi-line">
              <span title={configTooltip(labels, state.config)}>{configLabel(labels, state.config)}</span> · <span title={lulucfTooltip(labels)}>{lulucfShort(labels)}</span>
            </div>
            <ReceiptFooter env={national.data!} className="mt-1" />
          </div>
        ) : national.error ? (
          <div className="mt-2"><RefusalCard error={national.error} compact /></div>
        ) : (
          <div className="mt-2"><Loading what="the national total" /></div>
        )}
      </div>
      {byGas.data && (
        <div className="border-b border-line px-4 py-2">
          <div className="flex flex-wrap gap-1.5">
            {byGas.data.values.map((c, i) => (
              <button key={i} onClick={() => setState({ gas: state.gas === c.group?.gas ? null : c.group?.gas ?? null })} className={`pill border px-2 py-0.5 text-xs ${state.gas === c.group?.gas ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
                <span className={state.gas === c.group?.gas ? "text-white/70" : "text-muted"}>{gasLabel(labels, c.group?.gas ?? "")}</span> <span className="num font-semibold">{shown(c)}</span>
              </button>
            ))}
          </div>
          <ReceiptFooter env={byGas.data} className="mt-1" />
        </div>
      )}
      <div className="space-y-3 p-3">
        <Frame title="Sectors" unitLine={envelopeUnitLine(bySector.data)} unitTitle={unitTitle} scope={scope} env={bySector.data} error={bySector.error} isLoading={bySector.isLoading} labels={labels} dims={dims} flat className="border-b border-line">
          {bySector.data && <BarChart env={bySector.data} horizontal height={Math.max(150, bySector.data.values.length * 22)} labels={labels} dims={dims} onClick={(c) => setState({ sector: state.sector === c.group?.sector_id ? null : c.group?.sector_id ?? null })} selectedIndex={state.sector ? bySector.data.values.findIndex((c) => c.group?.sector_id === state.sector) : null} />}
        </Frame>
        {bodies.compareSL && (
          <Frame title={`${configLabel(labels, pair!.survey)} minus ${configWords(labels, pair!.reference)}, by sector`} unitLine={envelopeUnitLine(compare.data)} unitTitle={unitTitle} scope={scopeWords(labels, state, defaults.gwp_basis)} env={compare.data} error={compare.error} isLoading={compare.isLoading} labels={labels} dims={dims} flat className="border-b border-line">
            {compare.data && <BarChart env={compare.data} horizontal height={Math.max(120, compare.data.values.length * 20)} labels={labels} dims={dims} compact />}
          </Frame>
        )}
        <Frame title="Fiscal years" unitLine={envelopeUnitLine(series.data)} unitTitle={unitTitle} scope="national · click a bar to change the year" env={series.data} error={series.error} isLoading={series.isLoading} labels={labels} dims={dims} flat>
          {series.data && <BarChart env={series.data} height={150} labels={labels} dims={dims} colorBy="accent" compact onClick={(c) => c.group?.period_id && setState({ period: c.group.period_id })} selectedIndex={series.data.values.findIndex((c) => c.group?.period_id === state.period)} />}
        </Frame>
        {national.data && national.data.limitations_hit.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {national.data.limitations_hit.map((l, i) => (
              <span key={i} className="pill border border-line bg-canvas px-2 py-0.5 text-micro normal-case tracking-normal text-muted" title={String(l.message ?? "")}>{String(l.id)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
