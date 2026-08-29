"use client";
/**
 * The first-visit explainer: four panels with a stepper (one scroll under 768 px) over the
 * screen, shown until localStorage remembers a dismissal (the AskEntry pattern: read on mount
 * so the server render never flashes it) and re-openable through `openIntro()` (the "?" on the
 * rail's brand square) or from /about. Every sentence is the project's own wording; the one
 * number it prints is the national total's `display` from the context envelope with its
 * receipt, and every release fact (period, LULUCF, GWP bases, limitations, functions, agent
 * status) is read from /v1/release, never retyped.
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies } from "@/lib/requests";
import { useEmissions } from "@/lib/queries";
import { releaseFacts } from "@/lib/release";
import { configLabel, gasLabel, limitationText } from "@/lib/labels";
import { joinNames, residualUnit } from "@/lib/geography";
import { useBboxes } from "@/components/map/tiles";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";

export const INTRO_KEY = "pakemis.intro.dismissed";
const INTRO_EVENT = "pakemis:intro";

/** Re-open the explainer from anywhere on the screen (the rail's "?"). */
export function openIntro() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INTRO_EVENT));
}

/** Forget the dismissal so the next visit to `/` shows the explainer again (the /about button). */
export function forgetIntro() {
  try {
    window.localStorage.removeItem(INTRO_KEY);
  } catch {
    /* private mode: nothing to forget */
  }
}

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

/** The opening paragraph of the release's short summary (paper_national/short_summary.txt), verbatim. */
export const SHORT_SUMMARY =
  "PakEmis is an open dataset of Pakistan's greenhouse-gas emissions, rebuilt from public documents rather than taken from a single official report. It covers nine fiscal years, every sector except land use and forestry, and gives each emission by month and by district as well as by year. Every number is graded by the strength of the evidence behind it, and every one can be traced back to the document and the code that produced it, so others can check, reuse and improve it.";

/** The Ask dock's own empty-state sentences (AskDock.tsx), quoted here so the explainer and the dock never drift. */
export const ASK_SENTENCES = [
  "Ask about a place, a sector, a year or a method. The agent can only call the release's typed functions; every number it says is a placeholder the server fills from an envelope with a receipt, and a scope the release cannot answer is refused by name.",
  "Tool calls, results and refusals are shown as they happen. Click a cited number to see the call it came from.",
] as const;

const STEPS = ["What this is", "What the data means", "How to read the map", "Ask PakEmis"] as const;

