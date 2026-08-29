"use client";
/**
 * POST /v1/ask and read the SSE body with a ReadableStream reader. Each event is appended to
 * the current turn's log (the timeline is derived from it by timeline.ts); `map_action` is
 * handed to the caller as it arrives; `done` names the conversation, which is then persisted
 * (store.ts) and restored from the `c` URL parameter. A 503 is the disabled state (the API's
 * reason), a 429 the per-address cap; neither is retried.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { createSseParser } from "./sse";
import { loadConversation, saveConversation } from "./store";
import { clientHistory } from "./timeline";
import type { AskEvent, DoneEvent, MapActionEvent, Turn } from "./types";

export { createSseParser, parseSse } from "./sse";

export type Disabled = { reason: string };

export type AskStream = {
  turns: Turn[];
  streaming: boolean;
  disabled: Disabled | null;
  conversationId: string | null;
  send: (message: string) => void;
  reset: () => void;
};

type Options = {
  conversationId: string | null;
  uiState: () => Record<string, unknown>;
  onMapAction: (action: MapActionEvent) => void;
  onConversationId: (id: string) => void;
};

let turnCounter = 0;

export function useAskStream({ conversationId, uiState, onMapAction, onConversationId }: Options): AskStream {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [disabled, setDisabled] = useState<Disabled | null>(null);
  const [cid, setCid] = useState<string | null>(conversationId);
  const abortRef = useRef<AbortController | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;
  const cbs = useRef({ uiState, onMapAction, onConversationId });
  cbs.current = { uiState, onMapAction, onConversationId };

  // restore from the URL's conversation id: on mount, and whenever the parameter changes to an
  // id this hook did not just mint (a `done` sets cid first and then writes the URL)
  const seen = useRef<string | null | undefined>(undefined);
  const cidRef = useRef(cid);
  cidRef.current = cid;
  useEffect(() => {
    if (seen.current === conversationId) return;
    seen.current = conversationId;
    if (conversationId !== null && conversationId === cidRef.current && turnsRef.current.length) return;
    abortRef.current?.abort();
    abortRef.current = null;
    const conv = conversationId ? loadConversation(conversationId) : null;
    setCid(conversationId);
    setTurns(conv?.turns ?? []);
    setStreaming(false);
  }, [conversationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const persist = useCallback((id: string | null, next: Turn[]) => {
    if (id) saveConversation({ conversation_id: id, turns: next, updated: Date.now() });
  }, []);

  const send = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text || abortRef.current) return;
      const turn: Turn = { id: `t${Date.now()}_${++turnCounter}`, message: text, ui_state: cbs.current.uiState(), events: [], status: "streaming" };
      const history = clientHistory(turnsRef.current);
      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);
      setDisabled(null);
      setTurns((ts) => [...ts, turn]);
      const append = (ev: AskEvent) => setTurns((ts) => ts.map((t) => (t.id === turn.id ? { ...t, events: [...t.events, ev] } : t)));
      const finish = (status: Turn["status"], id: string | null) => {
        setTurns((ts) => {
          const next = ts.map((t) => (t.id === turn.id ? { ...t, status } : t));
          persist(id, next);
          return next;
        });
        if (abortRef.current === ac) abortRef.current = null;
        setStreaming(false);
      };
      const fail = (code: string, message: string) => {
        append({ name: "error", data: { code, message } });
        finish("failed", cid);
      };
      (async () => {
        let res: Response;
        try {
          res = await fetch(`${API_BASE}/v1/ask`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "text/event-stream" },
            body: JSON.stringify({ conversation_id: cid ?? undefined, message: text, ui_state: turn.ui_state, client_history: history }),
            signal: ac.signal,
          });
        } catch (e) {
          if (ac.signal.aborted) return;
          fail("network_error", String((e as Error)?.message ?? e));
          return;
        }
        if (res.status === 503) {
          const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
          setDisabled({ reason: body.reason ?? body.error ?? "agent_disabled" });
          setTurns((ts) => ts.filter((t) => t.id !== turn.id));
          if (abortRef.current === ac) abortRef.current = null;
          setStreaming(false);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          fail(body.error ?? `http_${res.status}`, body.message ?? `${res.status} ${res.statusText}`);
          return;
        }
        if (!res.body) {
          fail("stream_ended", "the response carried no body");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();
        let doneEvent: DoneEvent | null = null;
        let conversation = cid;
        const handle = (ev: { name: string; data: string }) => {
          let data: unknown;
          try {
            data = JSON.parse(ev.data);
          } catch {
            return;
          }
          append({ name: ev.name, data });
          if (ev.name === "map_action") cbs.current.onMapAction(data as MapActionEvent);
          if (ev.name === "done") {
            doneEvent = data as DoneEvent;
            if (doneEvent.conversation_id && doneEvent.conversation_id !== conversation) {
              conversation = doneEvent.conversation_id;
              setCid(conversation);
              cbs.current.onConversationId(conversation);
            }
          }
        };
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const ev of parser.feed(decoder.decode(value, { stream: true }))) handle(ev);
          }
          for (const ev of parser.feed(decoder.decode())) handle(ev);
          for (const ev of parser.end()) handle(ev);
        } catch (e) {
          if (ac.signal.aborted) return;
          fail("network_error", String((e as Error)?.message ?? e));
          return;
        }
        if (!doneEvent) {
          append({ name: "error", data: { code: "stream_ended", message: "the stream ended before the server said it was done" } });
          finish("failed", conversation);
          return;
        }
        finish("done", conversation);
      })();
    },
    [cid, persist],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setStreaming(false);
    setDisabled(null);
    setCid(null);
  }, []);

  return { turns, streaming, disabled, conversationId: cid, send, reset };
}
