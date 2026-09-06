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
import { cellUnit, sectorLabel } from "@/lib/labels";
import { releaseFacts, useRelease } from "@/lib/release";
import { useCompleteness, useEmissions, useEvidence } from "@/lib/queries";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { sourceWords } from "./sectorText";

const STORY = {
  eyebrow: "How the inventory is built",
  headline: "From public records to a national emissions inventory",
  questions: [
    "Where does each number come from?",
    "How do the modules become one consistent inventory?",
    "What is observed, allocated, assumed — or still missing?",
  ],
  intro:
    "This is an independent public-data reconstruction of Pakistan's greenhouse-gas emissions, excluding land use and forestry. Every estimate passes through the same traceable, tested system — from source document to national total, month and map.",
  follow: "Follow the reconstruction",
  browse: "Browse the evidence",
  readMethodology: "Read the methodology",
  scrollHint: "Scroll to follow the reconstruction",
  records: "Public records",
  componentRow: "Component row",
  componentGrain: "one gas · one source item · one IPCC category",
  modules: (n: number) => `${n} tested modules`,
  invariants: "shared invariants across every module",
  inventory: "Annual inventory",
  unestimated: "Unestimated",
  unestimatedNote: "Known gaps recorded, not ignored.",
  months: (n: number) => `${n} months`,
  maps: "District & grid maps",
  uncertainty: "Uncertainty",
  reconstruction: "The reconstruction",
  sections: [
    {
      title: "Every estimate begins with a source",
      body: "Nothing enters the inventory without a public document behind it: statistical yearbooks, regulator reports, survey microdata, satellite products. Each is registered with its digest, so a number can always name the page it came from.",
      link: "Inspect the sources",
    },
    {
      title: "One gas, one source item, one IPCC category",
      body: "The atom of the system is the component row: a single gas from a single source item, priced under a single IPCC category. Totals are sums over these rows and nothing else — which is why any figure on any page can open its own claim record.",
      link: "Open a claim record",
    },
    {
      title: "The modules, one tested system",
      body: "Each sector is reconstructed by its own module, but all of them answer to the same registries, the same period vocabulary and the same closure tests. A module cannot ship a number the shared checks have not seen.",
      link: "",
    },
    {
      title: "The annual inventory",
      body: "The component rows close to one national total per year, with the sector shares the server itself attaches. The same envelope that renders this figure carries its receipt, its rows and its calculation.",
      link: "Query it on the Data page",
    },
    {
      title: "Time, space, uncertainty — and what is not estimated",
      body: "The annual total is carried down to months, to provinces and districts, and onto a fine national grid — each step graded by the evidence that supports it, never silently interpolated. Uncertainty is published per category and resolution.",
      link: "See the gaps",
    },
  ],
} as const;

const PRIMARY = "inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const TEXT_LINK = "inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline";
const NODE_CARD = "relative rounded-xl border border-line bg-card px-4 py-3 shadow-card";

