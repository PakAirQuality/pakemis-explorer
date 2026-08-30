"use client";
/** Evidence & methods for the current sector: stream lineage (get_evidence), the method registry row for its category, uncertainty, completeness (NE rows). */
import { useMemo, useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { useCompleteness, useEvidence, useMethod, useUncertainty } from "@/lib/queries";
import { sectorLabel, streamLabel, type Dims as LabelDims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { Frame } from "@/components/ui/Frame";

const SEL = "w-full rounded border border-line bg-surface-2 px-2 py-1 text-xs";
const LINEAGE_COLUMNS = ["evidence_class", "temporal_class", "spatial_class_measured", "placement_class", "allocation_surface", "temporal_evidence_grade", "licence_status", "ipcc_code", "ipcc_category", "methane_origin"];

export function EvidenceBrowser({ labels, dims, sectors, sector: initialSector, wide = false }: { labels: Labels; dims: LabelDims; sectors: string[]; sector?: string | null; wide?: boolean }) {
  const [sector, setSector] = useState<string>(initialSector ?? "");
  const all = useEvidence("_", sector ? { module: sector } : {});
  const streams = useMemo(() => (all.data?.values ?? []).map((v) => (v as Record<string, unknown>).source_stream_id).filter((s): s is string => typeof s === "string" && s.length > 0), [all.data]);
  const [chosen, setChosen] = useState<string>("");
  const stream = chosen && streams.includes(chosen) ? chosen : streams[0] ?? "";
  const one = useEvidence(stream, {}, !!stream);
  const category = (one.data?.values[0] as Record<string, unknown> | undefined)?.ipcc_category as string | undefined;
  const method = useMethod(category ?? "", !!category);
  const uncertainty = useUncertainty({ scope: "national", ...(sector ? { module: sector } : {}) });
  const completeness = useCompleteness({ notation_keys: ["NE"] });
  const row = one.data?.values[0] as Record<string, unknown> | undefined;
  const grid = wide ? "grid grid-cols-1 gap-3 md:grid-cols-2" : "space-y-3";
  return (
    <div className="space-y-3" data-testid="evidence-browser">
      <div className={wide ? "grid grid-cols-1 gap-3 md:grid-cols-2" : "space-y-2"}>
        <label className="block">
          <div className="micro mb-1">Sector</div>
          <select className={SEL} value={sector} onChange={(e) => { setSector(e.target.value); setChosen(""); }}>
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{sectorLabel(labels, s)}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="micro mb-1">Source stream ({streams.length} in scope)</div>
          <select className={SEL} value={stream} onChange={(e) => setChosen(e.target.value)}>
            {streams.map((s) => <option key={s} value={s}>{streamLabel(labels, s)}</option>)}
          </select>
          <div className="mono mt-0.5 truncate text-micro normal-case tracking-normal text-muted/80" title={stream}>{stream}</div>
        </label>
      </div>
      <Frame title={stream ? streamLabel(labels, stream) : "Stream lineage"} scope="get_evidence · evidence / timing / placement grade" env={one.data} error={one.error} isLoading={one.isLoading} labels={labels} dims={dims} tableExtra={LINEAGE_COLUMNS}>
        {row && (
          <div>
            <div className="num text-xl font-semibold text-fg" title={`${String(row.display)} (contract precision)`}>{String(row.display_short ?? row.display)}</div>
            <dl className="mt-2 grid grid-cols-[minmax(0,140px)_1fr] gap-x-2 gap-y-0.5 text-xs">
              {Object.entries(row).filter(([k]) => !["exact", "value", "display", "unit", "result_row_ids", "formula", "group"].includes(k)).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-muted" title={k}>{k.replace(/_/g, " ")}</dt>
                  <dd className="mono break-words">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Frame>
      <div className={grid}>
        <Frame title={category ? `Method: ${category}` : "Method"} scope="get_method" env={method.data} error={method.error} isLoading={!!category && method.isLoading} labels={labels} dims={dims} tableExtra={["sector", "method_id", "tier", "uncertainty_model_id", "equation", "notes"]} />
        <Frame title="Uncertainty" scope={`get_uncertainty · national${sector ? ` · ${sectorLabel(labels, sector)}` : ""}`} env={uncertainty.data} error={uncertainty.error} isLoading={uncertainty.isLoading} labels={labels} dims={dims} tableExtra={["kind", "key", "scenario", "quantiles"]} maxRows={20} />
      </div>
      <Frame title="Completeness: not-estimated (NE) rows" scope="get_completeness" env={completeness.data} error={completeness.error} isLoading={completeness.isLoading} labels={labels} dims={dims} tableExtra={["code", "category", "gas", "gap_id", "justification"]} maxRows={30} />
    </div>
  );
}

export function EvidencePanel() {
  const { state, labels, dims } = useExplorer();
  return (
    <div className="p-3" data-testid="evidence-panel">
      <EvidenceBrowser key={state.sector ?? "all"} labels={labels} dims={dims} sectors={dims.sectors} sector={state.sector} />
    </div>
  );
}
