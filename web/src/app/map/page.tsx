"use client";
/**
 * The map merged into the workspace at `/` on 2026-08-30 (one full-bleed map, the insight deck
 * and the filter panel over it); this stub redirects, carrying the whole query string across so
 * a shared `/map?level=adm2&geo=…` link opens the same view on the workspace.
 */
import { Redirect } from "@/components/shell/Redirect";

export default function MapRedirect() {
  return <Redirect to="/" label="Explore" />;
}
