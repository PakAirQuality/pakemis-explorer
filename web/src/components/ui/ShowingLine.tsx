"use client";
/**
 * "Showing: Pakistan's 2023–24 reference emissions, all sectors, grouped by sector, using
 * IPCC 2013 warming factors." — the one sentence under a page's controls that says what every
 * number below it is. The sentence is the caller's, built from the release's labels
 * (lib/breakdown.ts showingSentence, the Map's own); an optional second sentence (`note`) is
 * printed after it in the muted colour.
 */
import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function ShowingLine({ children, note, className = "", testId = "showing-line" }: { children: ReactNode; note?: ReactNode; className?: string; testId?: string }) {
  return (
    <p className={`flex items-start gap-2 text-sm text-fg ${className}`} data-testid={testId}>
      <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <span>
        <span className="text-muted">Showing: </span>
        <span data-testid={`${testId}-text`}>{children}</span>
        {note && <span className="text-muted"> {note}</span>}
      </span>
    </p>
  );
}
