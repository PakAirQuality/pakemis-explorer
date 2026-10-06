"use client";
/**
 * One tool call: the function humanised, its input as label chips, and (collapsible) the
 * result the server streamed back: the first cells as `display unit` with their group label,
 * the interval badge on a bounded cell, limitation chips, the ReceiptFooter, and "Show on map"
 * which puts the call's request on the URL through stateFromRequest (on the Map page) or links
 * to the workspace with that state (anywhere else). A refusal renders the shared RefusalCard. Nothing
 * here is computed: every string is the event's.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { cellUnit, functionLabel, groupText, inputChips, limitationText } from "@/lib/labels";
import { stateFromRequest } from "@/lib/requests";
import { applyPatch, hrefForState } from "@/lib/urlState";
import { isActive } from "@/components/shell/NavCapsule";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { RefusalCard } from "@/components/ui/RefusalCard";
import { apiUrl } from "@/lib/api";
import type { TimelineItem } from "./types";

export type Highlight = { k: number; cell: number | null } | null;
type ToolItem = Extract<TimelineItem, { kind: "tool" }>;

export function ToolCard({ item, highlight, pending }: { item: ToolItem; highlight: Highlight; pending: boolean }) {
  const { labels, dims, state, defaults, setState } = useExplorer();
  const onMap = isActive(usePathname(), "/"); // the workspace carries the map
  const [open, setOpen] = useState(true);
  const chips = inputChips(labels, dims, item.input);
  const hit = highlight?.k === item.k;
  const patch = stateFromRequest({ name: item.name, body: item.input });
  const canShow = item.name !== "set_map_view" && Object.keys(patch).length > 0;
  const r = item.result;
  return (
    <div className={`rounded-card border bg-surface-2 transition-shadow ${hit ? "border-accent shadow-[0_0_0_2px_var(--color-accent-soft)]" : "border-line"}`} data-testid="tool-card" data-tool-k={item.k} data-tool-name={item.name}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 shrink-0 text-muted" aria-label={open ? "Collapse result" : "Expand result"}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="mono text-micro normal-case tracking-normal text-muted">{String(item.k)}</span>
            <span className="text-sm font-semibold">{functionLabel(item.name)}</span>
            <span className="mono text-xs text-muted">{item.name}</span>
            {pending && !r && !item.refusal && !item.limitReached && <span className="text-xs text-muted" role="status">running…</span>}
          </div>
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span key={c.key} className="pill border border-line bg-surface px-2 py-px text-xs" title={`${c.key} = ${c.raw}`}>
                  <span className="text-muted">{c.label}</span> {c.value}
                </span>
              ))}
            </div>
          )}
        </div>
        {canShow && onMap && (
          <button type="button" onClick={() => setState(patch)} className="pill flex shrink-0 items-center gap-1 border border-line px-2 py-0.5 text-xs text-accent hover:bg-accent-soft" title={JSON.stringify(patch)} data-testid="show-on-map">
            <MapPin size={12} /> Show on map
          </button>
        )}
        {canShow && !onMap && (
          <Link href={hrefForState(applyPatch(state, patch), defaults, "/")} className="pill flex shrink-0 items-center gap-1 border border-line px-2 py-0.5 text-xs text-accent hover:bg-accent-soft" title={JSON.stringify(patch)} data-testid="show-on-map">
            <MapPin size={12} /> Show on map
          </Link>
        )}
      </div>
      {open && item.refusal && (
        <div className="px-3 pb-2">
          <RefusalCard refusal={item.refusal} compact />
        </div>
      )}
      {open && item.limitReached && <p className="px-3 pb-2 text-xs text-warn">Tool-call limit reached for this message; the agent answers with the results it has.</p>}
      {open && r && (
        <div className="border-t border-line px-3 py-2 text-xs" data-testid="tool-result">
          {r.download ? (
            <div className="flex flex-wrap gap-2">
              <a className="text-accent underline" href={apiUrl(r.download.csv)}>CSV</a>
              <a className="text-accent underline" href={apiUrl(r.download.receipt_json)}>RECEIPT.json</a>
            </div>
          ) : (
            <>
              <div className="micro mb-1">
                {String(r.n_values)} {r.n_values === 1 ? "cell" : "cells"}
                {r.request_type ? <span className="mono ml-2 normal-case tracking-normal">{r.request_type}</span> : null}
              </div>
              {r.cells.length > 0 ? (
                <table className="w-full">
                  <tbody>
                    {r.cells.map((c) => {
                      const g = groupText(labels, dims, c.group);
                      const attrs = Object.values(c.attrs ?? {}).join(" · ");
                      const cellHit = hit && highlight?.cell === c.i;
                      return (
                        <tr key={c.i} className={cellHit ? "bg-accent-soft" : ""} data-cell-i={c.i} data-testid="result-cell">
                          <td className="py-0.5 pr-2 align-top text-muted">
                            {g || attrs || "all"}
                            {g && attrs ? <span className="mono ml-1 text-micro normal-case tracking-normal">{attrs}</span> : null}
                          </td>
                          <td className="num whitespace-nowrap py-0.5 text-right align-top">
                            <span className="font-semibold text-fg" title={c.display ? `${c.display} (contract precision)` : undefined}>{c.display_short ?? c.display ?? ""}</span> <span className="text-muted">{cellUnit(c)}</span>
                            {isBounded(c) && <span className="ml-1"><IntervalBadge cell={c} title={c.interpretation ?? c.exactness} /></span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted">No rows in this scope.</p>
              )}
              {r.truncated && <p className="mt-1 text-muted">{r.truncated}</p>}
              {r.unallocated && <p className="mt-1 text-muted">Some mass is unallocated at this grain; the envelope&apos;s Sources tab lists it.</p>}
            </>
          )}
          {r.limitations_hit.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {r.limitations_hit.map((l) => (
                <span key={l} className="pill border border-warn/30 bg-refusal px-2 py-px text-micro normal-case tracking-normal text-warn" title={l}>
                  {limitationText(labels, l)}
                </span>
              ))}
            </div>
          )}
          {r.receipt && <ReceiptFooter receipt={r.receipt} className="mt-1.5" />}
        </div>
      )}
    </div>
  );
}
