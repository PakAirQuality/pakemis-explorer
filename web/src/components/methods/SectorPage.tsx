"use client";
/**
 * The focused sector page (/methods/sectors/[sector]), the mockup's own order and NOTHING
 * else: breadcrumb, All sectors, the IPCC eyebrow and title over a one-line plain intro, the
 * pale-yellow result panel (the envelope's total and the partition's share - server strings),
 * the four connected stages, What is included, Evidence at a glance, Not yet estimated, and
 * three actions. After the actions the page ends. Public language throughout: no codes, no
 * counts, no internal vocabulary - the authored layer (sectorText.ts, evidenceClassText.ts)
 * carries the words. "See the sources" opens a small dialog of source names; "Technical
 * method" opens an overlay drawer with the dense technical card (the caller's children),
 * mounted only when opened.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Cog, Droplets, FileText, Flame, Leaf, MapPin, Recycle, ScrollText, Sprout, Wheat, X } from "lucide-react";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { ContourMotif } from "@/components/ui/ContourMotif";

const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const TEXT_LINK = "inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline";

const STEP_TITLES = ["Public records", "What is counted", "How it is estimated", "Result"] as const;
const STEP_ICONS = [<FileText key="1" size={18} aria-hidden="true" />, <Sprout key="2" size={18} aria-hidden="true" />, <Cog key="3" size={18} aria-hidden="true" />, <BarChart3 key="4" size={18} aria-hidden="true" />];
const STEP_3 = "Standard IPCC methods are used to calculate emissions.";
const STEP_4 = "The estimates are added to the national inventory.";

const CHIP_ICONS: [RegExp, typeof Leaf][] = [
  [/livestock|enteric/i, Wheat],
  [/manure/i, Recycle],
  [/rice/i, Sprout],
  [/soil/i, Leaf],
  [/burn|flar/i, Flame],
  [/water|waste/i, Droplets],
];
function chipIcon(label: string): ReactNode {
  const Icon = CHIP_ICONS.find(([re]) => re.test(label))?.[1] ?? Leaf;
  return <Icon size={16} aria-hidden="true" />;
}

export type SectorPageProps = {
  sector: string;
  number: string;
  labels: Labels;
  /** The authored plain intro and the first two stages. */
  dek: string;
  step1: string;
  step2: string;
  /** The sector's total cell and its cell in the national partition (server strings). */
  cell: Cell | null | undefined;
  shareCell: Cell | null | undefined;
  period: string;
  /** Plain lists: readable source names, included-category labels, not-yet-estimated names. */
  sources: string[];
  included: string[];
  gaps: string[];
  /** The three axes as plain sentences. */
  glance: { annual: string; monthly: string; location: string };
  /** The dense technical card, mounted only inside the Technical method drawer. */
  children?: ReactNode;
};

