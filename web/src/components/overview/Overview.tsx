"use client";
/**
 * The public Overview (plan §4), top to bottom: TopNav, the CurrentView bar, the hero with the
 * national total card, the question box, "Where emissions come from" and "How emissions
 * changed", three explainer cards, "Ready to go deeper?" and the footer. Every number on the
 * page is a server string (`display_short` by default); the page computes nothing.
 */
import Link from "next/link";
import { TopNav } from "@/components/shell/TopNav";
import { CurrentView } from "@/components/shell/CurrentView";
import { DEEPER, HERO } from "./copy";

export function Overview() {
  return (
    <div className="min-h-dvh bg-surface" data-testid="overview">
      <TopNav />
      <CurrentView />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <section className="max-w-2xl" data-testid="hero">
          <div className="micro text-accent">{HERO.eyebrow}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg md:text-4xl">{HERO.title}</h1>
          <p className="mt-3 text-md text-muted">{HERO.dek}</p>
        </section>
        <section className="card mt-10 p-6" data-testid="deeper">
          <h2 className="text-xl font-semibold">{DEEPER.title}</h2>
          <p className="mt-1 text-sm text-muted">{DEEPER.text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/map" className="pill bg-accent-fill px-4 py-2 text-sm font-semibold text-on-accent">{DEEPER.map}</Link>
            <Link href="/downloads" className="pill border border-line-strong px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-3">{DEEPER.download}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
