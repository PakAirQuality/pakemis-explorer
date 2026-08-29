"use client";
/**
 * Every chart and table sits in a Frame: title, the envelope's unit as words when given
 * (`unitLine`), scope subtitle, a chart | table segmented control when a chart is given, and the ReceiptFooter ("Result details", opening the EnvelopeDrawer).
 * A loading or refused envelope renders its state in the same frame.
 */
import { useState, type ReactNode } from "react";
import type { Envelope } from "@/lib/envelope";
import type { Labels } from "@/lib/release";
import type { Dims } from "@/lib/labels";
import { EnvelopeTable } from "./EnvelopeTable";
import { ReceiptFooter } from "./ReceiptFooter";
import { RefusalCard, Loading } from "./RefusalCard";

export type FrameProps = {
  title: ReactNode;
  scope?: ReactNode;
  env?: Envelope | null;
  error?: unknown;
  isLoading?: boolean;
  children?: ReactNode;
  tableExtra?: string[];
  labels?: Labels;
  dims?: Dims;
  defaultTab?: "chart" | "table";
  maxRows?: number;
  className?: string;
  actions?: ReactNode;
  flat?: boolean;
  /** The envelope's unit as words ("million tonnes CO₂e (AR5)"), under the title; see envelopeUnitLine. */
  unitLine?: string;
};

export function Frame({ title, scope, env, error, isLoading, children, tableExtra, labels, dims, defaultTab, maxRows, className = "", actions, flat = false, unitLine }: FrameProps) {
  // null = automatic: a chart when children arrive (they may come after the envelope), else the table
  const [chosen, setTab] = useState<"chart" | "table" | null>(defaultTab ?? null);
  const tab = chosen ?? (children ? "chart" : "table");
  const seg = (id: "chart" | "table", label: string) => (
    <button key={id} onClick={() => setTab(id)} className={`px-2 py-0.5 text-micro normal-case tracking-normal ${tab === id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
      {label}
    </button>
  );
  return (
    <section className={`${flat ? "" : "card"} flex flex-col ${className}`} data-testid="frame">
      <header className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {unitLine && <div className="truncate text-xs text-ink/70" data-testid="frame-unit">{unitLine}</div>}
          {scope && <div className="truncate text-xs text-muted">{scope}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {children && env && <div className="pill flex overflow-hidden border border-line bg-white">{seg("chart", "Chart")}{seg("table", "Table")}</div>}
        </div>
      </header>
      <div className="px-3 pb-2">
        {env ? (
          tab === "chart" && children ? children : <EnvelopeTable env={env} extra={tableExtra} labels={labels} dims={dims} maxRows={maxRows} dense />
        ) : error ? (
          <RefusalCard error={error} compact />
        ) : isLoading ? (
          <Loading what={typeof title === "string" ? title : "the envelope"} />
        ) : null}
      </div>
      {env && <ReceiptFooter env={env} labels={labels} className="border-t border-line px-3 py-1.5" />}
    </section>
  );
}
