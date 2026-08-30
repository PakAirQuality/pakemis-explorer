"use client";
/**
 * The public Overview (plan §4), top to bottom: TopNav, the CurrentView bar, the hero with the
 * Estimated national total card, the question box, "Where emissions come from" and "How
 * emissions changed", three explainer cards, "Ready to go deeper?" and the footer (licences
 * from /release; no version). Every number on the page is a server string (`display_short`
 * by default, the contract `display` and `exact` under Result details); the page computes
 * nothing.
 */
import Link from "next/link";
import { Map, Download } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { releaseFacts } from "@/lib/release";
import { api } from "@/lib/api";
import { TopNav } from "@/components/shell/TopNav";
import { CurrentView } from "@/components/shell/CurrentView";
import { TotalCard } from "./TotalCard";
import { QuestionBox } from "./QuestionBox";
import { SectorsCard } from "./SectorsCard";
import { TrendCard } from "./TrendCard";
import { DEEPER, EXPLAINERS, HERO } from "./copy";

export function Overview() {
  const { release } = useExplorer();
  const facts = releaseFacts(release);
  const licences = [facts.licences.data_and_text ? `Data and text ${facts.licences.data_and_text}` : "", facts.licences.code ? `code ${facts.licences.code}` : "", facts.licences.odbl_carveouts.length ? "OSM-derived tables ODbL" : ""].filter(Boolean).join(" · ");
  return (
    <div className="min-h-dvh bg-surface" data-testid="overview">
      <TopNav />
      <CurrentView />
      <main className="mx-auto max-w-[1500px] px-4 pb-10 pt-8 md:px-6 md:pt-12">
        <section className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,1fr)_360px]" data-testid="hero">
          <div className="max-w-2xl">
            <div className="micro text-accent">{HERO.eyebrow}</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg md:text-4xl">{HERO.title}</h1>
            <p className="mt-3 text-md text-muted">{HERO.dek}</p>
          </div>
          <TotalCard />
        </section>
        <div className="mt-8">
          <QuestionBox />
        </div>
        <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2" data-testid="figures">
          <SectorsCard />
          <TrendCard />
        </section>
        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="explainers">
          {EXPLAINERS.map((e) => (
            <div key={e.title} className="card p-5">
              <h3 className="text-sm font-semibold text-fg">{e.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{e.text}</p>
            </div>
          ))}
        </section>
        <section className="card mt-8 flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between" data-testid="deeper">
          <div>
            <h2 className="text-xl font-semibold">{DEEPER.title}</h2>
            <p className="mt-1 text-sm text-muted">{DEEPER.text}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/map" className="pill flex items-center gap-1.5 bg-accent-fill px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110" data-testid="deeper-map">
              <Map size={15} /> {DEEPER.map}
            </Link>
            <Link href="/downloads" className="pill flex items-center gap-1.5 border border-line-strong px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-3" data-testid="deeper-download">
              <Download size={15} /> {DEEPER.download}
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-line" data-testid="footer">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-muted md:px-6">
          <span>{licences || "Licences as the release states them"}. Every number on this page is a server string carrying a receipt; the browser computes nothing.</span>
          <span className="flex flex-wrap gap-4">
            <Link href="/methods" className="hover:text-fg">Methods &amp; evidence</Link>
            <Link href="/downloads" className="hover:text-fg">Downloads</Link>
            <a href={api.docsUrl()} className="hover:text-fg">API</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
