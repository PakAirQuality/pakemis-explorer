"use client";
/**
 * The public Overview as a country briefing (2026-08-30, in Global Mangrove Watch's frame): under
 * the 56 px TopNav (compact: edge-aligned, no centred container) a fixed two-pane app frame — LEFT a 560 px dashboard panel with its own
 * vertical scroll (white, a right-edge shadow, above the map), stacking as cards with 16 px
 * gutters the header block (the eyebrow "Pakistan's explainable emissions inventory", Pakistan
 * / the province, "Select a province", Share · Download), the opening statement, the sticky tab
 * strip (Summary · Sectors · Trend · Gases · Places; anchors) and the four widgets, then the
 * footer; RIGHT the map filling all remaining width and the full height (the ExplorerMap's
 * briefing variant: the opacity pill, the frame button, a Provinces | Districts glass toggle)
 * that follows the widget in view (Sectors: a hovered or selected sector filters the
 * choropleth; Places: provinces; otherwise every sector) and the province dropdown. Under
 * 1024 px the frame is a column: the panel first, the map at 60 vh below it, then the footer.
 * No slogan, no total card, no Ask box (Ask is the nav button). Every number on the page is a
 * server string; the page computes nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import { useBriefing } from "@/lib/queries";
import { geographyName } from "@/lib/labels";
import { releaseCitation, releaseFacts } from "@/lib/release";
import { api } from "@/lib/api";
import { TopNav } from "@/components/shell/TopNav";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { markStage } from "@/components/shell/bootstrap";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { HeaderBlock } from "./HeaderBlock";
import { OpeningStatement } from "./OpeningStatement";
import { TabStrip } from "./TabStrip";
import { BriefingMap, type MapLevel } from "./BriefingMap";
import { GasWidget, PlacesWidget, SectorWidget, TrendWidget } from "./widgets";
import { FOOTER, HEADER, INDEPENDENT_LINE, TABS, type TabId } from "./copy";

/** The nav is 56 px (h-14); the frame takes the rest of the viewport. */
export const NAV_PX = 56;
/** The dashboard panel's width on wide screens. */
export const PANEL_PX = 560;

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
  const [active, setActive] = useState<TabId>("summary");
  const [hovered, setHovered] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [level, setLevel] = useState<MapLevel>("adm1");
  const panelRef = useRef<HTMLDivElement>(null);
  const onGeo = useCallback((name: string | null) => setState({ geo: name, level: "adm1" }), [setState]);
  const onPickSector = useCallback((id: string) => setPicked((p) => (p === id ? null : id)), []);

  // the map follows the widget in view
  const mapSector = active === "sectors" ? (hovered ?? picked) : null;
  const mapLevel: MapLevel = active === "places" ? "adm1" : level;
  const scope = useMemo(() => ({ level: mapLevel, sector: mapSector, gas: null, month: null, cell: null }), [mapLevel, mapSector]);

  // the scroll spy: on wide screens the panel is the scroll container, so it is the observer's root
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = TABS.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id as TabId);
      },
      { root: wide ? panelRef.current : null, rootMargin: `-${(wide ? 0 : NAV_PX) + 60}px 0px -55% 0px`, threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [wide]);

  const facts = releaseFacts(release);
  const citation = releaseCitation(release);
  const licences = [facts.licences.data_and_text ? `Data and text ${facts.licences.data_and_text}` : "", facts.licences.code ? `code ${facts.licences.code}` : "", facts.licences.odbl_carveouts.length ? "OSM-derived tables ODbL" : ""].filter(Boolean).join(" · ");
  const footer = (
    <footer className="border-t border-line bg-card" data-testid="footer">
      <div className="flex flex-col gap-2 px-4 py-5 text-xs text-muted">
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
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface" data-testid="overview" data-scope={geo ?? "PK"}>
      <TopNav compact />
      <div className="flex flex-col lg:h-[calc(100dvh-56px)] lg:flex-row" data-testid="app-frame">
        <div ref={panelRef} className="relative z-10 flex w-full shrink-0 flex-col bg-card shadow-[8px_0_24px_rgba(0,0,0,0.06)] lg:h-full lg:w-[560px] lg:overflow-y-auto" data-testid="dashboard-panel">
          <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
            <div className="card p-4">
              <HeaderBlock geo={geo} place={place} onGeo={onGeo} />
            </div>
            <OpeningStatement data={data} geo={geo} place={place} />
            <TabStrip active={active} />
            <SectorWidget data={data} geo={geo} place={place} onHover={setHovered} onSelect={onPickSector} selected={picked} />
            <TrendWidget data={data} geo={geo} place={place} />
            <GasWidget data={data} geo={geo} place={place} />
            <PlacesWidget data={data} geo={geo} place={place} onPick={(name) => onGeo(name)} />
          </main>
          {wide && footer}
        </div>
        <div className="relative h-[60vh] min-w-0 flex-1 lg:h-full" data-testid="map-pane">
          <BriefingMap scope={scope} level={level} onLevel={setLevel} onPickProvince={(name) => onGeo(name)} />
        </div>
      </div>
      {!wide && footer}
    </div>
  );
}
