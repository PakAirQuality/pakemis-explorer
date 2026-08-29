"use client";
/** One context for the screen: the resolved URL state and its setter, the release's dims, labels, defaults and agent block. */
import { createContext, useContext } from "react";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState, StateDefaults } from "@/lib/urlState";
import type { Labels } from "@/lib/release";
import type { ContractOptions } from "@/lib/contract";
import type { releaseDims } from "@/lib/release";

export type Dims = ReturnType<typeof releaseDims>;

export type ExplorerContextValue = {
  state: ExplorerState;
  setState: (patch: Partial<ExplorerState>, options?: { history?: "push" | "replace" }) => unknown;
  release: ReleaseInfo;
  labels: Labels;
  dims: Dims;
  defaults: StateDefaults;
  contract: ContractOptions | undefined;
  agent: { enabled: boolean; model: string; reason: string };
  isMobile: boolean;
};

export const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function useExplorer(): ExplorerContextValue {
  const v = useContext(ExplorerContext);
  if (!v) throw new Error("useExplorer outside ExplorerContext");
  return v;
}
