"use client";
/**
 * Analyze on the WORKSPACE SHELL (round 2, 2026-09-10): the full-bleed map behind, the
 * floating nav capsule, and the three analyses as deck-style cards in one scrollable
 * column at the left - the structure Explore taught the reader. The map FOLLOWS the
 * analysis: the change section's "To" year sets its period and a clicked waterfall
 * step steers its sector overlay, so "agriculture drove the growth" and "here is
 * where agriculture's emissions sit" appear side by side. Every number on the page
 * is a server string; parsing happens only to shade a cell or place a point.
 */
import { useState } from "react";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { ANALYZE } from "./copy";
import { ChangeSection, type ChangeScope } from "./ChangeSection";
import { SharedSourcesSection } from "./SharedSourcesSection";
import { SensitivitySection } from "./SensitivitySection";

const COLUMN = "absolute left-5 top-[84px] bottom-5 z-20 flex w-[660px] max-w-[calc(100vw-40px)] flex-col gap-3 overflow-y-auto overscroll-contain scrollbar-none pb-2";

export function Analyze() {
  const wide = useMediaQuery("(min-width: 1280px)");
  // what the map mirrors: the change section's To year, and the source under study
  const [scope, setScope] = useState<ChangeScope>({ period: null, sector: null });

  return (
    <div className="relative h-dvh overflow-hidden bg-surface text-fg" data-testid="analyze">
      <div className="absolute inset-0" data-testid="analyze-map-pane">
        <ExplorerMap
          variant="workspace"
          padding={wide ? { left: 660 + 20 + 16, top: 0, right: 0, bottom: 0 } : undefined}
          override={{ ...(scope.period ? { period: scope.period } : {}), sector: scope.sector }}
        />
      </div>
      {wide ? <NavCapsule floating /> : <NavCapsule docked />}
      <div className={`${COLUMN}${wide ? "" : " bottom-20"}`} data-testid="analyze-column">
        <header className="pointer-events-auto shrink-0 rounded-2xl border border-nav-line bg-nav px-5 py-4 shadow-lg">
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-fg" data-testid="analyze-title">{ANALYZE.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{ANALYZE.dek}</p>
          <nav className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Analyses" data-testid="analyze-questions">
            {ANALYZE.questions.map((q) => (
              <a key={q.id} href={`#${q.id}`} className="rounded-full bg-surface-3 px-3 py-1 text-xs font-medium text-fg/70 transition-colors hover:bg-accent-soft hover:text-fg">
                {q.label}
              </a>
            ))}
          </nav>
        </header>
        <ChangeSection onScope={setScope} />
        <SharedSourcesSection />
        <SensitivitySection />
      </div>
    </div>
  );
}
