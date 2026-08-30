"use client";
/**
 * The assistant as a page (the permalink form of the drawer): the same AskDock at max-w-3xl,
 * full height under the nav. `?q=` seeds the composer with a question and sends it once (the
 * Explore page's "Explain" arrives here); the parameter is then cleared so a reload does not
 * send it again. `openAsk()` requests raised on this page (the layout's drawer stays closed
 * here) are sent by the page itself. A "moved the map" chip and a tool card's "Show on map"
 * link to /map with that state.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { TopNav } from "@/components/shell/TopNav";
import { AskDock } from "@/components/ask/AskDock";
import { subscribeAsk, type AskRequest } from "@/lib/askBus";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <Ask />
    </Suspense>
  );
}

function Ask() {
  const [q, setQ] = useQueryState("q", parseAsString);
  const [request, setRequest] = useState<{ req: AskRequest; key: number } | null>(null);
  useEffect(
    () =>
      subscribeAsk((ev) => {
        if (ev.type === "open" && (ev.request.question || ev.request.scope)) setRequest((r) => ({ req: ev.request, key: (r?.key ?? 0) + 1 }));
      }),
    [],
  );
  const onSeeded = useCallback(() => {
    setQ(null, { history: "replace" });
  }, [setQ]);
  const seed = request?.req.question ?? q;
  return (
    <div className="flex h-dvh flex-col bg-surface" data-testid="ask-page">
      <TopNav onAsk={() => document.querySelector<HTMLTextAreaElement>('[data-testid="question"]')?.focus()} />
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 border-x border-line bg-card">
        <AskDock seed={seed} seedScope={request?.req.scope ?? null} seedKey={request ? request.key : q ? -1 : 0} onSeeded={onSeeded} />
      </div>
    </div>
  );
}
