"use client";
/**
 * The public Overview as a country briefing (2026-08-30, Global Mangrove Watch's floating
 * dashboard): under the 56 px TopNav (compact: edge-aligned) the map runs FULL-BLEED behind
 * everything (the map pane `absolute inset-0` in a frame `relative h-[calc(100dvh-56px)]`) and
 * the dashboard is a floating stack of separate rounded white cards over the map's left side —
 * a 520 px column inset 20 px, its own thin scrollbar, no background of its own (the map shows
 * between the cards); the column lets pointer events through to the map, each card takes them
 * back. The cards, in order: the place header (accent blue, the wave, the eyebrow, Pakistan /
 * the province, Reset view · Choose a province · Share · Download, the province select as a
 * white pill), the deck controls (Sections (n) · Collapse / Expand all sections), the opening
 * statement, the four widgets (Emissions by sector · over time · by gas · Where emissions are
 * placed), each with a switch that collapses it to its header row, then the footer card. The
 * map (the ExplorerMap's briefing variant: the frame button and the Provinces | Districts
 * toggle top-right, the opacity pill bottom-left clear of the deck) follows the widget in view
 * when that card is open (Sectors: a hovered or selected sector filters the choropleth;
 * Places: provinces; otherwise every sector) and the province select. Under 1024 px the deck is
 * a normal stacked column above the map at 60 vh. No slogan, no total card, no Ask box (Ask is
 * the nav button), no tab strip (the collapsing cards replace it). Every number on the page is
 * a server string; the page computes nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import { useBriefing } from "@/lib/queries";
import { geographyName } from "@/lib/labels";
import { releaseCitation, releaseFacts } from "@/lib/release";
import { api } from "@/lib/api";
import { NavHeader } from "@/components/shell/NavCapsule";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { markStage } from "@/components/shell/bootstrap";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { HeaderBlock } from "./HeaderBlock";
import { DeckControls } from "./DeckControls";
import { OpeningStatement } from "./OpeningStatement";
import { BriefingMap, type MapLevel } from "./BriefingMap";
import { GasWidget, PlacesWidget, SectorWidget, TrendWidget } from "./widgets";
import { FOOTER, HEADER, INDEPENDENT_LINE, SECTION_IDS, WIDGET_IDS, type SectionId, type WidgetId } from "./copy";

/** The nav is 56 px (h-14); the frame takes the rest of the viewport. */
export const NAV_PX = 56;

type Collapsed = Record<WidgetId, boolean>;
const ALL_OPEN: Collapsed = { sectors: false, trend: false, gases: false, places: false };

