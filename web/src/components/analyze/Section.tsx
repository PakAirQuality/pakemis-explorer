"use client";
/** One analysis as a deck-style card: title, a plain-words dek that says how to read the
 * chart, the controls and chart, a finding in words beneath - and the precise caveats
 * folded into a "More about this analysis" line at the card's foot. */
import type { ReactNode } from "react";
import { DECK_CARD } from "@/components/overview/deck";
import { ANALYZE } from "./copy";

export function Section({ id, title, dek, more, children }: { id: string; title: string; dek: string; more?: string; children: ReactNode }) {
  return (
    <section id={id} className={`${DECK_CARD} scroll-mt-24`} data-testid={`analyze-${id}`}>
      <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{dek}</p>
      <div className="mt-4">{children}</div>
      {more && (
        <details className="mt-3 border-t border-line pt-2.5" data-testid={`analyze-more-${id}`}>
          <summary className="micro cursor-pointer select-none">{ANALYZE.moreLabel}</summary>
          <p className="mt-2 text-xs leading-relaxed text-muted">{more}</p>
        </details>
      )}
    </section>
  );
}

export function Finding({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-fg" data-testid={testId}>
      {children}
    </p>
  );
}
