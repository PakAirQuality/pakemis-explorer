"use client";
/** The analysis card (the mockup's shape): a gold-top deck-style card with a micro
 * eyebrow, a question title, an optional action at the right, the analysis body, and
 * the precise caveats folded into a "More about this analysis" line at the foot. */
import type { ReactNode } from "react";
import { ArrowRight, Info } from "lucide-react";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { DECK_CARD } from "@/components/overview/deck";
import { ANALYZE } from "./copy";

export function AnalysisCard({ id, eyebrow, title, dek, action, more, moreOpen, children }: { id: string; eyebrow: ReactNode; title: string; dek?: string; action?: ReactNode; more?: string; moreOpen?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`${DECK_CARD} scroll-mt-24`} data-testid={`analyze-${id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="micro text-accent">{eyebrow}</div>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{title}</h2>
          {dek && <p className="mt-1 text-[13px] leading-relaxed text-muted">{dek}</p>}
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
      <div className="mt-4">{children}</div>
      {more && (
        <details className="mt-4 border-t border-line pt-2.5" open={moreOpen} data-testid={`analyze-more-${id}`}>
          <summary className="micro cursor-pointer select-none">{ANALYZE.moreLabel}</summary>
          <p className="mt-2 max-w-[90ch] text-xs leading-relaxed text-muted">{more}</p>
        </details>
      )}
    </section>
  );
}

/** The info strip beneath a chart: the plain caution at the left, a link-looking toggle at the right. */
export function InfoStrip({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-2.5 text-xs text-muted" data-testid="change-note">
      <span className="flex min-w-0 items-center gap-2">
        <Info size={14} className="shrink-0 text-accent" aria-hidden="true" />
        {children}
      </span>
      {right}
    </div>
  );
}

export function Finding({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-fg" data-testid={testId}>
      {children}
    </p>
  );
}

/** A secondary analysis, closed: the question, one plain sentence, and the door in. */
export function TeaserCard({ id, eyebrow, title, teaser, cta, testId, onOpen }: { id: string; eyebrow: string; title: string; teaser: string; cta: string; testId: string; onOpen: () => void }) {
  return (
    <section id={id} className="relative overflow-hidden rounded-[20px] border border-line border-t-[3px] border-t-brand-gold bg-card p-5 shadow-card scroll-mt-24" data-testid={`analyze-${id}`}>
      <ContourMotif corner="bottom-right" />
      <div className="relative">
        <div className="micro text-accent">{eyebrow}</div>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{title}</h2>
        <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-muted">{teaser}</p>
        <button type="button" onClick={onOpen} className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft" data-testid={testId}>
          {cta} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
