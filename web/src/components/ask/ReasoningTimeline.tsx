"use client";
/**
 * One turn, as a chat message: the user's bubble, then the answer.
 *
 * WHAT LEFT, AND WHY. This used to render the model's summarised reasoning verbatim (ThinkingCard),
 * every tool call as its own card, a meta row reading "How this was answered · 0 queries · 12.204 s",
 * and a mono line of token counts and a cost estimate. Three of those four are the operator's
 * business, not the reader's, and the fourth - the model's private working - was the most prominent
 * thing on screen after a one-sentence answer. The evidence that DID belong to the reader was two
 * clicks inside that fold; it is now one click behind the provenance line under the answer.
 *
 * The map action and the correction notice survive, because both describe something that happened
 * to the reader's own view. The tool cards do not, so a <cite> now opens the evidence rather than
 * scrolling to a card that is no longer rendered.
 */
import { useMemo, useState } from "react";
import { applyPatch, type ExplorerState } from "@/lib/urlState";
import { AnswerCard } from "./AnswerCard";
import { ProvenanceLine, WorkingLine } from "./Provenance";
import { renderAnswer, settledDraft, type CiteHandlers } from "./answerText";
import { resolveLink, useDownloadCollections } from "./answerLinks";
import type { Highlight } from "./ToolCard";
import { refusalWords } from "@/lib/envelope";
import { timelineOf } from "./timeline";
import type { MapMove } from "./mapMove";
import type { MapActionEvent, TimelineItem, Turn } from "./types";

export const ERROR_TITLES: Record<string, string> = {
  bare_numbers: "Answer withheld: the draft typed a number that was not a placeholder",
  placeholder_error: "Answer withheld: the draft named a result cell that does not exist",
  turn_limit: "Stopped: too many model calls without a final answer",
  budget_exhausted: "Stopped: the token budget is spent",
  "budget_exhausted:conversation": "Stopped: this conversation has spent its token budget",
  "budget_exhausted:daily": "Stopped: today's shared token budget is spent",
  model_error: "Model error",
  model_refusal: "The model declined this request",
  agent_disabled: "The assistant is not enabled",
  rate_limited: "Too many questions from this address",
  stream_ended: "The stream ended before an answer",
  empty_answer: "No answer: the model returned no answer text after its tool calls",
  network_error: "Could not reach the API",
  upstream_unavailable: "The assistant did not answer in time",
  turn_timeout: "The assistant took too long and stopped",
};

/** The error codes a reader can usefully retry: the question itself was fine. */
export const RETRYABLE = new Set(["upstream_unavailable", "turn_timeout", "network_error", "stream_ended", "model_error", "rate_limited"]);

/* A TITLE THAT NAMES THE REMEDY. `budget_exhausted` covered two different situations - this
   conversation is full, or the whole day's budget is gone - and said "the token budget is spent"
   for both, so a reader could not tell whether starting a new conversation would help. The
   stream now says which; the title says it too, because the title is the line that gets read. */
export function errorTitle(code: string, scope?: string): string {
  return (scope && ERROR_TITLES[`${code}:${scope}`]) ?? ERROR_TITLES[code] ?? code.replace(/_/g, " ");
}

/* The phases the stream reports - model, tool, correction, tool_limit - used to be worded and
   shown one at a time. The panel says ONE thing while it works now (Provenance.WORKING_TEXT); a
   reader waiting for an answer is not helped by knowing which of the model's turns is in flight. */

/** The URL state a map_action event names (its string fields are URL keys), applied over the current state. */
export function stateOfAction(state: ExplorerState, action: MapActionEvent): ExplorerState {
  const patch: Partial<ExplorerState> = {};
  for (const [k, v] of Object.entries(action)) if (typeof v === "string" && v) (patch as Record<string, unknown>)[k] = v;
  return applyPatch(state, patch);
}

/**
 * The two notices that survived: a query was REFUSED, and the server rejected a draft. Neither is
 * the model's working - each is a limit on what the reader was given - so neither is behind the
 * details fold.
 *
 * The refusal in particular: a query the release cannot answer ("AR6 CO2e is not carried at ADM2")
 * is the reason the answer is narrower than the question, and hiding it one click away would be
 * the panel quietly narrowing a claim.
 *
 * THE "MOVED THE MAP" CHIP IS GONE. It printed six internal chips and a raw URL under an answer
 * nobody had asked to be relocated by. The move is announced beside the answer's own actions now,
 * with a way back - see AnswerCard and mapMove.ts.
 */
function TurnNotices({ items }: { items: TimelineItem[] }) {
  return (
    <>
      {items.map((item, i) => {
        if (item.kind === "tool" && item.refusal)
          // ONE SENTENCE, NO IDS. The shared RefusalCard leads with the error class and prints the
          // limitation id twice - "Refused: GrainUnavailable grain_unavailable limitation
          // grain_unavailable" - above an answer that then explains the same thing in prose. What a
          // reader needs is the release's own message; the class and the id are for a log.
          return (
            <div key={`r${item.k}`} className="rounded-card border border-note-border bg-note-bg px-3 py-2 text-xs leading-snug text-note-text" data-testid="turn-refusal">
              {refusalWords(item.refusal)}
            </div>
          );
        if (item.kind === "correction")
          return (
            <div key={i} className="rounded-card border border-warn/30 bg-refusal px-3 py-1.5 text-xs text-warn" data-testid="correction">
              Draft rejected by the server ({item.reason}); the agent is rewriting it with placeholders only.
            </div>
          );
        return null;
      })}
    </>
  );
}

