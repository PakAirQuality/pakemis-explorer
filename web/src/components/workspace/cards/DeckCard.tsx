"use client";
/**
 * The chrome every insight card wears: the deck's white rounded card (overview/deck.ts
 * `DECK_CARD`) around `ui/Widget`, so a card keeps the four affordances the rest of the
 * interface has — the info icon opens **Result details** on the card's own envelope, the
 * download icon fetches that result's canonical CSV, the share icon copies the permalink, and
 * the switch collapses the card to its header row. Before those, a card that shows a value
 * carries one more: **Claim record**, which opens the same drawer at its Evidence tab, where the
 * cell's claim — its method, its evidence grade and its sources — is answered by the server.
 *
 * A card renders nothing of its own while its envelope is loading or refused: `Pending` shows the
 * release's typed refusal by name, never a blank or a guess. Every figure a card prints is a
 * server string (`display_short`, `share_pct_short`, `rank`, `interval_short`, `change.*`,
 * `derived.*`, `axis.ticks_short`); the browser sizes bars from `value` and prints nothing it
 * derived itself.
 */
import type { ReactNode } from "react";
import { ScrollText } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown, type Cell, type Envelope } from "@/lib/envelope";
import { magnitudeOf } from "@/lib/uncertainty";
import { Widget, ICON_BUTTON } from "@/components/ui/Widget";
import { useEnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { DECK_CARD } from "@/components/overview/deck";
import { LINKS } from "@/components/overview/copy";

export type Query = { data?: Envelope; error?: unknown; isLoading?: boolean };

export type DeckCardProps = {
  /** The card id from workspace/cards.ts; the card's test id is `card-{id}`. */
  id: string;
  title: ReactNode;
  /** The envelope behind the card: Result details, the CSV and the claim record all read it. */
  env?: Envelope | null;
  sentence?: ReactNode;
  note?: ReactNode;
  caption?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children?: ReactNode;
};

export function DeckCard({ id, title, env, sentence, note, caption, open, onToggle, children }: DeckCardProps) {
  const { labels } = useExplorer();
  const drawer = useEnvelopeDrawer(labels);
  const testId = `card-${id}`;
  return (
    <>
      <Widget
        id={testId}
        testId={testId}
        chrome={DECK_CARD}
        open={open}
        onToggle={onToggle}
        title={title}
        env={env}
        labels={labels}
        tools={
          env ? (
            <button type="button" onClick={() => drawer.open(env, "evidence")} className={ICON_BUTTON} aria-label={LINKS.claim} title={LINKS.claim} data-testid={`${testId}-claim`}>
              <ScrollText size={14} aria-hidden="true" />
            </button>
          ) : null
        }
        sentence={sentence}
        note={note}
        caption={caption}
      >
        {children}
      </Widget>
      {drawer.node}
    </>
  );
}

/** The card body while its envelope is loading, and the release's own typed refusal once it is refused. */
export function Pending({ q, what }: { q: Query; what: string }) {
  if (q.error) return <RefusalCard error={q.error} compact />;
  return <Loading what={what} />;
}

/** A figure as the server wrote it: `display_short` (else `display`) and the cell's own unit. */
export function Figure({ cell, unit }: { cell: Cell; unit?: string }) {
  return (
    <b className="num whitespace-nowrap">
      {shown(cell)} {unit ?? magnitudeOf(cell)}
    </b>
  );
}

/** A share as the server wrote it: `share_pct_short`, never a division. */
export function Share({ cell }: { cell: Cell }) {
  return <b className="num whitespace-nowrap">{cell.share_pct_short} %</b>;
}

