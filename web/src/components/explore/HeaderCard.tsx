"use client";
/**
 * The Data page's branded card, the left column's first block: the workspace HeaderBlock's
 * shell — ivory (`--color-nav`), a thin saffron edge along the top, the contour motif — carrying
 * the eyebrow "Pakistan Emissions Data", the current place's name, one line saying what the
 * page does and the Grapher's own geography select (the hero copy of the rail's compact one;
 * both dispatch the same `Action`s through `geographyControl`). The white utility row beneath
 * holds Share (the permalink copied) and Download (the current result's canonical CSV — the
 * same receipt the canvas's Download serves; disabled until an envelope has answered).
 * Nothing here prints a number.
 */
import { useState } from "react";
import { ChevronDown, Download, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import type { Dims as GeoDims } from "@/lib/labels";
import { placeWords, type Action, type ExploreState } from "@/lib/explore/query";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { Select, type SelectOption } from "@/components/ui/ControlsCard";
import { districtOptions, geographyControl } from "./Controls";
import { EXPLORE } from "./copy";

const D = EXPLORE.data;
const W = EXPLORE.controls;
const UTILITY = "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg transition-colors hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-50";
const HERO_SELECT = "h-[42px] w-full cursor-pointer appearance-none rounded-xl border border-line bg-card pl-4 pr-10 text-sm font-medium text-fg shadow-sm outline-none focus:ring-2 focus:ring-accent/40";

export function HeaderCard({ state, dispatch, labels, dims, env }: { state: ExploreState; dispatch: (a: Action) => void; labels: Labels; dims: GeoDims; env: Envelope | null }) {
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const geo = geographyControl(state, labels, dims, dispatch, picking, setPicking);
  const districts = districtOptions(dims);
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
    <header className="relative shrink-0 overflow-hidden rounded-[20px] border border-nav-line bg-nav text-nav-fg shadow-card" data-testid="data-header">
      <div className="h-1 w-full bg-brand-gold" aria-hidden="true" data-testid="data-header-edge" />
      <div className="relative px-6 pb-5 pt-5">
        <ContourMotif />
        <div className="relative">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-accent" data-testid="data-eyebrow">{D.eyebrow}</div>
          <h1 className="mt-1.5 text-[30px] font-semibold leading-tight tracking-tight text-fg" data-testid="data-place-title">{placeWords(state, dims)}</h1>
          <p className="mt-1 text-[13px] text-muted" data-testid="data-header-dek">{D.dek}</p>
          <label className="relative mt-4 block">
            <span className="sr-only">{W.geography}</span>
            <select className={HERO_SELECT} value={geo.value} onChange={(e) => geo.onChange(e.target.value)} aria-label={W.geography} data-testid="place-select">
              {geo.options.map((o: SelectOption) => (
                <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          </label>
          {geo.showDistrict && (
            <div className="mt-3">
              <Select value={state.level === "adm2" ? state.geos[0] ?? "" : ""} onChange={(v) => v && dispatch({ control: "geography", value: "district", id: v })} options={[{ value: "", label: "Choose a district", disabled: true }, ...districts]} ariaLabel="District" testId="district-select" />
            </div>
          )}
          {geo.showSecond && (
            <div className="mt-3">
              <Select value={state.geos[1] ?? ""} onChange={(v) => dispatch({ control: "geography", value: "second", id: v || null })} options={[{ value: "", label: W.second }, ...geo.provinces.filter((p) => p !== state.geos[0]).map((p) => ({ value: p, label: labels.geographies[`ADM1:${p}`] ?? p }))]} ariaLabel={W.second} testId="second-select" />
            </div>
          )}
        </div>
      </div>
      <div className="flex h-11 items-center justify-end gap-1 border-t border-nav-line bg-card px-4" data-testid="data-header-utilities">
        <button type="button" onClick={copy} className={UTILITY} aria-label={copied ? D.shared : "Copy the link to this view"} data-testid="data-header-share">
          <Share2 size={15} className="text-muted" aria-hidden="true" /> {copied ? D.shared : D.share}
        </button>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <a href={env ? api.downloadCsvUrl(env.receipt) : undefined} aria-disabled={!env} className={`${UTILITY} ${env ? "" : "pointer-events-none opacity-50"}`} title="Download the canonical CSV of this result" data-testid="data-header-download">
          <Download size={15} className="text-muted" aria-hidden="true" /> {D.download}
        </a>
      </div>
    </header>
  );
}
