"use client";
/**
 * The place card, the deck's first card. 420 px wide, 20 px radius: the ivory block
 * (`--color-nav`) carries the eyebrow
 * "National emissions" (or the provincial / district variant), the place's name, one line saying what the tool does and the
 * province select — the location control the card exists for — and a white utility row beneath
 * it, separated by spacing and one hairline, holds Share and Download.
 *
 * `Reset map` sits at the left of that row and appears only once there is something to reset:
 * the user has moved the map, or picked a province, a district or another level (`showReset`).
 * The four circular actions are gone with the "Choose a province" button they duplicated: the
 * select is the control, and the utilities stay secondary to it.
 */
import { useState } from "react";
import Link from "next/link";
import { Download, RotateCcw, Share2 } from "lucide-react";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { PlacePicker } from "./PlacePicker";
import { HEADER } from "./copy";

const UTILITY = "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg transition-colors hover:bg-accent-soft";

export function HeaderBlock({ title = HEADER.title, onReset, showReset = false }: { title?: string; onReset: () => void; showReset?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the address bar holds the link */
    }
  };
  return (
    <header className="pointer-events-auto relative shrink-0 overflow-hidden rounded-[20px] border border-nav-line bg-nav text-nav-fg shadow-lg" data-testid="header-block">
      <div className="relative px-6 pb-5 pt-4">
        <ContourMotif />
        <div className="relative">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-fg" data-testid="place-title">{title}</h1>
          <p className="mt-1 text-[13px] text-muted" data-testid="header-dek">{HEADER.dek}</p>
          <PlacePicker />
        </div>
      </div>
      <div className="flex h-10 items-center justify-between border-t border-nav-line bg-card px-4" data-testid="header-utilities">
        {showReset ? (
          <button type="button" onClick={onReset} className={UTILITY} data-testid="header-reset">
            <RotateCcw size={15} className="text-accent" aria-hidden="true" /> {HEADER.reset}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="flex items-center gap-1">
          <button type="button" onClick={copy} className={UTILITY} aria-label={copied ? HEADER.shared : "Copy the link to this view"} data-testid="header-share">
            <Share2 size={15} className="text-muted" aria-hidden="true" /> {copied ? HEADER.shared : HEADER.share}
          </button>
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          <Link href="/downloads" className={UTILITY} data-testid="header-download">
            <Download size={15} className="text-muted" aria-hidden="true" /> {HEADER.download}
          </Link>
        </div>
      </div>
    </header>
  );
}
