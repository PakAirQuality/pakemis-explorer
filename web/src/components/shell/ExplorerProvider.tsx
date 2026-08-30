"use client";
/**
 * The bootstrap every route shares (mounted in app/layout.tsx): GET /release and the OpenAPI
 * contract, then the dims, labels, defaults and agent block, the URL state resolved against
 * the release's defaults (lib/urlState.ts) and the one ExplorerContext. While the release
 * loads nothing numerical is shown; an unreachable API is a card, not a number.
 */
import { Suspense, useMemo, type ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { useContractOptions } from "@/lib/contract";
import { releaseAgent, releaseDefaults, releaseDims, releaseLabels, useRelease } from "@/lib/release";
import { useExplorerState, type StateDefaults } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { useMediaQuery } from "@/components/shell/useMediaQuery";

export function ExplorerProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Bootstrap>{children}</Bootstrap>
    </Suspense>
  );
}

function Bootstrap({ children }: { children: ReactNode }) {
  const release = useRelease();
  const contract = useContractOptions();
  if (release.error)
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="card max-w-md p-5 text-sm" data-testid="api-unreachable">
          <div className="micro">PakEmis</div>
          <h1 className="mt-1 text-md font-semibold">API unreachable</h1>
          <p className="mt-2 text-muted">
            {String(release.error)} at <span className="mono">{API_BASE}</span>. Nothing numerical is shown without an envelope.
          </p>
        </div>
      </div>
    );
  if (!release.data) return <div className="flex h-dvh items-center justify-center text-xs text-muted">Loading release…</div>;
  return (
    <Loaded release={release.data} contract={contract.data}>
      {children}
    </Loaded>
  );
}

function Loaded({ release, contract, children }: { release: ReleaseInfo; contract: ReturnType<typeof useContractOptions>["data"]; children: ReactNode }) {
  const dims = useMemo(() => releaseDims(release), [release]);
  const labels = useMemo(() => releaseLabels(release), [release]);
  const agent = releaseAgent(release);
  const d = releaseDefaults(release);
  const defaults = useMemo<StateDefaults>(
    () => ({
      period_id: d?.period_id ?? "",
      configuration_id: d?.configuration_id ?? "",
      gwp_basis: d?.gwp_basis ?? "",
      spatial_view: d?.spatial_view ?? "",
      grid_gas: contract?.gridGas || dims.gases[0] || "",
    }),
    [d?.period_id, d?.configuration_id, d?.gwp_basis, d?.spatial_view, contract?.gridGas, dims.gases],
  );
  const { state, setState } = useExplorerState(defaults);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const ctx: ExplorerContextValue = { state, setState, release, labels, dims, defaults, contract, agent, isMobile };
  return <ExplorerContext.Provider value={ctx}>{children}</ExplorerContext.Provider>;
}
