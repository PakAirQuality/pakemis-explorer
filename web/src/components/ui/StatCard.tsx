"use client";
/**
 * A stat card: label · big value · unit · caption · Result details. The value and the unit
 * are server strings (`display_short` / `share_pct_short` / `interval_short` and `unit_short`)
 * the caller passes as received; the card prints them and computes nothing. While the
 * envelope is loading or refused the card shows that state in the value's place. `env` gives
 * the ReceiptFooter (Result details) its envelope.
 */
import type { ReactNode } from "react";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import { ReceiptFooter } from "./ReceiptFooter";
import { RefusalCard, Loading } from "./RefusalCard";

export type StatCardProps = {
  label: string;
  /** The server string shown large. */
  value?: string | null;
  /** The unit beside the value ("Mt CO₂e", "%", "Mt"). */
  unit?: string;
  /** One line under the value. */
  caption?: ReactNode;
  /** The tooltip of the value (the contract's display and exact). */
  title?: string;
  env?: Envelope | null;
  error?: unknown;
  isLoading?: boolean;
  /** What the loading line names. */
  what?: string;
  labels?: Labels;
  className?: string;
  testId?: string;
  /** Text shown in the value's place when there is no value and nothing is loading or refused. */
  empty?: string;
};

export function StatCard({ label, value, unit, caption, title, env, error, isLoading, what, labels, className = "", testId = "stat-card", empty = "Not available for this view" }: StatCardProps) {
  return (
    <section className={`card flex flex-col p-4 ${className}`} data-testid={testId}>
      <div className="micro">{label}</div>
      {value ? (
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="num text-3xl font-semibold tracking-tight text-fg" title={title} data-testid={`${testId}-value`}>
            {value}
          </span>
          {unit && <span className="text-sm text-muted" data-testid={`${testId}-unit`}>{unit}</span>}
        </div>
      ) : error ? (
        <div className="mt-2"><RefusalCard error={error} compact /></div>
      ) : isLoading ? (
        <div className="mt-2"><Loading what={what ?? label.toLowerCase()} /></div>
      ) : (
        <div className="mt-2 text-sm text-muted" data-testid={`${testId}-empty`}>{empty}</div>
      )}
      {caption && <div className="mt-1 text-xs text-muted" data-testid={`${testId}-caption`}>{caption}</div>}
      <div className="flex-1" />
      {env && <ReceiptFooter env={env} labels={labels} className="mt-3 border-t border-line pt-2" />}
    </section>
  );
}
