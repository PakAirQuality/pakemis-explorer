"use client";
/**
 * The widget card every content page composes: a small-caps title, a toolbar of small round
 * icon buttons top-right (info -> Result details on the widget's envelope, download -> the
 * receipt's canonical CSV, share -> the page link copied), a sentence with the key figures in
 * bold (the caller passes server strings inside <b>), the figure, an optional amber note box
 * and a small caption line. Only the theme's utilities (`card`, `widget-title`, `toolbar-icon`,
 * `note`, `caption`) and token classes are used, so a theme swap re-colours it. Nothing here
 * computes: every string is the caller's. `chrome` replaces the outer `card p-4` (the Overview
 * deck's rounded white cards); with `onToggle` the header carries a switch (Switch.tsx) after
 * the toolbar and, when `open` is false, the card shows the header row alone (the body:
 * sentence, figure, note, caption and the drawer are not rendered).
 */
import { useState, type ReactNode } from "react";
import { AlertTriangle, Download, Info, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import { EnvelopeDrawer, type DrawerTab } from "./EnvelopeDrawer";
import { RESULT_DETAILS_TITLE } from "./ReceiptFooter";
import { Switch } from "./Switch";

export const WIDGET_TITLE = "widget-title";
export const ICON_BUTTON = "toolbar-icon";

export type WidgetProps = {
  title: ReactNode;
  /** The envelope behind the widget: gives the info button its Result details and the download button its CSV. */
  env?: Envelope | null;
  labels?: Labels;
  /** The tab Result details opens at (sources by default). */
  infoTab?: DrawerTab;
  /** A download other than the envelope's CSV. */
  downloadHref?: string;
  /** Whether the share button (copy this page's link) is shown. */
  share?: boolean;
  /** Extra toolbar buttons, before the three. */
  tools?: ReactNode;
  /** The sentence with the key figures in bold. */
  sentence?: ReactNode;
  /** The amber note box. */
  note?: ReactNode;
  /** The small caption line. */
  caption?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** The outer classes in place of `card p-4`. */
  chrome?: string;
  testId?: string;
  /** An id for in-page links. */
  id?: string;
  /** Whether the body is shown (a collapsible card); the switch calls `onToggle`. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
};

export function Widget({ title, env, labels, infoTab = "sources", downloadHref, share = true, tools, sentence, note, caption, children, className = "", chrome = "card p-4", testId = "widget", id, open = true, onToggle }: WidgetProps) {
  const [details, setDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const download = downloadHref ?? (env ? api.downloadCsvUrl(env.receipt) : undefined);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the address bar holds the link */
    }
  };
  return (
    <section id={id} className={`${chrome} flex flex-col ${className}`} data-testid={testId} data-receipt={env?.receipt ?? ""} data-open={open ? "1" : "0"}>
      <header className="flex items-center justify-between gap-3">
        <h2 className={`${WIDGET_TITLE} min-w-0`}>{title}</h2>
        <div className="flex shrink-0 items-center gap-1.5" data-testid={`${testId}-toolbar`}>
          {tools}
          {env && (
            <button type="button" onClick={() => setDetails(true)} className={ICON_BUTTON} aria-label="Result details" title={RESULT_DETAILS_TITLE} data-testid={`${testId}-info`}>
              <Info size={14} />
            </button>
          )}
          {download && (
            <a href={download} className={ICON_BUTTON} aria-label="Download these rows" title="Download the canonical CSV of this result" data-testid={`${testId}-download`}>
              <Download size={14} />
            </a>
          )}
          {share && (
            <button type="button" onClick={copyLink} className={ICON_BUTTON} aria-label={copied ? "Link copied" : "Copy the link to this view"} title={copied ? "Link copied" : "Copy the link to this view"} data-testid={`${testId}-share`}>
              <Link2 size={14} />
            </button>
          )}
          {onToggle && <Switch on={open} onChange={onToggle} label={open ? "Collapse this section" : "Expand this section"} testId={`${testId}-switch`} className="ml-1" />}
        </div>
      </header>
      {open && (
        <>
          {sentence && <p className="mt-2 text-sm text-fg" data-testid={`${testId}-sentence`}>{sentence}</p>}
          {children && <div className="mt-3">{children}</div>}
          {note && <NoteBox className="mt-3" testId={`${testId}-note`}>{note}</NoteBox>}
          {caption && <p className="caption mt-2" data-testid={`${testId}-caption`}>{caption}</p>}
          {details && env && <EnvelopeDrawer env={env} tab={infoTab} labels={labels} onClose={() => setDetails(false)} />}
        </>
      )}
    </section>
  );
}

/** The amber note box: a caution a reader should see before reusing the figure. */
export function NoteBox({ children, className = "", testId = "note-box" }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={`note flex items-start gap-2 px-3 py-2 text-xs ${className}`} data-testid={testId} role="note">
      <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
