"use client";
/**
 * The Map page: today's console, moved from `/` unchanged in substance (2026-08-30) under the
 * TopNav: [SlidingPanel 0|370] [framed map flex-1] [right column 300|420]. Floating over the
 * map: ScopeChips (top-left), the Ask pill and layer toggles (top-right), TimeRail
 * (bottom-centre), Legend (bottom-left), context pill (bottom-right); the DetailCard slides in
 * over the map's right edge. The right column is the ContextPanel, or the AskDock when
 * `ask=1`. The rail's panel tabs sit in the nav's slot until the filter bar and the tabbed
 * results drawer replace them (agent B). Everything reads one URL state (lib/urlState.ts).
 */
import { Suspense } from "react";
import { BarChart3, Compass, GitCompare, ScrollText } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Panel } from "@/lib/urlState";
import { TopNav } from "@/components/shell/TopNav";
import { SlidingPanel } from "@/components/shell/SlidingPanel";
import { AskDock } from "@/components/ask/AskDock";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { DetailCard } from "@/components/detail/DetailCard";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { ExplorePanel } from "@/components/panels/ExplorePanel";
import { InventoryPanel } from "@/components/panels/InventoryPanel";
import { ComparePanel } from "@/components/panels/ComparePanel";
import { EvidencePanel } from "@/components/panels/EvidencePanel";

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapScreen />
    </Suspense>
  );
}

const PANEL_TITLES = { explore: "Explore", inventory: "Inventory", compare: "Compare", evidence: "Evidence & methods" } as const;
const TABS: { id: Panel; icon: typeof Compass; label: string }[] = [
  { id: "explore", icon: Compass, label: "Explore" },
  { id: "inventory", icon: BarChart3, label: "Inventory" },
  { id: "compare", icon: GitCompare, label: "Compare" },
  { id: "evidence", icon: ScrollText, label: "Evidence" },
];

function MapScreen() {
  const { state, setState, isMobile } = useExplorer();
  const panel =
    state.panel === "explore" ? <ExplorePanel /> : state.panel === "inventory" ? <InventoryPanel /> : state.panel === "compare" ? <ComparePanel /> : state.panel === "evidence" ? <EvidencePanel /> : null;
  const tabs = (
    <div className="flex items-center gap-0.5" data-testid="panel-tabs">
      {TABS.map((t) => (
        <button key={t.id} type="button" onClick={() => setState({ panel: state.panel === t.id ? null : t.id })} aria-pressed={state.panel === t.id} title={t.label} className={`flex h-9 items-center gap-1 rounded-md px-2 text-xs ${state.panel === t.id ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-3 hover:text-fg"}`}>
          <t.icon size={15} />
          <span className="hidden lg:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden" data-testid="explorer">
      <TopNav compact onAsk={() => setState({ ask: !state.ask })}>
        {tabs}
      </TopNav>
      <div className={`flex min-h-0 flex-1 ${isMobile ? "flex-col" : "flex-row"}`}>
        <SlidingPanel open={!!state.panel} title={state.panel ? PANEL_TITLES[state.panel] : ""} onClose={() => setState({ panel: null })} mobile={isMobile}>
          {panel}
        </SlidingPanel>
        <main className="relative min-w-0 flex-1 p-2">
          <div className="map-frame relative h-full" data-testid="map-frame">
            <ExplorerMap />
            <DetailCard />
          </div>
        </main>
        {!isMobile && (
          <aside className={`relative z-40 h-full shrink-0 border-l border-line bg-surface-2 transition-[width] duration-250 ${state.ask ? "overflow-hidden" : "overflow-y-auto"}`} style={{ width: state.ask ? 420 : 300 }} data-testid="right-column">
            {state.ask ? <AskDock /> : <ContextPanel />}
          </aside>
        )}
        {isMobile && state.ask && (
          <div className="fixed inset-x-0 bottom-0 top-14 z-[55] overflow-hidden bg-surface-2">
            <AskDock />
          </div>
        )}
      </div>
    </div>
  );
}
