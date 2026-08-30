"use client";
/**
 * The segmented tab strip of a results card (Summary | Breakdown | Evidence | Sources on the
 * Map; Chart | Table on a frame): a `tablist` of pills, the current one filled. The caller
 * owns the value (URL state or local state) and renders the panel.
 */
export type ResultTab<T extends string = string> = { id: T; label: string; disabled?: boolean; title?: string };

export function ResultTabs<T extends string>({ tabs, value, onChange, ariaLabel = "Result tabs", size = "sm", className = "", testId = "result-tabs" }: { tabs: ResultTab<T>[]; value: T; onChange: (id: T) => void; ariaLabel?: string; size?: "sm" | "xs"; className?: string; testId?: string }) {
  const pad = size === "xs" ? "px-2 py-0.5 text-micro normal-case tracking-normal" : "px-3 py-1 text-xs";
  return (
    <div role="tablist" aria-label={ariaLabel} className={`pill inline-flex overflow-hidden border border-line bg-surface-2 p-0.5 ${className}`} data-testid={testId}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={t.disabled}
            title={t.title}
            onClick={() => onChange(t.id)}
            className={`pill ${pad} transition-colors ${on ? "bg-fg text-card" : "text-muted hover:text-fg"} disabled:cursor-not-allowed disabled:opacity-50`}
            data-testid={`${testId}-${t.id}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
