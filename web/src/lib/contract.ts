"use client";
/**
 * The allowed values of the contract's enumerated request fields (gwp_basis "AR5 | AR6",
 * geography_level, spatial_view, order_by), read from the API's own openapi.json field
 * descriptions (harvested from the pakemis_query dataclass comments) so the UI never types them.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { authedFetch } from "./embedAuth";

export type ContractOptions = { gwp: string[]; geographyLevel: string[]; spatialView: string[]; basis: string[]; configuration: string[]; routes: string[]; gridGas: string; gridAnnual: string };

function parseOptions(description: string | undefined): string[] {
  if (!description) return [];
  return description
    .split(";")[0]
    .split("|")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter((s) => s.length > 0);
}

export async function fetchContractOptions(): Promise<ContractOptions> {
  let res: Response | null = null;
  for (const url of api.openapiUrls()) {
    res = await authedFetch(url);
    if (res.ok) break;
  }
  if (!res?.ok) throw new Error(`${res?.status ?? "no response"} for openapi.json`);
  const doc = (await res.json()) as { paths?: Record<string, unknown>; components?: { schemas?: Record<string, { properties?: Record<string, { description?: string }> }> } };
  const p = doc.components?.schemas?.QueryEmissions?.properties ?? {};
  const g = (doc.components?.schemas?.GridCellRequest?.properties ?? {}) as Record<string, { description?: string; default?: string }>;
  return {
    gridGas: g.gas?.default ?? "",
    gridAnnual: (g.month?.description ?? "").match(/"([a-z]+)"/)?.[1] ?? "annual",
    gwp: parseOptions(p.gwp_basis?.description),
    geographyLevel: parseOptions(p.geography_level?.description),
    spatialView: parseOptions(p.spatial_view?.description),
    basis: parseOptions(p.basis?.description),
    configuration: parseOptions(p.configuration_id?.description),
    routes: Object.keys(doc.paths ?? {}),
  };
}

export function useContractOptions() {
  return useQuery({ queryKey: ["openapi-options"], queryFn: fetchContractOptions, staleTime: Infinity });
}