export function Overview() {
  const { state, setState, labels, dims, release } = useExplorer();
  const wide = useMediaQuery("(min-width: 1024px)");
  // the briefing's scope is a province name (an ADM1 row); any other `geo` reads as Pakistan
  const geo = state.geo && dims.adm1.some((r) => r.name === state.geo) ? state.geo : null;
  const place = geo ? geographyName(labels, geo) : HEADER.country;
  const data = useBriefing(geo);
  // the loading screen's third stage: the briefing's first envelope answered (or refused)
  useEffect(() => {
    if (data.total.data || data.total.isError) markStage("envelope");
  }, [data.total.data, data.total.isError]);
  const [active, setActive] = useState<SectionId>("summary");
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [level, setLevel] = useState<MapLevel>("adm1");
  const [collapsed, setCollapsed] = useState<Collapsed>(ALL_OPEN);
  const deckRef = useRef<HTMLDivElement>(null);
  const onGeo = useCallback((name: string | null) => setState({ geo: name, level: "adm1" }), [setState]);
  const onPickSector = useCallback((id: string) => setPicked((p) => (p === id ? null : id)), []);
  const onReset = useCallback(() => {
    setState({ geo: null, level: "adm1" });
    setLevel("adm1");
    setPicked(null);
  }, [setState]);
  const allCollapsed = WIDGET_IDS.every((id) => collapsed[id]);
  const toggle = (id: WidgetId) => (open: boolean) => setCollapsed((c) => ({ ...c, [id]: !open }));
  const toggleAll = () => setCollapsed({ sectors: !allCollapsed, trend: !allCollapsed, gases: !allCollapsed, places: !allCollapsed });

  // the map follows the widget in view, while that card is open
  const mapSector = active === "sectors" && !collapsed.sectors ? (hovered ?? picked) : null;
  const mapLevel: MapLevel = active === "places" && !collapsed.places ? "adm1" : level;
  const scope = useMemo(() => ({ level: mapLevel, sector: mapSector, gas: null, month: null, cell: null }), [mapLevel, mapSector]);

  // the scroll spy: on wide screens the deck is the scroll container, so it is the observer's root
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id as SectionId);
      },
      { root: wide ? deckRef.current : null, rootMargin: `-${(wide ? 0 : NAV_PX) + 40}px 0px -55% 0px`, threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [wide]);

  const facts = releaseFacts(release);
  const citation = releaseCitation(release);
  const licences = [facts.licences.data_and_text ? `Data and text ${facts.licences.data_and_text}` : "", facts.licences.code ? `code ${facts.licences.code}` : "", facts.licences.odbl_carveouts.length ? "OSM-derived tables ODbL" : ""].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-dvh flex-col bg-surface" data-testid="overview" data-scope={geo ?? "PK"}>
      <NavHeader />
      <div className="relative flex flex-col lg:block lg:h-[calc(100dvh-56px)]" data-testid="app-frame">
        <div ref={deckRef} className="scrollbar-thin flex flex-col gap-3 p-4 lg:pointer-events-none lg:absolute lg:bottom-5 lg:left-5 lg:top-5 lg:z-10 lg:w-[520px] lg:overflow-y-auto lg:overscroll-contain lg:p-0 lg:pr-2" data-testid="dashboard-deck">
          <HeaderBlock geo={geo} place={place} onGeo={onGeo} onReset={onReset} />
          <DeckControls count={WIDGET_IDS.length} allCollapsed={allCollapsed} onToggleAll={toggleAll} />
          <OpeningStatement data={data} geo={geo} place={place} />
          <SectorWidget data={data} geo={geo} place={place} open={!collapsed.sectors} onToggle={toggle("sectors")} onHover={setHovered} onSelect={onPickSector} selected={picked} />
          <TrendWidget data={data} geo={geo} place={place} open={!collapsed.trend} onToggle={toggle("trend")} />
          <GasWidget data={data} geo={geo} place={place} open={!collapsed.gases} onToggle={toggle("gases")} />
          <PlacesWidget data={data} geo={geo} place={place} open={!collapsed.places} onToggle={toggle("places")} onPick={(name) => onGeo(name)} />
          <footer className="pointer-events-auto shrink-0 rounded-2xl bg-white/90 p-4 text-xs text-muted shadow-md" data-testid="footer">
            <div className="flex flex-col gap-2">
              <span className="flex shrink-0 items-center gap-2 text-fg" data-testid="footer-brand">
                <BrandLogo className="h-6 object-contain" />
                {FOOTER.product}
              </span>
              <span>
                {licences || "Licences as the release states them"}. {INDEPENDENT_LINE}
              </span>
              <span className="flex flex-wrap gap-4">
                {citation?.repository && <a href={citation.repository} className="hover:text-fg" data-testid="footer-repository">{FOOTER.repository}</a>}
                <Link href="/methods" className="hover:text-fg">{FOOTER.methods}</Link>
                <Link href="/downloads" className="hover:text-fg">{FOOTER.downloads}</Link>
                <a href={api.docsUrl()} className="hover:text-fg">{FOOTER.api}</a>
              </span>
            </div>
          </footer>
        </div>
        <div className="relative h-[60vh] min-w-0 lg:absolute lg:inset-0 lg:h-auto" data-testid="map-pane">
          <BriefingMap scope={scope} level={level} onLevel={setLevel} onPickProvince={(name) => onGeo(name)} />
        </div>
      </div>
    </div>
  );
}
