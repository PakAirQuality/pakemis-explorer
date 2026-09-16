"use client";
/**
 * Analyze was removed on 2026-09-16: the Evidence Assistant answers the questions the page was
 * built for — what changed, what the shared climate and clean-air sources are, how robust a figure
 * is — against the same envelopes, in one place, with the receipt attached.
 *
 * This stub redirects rather than 404s because the page sat in the nav and the URL may be
 * bookmarked. A static export has no server redirects (next.config.ts sets output: "export", which
 * makes Next ignore redirects() silently), so the house pattern is a client-side stub — the same
 * one /map, /explore and /about use.
 *
 * To bring the page back: revert the commit that removed it — it is ~15 commits past eceade5 where
 * it was introduced, so cherry-picking eceade5 would restore a much older page — then
 * `git apply web/analyze-wip.patch` for the drill-down series that was still uncommitted.
 */
import { Redirect } from "@/components/shell/Redirect";

export default function AnalyzeRedirect() {
  return <Redirect to="/" label="Explore" />;
}
