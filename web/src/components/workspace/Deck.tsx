"use client";
/**
 * The insight deck: the workspace's left column, a stack of separate rounded white cards over
 * the map — 420 px wide, inset 20 px, starting under the nav capsule (`top-[84px]`) and running
 * to the bottom, with its own thin scrollbar and no ground of its own, so the map shows between
 * the cards. The column lets pointer events through (`pointer-events-none`); each card takes
 * them back (`pointer-events-auto`), so the map drags through the gaps.
 *
 * The cards, in order: the place card (HeaderBlock — the eyebrow, Pakistan or the selected
 * province, the four actions and the province select), the deck header ("INSIGHTS · {PLACE}"
 * and Collapse all), the scope chips (sector · gas · year, each clearing to its default), the
 * opening statement, the four widgets (overview/widgets.tsx), each collapsible under its
 * switch, and the footer. Wave 3 replaces the four widgets with the cards the scope selects;
 * the shell keeps them so the page is never empty.
 *
 * Every number in the deck is a server string (`display_short`, `share_pct_short`, `change.*`,
 * `derived.*`, `axis.ticks_short`); the deck computes nothing. Under 1024 px it is a bottom
 * sheet over the map with three snap heights.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight, GripHorizontal } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Briefing } from "@/lib/queries";
import { api } from "@/lib/api";
import { releaseCitation, releaseFacts } from "@/lib/release";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { HeaderBlock } from "@/components/overview/HeaderBlock";
import { DeckControls } from "@/components/overview/DeckControls";
import { OpeningStatement } from "@/components/overview/OpeningStatement";
import { GasWidget, PlacesWidget, SectorWidget, TrendWidget } from "@/components/overview/widgets";
import { FOOTER, INDEPENDENT_LINE, WIDGET_IDS, type WidgetId } from "@/components/overview/copy";
import { DECK_CARD } from "@/components/overview/deck";
import { ScopeChips } from "./ScopeChips";
import { DECK_COLLAPSE, DECK_EXPAND, DECK_TITLE } from "./copy";

/** The deck's column, over the map, clear of the nav capsule above it. */
export const DECK_CLASS =
  "absolute left-5 top-[84px] bottom-5 w-[420px] z-20 overflow-y-auto overscroll-contain scrollbar-thin pointer-events-none flex flex-col gap-3 pr-2";

/** The bottom sheet's three heights under 1024 px (the old map drawer's snap states). */
export const SNAP_HEIGHT: Record<Snap, string> = { peek: "84px", half: "55dvh", full: "calc(100dvh - 84px)" };
export type Snap = "peek" | "half" | "full";
const NEXT_SNAP: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

type Collapsed = Record<WidgetId, boolean>;
const ALL_OPEN: Collapsed = { sectors: false, trend: false, gases: false, places: false };

export type DeckProps = {
  data: Briefing;
  /** The selected province (an ADM1 row), or null for Pakistan. */
  geo: string | null;
  /** The place as the release names it. */
  place: string;
  onGeo: (name: string | null) => void;
  onReset: () => void;
  /** The sector the map should follow while the Sectors card is open (hover), and the picked one. */
  onSector?: (id: string | null) => void;
  /** Collapse the deck to its rail (the workspace re-centres the map when it goes). */
  onCollapse?: () => void;
  /** Under 1024 px the deck is a bottom sheet. */
  mobile?: boolean;
};

export function Deck({ data, geo, place, onGeo, onReset, onSector, onCollapse, mobile = false }: DeckProps) {
  const [collapsed, setCollapsed] = useState<Collapsed>(ALL_OPEN);
  const [picked, setPicked] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>("half");
  const allCollapsed = WIDGET_IDS.every((id) => collapsed[id]);
  const toggle = (id: WidgetId) => (open: boolean) => setCollapsed((c) => ({ ...c, [id]: !open }));
  const toggleAll = () => setCollapsed({ sectors: !allCollapsed, trend: !allCollapsed, gases: !allCollapsed, places: !allCollapsed });
  const pickSector = (id: string) => {
    setPicked((p) => {
      const next = p === id ? null : id;
      onSector?.(next);
      return next;
    });
  };

  const cards = (
    <>
      <HeaderBlock geo={geo} place={place} onGeo={onGeo} onReset={onReset} />
      <header className={`${DECK_CARD} flex items-center justify-between gap-3 px-5 py-3`} data-testid="deck-header">
        <h2 className="widget-title min-w-0 truncate">{DECK_TITLE(place)}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <DeckControls count={WIDGET_IDS.length} allCollapsed={allCollapsed} onToggleAll={toggleAll} inline />
          {onCollapse && (
            <button type="button" onClick={onCollapse} aria-label={DECK_COLLAPSE} title={DECK_COLLAPSE} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="deck-collapse">
              <ChevronsLeft size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <ScopeChips />
      <OpeningStatement data={data} geo={geo} place={place} />
      <SectorWidget data={data} geo={geo} place={place} open={!collapsed.sectors} onToggle={toggle("sectors")} onHover={(id) => onSector?.(id ?? picked)} onSelect={pickSector} selected={picked} />
      <TrendWidget data={data} geo={geo} place={place} open={!collapsed.trend} onToggle={toggle("trend")} />
      <GasWidget data={data} geo={geo} place={place} open={!collapsed.gases} onToggle={toggle("gases")} />
      <PlacesWidget data={data} geo={geo} place={place} open={!collapsed.places} onToggle={toggle("places")} onPick={(name) => onGeo(name)} />
      <DeckFooter />
    </>
  );

  if (mobile) {
    return (
      <section className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-surface shadow-[0_-4px_16px_rgba(0,0,0,0.12)]" style={{ height: SNAP_HEIGHT[snap] }} data-testid="deck" data-snap={snap}>
        <button type="button" onClick={() => setSnap(NEXT_SNAP[snap])} aria-label={`Resize the panel (now ${snap})`} className="flex h-8 shrink-0 items-center justify-center text-muted" data-testid="deck-snap">
          <GripHorizontal size={20} aria-hidden="true" />
        </button>
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">{cards}</div>
      </section>
    );
  }
  return (
    <div className={DECK_CLASS} data-testid="deck">
      {cards}
    </div>
  );
}

/** The deck's rail: the one button that brings the column back, on the deck's own left inset. */
export function DeckRail({ onExpand }: { onExpand: () => void }) {
  return (
    <button type="button" onClick={onExpand} aria-label={DECK_EXPAND} title={DECK_EXPAND} className="glass absolute left-5 top-[84px] z-20 flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-fg" data-testid="deck-rail">
      <ChevronsRight size={16} aria-hidden="true" />
    </button>
  );
}

/** The deck's last card: the brand, the release's licences, the independence line and the four links. */
function DeckFooter(): ReactNode {
  const { release } = useExplorer();
  const facts = releaseFacts(release);
  const citation = releaseCitation(release);
  const licences = [facts.licences.data_and_text ? `Data and text ${facts.licences.data_and_text}` : "", facts.licences.code ? `code ${facts.licences.code}` : "", facts.licences.odbl_carveouts.length ? "OSM-derived tables ODbL" : ""].filter(Boolean).join(" · ");
  return (
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
  );
}
