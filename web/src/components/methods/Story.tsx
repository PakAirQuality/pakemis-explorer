"use client";
/**
 * The Methods story: how the inventory is built, told the way the mock-up tells it - each
 * illustration shows how the previous step becomes the next. Cards over the map, the way
 * Downloads lays its page: a hero card (the opening figure: public records → an emissions record →
 * a national picture), a slim strip naming the six chapters, then six chapter cards alternating
 * white and pale yellow - Sources, Calculations, Sectors, Totals, Time & place, Limits - the last
 * a chapter of its own, because uncertainty and missing coverage answer different questions and
 * neither is a zero. Each card holds its explanation and its illustration together: beside each
 * other on a wide screen, the picture under the text on a narrow one. Nothing on the page is fixed
 * or scroll-driven (a first build kept the picture in a sticky stage that swapped as the reader
 * scrolled; it read as the figure moving about, and went on 2026-09-18).
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
import { ILLUSTRATION_DIR, STEPS, STORY } from "./copy";

const PRIMARY = "inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const TEXT_LINK = "inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline";
/** The pale card Downloads' hero wears (border border-nav-line, bg-nav), spelled here rather than imported so the
 *  methods bundle does not carry the downloads page; the two pages agree by the tokens, not by a shared string. */
const PALE_BORDER = "border border-nav-line";
const PALE_CARD = `rounded-card ${PALE_BORDER} bg-nav`;
/** The two-column split the hero card and every chapter card share on a wide screen. */
const SPLIT = "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-8";
/** A chapter card: white for the odd chapters, pale yellow for the even - the mock-up's rhythm, as cards. */
const CHAPTER = `overflow-hidden rounded-card ${PALE_BORDER} shadow-card`;

/** The cell's `unit_words` as the server wrote them ("million tonnes CO₂e"), else its short unit. */
function unitWordsOf(cell: Cell): string {
  const w = (cell as Record<string, unknown>).unit_words;
  return typeof w === "string" && w ? w : cellUnit(cell);
}

const anchorOf = (id: string) => `step-${id}`;

/* eslint-disable @next/next/no-img-element -- static export; the illustrations are plain SVG files under public/methods */
function Illustration({ file, alt, testId }: { file: string; alt: string; testId?: string }) {
  return <img src={`${ILLUSTRATION_DIR}/${file}`} alt={alt} width={960} height={440} loading="lazy" decoding="async" data-testid={testId} className="block h-auto w-full" />;
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

  return (
    // a contained column, like a reading page: the cards stop well short of a wide screen's edges
    <main className="mx-auto w-full max-w-[1040px] px-5 pb-14" data-testid="story">
      {/* --- the hero card: the opening figure --------------------------------------------- */}
      <section className={`relative overflow-hidden ${PALE_CARD} px-5 py-5 md:px-7 md:py-6`} data-testid="story-hero">
        <ContourMotif corner="top-right" />
        <div className={`relative ${SPLIT}`}>
          <div>
            <div className="micro">{STORY.eyebrow}</div>
            <h1 className="mt-2 max-w-[14em] text-2xl font-semibold leading-tight tracking-tight text-fg md:text-3xl">{STORY.headline}</h1>
            <p className="mt-3 max-w-[34em] text-sm leading-relaxed text-muted">{STORY.dek}</p>
            <p className="mt-2 text-xs text-muted" data-testid="story-scope">{STORY.scope}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
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
          <div className="mt-6 lg:mt-0" data-testid="story-figure">
            <Illustration file={STORY.heroFile} alt={STORY.heroAlt} />
          </div>
        </div>
      </section>

      {/* --- the strip: the six chapters, as anchors --------------------------------------- */}
      <nav id="story-steps" aria-label={STORY.strip} className="mt-3 scroll-mt-20 rounded-card border border-line bg-card px-5 py-2.5 shadow-card" data-testid="story-steps-nav">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="micro">{STORY.strip}</span>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1">
                <a href={`#${anchorOf(s.id)}`} data-testid={`story-step-link-${s.id}`} className="rounded-full px-2 py-1 font-medium text-muted transition-colors hover:text-fg">
                  <span className="num mr-1 text-xs">{s.n}</span>
                  {s.short}
                </a>
                {i < STEPS.length - 1 ? <ChevronRight size={12} className="text-line-strong" aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {/* --- the six chapter cards ---------------------------------------------------------- */}
      {STEPS.map((s, i) => {
        const pale = i % 2 === 1;
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
          <section key={s.id} id={anchorOf(s.id)} className={`mt-4 scroll-mt-24 ${CHAPTER} ${pale ? "bg-nav" : "bg-card"} px-5 py-5 md:px-7 md:py-6`} data-testid={`story-section-${i + 1}`}>
            <div className={SPLIT}>
              <div className="flex gap-5">
                {/* the numbered rail: the chapter number, the gold dot, the thread down the card */}
                <div className="flex shrink-0 flex-col items-center" aria-hidden="true">
                  <span className="num text-xl font-semibold leading-none text-accent">{s.n}</span>
                  <span className="mt-2 h-2.5 w-2.5 rounded-full bg-brand-gold ring-2 ring-accent" />
                  <span className="mt-2 w-px flex-1 bg-accent/30" />
                </div>
                <article className="min-w-0 pb-1">
                  <h2 className="text-lg font-semibold tracking-tight text-fg md:text-xl">{s.title}</h2>
                  <p className="mt-2 max-w-[30em] text-sm leading-relaxed text-muted">{s.body}</p>
                  {s.id === "sectors" ? (
                    <div className="mt-4 flex flex-wrap gap-1.5" data-testid="story-module-chips">
                      {dims.sectors.map((m) => (
                        <Link key={m} href={`/methods/sectors/${m}`} className={`rounded-full border border-nav-line px-3 py-1 text-xs font-medium text-fg shadow-sm hover:bg-surface-3 ${pale ? "bg-card" : "bg-nav"}`}>
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
                </article>
              </div>
              {/* the illustration: under the text on a narrow screen, beside it on a wide one; on a
                  pale card it sits on a white panel so it reads crisply */}
              <div className={`mt-5 lg:mt-0 ${pale ? "rounded-card border border-line bg-card p-2" : ""}`}>
                <Illustration file={s.file} alt={s.alt} testId={`story-illustration-${i + 1}`} />
              </div>
            </div>
          </section>
        );
      })}

      {/* --- the close card ------------------------------------------------------------------ */}
      <section className={`relative mt-6 overflow-hidden ${PALE_CARD} px-5 py-6 md:px-8`} data-testid="story-close">
        <ContourMotif corner="bottom-right" opacity={0.18} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-accent">{STORY.close.title}</h2>
            <p className="mt-1.5 max-w-[38em] text-sm text-muted">{STORY.close.dek}</p>
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
      </section>
    </main>
  );
}
