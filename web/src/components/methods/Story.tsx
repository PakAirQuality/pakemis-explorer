"use client";
/**
 * The Methods story: how the inventory is built, told the way the mock-up tells it - each
 * illustration shows how the previous step becomes the next. A hero (the opening figure: public
 * records → an emissions record → a national picture), a strip naming the six chapters, then
 * the six chapters themselves on alternating cream and pale-yellow bands: Sources, Calculations,
 * Sectors, Totals, Time & place, Limits - the last a chapter of its own, because uncertainty and
 * missing coverage answer different questions and neither is a zero.
 *
 * On a wide screen the illustration stands FIXED beside the text (one sticky stage in the right
 * column, spanning the six bands) and changes as the reader scrolls - the active chapter comes
 * from useActiveStep, a small IntersectionObserver over the sections. Below the lg breakpoint
 * each chapter carries its own illustration directly under its explanation and the stage is
 * gone. The cross-fade is a 300 ms opacity transition, none when the reader prefers reduced
 * motion.
 *
 * Every figure is a server string: the covered total in chapter 4 is the national envelope's
 * `display_short` with its own unit words, the count in chapter 6 is the completeness table's
 * row count, the land-use sentence is the release's note. Words carry everything else; the
 * illustrations assert no number (public/methods/README.md).
 */
import { useMemo } from "react";
import Link from "next/link";
import { ArrowDown, BookOpen, ChevronRight, ScrollText } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { releaseFacts, useRelease } from "@/lib/release";
import { useCompleteness, useEmissions } from "@/lib/queries";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { reducedMotion } from "@/components/shell/ParticleCanvas";
import { ILLUSTRATION_DIR, STEPS, STORY } from "./copy";
import { useActiveStep } from "./useActiveStep";

const PRIMARY = "inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const TEXT_LINK = "inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline";
/** The page's content width and the two-column split the hero and every chapter share. */
const WIDTH = "mx-auto w-full max-w-[1200px] px-5";
const SPLIT = "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12";
/** A band's fill runs edge to edge behind a contained row: cream for the odd chapters, pale yellow for the even. */
const BLEED = "before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:content-['']";
const CREAM = `${BLEED} before:bg-warm/95`;
const PALE = `${BLEED} before:bg-nav/95`;
/** grid-row of each chapter, spelled out so Tailwind sees every class. */
const ROW = ["lg:row-start-1", "lg:row-start-2", "lg:row-start-3", "lg:row-start-4", "lg:row-start-5", "lg:row-start-6"] as const;

/** The cell's `unit_words` as the server wrote them ("million tonnes CO₂e"), else its short unit. */
function unitWordsOf(cell: Cell): string {
  const w = (cell as Record<string, unknown>).unit_words;
  return typeof w === "string" && w ? w : cellUnit(cell);
}

const anchorOf = (id: string) => `step-${id}`;

/* eslint-disable @next/next/no-img-element -- static export; the illustrations are plain SVG files under public/methods */
function Illustration({ file, alt, className = "", testId, hidden = false }: { file: string; alt: string; className?: string; testId?: string; hidden?: boolean }) {
  return (
    <img
      src={`${ILLUSTRATION_DIR}/${file}`}
      alt={alt}
      width={960}
      height={440}
      loading="lazy"
      decoding="async"
      aria-hidden={hidden || undefined}
      data-testid={testId}
      className={`block h-auto w-full ${className}`}
    />
  );
}
/* eslint-enable @next/next/no-img-element */

