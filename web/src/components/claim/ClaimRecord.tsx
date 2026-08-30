"use client";
/**
 * The claim record: the structured evidence behind one number, as `GET /claim` returns it.
 * Header = the breadcrumb (Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24,
 * every label the release's own), then eleven titled sections in a fixed order: Reported
 * estimate, Calculation, Activity data, Emission factors (with the method rule), Monthly
 * allocation basis, Spatial allocation basis, Uncertainty, Source documents and pages,
 * Validation tests, Known limitation (with the completeness justification), Exact
 * machine-readable rows. A section the API names in `missing`, or that carries no data, says
 * "Not carried by this release" with the API's message; nothing renders blank. Every number is
 * the string the API sent (the web computes nothing); every class code (E2 / T4 / S3) carries
 * its `class_definitions` text inline and on hover. Ids that are the release's own vocabulary
 * (stream ids, method ids, SQL, the exact rows) sit in mono blocks marked `data-allow-raw`.
 */
import { useState, type ReactNode } from "react";
import { Download, ExternalLink, FileJson } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { CLAIM_SECTIONS, NOT_CARRIED, breadcrumbText, cellText, crumbLabel, field, formatSql, listOf, objOf, rowsOf, sectionState, type Claim, type ClaimRow, type ClaimSectionId } from "@/lib/claim";
import { columnLabel, districtName, geographyName, periodShort, streamLabel, viewLabel, type Dims } from "@/lib/labels";
import type { Labels } from "@/lib/release";

const TH = "py-1 pr-3 text-left font-semibold text-muted";
const TD = "py-1 pr-3 align-top";
const MONO_BLOCK = "mono whitespace-pre-wrap break-words rounded-md bg-surface-3 p-2 text-xs text-fg";
const LINK = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";
const LEVEL_WORDS: Record<string, string> = { sector: "Sector", category: "Category", gas: "Gas", geography: "Place", period: "Period" };

export type ClaimRecordProps = { claim: Claim; labels: Labels; dims: Dims };

/** A class code with its definition on hover; the definition text is the release's `class_definitions` entry. */
export function ClassCode({ id, defs }: { id: string; defs: Record<string, string> | null | undefined }) {
  const def = defs?.[id];
  return (
    <abbr title={def ?? id} className="mono no-underline decoration-dotted" data-testid="class-code" data-class={id}>
      {id}
    </abbr>
  );
}

/** "T4 — flat or weakly-informed profile; …": the code and its definition inline. */
function ClassLine({ id, defs }: { id: string; defs: Record<string, string> | null | undefined }) {
  const def = defs?.[id];
  return (
    <span data-testid="class-line">
      <ClassCode id={id} defs={defs} />
      {def ? <span className="text-muted"> — {def}</span> : null}
    </span>
  );
}

function NotCarried({ message }: { message: string }) {
  const rest = message.replace(/^not carried by this release:?\s*/i, "").trim();
  return (
    <p className="text-sm text-muted" data-testid="not-carried">
      {NOT_CARRIED}
      {rest ? <span> — {rest}</span> : "."}
    </p>
  );
}

function Section({ id, title, claim, children }: { id: ClaimSectionId; title: string; claim: Claim; children: ReactNode }) {
  const state = sectionState(claim, id);
  return (
    <section className="border-t border-line pt-4" data-testid={`claim-${id}`} data-state={state.kind}>
      <h3 className="widget-title">{title}</h3>
      <div className="mt-2">{state.kind === "data" ? children : <NotCarried message={state.message} />}</div>
    </section>
  );
}

