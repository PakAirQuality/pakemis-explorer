"use client";
/** The advanced evidence tool on its own route: the claim-record browser, where a figure's calculation and sources can be traced. Claim permalinks (?claim=) land here. */
import { NavHeader } from "@/components/shell/NavCapsule";
import { CurrentView } from "@/components/shell/CurrentView";
import { PageHeader } from "@/components/shell/PageHeader";
import { ClaimBrowser } from "./ClaimBrowser";

export function EvidencePage() {
  return (
    <div className="min-h-dvh bg-surface" data-testid="evidence-page">
      <NavHeader />
      <CurrentView compact />
      <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-4 md:px-6">
        <PageHeader title="Evidence" dek="Trace any figure to its calculation and sources." />
        <ClaimBrowser />
      </main>
    </div>
  );
}
