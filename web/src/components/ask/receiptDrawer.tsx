"use client";
/**
 * Result details from a receipt alone: the Ask stream carries a tool result's receipt and its
 * cells, not the envelope, so `open(receipt, tab)` replays GET {API_BASE}/receipt/{r} (cached
 * per receipt through react-query) and shows the shared EnvelopeDrawer at that tab. `node` is
 * rendered once by the card; each opening mounts afresh so the tab asked for is the one shown.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import { EnvelopeDrawer, type DrawerTab } from "@/components/ui/EnvelopeDrawer";

type Opened = { receipt: string; tab: DrawerTab; n: number; env: Envelope | null; error: string };

export function useReceiptDrawer(labels?: Labels): { open: (receipt: string, tab?: DrawerTab) => void; close: () => void; node: ReactNode } {
  const client = useQueryClient();
  const [state, setState] = useState<Opened | null>(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback(
    (receipt: string, tab: DrawerTab = "sources") => {
      setState((s) => ({ receipt, tab, n: (s?.n ?? 0) + 1, env: null, error: "" }));
      client
        .fetchQuery({ queryKey: ["receipt", receipt], queryFn: () => api.receipt(receipt), staleTime: Infinity })
        .then((env) => setState((s) => (s && s.receipt === receipt ? { ...s, env } : s)), (e) => setState((s) => (s && s.receipt === receipt ? { ...s, error: String((e as Error)?.message ?? e) } : s)));
    },
    [client],
  );
  const node = useMemo(() => {
    if (!state) return null;
    if (state.env) return <EnvelopeDrawer key={`${state.n}-${state.tab}`} env={state.env} tab={state.tab} labels={labels} onClose={close} />;
    return (
      <div className="fixed inset-0 z-[90] flex justify-end bg-fg/30" onClick={close} role="dialog" aria-label="Result details">
        <div className="flex h-full w-full max-w-xl flex-col bg-surface-2 px-4 py-3 text-sm shadow-card" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold text-fg">Result details</div>
          <p className="mt-2 text-xs text-muted" role="status">{state.error ? `could not load the result: ${state.error}` : "loading the result…"}</p>
        </div>
      </div>
    );
  }, [state, labels, close]);
  return { open, close, node };
}
