"use client";
/**
 * The Ask panel: the body of the AskDrawer (every page), of the /ask permalink page and of the
 * Map page's right column when `ask=1`. Header: the title, the one-line contract ("The
 * assistant interprets your question; the inventory engine supplies every number…"), the model,
 * New conversation and — in the drawer — Close. The URL state is sent with every question as
 * ui_state but is not printed beside the box. The empty state lists the scope-derived suggested questions (suggestions.ts; a click sends one). The
 * turns render as ReasoningTimeline (AnswerCard each). Disabled (no key: /release.agent.enabled
 * false, or a 503 on send) shows the DisabledCard. `map_action` events are applied to the URL
 * state as they arrive; the conversation id is written to `c` and the log kept in localStorage
 * (store.ts). A `seed` is sent once per `seedKey` (the page's `?q=`, or an openAsk request)
 * with `seedScope` applied to the URL state and to the ui_state of that send; `onSeeded` is
 * then called.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { BarChart3, ChevronRight, Download, Eraser, FileText, History, LineChart, MoreVertical, Plus, ShieldCheck, Trash2, Waves, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown } from "@/lib/envelope";
import { cellUnit } from "@/lib/labels";
import { useAir, useDeck } from "@/lib/queries";
import { BrandBadge, BrandTile } from "@/components/shell/BrandLogo";
import { ASK_MOTIF, AskMotif } from "./AskMotif";
import { applyPatch, type ExplorerState } from "@/lib/urlState";
import { sameSelection, selectionPatch, uiStateOf } from "@/lib/selection";
import { airScopeBody } from "@/lib/requests";
import { Composer } from "./Composer";
import { DisabledCard } from "./DisabledCard";
import { ReasoningTimeline } from "./ReasoningTimeline";
import { scopeChips, scopeLine, suggestedQuestions, suggestionIntent } from "./suggestions";
import { prepareAppCheck } from "@/lib/appCheck";
import type { AskIntent } from "./types";
import { AskRings } from "./AskRings";
import { HistoryList } from "./HistoryList";
import { clearHistory, forgetConversation, loadHistory, type HistoryEntry } from "./history";
import { ASK_PANEL_WIDTH } from "./docked";
import { movePatch, previousOf, undoPatch, type MapMove } from "./mapMove";
import { useAskStream } from "./useAskStream";
import type { MapActionEvent } from "./types";

/**
 * THE PANEL'S NAME. The app's naming rule (src/__tests__/naming.test.tsx) reserves the dataset's
 * name for citations, downloads and receipts; the chrome carries the initiative's name and the
 * assistant is named for what it does. ASK_LABEL stays the FAB's ACTION label ("Ask about this
 * view") - a button says what it does, a panel says what it is.
 */
export const ASSISTANT_NAME = "Evidence Assistant";
export const ASSISTANT_BLURB = "Ask about Pakistan’s emissions, evidence and uncertainty.";
export const ASSISTANT_TITLE = "Ask the evidence";
export const ASSISTANT_INVITATION = "Explore the data, methods and uncertainty behind each estimate.";

/** The header tile’s size: a mark at the title’s own height, not a second hero. */
export const TILE_PX = 28;

/**
 * An icon for each suggested question, by position. The questions themselves come from
 * suggestions.ts, which is pure over the release's own labels; these only say what KIND of thing
 * is being asked - a trend, a ranking, a certainty, a provenance - so the reader can tell the four
 * apart at a glance rather than reading four sentences.
 *
 * The five "Try these examples" rows this replaced listed capabilities. A capability list teaches
 * nothing a reader can act on; a question about the view in front of them does.
 */
const ASK_ICONS = [LineChart, BarChart3, FileText, Waves] as const;

/** How many of the scope's questions the empty state offers. */
export const ASK_SUGGESTIONS = 4;

/** The badge's diameter. The rings are drawn in badge-radii, so this is the only number to move. */
export const BADGE_PX = 83;

/** The badge's top inside the empty state — its own top padding, so the two cannot drift. */
export const HERO_PT = 54;

/**
 * Where the motif sits, measured off the design at 1:1 and expressed against the BADGE so the two
 * cannot drift. AskMotif's viewBox is its ink, so this box is the ink — there is no run-up to
 * correct for, which is what made an earlier version stretch when it should have moved.
 */
