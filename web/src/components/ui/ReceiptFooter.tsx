"use client";
/**
 * The source line under every result: one quiet text button, "Result details", that opens the
 * EnvelopeDrawer (Sources, Filters, Calculation, API request, Download, Cite; the Result ID and
 * the replay link at its foot). The receipt is not printed here; it is the drawer's Result ID.
 *
 * `env` is the envelope in hand; a consumer that holds only a receipt (the Ask dock's tool
 * results carry the receipt and the cells, not the envelope) passes `receipt`, and the drawer
 * replays it through GET {API_BASE}/receipt/{r} when opened. `labels` name the ids in the
 * Filters tab; the Explorer's context supplies them when the caller does not.
 */
import { useContext, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import { ExplorerContext } from "@/components/ExplorerContext";
import { EnvelopeDrawer } from "./EnvelopeDrawer";

export { receiptHref } from "@/lib/api";

export const RESULT_DETAILS_TITLE = "Sources · filters · calculation · API request";

export function ReceiptFooter({ env = null, receipt, className = "", labels }: { env?: Envelope | null; receipt?: string; className?: string; labels?: Labels }) {
  const ctx = useContext(ExplorerContext);
  const [open, setOpen] = useState(false);
  const [replayed, setReplayed] = useState<Envelope | null>(null);
  const [replayError, setReplayError] = useState("");
  const id = env?.receipt ?? receipt ?? "";
  const shown = env ?? replayed;
  const openDrawer = () => {
    setOpen(true);
    if (!env && !replayed && id) {
      api.receipt(id).then(setReplayed, (e) => setReplayError(String((e as Error)?.message ?? e)));
    }
  };
  return (
    <div className={`flex items-center gap-2 text-micro normal-case tracking-normal ${className}`} data-testid="receipt-footer" data-receipt={id}>
      <button type="button" onClick={openDrawer} title={RESULT_DETAILS_TITLE} className="flex items-center gap-0.5 text-muted hover:text-ink" data-testid="result-details">
        Result details <ChevronRight size={12} aria-hidden="true" />
      </button>
      {open && shown && <EnvelopeDrawer env={shown} tab="sources" labels={labels ?? ctx?.labels} onClose={() => setOpen(false)} />}
      {open && !shown && <span className="text-muted" role="status">{replayError ? `could not load the result: ${replayError}` : "loading the result…"}</span>}
    </div>
  );
}
