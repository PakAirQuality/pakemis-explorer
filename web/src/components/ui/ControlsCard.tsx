"use client";
/**
 * The controls card of a page: a two-column grid of labelled selects (`children`), with an
 * optional "More settings" disclosure (`more`) that reveals the less-used controls. `Field`
 * and `Select` are the building blocks; every option's label is the caller's (the release's
 * labels), and an option the release cannot answer is passed `disabled` with its reason as
 * the option's title and shown under the select when it is the one asked for.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type ControlsCardProps = {
  children: ReactNode;
  /** The controls behind the disclosure. */
  more?: ReactNode;
  moreLabel?: string;
  defaultOpen?: boolean;
  /** Something at the card's right, on the same row as the disclosure button. */
  aside?: ReactNode;
  className?: string;
  testId?: string;
  /** Grid columns on wide screens (default 4: the mockups' two rows of two). */
  columns?: 2 | 3 | 4;
};

export function ControlsCard({ children, more, moreLabel = "More settings", defaultOpen = false, aside, className = "", testId = "controls-card", columns = 4 }: ControlsCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const cols = columns === 2 ? "md:grid-cols-2" : columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4";
  return (
    <section className={`card p-4 ${className}`} data-testid={testId}>
      <div className={`grid grid-cols-1 gap-3 ${cols}`}>{children}</div>
      {(more || aside) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {more ? (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline" data-testid="more-settings">
              {moreLabel} {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
            </button>
          ) : (
            <span />
          )}
          {aside}
        </div>
      )}
      {more && open && (
        <div className={`mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 ${cols}`} data-testid="more-settings-body">
          {more}
        </div>
      )}
    </section>
  );
}

export function Field({ label, children, hint, title, testId }: { label: string; children: ReactNode; hint?: ReactNode; title?: string; testId?: string }) {
  return (
    <label className="block min-w-0" title={title} data-testid={testId}>
      <div className="micro mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </label>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean; title?: string };

export const SELECT_CLASS = "w-full rounded-md border border-line bg-surface-3 px-2.5 py-2 text-sm text-fg disabled:opacity-60";

export function Select({ value, onChange, options, ariaLabel, testId, disabled }: { value: string; onChange: (value: string) => void; options: SelectOption[]; ariaLabel?: string; testId?: string; disabled?: boolean }) {
  return (
    <select className={SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} data-testid={testId} disabled={disabled}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
