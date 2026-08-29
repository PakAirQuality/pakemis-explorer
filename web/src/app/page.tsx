"use client";
/**
 * The one screen: [IconRail 48] [SlidingPanel 0|370] [Map flex-1] [Right column 300|420].
 * Floating over the map: ScopeChips (top-left), layer toggle (top-right), TimeRail
 * (bottom-centre), brand + Legend (bottom-left), context pill (bottom-right); the DetailCard
 * slides in over the map's right edge. The right column is the ContextPanel, or the AskDock when
 * `ask=1`. Everything reads one URL state (lib/urlState.ts).
 */
import { Suspense, useMemo } from "react";
import { API_BASE } from "@/lib/api";
import { useContractOptions } from "@/lib/contract";
import { releaseAgent, releaseDefaults, releaseDims, releaseLabels, useRelease } from "@/lib/release";
import { useExplorerState, type StateDefaults } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { IconRail } from "@/components/shell/IconRail";
import { SlidingPanel } from "@/components/shell/SlidingPanel";
import { AskDock } from "@/components/ask/AskDock";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { DetailCard } from "@/components/detail/DetailCard";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { ExplorePanel } from "@/components/panels/ExplorePanel";
import { InventoryPanel } from "@/components/panels/InventoryPanel";
import { ComparePanel } from "@/components/panels/ComparePanel";
import { EvidencePanel } from "@/components/panels/EvidencePanel";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Explorer />
    </Suspense>
  );
}

function Explorer() {
  const release = useRelease();
  const contract = useContractOptions();
  if (release.error)
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="card max-w-md p-5 text-sm" data-testid="api-unreachable">
          <div className="micro">PakEmis Explorer</div>
          <h1 className="mt-1 text-md font-semibold">API unreachable</h1>
          <p className="mt-2 text-muted">{String(release.error)} at <span className="mono">{API_BASE}</span>. Nothing numerical is shown without an envelope.</p>
        </div>
      </div>
    );
  if (!release.data) return <div className="flex h-dvh items-center justify-center text-xs text-muted">Loading release…</div>;
  return <Loaded release={release.data} contract={contract.data} />;
}

const PANEL_TITLES = { explore: "Explore", inventory: "Inventory", compare: "Compare", evidence: "Evidence & methods" } as const;

function Loaded({ release, contract }: { release: ReleaseInfo; contract: ReturnType<typeof useContractOptions>["data"] }) {
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
  const panel =
    state.panel === "explore" ? <ExplorePanel /> : state.panel === "inventory" ? <InventoryPanel /> : state.panel === "compare" ? <ComparePanel /> : state.panel === "evidence" ? <EvidencePanel /> : null;
  const rail = <IconRail active={state.panel} onChange={(p) => setState({ panel: p })} ask={state.ask} onAsk={() => setState({ ask: !state.ask })} horizontal={isMobile} />;
  return (
    <ExplorerContext.Provider value={ctx}>
      <div className={`flex h-dvh w-screen overflow-hidden ${isMobile ? "flex-col" : "flex-row"}`} data-testid="explorer">
        {!isMobile && rail}
        <SlidingPanel open={!!state.panel} title={state.panel ? PANEL_TITLES[state.panel] : ""} onClose={() => setState({ panel: null })} mobile={isMobile}>
          {panel}
        </SlidingPanel>
        <main className="relative min-w-0 flex-1">
          <ExplorerMap />
          <DetailCard />
        </main>
        {!isMobile && (
          <aside className={`relative z-40 h-full shrink-0 border-l border-line bg-white transition-[width] duration-250 ${state.ask ? "overflow-hidden" : "overflow-y-auto"}`} style={{ width: state.ask ? 420 : 300 }} data-testid="right-column">
            {state.ask ? <AskDock /> : <ContextPanel />}
          </aside>
        )}
        {isMobile && state.ask && (
          <div className="fixed inset-x-0 bottom-12 top-0 z-[55] overflow-hidden bg-white">
            <AskDock />
          </div>
        )}
        {isMobile && rail}
      </div>
    </ExplorerContext.Provider>
  );
}

