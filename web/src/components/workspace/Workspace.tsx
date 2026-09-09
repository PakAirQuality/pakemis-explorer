"use client";
/**
 * The workspace, the application at `/` (the Overview and the Map merged on 2026-08-30): ONE
 * full-bleed map as the canvas (`ExplorerMap` in its workspace variant, `absolute inset-0`)
 * with everything else floating over it —
 *
 *   [nav capsule, left 20 top 20]                       [filter panel, right 20 top 20]
 *   [insight deck, 420 px, left 20, under the capsule]                  [⊕ ⊖ ⌖ ⛶ buttons]
 *   [legend capsule, bottom left of the map, right of the deck]
 *
 * The URL is the single source of truth for level, geo, cell, sector, gas, period, config, gwp,
 * view, layer and scale; a hovered sector stays in React state and never reaches the URL.
 * Whether a panel is open is chrome, not state: it lives in this component and not in the URL,
 * and so do the Map display choices (now inside the filter panel) — the shading opacity, the basemap and whether
 * the boundaries are drawn — which change how the map LOOKS and never what it answers.
 *
 * The camera keeps Pakistan centred in the VISIBLE canvas rather than under a panel: the page
 * computes the chrome's insets from the panels' open / collapsed widths (deck 420 + 20 + 16,
 * filter 340 + 20 + 16, top 84, bottom 56), hands them to the map as `padding` — which the
 * initial framing, `fitAll` and every selection flyTo respect — and calls `map.easeTo({padding})`
 * whenever a panel toggles.
 *
 * Under 1280 px the two panes cannot share the screen, so the workspace shows ONE at a time and
 * the nav capsule carries the switch between them (PaneSwitch, `pane` in the URL, the map by
 * default): the map pane is the map full-bleed with its legend, its buttons and the filters
 * sheet; the dashboard pane is the deck as one full-width column with the map hidden behind it,
 * the filters reachable from the deck's own header. At 1280 px and above both panes are on
 * screen exactly as before and no switch is offered.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MBMap } from "mapbox-gl";
import { Locate, Maximize2, Minimize2, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { geographyName } from "@/lib/labels";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { ExplorerMap, OPENING_MAX_ZOOM, type MapPadding } from "@/components/map/ExplorerMap";
import { unionBbox, useBboxes } from "@/components/map/tiles";
import { OPACITY_DEFAULT } from "@/components/map/layers";
import { BASEMAP_DEFAULT, type BasemapChoice } from "@/components/map/basemap";
import { DECK_INSET_PX, DECK_PX } from "@/components/overview/deck";
import { HEADER } from "@/components/overview/copy";
import { Deck, DeckRail } from "./Deck";
import { PaneSwitch } from "./PaneSwitch";
import { FILTER_GAP_PX, FILTER_INSET_PX, FILTER_WIDTH, FilterPanel, RAIL_WIDTH } from "./FilterPanel";
import { LegendCapsule } from "./LegendCapsule";
import { FILTERS, MAP_BUTTONS } from "./copy";
import type { Pane } from "@/lib/urlState";

/** The gap the deck keeps from the map's own chrome, and the chrome above and below it. */
export const DECK_GAP_PX = 16;
/**
 * Breathing room around the framed country, on top of the chrome's own insets. Small on
 * purpose: every pixel of it costs zoom, and the country should open filling the canvas the
 * panels leave rather than sitting small inside it.
 */
export const FRAME_MARGIN_PX = 12;
export const TOP_CHROME_PX = 84;
export const BOTTOM_CHROME_PX = 56;

/**
 * The visible canvas's insets for the current chrome: the deck's column on the left (nothing
 * when it is closed or the sheet is over the map), the filter panel or its rail on the right,
 * the nav capsule above and the legend capsule below — plus FRAME_MARGIN_PX all round, so the
 * framed country stands off the panels rather than filling the gap between them.
 */
