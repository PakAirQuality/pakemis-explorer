"use client";
/**
 * Analyze - the page that explains rather than reports (Explore answers "how much,
 * where, when"; this page answers "why did it change, which sources matter for climate
 * and clean air at once, and does the conclusion survive the assumptions"). One
 * spacious scrolling column: a compact question selector on top, then one section per
 * question - controls above one main chart, a computed plain-language finding beneath
 * it. Every number on the page is a server string; parsing happens only to shade a
 * cell or place a point.
 */
import { NavHeader } from "@/components/shell/NavCapsule";
import { ANALYZE } from "./copy";
import { ChangeSection } from "./ChangeSection";
import { SharedSourcesSection } from "./SharedSourcesSection";
import { SensitivitySection } from "./SensitivitySection";

export function Analyze() {
  return (
    <div className="min-h-dvh bg-ground">
      <NavHeader />
      <main className="mx-auto flex w-full max-w-[1060px] flex-col gap-5 px-5 pb-24 pt-2" data-testid="analyze">
        <header className="px-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-fg" data-testid="analyze-title">{ANALYZE.title}</h1>
          <p className="mt-1 max-w-[78ch] text-[13px] text-muted">{ANALYZE.dek}</p>
          <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Analyses" data-testid="analyze-questions">
            {ANALYZE.questions.map((q) => (
              <a key={q.id} href={`#${q.id}`} className="rounded-full bg-surface-3 px-3 py-1 text-xs font-medium text-fg/70 transition-colors hover:bg-accent-soft hover:text-fg">
                {q.label}
              </a>
            ))}
          </nav>
        </header>
        <ChangeSection />
        <SharedSourcesSection />
        <SensitivitySection />
      </main>
    </div>
  );
}
