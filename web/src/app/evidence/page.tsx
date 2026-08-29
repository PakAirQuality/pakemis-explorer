"use client";
/** Evidence & Methods: get_evidence for a stream, get_method for its category, get_completeness. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartFrame } from "@/components/ChartFrame";
import { Status } from "@/components/Status";

const DEFAULT_STREAM = "agriculture|enteric-fermentation|buffalo|ch4";

export default function Evidence() {
  const [stream, setStream] = useState(DEFAULT_STREAM);
  const [module, setModule] = useState("");
  const all = useQuery({ queryKey: ["evidence-all"], queryFn: () => api.evidence("_") });
  const one = useQuery({ queryKey: ["evidence", stream], queryFn: () => api.evidence(stream), enabled: !!stream });
  const category = (one.data?.values[0] as Record<string, unknown> | undefined)?.ipcc_category as string | undefined;
  const method = useQuery({ queryKey: ["method", category], queryFn: () => api.method(category ?? ""), enabled: !!category });
  const completeness = useQuery({ queryKey: ["completeness", "NE"], queryFn: () => api.completeness({ notation_keys: ["NE"] }) });
  const uncertainty = useQuery({ queryKey: ["uncertainty-national"], queryFn: () => api.uncertainty({ scope: "national" }) });
  const streams = (all.data?.values ?? []).map((v) => (v as Record<string, unknown>).source_stream_id as string);
  return (
    <>
      <h1>Evidence &amp; Methods</h1>
      <div className="controls">
        <label>
          source stream ({streams.length} in the release)
          <select value={stream} onChange={(e) => setStream(e.target.value)} style={{ minWidth: 420 }}>
            {(streams.length ? streams : [stream]).filter((s) => !module || s.startsWith(module + "|")).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          module filter
          <input value={module} onChange={(e) => setModule(e.target.value)} placeholder="agriculture, power, …" />
        </label>
      </div>
      {one.data ? (
        <ChartFrame title={`Stream lineage: ${stream}`} env={one.data} tableExtra={["evidence_class", "temporal_class", "spatial_class_measured", "placement_class", "allocation_surface", "temporal_evidence_grade", "licence_status", "ipcc_code", "ipcc_category"]}>
          <div>
            <p>
              Evidence / timing / placement grade: <strong>{one.data.values[0]?.display}</strong> · receipt <span className="mono">{one.data.receipt}</span>
            </p>
            <dl>
              {Object.entries(one.data.values[0] ?? {})
                .filter(([k]) => !["exact", "value", "display", "unit", "result_row_ids", "formula"].includes(k))
                .map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8 }}>
                    <dt className="small" style={{ minWidth: 220 }}>{k}</dt>
                    <dd className="mono" style={{ margin: 0 }}>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </ChartFrame>
      ) : (
        <Status isLoading={one.isLoading} error={one.error} what="the stream" />
      )}
      {method.data && (
        <ChartFrame title={`Method registry: ${category}`} env={method.data} tableExtra={["sector", "method_id", "tier", "uncertainty_model_id", "equation", "notes"]} />
      )}
      {uncertainty.data ? (
        <ChartFrame title="National uncertainty (parametric reference; P50 with P2.5 and P97.5)" env={uncertainty.data} tableExtra={["kind", "key", "scenario", "quantiles"]} />
      ) : (
        <Status isLoading={uncertainty.isLoading} error={uncertainty.error} what="uncertainty" />
      )}
      {completeness.data ? (
        <ChartFrame title={`Completeness: not-estimated (NE) rows (${completeness.data.values.length})`} env={completeness.data} tableExtra={["code", "category", "gas", "gap_id", "justification"]} />
      ) : (
        <Status isLoading={completeness.isLoading} error={completeness.error} what="completeness" />
      )}
    </>
  );
}