function Dl({ rows, testId }: { rows: [string, ReactNode][]; testId?: string }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-[minmax(9rem,max-content)_1fr]" data-testid={testId}>
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

type Column = { label: string; cell: (row: ClaimRow, i: number) => ReactNode; className?: string };

function Table({ columns, rows, testId, raw = false }: { columns: Column[]; rows: ClaimRow[]; testId?: string; raw?: boolean }) {
  return (
    <div className="overflow-x-auto" data-testid={testId} {...(raw ? { "data-allow-raw": "" } : {})}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} className={`${TH} ${c.className ?? ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {columns.map((c) => (
                <td key={c.label} className={`${TD} ${c.className ?? ""}`}>{c.cell(r, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Details({ summary, children, testId }: { summary: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <details className="mt-2 text-xs" data-testid={testId}>
      <summary className="cursor-pointer font-semibold text-accent">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** Every non-empty scalar field of a row as a definition list, keys humanised through the column dictionary. */
function AllFields({ row, skip = [] }: { row: ClaimRow; skip?: string[] }) {
  const rows: [string, ReactNode][] = Object.entries(row)
    .filter(([k, v]) => !skip.includes(k) && v !== null && v !== undefined && v !== "" && (typeof v !== "object" || Array.isArray(v)))
    .map(([k, v]) => [columnLabel(k), cellText(v)]);
  return <Dl rows={rows} />;
}

function pct(v: string): string {
  return v ? `${v} %` : "";
}

function Reported({ claim, labels, dims }: ClaimRecordProps) {
  const r = claim.reported;
  if (!r) return null;
  const unit = r.unit_short ?? "";
  const periods = r.period?.labels?.length ? r.period.labels.join(", ") : (r.period?.ids ?? []).map((p) => periodShort(labels, p)).join(", ");
  const months = (r.period?.months ?? []).map((m) => labels.months[m] ?? m).join(", ");
  const geoIds = r.geography?.ids ?? [];
  const level = r.geography?.level ?? "";
  const places = geoIds.length ? geoIds.map((g) => (level === "adm2" ? districtName(dims, g) : geographyName(labels, g))).join(", ") : "Pakistan";
  const commit = r.release?.commit ?? "";
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2" data-testid="reported-headline">
        <span className="num text-3xl font-semibold text-fg" data-testid="reported-short">{r.display_short ?? r.display ?? ""}</span>
        <span className="text-sm text-muted">{unit}</span>
        {r.exactness ? <span className="pill bg-surface-3 px-2 py-0.5 text-xs text-muted">{r.exactness}</span> : null}
      </p>
      <div className="mt-3">
        <Dl
          testId="reported-rows"
          rows={[
            ["Published value", r.display ? <span className="num">{r.display} {unit}</span> : ""],
            ["Exact", r.exact ? <span className="mono break-all" data-testid="reported-exact">{r.exact}{r.exact_high && r.exact_high !== r.exact ? ` to ${r.exact_high}` : ""}</span> : ""],
            ["Precision", r.exact_high && r.exact_high !== r.exact ? "an interval: the low and high exact sums are both shown" : "the published value is the contract's rendering of the exact decimal sum; the short form is the release's reading precision"],
            ["Interpretation", r.interpretation ?? ""],
            ["Warming potentials", r.gwp?.label ?? ""],
            ["Estimate", r.configuration?.label ?? ""],
            [r.period?.ids && r.period.ids.length > 1 ? "Periods" : "Period", periods],
            ["Months", months],
            ["Place", places],
            ["Spatial view", r.geography?.spatial_view ? viewLabel(labels, r.geography.spatial_view).split(":")[0] : ""],
            ["Rows summed", typeof r.n_rows === "number" ? String(r.n_rows) : ""],
            ["Release", commit ? <span className="mono" title={r.release?.release ?? ""} data-testid="reported-release">commit {commit.slice(0, 12)}</span> : ""],
          ]}
        />
      </div>
    </div>
  );
}

function Calculation({ claim }: { claim: Claim }) {
  const c = claim.calculation;
  if (!c) return null;
  const sql = field(c, "sql");
  const request = field(c, "request");
  let pretty = request;
  try {
    pretty = JSON.stringify(JSON.parse(request), null, 2);
  } catch {
    /* shown as received */
  }
  return (
    <div className="space-y-2 text-xs">
      <Dl
        rows={[
          ["Kind", field(c, "kind")],
          ["Formula", <span key="f" className="mono" data-allow-raw="">{field(c, "formula")}</span>],
          ["Table", <span key="t" className="mono">{field(c, "table")}{field(c, "column") ? ` · ${field(c, "column")}` : ""}</span>],
          ["Rows summed", field(c, "rows")],
          ["Result digest", <span key="d" className="mono break-all" data-testid="result-sha256">{field(c, "result_sha256")}</span>],
          ["Result ID", <span key="r" className="mono break-all">{field(c, "receipt")}</span>],
        ]}
      />
      {sql && <pre className={MONO_BLOCK} data-testid="claim-sql" data-allow-raw="">{formatSql(sql)}</pre>}
      {request && (
        <Details summary="Canonical request">
          <pre className={MONO_BLOCK} data-allow-raw="">{pretty}</pre>
        </Details>
      )}
    </div>
  );
}

function Activity({ claim, labels }: ClaimRecordProps) {
  const rows = claim.activity ?? [];
  const defs = claim.class_definitions;
  const params = new Map<string, ClaimRow>();
  for (const a of rows) for (const p of rowsOf(a, "activity_uncertainty")) params.set(field(p, "parameter_id"), p);
  return (
    <div>
      <Table
        testId="activity-table"
        rows={rows}
        columns={[
          { label: "Stream", cell: (r) => <span title={field(r, "stream")}>{streamLabel(labels, field(r, "stream"))}</span> },
          { label: "Category", cell: (r) => `${field(r, "ipcc_code")} ${field(r, "category")}`.trim() },
          { label: "Native mass", className: "num text-right", cell: (r) => `${field(r, "native_mass")} ${field(r, "native_unit")}`.trim() },
          { label: "Activity status", cell: (r) => field(r, "activity_status").replace(/_/g, " ") },
          { label: "Evidence", cell: (r) => (field(r, "evidence_class") ? <ClassCode id={field(r, "evidence_class")} defs={defs} /> : "") },
          { label: "Method", cell: (r) => <span className="mono" data-allow-raw="">{field(r, "method_id")}</span> },
          { label: "Period", cell: (r) => periodShort(labels, field(r, "period_id")) },
        ]}
      />
      {params.size > 0 && (
        <Details summary={`Activity parameters (${params.size})`} testId="activity-parameters">
          <Table
            rows={[...params.values()]}
            columns={[
              { label: "Parameter", cell: (r) => <span className="mono" data-allow-raw="">{field(r, "parameter_id")}</span> },
              { label: "Value", className: "num", cell: (r) => `${field(r, "value")} ${field(r, "unit")}`.trim() },
              { label: "Uncertainty", cell: (r) => `${pct(field(r, "uncert_pct_95"))}${field(r, "distribution") ? ` (${field(r, "distribution")})` : ""}` },
              { label: "Source", cell: (r) => field(r, "source") },
              { label: "Note", cell: (r) => field(r, "note") },
            ]}
          />
        </Details>
      )}
      {[...new Set(rows.map((r) => field(r, "evidence_class")).filter(Boolean))].map((id) => (
        <p key={id} className="mt-2 text-xs"><ClassLine id={id} defs={defs} /></p>
      ))}
    </div>
  );
}

function EmissionFactors({ claim }: { claim: Claim }) {
  const efs = claim.emission_factors ?? [];
  const methods = claim.method ?? [];
  return (
    <div className="space-y-3">
      {efs.length > 0 && (
        <Table
          testId="ef-table"
          rows={efs}
          columns={[
            { label: "Factor", cell: (r) => <span className="mono" data-allow-raw="">{field(r, "ef_id")}</span> },
            { label: "Item", cell: (r) => field(r, "item").replace(/_/g, " ") },
            { label: "Value", className: "num", cell: (r) => `${field(r, "value")} ${field(r, "unit")}`.trim() },
            { label: "Uncertainty", cell: (r) => pct(field(r, "uncert_pct")) },
            { label: "Vintage", cell: (r) => field(r, "vintage") },
            { label: "Source", cell: (r) => field(r, "source") },
            { label: "Streams", className: "text-right", cell: (r) => String(listOf(r, "streams").length || "") },
            { label: "Found in", cell: (r) => listOf(r, "found_in").join(", ") },
          ]}
        />
      )}
      {efs.length === 0 && methods.length > 0 && <p className="text-xs text-muted">No emission-factor row is registered for these streams; the method rule below names the equation.</p>}
      {methods.length > 0 && (
        <div data-testid="method-rules">
          <h4 className="micro">Method rule</h4>
          <Table
            rows={methods}
            columns={[
              { label: "Method", cell: (r) => <span className="mono" data-allow-raw="">{field(r, "method_id")}</span> },
              { label: "Category", cell: (r) => field(r, "category") },
              { label: "Tier", cell: (r) => field(r, "tier") },
              { label: "Equation", cell: (r) => field(r, "equation") },
              { label: "Uncertainty model", cell: (r) => field(r, "uncertainty_model_id").replace(/_/g, " ") },
              { label: "Notes", cell: (r) => field(r, "notes") },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function MonthlyBasis({ claim, labels }: ClaimRecordProps) {
  const m = claim.monthly_basis;
  if (!m) return null;
  const defs = claim.class_definitions;
  const profile = objOf(m, "profile");
  const tclass = field(m, "temporal_class");
  const classes = listOf(m, "classes");
  const grades = listOf(m, "grades");
  const byStream = rowsOf(m, "by_stream");
  return (
    <div className="space-y-2 text-xs">
      <Dl
        testId="monthly-rows"
        rows={[
          ["Temporal class", tclass ? <ClassLine id={tclass} defs={defs} /> : <span data-testid="streams-differ">the streams differ: {classes.map((c, i) => <span key={c}>{i ? ", " : ""}<ClassCode id={c} defs={defs} /></span>)}</span>],
          ["Timing grade", field(m, "temporal_evidence_grade") || (grades.length ? `the streams differ: ${grades.join(", ")}` : "")],
          ["Profile", profile ? `${field(profile, "shape")}${field(profile, "basis") ? ` — ${field(profile, "basis")}` : ""}` : field(m, "temporal_profile_id") ? <span className="mono" data-allow-raw="">{field(m, "temporal_profile_id")}</span> : ""],
          ["Profile source", profile ? `${field(profile, "profile_source")}${field(profile, "profile_period") && field(profile, "profile_period") !== "n/a" ? ` (${field(profile, "profile_period")})` : ""}` : ""],
          ["Closure basis", field(m, "closure_basis").replace(/_/g, " ")],
          ["Streams", `${field(m, "n_streams")}${field(m, "stream_basis") ? ` — ${field(m, "stream_basis")}` : ""}`],
          ["Note", field(m, "note")],
        ]}
      />
      {!tclass && classes.map((c) => <p key={c}><ClassLine id={c} defs={defs} /></p>)}
      {byStream.length > 0 && (
        <Details summary={`Per stream (${byStream.length})`} testId="monthly-by-stream">
          <Table
            rows={byStream}
            columns={[
              { label: "Stream", cell: (r) => <span title={field(r, "stream")}>{streamLabel(labels, field(r, "stream"))}</span> },
              { label: "Class", cell: (r) => (field(r, "temporal_class") ? <ClassCode id={field(r, "temporal_class")} defs={defs} /> : "") },
              { label: "Grade", cell: (r) => field(r, "temporal_evidence_grade") },
              { label: "Profile", cell: (r) => { const p = objOf(r, "profile"); return p ? `${field(p, "shape")} — ${field(p, "basis")}` : field(r, "temporal_profile_id"); } },
              { label: "Closure", cell: (r) => field(r, "closure_basis").replace(/_/g, " ") },
              { label: "Monthly rows", className: "text-right", cell: (r) => field(objOf(r, "monthly"), "n_rows") },
            ]}
          />
        </Details>
      )}
    </div>
  );
}

function SpatialBasis({ claim, labels }: ClaimRecordProps) {
  const s = claim.spatial_basis;
  if (!s) return null;
  const defs = claim.class_definitions;
  const unit = claim.reported?.unit_short ?? "";
  const sclass = field(s, "spatial_class_measured");
  const classes = listOf(s, "classes");
  const placements = listOf(s, "placement_classes");
  const byStream = rowsOf(s, "by_stream");
  const rationale = rowsOf(s, "rationale");
  const fallbackShort = field(s, "fallback_Mt_AR5_short");
  return (
    <div className="space-y-2 text-xs">
      <Dl
        testId="spatial-rows"
        rows={[
          ["Spatial class", sclass ? <ClassLine id={sclass} defs={defs} /> : <span data-testid="streams-differ">the streams differ: {classes.map((c, i) => <span key={c}>{i ? ", " : ""}<ClassCode id={c} defs={defs} /></span>)}</span>],
          ["Placement", field(s, "placement_class").replace(/_/g, " ") || (placements.length ? `the streams differ: ${placements.map((p) => p.replace(/_/g, " ")).join(", ")}` : "")],
          ["Allocation surface", field(s, "allocation_surface").replace(/_/g, " ")],
          ["Geometry", field(s, "geometry_id") ? <span className="mono" data-allow-raw="">{field(s, "geometry_id")}</span> : ""],
          ["Release height", field(s, "release_height_class").replace(/_/g, " ")],
          ["Fallback events", field(s, "fallback_events")],
          ["Fallback mass", fallbackShort ? <span className="num">{fallbackShort} {unit}</span> : field(s, "fallback_events") ? "differs by stream (see per stream)" : ""],
          ["Streams", `${field(s, "n_streams")}${field(s, "stream_basis") ? ` — ${field(s, "stream_basis")}` : ""}`],
          ["Note", field(s, "note")],
        ]}
      />
      {!sclass && classes.map((c) => <p key={c}><ClassLine id={c} defs={defs} /></p>)}
      {rationale.length > 0 && (
        <ul className="space-y-0.5" data-testid="spatial-rationale">
          {rationale.map((r, i) => (
            <li key={i}>
              <span className="font-semibold text-fg">{field(r, "category") || field(r, "module")}</span> · {field(r, "spatial_view") ? `${viewLabel(labels, field(r, "spatial_view")).split(":")[0]} view: ` : ""}{field(r, "rationale")}{field(r, "view_reason") ? ` (${field(r, "view_reason")})` : ""} <span className="text-muted">({field(r, "registry")})</span>
            </li>
          ))}
        </ul>
      )}
      {byStream.length > 0 && (
        <Details summary={`Per stream (${byStream.length})`} testId="spatial-by-stream">
          <Table
            rows={byStream}
            columns={[
              { label: "Stream", cell: (r) => <span title={field(r, "stream")}>{streamLabel(labels, field(r, "stream"))}</span> },
              { label: "Class", cell: (r) => (field(r, "spatial_class_measured") ? <ClassCode id={field(r, "spatial_class_measured")} defs={defs} /> : "") },
              { label: "Placement", cell: (r) => field(r, "placement_class").replace(/_/g, " ") },
              { label: "Surface", cell: (r) => field(r, "allocation_surface").replace(/_/g, " ") },
              { label: "Unresolved", className: "num", cell: (r) => (field(r, "unresolved_Mt_AR5_short") ? `${field(r, "unresolved_Mt_AR5_short")} ${unit}` : "") },
              { label: "Fallbacks", className: "num", cell: (r) => `${field(r, "fallback_events")}${field(r, "fallback_Mt_AR5_short") ? ` · ${field(r, "fallback_Mt_AR5_short")} ${unit}` : ""}` },
              { label: "Release height", cell: (r) => field(r, "release_height_class").replace(/_/g, " ") },
            ]}
          />
        </Details>
      )}
    </div>
  );
}

function Uncertainty({ claim }: { claim: Claim }) {
  const rows = claim.uncertainty ?? [];
  const unit = claim.reported?.unit_short ?? "";
  return (
    <div>
      <Table
        testId="uncertainty-table"
        rows={rows}
        columns={[
          { label: "Resolution", cell: (r) => field(r, "resolution").replace(/_/g, " ") },
          { label: "Category", cell: (r) => field(r, "category") },
          { label: "Estimate", className: "num", cell: (r) => (field(r, "estimate_Mt") ? `${field(r, "estimate_Mt")} ${unit}` : "") },
          { label: "Parametric", className: "num", cell: (r) => `${pct(field(r, "parametric_low_pct"))} to ${pct(field(r, "parametric_high_pct"))}` },
          { label: "Timing", cell: (r) => `${pct(field(r, "timing_pct"))}${field(r, "timing_status") ? ` (${field(r, "timing_status").replace(/-/g, " ")})` : ""}` },
          { label: "Placement", cell: (r) => `${pct(field(r, "placement_pct"))}${field(r, "placement_status") ? ` (${field(r, "placement_status").replace(/-/g, " ")})` : ""}` },
          { label: "Envelope", className: "num", cell: (r) => `${pct(field(r, "envelope_low_pct"))} to ${pct(field(r, "envelope_high_pct"))}` },
          { label: "Unpriced", cell: (r) => field(r, "unpriced_components") },
        ]}
      />
      {rows[0] && (
        <Details summary="How these intervals are defined" testId="uncertainty-definitions">
          <Dl rows={[["Parametric", field(rows[0], "parametric_kind")], ["Envelope", field(rows[0], "envelope_kind")], ["Bracket", field(rows[0], "bracket_kind")], ["Aggregation", field(rows[0], "aggregation_rule")], ["Correlation within category", field(rows[0], "correlation_within_category")], ["Completeness bound", field(rows[0], "completeness_bound_Mt") ? `${field(rows[0], "completeness_bound_Mt")} ${unit} (${field(rows[0], "completeness_bound_source")})` : field(rows[0], "completeness_bound_source").replace(/_/g, " ")]]} />
        </Details>
      )}
    </div>
  );
}

function documentName(r: ClaimRow): string {
  return field(r, "data_file") || field(r, "title") || field(r, "document_id") || field(r, "document") || field(r, "path") || field(r, "primary_source");
}

function Sources({ claim, labels }: ClaimRecordProps) {
  const rows = claim.sources ?? [];
  const pages = (claim.missing ?? []).find((m) => m.section === "sources.pages");
  return (
    <div className="space-y-2">
      <ul className="space-y-3 text-xs" data-testid="sources-list">
        {rows.map((r, i) => (
          <li key={i} className="rounded-md bg-surface-3/60 p-2" data-testid="source-row" data-kind={field(r, "kind")}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="pill bg-surface-3 px-2 py-0.5 text-micro normal-case tracking-normal text-muted">{field(r, "kind").replace(/_/g, " ")}</span>
              <span className="mono font-semibold text-fg" data-allow-raw="">{documentName(r)}</span>
            </div>
            <Dl
              rows={[
                ["Primary source", field(r, "primary_source")],
                ["Archival state", `${field(r, "archival_state")}${field(r, "archived_path") ? ` (${field(r, "archived_path")})` : ""}`],
                ["Licence", field(r, "licence_status").replace(/_/g, " ")],
                ["Document sha256", field(r, "document_sha256") ? <span className="mono break-all">{field(r, "document_sha256")}</span> : ""],
                ["Streams", listOf(r, "streams").length ? `${listOf(r, "streams").length}: ${listOf(r, "streams").map((s) => streamLabel(labels, s)).join("; ")}` : ""],
                ["Found in", listOf(r, "found_in").join(", ")],
                ["Pages", <span key="p" data-testid="source-pages">{field(r, "pages") || (pages ? `${NOT_CARRIED} — ${pages.message.replace(/^not carried by this release:?\s*/i, "")}` : NOT_CARRIED)}</span>],
              ]}
            />
            {(field(r, "how_to_obtain") || field(r, "note")) && (
              <Details summary="How to obtain, and the register's note">
                {field(r, "how_to_obtain") && <p className="text-fg">{field(r, "how_to_obtain")}</p>}
                {field(r, "note") && <p className="mt-1 text-muted">{field(r, "note")}</p>}
                {field(r, "inbound_use") && <p className="mt-1 text-muted">Inbound use: {field(r, "inbound_use").replace(/-/g, " ")}; redistribution: {field(r, "outbound_redistribution").replace(/-/g, " ")}{field(r, "document_not_deposited_because") ? `; not deposited: ${field(r, "document_not_deposited_because")}` : ""}</p>}
              </Details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Validation({ claim }: { claim: Claim }) {
  const rows = claim.validation ?? [];
  return (
    <ul className="space-y-1 text-xs" data-testid="validation-list">
      {rows.map((r, i) => {
        const id = field(r, "validation_id") || field(r, "benchmark_id") || field(r, "benchmark_task_id") || field(r, "id");
        const exists = field(r, "exists") || field(r, "wired") || field(r, "status");
        return (
          <li key={i} className="rounded-md bg-surface-3/60 px-2 py-1.5" data-testid="validation-row" data-kind={field(r, "kind")}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="pill bg-surface-3 px-2 py-0.5 text-micro normal-case tracking-normal text-muted">{field(r, "kind").replace(/_/g, " ")}</span>
              <span className="mono font-semibold text-fg" data-allow-raw="">{id}</span>
              {field(r, "property_tested") && <span className="text-muted">{field(r, "property_tested")}</span>}
              {field(r, "grain") && <span className="text-muted">· {field(r, "grain")}</span>}
              {exists && <span className="text-muted">· {exists.replace(/_/g, " ")}</span>}
              {field(r, "verdict_tally") && <span className="text-fg">· {field(r, "verdict_tally")}</span>}
              {field(r, "result_metric") && field(r, "result_metric") !== "none" && <span className="text-fg">· {field(r, "result_metric")}</span>}
            </div>
            {field(r, "source") && <p className="mt-0.5 text-muted">{field(r, "source")}</p>}
            <Details summary="Every field of the row">
              <AllFields row={r} skip={["kind"]} />
            </Details>
          </li>
        );
      })}
    </ul>
  );
}

function Limitations({ claim }: { claim: Claim }) {
  const lims = claim.limitations ?? [];
  const c = claim.completeness;
  const gap = objOf(c, "gap");
  const rows = rowsOf(c, "rows");
  const massRows = rowsOf(c, "mass_rows");
  return (
    <div className="space-y-3 text-xs">
      {lims.length > 0 && (
        <ul className="space-y-1" data-testid="limitations-list">
          {lims.map((l, i) => (
            <li key={i} data-testid="limitation-row">
              <span className="mono font-semibold" data-allow-raw="">{field(l, "id")}</span>
              {field(l, "notation_key") && <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-micro normal-case tracking-normal text-muted">{field(l, "notation_key")}</span>}
              <span className="ml-2 text-fg">{field(l, "worded") || field(l, "message")}</span>
              {field(l, "scope") && <span className="ml-1 text-muted">(scope: {field(l, "scope")})</span>}
            </li>
          ))}
        </ul>
      )}
      {c && (
        <div data-testid="completeness-block">
          <h4 className="micro">Completeness</h4>
          <Dl
            rows={[
              ["Notation key", field(c, "notation_key")],
              ["Justification", field(c, "justification")],
              ["Claim class", field(c, "claim_class")],
              ["Gap", gap ? `${field(gap, "gap_id") || field(gap, "id")}${field(gap, "description") ? ` — ${field(gap, "description")}` : ""}` : ""],
              ["Note", field(c, "note")],
            ]}
          />
          {gap && (
            <Details summary="The data-gap row">
              <AllFields row={gap} />
            </Details>
          )}
          {rows.length > 0 && (
            <Details summary={`Ledger rows under this scope (${rows.length})`} testId="completeness-rows">
              <Table rows={rows} columns={[{ label: "Code", cell: (r) => field(r, "code") }, { label: "Category", cell: (r) => field(r, "category") }, { label: "Gas", cell: (r) => field(r, "gas") }, { label: "Key", cell: (r) => field(r, "notation_key") }, { label: "Justification", cell: (r) => field(r, "justification") }]} />
            </Details>
          )}
          {massRows.length > 0 && (
            <Details summary={`Mass ledger rows (${massRows.length})`}>
              {massRows.map((r, i) => (
                <div key={i} className="mb-2"><AllFields row={r} /></div>
              ))}
            </Details>
          )}
        </div>
      )}
    </div>
  );
}

const RECORDS_FIRST = 8;

function Rows({ claim }: { claim: Claim }) {
  const r = claim.rows;
  const [all, setAll] = useState(false);
  if (!r) return null;
  const columns = listOf(r, "columns");
  const records = rowsOf(r, "records");
  const download = objOf(r, "download");
  const shown = all ? records : records.slice(0, RECORDS_FIRST);
  const links: [string, string, ReactNode][] = [
    ["Download CSV", field(download, "csv"), <Download key="c" size={12} />],
    ["Receipt JSON", field(download, "receipt_json"), <FileJson key="j" size={12} />],
    ["Replay", field(download, "replay"), <ExternalLink key="r" size={12} />],
  ];
  return (
    <div className="space-y-2 text-xs">
      <Dl
        rows={[
          ["Table", <span key="t" className="mono">{field(r, "table")}{field(r, "path") ? ` (${field(r, "path")})` : ""}</span>],
          ["Digest", <span key="d" className="mono break-all">{field(r, "sha256")}</span>],
          ["Rows", `${field(r, "n")}${field(r, "records_truncated") === "true" ? ` (the first ${field(r, "records_cap")} listed; the CSV carries every one)` : ""}`],
          ["Columns", <span key="c" className="mono" data-allow-raw="">{columns.join(", ")}</span>],
        ]}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="rows-links">
        {links.filter(([, href]) => href).map(([label, href, icon]) => (
          <a key={label} href={apiUrl(href)} className={LINK} data-testid={`rows-${label.toLowerCase().replace(/\s+/g, "-")}`}>{icon} {label}</a>
        ))}
      </div>
      {records.length > 0 && (
        <>
          <Table testId="records-table" raw rows={shown} columns={columns.map((c) => ({ label: c, cell: (row: ClaimRow) => <span className="mono">{cellText(row[c])}</span> }))} />
          {records.length > RECORDS_FIRST && (
            <button type="button" className={LINK} onClick={() => setAll((a) => !a)} data-testid="rows-toggle">
              {all ? `Show the first ${RECORDS_FIRST}` : `Show all ${records.length} records`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function ClaimBreadcrumb({ claim, labels, dims }: ClaimRecordProps) {
  return (
    <nav aria-label="Claim" className="flex flex-wrap items-end gap-x-2 gap-y-1" data-testid="claim-breadcrumb" data-text={breadcrumbText(labels, dims, claim)}>
      {claim.breadcrumb.map((c, i) => (
        <span key={`${c.level}-${i}`} className="flex items-end gap-2">
          {i > 0 && <span className="pb-0.5 text-muted" aria-hidden="true">→</span>}
          <span className="flex flex-col" data-testid="crumb" data-level={c.level}>
            <span className="micro">{LEVEL_WORDS[c.level] ?? c.level}</span>
            <span className="text-sm font-semibold text-fg" title={c.ids?.length ? c.ids.join(", ") : undefined} data-testid="crumb-label">{crumbLabel(labels, dims, c)}{typeof c.n === "number" && c.id === null ? <span className="text-xs font-normal text-muted"> ({c.n})</span> : null}</span>
          </span>
        </span>
      ))}
    </nav>
  );
}

export function ClaimRecord(props: ClaimRecordProps) {
  const { claim } = props;
  const provenance = claim.provenance ?? [];
  const bodies: Record<ClaimSectionId, ReactNode> = {
    reported: <Reported {...props} />,
    calculation: <Calculation claim={claim} />,
    activity: <Activity {...props} />,
    emission_factors: <EmissionFactors claim={claim} />,
    monthly_basis: <MonthlyBasis {...props} />,
    spatial_basis: <SpatialBasis {...props} />,
    uncertainty: <Uncertainty claim={claim} />,
    sources: <Sources {...props} />,
    validation: <Validation claim={claim} />,
    limitations: <Limitations claim={claim} />,
    rows: <Rows claim={claim} />,
  };
  return (
    <article className="space-y-4" data-testid="claim-record">
      <ClaimBreadcrumb {...props} />
      {CLAIM_SECTIONS.map((s) => (
        <Section key={s.id} id={s.id} title={s.title} claim={claim}>
          {bodies[s.id]}
        </Section>
      ))}
      {provenance.length > 0 && (
        <section className="border-t border-line pt-4" data-testid="claim-provenance">
          <Details summary={`Tables and registries read (${provenance.length})`}>
            <ul className="space-y-0.5 text-xs" data-allow-raw="">
              {provenance.map((p, i) => (
                <li key={i} className="mono break-all text-muted">{field(p, "name")}: {field(p, "path")} <span className="text-fg/60">sha256 {field(p, "sha256")}</span> ({field(p, "identity")})</li>
              ))}
            </ul>
          </Details>
        </section>
      )}
    </article>
  );
}
