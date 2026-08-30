"use client";
/**
 * The legend of the current layer: the magnitude legend (Legend.tsx, the envelope's own
 * displays), or a categorical legend of the layer's classes with their definitions (spatial
 * evidence, allocation method), the province rows of the unallocated layer (the server's
 * `unallocated_short`), or the exception kinds with a side list naming each exception from
 * the release's registers. Every legend ends with the layer's one sentence.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Envelope } from "@/lib/envelope";
import type { Residual } from "@/lib/geography";
import type { ExplorerState } from "@/lib/urlState";
import { NO_CELL, rampColor } from "@/lib/palette";
import { cellUnit } from "@/lib/labels";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { Legend } from "./Legend";
import type { CellIndex, UnallocatedIndex } from "./paint";
import type { RasterInfo } from "./tiles";
import { ALLOCATION_STATUSES, categoriesOf, categoryOf, diffusePlacement, EXCEPTION_KINDS, LAYERS, NOT_SERVED, SPATIAL_CLASSES, statusWords } from "./layerModes";
import type { ExceptionItem } from "./exceptions";

export type LayerLegendProps = {
  state: ExplorerState;
  scope: string;
  env: Envelope | null | undefined;
  index: CellIndex | null;
  error: unknown;
  isLoading: boolean;
  raster: RasterInfo | undefined;
  hasCells: boolean;
  shared: (Residual & { cell: Envelope["values"][number] }) | null;
  unallocated: { env: Envelope | null | undefined; index: UnallocatedIndex | null; error: unknown; isLoading: boolean };
  exceptions: { present: Set<string>; items: ExceptionItem[] };
};

function Sentence({ layer }: { layer: ExplorerState["layer"] }) {
  return <p className="border-t border-line/70 px-3 py-1.5 text-micro normal-case tracking-normal text-muted" data-testid="layer-sentence">{LAYERS[layer].sentence}</p>;
}

export function LayerLegend(p: LayerLegendProps) {
  const { state, env, index, error, isLoading } = p;
  const layer = state.layer;
  if (layer === "magnitude") {
    return (
      <div data-testid="layer-legend" data-layer={layer} className="w-[272px]">
        <Legend state={state} scope={p.scope} env={env} index={index} error={error} isLoading={isLoading} raster={p.raster} rasterOn={state.raster} hasCells={p.hasCells} shared={p.shared} />
        <div className="glass mt-1 rounded-card"><Sentence layer={layer} /></div>
      </div>
    );
  }
  return (
    <div className="glass w-[300px] max-h-[calc(100vh-280px)] overflow-y-auto rounded-card text-xs" data-testid="layer-legend" data-layer={layer}>
      <div className="px-3 pt-2">
        <div className="micro">{LAYERS[layer].label}</div>
        <div className="truncate text-xs text-fg" title={p.scope}>{p.scope}</div>
      </div>
      {state.level === "grid" ? (
        <p className="px-3 pb-2 pt-1 text-muted">This layer paints provinces and districts, not the grid raster.</p>
      ) : layer === "unallocated" ? (
        <UnallocatedRows {...p.unallocated} />
      ) : error ? (
        <div className="px-2 pb-2 pt-1"><RefusalCard error={error} compact /></div>
      ) : env && index ? (
        layer === "exceptions" ? <ExceptionRows present={p.exceptions.present} items={p.exceptions.items} /> : <CategoryRows layer={layer} index={index} />
      ) : isLoading ? (
        <div className="px-3 pb-2 pt-1"><Loading what="the map envelope" /></div>
      ) : null}
      {env && layer !== "unallocated" && <ReceiptFooter env={env} className="border-t border-line/70 px-3 py-1" />}
      {layer === "unallocated" && p.unallocated.env && <ReceiptFooter env={p.unallocated.env} className="border-t border-line/70 px-3 py-1" />}
      <Sentence layer={layer} />
    </div>
  );
}

/** The classes of a categorical layer with how many of the level's cells fall in each (a count of map cells, not an inventory number). */
function CategoryRows({ layer, index }: { layer: "evidence" | "method"; index: CellIndex }) {
  const counts = new Map<string, number>();
  let diffuse = 0;
  for (const c of index.byId.values()) {
    const k = categoryOf(layer, c);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (layer === "method" && diffusePlacement(c)) diffuse += 1;
  }
  const cats = [...categoriesOf(layer), NOT_SERVED].filter((c) => c.id !== NOT_SERVED.id || counts.has(NOT_SERVED.id));
  const served = index.byId.size - (counts.get(NOT_SERVED.id) ?? 0);
  const placements = new Map<string, number>();
  if (layer === "method") for (const c of index.byId.values()) {
    const pc = String((c as Record<string, unknown>).placement_class ?? "");
    if (pc) placements.set(pc, (placements.get(pc) ?? 0) + 1);
  }
  return (
    <div className="px-3 pb-2 pt-1">
      <ul className="space-y-1" data-testid="legend-categories">
        {cats.map((c) => (
          <li key={c.id} className="flex items-start gap-2" title={c.definition} data-testid="legend-category" data-id={c.id}>
            <span className="mt-0.5 inline-block h-3 w-5 shrink-0 rounded-sm border border-line-strong" style={{ background: c.color }} />
            <span className="min-w-0 flex-1">
              <span className="text-fg">{c.label}</span>
              {counts.has(c.id) && <span className="ml-1 text-muted">· {counts.get(c.id)} {counts.get(c.id) === 1 ? "district" : "districts"}</span>}
              {c.definition && <span className="block text-muted">{c.definition}</span>}
            </span>
          </li>
        ))}
        {layer === "method" && (
          <li className="flex items-start gap-2" data-testid="legend-hatch">
            <span className="hatch-swatch mt-0.5 inline-block h-3 w-5 shrink-0 rounded-sm border border-line-strong" style={{ backgroundColor: ALLOCATION_STATUSES[0].color }} />
            <span className="min-w-0 flex-1">
              <span className="text-fg">hatched: placed on a diffuse surface</span>
              {diffuse > 0 && <span className="ml-1 text-muted">· {diffuse} districts</span>}
              {placements.size > 0 && <span className="block text-muted">placement classes: {Array.from(placements.entries()).map(([k, n]) => `${statusWords(k)} (${n})`).join(", ")}</span>}
            </span>
          </li>
        )}
      </ul>
      {served === 0 && <p className="mt-1 text-warn">The served envelope carries no {layer === "evidence" ? "spatial_class" : "allocation_status"} on these cells; nothing is coloured.</p>}
      {layer === "evidence" && <p className="mt-1 text-muted">The class is that of the stream with the largest reference-year mass in the cell&apos;s dominant sector (the envelope&apos;s spatial_fields rule); a district summing several sectors carries one of them.</p>}
    </div>
  );
}

