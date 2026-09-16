"use client";
/**
 * Recent conversations: the panel's third state, shown in place of the transcript.
 *
 * It exists because the panel offers "New conversation", and a panel that offers that owes the
 * reader the old one — otherwise they reasonably assume it was kept and find later that it was not.
 *
 * TWO GUARDS THIS LIST MUST NOT TRIP, both already in the suite and both about honesty rather than
 * looks. `ask.test.tsx` walks every decimal on screen and requires it to be a string the server
 * sent, so `when()` never says "1.5 h ago"; and the panel must never print a raw period id, so the
 * filter chips go through the release's own labels.
 */
import { useState } from "react";
import { ArrowLeft, Laptop, MoreVertical, Plus } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { gasLabel, periodShort } from "@/lib/labels";
import type { HistoryEntry } from "./history";

const ROW = "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent-soft";

/**
 * When, in words a reader uses. No fractions: the decimal audit walks every number on screen, and
 * "1.5 h ago" would be one this browser invented. Whole minutes, then the day.
 */
export function when(updated: number, now = Date.now()): string {
  const mins = Math.floor((now - updated) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const then = new Date(updated);
  const today = new Date(now);
  const sameDay = then.toDateString() === today.toDateString();
  if (sameDay) return "Earlier today";
  const yesterday = new Date(now - 86400000);
  if (then.toDateString() === yesterday.toDateString()) return "Yesterday";
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Today's conversations first, then the rest — the only grouping the list needs. */
export function groupByDay(entries: HistoryEntry[], now = Date.now()): { today: HistoryEntry[]; earlier: HistoryEntry[] } {
  const day = new Date(now).toDateString();
  return {
    today: entries.filter((e) => new Date(e.updated).toDateString() === day),
    earlier: entries.filter((e) => new Date(e.updated).toDateString() !== day),
  };
}

export function HistoryList({
  entries,
  currentId,
  onOpen,
  onNew,
  onBack,
  onForget,
  onClear,
}: {
  entries: HistoryEntry[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onBack: () => void;
  onForget: (id: string) => void;
  onClear: () => void;
}) {
  const { labels, dims } = useExplorer();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  /** The filters a conversation was opened under, in the release's own words. Never a raw id. */
  const scopeWords = (ui: Record<string, unknown>): string[] => {
    const out: string[] = [];
    const geo = typeof ui.geo === "string" ? ui.geo : null;
    out.push(geo ? (dims.adm1.find((r) => r.name === geo)?.name ?? geo) : "Pakistan");
    if (typeof ui.sector === "string") out.push(ui.sector);
    out.push(gasLabel(labels, typeof ui.gas === "string" ? ui.gas : null));
    if (typeof ui.period === "string") out.push(periodShort(labels, ui.period));
    return out;
  };

  const section = (title: string, rows: HistoryEntry[]) =>
    rows.length === 0 ? null : (
      <div key={title} className="mt-4" data-testid="history-section" data-section={title}>
        <div className="micro mb-1 px-3">{title}</div>
        <ul>
          {rows.map((e) => {
            const current = e.id === currentId;
            return (
              <li
                key={e.id}
                className={current ? "rounded-lg border border-brand-gold bg-nav" : "border-b border-line last:border-b-0"}
                data-testid="history-row"
                data-id={e.id}
                data-current={current ? "1" : "0"}
              >
                <div className="flex items-start">
                  <button type="button" onClick={() => onOpen(e.id)} className={ROW} data-testid="history-open">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{e.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{e.lastQuestion}</span>
                      <span className="mt-1 block text-xs text-muted">{when(e.updated)}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {scopeWords(e.ui_state).map((w) => (
                          <span key={w} className="pill bg-surface-3 px-2 py-0.5 text-micro normal-case tracking-normal text-fg" data-testid="history-chip">
                            {w}
                          </span>
                        ))}
                      </span>
                    </span>
                    {current && (
                      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-accent" data-testid="history-current">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" /> Current
                      </span>
                    )}
                  </button>
                  {/* THE APP HAS NO CONFIRM DIALOG ANYWHERE, so deleting asks in place rather than
                      inventing a modal for one button. */}
                  {confirming === e.id ? (
                    <span className="flex shrink-0 items-center gap-1 pr-2 pt-2.5">
                      <button type="button" onClick={() => { onForget(e.id); setConfirming(null); }}
                              className="pill bg-accent px-2 py-0.5 text-xs text-on-accent" data-testid="history-delete-confirm">
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="pill px-2 py-0.5 text-xs text-muted hover:text-fg">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(e.id)} aria-label={`Remove ${e.title}`}
                            className="mr-1 mt-2 shrink-0 rounded-md p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="history-row-menu">
                      <MoreVertical size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );

  const { today, earlier } = groupByDay(entries);
  return (
    <div className="px-1 pb-4 pt-3" data-testid="ask-history">
      <div className="flex items-start gap-2 px-3">
        <button type="button" onClick={onBack} aria-label="Back to the conversation" className="toolbar-icon mt-0.5" data-testid="history-back">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-md font-semibold leading-tight text-fg">Recent conversations</div>
          <div className="mt-0.5 text-xs text-muted">Saved on this device</div>
        </div>
        <button type="button" onClick={onNew} className="pill flex shrink-0 items-center gap-1 bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-bright" data-testid="history-new">
          <Plus size={14} /> New
        </button>
      </div>
      <p className="mt-3 px-3 text-xs leading-snug text-muted">Continue an earlier question or begin with a clean view.</p>

      {entries.length === 0 ? (
        <p className="mt-6 px-3 text-sm text-muted" data-testid="history-empty">
          Nothing saved yet. Ask something and it will be kept here.
        </p>
      ) : (
        <>
          {section("Today", today)}
          {section("Earlier", earlier)}
          <div className="mt-5 flex items-center gap-2 border-t border-line px-3 pt-3 text-xs text-muted">
            <Laptop size={13} aria-hidden="true" className="shrink-0" />
            <span className="flex-1">Conversations remain on this device</span>
            {clearing ? (
              <>
                <button type="button" onClick={() => { onClear(); setClearing(false); }} className="font-medium text-accent underline underline-offset-2" data-testid="history-clear-confirm">
                  Clear all
                </button>
                <button type="button" onClick={() => setClearing(false)} className="hover:text-fg">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setClearing(true)} className="font-medium text-accent underline underline-offset-2" data-testid="history-clear">
                Clear history
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
