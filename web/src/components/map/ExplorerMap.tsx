"use client";
/**
 * The map: Mapbox GL JS v3 over the basemap (basemap.ts; Mapbox light-v11, emissions.web.app's
 * grey land and white water, with v3's globe and atmosphere when the token exists), the layer stack inserted below the basemap's
 * labels (layers.ts), the PMTiles served as TileJSON by the API's /tiles routes, the envelope painted
 * through feature-state (paint.ts), hover and click (useMapInteractions), the floating chrome
 * (the layer switch, raster / 3D / frame buttons, the layer legend, the context pill) and the
 * camera written to `cam`. The choropleth's request is mapBody(state); a refused request leaves
 * outlines and puts the refusal in the legend.
 *
 * The Map page (`variant="console"`) paints the URL's `layer` (layerModes.ts): the magnitude
 * choropleth, the district cells' spatial_class / allocation_status (the envelope's own fields),
 * the province rows' retained mass (the ADM1 envelope's unallocated block) or the known
 * spatial exceptions (exceptions.ts), each with its legend (LayerLegend).
 *
 * `variant="briefing"` (the Overview's map pane) keeps the frame button and, in the legend's
 * place, the bottom-left pill (OpacityPill: the Low–High gradient and an Opacity slider that
 * sets the choropleth's fill-opacity, local state, never the URL); it flies with a small
 * padding and reads `override` merged over the URL state (a hovered sector, the Provinces |
 * Districts toggle) so the briefing can steer the map without writing the URL; `onPick`
 * replaces the click's default (writing `geo` / `cell`). The shared "Other" cell keeps its
 * dotted outline; the hover tip's line explains it.
 *
 * `variant="workspace"` (components/workspace/Workspace.tsx) is the bare canvas: no chrome of
 * its own — the nav capsule, the deck, the filter panel, the legend capsule, the map buttons
 * and Map settings are the workspace's, and the fill opacity arrives as the `opacity` prop. It
 * paints the URL's `layer` as the console does, since Map settings holds the layer switch. Map
 * settings' two other display choices arrive as props, never as URL keys: `basemap` (Light or
 * Streets — the style is swapped and `style.load` re-inserts our whole stack beneath the new
 * labels) and `boundaries` (the province and district outlines).
 *
 * The scale mode (URL `scale`) reaches the paint as `ScalePaint`: `relative` shades by the
 * cells' quantile bands, `absolute` by their values against this envelope, and `fixed` by their
 * values against the level's all-sector, all-gas envelope for the REFERENCE year, which this
 * component fetches under the map's own query key so a scope that already is that envelope
 * costs no second request. Off the reference year the release maps nothing: the fills are
 * cleared to outlines and the legend capsule carries the API's own refusal for the year.
 * `padding` is the chrome the workspace occupies ({top,right,bottom,left} in CSS pixels): it is
 * applied to the initial fitBounds, to `fitAll()` and to every selection flyTo, so the country
 * stays centred in the VISIBLE canvas rather than under a panel, and the bottom-left slot is
 * offset by it instead of by a hard-coded deck width. `onMap` hands the map instance to the
 * page, which drives its zoom buttons and re-applies the padding when a panel toggles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Locate } from "lucide-react";
import type { Map as MBMap } from "mapbox-gl";
import type { ExplorerState, Level } from "@/lib/urlState";
import { absoluteApiBase, api } from "@/lib/api";
import { adm1Body, airMapBody, mapBody, parseCell } from "@/lib/requests";
import { contextPill, gasLabel, monthLabel, periodShort, scopeWords, sectorWords, streamLabel, viewLabel } from "@/lib/labels";
import { metricOf } from "@/lib/selection";
import { useExplorer } from "@/components/ExplorerContext";
import { basemap as buildBasemap, styleFor, type BasemapChoice } from "./basemap";
import { addLayers, addSources, applyLevel, ensureAtmosphere, ensureRaster, firstSymbolLayerId, OPACITY_DEFAULT, RASTER_OPACITY, setFillOpacity, setSelected, setView3d } from "./layers";
import { anyWithoutCell, cellForFeature, clearPaint, exceptionKindOf, exceptionKindsPresent, indexCells, indexUnallocated, paintLayer, type ScalePaint } from "./paint";
import { rasterFile, rasterUrl, unionBbox, useBboxes, useTilesInfo } from "./tiles";

/**
 * The zoom the country opens at: a ceiling, not a fit. Fitting the bounding box into whatever
 * the panels leave makes the opening view depend on the window — wide screens got a tight
 * country filling the canvas. The ceiling gives every window the same first impression, Pakistan
 * with its region around it; a window too small to fit the country at this zoom still fits it,
 * lower. `fitAll()` and the place card's Reset map use it too, so a reset returns to the view
 * the app opened at, while a selection keeps its own closer maxZoom.
 */