export function SectorPage(p: SectorPageProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [technical, setTechnical] = useState(false);
  const name = sectorLabel(p.labels, p.sector);
  const steps = [p.step1, p.step2, STEP_3, STEP_4];
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-16" data-testid="sector-page" data-sector={p.sector}>
      <nav className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Breadcrumb" data-testid="sector-breadcrumb">
        <Link href="/methods" className="hover:text-fg">Methods</Link> / <Link href="/methods/sectors" className="hover:text-fg">Sectors</Link> / <span className="text-fg">{name}</span>
      </nav>
      <Link href="/methods/sectors" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline" data-testid="all-sectors">
        <ArrowLeft size={14} aria-hidden="true" /> All sectors
      </Link>

      <div className="mt-5 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          {p.number && <div className="micro text-accent">IPCC sector {p.number}</div>}
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-fg" data-testid="sector-title">{name}</h1>
          <p className="mt-3 max-w-[30em] text-lg text-muted" data-testid="sector-dek">{p.dek}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-nav p-6" data-testid="sector-result">
          <ContourMotif corner="bottom-right" />
          <div className="relative">
            {p.cell ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-4xl font-semibold tracking-tight text-fg" data-testid="sector-result-display">{shown(p.cell)}</span>
                  <span className="text-md text-muted">{cellUnit(p.cell)}</span>
                </div>
                <div className="mt-1.5 text-md text-muted">{periodShort(p.labels, p.period)}</div>
                {p.shareCell?.share_pct_short && (
                  <div className="mt-1 text-md font-medium text-fg" data-testid="sector-share">
                    <span className="num">{p.shareCell.share_pct_short} %</span> of the national total
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted">This sector carries no estimated total in the selected view.</div>
            )}
          </div>
        </div>
      </div>

      <section className="mt-12 border-t border-line pt-8" data-testid="sector-steps">
        <h2 className="text-2xl font-semibold tracking-tight text-fg">How this estimate is built</h2>
        <div className="mt-8 flex flex-col gap-6 md:flex-row md:gap-0">
          {STEP_TITLES.map((title, i) => (
            <div key={title} className="flex flex-1 items-start gap-4 md:flex-col md:items-center md:text-center">
              <div className="flex items-center md:w-full">
                {i > 0 && <div className="hidden flex-1 border-t border-accent/30 md:block" aria-hidden="true" />}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">{STEP_ICONS[i]}</div>
                {i < STEP_TITLES.length - 1 && <div className="hidden flex-1 border-t border-accent/30 md:block" aria-hidden="true" />}
                {i === STEP_TITLES.length - 1 && <div className="hidden flex-1 md:block" aria-hidden="true" />}
                {i === 0 && <div className="hidden flex-1 md:block" aria-hidden="true" />}
              </div>
              <div className="md:mt-3">
                <div className="num text-xl font-semibold text-accent">{i + 1}</div>
                <div className="mt-0.5 text-md font-semibold text-fg">{title}</div>
                <p className="mx-auto mt-1 max-w-[15em] text-sm text-muted" data-testid={`sector-step-${i + 1}`}>{steps[i]}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-10 border-t border-line pt-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section data-testid="sector-included">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">What is included</h2>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {p.included.map((c) => (
              <div key={c} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-3.5 py-3 text-sm font-medium text-fg" data-testid="included-chip">
                <span className="text-accent">{chipIcon(c)}</span> {c}
              </div>
            ))}
          </div>
        </section>
        <section data-testid="sector-glance">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Evidence at a glance</h2>
          <dl className="mt-4 space-y-4">
            <GlanceRow icon={<FileText size={15} aria-hidden="true" />} title="Annual estimates" text={p.glance.annual} />
            <GlanceRow icon={<CalendarDays size={15} aria-hidden="true" />} title="Monthly pattern" text={p.glance.monthly} />
            <GlanceRow icon={<MapPin size={15} aria-hidden="true" />} title="Location" text={p.glance.location} />
          </dl>
        </section>
      </div>

      {p.gaps.length > 0 && (
        <div className="mt-10 rounded-lg bg-surface-3 px-5 py-4" data-testid="sector-ne">
          <span className="micro text-accent">Not yet estimated</span>
          <span className="ml-3 text-sm text-muted">{p.gaps.join(" · ")}</span>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3" data-testid="sector-actions">
        <Link href={`/data?sector=${encodeURIComponent(p.sector)}`} className={PRIMARY} data-testid="view-sector-data">
          View {name.toLowerCase()} data
        </Link>
        <button type="button" onClick={() => setSourcesOpen(true)} className={OUTLINE} data-testid="see-sources">
          <ScrollText size={15} aria-hidden="true" /> See the sources
        </button>
        <button type="button" onClick={() => setTechnical(true)} className={TEXT_LINK} data-testid="technical-toggle">
          Technical method <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      {sourcesOpen && (
        <Overlay title="The sources" onClose={() => setSourcesOpen(false)} testId="sources-dialog" narrow>
          <p className="text-sm text-muted">The public records this estimate is built from.</p>
          <ul className="mt-3 space-y-2">
            {p.sources.map((s) => (
              <li key={s} className="rounded-md border border-line bg-surface-3/60 px-3 py-2 text-sm text-fg" data-testid="source-name">{s}</li>
            ))}
          </ul>
        </Overlay>
      )}
      {technical && (
        <Overlay title="Technical method" onClose={() => setTechnical(false)} testId="technical">
          {p.children}
        </Overlay>
      )}
    </div>
  );
}

function GlanceRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-accent">{icon}</div>
      <div>
        <dt className="text-md font-semibold text-fg">{title}</dt>
      <dd className="mt-0.5 text-sm text-muted">{text}</dd>
      </div>
    </div>
  );
}

/** A dismissable overlay (Escape, outside click, X): the sources list and the technical drawer. */
function Overlay({ title, onClose, children, testId, narrow = false }: { title: string; onClose: () => void; children: ReactNode; testId: string; narrow?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-fg/30 p-4 md:p-10">
      <div ref={box} role="dialog" aria-label={title} className={`card w-full ${narrow ? "max-w-md" : "max-w-4xl"} p-5`} data-testid={testId}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-fg">{title}</h3>
          <button type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid={`${testId}-close`}>
            <X size={16} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
