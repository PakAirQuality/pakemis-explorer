"use client";
/**
 * The Methods story, the page's opening mode (the evidence catalogue stands behind the mode
 * pill): a hero that says what the reconstruction is and asks the reader's three questions, a
 * hand-drawn pipeline — public records → one component row → the tested modules → the annual
 * inventory, its known gaps called out beside it, and the three products under it — then the
 * numbered reconstruction scroll, each section one claim and one concrete door into the
 * catalogue. Every figure is a server string: the inventory total is an envelope's
 * `display_short`, the module and month counts are the release's own dims, the LULUCF sentence
 * is the release's note. Where no server number exists (an invariant count, the grid's cell
 * size) the story uses words, not an invented figure.
 */
import { useMemo } from "react";
import Link from "next/link";
import { ArrowDown, BarChart3, BookOpen, CalendarDays, ChevronRight, CircleCheck, FileText, Map as MapIcon, ScrollText } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { releaseFacts, useRelease } from "@/lib/release";
import { useCompleteness, useEmissions, useEvidence } from "@/lib/queries";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { sourceWords } from "./sectorText";

const STORY = {
  eyebrow: "How we built the inventory",
  headline: "From public records to Pakistan\u2019s emissions inventory",
  questions: [
    "Where does each number come from?",
    "How are estimates from different sectors added together?",
    "Which parts use direct data, which rely on assumptions, and what is still missing?",
  ],
  intro:
    "This is an independent estimate of Pakistan\u2019s greenhouse-gas emissions, built from publicly available records. It does not include land use or forestry. For every figure, readers can see where it came from and how it was calculated. The annual estimates are also broken down by month and mapped across Pakistan.",
  follow: "See how it works",
  browse: "Browse the evidence",
  readMethodology: "Read the full methodology",
  scrollHint: "Scroll to see how it works",
  records: "Public records",
  componentRow: "One emissions record",
  componentGrain: "one gas · one activity · one IPCC category",
  modules: (n: number) => `${n} sector modules`,
  invariants: "The same rules and checks for every sector",
  inventory: "Annual total",
  unestimated: "Known gaps",
  unestimatedNote: "Listed openly, not treated as zero.",
  months: "Monthly estimates",
  maps: "Province, district and grid maps",
  uncertainty: "Uncertainty ranges",
  reconstruction: "How it works",
} as const;

const PRIMARY = "inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const TEXT_LINK = "inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline";
const NODE_CARD = "relative rounded-xl border border-line bg-card px-4 py-3 shadow-card";

/** The cell's `unit_words` as the server wrote them ("million tonnes CO₂e"), else its short unit. */
function unitWordsOf(cell: Cell): string {
  const w = (cell as Record<string, unknown>).unit_words;
  return typeof w === "string" && w ? w : cellUnit(cell);
}

/** The dashed left-to-right connector of the pipeline; below lg the flow stacks and it points down. */
function Flow() {
  return (
    <>
      <div className="hidden min-w-6 flex-1 items-center px-1 lg:flex" aria-hidden="true">
        <div className="h-px flex-1 border-t border-dashed border-line-strong" />
        <ChevronRight size={13} className="-ml-1.5 shrink-0 text-muted" />
      </div>
      <div className="flex justify-center py-1 lg:hidden" aria-hidden="true">
        <ArrowDown size={15} className="text-muted" />
      </div>
    </>
  );
}

/** One product tile under the inventory's bracket, its drop line above it. */
function Branch({ icon, label, testId }: { icon: React.ReactNode; label: string; testId?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-3 w-px bg-accent/40" aria-hidden="true" />
      <div className={`${NODE_CARD} w-full text-center`}>
        {icon}
        <div className="micro mt-1.5" data-testid={testId}>{label}</div>
      </div>
    </div>
  );
}

