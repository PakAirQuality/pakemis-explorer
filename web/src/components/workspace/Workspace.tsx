"use client";
/**
 * The workspace, the application at `/` (the Overview and the Map merged on 2026-08-30): ONE
 * full-bleed map as the canvas (`ExplorerMap` in its workspace variant, `absolute inset-0`)
 * with everything else floating over it —
 *
 *   [nav capsule, left 20 top 20]                    [the assistant, right 0, full height]
 *   [insight deck, 420 px, left 20, under the capsule]     [⚙ ⊕ ⊖ ⌖ ⛶ buttons, clear of it]
 *   [legend capsule, bottom left of the map, right of the deck]
 *
 * The right column is the ASSISTANT, docked (components/ask/docked.ts) at 1280 px and above. The
 * filter panel used to hold that edge; it is now a card the ⚙ button opens over the map, so the
 * controls that live nowhere else - the sector, the map display block, the full reset - are one
 * click away without standing between the reader and the country.
 *
 * The URL is the single source of truth for level, geo, cell, sector, gas, period, config, gwp,
 * view, layer and scale; a hovered sector stays in React state and never reaches the URL.
 * Whether a panel is open is chrome, not state: it lives in this component and not in the URL,
 * and so do the Map display choices (inside the filter card) — the shading opacity, the basemap
 * and whether the boundaries are drawn — which change how the map LOOKS and never what it answers.
 *
 * The camera keeps Pakistan centred in the VISIBLE canvas rather than under a panel: the page
 * computes the chrome's insets from the PERMANENT panels' widths (deck 420 + 20 + 16, assistant
 * 440, top 84, bottom 56), hands them to the map as `padding` — which the initial framing,
 * `fitAll` and every selection flyTo respect — and calls `map.easeTo({padding})` whenever one
 * toggles. The filter card is deliberately not counted; see `chromePadding`.
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
import { placeWords } from "@/lib/selection";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { ASK_PANEL_GAP, ASK_PANEL_WIDTH, WIDE_QUERY, subscribeOpenFilters, useAskDocked } from "@/components/ask/docked";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { ExplorerMap, OPENING_MAX_ZOOM, type MapPadding } from "@/components/map/ExplorerMap";
import { unionBbox, useBboxes } from "@/components/map/tiles";
import { OPACITY_DEFAULT } from "@/components/map/layers";
import { BASEMAP_DEFAULT, type BasemapChoice } from "@/components/map/basemap";
import { DECK_INSET_PX, DECK_PX } from "@/components/overview/deck";
import { HEADER } from "@/components/overview/copy";
import { Deck, DeckRail } from "./Deck";
import { PaneSwitch } from "./PaneSwitch";
import { FILTER_GAP_PX, FILTER_INSET_PX, FilterPanel, RAIL_WIDTH } from "./FilterPanel";
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
 * when it is closed or the sheet is over the map), the ASSISTANT's column on the right, the nav
 * capsule above and the legend capsule below — plus FRAME_MARGIN_PX all round, so the framed
 * country stands off the panels rather than filling the gap between them.
 *
 * THE FILTERS ARE NOT IN THIS SUM ANY MORE. They used to hold the right edge, and the camera
 * re-centred each time they collapsed; now they are a card the map's button stack opens OVER the
 * map for as long as it takes to change a filter, and panning the country sideways every time
 * someone opens them would be a jolt rather than a courtesy. What is permanent gets padding;
 * what is transient floats.
 */
export function chromePadding({ deck, docked, wide }: { deck: boolean; docked: boolean; wide: boolean }): MapPadding {
  // narrow: one pane at a time, so there is no side chrome — the nav above and a small inset all round
  if (!wide) return { top: TOP_CHROME_PX + FRAME_MARGIN_PX, right: FRAME_MARGIN_PX + 20, bottom: FRAME_MARGIN_PX + 20, left: FRAME_MARGIN_PX + 20 };
  return {
    top: TOP_CHROME_PX + FRAME_MARGIN_PX,
    bottom: BOTTOM_CHROME_PX + FRAME_MARGIN_PX,
    left: (deck ? DECK_PX + DECK_INSET_PX + DECK_GAP_PX : DECK_INSET_PX) + FRAME_MARGIN_PX,
    right: (docked ? ASK_PANEL_WIDTH : RAIL_WIDTH + FILTER_INSET_PX + FILTER_GAP_PX) + FRAME_MARGIN_PX,
  };
}

const MAP_BUTTON = "glass flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-fg";

export function Workspace() {
  const { state, setState, labels, dims } = useExplorer();
  const wide = useMediaQuery(WIDE_QUERY);
  // the assistant is this page's right column at this width; the map's own chrome clears it
  const docked = useAskDocked();
  const rightInset = docked ? ASK_PANEL_WIDTH + ASK_PANEL_GAP : FILTER_INSET_PX;
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
  // closed by default now: the filters are a card the map's ⚙ button opens, not a standing panel
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // the assistant's "Change", beside the scope it is about to send, opens the card that changes it
  useEffect(() => subscribeOpenFilters(() => (wide ? setFiltersOpen(true) : setSheetOpen(true))), [wide]);
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
  // the filter summary names the place that is selected, at its own grain: with a district picked
  // it used to read "Pakistan", because only province names were looked up
  const summaryPlace = placeWords(labels, dims, state);

  const padding = useMemo(() => chromePadding({ deck: deckOpen, docked, wide }), [deckOpen, docked, wide]);
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
        <FilterPanel open={filtersOpen} onToggle={setFiltersOpen} place={summaryPlace} onResetView={resetCamera} rail={!docked} rightInset={rightInset} display={{ opacity, onOpacity: setOpacity, basemap: basemapChoice, onBasemap: setBasemapChoice, boundaries, onBoundaries: setBoundaries }} />
      ) : (
        <FilterPanel open={sheetOpen} onToggle={setSheetOpen} place={summaryPlace} mobile onResetView={resetCamera} display={{ opacity, onOpacity: setOpacity, basemap: basemapChoice, onBasemap: setBasemapChoice, boundaries, onBoundaries: setBoundaries }} />
      )}

      {showMap && <LegendCapsule />}

      {/* Clear of whatever holds the right edge: the docked assistant's column where it is the
          page's right column, otherwise the round Ask button the layout fixes at bottom-6 right-6
          (56 px), which is why this stack starts at 96 px rather than at the same inset. */}
      {showMap && (
        <div className="absolute bottom-[96px] z-20 flex flex-col gap-1.5" style={{ right: rightInset }} data-testid="map-buttons">
          {/* The way into the filters at EVERY width since the assistant took the right column:
              it opens the floating card over the map when both panes are on screen, and the
              full-height sheet when only one is. */}
          <button type="button" title={FILTERS.open} aria-label={FILTERS.open} onClick={() => (wide ? setFiltersOpen(true) : setSheetOpen(true))} className={MAP_BUTTON} data-testid="filters-button">
            <SlidersHorizontal size={16} aria-hidden="true" />
          </button>
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
        </div>
      )}

    </div>
  );
}
