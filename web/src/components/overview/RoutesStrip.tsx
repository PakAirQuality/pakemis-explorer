"use client";
/**
 * The routes strip: four plain link cards naming each surface with its job (Explore tests · Map
 * locates · Methods proves · Downloads releases), each with an icon tile tinted at 8 % in the
 * house style's four hues (blue, emerald, pink, amber; the icon in the full hue).
 */
import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, Download, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROUTES } from "./copy";

/** The tile's tint (the hue at 8 %) and the icon's hue, by route. */
export const ROUTE_TILES: Record<string, { icon: LucideIcon; tint: string; hue: string }> = {
  "/explore": { icon: BarChart3, tint: "rgba(59, 130, 246, 0.08)", hue: "#2563eb" },
  "/map": { icon: MapPin, tint: "rgba(16, 185, 129, 0.08)", hue: "#059669" },
  "/methods": { icon: BookOpen, tint: "rgba(236, 72, 153, 0.08)", hue: "#db2777" },
  "/downloads": { icon: Download, tint: "rgba(245, 158, 11, 0.08)", hue: "#d97706" },
};

export function RoutesStrip() {
  return (
    <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="routes">
      {ROUTES.map((r) => {
        const tile = ROUTE_TILES[r.href];
        return (
          <Link key={r.href} href={r.href} className="card group flex items-start justify-between gap-3 p-4 hover:shadow-pill" data-testid="route-card">
            {tile && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: tile.tint, color: tile.hue }} data-testid="route-tile" aria-hidden="true">
                <tile.icon size={18} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-fg">{r.title}</div>
              <p className="mt-1 text-xs text-muted">{r.text}</p>
            </div>
            <ArrowRight size={16} className="mt-0.5 shrink-0 text-muted group-hover:text-accent" aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
