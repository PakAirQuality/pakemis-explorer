"use client";
import { RefusalError } from "@/lib/api";

/** Loading and error states; a typed refusal is shown by name with its limitation id. */
export function Status({ isLoading, error, what }: { isLoading: boolean; error: unknown; what: string }) {
  if (isLoading) return <p className="small">Querying {what}…</p>;
  if (error instanceof RefusalError)
    return (
      <div className="refusal">
        <strong>Refused: {error.refusal.error_class}</strong> ({error.refusal.error}
        {error.refusal.limitation_id ? `, limitation ${error.refusal.limitation_id}` : ""}) — {error.refusal.message}
      </div>
    );
  if (error) return <div className="refusal">Could not query {what}: {String(error)}</div>;
  return null;
}
