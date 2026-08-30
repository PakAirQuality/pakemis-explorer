"use client";
/**
 * The evidence behind a district's allocation — the map drawer's Evidence tab, absorbed into the
 * deck on 2026-08-30. The envelope's own spatial fields for the selected shape (`spatial_class`
 * and its basis, `dominant_stream`, `placement_class` on its `allocation_surface`,
 * `allocation_status`), then the allocation statuses and absence reasons of its lineage rows
 * counted as they arrive, and last the release's placement vocabulary with its class
 * definitions, so a reader can tell a district placed on native geometry from one spread over a
 * proxy surface. The lineage is this card's own query (`useLineage`), gated by the card's switch.
 */
import { useExplorer } from "@/components/ExplorerContext";
import type { Deck } from "@/lib/queries";
import { useLineage } from "@/lib/queries";
import { streamLabel } from "@/lib/labels";
import { SPATIAL_CLASSES, statusWords } from "@/components/map/layerModes";
import { EVIDENCE_CLASS_TEXT, evidenceClassText } from "@/components/methods/evidenceClassText";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { EVIDENCE } from "@/components/overview/copy";
import { DeckCard, Pending } from "./DeckCard";

export function EvidenceCard({ id, deck, title, open, onToggle }: { id: string; deck: Deck; title: string; open: boolean; onToggle: (open: boolean) => void }) {
  const { labels } = useExplorer();
  const lineage = useLineage(deck.bodies.lineage, open && !!deck.bodies.lineage);
  const env = deck.total.data;
  const cell = (env?.values[0] ?? {}) as Record<string, unknown>;
  const spatialClass = typeof cell.spatial_class === "string" ? cell.spatial_class : "";
  const rows = lineage.data?.values ?? [];
  const count = (key: string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = String((r as Record<string, unknown>)[key] ?? "");
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };
  return (
    <DeckCard id={id} title={title} env={env} open={open} onToggle={onToggle} caption="The release's own placement fields for this shape">
      <div className="space-y-4 text-sm">
        <section data-testid="evidence-fields">
          <h3 className="micro mb-1">{EVIDENCE.fields}</h3>
          {env ? (
            spatialClass ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">{EVIDENCE.class}</dt>
                <dd className="text-fg">{evidenceClassText(spatialClass)}</dd>
                <dt className="text-muted">{EVIDENCE.basis}</dt>
                <dd className="text-muted">{String(cell.spatial_class_basis ?? "")}</dd>
                <dt className="text-muted">{EVIDENCE.stream}</dt>
                <dd className="text-fg">{typeof cell.dominant_stream === "string" ? streamLabel(labels, cell.dominant_stream) : ""}</dd>
                <dt className="text-muted">{EVIDENCE.placement}</dt>
                <dd className="text-fg">
                  {statusWords(String(cell.placement_class ?? ""))}
                  {cell.allocation_surface ? <span className="text-muted"> on {String(cell.allocation_surface)}</span> : null}
                </dd>
                <dt className="text-muted">{EVIDENCE.allocation}</dt>
                <dd className="text-fg">{statusWords(String(cell.allocation_status ?? ""))}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted">{EVIDENCE.none}</p>
            )
          ) : (
            <Pending q={deck.total} what="the district envelope" />
          )}
        </section>
        <section data-testid="evidence-lineage">
          <h3 className="micro mb-1">{EVIDENCE.lineage}</h3>
          {lineage.data ? (
            <>
              <ul className="space-y-0.5 text-xs">
                {count("allocation_status").map(([k, n]) => (
                  <li key={k}>
                    <span className="text-fg">{statusWords(k)}</span> <span className="text-muted">· {n} rows</span>
                  </li>
                ))}
              </ul>
              {count("absence_reason").length > 0 && (
                <>
                  <h4 className="micro mb-1 mt-2">{EVIDENCE.fallbacks}</h4>
                  <ul className="space-y-0.5 text-xs">
                    {count("absence_reason").map(([k, n]) => (
                      <li key={k}>
                        <span className="text-fg">{statusWords(k)}</span> <span className="text-muted">· {n} rows</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <ReceiptFooter env={lineage.data} className="mt-1" />
            </>
          ) : (
            <Pending q={lineage} what="the lineage" />
          )}
        </section>
        <section data-testid="class-definitions">
          <h3 className="micro mb-1">{EVIDENCE.classes}</h3>
          <ul className="space-y-1 text-xs">
            {SPATIAL_CLASSES.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <span className="mt-0.5 inline-block h-3 w-4 shrink-0 rounded-sm border border-line-strong" style={{ background: c.color }} />
                <span>
                  <span className="font-semibold text-fg">{c.id}</span> <span className="text-muted">— {EVIDENCE_CLASS_TEXT[c.id]?.definition}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DeckCard>
  );
}