const MOTIF_ABOVE_BADGE_TOP = 47;      // where the fan's highest stroke begins
const MOTIF_GAP_FROM_BADGE = 49;       // clear air between the badge and the first stroke

export function motifBox(badge = BADGE_PX, badgeTop = HERO_PT, panel = ASK_PANEL_WIDTH) {
  return {
    top: badgeTop - MOTIF_ABOVE_BADGE_TOP,
    left: panel / 2 + badge / 2 + MOTIF_GAP_FROM_BADGE,   // the badge is centred
    width: ASK_MOTIF.width,
    height: ASK_MOTIF.height,
  };
}

/**
 * The panel's standing promise, printed under the questions where a reader meets it rather than
 * folded behind an info button. The first sentence says what they get; the second says what the
 * thing will never do, and that is the claim worth keeping in view - an assistant that reworded a
 * document into a number would be indistinguishable from one that read it off the engine.
 */
export const ASK_CONTRACT = "Responses cite their sources and preserve the selected map context.";

// The selection the agent is told about lives in lib/selection.ts (uiStateOf), with the pollutant
// it used to leave out; re-exported because this is where callers have always found it.
export { uiStateOf };

export type AskDockProps = {
  seed?: string | null;
  seedScope?: Partial<ExplorerState> | null;
  /** Changes with every new request; a seed is sent once per key. */
  seedKey?: number;
  onSeeded?: () => void;
  variant?: "dock" | "drawer";
  onClose?: () => void;
  /** Whether the panel is actually on screen. The drawer is mounted on every route and slid out of
   *  sight, so a panel that fetched on mount would fetch on every page in the app for a figure
   *  nobody can see. */
  active?: boolean;
};


/**
 * Put the view's own figure into the certainty question: "How certain is this estimate?" becomes
 * "How certain is the 469.64 Mt CO₂e estimate?".
 *
 * THE FIGURE IS SPLICED HERE AND NOT IN suggestions.ts, on purpose. That module is pure over the
 * release's LABELS and two tests hold it to printing no decimal at all; keeping it that way means
 * the guard still catches a figure invented inside a question template. The one figure that is
 * allowed in is this one, and it is a server string — `display_short` off the envelope cell the
 * deck is already showing, never a number this browser worked out.
 *
 * WITH NO CELL IN HAND THE QUESTION KEEPS ITS ORIGINAL WORDING. A panel that waited for a figure
 * before it could offer a question would be blank on every slow connection, and a panel that
 * guessed one would be lying.
 */
export function withFigure(questions: string[], cell: { display: string | null; display_short?: string | null; unit?: string | null; unit_short?: string } | null): string[] {
  if (!cell) return questions;
  const figure = shown(cell);
  const unit = cellUnit(cell);
  if (!figure) return questions;
  return questions.map((q) => q.replace(/^How certain is (?:this|the .+?) estimate\?$/, `How certain is the ${figure}${unit ? ` ${unit}` : ""} estimate?`));
}

