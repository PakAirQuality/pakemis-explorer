"use client";
/**
 * The place header card, the deck's first card (Global Mangrove Watch's): a `rounded-3xl` card
 * in the nav capsule's warm ivory (`--color-nav`, so the two brand surfaces match) with a
 * decorative saffron wave across its top (an inline SVG at 16–22 %, no image asset: oxblood there
 * greyed the ivory toward beige, saffron keeps it the capsule's yellow), the eyebrow "Pakistan Emissions Explorer" over the title
 * (Pakistan, or the selected province) and a row of four icon actions with labels beneath:
 * Reset view (clears the scope and the map level), Choose a province (focuses and opens the
 * select below), Share (copies the URL), Download (-> /downloads). Under the icons the
 * province select as a white pill: the ADM1 rows of the release's dims; choosing one writes
 * `geo`, every widget re-scopes and the map flies there. No logo (the nav carries it).
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Link2, MapPin, RotateCcw } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { HEADER } from "./copy";

const ACTION = "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center text-xs font-medium text-fg transition-colors hover:bg-accent-soft";
const ICON = "flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent";
const SELECT_ID = "province-select";

export function HeaderBlock({ geo, place, onGeo, onReset }: { geo: string | null; place: string; onGeo: (name: string | null) => void; onReset: () => void }) {
  const { dims, labels } = useExplorer();
  const [copied, setCopied] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the address bar holds the link */
    }
  };
  const choose = () => {
    const el = selectRef.current;
    if (!el) return;
    el.focus();
    const picker = (el as HTMLSelectElement & { showPicker?: () => void }).showPicker;
    if (typeof picker === "function") {
      try {
        picker.call(el);
      } catch {
        /* a browser without the picker, or outside a user gesture: the focused select opens on Enter or Space */
      }
    }
  };
  return (
    <header className="pointer-events-auto relative shrink-0 overflow-hidden rounded-3xl border border-nav-line bg-nav text-nav-fg shadow-lg" data-testid="header-block">
      <svg className="pointer-events-none absolute inset-x-0 top-0 h-28 w-full" viewBox="0 0 520 112" preserveAspectRatio="none" aria-hidden="true" data-testid="header-wave">
        <path d="M0 58 C 90 14, 170 98, 262 56 S 432 12, 520 58 V0 H0 Z" fill="var(--color-brand-gold)" fillOpacity="0.22" />
        <path d="M0 92 C 110 48, 210 122, 310 86 S 452 40, 520 90 V0 H0 Z" fill="var(--color-brand-gold)" fillOpacity="0.16" />
      </svg>
      <div className="relative p-6">
        <div className="text-micro font-semibold uppercase tracking-[0.06em] text-accent" data-testid="eyebrow">{HEADER.eyebrow}</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg" data-testid="place-title">{place}</h1>
        <p className="mt-1.5 text-sm text-muted" data-testid="header-dek">{HEADER.dek}</p>
        <div className="mt-5 grid grid-cols-4 gap-1" data-testid="header-toolbar">
          <button type="button" onClick={onReset} className={ACTION} data-testid="header-reset">
            <span className={ICON}><RotateCcw size={18} aria-hidden="true" /></span>
            {HEADER.reset}
          </button>
          <button type="button" onClick={choose} className={ACTION} aria-controls={SELECT_ID} data-testid="header-choose">
            <span className={ICON}><MapPin size={18} aria-hidden="true" /></span>
            {HEADER.choose}
          </button>
          <button type="button" onClick={copy} className={ACTION} aria-label={copied ? HEADER.shared : "Copy the link to this briefing"} data-testid="header-share">
            <span className={ICON}><Link2 size={18} aria-hidden="true" /></span>
            {copied ? HEADER.shared : HEADER.share}
          </button>
          <Link href="/downloads" className={ACTION} data-testid="header-download">
            <span className={ICON}><Download size={18} aria-hidden="true" /></span>
            {HEADER.download}
          </Link>
        </div>
        <label className="relative mt-4 block">
          <span className="sr-only">{HEADER.selectProvince}</span>
          <select ref={selectRef} id={SELECT_ID} className="w-full cursor-pointer appearance-none rounded-full border border-line bg-card py-2 pl-4 pr-10 text-sm font-medium text-fg shadow-sm outline-none focus:ring-2 focus:ring-accent/40" value={geo ?? ""} onChange={(e) => onGeo(e.target.value || null)} aria-label={HEADER.selectProvince} data-testid="province-select">
            <option value="">{HEADER.allProvinces}</option>
            {dims.adm1.map((r) => (
              <option key={r.geography_id} value={r.name}>{labels.geographies[r.geography_id] ?? r.name}</option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        </label>
      </div>
    </header>
  );
}
