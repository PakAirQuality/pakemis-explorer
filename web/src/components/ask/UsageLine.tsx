/** Tokens, cost estimate and elapsed seconds exactly as the `done` and `answer` events carried them. */
import type { AnswerEvent, DoneEvent } from "./types";

const USAGE_LABELS: Record<string, string> = { input_tokens: "in", output_tokens: "out", cache_read_input_tokens: "cache read", cache_creation_input_tokens: "cache write" };

export function UsageLine({ done, answer }: { done: DoneEvent | null; answer: AnswerEvent | null }) {
  if (!done && !answer) return null;
  const parts: string[] = [];
  if (done?.usage) {
    for (const [k, v] of Object.entries(done.usage)) {
      if (v === 0 || v === null || v === undefined) continue;
      parts.push(`${USAGE_LABELS[k] ?? k.replace(/_/g, " ")} ${String(v)}`);
    }
  }
  if (done && done.cost_estimate_usd !== null && done.cost_estimate_usd !== undefined) parts.push(`≈ $${String(done.cost_estimate_usd)}`);
  if (answer && answer.elapsed_s !== undefined) parts.push(`${String(answer.elapsed_s)} s`);
  return (
    <div className="mono px-1 text-micro normal-case tracking-normal text-muted" data-testid="usage-line" title="tokens and the server's cost estimate; the invoice is the provider's">
      {parts.join(" · ")}
    </div>
  );
}
