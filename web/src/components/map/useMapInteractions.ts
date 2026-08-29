"use client";
/**
 * Hover and click, bound to the fill layers only (a hidden layer fires nothing). Hover sets the
 * `hover` feature-state and reports the feature's id and properties; click writes `geo`
 * (province name / shape_id) or, at grid level, `cell=lat,lon` from the tile's cell centre.
 */
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, MapMouseEvent } from "mapbox-gl";

/** What a layer-scoped mouse event carries: the rendered features under the pointer. */
type MapGeoJSONFeature = { properties?: Record<string, unknown> | null };
import type { Level } from "@/lib/urlState";
import { KEYS } from "./layers";

export type Hover = { level: Level; id: string; props: Record<string, unknown>; x: number; y: number } | null;

const LAYERS: [Level, string][] = [["adm1", "adm1-fill"], ["adm2", "adm2-fill"], ["grid", "grid-fill"]];

export function useMapInteractions(map: MLMap | null, level: Level, onSelect: (level: Level, id: string, props: Record<string, unknown>) => void) {
  const [hover, setHover] = useState<Hover>(null);
  const hovered = useRef<{ source: string; id: string } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (!map) return;
    const clearHover = () => {
      if (hovered.current) {
        map.setFeatureState({ source: hovered.current.source, sourceLayer: hovered.current.source, id: hovered.current.id }, { hover: false });
        hovered.current = null;
      }
    };
    const handlers: { layer: string; move: (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => void; leave: () => void; click: (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => void }[] = [];
    for (const [lvl, layer] of LAYERS) {
      const key = KEYS[lvl];
      const move = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        const id = f?.properties?.[key] as string | undefined;
        if (!f || !id) return;
        if (hovered.current?.id !== id || hovered.current?.source !== lvl) {
          clearHover();
          hovered.current = { source: lvl, id };
          map.setFeatureState({ source: lvl, sourceLayer: lvl, id }, { hover: true });
        }
        map.getCanvas().style.cursor = "pointer";
        setHover({ level: lvl, id, props: (f.properties ?? {}) as Record<string, unknown>, x: e.point.x, y: e.point.y });
      };
      const leave = () => {
        clearHover();
        map.getCanvas().style.cursor = "";
        setHover(null);
      };
      const click = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        const id = f?.properties?.[key] as string | undefined;
        if (!f || !id) return;
        onSelectRef.current(lvl, id, (f.properties ?? {}) as Record<string, unknown>);
      };
      map.on("mousemove", layer, move);
      map.on("mouseleave", layer, leave);
      map.on("click", layer, click);
      handlers.push({ layer, move, leave, click });
    }
    return () => {
      for (const h of handlers) {
        map.off("mousemove", h.layer, h.move);
        map.off("mouseleave", h.layer, h.leave);
        map.off("click", h.layer, h.click);
      }
      clearHover();
    };
  }, [map]);
  useEffect(() => setHover(null), [level]);
  return hover;
}