export function chromePadding({ deck, filters, wide }: { deck: boolean; filters: boolean; wide: boolean }): MapPadding {
  // narrow: one pane at a time, so there is no side chrome — the nav above and a small inset all round
  if (!wide) return { top: TOP_CHROME_PX + FRAME_MARGIN_PX, right: FRAME_MARGIN_PX + 20, bottom: FRAME_MARGIN_PX + 20, left: FRAME_MARGIN_PX + 20 };
  return {
    top: TOP_CHROME_PX + FRAME_MARGIN_PX,
    bottom: BOTTOM_CHROME_PX + FRAME_MARGIN_PX,
    left: (deck ? DECK_PX + DECK_INSET_PX + DECK_GAP_PX : DECK_INSET_PX) + FRAME_MARGIN_PX,
    right: (filters ? FILTER_WIDTH : RAIL_WIDTH) + FILTER_INSET_PX + FILTER_GAP_PX + FRAME_MARGIN_PX,
  };
}

const MAP_BUTTON = "glass flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-fg";

export function Workspace() {
  const { state, setState, labels, dims } = useExplorer();
  const wide = useMediaQuery("(min-width: 1280px)");
  const [map, setMap] = useState<MBMap | null>(null);
  // "Reset map" appears only once there is something to reset: a user-driven move, or a picked place or level
  const [moved, setMoved] = useState(false);
  const [deckOpen, setDeckOpen] = useState(true);
  /**
   * Which pane a narrow window shows: the URL's own key, like every other choice on this screen,
   * so it survives a reload and the back button. Only a narrow window mounts the switch that
   * writes it, so a wide window's link never carries a pane — and a wide window reading one
   * ignores it, since it shows both panes anyway.
   */
  const pane: Pane = state.pane;
  const choosePane = useCallback((next: Pane) => setState({ pane: next }), [setState]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  // three display settings the page owns: they change what the map looks like, never what it answers
  const [opacity, setOpacity] = useState(OPACITY_DEFAULT);
  const [basemapChoice, setBasemapChoice] = useState<BasemapChoice>(BASEMAP_DEFAULT);
  const [boundaries, setBoundaries] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // the map follows a hovered or picked sector without writing the URL (the URL wins; hover stays local)
  const [sector, setSector] = useState<string | null>(null);
  // narrow: exactly one pane is on screen; wide: both, and the deck's own collapse decides its column
  const showDeck = wide ? deckOpen : pane === "dashboard";
  const showMap = wide || pane === "map";

  // the deck's scope is a province name (an ADM1 row); any other `geo` reads as Pakistan
  const geo = state.geo && dims.adm1.some((r) => r.name === state.geo) ? state.geo : null;
  const place = geo ? geographyName(labels, geo) : HEADER.country;

  const padding = useMemo(() => chromePadding({ deck: deckOpen, filters: filtersOpen, wide }), [deckOpen, filtersOpen, wide]);
  // Pakistan stays centred in what is visible: the camera is re-padded whenever a panel toggles.
  // Only on a CHANGE: the map applies the same padding itself when it first frames the country
  // (and when it flies to a selection), and an easeTo on mount would interrupt that animation.
  const appliedPad = useRef<MapPadding | null>(null);
  useEffect(() => {
    if (!map) return;
    const was = appliedPad.current;
    appliedPad.current = padding;
    if (!was) return; // the map's own framing already used this padding
    if (was.top === padding.top && was.right === padding.right && was.bottom === padding.bottom && was.left === padding.left) return;
    map.easeTo({ padding, duration: 350 });
  }, [map, padding]);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const bboxes = useBboxes();
  const onGeo = useCallback((name: string | null) => setState({ geo: name, level: "adm1" }), [setState]);
  // the camera's own reset: back to the framing the app opened at (Reset map, and Reset filters too)
  const resetCamera = useCallback(() => {
    setMoved(false);
    fitAllRef.current?.();
  }, []);
  const onReset = useCallback(() => {
    setState({ geo: null, cell: null, level: "adm1" });
    setSector(null);
    resetCamera();
  }, [setState, resetCamera]);
  // A gesture on the canvas is the only unambiguous "the user moved the map": the automatic
  // framings (the initial fitBounds, the padding easeTo, a flyTo to a selection) fire moveend
  // too, and not all of them carry Mapbox's originalEvent.
  useEffect(() => {
    if (!map) return;
    const el = map.getCanvasContainer();
    const mark = () => setMoved(true);
    const events = ["wheel", "mousedown", "touchstart", "dblclick"] as const;
    for (const e of events) el.addEventListener(e, mark, { passive: true });
    return () => {
      for (const e of events) el.removeEventListener(e, mark);
    };
  }, [map]);
  const showReset = moved || !!state.geo || !!state.cell || state.level !== "adm1";
  const fitAllRef = useRef<(() => void) | null>(null);
  const fitAll = () => {
    const u = bboxes.data ? unionBbox(bboxes.data.adm1) : null;
    if (u && map) map.fitBounds([[u[0], u[1]], [u[2], u[3]]], { padding, maxZoom: OPENING_MAX_ZOOM, duration: 500 });
  };
  fitAllRef.current = fitAll;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  };
  const override = useMemo(() => (sector ? { sector } : undefined), [sector]);

  return (
    <div className="relative h-dvh overflow-hidden bg-surface text-fg" data-testid="workspace" data-scope={geo ?? "PK"}>
      <div className="absolute inset-0" data-testid="map-pane" aria-hidden={showMap ? undefined : true}>
        <ExplorerMap variant="workspace" padding={padding} opacity={opacity} basemap={basemapChoice} boundaries={boundaries} onMap={setMap} override={override} />
      </div>

      {/* The pane switch is its OWN pill (the atlas pattern): top-left on a narrow
          window, never embedded in the nav - and the nav itself docks to the bottom
          there, leaving the top to the one control the narrow workspace needs. */}
      {wide ? (
        <NavCapsule floating />
      ) : (
        <>
          <div className="glass pill absolute left-5 top-5 z-30 p-1" data-testid="pane-switch-pill">
            <PaneSwitch pane={pane} onPane={choosePane} />
          </div>
          <NavCapsule docked />
        </>
      )}

      {showDeck ? (
        <Deck
          geo={geo}
          place={place}
          onGeo={onGeo}
          onReset={onReset}
          showReset={showReset}
          onSector={setSector}
          onCollapse={wide ? () => setDeckOpen(false) : undefined}
          onFilters={wide ? undefined : () => setSheetOpen(true)}
          full={!wide}
        />
      ) : wide ? (
        <DeckRail onExpand={() => setDeckOpen(true)} />
      ) : null}

      {wide ? (
        <FilterPanel open={filtersOpen} onToggle={setFiltersOpen} place={place} onResetView={resetCamera} display={{ opacity, onOpacity: setOpacity, basemap: basemapChoice, onBasemap: setBasemapChoice, boundaries, onBoundaries: setBoundaries }} />
      ) : (
        <FilterPanel open={sheetOpen} onToggle={setSheetOpen} place={place} mobile onResetView={resetCamera} display={{ opacity, onOpacity: setOpacity, basemap: basemapChoice, onBasemap: setBasemapChoice, boundaries, onBoundaries: setBoundaries }} />
      )}

      {showMap && <LegendCapsule />}

      {/* clear of the Ask button, which the layout fixes at bottom-6 right-6 (56 px) */}
      {showMap && (
        <div className="absolute bottom-[96px] right-5 z-20 flex flex-col gap-1.5" data-testid="map-buttons">
          <button type="button" title={MAP_BUTTONS.zoomIn} aria-label={MAP_BUTTONS.zoomIn} onClick={() => map?.zoomIn()} className={MAP_BUTTON} data-testid="map-zoom-in">
            <Plus size={16} aria-hidden="true" />
          </button>
          <button type="button" title={MAP_BUTTONS.zoomOut} aria-label={MAP_BUTTONS.zoomOut} onClick={() => map?.zoomOut()} className={MAP_BUTTON} data-testid="map-zoom-out">
            <Minus size={16} aria-hidden="true" />
          </button>
          <button type="button" title={MAP_BUTTONS.locate} aria-label={MAP_BUTTONS.locate} onClick={fitAll} className={MAP_BUTTON} data-testid="map-locate">
            <Locate size={16} aria-hidden="true" />
          </button>
          <button type="button" title={fullscreen ? MAP_BUTTONS.exitFullscreen : MAP_BUTTONS.fullscreen} aria-label={fullscreen ? MAP_BUTTONS.exitFullscreen : MAP_BUTTONS.fullscreen} onClick={toggleFullscreen} className={MAP_BUTTON} data-testid="map-fullscreen">
            {fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          </button>
          {!wide && (
            <button type="button" title={FILTERS.open} aria-label={FILTERS.open} onClick={() => setSheetOpen(true)} className={MAP_BUTTON} data-testid="filters-button">
              <SlidersHorizontal size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

    </div>
  );
}
