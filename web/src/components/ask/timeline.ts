/**
 * The event log of one turn, reduced into the cards the dock shows, in arrival order:
 * consecutive thinking deltas merge into one ThinkingCard; a tool_result or refusal attaches to
 * the tool_call of the same k; status carries the live phase and the correction notice.
 */
import type { AnswerEvent, AskEvent, DoneEvent, ErrorEvent, MapActionEvent, RefusalEvent, StatusEvent, ThinkingEvent, TimelineItem, ToolCallEvent, ToolResultEvent } from "./types";

/**
 * `draft` is the answer as it streams: the lines the server has checked and sent (`answer_delta`),
 * each with its figures already filled in, until the final `answer` replaces them. `checking` is
 * true after the server took a draft back (`answer_reset` for a correction) and before the next
 * line arrives. A reset for "tools" - text the model wrote before it decided to call a tool - just
 * drops the draft: it was never the answer.
 *
 * `retrying` is true after the server cut a model call that went silent or failed with a passing
 * server error (`status` phase "retry") and before the retried call shows progress: a line of the
 * answer, a lookup, the answer itself or an error. A reset for "retry" drops the half-answer.
 */
export type Timeline = { items: TimelineItem[]; status: StatusEvent | null; done: DoneEvent | null; answer: AnswerEvent | null; draft: string; checking: boolean; retrying: boolean };

function toolItem(items: TimelineItem[], k: number) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "tool" && it.k === k) return it;
  }
  return null;
}

export function timelineOf(events: AskEvent[]): Timeline {
  const items: TimelineItem[] = [];
  let status: StatusEvent | null = null;
  let done: DoneEvent | null = null;
  let answer: AnswerEvent | null = null;
  let draft = "";
  let checking = false;
  let retrying = false;
  for (const { name, data } of events) {
    switch (name) {
      case "answer_delta": {
        draft += (data as { text?: string }).text ?? "";
        checking = false;
        retrying = false;
        break;
      }
      case "answer_reset": {
        draft = "";
        checking = (data as { reason?: string }).reason === "correction";
        break;
      }
      case "status": {
        const s = data as StatusEvent;
        status = s;
        if (s.phase === "retry") retrying = true;
        if (s.phase === "correction") items.push({ kind: "correction", reason: s.reason ?? "" });
        if (s.phase === "tool_limit" && typeof s.k === "number") {
          const t = toolItem(items, s.k);
          if (t) t.limitReached = true;
        }
        break;
      }
      case "thinking": {
        const t = data as ThinkingEvent;
        const last = items[items.length - 1];
        if (last && last.kind === "thinking") last.text += t.text;
        else items.push({ kind: "thinking", text: t.text });
        break;
      }
      case "tool_call": {
        const c = data as ToolCallEvent;
        retrying = false;
        items.push({ kind: "tool", k: c.k, id: c.id, name: c.name, input: c.input ?? {} });
        break;
      }
      case "tool_result": {
        const r = data as ToolResultEvent;
        const t = toolItem(items, r.k);
        if (t) t.result = r;
        else items.push({ kind: "tool", k: r.k, id: r.id, name: r.name, input: {}, result: r });
        break;
      }
      case "refusal": {
        const r = data as RefusalEvent;
        const t = toolItem(items, r.k);
        if (t) t.refusal = r;
        else items.push({ kind: "tool", k: r.k, id: r.id, name: r.name, input: {}, refusal: r });
        break;
      }
      case "map_action":
        items.push({ kind: "map_action", action: data as MapActionEvent });
        break;
      case "answer":
        answer = data as AnswerEvent;
        retrying = false;
        items.push({ kind: "answer", answer });
        draft = "";
        checking = false;
        break;
      case "error": {
        // an answer withheld is withheld whole: no half-streamed draft stays on screen
        draft = "";
        checking = false;
        retrying = false;
        const e = data as ErrorEvent;
        items.push({ kind: "error", code: e.code, message: e.message ?? "", scope: e.scope });
        break;
      }
      case "done":
        done = data as DoneEvent;
        break;
      default:
        break;
    }
  }
  return { items, status, done, answer, draft, checking, retrying };
}

/** The streaming events: what builds a draft, and nothing a finished turn needs. */
export const DRAFT_EVENTS: ReadonlySet<string> = new Set(["answer_delta", "answer_reset"]);

/** The user/assistant text pairs the server accepts as `client_history` (answers keep their cite tags, as the server stores them). */
export function clientHistory(turns: { message: string; events: AskEvent[] }[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    const a = timelineOf(t.events).answer;
    if (!a) continue;
    out.push({ role: "user", content: t.message }, { role: "assistant", content: a.text });
  }
  return out;
}
