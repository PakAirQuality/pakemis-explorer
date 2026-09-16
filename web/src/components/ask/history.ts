/**
 * The last few conversations, on this device.
 *
 * WHY AN INDEX AND NOT A SCAN. The transcripts already live one per key in
 * localStorage['pakemis.ask.<id>'] (store.ts) and `?c=<id>` already replays one with no network
 * call. What was missing is the list: nothing enumerated those keys, so the panel could offer "New
 * conversation" while quietly orphaning the old one — and it has been doing exactly that, leaving
 * a key behind on every reset with nothing referencing it. This index is the list, and eviction
 * through it is what finally deletes a transcript.
 *
 * The key is deliberately NOT under `pakemis.ask.`: a conversation whose id happened to be
 * "history" would collide with the namespace it lived in. It is also the app's first versioned
 * key — the two that exist carry no version and cannot gain one now without orphaning what they
 * hold, so this one starts as it means to go on.
 *
 * Titles are the first question asked, trimmed. That is the whole of "generate a title": a reader
 * recognises their own question, and a model-written topic would be a round trip to name something
 * they already know. The second line is the most recent question, so a row says where the
 * conversation started and where it got to.
 */
import { STORE_PREFIX } from "./store";

export const HISTORY_KEY = "pakemis.history.v1";

/** How many conversations this device keeps. Older ones go, transcript and all. */
export const HISTORY_CAP = 10;

export type HistoryEntry = {
  id: string;
  /** The first question, trimmed — what the conversation is about. */
  title: string;
  /** The most recent question — where it got to. */
  lastQuestion: string;
  updated: number;
  /** The scope the conversation was OPENED under, so reopening can offer to restore it. */
  ui_state: Record<string, unknown>;
};

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Newest first. Anything malformed reads as an empty history rather than throwing. */
export function loadHistory(): HistoryEntry[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed?.entries)) return [];
    return (parsed.entries as HistoryEntry[])
      .filter((e) => e && typeof e.id === "string" && typeof e.updated === "number")
      .sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(HISTORY_KEY, JSON.stringify({ entries }));
  } catch {
    /* quota or private mode: the list lives in memory for this tab */
  }
}

function drop(s: Storage, id: string) {
  try {
    s.removeItem(STORE_PREFIX + id);
  } catch {
    /* nothing to do: the transcript outlives the index, which is the lesser harm */
  }
}

/**
 * Record a conversation, or move it to the top. Called where the transcript is already written, so
 * the two cannot disagree about what exists.
 *
 * EVICTION DELETES THE TRANSCRIPT. An index that only forgot would leave the same orphans it was
 * built to end.
 */
export function rememberConversation(entry: Omit<HistoryEntry, "updated"> & { updated?: number }): HistoryEntry[] {
  const s = storage();
  if (!s || !entry.id) return loadHistory();
  const now = entry.updated ?? Date.now();
  const existing = loadHistory();
  const prior = existing.find((e) => e.id === entry.id);
  const next: HistoryEntry[] = [
    // a conversation keeps the title and the scope it started with; only its latest question moves
    { ...entry, title: prior?.title ?? entry.title, ui_state: prior?.ui_state ?? entry.ui_state, updated: now },
    ...existing.filter((e) => e.id !== entry.id),
  ];
  for (const gone of next.slice(HISTORY_CAP)) drop(s, gone.id);
  const kept = next.slice(0, HISTORY_CAP);
  write(kept);
  return kept;
}

/** Remove one conversation and its transcript. */
export function forgetConversation(id: string): HistoryEntry[] {
  const s = storage();
  if (!s) return loadHistory();
  drop(s, id);
  const kept = loadHistory().filter((e) => e.id !== id);
  write(kept);
  return kept;
}

/**
 * Forget everything. This also sweeps the `pakemis.ask.*` keys that predate the index — every
 * "New conversation" before today left one behind with nothing pointing at it, and this is the
 * only honest moment to collect them: the reader has just said they want none of it kept.
 */
export function clearHistory(): HistoryEntry[] {
  const s = storage();
  if (!s) return [];
  try {
    const orphans: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const key = s.key(i);
      if (key && key.startsWith(STORE_PREFIX)) orphans.push(key);
    }
    for (const key of orphans) s.removeItem(key);
    s.removeItem(HISTORY_KEY);
  } catch {
    /* private mode: there was nothing to clear */
  }
  return [];
}
