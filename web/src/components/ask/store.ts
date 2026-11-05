/** Conversations persisted per id in localStorage['pakemis.ask.<conversation_id>'] as their event logs. */
import type { Conversation } from "./types";
import { DRAFT_EVENTS } from "./timeline";

export const STORE_PREFIX = "pakemis.ask.";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadConversation(id: string): Conversation | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Conversation;
    if (!parsed || !Array.isArray(parsed.turns)) return null;
    return { ...parsed, conversation_id: id, turns: parsed.turns.map((t) => ({ ...t, status: t.status === "streaming" ? "failed" : t.status })) };
  } catch {
    return null;
  }
}

export function saveConversation(conv: Conversation) {
  const s = storage();
  if (!s || !conv.conversation_id) return;
  // a finished turn's answer is its `answer` event; the line-by-line draft that preceded it would
  // store the whole text a second time, so the streaming events are not kept
  const turns = conv.turns.map((t) => (t.status === "streaming" ? t : { ...t, events: t.events.filter((e) => !DRAFT_EVENTS.has(e.name)) }));
  try {
    s.setItem(STORE_PREFIX + conv.conversation_id, JSON.stringify({ ...conv, turns, updated: Date.now() }));
  } catch {
    /* quota or private mode: the conversation lives in memory for this tab */
  }
}
