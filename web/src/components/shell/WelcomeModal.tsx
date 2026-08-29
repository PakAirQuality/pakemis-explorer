"use client";
/**
 * The first-visit explainer, a four-screen product hero over the map (one scroll under 768 px):
 * what this is, what can be explored, why it can be trusted, what makes it open. It is shown
 * until localStorage remembers a dismissal (the AskEntry pattern: read on mount so the server
 * render never flashes it) and re-openable through `openIntro()` (the "?" on the rail's brand
 * square) or from /about, which carries the methodology prose this modal deliberately leaves
 * out. Numbers: screen 1's figure is the national timeseries envelope (values size the shape,
 * the ends and the reference year are labelled with their `display` strings, the axis carries
 * the release's short period labels); screen 2's figure is the reference year's sector
 * breakdown envelope (bars in sector colours, labelled with displays); the one number in the
 * copy, from the third screen on, is the national total's `display` printed as the API returned
 * it (the integer part large, the fraction lighter: typography, never rounding) with a "View
 * source" that opens the envelope's evidence drawer. The facts row is words and the release's
 * period labels, never a digit of a value. No period is ever printed by its id: "2023–24", not
 * "FY2023-24"; the July–June basis is said once, in the figure subtitle, and on /about.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { contextBodies, seriesBody } from "@/lib/requests";
import { useEmissions, useTimeseries } from "@/lib/queries";
import { periodRange, periodShort, periodSpanWords, unitWords } from "@/lib/labels";
import type { Envelope } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { TrendChart } from "@/components/ui/TrendChart";
import { BarChart } from "@/components/ui/BarChart";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { EnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";

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

/** The opening paragraph of the release's short summary (paper_national/short_summary.txt), verbatim; /about quotes it. */
export const SHORT_SUMMARY =
  "PakEmis is an open dataset of Pakistan's greenhouse-gas emissions, rebuilt from public documents rather than taken from a single official report. It covers nine fiscal years, every sector except land use and forestry, and gives each emission by month and by district as well as by year. Every number is graded by the strength of the evidence behind it, and every one can be traced back to the document and the code that produced it, so others can check, reuse and improve it.";

/** The Ask dock's own empty-state sentences (AskDock.tsx), quoted by /about so the two never drift. */
export const ASK_SENTENCES = [
  "Ask about a place, a sector, a year or a method. The agent can only call the release's typed functions; every number it says is a placeholder the server fills from an envelope with a receipt, and a scope the release cannot answer is refused by name.",
  "Tool calls, results and refusals are shown as they happen. Click a cited number to see the call it came from.",
] as const;