export function WelcomeModal() {
  const { isMobile } = useExplorer();
  const [open, setOpen] = useState(false); // hidden until the client has read localStorage
  const [step, setStep] = useState(0);
  useEffect(() => {
    setOpen(!readDismissed());
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(INTRO_EVENT, reopen);
    return () => window.removeEventListener(INTRO_EVENT, reopen);
  }, []);
  const dismiss = () => {
    try {
      window.localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* private mode: the explainer simply returns next time */
    }
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const panels = [<WhatThisIs key="a" />, <WhatDataMeans key="b" />, <HowToRead key="c" />, <AskPanel key="d" onDismiss={dismiss} />];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-0 backdrop-blur-sm md:p-6" role="dialog" aria-modal="true" aria-labelledby="intro-title" data-testid="welcome-modal" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={`card flex w-full flex-col overflow-hidden ${isMobile ? "h-dvh max-w-none rounded-none" : "max-h-[90dvh] max-w-2xl"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="micro">PakEmis Explorer</div>
            <h1 id="intro-title" className="text-md font-semibold text-ink">{isMobile ? "A first visit" : STEPS[step]}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <ol className="flex items-center gap-1" aria-label="Steps">
                {STEPS.map((s, i) => (
                  <li key={s}>
                    <button type="button" onClick={() => setStep(i)} aria-label={s} aria-current={i === step ? "step" : undefined} className={`h-2 w-2 rounded-full ${i === step ? "bg-accent" : "bg-line hover:bg-muted"}`} />
                  </li>
                ))}
              </ol>
            )}
            <button type="button" onClick={dismiss} aria-label="Close the introduction" className="pill flex h-7 w-7 items-center justify-center text-muted hover:bg-canvas hover:text-ink" data-testid="intro-close">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {isMobile ? (
            <div className="space-y-6">
              {panels.map((p, i) => (
                <section key={STEPS[i]}>
                  <h2 className="mb-2 text-md font-semibold text-ink">{STEPS[i]}</h2>
                  {p}
                </section>
              ))}
            </div>
          ) : (
            panels[step]
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-xs">
          <button type="button" onClick={dismiss} className="text-muted hover:text-ink">Skip</button>
          {!isMobile && (
            <div className="flex items-center gap-2">
              <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="pill flex items-center gap-1 border border-line px-2.5 py-1 text-ink hover:bg-canvas disabled:opacity-30" aria-label="Previous step">
                <ChevronLeft size={14} /> Back
              </button>
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="pill flex items-center gap-1 bg-ink px-3 py-1 text-white hover:bg-ink/90" data-testid="intro-next">
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button type="button" onClick={dismiss} className="pill bg-ink px-3 py-1 text-white hover:bg-ink/90" data-testid="intro-done">
                  Explore the map
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 leading-relaxed text-ink first:mt-0">{children}</p>;
}
function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>;
}

/** Panel 1: the short summary, the release line, and the one number (the national total's display with its receipt). */
export function WhatThisIs() {
  const { state, release, labels } = useExplorer();
  const facts = releaseFacts(release);
  const national = useEmissions(contextBodies(state, null).national);
  const kpi = national.data?.values[0];
  const rp = facts.reportingPeriod;
  return (
    <div>
      <P>{SHORT_SUMMARY}</P>
      <Note>
        This is <span className="mono">{release.release_id}</span>
        {rp ? <>, reporting period {rp.label} ({rp.start} to {rp.end})</> : null}.
      </Note>
      <div className="mt-3 rounded-card border border-line bg-canvas p-3">
        <div className="micro">Pakistan · national total, as the release states it</div>
        {kpi ? (
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="num text-3xl font-semibold tracking-tight text-ink" data-testid="intro-kpi">{kpi.display}</span>
              <span className="text-xs text-muted">{kpi.unit}</span>
            </div>
            <div className="text-xs text-muted">{configLabel(labels, state.config)} · {state.gwp}</div>
            <ReceiptFooter env={national.data!} className="mt-1" />
          </div>
        ) : national.error ? (
          <div className="mt-2"><RefusalCard error={national.error} compact /></div>
        ) : (
          <div className="mt-2"><Loading what="the national total" /></div>
        )}
        <Note>The only number in this introduction. Like every number in the Explorer, it is printed as the API returned it, with the receipt that replays it.</Note>
      </div>
    </div>
  );
}

/** Panel 2: what an "emission" is here; the release's own statements on period, gases, LULUCF, configurations and notation keys. */
export function WhatDataMeans() {
  const { release, labels, dims } = useExplorer();
  const facts = releaseFacts(release);
  const gases = dims.gases.map((g) => gasLabel(labels, g));
  return (
    <div>
      <P>An estimate, not a measurement. Each sector&apos;s emissions are reconstructed from public documents as activity data multiplied by emission factors, category by category under the IPCC classification. Nothing here was read from an instrument.</P>
      <P>Years are fiscal, July to June{facts.reportingPeriod?.note ? <>: {facts.reportingPeriod.note}</> : null}.</P>
      <P>
        The gases are {joinNames(gases)}, reported together as CO₂-equivalent{facts.gwp.reported ? <> on {facts.gwp.reported}</> : null}
        {facts.gwp.secondary ? <>, with {facts.gwp.secondary} carried as a secondary basis</> : null}.
      </P>
      {facts.lulucf.status && (
        <P>
          Land use, land-use change and forestry are {facts.lulucf.status} ({facts.lulucf.notation_key}){facts.lulucf.note ? <>: {facts.lulucf.note}</> : null}.
        </P>
      )}
      <P>Two configurations can be queried:</P>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink">
        {dims.configurations.map((id) => (
          <li key={id}>
            <span className="font-semibold">{configLabel(labels, id)}</span>
            {labels.configurations[id]?.note ? <span className="text-muted"> — {labels.configurations[id].note}</span> : null}
          </li>
        ))}
      </ul>
      {labels.limitations.config_S_residential_only && <Note>{limitationText(labels, "config_S_residential_only")}</Note>}
      <P>Where nothing is estimated, the cell says so with a notation key rather than a value: NE (not estimated), NO (not occurring) or IE (included elsewhere). A blank is not a zero.</P>
      <P>Every number is graded by the evidence behind it, traceable to the document and the code that produced it, and carries a receipt that replays the exact query.</P>
    </div>
  );
}

/** Panel 3: levels, the year rail, hatch, dotted outline, unallocated mass, the raster, refusals — limitation texts from the release. */
export function HowToRead() {
  const { labels, dims } = useExplorer();
  const bboxes = useBboxes();
  const residual = residualUnit(dims, bboxes.data);
  const lim = (id: string) => (labels.limitations[id] ? limitationText(labels, id) : null);
  return (
    <div>
      <P>Provinces, districts and a grid. The map paints one envelope per view: a polygon&apos;s colour follows its cell&apos;s value, the hover shows that cell&apos;s display string verbatim, and the legend&apos;s labels are real cells. A click opens the detail card.</P>
      <P>The rail at the bottom steps through the fiscal years and, within a year, the months. Spatial products exist for the reference year only: other years are tagged &ldquo;national only&rdquo;, the map shows outlines with the API&apos;s refusal in the legend&apos;s place, and the panels keep their national numbers.</P>
      <div className="mt-3 space-y-2 text-xs">
        <Row swatch={<span className="hatch-swatch inline-block h-3 w-5 shrink-0 rounded-sm border border-ink/20 bg-accent-soft" />}>
          <b>Hatch</b> = a bounded interval. The cell prints &ldquo;[low, high]&rdquo; and is never collapsed to a midpoint.{lim("adm2_co2e_bounded_power_residential") ? <span className="text-muted"> {lim("adm2_co2e_bounded_power_residential")}.</span> : null}
        </Row>
        <Row swatch={<span className="inline-block h-3 w-5 shrink-0 rounded-sm border-2 border-dotted border-ink/80 bg-accent-soft" />}>
          <b>Dotted outline</b> = polygons sharing one cell.{residual ? <> {joinNames(residual.members)} are one unit in the release, named &ldquo;{residual.name}&rdquo;; the map paints its single cell on each of them and says so on hover.</> : null}
          {lim("no_polygon_units") ? <span className="text-muted"> {lim("no_polygon_units")}.</span> : null}
        </Row>
        <Row swatch={<span className="inline-block h-3 w-5 shrink-0 rounded-sm border border-line bg-canvas" />}>
          <b>Unallocated</b> mass is named, not lost: what the allocation cannot place in a district stays at the province as a row of its own, shown on the detail card.
        </Row>
        <Row swatch={<span className="inline-block h-3 w-5 shrink-0 rounded-sm" style={{ background: "linear-gradient(90deg, #e6eff5, #2a6f97)" }} />}>
          <b>The grid raster</b> is shading only.{lim("grid_not_tabular") ? <span className="text-muted"> {lim("grid_not_tabular")}.</span> : null} A click reads one cell through the API.
        </Row>
      </div>
      <P>Refusals are answers. A scope the release cannot serve is refused by name, and the refusal is shown where the number would have been, for example:</P>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted">
        {(["ar6_adm2_ne", "calendar_basis_ne"] as const).filter((id) => labels.limitations[id]).map((id) => (
          <li key={id}>
            <span className="mono text-ink">{id}</span> — {limitationText(labels, id)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5">{swatch}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

/** Panel 4: the dock's sentences, the contract's functions, the agent's status, and where to go next. */
export function AskPanel({ onDismiss }: { onDismiss: () => void }) {
  const { release, agent, setState } = useExplorer();
  const fns = (release.query_contract.functions as string[] | undefined) ?? [];
  return (
    <div>
      <P>{ASK_SENTENCES[0]}</P>
      <P>{ASK_SENTENCES[1]}</P>
      {fns.length > 0 && (
        <>
          <Note>The typed functions it can call:</Note>
          <ul className="mono mt-1 grid grid-cols-1 gap-0.5 text-xs text-ink sm:grid-cols-2">
            {fns.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted" data-testid="intro-agent">
        Status: {agent.enabled ? <>enabled{agent.model ? <> · model <span className="mono">{agent.model}</span></> : null}</> : <>not enabled — <span className="mono">{agent.reason}</span></>}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onDismiss} className="pill bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/90">Explore the map</button>
        <button
          type="button"
          onClick={() => {
            onDismiss();
            setState({ ask: true });
          }}
          className="pill bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
          data-testid="intro-ask"
        >
          Ask a question
        </button>
        <Link href="/about" onClick={onDismiss} className="pill border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas">Read more</Link>
      </div>
    </div>
  );
}
