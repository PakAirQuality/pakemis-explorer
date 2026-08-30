"use client";
/**
 * The header of a content page: the identity line ("PakEmis · public-data reconstruction of
 * Pakistan's non-LULUCF emissions · 2015–16 to 2023–24", the API's `/release.identity_line`
 * when it sends one, else the same parts from the labels; never a version), the h1, the dek and
 * an action at the right (a link or a control the page passes).
 */
import type { ReactNode } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { identityLine } from "@/lib/labels";

export const ACTION_CLASS = "pill inline-flex items-center gap-1.5 border border-line-strong px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-3";

export function PageHeader({ title, dek, action, testId = "page-header" }: { title: string; dek: string; action?: ReactNode; testId?: string }) {
  const { release, dims, labels } = useExplorer();
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between" data-testid={testId}>
      <div className="max-w-2xl">
        <div className="micro" data-testid="identity-line">{identityLine(release, dims, labels)}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-2 text-md text-muted">{dek}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
