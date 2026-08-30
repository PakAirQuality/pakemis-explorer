"use client";
/**
 * Ask PakEmis as a page: the AskDock at max-w-3xl, full height under the nav. `?q=` seeds
 * the composer with a question and sends it once (the Overview's question box and chips
 * arrive here); the parameter is then cleared so a reload does not send it again. A "moved
 * the map" chip and a tool card's "Show on map" link to /map with that state.
 */
import { Suspense, useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { TopNav } from "@/components/shell/TopNav";
import { AskDock } from "@/components/ask/AskDock";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <Ask />
    </Suspense>
  );
}

function Ask() {
  const [q, setQ] = useQueryState("q", parseAsString);
  const onSeeded = useCallback(() => setQ(null, { history: "replace" }), [setQ]);
  return (
    <div className="flex h-dvh flex-col bg-surface" data-testid="ask-page">
      <TopNav />
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 border-x border-line bg-surface-2">
        <AskDock seed={q} onSeeded={onSeeded} />
      </div>
    </div>
  );
}
