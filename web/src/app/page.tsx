"use client";
/** Overview: the national total under L and S, on AR5 and AR6, each from its own envelope. */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartFrame } from "@/components/ChartFrame";
import { BarChart } from "@/components/BarChart";
import { Status } from "@/components/Status";
import { useRelease } from "@/components/ContextBar";

const PERIOD = "FY2023-24";
const TOTALS = [
  { key: "L_AR5", label: "Configuration L (ledger), AR5", body: { periods: [PERIOD], configuration_id: "REF_2023_24", gwp_basis: "AR5" } },
  { key: "S_AR5", label: "Configuration S (survey), AR5", body: { periods: [PERIOD], configuration_id: "S_2023_24", gwp_basis: "AR5" } },
  { key: "L_AR6", label: "Configuration L (ledger), AR6", body: { periods: [PERIOD], configuration_id: "REF_2023_24", gwp_basis: "AR6" } },
  { key: "S_AR6", label: "Configuration S (survey), AR6", body: { periods: [PERIOD], configuration_id: "S_2023_24", gwp_basis: "AR6" } },
];

function Total({ label, body }: { label: string; body: { periods: string[]; configuration_id: string; gwp_basis: string } }) {
  const q = useQuery({ queryKey: ["total", body], queryFn: () => api.queryEmissions(body) });
  return (
    <div>
      <div className="label">{label}</div>
      {q.data ? (
        <>
          <div className="value" data-testid={`total-${body.configuration_id}-${body.gwp_basis}`}>{q.data.values[0].display}</div>
          <div className="small">{q.data.values[0].unit} · receipt <span className="mono">{q.data.receipt}</span></div>
        </>
      ) : (
        <Status isLoading={q.isLoading} error={q.error} what={label} />
      )}
    </div>
  );
}

export default function Overview() {
  const release = useRelease();
  const sectors = useQuery({
    queryKey: ["sectors", PERIOD],
    queryFn: () => api.queryEmissions({ periods: [PERIOD], group_by: ["sector_id"], order_by: "value desc" }),
  });
  return (
    <>
      <h1>Pakistan&apos;s national inventory, {PERIOD}</h1>
      <p className="small">
        {release.data ? `${release.data.release_id} · commit ${release.data.commit ?? "?"} · semantic contract ${release.data.digests.semantic_release_json.slice(0, 16)}…` : ""} Configurations L and S are co-equal readings of unresolved dung evidence, not an estimate and a sensitivity. LULUCF is excluded from every total.
      </p>
      <div className="card kpi">
        {TOTALS.map((t) => (
          <Total key={t.key} label={t.label} body={t.body} />
        ))}
      </div>
      {sectors.data ? (
        <ChartFrame title="Sectors, configuration L, AR5" env={sectors.data}>
          <BarChart env={sectors.data} horizontal height={380} />
        </ChartFrame>
      ) : (
        <Status isLoading={sectors.isLoading} error={sectors.error} what="the sector breakdown" />
      )}
      <h2>How to read this site</h2>
      <ul className="small">
        <li>One numerical truth layer: the paper, these charts, the downloads, the API and the future agent are views of one verified release.</li>
        <li>Every value is a <code>display</code> string the API rounded by the contract&apos;s rule (half to even on the exact decimal). Tick &quot;show exact&quot; in any table to see the decimal the engine summed.</li>
        <li>Every frame carries a receipt: <code>GET /v1/receipt/&lt;receipt&gt;</code> replays the request; it never serves a stored number.</li>
        <li>What the release cannot answer it refuses by name (calendar basis outside agriculture, AR6 at ADM2, configuration S outside FY2023-24).</li>
      </ul>
    </>
  );
}
