"use client";
/**
 * A toggle switch (`role="switch"`, `aria-checked`): the accent track when on, the hairline
 * grey when off, a white thumb that slides. Global Mangrove Watch's widget header toggle; the
 * Overview's deck cards collapse under it. Nothing here prints a number.
 */
export function Switch({ on, onChange, label, testId = "switch", className = "" }: { on: boolean; onChange: (on: boolean) => void; label: string; testId?: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-accent" : "bg-line-strong"} ${className}`}
      data-testid={testId}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} aria-hidden="true" />
    </button>
  );
}
