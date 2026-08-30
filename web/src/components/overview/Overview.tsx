"use client";
/**
 * The public Overview as a country briefing (2026-08-30): TopNav, then two columns — left
 * (58 %) the scrolling briefing: the header block (Pakistan / the province, "Select a
 * province", Share · Download), the opening statement, the sticky tab strip (anchors), the
 * seven widgets, the routes strip; right (42 %) the sticky map (the ExplorerMap's briefing
 * variant with the legend and a Provinces | Districts toggle) that follows the widget in
 * view (Sectors: a hovered or selected sector filters the choropleth; Places: provinces;
 * otherwise every sector) and the province dropdown. Under 1024 px the map is a widget after
 * the opening block. No slogan, no total card, no Ask box (Ask is the nav button). Every
 * number on the page is a server string; the page computes nothing but row counts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CompletenessWidget, EvidenceWidget, GasWidget, PlacesWidget, SectorWidget, TrendWidget, UncertaintyWidget } from "./widgets";
import { RoutesStrip } from "./RoutesStrip";
import { FOOTER, HEADER, INDEPENDENT_LINE, TABS, type TabId } from "./copy";

/** The nav is 56 px (h-14); the sticky column and the tab strip sit under it. */
const NAV_PX = 56;

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
  const onGeo = useCallback((name: string | null) => setState({ geo: name, level: "adm1" }), [setState]);
  const onPickSector = useCallback((id: string) => setPicked((p) => (p === id ? null : id)), []);

  // the map follows the widget in view
  const mapSector = active === "sectors" ? (hovered ?? picked) : null;
  const mapLevel: MapLevel = active === "places" ? "adm1" : level;
  const scope = useMemo(() => ({ level: mapLevel, sector: mapSector, gas: null, month: null, cell: null }), [mapLevel, mapSector]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = TABS.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id as TabId);
      },
      { rootMargin: `-${NAV_PX + 60}px 0px -55% 0px`, threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const facts = releaseFacts(release);
  const citation = releaseCitation(release);
  const licences = [facts.licences.data_and_text ? `Data and text ${facts.licences.data_and_text}` : "", facts.licences.code ? `code ${facts.licences.code}` : "", facts.licences.odbl_carveouts.length ? "OSM-derived tables ODbL" : ""].filter(Boolean).join(" · ");
  const map = <BriefingMap scope={scope} level={level} onLevel={setLevel} onPickProvince={(name) => onGeo(name)} />;

  return (
    <div className="min-h-dvh bg-surface" data-testid="overview" data-scope={geo ?? "PK"}>
      <TopNav />
      <div className="mx-auto max-w-[1500px] lg:grid lg:grid-cols-[58fr_42fr]">
        <main className="min-w-0 px-4 pb-12 pt-8 md:px-8">
          <HeaderBlock geo={geo} place={place} onGeo={onGeo} />
          <OpeningStatement data={data} geo={geo} place={place} />
          {!wide && (
            <section className="card relative mt-6 h-[380px] overflow-hidden" data-testid="map-widget">
              {map}
            </section>
          )}
          <TabStrip active={active} />
          <div className="mt-6 space-y-6">
            <SectorWidget data={data} geo={geo} place={place} onHover={setHovered} onSelect={onPickSector} selected={picked} />
            <TrendWidget data={data} geo={geo} place={place} />
            <GasWidget data={data} geo={geo} place={place} />
            <PlacesWidget data={data} geo={geo} place={place} onPick={(name) => onGeo(name)} />
            <UncertaintyWidget data={data} geo={geo} place={place} />
            <CompletenessWidget data={data} geo={geo} place={place} />
            <EvidenceWidget data={data} geo={geo} place={place} />
          </div>
          <RoutesStrip />
        </main>
        {wide && (
          <aside className="min-w-0" data-testid="map-column">
            <div className="sticky overflow-hidden border-l border-line bg-card" style={{ top: NAV_PX, height: `calc(100dvh - ${NAV_PX}px)` }}>
              {map}
            </div>
          </aside>
        )}
      </div>
      <footer className="border-t border-line bg-card" data-testid="footer">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-4 py-5 text-xs text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <span className="flex shrink-0 items-center gap-2 text-fg" data-testid="footer-brand">
              <BrandLogo className="h-6 object-contain" />
              {FOOTER.product}
            </span>
            <span>
              {licences || "Licences as the release states them"}. {INDEPENDENT_LINE}
            </span>
          </div>
          <span className="flex flex-wrap gap-4">
            {citation?.repository && <a href={citation.repository} className="hover:text-fg" data-testid="footer-repository">{FOOTER.repository}</a>}
            <Link href="/methods" className="hover:text-fg">{FOOTER.methods}</Link>
            <Link href="/downloads" className="hover:text-fg">{FOOTER.downloads}</Link>
            <a href={api.docsUrl()} className="hover:text-fg">{FOOTER.api}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
