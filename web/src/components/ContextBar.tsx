"use client";
/**
 * Release · basis · configuration · GWP · geography · LULUCF, from GET /v1/release.
 * The six things that stop "Pakistan's emissions in 2024" from silently mixing a calendar and
 * a fiscal year. Shown on every page; a page that changes a choice passes it in `override`.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ContextOverride = Partial<{ basis: string; configuration_id: string; gwp_basis: string; geography: string }>;

export function useRelease() {
  return useQuery({ queryKey: ["release"], queryFn: api.release });
}

export function ContextBar({ override = {} }: { override?: ContextOverride }) {
  const { data, error, isLoading } = useRelease();
  if (isLoading) return <div className="context-bar" data-testid="context-bar">Loading release…</div>;
  if (error || !data)
    return (
      <div className="context-bar error" data-testid="context-bar">
        API unreachable ({String(error)}). Nothing numerical is shown without an envelope.
      </div>
    );
  const c = data.context_bar;
  const items: [string, string][] = [
    ["Release", c.release],
    ["Basis", `${override.basis ?? c.basis}${c.reporting_period ? ` (${c.reporting_period.label}: ${c.reporting_period.start} to ${c.reporting_period.end})` : ""}`],
    ["Configuration", override.configuration_id ?? c.configuration_id],
    ["GWP", override.gwp_basis ?? c.gwp_basis],
    ["Geography", override.geography ?? c.geography_id],
    ["LULUCF", `${c.lulucf.status} (${c.lulucf.notation_key})`],
  ];
  return (
    <div className="context-bar" data-testid="context-bar" title={`commit ${data.commit ?? "?"}; semantic_release.json ${data.digests.semantic_release_json.slice(0, 12)}`}>
      {items.map(([k, v]) => (
        <span key={k} className="context-item">
          <span className="context-key">{k}</span> <span className="context-value">{v}</span>
        </span>
      ))}
    </div>
  );
}