function Connector() {
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <ArrowDown size={15} className="text-muted" />
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

  const catalogueHref = (hash = "") => `/methods?mode=catalogue${hash}`;

  return (
    <div data-testid="story">
      {/* --- the hero -------------------------------------------------------------------- */}
      <section className="relative overflow-hidden" data-testid="story-hero">
        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-10 px-5 pb-10 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-14 lg:pt-14">
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
              <Link href={catalogueHref("#methodology")} className={TEXT_LINK} data-testid="read-methodology">
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
            <div className="relative">
              <div className="relative">
                <div className="absolute inset-0 -translate-y-1.5 translate-x-1.5 rounded-xl border border-line bg-card" aria-hidden="true" />
                <div className="absolute inset-0 -translate-y-3 translate-x-3 rounded-xl border border-line bg-card" aria-hidden="true" />
                <div className={NODE_CARD}>
                  <div className="micro flex items-center gap-1.5"><FileText size={13} aria-hidden="true" /> {STORY.records}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid="story-sources">
                    {sources.slice(0, 5).map((s) => (
                      <span key={s} className="rounded-md border border-line bg-surface-3 px-2 py-1 text-xs text-fg">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <Connector />
              <div className={NODE_CARD}>
                <div className="micro">{STORY.componentRow}</div>
                <div className="mt-1 text-xs text-muted">{STORY.componentGrain}</div>
              </div>
              <Connector />
              <div className={`${NODE_CARD} border-t-[3px] border-t-brand-gold`} data-testid="story-modules">
                <div className="micro">{STORY.modules(dims.sectors.length)}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <CircleCheck size={13} className="text-amber-soft" aria-hidden="true" /> {STORY.invariants}
                </div>
              </div>
              <Connector />
              <div className="flex items-center justify-center gap-4">
                <div className="flex h-44 w-44 shrink-0 flex-col items-center justify-center rounded-full bg-accent text-center text-on-accent shadow-card" data-testid="story-total">
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
                <div className="max-w-[10rem]" data-testid="story-unestimated">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-accent/50 text-center">
                    <span className="px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">{STORY.unestimated}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">{STORY.unestimatedNote}</p>
                </div>
              </div>
              <Connector />
              <div className="grid grid-cols-3 gap-2">
                <div className={`${NODE_CARD} text-center`}>
                  <CalendarDays size={15} className="mx-auto text-accent" aria-hidden="true" />
                  <div className="micro mt-1.5" data-testid="story-months">{STORY.months(months)}</div>
                </div>
                <div className={`${NODE_CARD} text-center`}>
                  <MapIcon size={15} className="mx-auto text-accent" aria-hidden="true" />
                  <div className="micro mt-1.5">{STORY.maps}</div>
                </div>
                <div className={`${NODE_CARD} text-center`}>
                  <BarChart3 size={15} className="mx-auto text-accent" aria-hidden="true" />
                  <div className="micro mt-1.5">{STORY.uncertainty}</div>
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
          {STORY.sections.map((s, i) => (
            <article key={s.title} className="mt-8" data-testid={`story-section-${i + 1}`}>
              <h2 className="text-xl font-semibold tracking-tight text-fg">
                {i + 1} · {s.title}
              </h2>
              <p className="mt-2 max-w-[46em] text-md leading-relaxed text-muted">{s.body}</p>
              {i === 0 && (
                <p className="mt-3">
                  <Link href={catalogueHref()} className={TEXT_LINK}>{s.link} <ChevronRight size={14} aria-hidden="true" /></Link>
                </p>
              )}
              {i === 1 && (
                <p className="mt-3">
                  <Link href={catalogueHref("#claims")} className={TEXT_LINK}>{s.link} <ChevronRight size={14} aria-hidden="true" /></Link>
                </p>
              )}
              {i === 2 && (
                <div className="mt-3 flex flex-wrap gap-1.5" data-testid="story-module-chips">
                  {dims.sectors.map((m) => (
                    <Link key={m} href={`/methods?mode=catalogue&sector=${m}`} className="rounded-full border border-nav-line bg-nav px-3 py-1 text-xs font-medium text-fg shadow-sm hover:bg-surface-3">
                      {sectorLabel(labels, m)}
                    </Link>
                  ))}
                </div>
              )}
              {i === 3 && (
                <p className="mt-3 flex flex-wrap items-center gap-3">
                  {cell && (
                    <span className="num text-lg font-semibold text-accent" data-testid="story-section-total">
                      {shown(cell)} {cellUnit(cell)}
                    </span>
                  )}
                  <Link href="/data" className={TEXT_LINK}>{s.link} <ChevronRight size={14} aria-hidden="true" /></Link>
                </p>
              )}
              {i === 4 && (
                <>
                  <div className="note mt-3 max-w-[46em] text-sm" data-testid="story-gaps">
                    {neCount !== null ? <>{neCount === 1 ? "One category is" : `${neCount} categories are`} recorded NE — not estimated, never counted as zero. </> : null}
                    {facts.lulucf.note ? <>Land use and forestry: {facts.lulucf.note}.</> : null}
                  </div>
                  <p className="mt-3">
                    <Link href={catalogueHref()} className={TEXT_LINK}>{s.link} <ChevronRight size={14} aria-hidden="true" /></Link>
                  </p>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
