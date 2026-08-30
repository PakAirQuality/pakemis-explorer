"use client";
/**
 * One card id to one component, and one card id to the envelopes it needs. The deck holds the
 * open / collapsed state and the shared queries; this module says which card is which and what a
 * card asks for, so a collapsed card can be left out of the request plan entirely (`DeckWants`)
 * rather than fetched and hidden.
 *
 * `composition` and `categories` are the same component under two names because the mapping in
 * cards.ts is the product decision and reads better for it: a chosen sector is asked what it is
 * made OF (its IPCC categories), a place what it is made of (its modules), and the key the
 * server is asked for is deckBodies' — the card never swaps one for the other.
 */
import type { ReactNode } from "react";
import type { Deck } from "@/lib/queries";
import type { DeckWants } from "@/lib/queries";
import { cardTitle } from "@/components/overview/copy";
import type { CardId, Scope } from "../cards";
import { SnapshotCard } from "./SnapshotCard";
import { BreakdownCard } from "./BreakdownCard";
import { TrendCard } from "./TrendCard";
import { RankingCard } from "./RankingCard";
import { PlacementCard } from "./PlacementCard";
import { EvidenceCard } from "./EvidenceCard";
import { SourcesCard } from "./SourcesCard";

/** The envelopes each card reads; the deck unions those of its OPEN cards and disables the rest. */
export const CARD_NEEDS: Record<CardId, (keyof DeckWants)[]> = {
  snapshot: ["total", "ranked", "breakdown"],
  sectors: ["breakdown"],
  categories: ["breakdown"],
  composition: ["breakdown"],
  trend: ["series"],
  places: ["provinces"],
  peers: ["provinces", "peers"],
  placement: ["total"],
  evidence: ["total"],
  sources: ["total"],
};

export type RenderCardArgs = {
  id: CardId;
  scope: Scope;
  deck: Deck;
  place: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The sector the map follows while a sector bar is hovered or picked; it never reaches the URL. */
  onSector?: (id: string | null) => void;
  picked?: string | null;
};

export function renderCard({ id, scope, deck, place, open, onToggle, onSector, picked }: RenderCardArgs): ReactNode {
  const title = cardTitle(scope.kind, id);
  const common = { id, scope, deck, title, open, onToggle };
  switch (id) {
    case "snapshot":
      return <SnapshotCard key={id} {...common} place={place} />;
    case "sectors":
    case "categories":
    case "composition":
      return <BreakdownCard key={id} {...common} onSector={onSector} selected={picked} />;
    case "trend":
      return <TrendCard key={id} {...common} place={place} />;
    case "places":
    case "peers":
      return <RankingCard key={id} {...common} />;
    case "placement":
      return <PlacementCard key={id} {...common} />;
    case "evidence":
      return <EvidenceCard key={id} {...common} />;
    case "sources":
      return <SourcesCard key={id} {...common} />;
  }
}

/** What the open cards of a set need; everything else stays disabled, so a collapsed card fetches nothing. */
export function wantsFor(ids: readonly CardId[], isOpen: (id: CardId) => boolean): DeckWants {
  const wants: DeckWants = { total: false, ranked: false, breakdown: false, provinces: false, peers: false, series: false };
  for (const id of ids) if (isOpen(id)) for (const need of CARD_NEEDS[id]) wants[need] = true;
  return wants;
}
