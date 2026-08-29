"use client";
/**
 * The map: Mapbox GL JS v3 over the basemap (basemap.ts; hawanama.org's streets-v12 with v3's
 * globe and atmosphere when the token exists), the layer stack inserted below the basemap's
 * labels (layers.ts), the PMTiles served as TileJSON by app/tiles/[name], the envelope painted
 * through feature-state (paint.ts), hover and click (useMapInteractions), the floating chrome
 * (ScopeChips + the Ask hint, Ask pill, raster / 3D / frame buttons, TimeRail, Legend, context
 * pill) and the camera written to `cam`. The choropleth's request is mapBody(state); a refused
 * request leaves outlines and puts the refusal in the legend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Locate } from "lucide-react";
import type { Map as MBMap } from "mapbox-gl";
import { api } from "@/lib/api";
import { mapBody, parseCell } from "@/lib/requests";
import { configLetter, gasLabel, monthLabel, periodShort, sectorLabel, viewLabel } from "@/lib/labels";
import { useExplorer } from "@/components/ExplorerContext";
import { basemap as buildBasemap } from "./basemap";
import { addLayers, addSources, applyLevel, ensureAtmosphere, ensureRaster, firstSymbolLayerId, RASTER_OPACITY, setSelected, setView3d, TILES } from "./layers";
import { anyWithoutCell, cellForFeature, clearPaint, indexCells, paintEnvelope } from "./paint";
import { rasterFile, unionBbox, useBboxes, useTilesInfo } from "./tiles";
import { residualUnit, unionOf } from "@/lib/geography";
import { useMapInteractions } from "./useMapInteractions";
import { emitMapPick } from "@/components/ask/mentions";
import { AskHint, AskPill } from "@/components/ask/AskEntry";
import { View3dToggle } from "./View3dToggle";
import { HoverTip } from "./HoverTip";
import { Legend } from "./Legend";
import { TimeRail } from "./TimeRail";
import { ScopeChips } from "./ScopeChips";

const LEVEL_WORD = { adm1: "Provinces", adm2: "Districts", grid: "Grid" } as const;

export function ExplorerMap() {
  const { state, setState, labels, dims, release, isMobile } = useExplorer();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MBMap | null>(null);
  const [map, setMap] = useState<MBMap | null>(null);
  const beforeRef = useRef<string | undefined>(undefined); // the basemap's first symbol layer
  const [mapError, setMapError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [legendOpen, setLegendOpen] = useState(true);
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const stateRef = useRef(state);
  stateRef.current = state;
  const tiles = useTilesInfo();
  const bboxes = useBboxes();
  const bm = useMemo(buildBasemap, []);

  const body = useMemo(() => mapBody(state), [state]);
  const mapQ = useQuery({ queryKey: ["map", body], queryFn: () => api.queryEmissions(body!), enabled: !!body, retry: false });
  const index = useMemo(() => (mapQ.data && state.level !== "grid" ? indexCells(mapQ.data, state.level) : null), [mapQ.data, state.level]);
  // the release's residual ADM1 unit ("Other": one cell, several polygons), derived from the dims and the boundary file
  const residual = useMemo(() => residualUnit(dims, bboxes.data), [dims, bboxes.data]);
  const residualRef = useRef(residual);
  residualRef.current = residual;
  const ids = useMemo(() => (state.level === "adm1" ? Object.keys(bboxes.data?.adm1 ?? {}) : state.level === "adm2" ? Object.keys(bboxes.data?.adm2 ?? {}) : []), [state.level, bboxes.data]);

  // --- the map itself
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      // Development aid: a hidden document never fires requestAnimationFrame, so Mapbox GL
      // neither loads tiles nor paints there (browser automation windows are hidden). With
      // `?hidden=render` the frame callback runs on a timer instead; nothing else changes.
      if (new URLSearchParams(window.location.search).get("hidden") === "render") {
        window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
          window.setTimeout(() => cb(performance.now()), 16)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;
        // Mapbox GL also pauses while the document reports itself hidden.
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      }
      if (cancelled || !containerRef.current || !bm.token) return; // no token: no map (basemap.ts)
      // The token is assigned here and nowhere else; it leaves the page only as the query
      // parameter of Mapbox's own requests.
      mapboxgl.accessToken = bm.token;
      const initial = stateRef.current.cam?.split(",").map(Number);
      const m = new mapboxgl.Map({
        container: containerRef.current,
        style: bm.style,
        center: initial && initial.length === 3 && initial.every(Number.isFinite) ? [initial[0], initial[1]] : [69.5, 30.2],
        zoom: initial && initial.length === 3 && Number.isFinite(initial[2]) ? initial[2] : 4.8,
        minZoom: 3.5,
        maxZoom: 12,
        // hawanama.org's flags; no `projection`, so v3's globe and atmosphere apply to streets-v12
        attributionControl: false,
        logoPosition: "bottom-left",
        maxPitch: 45,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
        antialias: false,
      });
      mapRef.current = m;
      (window as unknown as { __pakemisMap?: unknown }).__pakemisMap = m; // inspection aid: the map holds no numbers
      // Mapbox's own control (their terms want the attribution and wordmark), plus ours.
      m.addControl(new mapboxgl.AttributionControl({ compact: true, customAttribution: bm.attribution }), "bottom-right");
      m.on("error", (e) => {
        const msg = (e as { error?: { message?: string } }).error?.message ?? "";
        if (msg) setMapError(msg);
      });
      m.on("load", () => {
        ensureAtmosphere(m);
        beforeRef.current = firstSymbolLayerId(m);
        addSources(m);
        addLayers(m, beforeRef.current);
        applyLevel(m, stateRef.current.level, stateRef.current.raster);
        setMap(m);
      });
      m.on("moveend", () => {
        const c = m.getCenter();
        setStateRef.current({ cam: `${c.lng.toFixed(4)},${c.lat.toFixed(4)},${m.getZoom().toFixed(2)}` }, { history: "replace" });
      });
    })();
    const el = containerRef.current;
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { mapRef.current?.resize(); if (el) setSize({ width: el.clientWidth, height: el.clientHeight }); }) : null;
    if (el && ro) ro.observe(el);
    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- initial framing: the union of the ADM1 boxes, unless the URL carries a camera
  const framed = useRef(false);
  useEffect(() => {
    if (!map || !bboxes.data || framed.current) return;
    framed.current = true;
    if (stateRef.current.cam) return;
    const u = unionBbox(bboxes.data.adm1);
    if (u) map.fitBounds([[u[0], u[1]], [u[2], u[3]]], { padding: isMobile ? 16 : 40, duration: 0 });
  }, [map, bboxes.data, isMobile]);

  // --- level and raster visibility
  useEffect(() => {
    if (map) applyLevel(map, state.level, state.raster);
  }, [map, state.level, state.raster]);

  // --- the 3D view: terrain, atmosphere and the tilted camera
  useEffect(() => {
    if (map) setView3d(map, state.view3d);
  }, [map, state.view3d]);

  // --- paint the envelope (or clear on refusal)
  useEffect(() => {
    if (!map || state.level === "grid") return;
    if (index) paintEnvelope(map, state.level, index, ids, residual);
    else if (mapQ.error) clearPaint(map, state.level);
  }, [map, index, state.level, mapQ.error, ids, residual]);

  // --- selection outline and flyTo
  useEffect(() => {
    if (!map) return;
    setSelected(map, state.level, state.geo, parseCell(state.cell), residual && state.geo === residual.name ? residual.members : undefined);
  }, [map, state.level, state.geo, state.cell, residual]);
  const lastFlown = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !bboxes.data || !state.geo) return;
    const key = `${state.level}:${state.geo}`;
    if (lastFlown.current === key) return;
    lastFlown.current = key;
    const box = state.level === "adm1" ? (residual && state.geo === residual.name ? unionOf(bboxes.data.adm1, residual.members) : bboxes.data.adm1[state.geo]) : state.level === "adm2" ? bboxes.data.adm2[state.geo] : null;
    if (box) map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: isMobile ? { top: 60, bottom: 260, left: 16, right: 16 } : { top: 90, bottom: 120, left: 60, right: 420 }, maxZoom: 9, duration: 700 });
  }, [map, bboxes.data, state.geo, state.level, isMobile, residual]);

  // --- the grid raster (visual only): one image source, updated per frame, opacity 0 when off
  const raster = tiles.data?.raster;
  const rasterName = rasterFile(raster, state.config, state.gas ?? "", state.month);
  useEffect(() => {
    if (!map || !raster || !rasterName) return;
    ensureRaster(map, `${TILES}/raster/${rasterName}`, raster.image_coordinates, state.raster ? RASTER_OPACITY : 0, beforeRef.current);
  }, [map, raster, rasterName, state.raster]);

  // --- interactions
  const onSelect = useCallback((lvl: "adm1" | "adm2" | "grid", id: string, props: Record<string, unknown>) => {
    // a member of the residual unit selects the release's own id for it (the API answers geography_ids: [<row name>])
    const r = residualRef.current;
    const geo = lvl === "adm1" && r && r.members.includes(id) ? r.name : id;
    if (lvl === "grid") setStateRef.current({ cell: `${props.lat},${props.lon}` });
    else setStateRef.current({ geo });
    if (stateRef.current.ask) emitMapPick({ level: lvl, id: geo, props }); // an @mention for the Ask composer
  }, []);
  const hover = useMapInteractions(map, state.level, onSelect);
  const hoverCell = hover && index ? cellForFeature(index, hover.level, hover.id, residual).cell ?? null : null;
  const sharedCell = index && residual && state.level === "adm1" ? index.byId.get(residual.name) : undefined;
  const legendShared = sharedCell && residual ? { ...residual, cell: sharedCell } : null;
  const anyNoCell = !!index && anyWithoutCell(index, state.level, ids, residual);

  const scope = [LEVEL_WORD[state.level], periodShort(labels, state.period), configLetter(labels, state.config), state.gwp, sectorLabel(labels, state.sector), state.gas || state.level === "grid" ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null, state.view !== "all" ? viewLabel(labels, state.view).split(":")[0] : null]
    .filter(Boolean)
    .join(" · ");
  const cb = release.context_bar;
  const fitAll = () => {
    const u = bboxes.data ? unionBbox(bboxes.data.adm1) : null;
    if (u && map) map.fitBounds([[u[0], u[1]], [u[2], u[3]]], { padding: 40, duration: 500 });
  };

  return (
    <div className="absolute inset-0" data-testid="explorer-map">
      {/* mapbox-gl.css (imported after Tailwind) sets .mapboxgl-map { position: relative },
          which beats `absolute`; the explicit height keeps the container full-size either way. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {bm.notice && <div className="absolute inset-x-0 top-0 z-20 bg-refusal px-3 py-1 text-center text-micro normal-case tracking-normal text-warn" data-testid="basemap-notice">{bm.notice}</div>}
      {mapError && <div className="absolute left-1/2 top-12 z-20 -translate-x-1/2 rounded bg-refusal px-3 py-1 text-xs text-warn" data-testid="map-error">Map: {mapError}</div>}
      <HoverTip hover={hover} cell={hoverCell} labels={labels} dims={dims} refused={!!mapQ.error} container={size} residual={residual} />

      <div className={`absolute left-3 z-20 ${bm.notice ? "top-8" : "top-3"}`}>
        <ScopeChips />
        <AskHint />
      </div>
      <div className={`absolute right-3 z-20 flex flex-col items-end gap-1.5 ${bm.notice ? "top-8" : "top-3"}`}>
        <AskPill />
        <button title={state.raster ? "Hide the grid raster (visual only)" : "Show the grid raster (visual only)"} aria-pressed={state.raster} onClick={() => setState({ raster: !state.raster })} className={`glass flex h-9 w-9 items-center justify-center rounded-xl ${state.raster ? "text-accent" : "text-muted"}`} data-testid="raster-toggle">
          <Layers size={16} />
        </button>
        <View3dToggle />
        <button title="Frame Pakistan" onClick={fitAll} className="glass flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-ink">
          <Locate size={16} />
        </button>
      </div>
      <div className={`absolute left-3 z-20 ${isMobile ? "bottom-[92px]" : "bottom-8"}`}>
        {isMobile && (
          <button onClick={() => setLegendOpen((o) => !o)} className="glass pill mb-1 px-2.5 py-1 text-micro normal-case tracking-normal">
            {legendOpen ? "hide legend" : "legend"}
          </button>
        )}
        {legendOpen && <Legend state={state} scope={scope} env={mapQ.data} index={index} error={mapQ.error} isLoading={mapQ.isLoading} raster={raster} rasterOn={state.raster} hasCells={anyNoCell} shared={legendShared} />}
        {!isMobile && <div className="mt-1.5 text-micro normal-case tracking-normal text-muted/90">PakEmis Explorer</div>}
      </div>
      <div className={`absolute z-20 flex justify-center ${isMobile ? "bottom-2 left-2 right-2" : "bottom-8 left-[296px] right-[300px]"}`}>
        <TimeRail compact={isMobile} />
      </div>
      {!isMobile && (
        <div className="glass pill absolute bottom-8 right-3 z-20 max-w-[280px] truncate px-3 py-1 text-micro normal-case tracking-normal text-muted" data-testid="context-pill" title={`${cb.release} · ${cb.basis} · ${configLetter(labels, state.config)} · ${state.gwp} · LULUCF ${cb.lulucf.status} (${cb.lulucf.notation_key}) · commit ${release.commit ?? "?"}`}>
          {cb.release} · {cb.basis} · {configLetter(labels, state.config)} · {state.gwp} · LULUCF {cb.lulucf.status} ({cb.lulucf.notation_key})
        </div>
      )}
    </div>
  );
}