export const OPENING_MAX_ZOOM = 3.8;
import { residualUnit, unionOf } from "@/lib/geography";
import { useMapInteractions } from "./useMapInteractions";
import { emitMapPick } from "@/components/ask/mentions";
import { markStage } from "@/components/shell/bootstrap";
import { View3dToggle } from "./View3dToggle";
import { HoverTip } from "./HoverTip";
import { LayerLegend } from "./LayerLegend";
import { RefusalCard } from "@/components/ui/RefusalCard";
import { LayerSwitch } from "./LayerSwitch";
import { exceptionIndex, exceptionItems } from "./exceptions";
import { categoryOf, EXCEPTION_KINDS, mapsPeriod, SPATIAL_CLASSES, statusWords } from "./layerModes";
import { RAMP } from "@/lib/palette";
import type { Cell } from "@/lib/envelope";
import { heldToken } from "@/lib/embedAuth";

const LEVEL_WORD = { adm1: "Provinces", adm2: "Districts", grid: "Grid" } as const;

/**
 * The briefing map's bottom-left pill (the /data canvas): `Low ▬▬▬ High | Opacity ──●── 80%`.
 * It absorbed map/OpacityPill.tsx when Map settings took the workspace's own opacity slider.
 * A pure display setting: the percentage is the input's own integer, never a data number.
 */
function BriefingOpacity({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  return (
    <div className="glass flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs text-muted" data-testid="opacity-pill">
      <span>Low</span>
      <span className="h-2 w-16 rounded-full border border-line" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} aria-hidden="true" data-testid="pill-gradient" />
      <span>High</span>
      <span className="h-4 w-px bg-line-strong" aria-hidden="true" />
      <label className="flex items-center gap-2">
        <span>Opacity</span>
        <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-20 cursor-pointer accent-accent" aria-label="Choropleth opacity" data-testid="opacity-range" />
        <span className="num w-8 text-right text-fg" data-testid="opacity-value">{Math.round(value)}%</span>
      </label>
    </div>
  );
}

/** The chrome a page puts over the map, in CSS pixels: the camera keeps the country inside it. */
export type MapPadding = { top: number; right: number; bottom: number; left: number };

export type ExplorerMapProps = {
  variant?: "console" | "briefing" | "workspace";
  override?: Partial<ExplorerState>;
  onPick?: (level: Level, id: string) => void;
  /** The visible canvas's insets; applied to the initial framing, fitAll and every flyTo. */
  padding?: MapPadding;
  /** The choropleth's fill opacity in percent (the workspace's Map settings owns the slider). */
  opacity?: number;
  /** Which basemap to render under the layers (Map settings; chrome, never the URL). */
  basemap?: BasemapChoice;
  /** Whether the province and district outlines are drawn (Map settings; chrome, never the URL). */
  boundaries?: boolean;
  /** The map instance as it loads, and null as it is torn down. */
  onMap?: (map: MBMap | null) => void;
};