export function Story({ onBrowse }: { onBrowse: () => void }) {
  const { state, labels, dims, defaults } = useExplorer();
  const release = useRelease();
  const facts = releaseFacts(release.data);

  const scope = useMemo(() => ({ periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp }), [state.period, state.config, state.gwp]);
  const total = useEmissions(scope, true);
  const all = useEvidence("_", {});
  const completeness = useCompleteness({ notation_keys: ["NE"] });

  const cell = total.data?.values.find((c: Cell) => typeof c.value === "number") ?? null;
  // the record chips: the distinct issuing agencies (the acronym sourceWords upper-cases),
  // falling back to full source names where a stream's source carries no acronym
  const sources = useMemo(() => {
    const agencies: string[] = [];
    const named: string[] = [];
    for (const c of (all.data?.values ?? []) as (Cell & { source_id?: string })[]) {
      const s = c.source_id;
      if (typeof s !== "string" || !s || s === "no_national_quantity") continue;
      const words = sourceWords(s);
      const first = words.split(" ")[0];
      if (first.length >= 3 && first === first.toUpperCase()) {
        if (!agencies.includes(first)) agencies.push(first);
      } else if (!named.includes(words)) named.push(words);
    }
    return agencies.length ? agencies : named;
  }, [all.data]);
  const months = dims.monthsByPeriod[defaults.period_id]?.length ?? 0;
  const neCount = completeness.data?.values.length ?? null;

  const sectorsHref = "/methods/sectors";

  return (
    <div data-testid="story">
      {/* --- the hero -------------------------------------------------------------------- */}
      <section className="relative overflow-hidden" data-testid="story-hero">
        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-10 px-5 pb-10 pt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:pt-12">
          <div>
            <div className="micro">{STORY.eyebrow}</div>
            <h1 className="mt-3 max-w-[16em] text-3xl font-semibold leading-tight tracking-tight text-fg md:text-4xl">{STORY.headline}</h1>
            <div className="mt-5 space-y-1">
              {STORY.questions.map((q) => (
                <p key={q} className="text-md italic text-muted">{q}</p>
              ))}
            </div>
            <p className="mt-5 max-w-[38em] text-md leading-relaxed text-fg">{STORY.intro}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#reconstruction" className={PRIMARY} data-testid="follow-reconstruction">
                {STORY.follow} <ChevronRight size={15} aria-hidden="true" />
              </a>
              <button type="button" onClick={onBrowse} className={OUTLINE} data-testid="browse-evidence">
                <ScrollText size={15} aria-hidden="true" /> {STORY.browse}
              </button>
              <Link href="/methodology" className={TEXT_LINK} data-testid="read-methodology">
                <BookOpen size={15} aria-hidden="true" /> {STORY.readMethodology}
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-2 text-xs text-muted" aria-hidden="true">
              <ArrowDown size={14} /> {STORY.scrollHint}
            </div>
          </div>

          {/* --- the pipeline ------------------------------------------------------------ */}
          <div className="relative" data-testid="story-diagram">
            <ContourMotif corner="top-right" />
            <div className="relative flex flex-col gap-1 lg:min-h-[26rem] lg:flex-row lg:items-center lg:gap-0">
              <div className="relative shrink-0 lg:w-44">
                <div className="absolute inset-0 -translate-y-1.5 translate-x-1.5 rounded-xl border border-line bg-card" aria-hidden="true" />
                <div className="absolute inset-0 -translate-y-3 translate-x-3 rounded-xl border border-line bg-card" aria-hidden="true" />
                <div className={NODE_CARD}>
                  <div className="micro flex items-center gap-1.5"><FileText size={13} aria-hidden="true" /> {STORY.records}</div>
                  <div className="mt-2 flex flex-col gap-1.5" data-testid="story-sources">
                    {sources.slice(0, 4).map((s) => (
                      <span key={s} className="rounded-md border border-line bg-surface-3 px-2 py-1 text-xs text-fg">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <Flow />
              <div className="shrink-0 lg:w-40">
                <div className={NODE_CARD}>
                  <div className="micro">{STORY.componentRow}</div>
                </div>
                <div className="mt-1.5 px-1 text-center text-[10px] text-muted">{STORY.componentGrain}</div>
              </div>
              <Flow />
              <div className={`${NODE_CARD} shrink-0 border-t-[3px] border-t-brand-gold lg:w-44`} data-testid="story-modules">
                <div className="micro">{STORY.modules(dims.sectors.length)}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                  <CircleCheck size={13} className="text-amber-soft" aria-hidden="true" /> {STORY.invariants}
                </div>
              </div>
              <Flow />
              <div className="flex shrink-0 flex-col items-center">
                <div className="flex items-start gap-2" data-testid="story-unestimated">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-dashed border-accent/50 text-center">
                    <span className="px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">{STORY.unestimated}</span>
                  </div>
                  <p className="mt-3 w-24 text-[11px] leading-snug text-muted">{STORY.unestimatedNote}</p>
                </div>
                <div className="h-5 w-px border-l border-dashed border-accent/50" aria-hidden="true" />
                <div className="flex h-44 w-44 flex-col items-center justify-center rounded-full bg-accent text-center text-on-accent shadow-card" data-testid="story-total">
                  <BarChart3 size={16} aria-hidden="true" />
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">{STORY.inventory}</div>
                  {cell ? (
                    <>
                      <div className="num text-3xl font-semibold" data-testid="story-total-display">{shown(cell)}</div>
                      <div className="text-xs opacity-80">{cellUnit(cell)}</div>
                    </>
                  ) : (
                    <div className="num text-3xl font-semibold opacity-60">—</div>
                  )}
                </div>
                <div className="h-4 w-px bg-accent/40" aria-hidden="true" />
                <div className="w-[22rem] max-w-full">
                  <div className="mx-[3.7rem] border-t border-accent/40" aria-hidden="true" />
                  <div className="grid grid-cols-3 gap-2">
                    <Branch icon={<CalendarDays size={15} className="mx-auto text-accent" aria-hidden="true" />} label={STORY.months} testId="story-months" />
                    <Branch icon={<MapIcon size={15} className="mx-auto text-accent" aria-hidden="true" />} label={STORY.maps} />
                    <Branch icon={<BarChart3 size={15} className="mx-auto text-accent" aria-hidden="true" />} label={STORY.uncertainty} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- the reconstruction ---------------------------------------------------------- */}
      <section id="reconstruction" className="scroll-mt-20 border-t border-line bg-surface-2" data-testid="story-reconstruction">
        <div className="mx-auto max-w-[900px] px-5 pb-16 pt-10">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-accent">{STORY.reconstruction}</div>
          <article className="mt-8" data-testid="story-section-1">
            <h2 className="text-xl font-semibold tracking-tight text-fg">1 · Every number starts with a source</h2>
            <p className="mt-2 max-w-[46em] text-md leading-relaxed text-muted">
              Every number begins with a public source, such as a statistical yearbook, regulator report, survey or satellite dataset. We record the source alongside the figure so readers can check where it came from.
            </p>
            <p className="mt-3">
              <Link href={sectorsHref} className={TEXT_LINK}>Browse the sources <ChevronRight size={14} aria-hidden="true" /></Link>
            </p>
          </article>
          <article className="mt-8" data-testid="story-section-2">
            <h2 className="text-xl font-semibold tracking-tight text-fg">2 · Turn the data into simple records</h2>
            <p className="mt-2 max-w-[46em] text-md leading-relaxed text-muted">
              We break the data into individual emissions records. Each record covers one gas from one activity — for example, fuel sold or cattle counted — under one IPCC category. Internally, we call this a component row. All the totals on the site are built from these records.
            </p>
            <p className="mt-3">
              <Link href="/methods/evidence" className={TEXT_LINK}>View an emissions record <ChevronRight size={14} aria-hidden="true" /></Link>
            </p>
          </article>
          <article className="mt-8" data-testid="story-section-3">
            <h2 className="text-xl font-semibold tracking-tight text-fg">3 · Calculate every sector using the same rules</h2>
            <p className="mt-2 max-w-[46em] text-md leading-relaxed text-muted">
              Agriculture, power, transport and the other sectors are calculated separately. All of them use the same reporting period, follow the same structure and pass the same checks. This keeps the figures consistent and helps catch emissions that are missing or counted twice.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5" data-testid="story-module-chips">
              {dims.sectors.map((m) => (
                <Link key={m} href={`/methods/sectors/${m}`} className="rounded-full border border-nav-line bg-nav px-3 py-1 text-xs font-medium text-fg shadow-sm hover:bg-surface-3">
                  {sectorLabel(labels, m)}
                </Link>
              ))}
            </div>
          </article>
          <article className="mt-8" data-testid="story-section-4">
            <h2 className="text-xl font-semibold tracking-tight text-fg">4 · Add the records together</h2>
            <p className="mt-2 max-w-[46em] text-md leading-relaxed text-muted">
              Once the records pass the checks, they are added together.
              {cell ? (
                <>
                  {" "}
                  For {periodShort(labels, state.period)}, the sources covered by the inventory add up to{" "}
                  <b className="num whitespace-nowrap text-fg" data-testid="story-section-total">{shown(cell)} {unitWordsOf(cell)}</b>.
                </>
              ) : null}{" "}
              The Data page shows how this total is divided by sector, gas and IPCC category.
            </p>
            <p className="mt-3">
              <Link href="/data" className={TEXT_LINK}>Explore the data <ChevronRight size={14} aria-hidden="true" /></Link>
            </p>
          </article>
          <article className="mt-8" data-testid="story-section-5">
            <h2 className="text-xl font-semibold tracking-tight text-fg">5 · Show when and where emissions occur</h2>
            <p className="mt-2 max-w-[46em] text-md leading-relaxed text-muted">
              The annual estimates are divided across the {months} months of each year and mapped to provinces, districts and grid cells. Some of these breakdowns come from detailed records. Others use clearly labelled estimates or proxies.
            </p>
            <div className="note mt-3 max-w-[46em] text-sm" data-testid="story-gaps">
              We also show the uncertainty around the figures and list what could not yet be estimated
              {neCount !== null ? <> — {neCount === 1 ? "one category is" : `${neCount} categories are`} recorded NE</> : null}. Missing sources are never treated as zero.
              {facts.lulucf.note ? <> Land use and forestry remain outside the main total: {facts.lulucf.note}.</> : null}
            </div>
            <p className="mt-3">
              <Link href={sectorsHref} className={TEXT_LINK}>See what is missing <ChevronRight size={14} aria-hidden="true" /></Link>
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
