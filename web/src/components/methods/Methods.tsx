"use client";
/**
 * Methods & evidence (plan §/methods): a search field over the sectors, their IPCC categories,
 * streams and sources (from get_evidence(_)), the Browse sectors grid (the ten modules; the
 * selected one is the URL's `sector`), the sector widget (eyebrow "IPCC sector n" from the
 * module's codes, the status badge from the completeness ledger, the authored summary, the four
 * steps with the release's own lists: source records from the streams' source ids, activity
 * from their sub-categories, the registry's rules from get_method(sector), the result as the
 * sector envelope's display_short), the Evidence dimensions rows worded verbatim from
 * dim_evidence_class, the module's not-estimated categories, and View equations / Inspect
 * sources / Open data rows. Under the card, the claim-record browser (ClaimBrowser: Sector →
 * Category → Gas → Place → Period, one query, the record inline, `?claim=` as the permalink).
 * The methodology prose sits under it with id="methodology".
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { BookOpen, ScrollText, Search, Sigma, Table2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { ipccSectorNumber, neRowsFor, sectorCodes, type CodedCell } from "@/lib/completeness";
import { cellUnit, configWords, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell } from "@/lib/envelope";
import { useCompleteness, useEmissions, useEvidence, useMethod } from "@/lib/queries";
import { scopeBody } from "@/lib/requests";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { SEGMENT_GROUP_CLASS, segmentClass } from "@/components/workspace/PaneSwitch";
import { CurrentView } from "@/components/shell/CurrentView";
import { ACTION_CLASS, PageHeader } from "@/components/shell/PageHeader";
import { Widget, ICON_BUTTON, WIDGET_TITLE } from "@/components/ui/Widget";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { useEnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { AXIS_LABEL, evidenceClassText, EVIDENCE_CLASS_TEXT } from "./evidenceClassText";
import { sectorText, sourceWords, statusBadge } from "./sectorText";
import { Methodology } from "./Methodology";
import { ClaimBrowser } from "./ClaimBrowser";
import { Story } from "./Story";
import { SectorPage } from "./SectorPage";

export const METHODS = {
  title: "Methods & evidence",
  dek: "Understand how an estimate was constructed, where its activity data came from and which parts are observed, modelled, proxy-allocated or not estimated.",
  read: "Read methodology",
  search: "Find a sector, IPCC category or source",
  browse: "Browse sectors",
  steps: ["Source records", "Activity", "Method", "Result"],
  methodLead: "Registered IPCC category equations",
  dimensions: "Evidence dimensions",
  limitations: "Known limitations",
  equations: "View equations",
  sources: "Inspect sources",
  rows: "Open data rows",
  modes: { label: "How to read this page", story: "Story", catalogue: "Evidence catalogue" },
} as const;

const MODES = ["story", "catalogue"] as const;

type StreamCell = Cell & { source_stream_id?: string; module?: string; ipcc_code?: string; ipcc_category?: string; sub_category?: string; source_id?: string; evidence_class?: string; temporal_class?: string; spatial_class_measured?: string; placement_class?: string; allocation_surface?: string };
type RuleCell = Cell & { category?: string; tier?: string; equation?: string; notes?: string; method_id?: string; uncertainty_model_id?: string };
type NeCell = Cell & { code?: string; category?: string; gas?: string; gap_id?: string; justification?: string };

/** How many activity descriptors a step lists before "and n more" (agriculture carries dozens). */
const ACTIVITY_SHOWN = 12;
const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";