/** What stands in for a draft the server took back to correct. */
export const CHECKING_TEXT = "Checking figures…";

/** The answer so far: checked lines, drawn the way the final answer will be. */
function DraftAnswer({ text }: { text: string }) {
  const collections = useDownloadCollections();
  const handlers: CiteHandlers = {
    hover: () => {},
    click: () => {},
    link: (to, label) => resolveLink(to, label, collections),
  };
  return (
    <div className="text-sm leading-relaxed text-fg" data-testid="answer-draft" aria-busy="true">
      {renderAnswer(settledDraft(text), handlers)}
    </div>
  );
}

export function ReasoningTimeline({ turn, onFollowUp, agentMove = null, onUndoAgentMove }: {
  turn: Turn;
  onFollowUp?: (question: string) => void;
  /** A map move the AGENT made this turn, so the answer can say so and offer it back. */
  agentMove?: MapMove | null;
  onUndoAgentMove?: () => void;
}) {
  const tl = useMemo(() => timelineOf(turn.events), [turn.events]);
  const [hover, setHover] = useState<Highlight>(null);
  const [pinned, setPinned] = useState<Highlight>(null);
  const highlight = hover ?? pinned;
  // a cite has nothing to scroll to now - the tool cards are not rendered - so clicking one simply
  // pins it; AnswerCard's own evidence fold is where the call behind it lives
  const onCite = { hover: setHover, click: setPinned };
  void highlight;
  const live = turn.status === "streaming";
  // A CORRECTION THAT WAS RECOVERED IS NOT THE READER'S BUSINESS. The server rejects a draft that
  // typed a bare number or ended without text, asks for one rewrite, and usually gets a good answer -
  // and a red "Draft rejected by the server" box then sat above that good answer like a warning.
  // That is internal quality control, the same class of thing as the token counts. It still shows
  // when the turn produced NO answer, because then it is the explanation for what went wrong.
  // NO "ASKED ABOUT" LINE UNDER THE QUESTION. It printed the map selection at send time, which is
  // not what a question is about: a general question asked with Khyber Pakhtunkhwa selected was
  // labelled as a question about Khyber Pakhtunkhwa. The answer names its own year and place,
  // taken from the results it used, and "View details" keeps the query's applied filters.
  const notices = tl.items.filter((i) =>
    (i.kind === "correction" && !tl.answer) || (i.kind === "tool" && !!i.refusal));
  const errors = tl.items.filter((i): i is Extract<TimelineItem, { kind: "error" }> => i.kind === "error");
  return (
    <div className="flex flex-col gap-2.5" data-testid="turn" data-status={turn.status}>
      <div className="max-w-[85%] self-end rounded-card bg-accent-fill px-3 py-2 text-sm text-on-accent" data-testid="user-message">
        {turn.message}
      </div>
      <TurnNotices items={notices} />
      {tl.answer && <AnswerCard answer={tl.answer} items={tl.items} onCite={onCite} onFollowUp={(q) => onFollowUp?.(q)} agentMove={agentMove} onUndoAgentMove={onUndoAgentMove} />}
      {errors.map((item, i) => (
        <div key={i} className="rounded-card border border-warn/30 bg-refusal px-3 py-2 text-sm text-warn" data-testid="error-card" data-code={item.code}>
          <div className="font-semibold">{errorTitle(item.code, item.scope)}</div>
          {item.message && <div className="mt-0.5 text-xs">{item.message}</div>}
          <div className="mt-1 flex items-center gap-3">
            {/* the edge's timeout has no code a reader could use: its message already carries the status */}
            {item.code !== "upstream_unavailable" && item.code !== "turn_timeout" && <span className="mono text-micro normal-case tracking-normal text-muted">{item.code}</span>}
            {RETRYABLE.has(item.code) && onFollowUp && !live && (
              <button type="button" className="text-xs underline underline-offset-2" data-testid="error-retry" onClick={() => onFollowUp(turn.message)}>
                Ask again
              </button>
            )}
          </div>
        </div>
      ))}
      {/* THE ANSWER STREAMS, LINE BY LINE. Each line arrives already checked by the server and
          with its figures filled in; the final answer replaces the draft when it lands. If the
          server takes a draft back to correct it, "Checking figures…" stands in until the
          corrected one starts. */}
      {live && !tl.answer && tl.draft && <DraftAnswer text={tl.draft} />}
      {live && !tl.answer && (tl.checking && !tl.draft ? <ProvenanceLine what={CHECKING_TEXT} live /> : <WorkingLine />)}
    </div>
  );
}