/** The hover tip's line for the current layer: the feature's class, status, retained mass or exception kind, in words. */
export function layerHoverLine(layer: ExplorerState["layer"], level: Level, cell: Cell | undefined, id: string, shared: boolean, ex: ReturnType<typeof exceptionIndex> | null, unalloc: ReturnType<typeof indexUnallocated>, residual: { name: string; members: string[] } | null, labelStream: (s: string) => string): string | null {
  if (layer === "magnitude" || level === "grid") return null;
  const f = (cell ?? {}) as Record<string, unknown>;
  if (layer === "evidence") {
    const c = categoryOf("evidence", cell);
    const def = SPATIAL_CLASSES.find((s) => s.id === c);
    const stream = typeof f.dominant_stream === "string" ? f.dominant_stream : "";
    return def ? `Spatial evidence ${def.label}${stream ? ` · dominant stream ${labelStream(stream)}` : ""}` : cell ? "spatial class not served on this cell" : null;
  }
  if (layer === "method") {
    if (!cell) return null;
    const status = statusWords(String(f.allocation_status ?? "")) || "status not served";
    const pc = statusWords(String(f.placement_class ?? ""));
    const surface = String(f.allocation_surface ?? "");
    return `Allocation ${status}${pc ? ` · placement ${pc}` : ""}${surface ? ` on ${surface}` : ""}`;
  }
  if (layer === "unallocated") {
    const name = residual && residual.members.includes(id) ? residual.name : id;
    const row = unalloc?.byProvince.get(name);
    return row ? `${name}: ${row.short} retained at province level (unallocated)` : level === "adm1" ? "no unallocated row for this province" : "districts are greyed under this layer; provinces carry the retained mass";
  }
  const kind = exceptionKindOf(level, id, cell, shared, ex);
  const k = EXCEPTION_KINDS.find((e) => e.id === kind);
  return k ? `Exception: ${k.label}` : "no known exception here";
}

