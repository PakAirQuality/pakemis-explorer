"use client";
/**
 * The first-visit introduction: four screens that present the dataset (one scroll under 768
 * px). What it is (the national series by year), what can be explored (the reference year's
 * emissions by sector), how it can be queried (a real example: the transport series), and what
 * is published (data, sources, methods, code). It is shown until localStorage remembers a
 * dismissal (read on mount so the server render never flashes it) and re-openable through
 * `openIntro()` (the "?" on the rail's brand square) or from /about, which carries the
 * methodology prose and the release version this modal leaves out.
 *
 * Every figure is an envelope drawn as received: values size the shape, the ends and the
 * reference year are labelled with their `display` strings, the axis carries the release's
 * short period labels. No number is printed by the copy itself; the counts on screen are counts
 * of dimension rows (the fiscal periods). No period is printed by its id: "2023–24", not
 * "FY2023-24". No receipt is printed here: a result's Result ID lives in the Explorer.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies, seriesBody, transportSeriesBody } from "@/lib/requests";
import { useEmissions, useTimeseries } from "@/lib/queries";
import { periodRange, periodShort, unitWords } from "@/lib/labels";
import type { Envelope } from "@/lib/envelope";
import { TrendChart } from "@/components/ui/TrendChart";
import { BarChart } from "@/components/ui/BarChart";
import { RefusalCard } from "@/components/ui/RefusalCard";

export const INTRO_KEY = "pakemis.intro.dismissed";
const INTRO_EVENT = "pakemis:intro";
/** Where "View methodology" goes: the methods section of /about. */
export const METHODS_HREF = "/about#methods";

/** Re-open the introduction from anywhere on the screen (the rail's "?"). */
export function openIntro() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INTRO_EVENT));
}

/** Forget the dismissal so the next visit to `/` shows the introduction again (the /about button). */
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

/** The opening paragraph of the release's short summary (paper_national/short_summary.txt), verbatim; /about quotes it. */
export const SHORT_SUMMARY =
  "PakEmis is an open dataset of Pakistan's greenhouse-gas emissions, rebuilt from public documents rather than taken from a single official report. It covers nine fiscal years, every sector except land use and forestry, and gives each emission by month and by district as well as by year. Every number is graded by the strength of the evidence behind it, and every one can be traced back to the document and the code that produced it, so others can check, reuse and improve it.";

/** The Ask dock's own empty-state sentences (AskDock.tsx), quoted by /about so the two never drift. */
export const ASK_SENTENCES = [
  "Ask about a place, a sector, a year or a method. The agent can only call the release's typed functions; every number it says is a placeholder the server fills from an envelope with a receipt, and a scope the release cannot answer is refused by name.",
  "Tool calls, results and refusals are shown as they happen. Click a cited number to see the call it came from.",
] as const;

/** The four screens' copy, as the brief wrote it. Screen 1's title takes the release's period range (`screenTitle`). */
export const SCREENS = [
  { title: "Pakistan greenhouse-gas emissions", text: "PakEmis brings emissions estimates reported across government publications into a consistent dataset for comparison across years, sectors and places." },
  { title: "Explore emissions across place, time and sector", text: "The same dataset can be examined nationally, by province and district, and across reporting years and months." },
  { title: "Query the dataset", text: "PakEmis can answer questions using the same data available in the Explorer. Results retain the filters, sources and calculations used to produce them." },
  { title: "Open data, methods and code", text: "PakEmis publishes the data together with the information needed to inspect and reproduce it." },
] as const;

/** Screen 2's four dimensions. */
export const EXPLORE_TERMS = [
  ["Geography", "National, provincial, district and gridded views"],
  ["Time", "Annual and monthly estimates"],
  ["Sector", "Compare emissions across sectors and gases"],
  ["Sources", "Trace estimates back to the underlying records"],
] as const;

/** Screen 4's four things published. */
export const OPEN_TERMS = [
  ["Data", "Tables can be downloaded in machine-readable formats."],
  ["Sources", "Estimates retain links to the records from which they were derived."],
  ["Methods", "Harmonisation rules, emission factors and assumptions are documented."],
  ["Code", "The processing pipeline used to build each release is public."],
] as const;

export const QUERY_CLOSING = "Queries do not create a separate dataset; they provide another way to inspect the published estimates.";
export const VERSIONED_LINE = "Releases are versioned so that published results can be reproduced.";

/** "Pakistan greenhouse-gas emissions, 2015–16 to 2023–24": the range is the release's fiscal periods by their short labels. */
export function screenTitle(i: number, range: string): string {
  return i === 0 && range ? `${SCREENS[0].title}, ${range}` : SCREENS[i].title;
}

/** "How have transport emissions changed since 2015–16?": the first fiscal period by its short label. */
export function exampleQuestion(first: string): string {
  return `How have transport emissions changed since ${first}?`;
}

