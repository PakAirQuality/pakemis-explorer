"use client";
/**
 * The receipt, demoted: one muted mono line (first 8 hex, full on hover) and a kebab menu with
 * Copy, Replay (/r/<receipt>), Evidence, Calculation, CSV, RECEIPT.json, Cite. The menu's
 * Evidence / Calculation / Cite open the EnvelopeDrawer over the envelope itself.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import { EnvelopeDrawer, type DrawerTab } from "./EnvelopeDrawer";

/**
 * `env` is the envelope in hand; a consumer that holds only a receipt (the Ask dock's tool
 * results carry the receipt and the cells, not the envelope) passes `receipt`, and the drawer
 * replays it through GET /v1/receipt/{r} when opened.
 */
export function ReceiptFooter({ env = null, receipt, className = "" }: { env?: Envelope | null; receipt?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const [copied, setCopied] = useState(false);
  const [replayed, setReplayed] = useState<Envelope | null>(null);
  const [replayError, setReplayError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const id = env?.receipt ?? receipt ?? "";
  const shown = env ?? replayed;
  const openDrawer = (tab: DrawerTab) => {
    setDrawer(tab);
    setOpen(false);
    if (!env && !replayed && id) {
      api.receipt(id).then(setReplayed, (e) => setReplayError(String((e as Error)?.message ?? e)));
    }
  };
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the full receipt is in the title */
    }
    setOpen(false);
  };
  const item = "block w-full px-3 py-1.5 text-left text-xs hover:bg-canvas";
  return (
    <div ref={ref} className={`relative flex items-center justify-between gap-2 text-micro normal-case tracking-normal ${className}`} data-testid="receipt-footer">
      <span className="mono truncate text-muted" title={`receipt ${id} · replayable at /v1/receipt/${id}`}>
        receipt <span data-receipt={id}>{id.slice(0, 8)}</span>
        {copied ? " · copied" : ""}
      </span>
      <button type="button" aria-label="Receipt menu" onClick={() => setOpen((o) => !o)} className="pill flex h-5 w-5 items-center justify-center text-muted hover:bg-canvas hover:text-ink">
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="card absolute bottom-6 right-0 z-30 w-44 py-1" role="menu">
          <button className={item} onClick={copy}>Copy receipt</button>
          <Link className={item} href={`/r/${id}`} onClick={() => setOpen(false)}>Replay /r/{id.slice(0, 8)}</Link>
          <button className={item} onClick={() => openDrawer("evidence")}>Evidence</button>
          <button className={item} onClick={() => openDrawer("calculation")}>Calculation</button>
          <a className={item} href={api.downloadCsvUrl(id)} onClick={() => setOpen(false)}>CSV</a>
          <a className={item} href={api.downloadReceiptUrl(id)} onClick={() => setOpen(false)}>RECEIPT.json</a>
          <button className={item} onClick={() => openDrawer("cite")}>Cite</button>
        </div>
      )}
      {drawer && shown && <EnvelopeDrawer env={shown} tab={drawer} onClose={() => setDrawer(null)} />}
      {drawer && !shown && (
        <span className="ml-2 text-xs text-muted" role="status">{replayError ? `replay failed: ${replayError}` : "replaying the receipt…"}</span>
      )}
    </div>
  );
}
