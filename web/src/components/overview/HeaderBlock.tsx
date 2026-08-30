"use client";
/**
 * The place card, the deck's first card. 420 px wide, 20 px radius, a thin saffron edge along
 * its top rather than a flood of yellow: the ivory block (`--color-nav`) carries the eyebrow
 * "Pakistan Emissions Explorer", the place's name, one line saying what the tool does and the
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
import { ChevronDown, Download, RotateCcw, Share2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { HEADER } from "./copy";

const UTILITY = "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg transition-colors hover:bg-accent-soft";
const SELECT_ID = "province-select";

export function HeaderBlock({ geo, place, onGeo, onReset, showReset = false }: { geo: string | null; place: string; onGeo: (name: string | null) => void; onReset: () => void; showReset?: boolean }) {
  const { dims, labels } = useExplorer();
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
      <div className="h-1 w-full bg-brand-gold" aria-hidden="true" data-testid="header-edge" />
      <div className="relative px-6 pb-5 pt-5">
        {/* one wave, a whisper of fine saffron strokes in the top right; no image asset */}
        <svg className="pointer-events-none absolute right-0 top-0 h-32 w-56" viewBox="0 0 224 128" fill="none" preserveAspectRatio="none" aria-hidden="true" data-testid="header-wave">
          {[0, 7, 14, 21, 28, 35, 42].map((d) => (
            <path key={d} d={`M40 ${128 - d} C 96 ${112 - d}, 120 ${52 - d}, 224 ${34 - d}`} stroke="var(--color-brand-gold)" strokeOpacity="0.28" strokeWidth="1" />
          ))}
        </svg>
        <div className="relative">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-accent" data-testid="eyebrow">{HEADER.eyebrow}</div>
          <h1 className="mt-1.5 text-[30px] font-semibold leading-tight tracking-tight text-fg" data-testid="place-title">{place}</h1>
          <p className="mt-1 text-[13px] text-muted" data-testid="header-dek">{HEADER.dek}</p>
          <label className="relative mt-4 block">
            <span className="sr-only">{HEADER.selectProvince}</span>
            <select
              id={SELECT_ID}
              className="h-[42px] w-full cursor-pointer appearance-none rounded-xl border border-line bg-card pl-4 pr-10 text-sm font-medium text-fg shadow-sm outline-none focus:ring-2 focus:ring-accent/40"
              value={geo ?? ""}
              onChange={(e) => onGeo(e.target.value || null)}
              aria-label={HEADER.selectProvince}
              data-testid="province-select"
            >
              <option value="">{HEADER.allProvinces}</option>
              {dims.adm1.map((r) => (
                <option key={r.geography_id} value={r.name}>{labels.geographies[r.geography_id] ?? r.name}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          </label>
        </div>
      </div>
      <div className="flex h-11 items-center justify-between border-t border-nav-line bg-card px-4" data-testid="header-utilities">
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
