"use client";
/** Inventory for the scope: sector bars, category × gas, S vs L, the annual series. National unless a geography is selected. */
import { useMemo } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies, scopeBody } from "@/lib/requests";
import { useCompare, useEmissions, useTimeseries } from "@/lib/queries";
import { configLetter, gasLabel, periodShort, sectorLabel } from "@/lib/labels";
import { Frame } from "@/components/ui/Frame";
import { BarChart } from "@/components/ui/BarChart";
import { useSurveyPair } from "./ContextPanel";

export function InventoryPanel() {
  const { state, setState, labels, dims } = useExplorer();
  const pair = useSurveyPair();
  const geo = state.level !== "grid" && state.geo ? { geography_level: state.level, geography_ids: [state.geo], spatial_view: state.view } : {};
  const scoped = useMemo(() => ({ ...scopeBody(state), ...geo }), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodies = useMemo(() => contextBodies(state, pair), [state, pair]);
  const bySector = useEmissions({ ...scoped, group_by: [state.geo ? "module" : "sector_id"], order_by: "value desc" });
  const byCatGas = useEmissions(state.geo ? { ...scoped, group_by: ["module", "gas"], order_by: "value desc" } : { ...scoped, group_by: ["ipcc_code", "category", "gas"], order_by: "value desc" });
  const compare = useCompare(bodies.compareSL, !!bodies.compareSL);
  const series = useTimeseries(bodies.series);
  const where = state.geo ?? "Pakistan";
  const scope = `${where} · ${periodShort(labels, state.period)} · ${configLetter(labels, state.config)} · ${state.gwp}${state.sector ? ` · ${sectorLabel(labels, state.sector)}` : ""}${state.gas ? ` · ${gasLabel(labels, state.gas)}` : ""}`;
  return (
    <div className="space-y-3 p-3" data-testid="inventory-panel">
      <p className="text-xs text-muted">{scope}</p>
      <Frame title="Sectors" scope={scope} env={bySector.data} error={bySector.error} isLoading={bySector.isLoading} labels={labels} dims={dims}>
        {bySector.data && <BarChart env={bySector.data} horizontal height={Math.max(200, bySector.data.values.length * 24)} labels={labels} dims={dims} onClick={(c) => setState({ sector: c.group?.sector_id ?? c.group?.module ?? null })} />}
      </Frame>
      <Frame title={state.geo ? "Sector × gas" : "Category × gas"} scope={scope} env={byCatGas.data} error={byCatGas.error} isLoading={byCatGas.isLoading} labels={labels} dims={dims} maxRows={40}>
        {byCatGas.data && <BarChart env={byCatGas.data} horizontal height={Math.max(240, Math.min(byCatGas.data.values.length, 40) * 18)} labels={labels} dims={dims} compact />}
      </Frame>
      {bodies.compareSL && (
        <Frame title="S minus L by sector" scope={`national · ${periodShort(labels, state.period)}`} env={compare.data} error={compare.error} isLoading={compare.isLoading} labels={labels} dims={dims}>
          {compare.data && <BarChart env={compare.data} horizontal height={Math.max(160, compare.data.values.length * 20)} labels={labels} dims={dims} compact />}
        </Frame>
      )}
      <Frame title="Fiscal years" scope="national series · click a bar" env={series.data} error={series.error} isLoading={series.isLoading} labels={labels} dims={dims}>
        {series.data && <BarChart env={series.data} height={200} labels={labels} dims={dims} colorBy="accent" onClick={(c) => c.group?.period_id && setState({ period: c.group.period_id })} selectedIndex={series.data.values.findIndex((c) => c.group?.period_id === state.period)} />}
      </Frame>
    </div>
  );
}
