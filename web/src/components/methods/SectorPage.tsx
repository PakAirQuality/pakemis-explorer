"use client";
/**
 * A sector's page in the evidence catalogue (regenerated 2026-09-07 to the user's mockup):
 * one prominent result, a four-step plain-language reconstruction, what is included, the
 * evidence at a glance, the not-yet-estimated strip, and the technical detail folded behind
 * a secondary action (the caller passes the old dense card as children). Every figure is a
 * server string — the total and its national share come from envelopes; the lists come from
 * the release's own streams, rules and completeness rows.
 */
import { type ReactNode, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, ChevronLeft, Cog, FileText, MapPin, ScrollText, Sprout } from "lucide-react";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, periodShort, sectorLabel, type Dims as GeoDims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { ContourMotif } from "@/components/ui/ContourMotif";

const PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const TEXT_LINK = "inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline";

const STEPS = [
  { icon: <FileText size={18} aria-hidden="true" />, title: "Public records" },
  { icon: <Sprout size={18} aria-hidden="true" />, title: "What is counted" },
  { icon: <Cog size={18} aria-hidden="true" />, title: "How it is estimated" },
  { icon: <BarChart3 size={18} aria-hidden="true" />, title: "Result" },
] as const;

export type SectorPageProps = {
  sector: string;
  number: string;
  labels: Labels;
  dims: GeoDims;
  /** The authored plain-language line under the title. */
  dek: string;
  /** The sector's total cell (its own envelope), and its cell in the national partition. */
  cell: Cell | null | undefined;
  shareCell: Cell | null | undefined;
  period: string;
  /** Plain lists from the release: source names, activity descriptors, category names, NE categories. */
  sources: string[];
  activities: string[];
  categories: string[];
  ne: string[];
  ruleCount: number;
  /** The three evidence axes worded ("annual estimates from published statistics", ...). */
  glance: { annual: string; monthly: string; location: string };
  onBack: () => void;
  onSources: () => void;
  /** The old dense card, folded behind "Technical method". */
  children?: ReactNode;
};

export function SectorPage(p: SectorPageProps) {
  const [technical, setTechnical] = useState(false);
  const name = sectorLabel(p.labels, p.sector);
  const steps = [
    p.sources.slice(0, 3).join(", ") + ".",
    p.activities.slice(0, 3).join(" · ") + ".",
    p.ruleCount ? `${p.ruleCount === 1 ? "One registered IPCC rule is" : `${p.ruleCount} registered IPCC rules are`} applied.` : "Standard IPCC methods are applied.",
    "Added to the national inventory.",
  ];
  return (
    <div className="mt-6" data-testid="sector-page" data-sector={p.sector}>
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Breadcrumb" data-testid="sector-breadcrumb">
        <span>Methods</span> / <span>Sectors</span> / <span className="text-fg">{name}</span>
      </nav>
      <button type="button" onClick={p.onBack} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline" data-testid="all-sectors">
        <ArrowLeft size={14} aria-hidden="true" /> All sectors
      </button>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {p.number && <div className="micro text-accent">IPCC sector {p.number}</div>}
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-fg" data-testid="sector-title">{name}</h2>
          <p className="mt-2 max-w-[36em] text-md text-muted" data-testid="sector-dek">{p.dek}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-nav-line bg-nav p-5" data-testid="sector-result">
          <ContourMotif corner="bottom-right" />
          <div className="relative">
            {p.cell ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-3xl font-semibold tracking-tight text-fg" data-testid="sector-result-display">{shown(p.cell)}</span>
                  <span className="text-sm text-muted">{cellUnit(p.cell)}</span>
                </div>
                <div className="mt-1 text-sm text-muted">{periodShort(p.labels, p.period)}</div>
                {p.shareCell?.share_pct_short && (
                  <div className="mt-1 text-sm font-medium text-fg" data-testid="sector-share">
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

      <section className="mt-8 border-t border-line pt-6" data-testid="sector-steps">
        <h3 className="text-xl font-semibold tracking-tight text-fg">How this estimate is built</h3>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-start md:gap-0">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex flex-1 items-start gap-3 md:flex-col md:items-center md:gap-0 md:text-center">
              {i > 0 && <div className="hidden md:block md:absolute" aria-hidden="true" />}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">{s.icon}</div>
              <div className="md:mt-2">
                <div className="num text-lg font-semibold text-accent md:text-center">{i + 1}</div>
                <div className="text-sm font-semibold text-fg">{s.title}</div>
                <div className="mx-auto mt-1 max-w-[16em] text-xs text-muted" data-testid={`sector-step-${i + 1}`}>{steps[i]}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-8 border-t border-line pt-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section data-testid="sector-included">
          <h3 className="text-xl font-semibold tracking-tight text-fg">What is included</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {p.categories.map((c) => (
              <div key={c} className="rounded-lg border border-line bg-card px-3 py-2.5 text-sm font-medium text-fg" data-testid="included-chip">
                {c}
              </div>
            ))}
          </div>
        </section>
        <section data-testid="sector-glance">
          <h3 className="text-xl font-semibold tracking-tight text-fg">Evidence at a glance</h3>
          <dl className="mt-3 space-y-3">
            <GlanceRow icon={<FileText size={15} aria-hidden="true" />} title="Annual estimates" text={p.glance.annual} />
            <GlanceRow icon={<CalendarDays size={15} aria-hidden="true" />} title="Monthly pattern" text={p.glance.monthly} />
            <GlanceRow icon={<MapPin size={15} aria-hidden="true" />} title="Location" text={p.glance.location} />
          </dl>
        </section>
      </div>

      {p.ne.length > 0 && (
        <div className="mt-6 rounded-lg bg-surface-3 px-4 py-3" data-testid="sector-ne">
          <span className="micro text-accent">Not yet estimated</span>
          <span className="ml-3 text-sm text-muted">{p.ne.join(" · ")}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="sector-actions">
        <Link href={`/data?sector=${encodeURIComponent(p.sector)}`} className={PRIMARY} data-testid="view-sector-data">
          View {name.toLowerCase()} data
        </Link>
        <button type="button" onClick={p.onSources} className={OUTLINE} data-testid="see-sources">
          <ScrollText size={15} aria-hidden="true" /> See the sources
        </button>
        <button type="button" onClick={() => setTechnical((t) => !t)} aria-expanded={technical} className={TEXT_LINK} data-testid="technical-toggle">
          Technical method {technical ? <ChevronLeft size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
        </button>
      </div>

      {technical && <div className="mt-4" data-testid="technical">{p.children}</div>}
    </div>
  );
}

function GlanceRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-accent">{icon}</div>
      <div>
        <dt className="text-sm font-semibold text-fg">{title}</dt>
        <dd className="text-xs text-muted">{text}</dd>
      </div>
    </div>
  );
}
