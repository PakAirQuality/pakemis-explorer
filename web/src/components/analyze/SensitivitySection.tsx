"use client";
/**
 * Does the conclusion hold: the reference estimate (L) beside the survey-based
 * configuration (S) for the reference year - two grouped envelopes whose own ranks
 * say whether the ordering moves, and one compare envelope whose deltas say by how
 * much - and beneath them the categories' published envelopes (structural, no
 * probability; the joint uncertainty table's own words). Nothing here is a draw or
 * a probability: the release ships scenario endpoints and envelopes, so the page
 * states exactly that much.
 */
import { useExplorer } from "@/components/ExplorerContext";
import { useEmissions, useUncertainty } from "@/lib/queries";
import { configLabel, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell } from "@/lib/envelope";
import { ANALYZE } from "./copy";
import { Section, Finding } from "./Section";

export function SensitivitySection() {
  const { labels, dims, defaults } = useExplorer();
  const period = defaults.period_id;
  const alt = dims.configurations.find((c) => c !== defaults.configuration_id);

  const ref = useEmissions({ periods: [period], group_by: ["sector_id"] });
  const survey = useEmissions(alt ? { periods: [period], configuration_id: alt, group_by: ["sector_id"] } : null, !!alt);
  // NO compare envelope here: compare_emissions pairs the two sides by position, and the
  // S-configuration side orders by value while the reference side orders by name, so its
  // cross-configuration deltas misalign (found 2026-09-09; an engine fix is queued). The
  // two envelopes' own values and ranks sit side by side instead - nothing is subtracted.
  const envs = useUncertainty({ scope: "categories", resolution: "annual_national" });

  const rows = dims.sectors.map((s) => {
    const l = ref.data?.values.find((c) => c.group?.sector_id === s);
    const r = survey.data?.values.find((c) => c.group?.sector_id === s);
    return { s, l, r };
  }).filter((row) => row.l || row.r);

  const leadL = ref.data?.values.find((c) => c.rank === 1);
  const leadR = survey.data?.values.find((c) => c.rank === 1);
  const moved = rows.filter((row) => row.l?.rank != null && row.r?.rank != null && row.l.rank !== row.r.rank);
  const sameLead = leadL && leadR && leadL.group?.sector_id === leadR.group?.sector_id;

  const envRows = [...(envs.data?.values ?? [])]
    .filter((c) => typeof c.value === "number")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8);
  // low_pct and high_pct are SIGNED offsets around the estimate ("-14.17", "16.49")
  const envMax = Math.max(1, ...envRows.map((c) => {
    const e = (c as unknown as { envelope?: { high_pct?: string } }).envelope;
    return (c.value ?? 0) * (1 + (e?.high_pct ? parseFloat(e.high_pct) / 100 : 0));
  }));

  return (
    <Section id="sensitivity" title={ANALYZE.sensitivity.title} dek={ANALYZE.sensitivity.dek}>
      <h3 className="text-sm font-semibold text-fg">{ANALYZE.sensitivity.configs}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs" data-testid="sensitivity-table">
          <thead>
            <tr className="text-muted">
              <th className="py-1.5 pr-3 text-left font-medium">Sector · {periodShort(labels, period)}</th>
              <th className="px-2 py-1.5 text-right font-medium">{configLabel(labels, defaults.configuration_id)}</th>
              <th className="px-2 py-1.5 text-right font-medium">{alt ? configLabel(labels, alt) : "—"}</th>
              <th className="px-2 py-1.5 text-right font-medium">Rank</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, l, r }) => (
              <tr key={s} className="border-t border-line" data-testid={`sensitivity-${s}`}>
                <td className="py-1.5 pr-3 font-medium text-fg">{sectorLabel(labels, s)}</td>
                <td className="num px-2 py-1.5 text-right">{l ? shown(l) : "—"}</td>
                <td className="num px-2 py-1.5 text-right">{r ? shown(r) : "—"}</td>
                <td className="num px-2 py-1.5 text-right">
                  {l?.rank != null && r?.rank != null ? (l.rank === r.rank ? String(l.rank) : `${l.rank} → ${r.rank}`) : l?.rank != null ? String(l.rank) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {leadL && (
        <Finding testId="sensitivity-finding">
          <b>{sectorLabel(labels, String(leadL.group?.sector_id ?? ""))}</b> leads the reference estimate
          {alt ? (
            sameLead ? (
              <> and keeps the lead under <b>{configLabel(labels, alt)}</b> — {moved.length === 0 ? "no sector's rank moves between the two available configurations" : <>the re-run moves {moved.map((m, i) => <span key={m.s}>{i > 0 ? ", " : ""}<b>{sectorLabel(labels, m.s)}</b></span>)} and nothing else</>}.</>
            ) : (
              <>, but <b>{sectorLabel(labels, String(leadR?.group?.sector_id ?? ""))}</b> leads under <b>{configLabel(labels, alt)}</b>.</>
            )
          ) : "."}{" "}
          Two configurations are queryable; scenario endpoints beyond them live in the release's ledgers, and no probability attaches to any of this.
        </Finding>
      )}

      <h3 className="mt-6 text-sm font-semibold text-fg">{ANALYZE.sensitivity.envelopes}</h3>
      <p className="text-xs text-muted">{ANALYZE.sensitivity.envelopesDek}</p>
      <div className="mt-2 flex flex-col gap-1.5" data-testid="sensitivity-envelopes">
        {envRows.map((c, i) => {
          const extra = c as unknown as { category?: string; envelope?: { low_pct?: string; high_pct?: string } };
          const lowPct = extra.envelope?.low_pct ? parseFloat(extra.envelope.low_pct) : 0;
          const highPct = extra.envelope?.high_pct ? parseFloat(extra.envelope.high_pct) : 0;
          const v = c.value ?? 0;
          const x0 = Math.max(0, ((v * (1 + lowPct / 100)) / envMax) * 100);
          const x1 = ((v * (1 + highPct / 100)) / envMax) * 100;
          const xc = (v / envMax) * 100;
          return (
            <div key={String(extra.category ?? i)} className="grid grid-cols-[160px_1fr_150px] items-center gap-2 text-xs" data-testid={`envelope-${extra.category}`}>
              <span className="truncate text-fg" title={String(extra.category)}>{extra.category}</span>
              <div className="relative h-3 rounded bg-surface">
                <div className="absolute top-0 h-3 rounded bg-accent/25" style={{ left: `${x0}%`, width: `${Math.max(0.8, x1 - x0)}%` }} />
                <div className="absolute top-0 h-3 w-0.5 bg-accent" style={{ left: `${xc}%` }} />
              </div>
              <span className="num text-right text-muted">
                {shown(c)} <span className="text-muted/70">{extra.envelope?.low_pct} / +{extra.envelope?.high_pct} %</span>
              </span>
            </div>
          );
        })}
        {!envRows.length && <p className="py-4 text-sm text-muted">Loading the envelope table…</p>}
      </div>
    </Section>
  );
}
