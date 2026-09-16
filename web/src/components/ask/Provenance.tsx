"use client";
/**
 * One line under an answer, saying what it rested on — and the only way into the evidence.
 *
 * IT REPLACED THE THINKING CARD, NOT THE EVIDENCE. What stood here was the model's summarised
 * reasoning, printed verbatim and made the most prominent thing on screen, followed by
 * "How this was answered · 0 queries · 12.204 s" and a mono row of token counts. None of that is
 * the reader's business and none of it is provenance: reasoning is the model's private working,
 * and latency and tokens are the operator's. What IS the reader's business — which tables the
 * answer rested on, under which filters, with what uncertainty, against which receipt — was two
 * clicks away inside a fold called "How this was answered".
 *
 * So this line says where the answer came from, and opening it shows the evidence rather than the
 * reasoning. While the turn is still running it says one thing and nothing else.
 */
import { ChevronDown, ChevronRight, FileText, MapPin } from "lucide-react";

/** What the panel says while the server is working. Deliberately one string, in every phase. */
export const WORKING_TEXT = "Checking the published evidence…";

/** The one label, for a query answer and a prepared explanation alike: reproducibility lives behind it. */
export const SOURCES_LABEL = "View details";

export function ProvenanceLine({
  what,
  action = SOURCES_LABEL,
  open,
  onToggle,
  extra,
  live = false,
}: {
  what?: string;
  action?: string;
  open?: boolean;
  onToggle?: () => void;
  /** A second action on the same line - "Show on map". */
  extra?: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted" data-testid="provenance" data-live={live ? "1" : "0"} role={live ? "status" : undefined}>
      <FileText size={13} aria-hidden="true" className="shrink-0 opacity-75" />
      {/* THE ACTION LEADS. What a reader wants from this line is the way in to the sources; the
          description of what was queried is the subtitle, not the headline. "Published release" used
          to sit here too and said nothing - every answer rests on the published release. */}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!!open}
          className="flex shrink-0 items-center gap-0.5 font-medium text-accent underline underline-offset-2 hover:text-accent-bright"
          data-testid="provenance-action"
        >
          {open ? "Hide sources" : action}
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : null}
      {extra ? (
        <>
          <span aria-hidden="true">·</span>
          {extra}
        </>
      ) : null}
      {what ? <span className="min-w-0 flex-1 truncate">{onToggle || extra ? "· " : null}{what}</span> : null}
    </div>
  );
}

/**
 * The map was moved, said once and quietly, with the move back beside it.
 *
 * This is what stands where "moved the map" and its six configuration chips used to - the reader is
 * told what changed in the words they chose it by, and can put it back.
 */
export function MapMovedLine({ words, onUndo }: { words: string; onUndo: () => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted" data-testid="map-moved" role="status">
      <MapPin size={13} aria-hidden="true" className="shrink-0 opacity-75" />
      <span className="min-w-0 flex-1 truncate">Map updated to {words}</span>
      <button type="button" onClick={onUndo} className="shrink-0 font-medium text-accent underline underline-offset-2 hover:text-accent-bright" data-testid="map-undo">
        Undo
      </button>
    </div>
  );
}

/** The working state: the same line, one string, no action. */
export function WorkingLine() {
  return <ProvenanceLine what={WORKING_TEXT} live />;
}
