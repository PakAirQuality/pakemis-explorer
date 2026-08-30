"use client";
/** A typed refusal shown by name: error class, error, limitation id and the server's message. Shared by the legend, the panels and the agent. */
import { RefusalError } from "@/lib/api";
import { refusalWords, type Refusal } from "@/lib/envelope";

export function refusalOf(error: unknown): Refusal | null {
  return error instanceof RefusalError ? error.refusal : null;
}

export function RefusalCard({ refusal, error, what, compact = false }: { refusal?: Refusal | null; error?: unknown; what?: string; compact?: boolean }) {
  const r = refusal ?? refusalOf(error);
  if (!r) {
    if (!error) return null;
    return (
      <div className="rounded-card border border-warn/30 bg-refusal px-3 py-2 text-sm text-warn" data-testid="error-card">
        Could not query{what ? ` ${what}` : ""}: {String((error as Error)?.message ?? error)}
      </div>
    );
  }
  return (
    <div className={`rounded-card border-l-4 border-warn bg-refusal ${compact ? "px-3 py-2" : "px-4 py-3"}`} data-testid="refusal-card" data-limitation={r.limitation_id ?? ""}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold text-warn">Refused: {r.error_class}</span>
        <span className="mono text-xs text-muted">{r.error}</span>
        {r.limitation_id && <span className="mono text-xs text-muted">limitation {r.limitation_id}</span>}
      </div>
      <p className={`mt-1 ${compact ? "text-xs" : "text-sm"} text-fg`}>{refusalWords(r)}</p>
      {!compact && Object.keys(r.detail ?? {}).length > 0 && <p className="mono mt-1 text-xs text-muted">{JSON.stringify(r.detail)}</p>}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="text-xs text-muted" role="status">
      Querying {what}…
    </p>
  );
}
