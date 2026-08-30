"use client";
/**
 * "Where emissions come from": the five largest sectors of the view's year (the same
 * `query_emissions` grouped by sector_id, ordered by value desc, that the Map page's context
 * panel makes), each as name · bar · `display_short`; the bars are sized by the cells' `value`
 * and nothing else. The caption reads the top cell's `share_pct_short` (a server string;
 * absent, the caption carries no share). Selecting a sector opens a plain-language panel: the
 * method registry row of the sector's first source stream (`get_evidence` -> ipcc_category ->
 * `get_method`: its notes, tier and equation), the evidence classes its streams carry, and a
 * link to the Map filtered to it.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies } from "@/lib/requests";
import { useEmissions, useEvidence, useMethod } from "@/lib/queries";
import { cellUnit, configWords, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell } from "@/lib/envelope";
import { hrefForState } from "@/lib/urlState";
import { sectorColor } from "@/lib/palette";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { SECTORS_CARD } from "./copy";

export const TOP_N = 5;

/** "Agriculture accounts for 49.4% of the reference estimate." from the top cell's `share_pct_short`; "" when the server sent none. */
export function shareSentence(top: (Cell & { share_pct_short?: string }) | undefined, sectorName: string, estimateWords: string): string {
  if (!top?.share_pct_short) return "";
  return `${sectorName} accounts for ${top.share_pct_short}% of the ${estimateWords}.`;
}

export function SectorsCard() {
  const { state, labels, defaults } = useExplorer();
  // the whole year's sectors, whatever sector the view has chosen
  const body = useMemo(() => contextBodies({ ...state, sector: null }, null).bySector, [state]);
  const bySector = useEmissions(body);
  const [selected, setSelected] = useState<string | null>(null);
  const env = bySector.data;
  const cells = (env?.values ?? []).filter((c) => typeof c.value === "number").slice(0, TOP_N) as (Cell & { share_pct_short?: string })[];
  const max = cells.reduce((m, c) => Math.max(m, c.value as number), 0);
  const top = cells[0];
  const topId = top?.group?.sector_id ?? null;
  const caption = [shareSentence(top, sectorLabel(labels, topId), `${configWords(labels, state.config)}`), SECTORS_CARD.explain].filter(Boolean).join(" ");
  return (
    <section className="card flex flex-col p-5" data-testid="sectors-card">
      <h2 className="text-md font-semibold">{SECTORS_CARD.title}</h2>
      <div className="text-xs text-muted">
        {periodShort(labels, state.period)} · {env?.values[0] ? cellUnit(env.values[0]) : ""} · select a sector to explain
      </div>
      {env ? (
        <ul className="mt-4 space-y-2" data-testid="sector-list">
          {cells.map((c) => {
            const id = c.group?.sector_id ?? "";
            const on = selected === id;
            return (
              <li key={id}>
                <button type="button" onClick={() => setSelected(on ? null : id)} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left text-sm hover:bg-surface-3 ${on ? "bg-surface-3" : ""}`} data-testid="sector-row" data-sector={id}>
                  <span className="w-24 shrink-0 truncate text-fg">{sectorLabel(labels, id)}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-surface-3">
                    <span className="block h-full rounded-sm" style={{ width: `${max > 0 ? ((c.value as number) / max) * 100 : 0}%`, background: sectorColor(id) }} aria-hidden="true" />
                  </span>
                  <span className="num w-16 shrink-0 text-right text-fg" title={`${c.display} ${c.unit} (contract precision)`}>{shown(c)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : bySector.error ? (
        <div className="mt-3"><RefusalCard error={bySector.error} compact /></div>
      ) : (
        <div className="mt-3"><Loading what="the sectors" /></div>
      )}
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="text-xs text-muted" data-testid="sector-caption">{caption}</p>
        <Link href="/explore" className="shrink-0 text-xs text-accent hover:underline" data-testid="sectors-link">{SECTORS_CARD.link}</Link>
      </div>
      {selected && <SectorExplain sector={selected} href={hrefForState({ ...state, sector: selected }, defaults, "/map")} />}
      {env && <ReceiptFooter env={env} className="mt-3 border-t border-line pt-2" />}
    </section>
  );
}

function SectorExplain({ sector, href }: { sector: string; href: string }) {
  const { labels } = useExplorer();
  const streams = useEvidence("_", { module: sector });
  const rows = (streams.data?.values ?? []) as (Cell & { ipcc_category?: string; evidence_class?: string })[];
  const category = rows[0]?.ipcc_category ?? "";
  const method = useMethod(category, !!category);
  const classes = Array.from(new Set(rows.map((r) => r.evidence_class).filter((c): c is string => !!c))).sort();
  const m = method.data?.values[0] as (Cell & { notes?: string; tier?: string; equation?: string; category?: string }) | undefined;
  return (
    <div className="mt-3 rounded-card border border-line bg-surface-3 p-3 text-sm" data-testid="sector-explain" data-sector={sector}>
      <div className="font-semibold text-fg">{sectorLabel(labels, sector)}</div>
      {m ? (
        <p className="mt-1 text-fg" data-testid="sector-method">
          {m.category ? <span className="text-muted">{m.category}: </span> : null}
          {m.notes || m.display}
          {m.equation ? <span className="text-muted"> ({m.equation}{m.tier ? `, tier ${m.tier}` : ""})</span> : null}
        </p>
      ) : method.error ? (
        <div className="mt-1"><RefusalCard error={method.error} compact /></div>
      ) : streams.error ? (
        <div className="mt-1"><RefusalCard error={streams.error} compact /></div>
      ) : (
        <div className="mt-1"><Loading what="the method" /></div>
      )}
      {classes.length > 0 && (
        <p className="mt-1 text-xs text-muted" data-testid="sector-evidence">
          Evidence class {classes.join(", ")} across {String(rows.length)} source {rows.length === 1 ? "stream" : "streams"}; the grade names the activity evidence behind each stream.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <Link href={href} className="flex items-center gap-1 text-accent hover:underline" data-testid="sector-map-link">
          <MapPin size={12} /> Show on map
        </Link>
        <Link href="/methods" className="text-accent hover:underline">Methods &amp; evidence →</Link>
      </div>
      {method.data && <ReceiptFooter env={method.data} className="mt-2" />}
    </div>
  );
}