export function ExplorerMap({ variant = "console", override, onPick, padding, opacity: opacityProp, basemap: basemapChoice, boundaries = true, onMap }: ExplorerMapProps = {}) {
  const { state: urlState, setState, labels, dims, release, defaults, isMobile } = useExplorer();
  const state = useMemo(() => (override ? { ...urlState, ...override } : urlState), [urlState, override]);
  const full = variant === "console";
  const briefing = variant === "briefing";
  // the workspace paints the URL's layer as the console does (Map settings holds its switch);
  // the briefing map on /data is the magnitude choropleth and nothing else
  const layered = !briefing;
  // a pollutant paints magnitude alone: the evidence and unallocated layers belong to the CO2e product
  const layer = state.pol ? "magnitude" : layered ? state.layer : "magnitude";
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onMapRef = useRef(onMap);
  onMapRef.current = onMap;
  // the page's chrome, read through a ref so a panel toggling does not re-run the framing effects
  const padRef = useRef<MapPadding | undefined>(padding);
  padRef.current = padding;
  const boundariesRef = useRef(boundaries);
  boundariesRef.current = boundaries;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MBMap | null>(null);
  const [map, setMap] = useState<MBMap | null>(null);
  const beforeRef = useRef<string | undefined>(undefined); // the basemap's first symbol layer
  const [mapError, setMapError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [legendOpen, setLegendOpen] = useState(true);
  const [styleEpoch, setStyleEpoch] = useState(0); // bumped on every style.load: the layers are re-added and everything repaints
  const [pillOpacity, setPillOpacity] = useState(OPACITY_DEFAULT); // the briefing pill's slider, percent; a display setting
  const opacity = opacityProp ?? pillOpacity;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const stateRef = useRef(state);
  stateRef.current = state;
  const tiles = useTilesInfo();
  const bboxes = useBboxes();
  const bm = useMemo(buildBasemap, []);

  const airBody = useMemo(() => airMapBody(state), [state]);
  const body = useMemo(() => (state.pol ? null : mapBody(state)), [state]);
  const mapQ = useQuery({
    queryKey: ["map", state.pol ? airBody : body],
    queryFn: ({ signal }) => (state.pol ? api.queryAir(airBody!, signal) : api.queryEmissions(body!, signal)),
    enabled: state.pol ? !!airBody : !!body,
    retry: false,
  });
  // Map settings' FIXED scale: the level's all-sector, all-gas envelope for the reference year
  // under the same configuration, fetched once and reused, so choosing a sector or a gas moves
  // the colours within a domain that does not move. Its key is the map's own when the scope is
  // already that envelope, so the request is not sent twice.
  const referencePeriod = useMemo(() => dims.periods.find((r) => String(r.is_reference).toLowerCase() === "true")?.period_id ?? state.period, [dims.periods, state.period]);
  const fixedBody = useMemo(() => (state.scale === "fixed" && !state.pol ? mapBody({ ...state, sector: null, gas: null, month: null, period: referencePeriod }) : null), [state, referencePeriod]);
  const fixedQ = useQuery({ queryKey: ["map", fixedBody], queryFn: () => api.queryEmissions(fixedBody!), enabled: !!fixedBody, retry: false });
  const scale: ScalePaint = useMemo(() => {
    if (state.scale !== "fixed" || !fixedQ.data || state.level === "grid") return { mode: state.scale, domain: null };
    const i = indexCells(fixedQ.data, state.level);
    return { mode: "fixed", domain: { min: i.min, max: i.max } };
  }, [state.scale, state.level, fixedQ.data]);
  // since the air spatial lane the district air envelopes carry shape_id natively - the
  // same canonical frame every other district product speaks; no re-keying
  const index = useMemo(() => (mapQ.data && state.level !== "grid" ? indexCells(mapQ.data, state.level) : null), [mapQ.data, state.level]);
  // asked, not yet answered: no cell is known for any polygon, which is different from "no cell"
  const waiting = mapQ.isFetching && !index;
  // the unallocated layer reads the province envelope at either level (the map's own ADM1 request, so the key is shared)
  const provinceBody = useMemo(() => adm1Body(state), [state]);
  const provinceQ = useQuery({ queryKey: ["map", provinceBody], queryFn: () => api.queryEmissions(provinceBody), enabled: layered && layer === "unallocated", retry: false });
  const unallocIdx = useMemo(() => (layer === "unallocated" ? indexUnallocated(provinceQ.data) : null), [layer, provinceQ.data]);
  // the release's residual ADM1 unit ("Other": one cell, several polygons), derived from the dims and the boundary file
  const residual = useMemo(() => residualUnit(dims, bboxes.data, labels), [dims, bboxes.data, labels]);
  const residualRef = useRef(residual);
  residualRef.current = residual;
  const exIdx = useMemo(() => (layered ? exceptionIndex(dims, residual?.name ?? null) : null), [layered, dims, residual]);
  const exItems = useMemo(() => (layered && exIdx ? exceptionItems(release, exIdx, residual) : []), [layered, exIdx, release, residual]);
  // rc47: the polygon levels are year-aware (fact_adm2_year); only the grid level is
  // reference-only, because its value rasters are built from the reference cubes alone
  const mapped = mapsPeriod(labels, state.period, state.level);
  const adm1Ids = useMemo(() => Object.keys(bboxes.data?.adm1 ?? {}), [bboxes.data]);
  const ids = useMemo(() => (state.level === "adm1" ? adm1Ids : state.level === "adm2" ? Object.keys(bboxes.data?.adm2 ?? {}) : []), [state.level, adm1Ids, bboxes.data]);

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
      const apiOrigin = absoluteApiBase();
      const initial = stateRef.current.cam?.split(",").map(Number);
      const m = new mapboxgl.Map({
        container: containerRef.current,
        style: bm.style,
        center: initial && initial.length === 3 && initial.every(Number.isFinite) ? [initial[0], initial[1]] : [69.5, 30.2],
        zoom: initial && initial.length === 3 && Number.isFinite(initial[2]) ? initial[2] : 4.8,
        minZoom: 3.5,
        maxZoom: 12,
        // hawanama.org's flags; no `projection`, so v3's globe and atmosphere apply to light-v11
        attributionControl: false,
        logoPosition: "bottom-left",
        maxPitch: 45,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
        antialias: false,
        // Mapbox fetches the tiles and the raster frames itself, so our own fetch wrapper never
        // sees them: in the embedded build they carry the reader's identity through this transform
        // (a no-op in the public build, where heldToken() is always empty).
        transformRequest: (url: string) => {
          const bearer = heldToken();
          if (!bearer || !url.startsWith(apiOrigin)) return { url };
          return { url, headers: { Authorization: `Bearer ${bearer}` } };
        },
      });
      mapRef.current = m;
      (window as unknown as { __pakemisMap?: unknown }).__pakemisMap = m; // inspection aid: the map holds no numbers
      // Mapbox's own control (their terms want the attribution and wordmark), plus ours.
      m.addControl(new mapboxgl.AttributionControl({ compact: true, customAttribution: bm.attribution }), "bottom-right");
      m.on("error", (e) => {
        const msg = (e as { error?: { message?: string } }).error?.message ?? "";
        if (msg) setMapError(msg);
      });
      // every style load — the first, and each Map settings basemap change — re-inserts our
      // sources and layers below the new style's labels; the epoch makes the paint effects re-run
      m.on("style.load", () => {
        ensureAtmosphere(m);
        beforeRef.current = firstSymbolLayerId(m);
        addSources(m);
        addLayers(m, beforeRef.current);
        applyLevel(m, stateRef.current.level, stateRef.current.raster, variant !== "briefing" ? stateRef.current.layer : "magnitude", boundariesRef.current);
        setStyleEpoch((e) => e + 1);
      });
      m.on("load", () => {
        markStage("map"); // the loading screen's last stage on the pages with a map
        setMap(m);
        onMapRef.current?.(m);
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
      onMapRef.current?.(null);
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
    if (u) map.fitBounds([[u[0], u[1]], [u[2], u[3]]], { padding: padRef.current ?? (isMobile ? 16 : 40), maxZoom: OPENING_MAX_ZOOM, duration: 0 });
  }, [map, bboxes.data, isMobile]);

  // --- the basemap Map settings chose: the style is swapped and `style.load` re-adds our stack
  const appliedStyle = useRef<BasemapChoice | undefined>(basemapChoice);
  useEffect(() => {
    if (!map || !basemapChoice || appliedStyle.current === basemapChoice) return;
    appliedStyle.current = basemapChoice;
    map.setStyle(styleFor(bm, basemapChoice));
  }, [map, basemapChoice, bm]);

  // --- level, layer, boundary and raster visibility
  useEffect(() => {
    if (map) applyLevel(map, state.level, state.raster, layer, boundaries);
  }, [map, state.level, state.raster, layer, boundaries, styleEpoch]);

  // --- the opacity slider (the briefing pill, the workspace's Map settings): the fills' opacity, re-applied when the level's layer changes
  useEffect(() => {
    if (map && !full) setFillOpacity(map, opacity);
  }, [map, full, opacity, state.level, styleEpoch]);

  // --- the 3D view: terrain, atmosphere and the tilted camera
  useEffect(() => {
    if (map) setView3d(map, state.view3d);
  }, [map, state.view3d]);

  // --- paint the layer (or clear: a level the release does not map for this year greys to
  // outlines while the legend capsule carries the API's own refusal - grid off-reference)
  useEffect(() => {
    if (!map || state.level === "grid") return;
    if (!mapped) {
      clearPaint(map, state.level);
      return;
    }
    if (index || mapQ.error || layer === "unallocated") paintLayer(map, state.level, { layer, index, ids, residual, exceptions: exIdx, unallocated: unallocIdx, adm1Ids, scale });
    // WAITING IS NOT THE LAST ANSWER. With a new year, sector or metric asked for and nothing back
    // yet, this effect used to do nothing, so the previous selection's colours stayed on the map
    // under the new selection's labels - CO₂e fills beneath a PM₂.₅ legend, for as long as the
    // request took. The polygons go to outlines until the answer that belongs to them arrives.
    else if (waiting) clearPaint(map, state.level);
  }, [map, index, state.level, layer, mapped, mapQ.error, waiting, ids, residual, exIdx, unallocIdx, adm1Ids, scale, styleEpoch]);

  // --- selection outline and flyTo
  useEffect(() => {
    if (!map) return;
    setSelected(map, state.level, state.geo, parseCell(state.cell), residual && state.geo === residual.name ? residual.members : undefined);
  }, [map, state.level, state.geo, state.cell, residual, styleEpoch]);
  const lastFlown = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !bboxes.data || !state.geo) return;
    const key = `${state.level}:${state.geo}`;
    if (lastFlown.current === key) return;
    lastFlown.current = key;
    // a province name flies to its box at either level (the briefing's Districts toggle keeps the province)
    const box = residual && state.geo === residual.name ? unionOf(bboxes.data.adm1, residual.members) : state.level === "grid" ? null : (bboxes.data.adm1[state.geo] ?? bboxes.data.adm2[state.geo] ?? null);
    const pad = padRef.current ?? (!full ? { top: 48, bottom: 48, left: 40, right: 40 } : isMobile ? { top: 60, bottom: 260, left: 16, right: 16 } : { top: 90, bottom: 80, left: 60, right: 60 });
    if (box) map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: pad, maxZoom: 9, duration: 700 });
  }, [map, bboxes.data, state.geo, state.level, isMobile, residual, full]);

  // --- the grid raster (visual only): one image source, updated per frame, opacity 0 when off
  const raster = tiles.data?.raster;
  const rasterName = rasterFile(raster, state.config, state.gas ?? "", state.month);
  useEffect(() => {
    if (!map || !raster || !rasterName) return;
    ensureRaster(map, rasterUrl(rasterName), raster.image_coordinates, state.raster ? RASTER_OPACITY : 0, beforeRef.current);
  }, [map, raster, rasterName, state.raster]);

  // --- interactions
  const onSelect = useCallback((lvl: "adm1" | "adm2" | "grid", id: string, props: Record<string, unknown>) => {
    // a member of the residual unit selects the release's own id for it (the API answers geography_ids: [<row name>])
    const r = residualRef.current;
    const geo = lvl === "adm1" && r && r.members.includes(id) ? r.name : id;
    if (onPickRef.current) onPickRef.current(lvl, lvl === "grid" ? `${props.lat},${props.lon}` : geo);
    else if (lvl === "grid") setStateRef.current({ cell: `${props.lat},${props.lon}` });
    else if (lvl === "adm1" && stateRef.current.level === "adm1") {
      // CLICK DRILLS DOWN AND KEEPS THE SELECTION: a click over Lahore used to hit
      // the invisible-districts Punjab polygon and the panel showed the province.
      // Clicking a province now descends the map to its districts while the deck
      // becomes THAT PROVINCE's (geo names its own grain - lib/geography geoGrain),
      // so the next click, a district, makes the deck that district's. The fly-to
      // effect already zooms to a province box at either level; the breadcrumb chip
      // and the Provinces|Districts segment go back up.
      setStateRef.current({ level: "adm2", geo });
    } else setStateRef.current({ geo, level: lvl });
    emitMapPick({ level: lvl, id: geo, props }); // an @mention for an open Ask composer
  }, []);
  const hover = useMapInteractions(map, state.level, onSelect);
  const hovered = hover && index ? cellForFeature(index, hover.level, hover.id, residual) : null;
  const hoverCell = hovered?.cell ?? null;
  const hoverExtra = hover && layered ? layerHoverLine(layer, hover.level, hoverCell ?? undefined, hover.id, !!hovered?.shared, exIdx, unallocIdx, residual, (s) => streamLabel(labels, s)) : null;
  const sharedCell = index && residual && state.level === "adm1" ? index.byId.get(residual.name) : undefined;
  const legendShared = sharedCell && residual ? { ...residual, cell: sharedCell } : null;
  const anyNoCell = !!index && anyWithoutCell(index, state.level, ids, residual);
  const exPresent = useMemo(() => (layer === "exceptions" ? exceptionKindsPresent(state.level, index, ids, residual, exIdx) : new Set<string>()), [layer, state.level, index, ids, residual, exIdx]);

  const metric = metricOf(state, labels);
  const scope = metric.family === "air"
    ? [LEVEL_WORD[state.level], `${metric.label} emissions`, periodShort(labels, state.period), sectorWords(labels, state.sector)].filter(Boolean).join(" · ")
    : [LEVEL_WORD[state.level], scopeWords(labels, state, defaults.gwp_basis, sectorWords(labels, state.sector), state.gas || state.level === "grid" ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null, state.view !== "all" ? viewLabel(labels, state.view).split(":")[0] : null)].join(" · ");
  // the context pill: the year basis, the configuration, the GWP basis and the LULUCF status as words; no version (the release identity lives on /data)
  const pill = contextPill(labels, release.context_bar, state);
  const workspace = variant === "workspace";
  // the bottom-left slot clears the page's own chrome: the deck's column on the workspace, the legend's own inset elsewhere
  const corner = padding ? { left: padding.left + 12, bottom: workspace ? 64 : 32 } : undefined;
  const fitAll = () => {
    const u = bboxes.data ? unionBbox(bboxes.data.adm1) : null;
    if (u && map) map.fitBounds([[u[0], u[1]], [u[2], u[3]]], { padding: padRef.current ?? 40, duration: 500 });
  };

  return (
    <div className="absolute inset-0" data-testid="explorer-map" data-layer={layer}>
      {/* mapbox-gl.css (imported after Tailwind) sets .mapboxgl-map { position: relative },
          which beats `absolute`; the explicit height keeps the container full-size either way. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {bm.notice && <div className="absolute inset-x-0 top-0 z-20 bg-refusal px-3 py-1 text-center text-micro normal-case tracking-normal text-warn" data-testid="basemap-notice">{bm.notice}</div>}
      {mapError && <div className="absolute left-1/2 top-12 z-20 -translate-x-1/2 rounded bg-refusal px-3 py-1 text-xs text-warn" data-testid="map-error">Map: {mapError}</div>}
      <HoverTip hover={hover} cell={hoverCell} labels={labels} dims={dims} refused={!!mapQ.error} loading={waiting} container={size} residual={residual} extra={hoverExtra} />

      {full && (
        <div className={`absolute left-3 z-20 max-w-[calc(100%-140px)] ${bm.notice ? "top-8" : "top-3"}`}>
          <LayerSwitch compact={isMobile || (size.width > 0 && size.width < 980)} />
        </div>
      )}
      {state.level === "adm2" && (
        <div className={`absolute left-3 z-20 ${full ? (bm.notice ? "top-[4.5rem]" : "top-14") : bm.notice ? "top-8" : "top-3"}`}>
          <button
            onClick={() => { setState({ level: "adm1", geo: null }); fitAll(); }}
            className="glass pill px-2.5 py-1 text-micro normal-case tracking-normal text-muted hover:text-fg"
            data-testid="breadcrumb-provinces"
            title="Back to the provinces"
          >
            &lsaquo; Provinces
          </button>
        </div>
      )}
      {!workspace && (
        <div className={`absolute right-3 z-20 flex flex-col items-end gap-1.5 ${bm.notice ? "top-8" : "top-3"}`}>
          {full && (
            <button title={state.raster ? "Hide the grid raster (visual only)" : "Show the grid raster (visual only)"} aria-pressed={state.raster} onClick={() => setState({ raster: !state.raster })} className={`glass flex h-9 w-9 items-center justify-center rounded-xl ${state.raster ? "text-accent" : "text-muted"}`} data-testid="raster-toggle">
              <Layers size={16} />
            </button>
          )}
          {full && <View3dToggle />}
          <button title="Frame Pakistan" onClick={fitAll} className="glass flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-fg">
            <Locate size={16} />
          </button>
        </div>
      )}
      {/* the bottom-left slot: cleared of the page's chrome by `padding` (the deck's column) rather than by a hard-coded width */}
      <div className={`absolute z-20 ${corner ? "" : full && isMobile ? "bottom-3 left-3" : "bottom-8 left-3"}`} style={corner} data-testid="map-bottom-left">
        {isMobile && full && (
          <button onClick={() => setLegendOpen((o) => !o)} className="glass pill mb-1 px-2.5 py-1 text-micro normal-case tracking-normal">
            {legendOpen ? "hide legend" : "legend"}
          </button>
        )}
        {legendOpen && full && (
          <LayerLegend state={state} scope={scope} env={mapQ.data} index={index} error={mapQ.error} isLoading={mapQ.isLoading} raster={raster} hasCells={anyNoCell} shared={legendShared} unallocated={{ env: provinceQ.data, index: unallocIdx, error: provinceQ.error, isLoading: provinceQ.isLoading }} exceptions={{ present: exPresent, items: exItems }} />
        )}
        {briefing && <BriefingOpacity value={opacity} onChange={setPillOpacity} />}
        {/* the workspace has the legend capsule for this; only the /data canvas needs it here */}
        {briefing && mapQ.error ? <div className="mt-1 max-w-[272px]" data-testid="briefing-refusal"><RefusalCard error={mapQ.error} compact /></div> : null}
      </div>
      {full && !isMobile && (
        <div className="glass pill absolute bottom-8 right-3 z-20 max-w-[420px] truncate px-3 py-1 text-micro normal-case tracking-normal text-muted" data-testid="context-pill" title={pill.title}>
          {pill.words}
        </div>
      )}
    </div>
  );
}
