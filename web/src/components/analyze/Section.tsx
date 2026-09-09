"use client";
/** One analysis: a titled card with a dek, its controls and chart inside, and a computed
 * plain-language finding beneath the chart (assembled from server strings only). */
import type { ReactNode } from "react";

export function Section({ id, title, dek, children }: { id: string; title: string; dek: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[20px] border border-line bg-card p-6 shadow-sm" data-testid={`analyze-${id}`}>
      <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">{dek}</p>
      <div className="mt-5">{children}</div>
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
