"use client";
/**
 * Where a district's number came from — the map drawer's Sources tab, absorbed into the deck on
 * 2026-08-30: the lineage rows the release joins to reach this shape (sector × gas × month ×
 * view, one month so the table stays readable), the provenance tables of the district envelope
 * with their digests, and the release itself, whose manifest and citation live on /downloads.
 * Nothing here is derived: every path, digest and receipt is a field of the envelope as received.
 */
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { useLineage } from "@/lib/queries";
import { monthLabel } from "@/lib/labels";
import { Frame } from "@/components/ui/Frame";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { SOURCES } from "@/components/overview/copy";
import { DeckCard, Pending } from "./DeckCard";

type Prov = { tables?: { table?: string; path: string; sha256: string | null }[] };

export function SourcesCard({ id, deck, title, open, onToggle }: { id: string; deck: Deck; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { labels, dims } = useExplorer();
  const lineage = useLineage(deck.bodies.lineage, open && !!deck.bodies.lineage);
  const env = deck.total.data;
  const prov = (env?.provenance ?? {}) as Prov;
  const month = deck.bodies.lineage?.params.month;
  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} caption="Every table above is hashed in the release manifest">
      <div className="space-y-4 text-sm">
        <Frame title={SOURCES.lineage} scope={`sector × gas × month × view${month ? ` · ${monthLabel(labels, month)}` : ""}`} env={lineage.data} error={lineage.error} isLoading={lineage.isLoading} labels={labels} dims={dims} maxRows={8} tableExtra={["module", "gas", "month", "spatial_view", "allocation_status"]} defaultTab="table" flat />
        <section data-testid="provenance">
          <h3 className="micro mb-1">{SOURCES.product}</h3>
          {env ? (
            <ul className="space-y-1 text-xs">
              {(prov.tables ?? []).map((t) => (
                <li key={t.path} className="break-all text-muted">
                  <span className="mono text-fg">{t.table ?? t.path}</span>
                  {t.table ? ` · ${t.path}` : ""}
                  {t.sha256 ? <span className="mono"> · {t.sha256.slice(0, 12)}</span> : null}
                </li>
              ))}
              {!(prov.tables ?? []).length && <li className="text-muted">{SOURCES.noTables}</li>}
            </ul>
          ) : (
            <Pending q={deck.total} what="the envelope" />
          )}
          {env && <ReceiptFooter env={env} className="mt-1" />}
        </section>
        <section data-testid="release-identity">
          <h3 className="micro mb-1">{SOURCES.release}</h3>
          <p className="text-xs text-muted">
            {SOURCES.releaseLine}{" "}
            <Link href="/downloads" className="text-accent underline">
              Downloads
            </Link>
            .
          </p>
        </section>
      </div>
    </DeckCard>
  );
}
