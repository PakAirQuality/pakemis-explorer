"use client";
/** The anchor tabs (Summary · Sectors · Trend · Gases · Places · Uncertainty · Evidence), sticky under the nav; the one in view is marked. Anchors, not filters. */
import { TABS, type TabId } from "./copy";

export function TabStrip({ active }: { active: TabId }) {
  return (
    <nav className="sticky top-14 z-30 -mx-4 mt-6 border-b border-line bg-surface/95 px-4 backdrop-blur md:-mx-8 md:px-8" aria-label="Sections of the briefing" data-testid="tab-strip">
      <ul className="scrollbar-none flex gap-1 overflow-x-auto">
        {TABS.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={active === id ? "location" : undefined} className={`block border-b-2 px-3 py-2.5 text-sm transition-colors ${active === id ? "border-accent font-semibold text-fg" : "border-transparent text-muted hover:text-fg"}`} data-testid={`tab-${id}`}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