function UnallocatedRows({ env, index, error, isLoading }: LayerLegendProps["unallocated"]) {
  if (error) return <div className="px-2 pb-2 pt-1"><RefusalCard error={error} compact /></div>;
  if (!env || !index) return <div className="px-3 pb-2 pt-1">{isLoading ? <Loading what="the province rows" /> : <span className="text-muted">No province rows.</span>}</div>;
  const rows = Array.from(index.byProvince.entries()).sort((a, b) => Number(b[1].exact) - Number(a[1].exact));
  const u = env.unallocated as { note?: string };
  const d = env.derived as { unallocated_total_short?: string; placed_short?: string } | undefined;
  return (
    <div className="px-3 pb-2 pt-1">
      <ul className="space-y-0.5" data-testid="legend-unallocated">
        {rows.map(([province, r]) => (
          <li key={province} className="flex items-center gap-2" data-testid="legend-province">
            <span className="inline-block h-3 w-5 shrink-0 rounded-sm border border-line-strong" style={{ background: index.max > index.min ? rampColor(Number(r.exact), index.min, index.max) : NO_CELL }} />
            <span className="flex-1 truncate text-fg">{province}</span>
            <span className="num text-fg" title={`exact ${r.exact}`}>{r.short}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 text-muted">{cellUnit(env.values[0])} retained at province level{d?.unallocated_total_short ? <>; <span className="num text-fg">{d.unallocated_total_short}</span> in all{d.placed_short ? <>, <span className="num text-fg">{d.placed_short}</span> placed</> : null}</> : null}.</div>
      {u?.note && <div className="mt-1 text-muted">{u.note}</div>}
    </div>
  );
}

function ExceptionRows({ present, items }: { present: Set<string>; items: ExceptionItem[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="px-3 pb-2 pt-1">
      <ul className="space-y-1" data-testid="legend-exceptions">
        {EXCEPTION_KINDS.map((k) => (
          <li key={k.id} className={`flex items-start gap-2 ${present.has(k.id) ? "" : "opacity-60"}`} title={k.definition} data-testid="legend-category" data-id={k.id}>
            <span className={`mt-0.5 inline-block h-3 w-5 shrink-0 rounded-sm ${k.id === "bounded" ? "hatch-swatch border border-line-strong" : k.id === "no_cell" ? "border-2 border-dashed border-[#d1495b]" : k.id === "other_unit" ? "border-2 border-dotted border-fg/80" : "border-2 border-dashed border-amber-soft"}`} style={{ backgroundColor: k.color }} />
            <span className="min-w-0 flex-1 text-fg">{k.label}{present.has(k.id) ? "" : <span className="text-muted"> · none at this level</span>}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 flex items-center gap-1 text-micro normal-case tracking-normal text-accent" data-testid="exceptions-toggle">
        {items.length} named exceptions {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <ol className="mt-1 max-h-[26vh] space-y-1.5 overflow-y-auto pr-1" data-testid="exceptions-list">
          {items.map((it, i) => (
            <li key={i} className="border-l-2 border-line-strong pl-2" data-kind={it.kind}>
              <div className="font-semibold text-fg">{it.title}</div>
              <div className="text-muted">{it.detail}</div>
              <div className="mono text-micro normal-case tracking-normal text-muted/80">{it.source}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export { SPATIAL_CLASSES };