export function AskDock({ seed = null, seedScope = null, seedKey = 0, onSeeded, variant = "dock", onClose, active = true }: AskDockProps = {}) {
  useEffect(() => { if (active) prepareAppCheck(); }, [active]);
  const { state, setState, release, agent, labels, dims, defaults } = useExplorer();
  const stateRef = useRef(state);
  stateRef.current = state;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const scopeOverride = useRef<Partial<ExplorerState> | null>(null);
  // THE AGENT MAY STILL MOVE THE MAP, BUT ONLY WHEN ASKED TO. The prompt calls set_map_view only for
  // an explicit "show me X on the map"; a plain factual question no longer relocates the view
  // someone was reading. When it does move, the move is RECORDED so the turn can say so and offer it
  // back - which is what stands where the six configuration chips used to.
  //
  // This fires from the SSE read loop only, so replaying a stored conversation never re-applies it:
  // reopening an old question must not silently change the map.
  const [agentMove, setAgentMove] = useState<MapMove | null>(null);
  const onMapAction = useCallback((a: MapActionEvent) => {
    const patch = movePatch(a as Record<string, unknown>);
    if (!Object.keys(patch).length) return;
    setAgentMove({ patch, previous: previousOf(stateRef.current, patch) });
    setStateRef.current(patch);
  }, []);
  const onConversationId = useCallback((id: string) => setStateRef.current({ c: id }, { history: "replace" }), []);
  const uiState = useCallback(() => {
    const s = scopeOverride.current ? applyPatch(stateRef.current, scopeOverride.current) : stateRef.current;
    scopeOverride.current = null;
    return uiStateOf(s);
  }, []);
  const stream = useAskStream({ conversationId: state.c, uiState, onMapAction, onConversationId });
  // A MOVE BELONGS TO THE TURN THAT MADE IT. It was never cleared, so "Map updated to…" and its
  // Undo attached themselves to the next answer too - one that had moved nothing.
  const streamSend = stream.send;
  const send = useCallback((text: string, intent?: AskIntent) => { setAgentMove(null); return streamSend(text, intent); }, [streamSend]);
  const ask = useMemo(() => ({ ...stream, send }), [stream, send]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ask.turns]);

  const fns = (release.query_contract.functions as string[] | undefined) ?? [];
  const rule = (release.query_contract.placeholder_rule as string | undefined) ?? "";
  // USABLE, NOT ENABLED. `enabled` tracks the model; the prepared explanations need no key and
  // answer most of what a visitor asks. Keying the whole panel off the model meant a site without
  // a provider key rendered the disabled card and disabled the composer before sending anything,
  // so the library was unreachable from a browser at all. A question that genuinely needs the
  // query still says so - in the transcript, on its own turn.
  const disabled = ask.disabled ? ask.disabled.reason : !agent.usable ? agent.reason : null;

  // THE SAME REQUEST BODY THE DECK ASKS FOR, so on the workspace this is a cache hit rather than a
  // second call: React Query keys on the body, and both sides build it with deckBodies(state).
  // Asked for only while the empty state is on screen and visible - it decorates one suggested
  // question and nothing else, and the answer is not worth a request nobody will read.
  const wantsTotal = active && disabled === null && ask.turns.length === 0;
  // UNDER A POLLUTANT THE FIGURE IS THE POLLUTANT'S, and no greenhouse total is asked for at all.
  // The deck's body carries no pollutant, so this used to fetch the CO₂e total and splice it into
  // a question shown over a PM₂.₅ view. (The air questions carry no figure; the request is the
  // workspace cards' own, so on the workspace it is a cache hit.)
  const deck = useDeck(state, { total: wantsTotal && !state.pol, breakdown: false, ranked: false, provinces: false, peers: false, series: false, gases: false });
  const airTotal = useAir(state.pol ? airScopeBody(state) : null, wantsTotal);
  const total = (state.pol ? airTotal.data : deck.total.data)?.values.find((c) => typeof c.value === "number") ?? null;
  // the seeded question: sent once per seedKey, on the first render that can send it
  const sentKey = useRef<number | null>(null);
  const sendRef = useRef(ask.send);
  sendRef.current = ask.send;
  useEffect(() => {
    const text = seed?.trim();
    if (!text || sentKey.current === seedKey || disabled !== null || ask.streaming) return;
    sentKey.current = seedKey;
    if (seedScope && Object.keys(seedScope).length) {
      scopeOverride.current = seedScope;
      setStateRef.current(seedScope);
    }
    sendRef.current(text);
    onSeeded?.();
  }, [seed, seedScope, seedKey, disabled, ask.streaming, onSeeded]);
  const reset = () => {
    ask.reset();
    setState({ c: null }, { history: "replace" });
  };
  /** Start a clean conversation. The one being left is already saved, turn by turn. */
  const startNew = () => {
    reset();
    setHistoryOpen(false);
  };
  /**
   * OPEN A SAVED CONVERSATION WITHOUT MOVING THE MAP. This writes `c` and nothing else - `c` is
   * chrome, `applyPatch` has no cascade for it, and `uiStateOf` drops it - so the scope rule holds
   * because nothing is written, not because a guard remembered to skip it. `useAskStream` sees the
   * new id and replays the transcript from this device with no request.
   */
  const openConversation = (id: string) => {
    setState({ c: id }, { history: "replace" });
    setHistoryOpen(false);
  };
  const openHistory = () => {
    setEntries(loadHistory());
    setHistoryOpen(true);
    setMenuOpen(false);
  };
  /** Empty this conversation in place: the transcript goes, the conversation stays. */
  const clearCurrent = () => {
    ask.reset();
    setMenuOpen(false);
  };
  /** Remove it from this device altogether, and leave on a clean one. */
  const deleteCurrent = () => {
    if (state.c) setEntries(forgetConversation(state.c));
    reset();
    setMenuOpen(false);
    setConfirmDelete(false);
  };
  /** The exchange as plain text: each question, each answer, and the receipts that back it. */
  const transcriptText = () => {
    const lines: string[] = [];
    for (const t of ask.turns) {
      lines.push(`Q: ${t.message}`);
      const answer = t.events.find((e) => e.name === "answer")?.data as { text?: string; receipts?: string[] } | undefined;
      if (answer?.text) lines.push(`A: ${answer.text.replace(/<cite\b[^>]*>(.*?)<\/cite>/g, "$1")}`);
      if (answer?.receipts?.length) lines.push(`   receipts: ${answer.receipts.join(", ")}`);
      lines.push("");
    }
    lines.push(`${String(release.release_id ?? "")} · ${scope}`);
    return lines.join("\n");
  };
  /** The same text as a file. Supersedes the clipboard copy, which asked the reader to find a home
   *  for it themselves. */
  const downloadTranscript = () => {
    const blob = new Blob([transcriptText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-assistant-${(state.c ?? "conversation").slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // the history list is a VIEW, not a route: it replaces the transcript for as long as it is open
  const [historyOpen, setHistoryOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const menuBox = useRef<HTMLDivElement>(null);
  // Escape and a click outside dismiss the menu - the idiom of shell/CurrentView.tsx, which is the
  // only other transient popover in the app
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e: MouseEvent) => {
      // `contains` throws on a non-Node target; a real mousedown always has an element, but a
      // listener on window is reachable by anything that dispatches one
      if (!(e.target instanceof Node)) return;
      if (menuBox.current && !menuBox.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);

  const scope = scopeLine(labels, dims, state, defaults);
  const suggestions = withFigure(suggestedQuestions(labels, dims, state), total).slice(0, ASK_SUGGESTIONS);
  const empty = ask.turns.length === 0 && disabled === null;
  const conversationTitle = ask.turns.find((t) => t.message.trim())?.message.trim() ?? "New conversation";
  /**
   * The scope this conversation was opened under, when it is not the scope on screen. Reopening an
   * old conversation must never move the map on its own, so the difference is SHOWN and the move is
   * the reader's to make.
   */
  const savedScope = (() => {
    if (historyOpen || empty) return null;
    const saved = ask.turns.find((t) => t.message.trim())?.ui_state;
    if (!saved) return null;
    if (sameSelection(saved, uiStateOf(state), defaults)) return null;
    // A SAVED SCOPE IS A WHOLE SCOPE, NOT A PATCH. `uiStateOf` omits the optional keys when they
    // are unset, so merging it over the current state cannot UNSET anything: a conversation asked
    // with no sector, read while a sector is selected, would both describe itself as having one
    // and fail to clear it on restore. Every optional key is therefore named, null included -
    // the pollutant among them, which the hand-written list here used to leave out, so a PM₂.₅
    // conversation was indistinguishable from a greenhouse one and restoring it changed nothing.
    const patch = selectionPatch(saved, defaults);
    const words = scopeChips(labels, dims, applyPatch(state, patch), defaults)
      .filter((c) => c.primary)
      .map((c) => c.label)
      .join(" · ");
    return { words, restore: () => setState(patch) };
  })();

  // NO "USING THIS VIEW" ROW UNDER THE BOX. The map selection is still sent with every question
  // (uiState above) so the assistant can resolve "here" and "this year", but a row of the map's
  // pills beside the box told the reader every question was about them - and the question, not
  // the map, says what a question is about. Its "Change" link went with it; the map's own
  // filters button opens the same card (docked.ts keeps openFilters for whoever needs it next).
  const composer = (
    <Composer
      onSend={ask.send}
      onStop={reset}
      streaming={ask.streaming}
      disabled={disabled !== null}
      placeholder={empty ? undefined : "Ask a follow-up…"}
    />
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-warm" data-testid="ask-dock" data-variant={variant}>
      <div className="relative border-b border-line px-4 pb-3 pt-3" style={{ borderTop: "3px solid var(--color-brand-gold)" }}>
        {/* THE TILE AND THE CONTROLS ARE SIBLINGS OF THE TEXT BLOCK, never children of the name's
            own row: the 36 px controls were inside that row once and set its height, pushing the
            subtitle 11 px down the panel and moving everything under it, the motif included. */}
        <div className="flex items-start gap-2.5">
          <BrandTile size={TILE_PX} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold leading-tight text-fg">{ASSISTANT_NAME}</span>
              <span className="pill bg-surface-3 px-2 py-0.5 text-micro text-muted">Beta</span>
            </div>
            <p className="mt-1 text-xs leading-snug text-muted">{ASSISTANT_BLURB}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={openHistory} aria-label="Recent conversations"
                    className="toolbar-icon bg-transparent" data-testid="ask-history-toggle">
              <History size={15} />
            </button>
            {/* THE PANEL OFFERS A NEW CONVERSATION, SO IT OWES THE READER THE OLD ONE. This keeps
                the `new-conversation` testid because that is exactly what it does; the one being
                left was saved turn by turn and is a click away under the history icon. */}
            <button type="button" onClick={startNew} aria-label="New conversation"
                    className="toolbar-icon bg-transparent" data-testid="new-conversation">
              <Plus size={16} />
            </button>
            <div ref={menuBox} className="relative">
              <button type="button" onClick={() => { setMenuOpen((v) => !v); setConfirmDelete(false); }} aria-haspopup="menu" aria-expanded={menuOpen}
                      aria-label="Assistant actions" className="toolbar-icon bg-transparent" data-testid="ask-menu-toggle">
                <MoreVertical size={15} />
              </button>
              {menuOpen && (
                <div role="menu" aria-label="Assistant actions" className="card absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden p-1" data-testid="ask-menu">
                  <button type="button" role="menuitem" onClick={clearCurrent} disabled={ask.turns.length === 0}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-fg hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent" data-testid="clear-conversation">
                    <Eraser size={14} className="text-muted" /> Clear this conversation
                  </button>
                  {/* no confirm dialog exists anywhere in the app, so deleting asks in place */}
                  {confirmDelete ? (
                    <button type="button" role="menuitem" onClick={deleteCurrent}
                          className="flex w-full items-center gap-2 rounded-md bg-accent-soft px-2.5 py-2 text-left text-sm text-accent" data-testid="delete-conversation-confirm">
                      <Trash2 size={14} /> Delete it from this device?
                    </button>
                  ) : (
                    <button type="button" role="menuitem" onClick={() => setConfirmDelete(true)} disabled={ask.turns.length === 0}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-fg hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent" data-testid="delete-conversation">
                      <Trash2 size={14} className="text-muted" /> Delete this conversation
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={downloadTranscript} disabled={ask.turns.length === 0}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-fg hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent" data-testid="download-conversation">
                    <Download size={14} className="text-muted" /> Download the transcript
                  </button>
                </div>
              )}
            </div>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close the assistant" className="toolbar-icon" data-testid="ask-close">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {!historyOpen && !empty && disabled === null && (
        <div className="relative flex items-center gap-2 border-b border-line px-4 py-2 text-xs" data-testid="ask-conversation-line">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0 truncate font-medium text-fg">{conversationTitle}</span>
          <span className="shrink-0 text-muted">· Current conversation</span>
        </div>
      )}
      {savedScope && (
        // REOPENING DOES NOT MOVE THE MAP. It is offered, named, and left to the reader - the only
        // place in this panel that writes the saved scope back.
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-nav px-4 py-2 text-xs" data-testid="ask-restore">
          <span className="text-muted">Saved with {savedScope.words}</span>
          <button type="button" onClick={savedScope.restore} className="font-medium text-accent underline underline-offset-2" data-testid="ask-restore-view">
            Restore this map view
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {historyOpen ? (
          <HistoryList
            entries={entries}
            currentId={state.c}
            onOpen={openConversation}
            onNew={startNew}
            onBack={() => setHistoryOpen(false)}
            onForget={(id) => { setEntries(forgetConversation(id)); if (id === state.c) reset(); }}
            onClear={() => { setEntries(clearHistory()); reset(); }}
          />
        ) : disabled !== null ? (
          <DisabledCard reason={disabled} model={agent.model} functions={fns} rule={rule} />
        ) : empty ? (
          <div className="relative px-4 pb-4" style={{ paddingTop: HERO_PT }} data-testid="ask-empty">
            {/* THE MOTIF BELONGS TO THE INVITATION, and it sits clear of the badge: a small sweep
                in the upper right, 126 x 106, starting under the header. It hangs off this box
                rather than off the panel because an absolutely positioned child resolves against
                its ancestor's PADDING box - so `top-0 right-0` here is the header's bottom border
                and the panel's right edge, whatever height the header turns out to be, with no
                magic number to go stale. */}
            <AskMotif style={motifBox()} />
            {/* NOT overflow-hidden: the rings reach well above the badge, and the panel root is
                already the clip. */}
            <div className="relative flex flex-col items-center px-2 pb-5 text-center">
              <AskRings size={BADGE_PX} />
              <BrandBadge size={BADGE_PX} className="relative shadow-card" />
              <h2 className="relative mt-8 text-[40px] font-bold leading-none tracking-tight text-fg" data-testid="ask-title">
                {ASSISTANT_TITLE}
              </h2>
              <p className="relative mt-3.5 max-w-[21rem] text-[15px] leading-[23px] text-muted">{ASSISTANT_INVITATION}</p>
            </div>
            {composer}
            <div className="micro mt-6 mb-0.5">Try asking</div>
            <ul>
              {suggestions.map((q, i) => {
                const Icon = ASK_ICONS[i % ASK_ICONS.length];
                return (
                  // the hairline goes BETWEEN the rows, inset past the icon, and never under the last
                  <li key={q} className="ml-2.5 border-b border-line last:border-b-0">
                    <button type="button" onClick={() => ask.send(q, suggestionIntent(q, state))} className="group -ml-2.5 flex w-[calc(100%+0.625rem)] items-center gap-3.5 py-3.5 text-left" data-testid="suggestion">
                      <span aria-hidden="true" className="shrink-0 text-accent"><Icon size={22} strokeWidth={1.75} /></span>
                      <span className="min-w-0 flex-1 text-base leading-snug text-fg group-hover:text-accent">{q}</span>
                      <ChevronRight size={18} aria-hidden="true" className="mr-0.5 shrink-0 text-muted group-hover:text-accent" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 border-t border-line pt-4 text-xs leading-snug text-muted" data-testid="ask-contract">{ASK_CONTRACT}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-3 py-3">
            {ask.turns.map((t, i) => (
              <ReasoningTimeline
                key={t.id}
                turn={t}
                onFollowUp={ask.send}
                // the move belongs to the turn that made it, which is the last one
                agentMove={i === ask.turns.length - 1 ? agentMove : null}
                onUndoAgentMove={() => { if (agentMove) { setStateRef.current(undoPatch(agentMove)); setAgentMove(null); } }}
              />
            ))}
          </div>
        )}
      </div>

      {/* the empty state carries its own composer under the invitation; every other state - a
          conversation, and the disabled panel, where a greyed box says "not now" and no box at all
          would say nothing - carries it at the foot */}
      {!empty && <div className="px-3 pb-3">{composer}</div>}

      {/* THE ONE PLACE THE DATASET IS NAMED, and the name is not typed here. The naming rule
          reserves the dataset's name for identity and citation - which is exactly what this bar
          is - but the rule is enforced per FILE, and hard-coding it would put the name into the
          chrome's own source. `release_id` is the API's identity string, carrying the data set's
          name and version together, so the bar is both allowed and accurate to whichever release
          is pinned. */}
      <div className="relative mx-4 flex items-center gap-2 border-t border-line py-3 text-xs text-muted" data-testid="ask-identity">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-ok" />
        <span className="shrink-0 text-fg">Published data</span>
        <span aria-hidden="true" className="shrink-0">·</span>
        <span className="min-w-0 truncate" title={scope}>{String(release.release_id ?? "")}</span>
        <span aria-hidden="true" className="shrink-0">·</span>
        <span className="flex-1" />
        <ShieldCheck size={13} aria-hidden="true" className="shrink-0" />
        <span className="shrink-0">Read only</span>
      </div>
    </div>
  );
}