/** The distinct values of one field over the cells, in first-seen order. */
function distinct(cells: Record<string, unknown>[], key: string): string[] {
  const out: string[] = [];
  for (const c of cells) {
    const v = c[key];
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Whether a sector matches the search: its label, or any category, stream, source or sub-category of its streams. */
export function sectorMatches(query: string, label: string, streams: StreamCell[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (label.toLowerCase().includes(q)) return true;
  return streams.some((s) => [s.ipcc_category, s.ipcc_code, s.source_stream_id, s.source_id, s.sub_category].some((v) => typeof v === "string" && v.toLowerCase().replace(/[_|-]/g, " ").includes(q.replace(/[_|-]/g, " "))));
}

export function Methods() {
  const { state, setState, labels, dims } = useExplorer();
  // the page's two modes: the story opens; ?claim= (a claim permalink) forces the catalogue
  const [modeParam, setModeParam] = useQueryState("mode", parseAsStringLiteral(MODES));
  const [claimParam, setClaimParam] = useQueryState("claim", parseAsString);
  const mode = claimParam ? "catalogue" : modeParam ?? "story";
  const catalogue = mode === "catalogue";
  const [query, setQuery] = useState("");
  const [equations, setEquations] = useState(false);
  // the catalogue opens on the sector index; a chosen sector (the URL's own key) opens its page
  const sector = state.sector && dims.sectors.includes(state.sector) ? state.sector : "";
  const all = useEvidence("_", {});
  const streamsByModule = useMemo(() => {
    const m = new Map<string, StreamCell[]>();
    for (const c of (all.data?.values ?? []) as StreamCell[]) {
      const mod = c.module ?? "";
      m.set(mod, [...(m.get(mod) ?? []), c]);
    }
    return m;
  }, [all.data]);
  const evidence = useEvidence("_", { module: sector }, catalogue && !!sector);
  const rules = useMethod(sector, catalogue && !!sector);
  const sectorBody = useMemo(() => scopeBody({ ...state, sector }), [state, sector]);
  const result = useEmissions(sectorBody, catalogue && !!sector);
  const completeness = useCompleteness({ notation_keys: ["NE"] });
  const shareQ = useEmissions(useMemo(() => ({ periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp, group_by: ["sector_id"], order_by: "value desc" }), [state.period, state.config, state.gwp]), catalogue && !!sector);
  const shareCell = (shareQ.data?.values ?? []).find((c) => c.group?.sector_id === sector) ?? null;
  const drawer = useEnvelopeDrawer(labels);

  const streams = (evidence.data?.values ?? []) as StreamCell[];
  const codes = sectorCodes(streams as CodedCell[]);
  const ne = neRowsFor((completeness.data?.values ?? []) as NeCell[], codes);
  const ruleCells = (rules.data?.values ?? []) as RuleCell[];
  const cell = result.data?.values[0];
  const estimated = !!cell && typeof cell.value === "number";
  const text = sectorText(sector);
  const sources = distinct(streams, "source_id").filter((s) => s !== "no_national_quantity");
  const activities = distinct(streams, "sub_category");
  const classes = (key: "evidence_class" | "temporal_class" | "spatial_class_measured") => distinct(streams, key).sort();
  const models = distinct(ruleCells, "uncertainty_model_id");
  const visible = dims.sectors.filter((s) => sectorMatches(query, sectorLabel(labels, s), streamsByModule.get(s) ?? []));
  const number = ipccSectorNumber(codes);
  const categories = distinct(streams, "ipcc_category");
  const worded = (key: Parameters<typeof classes>[0]) => {
    const ids = classes(key);
    return ids.length ? ids.map((id) => evidenceClassText(id)).join("; ") : evidence.isLoading ? "…" : "not graded";
  };

  const pickMode = (next: (typeof MODES)[number]) => {
    if (next === "story") setClaimParam(null);
    setModeParam(next === "story" ? null : next);
  };

  return (
    <div className="min-h-dvh bg-surface" data-testid="methods-page">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5" data-testid="top-nav">
        <NavCapsule />
        <div className={SEGMENT_GROUP_CLASS} role="group" aria-label={METHODS.modes.label} data-testid="mode-switch">
          <button type="button" onClick={() => pickMode("story")} aria-pressed={!catalogue} className={`${segmentClass(!catalogue)} px-3`} data-testid="mode-story">
            {METHODS.modes.story}
          </button>
          <button type="button" onClick={() => pickMode("catalogue")} aria-pressed={catalogue} className={`${segmentClass(catalogue)} px-3`} data-testid="mode-catalogue">
            {METHODS.modes.catalogue}
          </button>
        </div>
      </header>
      {!catalogue && <Story onBrowse={() => pickMode("catalogue")} />}
      {catalogue && <CurrentView compact />}
      {catalogue && (
      <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-8 md:px-6">
        <PageHeader
          title={METHODS.title}
          dek={METHODS.dek}
          action={
            <a href="#methodology" className={ACTION_CLASS} data-testid="read-methodology">
              <BookOpen size={15} /> {METHODS.read}
            </a>
          }
        />

        {!sector && (
          <>
        <label className="card mt-6 flex items-center gap-2 px-3 py-2" data-testid="search">
          <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={METHODS.search} aria-label={METHODS.search} className="w-full bg-transparent text-sm text-fg outline-none" data-testid="search-input" />
          {query && <span className="shrink-0 text-xs text-muted">{visible.length === 1 ? "one sector" : `${visible.length} sectors`}</span>}
        </label>

        <section className="mt-6" data-testid="browse">
          <h2 className={WIDGET_TITLE}>{METHODS.browse}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((s) => {
              const on = s === sector;
              const n = streamsByModule.get(s)?.length;
              return (
                <button key={s} type="button" onClick={() => setState({ sector: s })} aria-pressed={on} className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${on ? "border-accent bg-accent-soft text-fg" : "border-line bg-surface-2 text-fg hover:bg-surface-3"}`} data-testid="sector-tile" data-sector={s}>
                  <div className="font-semibold">{sectorLabel(labels, s)}</div>
                  {n ? <div className="text-xs text-muted">{n === 1 ? "one source stream" : `${n} source streams`}</div> : null}
                </button>
              );
            })}
            {!visible.length && <p className="col-span-full text-sm text-muted">No sector, category or source matches.</p>}
          </div>
        </section>
          </>
        )}

        {sector && (
          <SectorPage
            sector={sector}
            number={number}
            labels={labels}
            dims={dims}
            dek={text.summary}
            cell={cell}
            shareCell={shareCell}
            period={state.period}
            sources={sources.map(sourceWords)}
            activities={activities.map((a) => a.replace(/_/g, " "))}
            categories={categories}
            ne={ne.map((r) => r.category ?? "").filter(Boolean)}
            ruleCount={ruleCells.length}
            glance={{ annual: worded("evidence_class"), monthly: worded("temporal_class"), location: worded("spatial_class_measured") }}
            onBack={() => setState({ sector: null })}
            onSources={() => evidence.data && drawer.open(evidence.data, "sources")}
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
        )}

        <ClaimBrowser />

        <div className="mt-10 border-t border-line pt-8">
          <Methodology />
        </div>
      </main>
      )}
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
