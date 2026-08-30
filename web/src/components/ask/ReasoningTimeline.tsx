"use client";
/**
 * One turn: the user's message, then — while the server is still working — the cards in
 * arrival order (ThinkingCard, ToolCard with its result or RefusalCard, the "moved the map"
 * chip, the correction notice); once the answer arrives those cards fold under "How this was
 * answered" (collapsed by default; a cite click opens it and scrolls to the card) and the
 * AnswerCard is the turn's body. An error card and the UsageLine close the turn.
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { inputChips } from "@/lib/labels";
import { applyPatch, hrefForState, type ExplorerState } from "@/lib/urlState";
import { AnswerCard } from "./AnswerCard";
import { ThinkingCard } from "./ThinkingCard";
import { ToolCard, type Highlight } from "./ToolCard";
import { UsageLine } from "./UsageLine";
import { timelineOf } from "./timeline";
import type { MapActionEvent, TimelineItem, Turn } from "./types";

export const ERROR_TITLES: Record<string, string> = {
  bare_numbers: "Answer withheld: the draft typed a number that was not a placeholder",
  placeholder_error: "Answer withheld: the draft named a result cell that does not exist",
  turn_limit: "Stopped: too many model calls without a final answer",
  budget_exhausted: "Stopped: the token budget is spent",
  model_error: "Model error",
  model_refusal: "The model declined this request",
  agent_disabled: "Ask PakEmis is not enabled",
  rate_limited: "Too many questions from this address",
  stream_ended: "The stream ended before an answer",
  empty_answer: "No answer: the model returned no answer text after its tool calls",
  network_error: "Could not reach the API",
};

export function errorTitle(code: string): string {
  return ERROR_TITLES[code] ?? code.replace(/_/g, " ");
}

const PHASE_TEXT: Record<string, string> = { model: "thinking…", tool: "querying…", correction: "rewriting the draft with placeholders…", tool_limit: "tool-call limit reached" };

/** The URL state a map_action event names (its string fields are URL keys), applied over the current state. */
export function stateOfAction(state: ExplorerState, action: MapActionEvent): ExplorerState {
  const patch: Partial<ExplorerState> = {};
  for (const [k, v] of Object.entries(action)) if (typeof v === "string" && v) (patch as Record<string, unknown>)[k] = v;
  return applyPatch(state, patch);
}

/** "moved the map" links to /map with the action's state, so the chip opens the map from the /ask page too. */
function MapActionChip({ action }: { action: MapActionEvent }) {
  const { labels, dims, state, defaults } = useExplorer();
  const chips = inputChips(labels, dims, action);
  const href = hrefForState(stateOfAction(state, action), defaults, "/map");
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-muted" data-testid="map-action">
      <MapPin size={12} className="text-accent" />
      <Link href={href} className="text-accent hover:underline" data-testid="map-action-link">moved the map</Link>
      {chips.map((c) => (
        <span key={c.key} className="pill border border-line bg-surface px-2 py-px" title={`${c.key} = ${c.raw}`}>
          <span className="text-muted">{c.label}</span> {c.value}
        </span>
      ))}
    </div>
  );
}

/** The reasoning cards (everything but the answer and the errors), in arrival order. */
function ReasoningCards({ items, highlight, live }: { items: TimelineItem[]; highlight: Highlight; live: boolean }) {
  return (
    <>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        switch (item.kind) {
          case "thinking":
            return <ThinkingCard key={i} text={item.text} live={live && isLast} />;
          case "tool":
            return <ToolCard key={`k${item.k}`} item={item} highlight={highlight} pending={live} />;
          case "map_action":
            return <MapActionChip key={i} action={item.action} />;
          case "correction":
            return (
              <div key={i} className="rounded-card border border-warn/30 bg-refusal px-3 py-1.5 text-xs text-warn" data-testid="correction">
                Draft rejected by the server ({item.reason}); the agent is rewriting it with placeholders only.
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

export function ReasoningTimeline({ turn, onFollowUp }: { turn: Turn; onFollowUp?: (question: string) => void }) {
  const tl = useMemo(() => timelineOf(turn.events), [turn.events]);
  const [hover, setHover] = useState<Highlight>(null);
  const [pinned, setPinned] = useState<Highlight>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const highlight = hover ?? pinned;
  const onCite = {
    hover: setHover,
    click: (h: Highlight) => {
      setPinned(h);
      setShowReasoning(true);
      const scroll = () => ref.current?.querySelector(`[data-tool-k="${h?.k}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(scroll);
      else scroll();
    },
  };
  const live = turn.status === "streaming";
  const reasoning = tl.items.filter((i) => i.kind !== "answer" && i.kind !== "error");
  const errors = tl.items.filter((i): i is Extract<TimelineItem, { kind: "error" }> => i.kind === "error");
  const folded = !!tl.answer && !live && reasoning.length > 0;
  const toolCount = reasoning.filter((i) => i.kind === "tool" && i.name !== "set_map_view").length;
  return (
    <div ref={ref} className="flex flex-col gap-2" data-testid="turn" data-status={turn.status}>
      <div className="self-end rounded-card bg-accent-fill px-3 py-2 text-sm text-on-accent" data-testid="user-message">
        {turn.message}
      </div>
      {folded ? (
        <div data-testid="how-answered">
          <button type="button" onClick={() => setShowReasoning((o) => !o)} aria-expanded={showReasoning} className="flex items-center gap-1 text-xs text-muted hover:text-fg" data-testid="how-answered-toggle">
            {showReasoning ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            How this was answered
            <span className="mono text-micro normal-case tracking-normal">· {String(toolCount)} {toolCount === 1 ? "query" : "queries"}</span>
          </button>
          {showReasoning && (
            <div className="mt-2 flex flex-col gap-2" data-testid="reasoning-cards">
              <ReasoningCards items={reasoning} highlight={highlight} live={false} />
            </div>
          )}
        </div>
      ) : (
        <ReasoningCards items={reasoning} highlight={highlight} live={live} />
      )}
      {tl.answer && <AnswerCard answer={tl.answer} items={tl.items} onCite={onCite} onFollowUp={(q) => onFollowUp?.(q)} />}
      {errors.map((item, i) => (
        <div key={i} className="rounded-card border border-warn/30 bg-refusal px-3 py-2 text-sm text-warn" data-testid="error-card" data-code={item.code}>
          <div className="font-semibold">{errorTitle(item.code)}</div>
          {item.message && <div className="mt-0.5 text-xs">{item.message}</div>}
          <div className="mono mt-0.5 text-micro normal-case tracking-normal text-muted">{item.code}</div>
        </div>
      ))}
      {live && (
        <div className="text-xs text-muted" role="status" data-testid="live-status">
          {tl.status ? PHASE_TEXT[tl.status.phase] ?? tl.status.phase : "sending…"}
        </div>
      )}
      <UsageLine done={tl.done} answer={tl.answer} />
    </div>
  );
}