export function Story({ onBrowse }: { onBrowse: () => void }) {
  const { state, labels, dims } = useExplorer();
  const release = useRelease();
  const facts = releaseFacts(release.data);

  const scope = useMemo(() => ({ periods: [state.period], configuration_id: state.config, gwp_basis: state.gwp }), [state.period, state.config, state.gwp]);
  const total = useEmissions(scope, true);
  const completeness = useCompleteness({ notation_keys: ["NE"] });
  const cell = total.data?.values.find((c: Cell) => typeof c.value === "number") ?? null;
  const neCount = completeness.data?.values.length ?? null;

  const ids = useMemo(() => STEPS.map((s) => anchorOf(s.id)), []);
  const active = useActiveStep(ids);
  const fade = reducedMotion() ? "" : "transition-opacity duration-300 ease-out";

  return (
    <div data-testid="story">
      {/* --- the hero: the opening figure ------------------------------------------------- */}
      <section className={`relative overflow-hidden ${CREAM}`} data-testid="story-hero">
        <div className={`${WIDTH} ${SPLIT} relative pb-10 pt-8 lg:items-center lg:pb-12 lg:pt-10`}>
          <ContourMotif corner="top-right" />
          <div className="relative">
            <div className="micro">{STORY.eyebrow}</div>
            <h1 className="mt-3 max-w-[14em] text-3xl font-semibold leading-tight tracking-tight text-fg md:text-4xl">{STORY.headline}</h1>
            <p className="mt-4 max-w-[34em] text-md leading-relaxed text-muted">{STORY.dek}</p>
            <p className="mt-3 text-sm text-muted" data-testid="story-scope">{STORY.scope}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#story-steps" className={PRIMARY} data-testid="follow-reconstruction">
                {STORY.follow} <ArrowDown size={15} aria-hidden="true" />
              </a>
              <button type="button" onClick={onBrowse} className={OUTLINE} data-testid="browse-evidence">
                <ScrollText size={15} aria-hidden="true" /> {STORY.browse}
              </button>
              <Link href="/methodology" className={TEXT_LINK} data-testid="read-methodology">
                <BookOpen size={15} aria-hidden="true" /> {STORY.readMethodology}
              </Link>
            </div>
          </div>
          <div className="relative mt-8 lg:mt-0" data-testid="story-figure">
            <Illustration file={STORY.heroFile} alt={STORY.heroAlt} />
          </div>
        </div>
      </section>

      {/* --- the strip: six chapters, the active one marked ------------------------------- */}
      <nav id="story-steps" aria-label={STORY.strip} className={`relative z-20 scroll-mt-16 border-y border-line ${CREAM} lg:sticky lg:top-0`} data-testid="story-steps-nav">
        <div className={`${WIDTH} flex flex-wrap items-center gap-x-6 gap-y-2 py-3`}>
          <span className="micro">{STORY.strip}</span>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {STEPS.map((s, i) => {
              const current = anchorOf(s.id) === active;
              return (
                <li key={s.id} className="flex items-center gap-1">
                  <a
                    href={`#${anchorOf(s.id)}`}
                    aria-current={current ? "step" : undefined}
                    data-testid={`story-step-link-${s.id}`}
                    className={`rounded-full px-2 py-1 font-medium transition-colors ${current ? "text-accent underline decoration-brand-gold decoration-2 underline-offset-[6px]" : "text-muted hover:text-fg"}`}
                  >
                    <span className="num mr-1 text-xs">{s.n}</span>
                    {s.short}
                  </a>
                  {i < STEPS.length - 1 ? <ChevronRight size={12} className="text-line-strong" aria-hidden="true" /> : null}
                </li>
              );
            })}
          </ol>
        </div>
      </nav>

      {/* --- the six chapters, the stage fixed beside them --------------------------------- */}
      <div className={`${WIDTH} relative lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-12`} data-testid="story-chapters">
        {STEPS.map((s, i) => {
          const caption =
            s.id === "totals" && cell ? (
              <p className="caption mt-4 text-sm text-muted" data-testid="story-total">
                {STORY.totalCaption(periodShort(labels, state.period))}{" "}
                <b className="num whitespace-nowrap text-fg" data-testid="story-total-display">{shown(cell)}</b>{" "}
                <span data-testid="story-section-total">{unitWordsOf(cell)}</span>.
              </p>
            ) : s.id === "limits" && (neCount !== null || facts.lulucf.note) ? (
              <p className="caption mt-4 text-sm text-muted" data-testid="story-gaps">
                {STORY.gapsCaption(neCount)}
                {facts.lulucf.note ? <> {STORY.lulucfLead} {facts.lulucf.note}.</> : null}
              </p>
            ) : null;
          return (
            <section
              key={s.id}
              id={anchorOf(s.id)}
              className={`relative scroll-mt-24 py-12 lg:col-span-2 lg:col-start-1 ${ROW[i]} lg:min-h-[32rem] lg:py-16 ${i % 2 === 0 ? CREAM : PALE}`}
              data-testid={`story-section-${i + 1}`}
              data-active={anchorOf(s.id) === active || undefined}
            >
              <div className={SPLIT}>
                <div className="relative flex gap-5">
                  {/* the numbered rail: the chapter number, the gold dot, the thread down the chapter */}
                  <div className="flex shrink-0 flex-col items-center" aria-hidden="true">
                    <span className="num text-2xl font-semibold leading-none text-accent">{s.n}</span>
                    <span className="mt-2 h-2.5 w-2.5 rounded-full bg-brand-gold ring-2 ring-accent" />
                    <span className="mt-2 w-px flex-1 bg-accent/30" />
                  </div>
                  <article className="min-w-0 pb-2">
                    <h2 className="text-xl font-semibold tracking-tight text-fg md:text-2xl">{s.title}</h2>
                    <p className="mt-3 max-w-[30em] text-md leading-relaxed text-muted">{s.body}</p>
                    {s.id === "sectors" ? (
                      <div className="mt-4 flex flex-wrap gap-1.5" data-testid="story-module-chips">
                        {dims.sectors.map((m) => (
                          <Link key={m} href={`/methods/sectors/${m}`} className="rounded-full border border-nav-line bg-card px-3 py-1 text-xs font-medium text-fg shadow-sm hover:bg-surface-3">
                            {sectorLabel(labels, m)}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    {caption}
                    <p className="mt-4">
                      <Link href={s.link.href} className={TEXT_LINK} data-testid={`story-link-${s.id}`}>
                        {s.link.label} <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    </p>
                    {/* below lg: the chapter's own illustration, directly under its explanation */}
                    <div className="mt-6 lg:hidden">
                      <Illustration file={s.file} alt={s.alt} testId={`story-illustration-${i + 1}`} />
                    </div>
                  </article>
                </div>
              </div>
            </section>
          );
        })}

        {/* the stage: one sticky column spanning the six bands; the active chapter's picture on top */}
        <div className="hidden lg:col-start-2 lg:row-start-1 lg:row-end-7 lg:block">
          <div className="sticky top-24 py-16" data-testid="story-stage" data-active={active}>
            {/* a paper panel, so the picture reads as one card while the bands scroll past behind it */}
            <div className="relative aspect-[960/440] w-full overflow-hidden rounded-card border border-line bg-card/95 shadow-card">
              {STEPS.map((s) => {
                const on = anchorOf(s.id) === active;
                return (
                  <div key={s.id} className={`absolute inset-0 ${fade} ${on ? "opacity-100" : "opacity-0"}`} data-testid={`story-stage-${s.id}`} data-on={on || undefined}>
                    <Illustration file={s.file} alt={s.alt} hidden={!on} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* --- the close --------------------------------------------------------------------- */}
      <section className={`${WIDTH} py-12`} data-testid="story-close">
        <div className="relative overflow-hidden rounded-card border border-nav-line bg-nav px-6 py-8 md:px-10">
          <ContourMotif corner="bottom-right" opacity={0.18} />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-accent">{STORY.close.title}</h2>
              <p className="mt-2 max-w-[38em] text-md text-muted">{STORY.close.dek}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className={PRIMARY} data-testid="close-explore">
                {STORY.close.explore} <ChevronRight size={15} aria-hidden="true" />
              </Link>
              <Link href="/methods/evidence" className={OUTLINE} data-testid="close-evidence">
                {STORY.close.evidence} <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
