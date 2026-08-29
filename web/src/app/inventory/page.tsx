"use client";
/** Inventory Explorer: sector breakdown and category x gas for one period, configuration, GWP. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartFrame } from "@/components/ChartFrame";
import { BarChart } from "@/components/BarChart";
import { Status } from "@/components/Status";
import { useRelease } from "@/components/ContextBar";

export default function Inventory() {
  const release = useRelease();
  const [period, setPeriod] = useState("FY2023-24");
  const [configuration, setConfiguration] = useState("REF_2023_24");
  const [gwp, setGwp] = useState("AR5");
  const periods = ((release.data?.dims.dim_period?.values as { period_id: string; basis: string }[] | undefined) ?? []).filter((p) => p.basis === "fiscal");
  const base = { periods: [period], configuration_id: configuration, gwp_basis: gwp };
  const bySector = useQuery({ queryKey: ["inv-sector", base], queryFn: () => api.queryEmissions({ ...base, group_by: ["sector_id"], order_by: "value desc" }) });
  const byCategoryGas = useQuery({ queryKey: ["inv-cat-gas", base], queryFn: () => api.queryEmissions({ ...base, group_by: ["ipcc_code", "category", "gas"], order_by: "value desc" }) });
  const total = useQuery({ queryKey: ["inv-total", base], queryFn: () => api.queryEmissions(base) });
  return (
    <>
      <h1>Inventory Explorer</h1>
      <div className="controls">
        <label>
          period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {(periods.length ? periods.map((p) => p.period_id) : [period]).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          configuration
          <select value={configuration} onChange={(e) => setConfiguration(e.target.value)}>
            <option value="REF_2023_24">REF_2023_24 (L, ledger)</option>
            <option value="S_2023_24">S_2023_24 (survey; FY2023-24 only)</option>
          </select>
        </label>
        <label>
          GWP
          <select value={gwp} onChange={(e) => setGwp(e.target.value)}>
            <option>AR5</option>
            <option>AR6</option>
          </select>
        </label>
        {total.data && (
          <span>
            total <strong className="num">{total.data.values[0].display}</strong> {total.data.values[0].unit} · receipt <span className="mono">{total.data.receipt}</span>
          </span>
        )}
      </div>
      <Status isLoading={total.isLoading} error={total.error} what="the total" />
      {bySector.data ? (
        <ChartFrame title={`Sectors, ${period}, ${configuration}, ${gwp}`} env={bySector.data}>
          <BarChart env={bySector.data} horizontal height={380} />
        </ChartFrame>
      ) : (
        <Status isLoading={bySector.isLoading} error={bySector.error} what="sectors" />
      )}
      {byCategoryGas.data ? (
        <ChartFrame title={`Category x gas, ${period}, ${configuration}, ${gwp}`} env={byCategoryGas.data}>
          <BarChart env={byCategoryGas.data} horizontal height={Math.max(400, byCategoryGas.data.values.length * 18)} />
        </ChartFrame>
      ) : (
        <Status isLoading={byCategoryGas.isLoading} error={byCategoryGas.error} what="category x gas" />
      )}
    </>
  );
}
