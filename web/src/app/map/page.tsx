"use client";
/**
 * Map allocated emissions (2026-08-30): the allocation map in the house style. The page is
 * light like every other (the dark chrome of the first build is gone): white glass panels
 * (globals.css `glass`) around the light-v11 map: [TopNav compact] · [FilterPanel 300 |
 * rail 48] [the full-width map with the layer switch, its legend and the TimelineBar beneath]
 * [SelectionDrawer 420]. Under
 * 768 px the filters are a sheet and the drawer a bottom sheet. Everything reads one URL state
 * (lib/urlState.ts: level, geo, cell, period, month, sector, gas, config, gwp, view, layer,
 * tab, raster, view3d, cam), so any view is a shareable link.
 */
import { Suspense, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { TopNav } from "@/components/shell/TopNav";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { FilterPanel } from "@/components/map/FilterPanel";
import { TimelineBar } from "@/components/map/TimelineBar";
import { DRAWER_WIDTH, SelectionDrawer } from "@/components/detail/SelectionDrawer";

/** The page's title: the map shows allocated emissions, never bare "emissions". */
const MAP_PAGE_TITLE = "Map allocated emissions";

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapScreen />
    </Suspense>
  );
}

function MapScreen() {
  const { isMobile } = useExplorer();
  // the desktop panel starts open; the mobile sheet starts closed
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    document.title = `${MAP_PAGE_TITLE} · Pakistan Air Quality Initiative`;
  }, []);
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface text-fg" data-testid="explorer">
      <TopNav compact>
        <h1 className="hidden truncate text-sm font-semibold text-fg lg:block" data-testid="page-title">{MAP_PAGE_TITLE}</h1>
      </TopNav>
      <div className="flex min-h-0 flex-1 flex-row">
        <FilterPanel open={isMobile ? sheetOpen : filtersOpen} onToggle={isMobile ? setSheetOpen : setFiltersOpen} mobile={isMobile} />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1" data-testid="map-frame">
            <ExplorerMap />
            {isMobile && (
              <button type="button" onClick={() => setSheetOpen(true)} className="glass pill absolute bottom-3 right-3 z-20 flex h-9 items-center gap-1.5 px-3 text-xs font-semibold text-fg" data-testid="filters-button">
                <SlidersHorizontal size={14} /> Filters
              </button>
            )}
          </div>
          <TimelineBar compact={isMobile} />
        </main>
        {!isMobile && (
          <aside className="relative z-40 h-full shrink-0 border-l border-gray-200/50 bg-white/90 backdrop-blur shadow-md" style={{ width: DRAWER_WIDTH }} data-testid="right-column">
            <SelectionDrawer />
          </aside>
        )}
      </div>
      {isMobile && <SelectionDrawer mobile />}
    </div>
  );
}
