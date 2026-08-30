"use client";
/**
 * The briefing's map, filling its pane (`absolute inset-0`): the ExplorerMap in its briefing
 * variant (the opacity pill, the frame button, the choropleth of the scope the page passes)
 * with a Provinces | Districts glass toggle top-RIGHT, left of the frame button (the map's left
 * side is the deck's). A click on a province re-scopes the briefing (writes `geo`); a district
 * click does nothing to the briefing's scope.
 */
import type { Level } from "@/lib/urlState";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { ResultTabs } from "@/components/ui/ResultTabs";
import type { ExplorerState } from "@/lib/urlState";

export type MapLevel = "adm1" | "adm2";

export function BriefingMap({ scope, level, onLevel, onPickProvince }: { scope: Partial<ExplorerState>; level: MapLevel; onLevel: (l: MapLevel) => void; onPickProvince: (name: string) => void }) {
  const onPick = (lvl: Level, id: string) => {
    if (lvl === "adm1") onPickProvince(id);
  };
  return (
    <div className="absolute inset-0" data-testid="briefing-map">
      <ExplorerMap variant="briefing" override={scope} onPick={onPick} />
      <div className="absolute right-14 top-3 z-20" data-testid="map-level-box">
        <ResultTabs<MapLevel> tabs={[{ id: "adm1", label: "Provinces" }, { id: "adm2", label: "Districts" }]} value={level} onChange={onLevel} ariaLabel="Map level" className="glass" testId="map-level" />
      </div>
    </div>
  );
}
