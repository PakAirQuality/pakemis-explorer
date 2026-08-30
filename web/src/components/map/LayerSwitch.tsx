"use client";
/**
 * The map-layer switch (URL `layer`): Emission magnitude · Spatial evidence · Allocation
 * method · Unallocated mass · Known spatial exceptions. A layer that only paints at one level
 * moves the level with it (a district-level layer switches to Districts), so a layer never
 * shows an empty map without saying why.
 */
import { useExplorer } from "@/components/ExplorerContext";
import type { MapLayer } from "@/lib/urlState";
import { LAYER_ORDER, LAYERS, levelForLayer } from "./layerModes";

export function LayerSwitch({ compact = false }: { compact?: boolean }) {
  const { state, setState } = useExplorer();
  const choose = (layer: MapLayer) => {
    const level = levelForLayer(layer, state.level);
    setState(level === state.level ? { layer } : { layer, level });
  };
  return (
    <div className="glass pill flex max-w-full overflow-x-auto p-0.5 scrollbar-none" role="tablist" aria-label="Map layer" data-testid="layer-switch">
      {LAYER_ORDER.map((id) => {
        const on = state.layer === id;
        const l = LAYERS[id];
        return (
          <button key={id} type="button" role="tab" aria-selected={on} title={l.label} onClick={() => choose(id)} className={`pill shrink-0 px-3 py-1 text-xs font-medium transition-colors ${on ? "bg-fg text-card" : "text-muted hover:text-fg"}`} data-testid={`layer-${id}`}>
            {compact ? l.short : l.label}
          </button>
        );
      })}
    </div>
  );
}
