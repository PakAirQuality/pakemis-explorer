"use client";
/**
 * The WHAT CHANGED card, the mockup's balance: roughly a third PLAIN-LANGUAGE
 * EXPLAINER beside two-thirds chart. The chart stays at SECTOR grain; clicking a bar
 * SELECTS it - the bar highlights and the explainer re-tells that sector's own story
 * (its category steps, its envelope, the door to its method) - clicking again, or
 * "Overall change", returns to the national story. The explainer never says WHY: the
 * release has subsector deltas but no year-by-year activity data, so it says what
 * changed and where it is concentrated, and its fractions are coarse verbal bands
 * (the server's own share_phrase idea), never computed digits. Every printed number
 * is a server string.
 */
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { useCompare, useNationalSeries, useUncertainty } from "@/lib/queries";
import { cellUnit, periodShort, SECTOR_VIEW_GROUP_KEY, viewSectorLabel, viewSectorShortLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { type Cell } from "@/lib/envelope";
import { WaterfallChart, type WaterfallStep } from "@/components/charts/WaterfallChart";
import { ANALYZE, fractionWords, midSentence, nameList } from "./copy";
import { AnalysisCard, InfoStrip } from "./Section";
import type { AnalyzeSettings } from "./Analyze";

type Side = { display_short?: string; value?: number | null; unit?: string; unit_short?: string; group?: Record<string, string | null> };
export const side = (c: Cell, which: "left" | "right") => (c as unknown as Record<string, Side | undefined>)[which];
export const signed = (c: Cell) => ((c.value ?? 0) > 0 ? `+${c.display_short ?? c.display}` : (c.display_short ?? c.display));
/** The server's printed magnitude after a verb that already carries the sign ("cut 11.69", never "cut -11.69"). */
export const magnitude = (c: Cell) => (c.display_short ?? c.display ?? "").replace(/^[-−+]/, "");

/** The compare's aligned delta cells (misaligned pairs dropped - the engine zips by
 * position; found 2026-09-09), sorted by magnitude. */
export function alignedDeltas(cells: Cell[] | undefined, groupKey: string) {
  return (cells ?? [])
    .filter((c) => typeof c.value === "number")
    .filter((c) => {
      const l = side(c, "left")?.group?.[groupKey];
      const r = side(c, "right")?.group?.[groupKey];
      return l != null && l === r;
    })
    .map((c) => ({ c, id: String(side(c, "left")?.group?.[groupKey] ?? "") }))
    .sort((a, b) => Math.abs(b.c.value as number) - Math.abs(a.c.value as number));
}

type Delta = ReturnType<typeof alignedDeltas>[number];

/** The dynamic first line: "Most of the rise came from agriculture." and its
 * variants - sign and ratio are compared, never printed. */
function headlineOf(top: Delta | undefined, totalValue: number | undefined, name: string): string {
  if (!top || typeof totalValue !== "number" || totalValue === 0) return ANALYZE.change.loading;
  const d = top.c.value as number;
  const riseWord = totalValue > 0 ? "rise" : "reduction";
  if ((d >= 0) === (totalValue > 0)) {
    return Math.abs(d) > Math.abs(totalValue) / 2
      ? `Most of the ${riseWord} came from ${midSentence(name)}.`
      : `${name} made the largest contribution to the ${riseWord}.`;
  }
  return `${name} made the largest contribution to the change.`;
}

/** "Power, IPPU and waste also increased. Declines in industry and transport offset
 * part of that growth, but not enough to reverse it." */
function othersSentence(deltas: Delta[], topId: string, rising: boolean, nameOf: (id: string) => string): string | null {
  const same = deltas.filter((d) => d.id !== topId && ((d.c.value as number) >= 0) === rising).map((d) => nameOf(d.id));
  const opposite = deltas.filter((d) => ((d.c.value as number) >= 0) !== rising).map((d) => nameOf(d.id));
  const parts: string[] = [];
  if (same.length) parts.push(`${nameList(same.slice(0, 4)).replace(/^./, (ch) => ch.toUpperCase())} also ${rising ? "increased" : "decreased"}.`);
  if (opposite.length) parts.push(`${rising ? "Declines" : "Increases"} in ${nameList(opposite.slice(0, 3))} offset part of that ${rising ? "growth" : "decline"}, but not enough to reverse it.`);
  return parts.length ? parts.join(" ") : null;
}

export function ChangeSection({ settings, selected, onSelect }: { settings: AnalyzeSettings; selected: string | null; onSelect: (id: string | null) => void }) {
  const { labels } = useExplorer();
  const { from: fromP, to: toP, gases, view } = settings;
  const chartRef = useRef<HTMLDivElement>(null);

  const gasFilter = gases ? { gases } : {};
  const enabled = !!fromP && !!toP && fromP !== toP;
  // the grouping key: the module that computed the atoms (IPCC) or what the code says the
  // activity is (economic) - the same atoms either way, the server's derived key for the latter
  const groupKey = SECTOR_VIEW_GROUP_KEY[view];
  // drilling into a bar: a module filters by sector_id; the economic 'industrial' aggregate is
  // not a module, so it filters by the IPCC codes that define it (1.A.2 exact or its children,
  // and every 2.x process category) - the engine's own prefix rule
  const drillFilter = (id: string) => (view === "economic" && id === "industrial" ? { ipcc_codes: ["1.A.2", "2"] } : { sectors: [id] });
  const total = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "absolute" }, enabled);
  const relative = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "relative" }, enabled);
  const cmp = useCompare({ left: { periods: [fromP], group_by: [groupKey], ...gasFilter }, right: { periods: [toP], group_by: [groupKey], ...gasFilter }, mode: "absolute" }, enabled);
  const catCmp = useCompare(
    selected
      ? { left: { periods: [fromP], group_by: ["category"], ...drillFilter(selected), ...gasFilter }, right: { periods: [toP], group_by: ["category"], ...drillFilter(selected), ...gasFilter }, mode: "absolute" }
      : null,
    enabled && !!selected,
  );
  const envs = useUncertainty({ scope: "categories", resolution: "annual_national" }, !!selected);
  const series = useNationalSeries();

  const totalCell = total.data?.values[0];
  const relCell = relative.data?.values[0];
  const tLeft = totalCell ? side(totalCell, "left") : undefined;
  const tRight = totalCell ? side(totalCell, "right") : undefined;
  const deltas = alignedDeltas(cmp.data?.values, groupKey);
  // the FULL label where there is room (eyebrow, bar title), the SHORT one mid-sentence and on the axis
  const nameOf = (id: string) => viewSectorLabel(labels, view, id);
  const shortOf = (id: string) => viewSectorShortLabel(labels, view, id);
  // 2026-09-11: the industry module is direct industrial fuel use, covered sources only, and its
  // coal series is under reconciliation; the economic view's industrial aggregate is the covered
  // direct boundary. The server's limitation strings are preferred (they land with the next
  // release payload); until then the same wording is authored in copy.ts - words only, no number.
  // a contract limitation is worded as a clause ("the industry (1.A.2) series is ..."); read on its
  // own or after another note it must stand as a sentence
  const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s.trim()) ? "" : "."}`;
  const industryNote = sentence(labels.limitations.industry_reported_fuel_series ?? ANALYZE.change.industryCaveat);
  const economicNote = sentence(labels.limitations.economic_sector_view ?? ANALYZE.change.economicNote);
  const moreNote = view === "economic" ? `${economicNote} ${industryNote}` : industryNote;
  const caveatFor = (id: string | null) =>
    view === "ipcc" && id === "industry" ? industryNote : view === "economic" && id === "industrial" ? `${economicNote} ${industryNote}` : null;
  // the method pages are per MODULE; the economic aggregate's door is the industry module's
  const methodsSector = (id: string) => (id === "industrial" ? "industry" : id);
  const unit = tLeft ? cellUnit(tLeft as Cell) : "Mt CO₂e";
  const mag = tLeft ? magnitudeOf(tLeft as Cell) : "Mt";
  const rising = (totalCell?.value ?? 0) >= 0;

  const steps: WaterfallStep[] = [];
  if (totalCell && tLeft && tRight) {
    steps.push({ id: "start", name: periodShort(labels, fromP), value: (tLeft.value as number) ?? 0, label: tLeft.display_short ?? "", kind: "start" });
    for (const { c, id } of deltas) steps.push({ id, name: nameOf(id), shortName: shortOf(id), value: c.value as number, label: signed(c), kind: "delta" });
    steps.push({ id: "end", name: periodShort(labels, toP), value: (tRight.value as number) ?? 0, label: tRight.display_short ?? "", kind: "end" });
  }
  const top = deltas[0];

  const download = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pakemis-change-${fromP}-${toP}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // --- the explainer's two stories ------------------------------------------------

  const explainer = (() => {
    if (!totalCell || !tLeft || !tRight || !top) {
      return <p className="text-sm text-muted">{ANALYZE.change.loading}</p>;
    }
    if (selected) {
      const step = deltas.find((d) => d.id === selected)?.c ?? null;
      const stepRising = (step?.value ?? 0) >= 0;
      const catDeltas = alignedDeltas(catCmp.data?.values, "category");
      const sameSign = catDeltas.filter(({ c }) => ((c.value as number) >= 0) === stepRising);
      const [cat1, cat2] = sameSign;
      const envRow = (envs.data?.values ?? [])
        .map((c) => c as Cell & { category?: string; module?: string; envelope?: { low_pct?: string; high_pct?: string } })
        .find((c) => c.module === selected && c.category === cat1?.id);
      const frac = step && cat1 ? fractionWords(cat1.c.value as number, step.value as number) : null;
      const catOthers = othersSentence(catDeltas, cat1?.id ?? "", stepRising, (id) => id);
      return (
        <>
          <div className="text-xs font-semibold text-accent" data-testid="explainer-eyebrow">
            <span className="uppercase tracking-[0.08em]">{nameOf(selected)}</span>
            {step ? <> · <span className="num">{signed(step)} {unit}</span></> : null}
          </div>
          <h3 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-fg" data-testid="explainer-headline">
            {cat1 && step ? headlineOf(cat1, step.value as number, cat1.id) : ANALYZE.change.loading}
          </h3>
          {cat1 && step && (
            <p className="mt-2.5 text-sm leading-relaxed text-fg/85" data-testid="explainer-para">
              {shortOf(selected)}&apos;s estimated emissions {stepRising ? "rose" : "fell"} by{" "}
              <b className="num whitespace-nowrap">{magnitude(step)} {unit}</b>. {cat1.id} {(cat1.c.value as number) >= 0 ? "added" : "cut"}{" "}
              <b className="num whitespace-nowrap">{magnitude(cat1.c)} {mag}</b>
              {frac ? <> — {frac} of the sector&apos;s {stepRising ? "increase" : "decrease"}</> : null}.
              {cat2 ? <> {cat2.id} followed at <b className="num whitespace-nowrap">{signed(cat2.c)} {mag}</b>.</> : null}
            </p>
          )}
          {catOthers && <p className="mt-2 text-sm leading-relaxed text-fg/85" data-testid="explainer-para2">{catOthers}</p>}
          {step && (
            <div className="mt-3.5 rounded-xl bg-surface px-4 py-3" data-testid="explainer-stat">
              <div className="num text-2xl font-semibold tracking-tight text-accent">{signed(step)} {unit}</div>
              <div className="mt-0.5 text-sm text-muted">
                {midSentence(shortOf(selected))}&apos;s net {stepRising ? "increase" : "decrease"}
                {envRow?.envelope?.low_pct ? <> · envelope <span className="num">{envRow.envelope.low_pct} / +{envRow.envelope.high_pct} %</span></> : null}
              </div>
            </div>
          )}
          {caveatFor(selected) && (
            <p className="mt-3 rounded-lg bg-amber/15 px-3 py-2 text-[11px] leading-relaxed text-fg/80" data-testid="explainer-industry-caveat">{caveatFor(selected)}</p>
          )}
          <Link href={`/methods/sectors/${methodsSector(selected)}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline" data-testid="explainer-methods">
            {ANALYZE.explainer.methods} <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <div className="mt-3 border-t border-line/70 pt-2.5">
            <button type="button" onClick={() => onSelect(null)} className="text-sm font-medium text-accent hover:underline" data-testid="explainer-overall">
              {ANALYZE.change.overallBack}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted/90" data-testid="explainer-footer">{ANALYZE.explainer.footer}</p>
        </>
      );
    }
    const topName = shortOf(top.id);
    const frac = fractionWords(top.c.value as number, totalCell.value as number);
    const others = othersSentence(deltas, top.id, rising, shortOf);
    return (
      <>
        <div className="micro text-accent">{ANALYZE.change.plainLanguage}</div>
        <h3 className="mt-2 text-[21px] font-semibold leading-snug tracking-tight text-fg" data-testid="explainer-headline">
          {headlineOf(top, totalCell.value as number, topName)}
        </h3>
        <p className="mt-2.5 text-sm leading-relaxed text-fg/85" data-testid="explainer-para">
          Pakistan&apos;s estimated emissions {rising ? "rose" : "fell"} from <b className="num whitespace-nowrap">{tLeft.display_short}</b> to{" "}
          <b className="num whitespace-nowrap">{tRight.display_short} {unit}</b>. {topName} {(top.c.value as number) >= 0 ? "added" : "cut"}{" "}
          <b className="num whitespace-nowrap">{magnitude(top.c)} {mag}</b>
          {frac && ((top.c.value as number) >= 0) === rising ? <> — {frac} of the net {rising ? "increase" : "decrease"}</> : null}.
        </p>
        {others && <p className="mt-2 text-sm leading-relaxed text-fg/85" data-testid="explainer-para2">{others}</p>}
        <div className="mt-3.5 rounded-xl bg-surface px-4 py-3" data-testid="explainer-stat">
          <div className="num text-[26px] font-semibold tracking-tight text-accent">{signed(totalCell)} {unit}</div>
          <div className="mt-0.5 text-sm text-muted">
            net {rising ? "increase" : "decrease"}{relCell ? <> · <span className="num">{signed(relCell)}%</span></> : null}
          </div>
        </div>
        <button type="button" onClick={() => onSelect(top.id)} className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline" data-testid="explainer-sector-link">
          What changed within {midSentence(topName)}? <ArrowRight size={14} aria-hidden="true" />
        </button>
        <p className="mt-3 border-t border-line/70 pt-2.5 text-xs text-muted" data-testid="explainer-hint">{ANALYZE.change.selectHint}</p>
      </>
    );
  })();

  return (
    <AnalysisCard
      id="change"
      eyebrow={<span className="rounded bg-amber/25 px-1.5 py-0.5">{periodShort(labels, fromP)} to {periodShort(labels, toP)}</span>}
      title={ANALYZE.change.title}
      more={moreNote}
      action={
        <button type="button" onClick={download} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft" data-testid="change-download">
          <Download size={14} aria-hidden="true" /> {ANALYZE.change.download}
        </button>
      }
    >
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(280px,34fr)_minmax(0,66fr)]">
        <aside className="relative overflow-hidden rounded-xl bg-nav/60 p-5 pl-6" data-testid="change-explainer">
          <span className="absolute inset-y-0 left-0 w-1 bg-brand-gold" aria-hidden="true" />
          {explainer}
        </aside>
        <div className="rounded-xl border border-line p-4" data-testid="change-chart-panel">
          <div className="micro mb-1">{ANALYZE.change.sectorContributions}</div>
          <div ref={chartRef}>
            {steps.length > 2 ? (
              <WaterfallChart
                steps={steps}
                unit={unit}
                ticks={series.data?.axis?.ticks_short}
                selected={selected}
                onPick={(id) => onSelect(selected === id ? null : id)}
                testId="change-waterfall"
              />
            ) : (
              <p className="py-10 text-sm text-muted" data-testid="change-pending">{cmp.isError ? "The release refuses this comparison." : "Comparing…"}</p>
            )}
          </div>
        </div>
      </div>

      <InfoStrip>{ANALYZE.change.caution}</InfoStrip>
    </AnalysisCard>
  );
}
