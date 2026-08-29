/**
 * The /ask event payloads as api/pakemis_api/ask/router.py documents them. Every string a
 * card prints (display, unit, exactness, message, receipt) is taken from these as received.
 */
export type StatusEvent = { phase: string; turn?: number; k?: number; name?: string; reason?: string };
export type ThinkingEvent = { text: string };
export type ToolCallEvent = { k: number; id: string; name: string; input: Record<string, unknown> };
export type ToolResultCell = {
  i: number;
  display: string | null;
  unit: string | null;
  group?: Record<string, string | null>;
  exactness?: string;
  interpretation?: string;
  attrs?: Record<string, string>;
};
export type ToolResultEvent = {
  k: number;
  id: string;
  name: string;
  receipt: string | null;
  request_type: string | null;
  context: Record<string, unknown>;
  n_values: number;
  cells: ToolResultCell[];
  limitations_hit: string[];
  unallocated?: Record<string, unknown>;
  truncated?: string;
  download?: { csv: string; receipt_json: string };
};
export type RefusalEvent = { k: number; id: string; name: string; error: string; error_class: string; limitation_id: string | null; message: string; detail: Record<string, unknown> };
export type MapActionKey = "level" | "geo" | "period" | "month" | "sector" | "gas" | "config" | "gwp" | "view";
export type MapActionEvent = Partial<Record<MapActionKey, string>>;
export type Citation = { k: number; cell: number; attr: string; receipt: string; text: string };
export type AnswerEvent = { text: string; receipts: string[]; citations: Citation[]; elapsed_s: number };
export type ErrorEvent = { code: string; message?: string };
export type DoneEvent = { conversation_id: string; usage: Record<string, number>; cost_estimate_usd: number | null };

/** One parsed event of the stream: the SSE name and its JSON payload. */
export type AskEvent = { name: string; data: unknown };

export type TimelineItem =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; k: number; id: string; name: string; input: Record<string, unknown>; result?: ToolResultEvent; refusal?: RefusalEvent; limitReached?: boolean }
  | { kind: "map_action"; action: MapActionEvent }
  | { kind: "correction"; reason: string }
  | { kind: "answer"; answer: AnswerEvent }
  | { kind: "error"; code: string; message: string };

export type TurnStatus = "streaming" | "done" | "failed";

/** One user message and everything the server streamed back for it (the event log is the source of truth; the timeline is derived). */
export type Turn = { id: string; message: string; ui_state: Record<string, unknown>; events: AskEvent[]; status: TurnStatus };

export type Conversation = { conversation_id: string | null; turns: Turn[]; updated: number };