/** The four screens' copy. */
export const SCREENS = [
  { eyebrow: "What is this?", headline: "A public record of Pakistan's emissions.", dek: "PakEmis turns scattered government documents into a consistent, explorable greenhouse-gas dataset — across nine fiscal years, sectors, months and districts." },
  { eyebrow: "What can I explore?", headline: "From the national picture to individual districts.", dek: "Compare sectors, follow changes through time, inspect monthly estimates and move across Pakistan geographically." },
  { eyebrow: "Why should I trust it?", headline: "Every number has a paper trail.", dek: "PakEmis is built from public records. Each estimate carries its source, methodology and evidence quality, so you can see where it came from rather than taking the dataset on trust." },
  { eyebrow: "What makes this open?", headline: "Check it. Reuse it. Improve it.", dek: "The dataset, methodology and code are public. PakEmis is designed to be reproducible, not just downloadable." },
] as const;

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** A small count as a word ("nine"), so the facts row carries no digit; larger counts fall back to the digits. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}
function capitalise(s: string): string {
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

/** The pieces of a display string for the typographic split: integer part and the rest, unchanged. */
export function splitDisplay(display: string): { int: string; rest: string } {
  const m = /^(-?\d+)(.*)$/.exec(display);
  return m ? { int: m[1], rest: m[2] } : { int: display, rest: "" };
}

/** "Mt CO₂e" for the release's "Mt CO2e …" units (typography only); any other unit verbatim. */
export function unitText(unit: string): string {
  return /^Mt CO2e\b/.test(unit) ? "Mt CO₂e" : unit;
}

export function WelcomeModal() {
  const { isMobile } = useExplorer();
  const [open, setOpen] = useState(false); // hidden until the client has read localStorage
  const [step, setStep] = useState(0);
  const [drawer, setDrawer] = useState<Envelope | null>(null);
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
    setDrawer(null);
    setOpen(false);
  };
  useEffect(() => {
    if (!open || drawer) return; // the drawer owns Escape while it is open
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      else if (e.key === "ArrowRight") setStep((s) => Math.min(SCREENS.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, drawer]);
  if (!open) return null;
  const last = SCREENS.length - 1;
  const next = () => setStep((s) => Math.min(last, s + 1));
  const screens = [
    <ScreenWhat key="1" />,
    <ScreenExplore key="2" />,
    <ScreenTrust key="3" onExplore={dismiss} onSource={setDrawer} />,
    <ScreenOpen key="4" onDismiss={dismiss} />,
  ];
  const counter = (i: number) => `${String(i + 1).padStart(2, "0")} / ${String(SCREENS.length).padStart(2, "0")}`;
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
                <section key={SCREENS[i].headline} data-testid={`intro-screen-${i + 1}`}>
                  <div className="mono mb-3 text-micro normal-case tracking-normal text-muted">{counter(i)}</div>
                  {s}
                </section>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-10 pt-8">
              <div className="micro">PakEmis</div>
              <div className="mono mr-10 text-micro normal-case tracking-normal text-muted" data-testid="intro-counter">{counter(step)}</div>
            </div>
            <div className="mx-10 mt-3 h-px bg-ink/10">
              <div className="h-px bg-accent transition-[width] duration-300" style={{ width: `${((step + 1) / SCREENS.length) * 100}%` }} />
            </div>
            <div className="flex-1 overflow-y-auto px-10 pb-6 pt-8" data-testid={`intro-screen-${step + 1}`}>
              {screens[step]}
            </div>
            <div className="flex items-center justify-between px-10 pb-8">
              <div className="flex items-center gap-4 text-xs text-muted">
                <button type="button" onClick={dismiss} className="hover:text-ink">Skip</button>
                {step > 0 && (
                  <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="hover:text-ink" aria-label="Previous screen">
                    Back
                  </button>
                )}
              </div>
              {step < last ? (
                <button type="button" onClick={next} className="pill flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-pill hover:bg-accent/90" data-testid="intro-next">
                  {step === 0 ? "Explore the project" : "Next"} <ArrowRight size={16} />
                </button>
              ) : (
                <button type="button" onClick={dismiss} className="pill flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-pill hover:bg-accent/90" data-testid="intro-done">
                  Start exploring <ArrowRight size={16} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {drawer && <EnvelopeDrawer env={drawer} tab="evidence" onClose={() => setDrawer(null)} />}
    </div>
  );
}

function Headline({ eyebrow, children, dek }: { eyebrow: string; children: ReactNode; dek: string }) {
  return (
    <div>
      <div className="micro">{eyebrow}</div>
      <h1 id="intro-title" className="mt-3 text-[36px] font-semibold leading-[1.05] tracking-tight text-ink">{children}</h1>
      <p className="mt-4 max-w-prose text-md leading-relaxed text-muted">{dek}</p>
    </div>
  );
}

/** The national annual series under the reference configuration and the reported GWP basis, unfiltered. */
function useNationalSeries() {
  const { defaults } = useExplorer();
  const body = useMemo(() => seriesBody({ config: defaults.configuration_id, gwp: defaults.gwp_basis, sector: null, gas: null } as ExplorerState), [defaults.configuration_id, defaults.gwp_basis]);
  return useTimeseries(body);
}

/** The reference period's id: the dim row flagged is_reference, else the last fiscal period. */
function useReferencePeriod(): string {
  const { dims } = useExplorer();
  return dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
}

/** Screen 1's figure: the national series by year, framed by TrendChart (title, unit and basis subtitle, the years on the axis, the receipt line). */
function Trend() {
  const { labels } = useExplorer();
  const series = useNationalSeries();
  const reference = useReferencePeriod();
  const label = useMemo(() => (id: string) => periodShort(labels, id), [labels]);
  return (
    <div className="mt-8" data-testid="intro-trend">
      <TrendChart env={series.data} referencePeriod={reference} periodLabel={label} height={150} title="Pakistan's greenhouse-gas emissions, by year" basisWords={periodSpanWords(labels, reference)} />
    </div>
  );
}

/**
 * Screen 2's figure: where the reference year's emissions came from, the sector breakdown of
 * the scope (the same request the context panel makes, so the envelope is already cached),
 * drawn as bars in sector colours labelled with their displays.
 */
function SectorFigure() {
  const { state, labels, dims } = useExplorer();
  const bySector = useEmissions(contextBodies(state, null).bySector);
  const env = bySector.data;
  const period = periodShort(labels, env?.context.periods?.[0] ?? state.period);
  const unit = env?.values[0]?.unit ? unitWords(env.values[0].unit) : "";
  return (
    <figure className="m-0 mt-6" data-testid="intro-sectors">
      <figcaption>
        <div className="text-sm font-semibold text-ink" data-testid="intro-sectors-title">Where {period}&rsquo;s emissions came from</div>
        <div className="mt-0.5 text-xs text-muted">{unit ? `${unit}, reference configuration` : "reference configuration"}</div>
      </figcaption>
      {env ? (
        <>
          <BarChart env={env} horizontal height={Math.max(110, env.values.length * 17 + 8)} labels={labels} dims={dims} compact={false} />
          <ReceiptFooter env={env} className="mt-1" />
        </>
      ) : bySector.error ? (
        <p className="mt-2 text-sm text-muted">The sector breakdown could not be read from the API right now; the panels show the refusal by name.</p>
      ) : (
        <div className="mt-3 animate-pulse rounded-lg bg-ink/5" style={{ height: 150 }} aria-hidden="true" data-testid="intro-sectors-skeleton" />
      )}
      <p className="mt-2 text-micro normal-case tracking-normal text-muted">Every sector can be followed down the map&rsquo;s three levels: provinces, districts and a grid.</p>
    </figure>
  );
}

function ScreenWhat() {
  const { dims, labels } = useExplorer();
  const years = capitalise(countWord(dims.fiscalPeriods.length));
  const range = periodRange(dims, labels);
  const facts = [range ? `${years} years, ${range}` : `${years} years`, "Monthly detail", "District-level data", "Source-traceable"];
  return (
    <div>
      <Headline eyebrow={SCREENS[0].eyebrow} dek={SCREENS[0].dek}>{SCREENS[0].headline}</Headline>
      <ul className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink" data-testid="intro-facts">
        {facts.map((f, i) => (
          <li key={f} className="flex items-center gap-3">
            {i > 0 && <span className="text-muted/60" aria-hidden="true">·</span>}
            {f}
          </li>
        ))}
      </ul>
      <Trend />
    </div>
  );
}

function ScreenExplore() {
  return (
    <div>
      <Headline eyebrow={SCREENS[1].eyebrow} dek={SCREENS[1].dek}>{SCREENS[1].headline}</Headline>
      <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2 text-sm text-ink sm:grid-cols-2" data-testid="intro-explore-list">
        <li><span className="font-semibold">Provinces, districts, grid</span> <span className="text-muted">— three map levels, one release.</span></li>
        <li><span className="font-semibold">Sectors and gases</span> <span className="text-muted">— filter, compare, rank.</span></li>
        <li><span className="font-semibold">Years and months</span> <span className="text-muted">— the rail at the bottom of the map.</span></li>
        <li><span className="font-semibold">Ask PakEmis</span> <span className="text-muted">— a question, answered from the same data.</span></li>
      </ul>
      <SectorFigure />
    </div>
  );
}

function ScreenTrust({ onExplore, onSource }: { onExplore: () => void; onSource: (env: Envelope) => void }) {
  const { state, labels } = useExplorer();
  const national = useEmissions(contextBodies(state, null).national);
  const kpi = national.data?.values[0];
  // the year the envelope itself answers for, by its short label ("2023–24"), never the id
  const period = periodShort(labels, national.data?.context.periods?.[0] ?? state.period);
  return (
    <div>
      <Headline eyebrow={SCREENS[2].eyebrow} dek={SCREENS[2].dek}>{SCREENS[2].headline}</Headline>
      <div className="mt-8 border-l-2 border-accent/60 pl-5" data-testid="intro-example">
        {kpi ? (
          <>
            <p className="text-md leading-relaxed text-ink">
              Pakistan emitted{" "}
              <span className="num whitespace-nowrap" data-testid="intro-kpi" title={`${kpi.display} ${kpi.unit}`}>
                <span className="text-[30px] font-semibold leading-none tracking-tight">{splitDisplay(kpi.display).int}</span>
                <span className="text-md text-muted">{splitDisplay(kpi.display).rest}</span>
              </span>{" "}
              {unitText(kpi.unit)}{period ? <> in {period}</> : null}.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <button type="button" onClick={onExplore} className="flex items-center gap-1 font-semibold text-accent hover:underline" data-testid="intro-explore-from">
                Explore where those emissions came from <ArrowRight size={14} />
              </button>
              <button type="button" onClick={() => national.data && onSource(national.data)} className="flex items-center gap-1 text-muted hover:text-ink hover:underline" data-testid="intro-source">
                View source <ArrowRight size={14} />
              </button>
            </div>
          </>
        ) : national.error ? (
          <p className="text-sm text-muted">The national total could not be read from the API right now; the map and panels show the refusal by name.</p>
        ) : (
          <div className="animate-pulse space-y-2" aria-hidden="true">
            <div className="h-7 w-2/3 rounded bg-ink/5" />
            <div className="h-4 w-1/3 rounded bg-ink/5" />
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenOpen({ onDismiss }: { onDismiss: () => void }) {
  const { release, setState } = useExplorer();
  return (
    <div>
      <Headline eyebrow={SCREENS[3].eyebrow} dek={SCREENS[3].dek}>{SCREENS[3].headline}</Headline>
      <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2 text-sm text-ink sm:grid-cols-2">
        <li><span className="font-semibold">Open data</span> <span className="text-muted">— every table downloadable, with its licence.</span></li>
        <li><span className="font-semibold">Open method</span> <span className="text-muted">— sources, factors and evidence grades on record.</span></li>
        <li><span className="font-semibold">Open code</span> <span className="text-muted">— the build that produced every number.</span></li>
        <li><span className="font-semibold">Replayable</span> <span className="text-muted">— each answer can be reproduced from its receipt.</span></li>
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onDismiss();
            setState({ ask: true });
          }}
          className="pill border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
          data-testid="intro-ask"
        >
          Ask a question
        </button>
        <Link href="/about" onClick={onDismiss} className="text-sm text-muted hover:text-ink hover:underline" data-testid="intro-about">
          Read about the method, the data and the licences →
        </Link>
      </div>
      <p className="mt-8 text-micro normal-case tracking-normal text-muted" data-testid="intro-footnote">
        {release.release_id}. Every number in the Explorer is printed as the API returned it, with a receipt that replays the query; the About page has the details.
      </p>
    </div>
  );
}
