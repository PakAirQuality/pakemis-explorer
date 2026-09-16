"use client";
/**
 * /methods is the story alone (the visual explanation of how the inventory is built); the
 * catalogue, the sector pages, the evidence tool and the methodology prose live on their own
 * routes (/methods/sectors, /methods/sectors/[sector], /methods/evidence, /methodology).
 * This page also carries the legacy query-string mapper: the old single-page URLs
 * (?mode=catalogue, ?mode=catalogue&sector=x, ?claim=receipt:cell) replace to the routes
 * that now own them, so nothing bookmarked breaks.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { NavCapsule } from "@/components/shell/NavCapsule";
import type { Cell } from "@/lib/envelope";
import { Story } from "./Story";
import { MapMotif } from "@/components/shell/MapMotif";
import { MotifCredit } from "@/components/shell/MotifCredit";

export const METHODS = {
  title: "Methods & evidence",
  dek: "Understand how an estimate was constructed, where its activity data came from and which parts are observed, modelled, proxy-allocated or not estimated.",
  read: "Read methodology",
  search: "Find a sector, IPCC category or source",
  browse: "Browse sectors",
  steps: ["Source records", "Activity", "Method", "Result"],
  methodLead: "Registered IPCC category equations",
  dimensions: "Evidence dimensions",
  limitations: "Known limitations",
  equations: "View equations",
  sources: "Inspect sources",
  rows: "Open data rows",
} as const;

type StreamCell = Cell & { source_stream_id?: string; ipcc_code?: string; ipcc_category?: string; sub_category?: string; source_id?: string };

/** Whether a sector matches the search: its label, or any category, stream, source or sub-category of its streams. */
export function sectorMatches(query: string, label: string, streams: StreamCell[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (label.toLowerCase().includes(q)) return true;
  return streams.some((s) => [s.ipcc_category, s.ipcc_code, s.source_stream_id, s.source_id, s.sub_category].some((v) => typeof v === "string" && v.toLowerCase().replace(/[_|-]/g, " ").includes(q.replace(/[_|-]/g, " "))));
}

export function Methods() {
  const router = useRouter();
  const [modeParam] = useQueryState("mode", parseAsString);
  const [claimParam] = useQueryState("claim", parseAsString);
  const [sectorParam] = useQueryState("sector", parseAsString);
  // the legacy single-page URLs: ?claim= keeps its record on the evidence tool; ?mode=catalogue
  // lands on the sector index, or the named sector's own page
  useEffect(() => {
    if (claimParam) router.replace(`/methods/evidence/?claim=${encodeURIComponent(claimParam)}`);
    else if (modeParam === "catalogue") router.replace(sectorParam ? `/methods/sectors/${sectorParam}/` : "/methods/sectors/");
  }, [router, modeParam, claimParam, sectorParam]);

  return (
    <div className="relative min-h-dvh" data-testid="methods-page">
      <MapMotif />
      <header className="flex shrink-0 items-center px-5 pb-3 pt-5" data-testid="top-nav">
        <NavCapsule />
      </header>
      <Story onBrowse={() => router.push("/methods/sectors/")} />
      <MotifCredit />
    </div>
  );
}
