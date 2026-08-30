"use client";
/**
 * The insight deck: the workspace's left column, a stack of separate rounded white cards over
 * the map — 420 px wide, inset 20 px, starting under the nav capsule (`top-[84px]`) and running
 * to the bottom, with its own thin scrollbar and no ground of its own, so the map shows between
 * the cards. The column lets pointer events through (`pointer-events-none`); each card takes
 * them back (`pointer-events-auto`), so the map drags through the gaps.
 *
 * **The deck re-writes itself from the shared selection.** It holds no card list: it resolves the
 * URL state to a `Scope` (workspace/cards.ts) and renders the cards that scope selects, in that
 * order. Changing the sector, the gas, the year, the level or the selected place — from the
 * filter panel, from a chip, from a bar or by clicking the map — changes the scope, and with it
 * both which cards are shown and what every one of them asks the server for (lib/requests.ts
 * `deckBodies`, lib/queries.ts `useDeck`). A collapsed card renders nothing and asks for
 * nothing: its envelopes are dropped from the request plan.
 *
 * Above the cards: the place card (HeaderBlock), the deck header ("INSIGHTS · {PLACE}" and
 * Collapse all) and the scope chips; below them, the footer.
 *
 * Every number in the deck is a server string (`display_short`, `share_pct_short`, `rank`,
 * `interval_short`, `change.*`, `derived.*`, `axis.ticks_short`); the deck computes nothing.
 * Under 1024 px it is a bottom sheet over the map with three snap heights.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight, GripHorizontal } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { useDeck } from "@/lib/queries";
import { markStage } from "@/components/shell/bootstrap";
import { api } from "@/lib/api";
import { districtName, geographyName } from "@/lib/labels";
import { releaseCitation, releaseFacts } from "@/lib/release";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { HeaderBlock } from "@/components/overview/HeaderBlock";
import { DeckControls } from "@/components/overview/DeckControls";
import { HEADER, INDEPENDENT_SHORT, licenceLine } from "@/components/overview/copy";
import { DECK_CARD } from "@/components/overview/deck";
import { ScopeChips } from "./ScopeChips";
import { cardsFor, scopeOf, type CardId } from "./cards";
import { renderCard, wantsFor } from "./cards/render";
import { DECK_COLLAPSE, DECK_EXPAND, DECK_TITLE } from "./copy";

/** The deck's column, over the map, clear of the nav capsule above it. */
export const DECK_CLASS =
  "absolute left-5 top-[84px] bottom-5 w-[420px] z-20 overflow-y-auto overscroll-contain scrollbar-none pointer-events-none flex flex-col gap-3";

/** The bottom sheet's three heights under 1024 px (the old map drawer's snap states). */
export const SNAP_HEIGHT: Record<Snap, string> = { peek: "84px", half: "55dvh", full: "calc(100dvh - 84px)" };
export type Snap = "peek" | "half" | "full";
const NEXT_SNAP: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

export type DeckProps = {
  /**
   * The Overview briefing's envelopes, where a caller still asks for them. The deck no longer
   * reads them — it asks for its own scope (`useDeck`) — so this is accepted and ignored.
   */
  /** The selected province (an ADM1 row), or null for Pakistan; the deck resolves its own scope. */
  geo?: string | null;
  /** The place as the release names it; the deck names the scope's own place when it has one. */
  place?: string;
  onGeo: (name: string | null) => void;
  onReset: () => void;
  /** The sector the map should follow while a breakdown card is open (hover), and the picked one. */
  onSector?: (id: string | null) => void;
  /** Collapse the deck to its rail (the workspace re-centres the map when it goes). */
  onCollapse?: () => void;
  /** Under 1024 px the deck is a bottom sheet. */
  mobile?: boolean;
};

export function Deck({ onGeo, onReset, onSector, onCollapse, mobile = false }: DeckProps) {
  const { state, labels, dims } = useExplorer();
  const [collapsed, setCollapsed] = useState<Partial<Record<CardId, boolean>>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>("half");

  const scope = useMemo(() => scopeOf(state), [state]);
  const ids = useMemo(() => cardsFor(scope), [scope]);
  const isOpen = (id: CardId) => !collapsed[id];
  const allCollapsed = ids.every((id) => !isOpen(id));
  const wants = useMemo(() => wantsFor(ids, (id) => !collapsed[id]), [ids, collapsed]);
  const deck = useDeck(state, wants);
  // the loading screen's third stage: the deck's first envelope answered (or was refused)
  useEffect(() => {
    if (deck.total.data || deck.total.isError) markStage("envelope");
  }, [deck.total.data, deck.total.isError]);

  // the deck's own place: the country, the selected province, or the selected district's shape
  const province = scope.kind === "province" ? scope.geo : null;
  const place = scope.kind === "province" ? geographyName(labels, scope.geo) : scope.kind === "district" ? districtName(dims, scope.geo) : HEADER.country;

  const toggle = (id: CardId) => (open: boolean) => setCollapsed((c) => ({ ...c, [id]: !open }));
  const toggleAll = () => setCollapsed((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, !allCollapsed])) }));
  const pickSector = (id: string | null) => {
    setPicked(id);
    onSector?.(id);
  };

  const cards = (
    <>
      <HeaderBlock geo={province} place={place} onGeo={onGeo} onReset={onReset} />
      <header className={`${DECK_CARD} flex items-center justify-between gap-3 px-5 py-3`} data-testid="deck-header">
        <h2 className="widget-title min-w-0 truncate">{DECK_TITLE(place)}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <DeckControls count={ids.length} allCollapsed={allCollapsed} onToggleAll={toggleAll} inline />
          {onCollapse && (
            <button type="button" onClick={onCollapse} aria-label={DECK_COLLAPSE} title={DECK_COLLAPSE} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="deck-collapse">
              <ChevronsLeft size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <ScopeChips />
      {ids.map((id) => renderCard({ id, scope, deck, place, open: isOpen(id), onToggle: toggle(id), onSector: pickSector, picked }))}
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
    <div className={DECK_CLASS} data-testid="deck" data-scope={scope.kind}>
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

/** The deck's last card, compact: the release's licences in one line, and what this is not. */
function DeckFooter(): ReactNode {
  const { release } = useExplorer();
  const licences = licenceLine(releaseFacts(release).licences);
  return (
    <footer className="pointer-events-auto shrink-0 rounded-2xl bg-white/90 px-4 py-3 text-xs text-muted shadow-md" data-testid="footer">
      <div data-testid="footer-licences">{licences || "Licences as the release states them"}</div>
      <div className="mt-1">{INDEPENDENT_SHORT}</div>
    </footer>
  );
}

