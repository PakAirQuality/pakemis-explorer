"use client";
/** The routes strip: four plain link cards naming each surface with its job (Explore tests · Map locates · Methods proves · Downloads releases). */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ROUTES } from "./copy";

export function RoutesStrip() {
  return (
    <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="routes">
      {ROUTES.map((r) => (
        <Link key={r.href} href={r.href} className="card group flex items-start justify-between gap-3 p-4 hover:shadow-pill" data-testid="route-card">
          <div>
            <div className="text-sm font-semibold text-fg">{r.title}</div>
            <p className="mt-1 text-xs text-muted">{r.text}</p>
          </div>
          <ArrowRight size={16} className="mt-0.5 shrink-0 text-muted group-hover:text-accent" aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}