/** "9 fiscal years · monthly estimates · district-level data · documented sources": the count is the release's fiscal period rows. */
export function factsLine(fiscalYears: number): string {
  return [`${fiscalYears} fiscal ${fiscalYears === 1 ? "year" : "years"}`, "monthly estimates", "district-level data", "documented sources"].join(" · ");
}

/**
 * A figure's unit line from the envelope's first cell: "Million tonnes CO₂e (AR5)" (unitWords,
 * capitalised), with ", excluding land use" appended for a whole-scope figure whose context says
 * LULUCF is excluded (any other status is named as it is). "" while there is no envelope.
 */
export function figureUnitLine(env: Envelope | null | undefined, withLulucf = false): string {
  const unit = env?.values[0]?.unit;
  if (!env || !unit) return "";
  const words = unitWords(unit).replace(/^\w/, (c) => c.toUpperCase());
  if (!withLulucf) return words;
  const status = env.context.lulucf.status;
  const lulucf = status === "excluded" ? "excluding land use" : status ? `land use ${status}` : "";
  return lulucf ? `${words}, ${lulucf}` : words;
}

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
      /* private mode: the introduction simply returns next time */
    }
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      else if (e.key === "ArrowRight") setStep((s) => Math.min(SCREENS.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const last = SCREENS.length - 1;
  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const screens = [<ScreenDataset key="1" />, <ScreenExplore key="2" />, <ScreenQuery key="3" />, <ScreenOpen key="4" />];
  const counter = (i: number) => `${i + 1} of ${SCREENS.length}`;
  const primary = "pill flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-pill hover:bg-accent/90";
  const finish = (
    <>
      <Link href={METHODS_HREF} onClick={dismiss} className="text-sm text-muted hover:text-ink hover:underline" data-testid="intro-methods">
        View methodology
      </Link>
      <button type="button" onClick={dismiss} className={primary} data-testid="intro-done">
        Open Explorer <ArrowRight size={16} />
      </button>
    </>
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-0 backdrop-blur-sm md:p-6" role="dialog" aria-modal="true" aria-labelledby="intro-title" data-testid="welcome-modal" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={`relative flex w-full flex-col overflow-hidden text-ink shadow-card ${isMobile ? "h-dvh max-w-none" : "max-h-[92dvh] max-w-3xl rounded-2xl"}`} style={{ background: "#faf8f4" }}>
        <button type="button" onClick={dismiss} aria-label="Close the introduction" className="pill absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center text-muted hover:bg-ink/5 hover:text-ink" data-testid="intro-close">
          <X size={16} />
        </button>
        {isMobile ? (
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="micro">PakEmis</div>
            <div className="mt-8 space-y-14">
              {screens.map((s, i) => (
                <section key={SCREENS[i].title} data-testid={`intro-screen-${i + 1}`}>
                  <div className="micro mb-3">{counter(i)}</div>
                  {s}
                </section>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-end gap-5">{finish}</div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-10 pt-8">
              <div className="micro">PakEmis</div>
              <div className="micro mr-10" data-testid="intro-counter">{counter(step)}</div>
            </div>
            <div className="mx-10 mt-3 flex items-center gap-1.5" data-testid="intro-dots" aria-hidden="true">
              {SCREENS.map((s, i) => (
                <span key={s.title} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-ink" : "bg-ink/20"}`} data-current={i === step ? "true" : undefined} />
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-10 pb-6 pt-7" data-testid={`intro-screen-${step + 1}`}>
              {screens[step]}
            </div>
            <div className="flex items-center justify-between px-10 pb-8">
              <button type="button" onClick={dismiss} className="text-xs text-muted hover:text-ink" data-testid="intro-skip">Skip</button>
              <div className="flex items-center gap-5">
                {step > 0 && (
                  <button type="button" onClick={back} className="text-xs text-muted hover:text-ink" aria-label="Previous screen" data-testid="intro-back">
                    Back
                  </button>
                )}
                {step < last ? (
                  <button type="button" onClick={next} className={primary} data-testid="intro-next">
                    Next <ArrowRight size={16} />
                  </button>
                ) : (
                  finish
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The title and its one or two sentences: the screen's two text levels above the figure. */
function Title({ children, text }: { children: ReactNode; text: string }) {
  return (
    <div>
      <h1 id="intro-title" className="text-[28px] font-semibold leading-tight tracking-tight text-ink">{children}</h1>
      <p className="mt-3 max-w-prose text-md leading-relaxed text-muted">{text}</p>
    </div>
  );
}

/** A two-column definition list: the term bold, one line each. */
function Terms({ items, testId }: { items: readonly (readonly [string, string])[]; testId: string }) {
  return (
    <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2" data-testid={testId}>
      {items.map(([term, line]) => (
        <div key={term} className="flex gap-2">
          <dt className="shrink-0 font-semibold text-ink">{term}</dt>
          <dd className="text-muted">{line}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The national annual series under the reference configuration and the reported GWP basis, unfiltered. */
function useNationalSeries() {
  const { defaults } = useExplorer();
  const body = useMemo(() => seriesBody({ config: defaults.configuration_id, gwp: defaults.gwp_basis, sector: null, gas: null }), [defaults.configuration_id, defaults.gwp_basis]);
  return useTimeseries(body);
}

/** The transport annual series under the same configuration and basis (screen 3's example). */
function useTransportSeries() {
  const { defaults } = useExplorer();
  const body = useMemo(() => transportSeriesBody({ config: defaults.configuration_id, gwp: defaults.gwp_basis }), [defaults.configuration_id, defaults.gwp_basis]);
  return useTimeseries(body);
}

/** The reference period's id: the dim row flagged is_reference, else the last fiscal period. */
function useReferencePeriod(): string {
  const { dims } = useExplorer();
  return dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
}

/** A series envelope as the trend figure: the title and unit line given, the years on the axis, the ends and the reference labelled; a skeleton while loading; the refusal by name. */
function SeriesFigure({ query, title, unitLine, testId }: { query: { data?: Envelope; error: unknown }; title: string; unitLine: string; testId: string }) {
  const { labels } = useExplorer();
  const reference = useReferencePeriod();
  const label = useMemo(() => (id: string) => periodShort(labels, id), [labels]);
  return (
    <div className="mt-6" data-testid={testId}>
      {query.error ? <RefusalCard error={query.error} compact /> : <TrendChart env={query.data} referencePeriod={reference} periodLabel={label} height={150} title={title} subtitle={unitLine} showReceipt={false} />}
    </div>
  );
}

function ScreenDataset() {
  const { dims, labels } = useExplorer();
  const series = useNationalSeries();
  return (
    <div>
      <Title text={SCREENS[0].text}>{screenTitle(0, periodRange(dims, labels))}</Title>
      <p className="mt-4 text-sm text-ink" data-testid="intro-facts">{factsLine(dims.fiscalPeriods.length)}</p>
      <SeriesFigure query={series} title="Pakistan greenhouse-gas emissions" unitLine={figureUnitLine(series.data, true)} testId="intro-trend" />
    </div>
  );
}

function ScreenExplore() {
  return (
    <div>
      <Title text={SCREENS[1].text}>{SCREENS[1].title}</Title>
      <Terms items={EXPLORE_TERMS} testId="intro-explore-list" />
      <SectorFigure />
    </div>
  );
}

/**
 * Screen 2's figure: the reference year's emissions by sector, the same request the context
 * panel makes (so the envelope is already cached), drawn as bars in sector colours labelled
 * with their displays.
 */
function SectorFigure() {
  const { state, labels, dims } = useExplorer();
  const bySector = useEmissions(contextBodies(state, null).bySector);
  const env = bySector.data;
  const period = periodShort(labels, env?.context.periods?.[0] ?? state.period);
  return (
    <figure className="m-0 mt-6" data-testid="intro-sectors">
      <figcaption>
        <div className="text-sm font-semibold text-ink" data-testid="intro-sectors-title">Emissions by sector, {period}</div>
        <div className="mt-0.5 text-xs text-muted" data-testid="intro-sectors-unit">{figureUnitLine(env)}</div>
      </figcaption>
      {env ? (
        <BarChart env={env} horizontal height={Math.max(110, env.values.length * 17 + 8)} labels={labels} dims={dims} compact={false} />
      ) : bySector.error ? (
        <div className="mt-2"><RefusalCard error={bySector.error} compact /></div>
      ) : (
        <div className="mt-3 animate-pulse rounded-lg bg-ink/5" style={{ height: 150 }} aria-hidden="true" data-testid="intro-sectors-skeleton" />
      )}
    </figure>
  );
}

function ScreenQuery() {
  const { dims, labels } = useExplorer();
  const transport = useTransportSeries();
  const first = periodShort(labels, dims.fiscalPeriods[0] ?? "");
  return (
    <div>
      <Title text={SCREENS[2].text}>{SCREENS[2].title}</Title>
      <div className="mt-5" data-testid="intro-example">
        <div className="micro">Example</div>
        <p className="mt-1 text-md text-ink" data-testid="intro-question">&ldquo;{exampleQuestion(first)}&rdquo;</p>
      </div>
      <SeriesFigure query={transport} title="Transport emissions by year" unitLine={figureUnitLine(transport.data)} testId="intro-transport" />
      <p className="mt-4 text-sm text-muted" data-testid="intro-query-closing">{QUERY_CLOSING}</p>
    </div>
  );
}

function ScreenOpen() {
  return (
    <div>
      <Title text={SCREENS[3].text}>{SCREENS[3].title}</Title>
      <Terms items={OPEN_TERMS} testId="intro-open-list" />
      <p className="mt-5 text-sm text-ink" data-testid="intro-versioned">{VERSIONED_LINE}</p>
    </div>
  );
}
