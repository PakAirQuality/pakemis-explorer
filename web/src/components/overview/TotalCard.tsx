"use client";
/**
 * The Estimated national total card: the KPI as the server's `display_short` with `unit_short`
 * (the contract `display` and `exact` in its title), the scope line in the release's words,
 * and "Uncertainty interval: approximately 407.28–533.73 Mt" from the release's headline
 * parametric uncertainty (`get_uncertainty(scope="national")`, the cell whose scenario is
 * `cross_sector`; its `interval_short` and `scenario_label` are server strings). The interval
 * is shown only while the view is the release's own national scope, the one that envelope
 * bounds. Under it, a line names the scenario and says that the interval's median is the
 * Monte-Carlo median while the headline is the reference estimate, both as server strings,
 * with each envelope's Result details.
 */
import { useMemo } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies } from "@/lib/requests";
import { useEmissions, useNationalUncertainty } from "@/lib/queries";
import { cellUnit, configLabel, configTooltip, gasLabel, gwpIsDefault, gwpLabel, gwpTooltip, lulucfShort, lulucfTooltip, monthLabel, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell, type Envelope } from "@/lib/envelope";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { TOTAL_CARD } from "./copy";

export const HEADLINE_SCENARIO = "cross_sector";

/** The cell of the headline scenario, else the first cell that carries an interval. */
export function headlineCell(env: Envelope | null | undefined): (Cell & { interval_short?: string; scenario_label?: string; scenario?: string }) | null {
  if (!env) return null;
  const cells = env.values as (Cell & { interval_short?: string; scenario_label?: string; scenario?: string })[];
  return cells.find((c) => c.scenario === HEADLINE_SCENARIO && c.interval_short) ?? cells.find((c) => !!c.interval_short) ?? null;
}

/** "Mt": the magnitude token of the cell's unit, the word the interval line ends with. */
export function magnitudeOf(cell: { unit?: string | null; unit_short?: string } | null | undefined): string {
  const unit = cell?.unit_short || cell?.unit || "";
  return unit.trim().split(/\s+/)[0] ?? "";
}

export function TotalCard() {
  const { state, labels, defaults } = useExplorer();
  const bodies = useMemo(() => contextBodies(state, null), [state]);
  const national = useEmissions(bodies.national);
  // the release's own national scope: the interval bounds that total and no other
  const nationalScope = state.period === defaults.period_id && state.config === defaults.configuration_id && state.gwp === defaults.gwp_basis && !state.sector && !state.gas && !state.month;
  const unc = useNationalUncertainty(nationalScope);
  const kpi = national.data?.values[0];
  const interval = nationalScope ? headlineCell(unc.data) : null;
  const scope = [periodShort(labels, state.period), configLabel(labels, state.config), gwpIsDefault(labels, state.gwp, defaults.gwp_basis) ? null : gwpLabel(labels, state.gwp), lulucfShort(labels), state.sector ? sectorLabel(labels, state.sector) : null, state.gas ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="card p-5" data-testid="total-card">
      <div className="micro">{TOTAL_CARD.title}</div>
      {kpi ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-4xl font-semibold tracking-tight text-fg" data-testid="national-kpi" title={`${kpi.display} ${kpi.unit} (contract precision) · exact ${kpi.exact}`}>
              {shown(kpi)}
            </span>
            <span className="text-sm text-muted" title={gwpTooltip(labels, state.gwp)} data-testid="national-kpi-unit">
              {cellUnit(kpi)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted" data-testid="national-kpi-line" title={[configTooltip(labels, state.config), lulucfTooltip(labels)].filter(Boolean).join(" · ")}>
            {scope}
          </div>
          {interval && (
            <div className="mt-3 border-t border-line pt-3" data-testid="interval">
              <div className="text-sm text-fg" data-testid="interval-line">
                {TOTAL_CARD.intervalLead}{" "}
                <span className="num whitespace-nowrap font-semibold">
                  {interval.interval_short} {magnitudeOf(interval)}
                </span>
              </div>
              <div className="mt-1 text-micro normal-case tracking-normal text-muted" data-testid="interval-note" title={`${interval.display} ${interval.unit} (contract precision)`}>
                From the release&apos;s Monte-Carlo draws ({interval.scenario_label ?? String(interval.scenario ?? "")}); the draws&apos; median is <span className="num">{shown(interval)}</span> {cellUnit(interval)} while the headline is the reference estimate.
              </div>
              {unc.data && <ReceiptFooter env={unc.data} className="mt-1" />}
            </div>
          )}
          {nationalScope && unc.error && <div className="mt-3"><RefusalCard error={unc.error} compact /></div>}
          <ReceiptFooter env={national.data!} className="mt-3 border-t border-line pt-2" />
        </>
      ) : national.error ? (
        <div className="mt-2"><RefusalCard error={national.error} compact /></div>
      ) : (
        <div className="mt-2"><Loading what="the national total" /></div>
      )}
    </div>
  );
}
