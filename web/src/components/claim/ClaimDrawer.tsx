"use client";
/**
 * Opening a claim record from any number. `ClaimPanel` fetches `GET /claim` for a selector
 * and renders the ClaimRecord (a typed 4xx — a compare difference cell's `no_rows`, an
 * unknown cell, a category off the national grain — is the RefusalCard by name; nothing is
 * retried or hidden). `ClaimDrawer` is the page-level overlay around it, with the permalink
 * to /methods. `ClaimLink` is the affordance a table puts beside a value: `{receipt, cell}`
 * opens the drawer. The labels and dims come from the ExplorerContext when one is mounted,
 * else from an empty set (the API's own labels then carry the breadcrumb).
 */
import { useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { FileSearch, X } from "lucide-react";
import { ExplorerContext } from "@/components/ExplorerContext";
import { breadcrumbText, claimHref, useClaim, type ClaimSelector } from "@/lib/claim";
import type { Dims } from "@/lib/labels";
import { releaseLabels, type Labels } from "@/lib/release";
import { Loading, RefusalCard } from "@/components/ui/RefusalCard";
import { ClaimRecord } from "./ClaimRecord";

const NO_LABELS = releaseLabels(undefined);
const NO_DIMS: Dims = { adm1: [], adm2: [] };

/** The labels and dims of the mounted ExplorerContext, or empty ones outside it. */
export function useClaimLabels(labels?: Labels, dims?: Dims): { labels: Labels; dims: Dims } {
  const ctx = useContext(ExplorerContext);
  return { labels: labels ?? ctx?.labels ?? NO_LABELS, dims: dims ?? ctx?.dims ?? NO_DIMS };
}

export type ClaimPanelProps = { selector: ClaimSelector; labels?: Labels; dims?: Dims; /** Whether the permalink to /methods is shown under the record. */ permalink?: boolean };

export function ClaimPanel({ selector, labels: givenLabels, dims: givenDims, permalink = true }: ClaimPanelProps) {
  const { labels, dims } = useClaimLabels(givenLabels, givenDims);
  const claim = useClaim(selector);
  if (claim.error) return <RefusalCard error={claim.error} what="the claim record" />;
  if (!claim.data) return <Loading what="the claim record" />;
  return (
    <div className="space-y-3" data-testid="claim-panel">
      <ClaimRecord claim={claim.data} labels={labels} dims={dims} />
      {permalink && "receipt" in selector && (
        <p className="border-t border-line pt-3 text-xs text-muted">
          <Link href={claimHref(selector)} className="font-semibold text-accent hover:underline" data-testid="claim-permalink">Open this record on Methods →</Link>
        </p>
      )}
    </div>
  );
}

export function ClaimDrawer({ selector, onClose, labels: givenLabels, dims: givenDims }: { selector: ClaimSelector; onClose: () => void; labels?: Labels; dims?: Dims }) {
  const { labels, dims } = useClaimLabels(givenLabels, givenDims);
  const claim = useClaim(selector);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-fg/30" onClick={onClose} role="dialog" aria-label="Claim record">
      <div className="flex h-full w-full max-w-4xl flex-col bg-surface-2 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg">Claim record</div>
            <div className="truncate text-xs text-muted" data-testid="claim-drawer-crumb">{claim.data ? breadcrumbText(labels, dims, claim.data) : "the evidence behind this number"}</div>
          </div>
          <button aria-label="Close" onClick={onClose} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm" data-testid="claim-drawer-body">
          <ClaimPanel selector={selector} labels={labels} dims={dims} />
        </div>
      </div>
    </div>
  );
}

/** The affordance beside a value: opens the claim record of `{receipt, cell}` in the drawer. */
export function ClaimLink({ receipt, cell, children, className = "", title = "Open the claim record: the evidence behind this number" }: { receipt: string; cell: number; children?: ReactNode; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline ${className}`} title={title} aria-label={title} data-testid="claim-link" data-receipt={receipt} data-cell={cell}>
        <FileSearch size={12} aria-hidden="true" /> {children ?? "Evidence"}
      </button>
      {open && <ClaimDrawer selector={{ receipt, cell }} onClose={() => setOpen(false)} />}
    </>
  );
}
