"use client";
/**
 * The widget card every content page composes: a small-caps title, a toolbar of small round
 * icon buttons top-right (info -> Result details on the widget's envelope, download -> the
 * receipt's canonical CSV, share -> the page link copied), a sentence with the key figures in
 * bold (the caller passes server strings inside <b>), the figure, an optional amber note box
 * and a small caption line. Only the theme's utilities (`card`, `widget-title`, `toolbar-icon`,
 * `note`, `caption`) and token classes are used, so a theme swap re-colours it. Nothing here
 * computes: every string is the caller's.
 */
import { useState, type ReactNode } from "react";
import { AlertTriangle, Download, Info, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import { EnvelopeDrawer, type DrawerTab } from "./EnvelopeDrawer";
import { RESULT_DETAILS_TITLE } from "./ReceiptFooter";

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
  testId?: string;
  /** An id for in-page links. */
  id?: string;
};

export function Widget({ title, env, labels, infoTab = "sources", downloadHref, share = true, tools, sentence, note, caption, children, className = "", testId = "widget", id }: WidgetProps) {
  const [open, setOpen] = useState(false);
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
    <section id={id} className={`card flex flex-col p-4 ${className}`} data-testid={testId} data-receipt={env?.receipt ?? ""}>
      <header className="flex items-start justify-between gap-3">
        <h2 className={WIDGET_TITLE}>{title}</h2>
        <div className="flex shrink-0 items-center gap-1.5" data-testid={`${testId}-toolbar`}>
          {tools}
          {env && (
            <button type="button" onClick={() => setOpen(true)} className={ICON_BUTTON} aria-label="Result details" title={RESULT_DETAILS_TITLE} data-testid={`${testId}-info`}>
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
        </div>
      </header>
      {sentence && <p className="mt-2 text-sm text-fg" data-testid={`${testId}-sentence`}>{sentence}</p>}
      {children && <div className="mt-3">{children}</div>}
      {note && <NoteBox className="mt-3" testId={`${testId}-note`}>{note}</NoteBox>}
      {caption && <p className="caption mt-2" data-testid={`${testId}-caption`}>{caption}</p>}
      {open && env && <EnvelopeDrawer env={env} tab={infoTab} labels={labels} onClose={() => setOpen(false)} />}
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
