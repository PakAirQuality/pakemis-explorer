"use client";
/**
 * The /methods/sectors/[sector] client host: the data hooks that used to live on the
 * catalogue page (the sector's evidence streams, its registered rules, its envelope, the
 * national partition for its share, the completeness ledger), handed to the public
 * SectorPage in the reader's words - and the old dense technical card, rendered ONLY inside
 * the page's Technical method drawer. An unknown sector renders the index's road back.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ScrollText, Sigma, Table2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { ipccSectorNumber, neRowsFor, sectorCodes, type CodedCell } from "@/lib/completeness";
import { cellUnit, configWords, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell } from "@/lib/envelope";
import { useCompleteness, useEmissions, useEvidence, useMethod } from "@/lib/queries";
import { scopeBody } from "@/lib/requests";
import { NavHeader } from "@/components/shell/NavCapsule";
import { CurrentView } from "@/components/shell/CurrentView";
import { Widget, ICON_BUTTON, WIDGET_TITLE } from "@/components/ui/Widget";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { useEnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { AXIS_LABEL, evidenceClassText, plainGlance, EVIDENCE_CLASS_TEXT } from "./evidenceClassText";
import { includedLabel, plainGap, sectorStory, sectorText, sourceWords, statusBadge } from "./sectorText";
import { METHODS } from "./Methods";
import { SectorPage } from "./SectorPage";

type StreamCell = Cell & { source_stream_id?: string; module?: string; ipcc_code?: string; ipcc_category?: string; sub_category?: string; source_id?: string; evidence_class?: string; temporal_class?: string; spatial_class_measured?: string };
type RuleCell = Cell & { category?: string; tier?: string; equation?: string; notes?: string; method_id?: string; uncertainty_model_id?: string };
type NeCell = Cell & { code?: string; category?: string; gas?: string; justification?: string };

const ACTIVITY_SHOWN = 12;
const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";

function distinct(cells: Record<string, unknown>[], key: string): string[] {
  const out: string[] = [];
  for (const c of cells) {
    const v = c[key];
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}

export function SectorRoute({ sector }: { sector: string }) {
  const { state, labels, dims } = useExplorer();
  const [equations, setEquations] = useState(false);
  const evidence = useEvidence("_", { module: sector }, !!sector);
  const rules = useMethod(sector, !!sector);
  const sectorBody = useMemo(() => scopeBody({ ...state, sector }), [state, sector]);
  const result = useEmissions(sectorBody, !!sector);
  const completeness = useCompleteness({ notation_keys: ["NE"] });
  const shareQ = useEmissions(useMemo(() => ({ periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp, group_by: ["sector_id"], order_by: "value desc" }), [state.period, state.config, state.gwp]), true);
  const shareCell = (shareQ.data?.values ?? []).find((c) => c.group?.sector_id === sector) ?? null;
  const drawer = useEnvelopeDrawer(labels);

  const streams = (evidence.data?.values ?? []) as StreamCell[];
  const codes = sectorCodes(streams as CodedCell[]);
  const ne = neRowsFor((completeness.data?.values ?? []) as NeCell[], codes);
  const ruleCells = (rules.data?.values ?? []) as RuleCell[];
  const cell = result.data?.values[0];
  const estimated = !!cell && typeof cell.value === "number";
  const text = sectorText(sector);
  const story = sectorStory(sector);
  const sources = distinct(streams, "source_id").filter((s) => s !== "no_national_quantity");
  const activities = distinct(streams, "sub_category");
  const classes = (key: "evidence_class" | "temporal_class" | "spatial_class_measured") => distinct(streams, key).sort();
  const models = distinct(ruleCells, "uncertainty_model_id");
  const number = ipccSectorNumber(codes);

  return (
    <div className="min-h-dvh bg-surface" data-testid="sector-route">
      <NavHeader />
      <CurrentView compact />
      <SectorPage
        sector={sector}
        number={number}
        labels={labels}
        dek={story.dek}
        step1={story.step1}
        step2={story.step2}
        cell={cell}
        shareCell={shareCell}
        period={state.period}
        sources={sources.map(sourceWords)}
        included={distinct(streams, "ipcc_category").map(includedLabel)}
        gaps={ne.map((r) => plainGap(r.category ?? "")).filter(Boolean)}
        glance={{
          annual: plainGlance("E", classes("evidence_class")),
          monthly: plainGlance("TE", classes("temporal_class")),
          location: plainGlance("S", classes("spatial_class_measured")),
        }}
      >
        <Widget
          className="mt-6"
          title={number ? `IPCC sector ${number}` : "Sector"}
          env={evidence.data}
          labels={labels}
          infoTab="sources"
          testId="sector-card"
          tools={
            <Link href={`/data?sector=${encodeURIComponent(sector)}`} className={ICON_BUTTON} aria-label={METHODS.rows} title={METHODS.rows} data-testid="open-rows-icon">
              <Table2 size={14} />
            </Link>
          }
          sentence={
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold text-fg" data-testid="sector-name">{sectorLabel(labels, sector)}</span>
              {(result.data || result.error) && (
                <span className={`pill px-2 py-0.5 text-xs ${estimated ? (ne.length ? "bg-amber/15 text-amber-soft" : "bg-accent-soft text-accent") : "bg-surface-3 text-muted"}`} data-testid="status-badge">
                  {statusBadge(estimated, ne.length)}
                </span>
              )}
            </span>
          }
          caption={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button type="button" className={TEXT_BUTTON} onClick={() => setEquations((e) => !e)} aria-expanded={equations} data-testid="view-equations">
                <Sigma size={12} /> {METHODS.equations}
              </button>
              <button type="button" className={TEXT_BUTTON} onClick={() => evidence.data && drawer.open(evidence.data, "sources")} disabled={!evidence.data} data-testid="inspect-sources">
                <ScrollText size={12} /> {METHODS.sources}
              </button>
              <Link href={`/data?sector=${encodeURIComponent(sector)}`} className={TEXT_BUTTON} data-testid="open-rows">
                <Table2 size={12} /> {METHODS.rows}
              </Link>
            </span>
          }
        >
          <p className="text-sm text-fg" data-testid="sector-summary">{text.summary}</p>
          <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4" data-testid="steps">
            <Step n={1} title={METHODS.steps[0]} text={text.sources}>
              {sources.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1" data-testid="step-sources">
                  {sources.map((s) => <li key={s} className="rounded bg-surface-3 px-1.5 py-0.5 text-micro normal-case tracking-normal text-muted" title={s}>{sourceWords(s)}</li>)}
                </ul>
              )}
            </Step>
            <Step n={2} title={METHODS.steps[1]} text={text.activity}>
              {activities.length > 0 && (
                <p className="mt-1 text-micro normal-case tracking-normal text-muted" data-testid="step-activity" title={activities.join(" · ")}>
                  {activities.slice(0, ACTIVITY_SHOWN).map((a) => a.replace(/[_-]/g, " ")).join(" · ")}
                  {activities.length > ACTIVITY_SHOWN ? ` · and ${activities.length - ACTIVITY_SHOWN} more` : ""}
                </p>
              )}
            </Step>
            <Step n={3} title={METHODS.steps[2]} text={`${METHODS.methodLead}. ${text.method}`}>
              {rules.data ? (
                <p className="mt-1 text-micro normal-case tracking-normal text-muted" data-testid="step-method">{ruleCells.length === 1 ? "one registered rule" : `${ruleCells.length} registered rules`}{ruleCells.length ? `: ${distinct(ruleCells, "category").join(", ")}` : ""}</p>
              ) : rules.error ? (
                <div className="mt-1"><RefusalCard error={rules.error} compact /></div>
              ) : null}
            </Step>
            <Step n={4} title={METHODS.steps[3]} text={`The ${configWords(labels, state.config)} for ${periodShort(labels, state.period)}.`}>
              {cell ? (
                <p className="mt-1 text-fg" data-testid="step-result">
                  <span className="num text-lg font-semibold" title={`${cell.display} ${cell.unit} (contract precision) · exact ${cell.exact}`}>{shown(cell)}</span> <span className="text-xs text-muted">{cellUnit(cell)} in {periodShort(labels, state.period)}</span>
                </p>
              ) : result.error ? (
                <div className="mt-1"><RefusalCard error={result.error} compact /></div>
              ) : (
                <div className="mt-1"><Loading what="the sector's total" /></div>
              )}
            </Step>
          </ol>

          {equations && (
            <div className="mt-4" data-testid="equations">
              <h3 className={WIDGET_TITLE}>{METHODS.methodLead}</h3>
              {rules.data ? (
                <div className="mt-2"><EnvelopeTable env={rules.data} labels={labels} dims={dims} extra={["category", "tier", "equation", "notes"]} dense /></div>
              ) : rules.error ? (
                <div className="mt-2"><RefusalCard error={rules.error} compact /></div>
              ) : (
                <div className="mt-2"><Loading what="the method registry" /></div>
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div data-testid="dimensions">
              <h3 className={WIDGET_TITLE}>{METHODS.dimensions}</h3>
              <dl className="mt-2 space-y-2 text-xs">
                <Dim label={AXIS_LABEL.E} ids={classes("evidence_class")} loading={evidence.isLoading} />
                <Dim label={AXIS_LABEL.TE} ids={classes("temporal_class")} loading={evidence.isLoading} />
                <Dim label={AXIS_LABEL.S} ids={classes("spatial_class_measured")} loading={evidence.isLoading} />
                <div>
                  <dt className="font-semibold text-fg">Uncertainty</dt>
                  <dd className="text-muted" data-testid="dim-uncertainty">
                    {models.length ? <>The rules draw from {models.length === 1 ? "one uncertainty model" : `${models.length} uncertainty models`} ({models.map((m) => m.replace(/_/g, " ")).join("; ")}); the national interval and the draws are under Explore.</> : rules.data ? "No uncertainty model is registered for this sector." : "…"}
                  </dd>
                </div>
              </dl>
              {evidence.error && <div className="mt-2"><RefusalCard error={evidence.error} compact /></div>}
            </div>
            <div data-testid="limitations">
              <h3 className={WIDGET_TITLE}>{METHODS.limitations}</h3>
              {completeness.data ? (
                ne.length ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {ne.map((r, i) => (
                      <li key={i} className="flex gap-2" title={r.justification} data-testid="ne-row">
                        <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-micro normal-case tracking-normal text-muted">NE</span>
                        <span className="text-fg">{r.category}{r.gas ? <span className="text-muted"> · {r.gas}</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted" data-testid="ne-none">No category of this sector is marked not estimated in the completeness ledger.</p>
                )
              ) : completeness.error ? (
                <div className="mt-2"><RefusalCard error={completeness.error} compact /></div>
              ) : (
                <div className="mt-2"><Loading what="the completeness ledger" /></div>
              )}
              {labels.limitations.config_S_residential_only && sector === "residential" && <p className="mt-2 text-xs text-muted">{labels.limitations.config_S_residential_only}</p>}
            </div>
          </div>
        </Widget>
      </SectorPage>
      {drawer.node}
    </div>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children?: React.ReactNode }) {
  return (
    <li className="rounded-md border border-line bg-surface-3/60 px-3 py-2.5" data-testid={`step-${n}`}>
      <div className="micro">{n} · {title}</div>
      <p className="mt-1 text-xs text-fg">{text}</p>
      {children}
    </li>
  );
}

function Dim({ label, ids, loading }: { label: string; ids: string[]; loading: boolean }) {
  return (
    <div data-testid={`dim-${label.split(" ")[0].toLowerCase()}`}>
      <dt className="font-semibold text-fg">{label}</dt>
      <dd className="text-muted">
        {ids.length ? ids.map((id) => <span key={id} className="block" title={EVIDENCE_CLASS_TEXT[id]?.definition}>{evidenceClassText(id)}</span>) : loading ? "…" : "not graded"}
      </dd>
    </div>
  );
}
