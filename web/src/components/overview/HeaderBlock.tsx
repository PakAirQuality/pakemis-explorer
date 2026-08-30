"use client";
/**
 * The header block (the logo lives in the nav only): the eyebrow, the title (Pakistan, or the selected province), the
 * "Select a province" dropdown (the ADM1 rows of the release's dims; choosing one writes `geo`
 * and every widget re-scopes, the map flies there) and the Share (copies the URL) · Download
 * (-> /downloads) toolbar.
 */
import { useState } from "react";
import Link from "next/link";
import { Download, Link2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { ACTION_CLASS } from "@/components/shell/PageHeader";
import { HEADER } from "./copy";

export function HeaderBlock({ geo, place, onGeo }: { geo: string | null; place: string; onGeo: (name: string | null) => void }) {
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
    <header data-testid="header-block">
      <div className="micro text-accent" data-testid="eyebrow">{HEADER.eyebrow}</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg" data-testid="place-title">{place}</h1>
          <label className="mt-3 block">
            <span className="micro mb-1 block">{HEADER.selectProvince}</span>
            <select className={`${SELECT_CLASS} w-auto min-w-[220px]`} value={geo ?? ""} onChange={(e) => onGeo(e.target.value || null)} aria-label={HEADER.selectProvince} data-testid="province-select">
              <option value="">{HEADER.allProvinces}</option>
              {dims.adm1.map((r) => (
                <option key={r.geography_id} value={r.name}>{labels.geographies[r.geography_id] ?? r.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex shrink-0 items-center gap-2" data-testid="header-toolbar">
          <button type="button" onClick={copy} className={ACTION_CLASS} aria-label={copied ? HEADER.shared : "Copy the link to this briefing"} data-testid="header-share">
            <Link2 size={15} aria-hidden="true" /> {copied ? HEADER.shared : HEADER.share}
          </button>
          <Link href="/downloads" className={ACTION_CLASS} data-testid="header-download">
            <Download size={15} aria-hidden="true" /> {HEADER.download}
          </Link>
        </div>
      </div>
    </header>
  );
}
