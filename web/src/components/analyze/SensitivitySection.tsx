"use client";
/**
 * The ROBUSTNESS card: the chosen span's uncertainty range - the release's own
 * joint-draw interval for that pair of years (typed-parameter scenario) as a strip
 * with the central estimate, and a badge that says whether the DIRECTION survives
 * every correlation scenario. The L/S configuration table and the categories'
 * envelope strips fold into the details. Nothing here is a probability the release
 * does not serve: "robust" is a sign check on the served intervals, in words.
 */
import { useExplorer } from "@/components/ExplorerContext";
import { useEmissions, useUncertainty } from "@/lib/queries";
import { configLabel, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell } from "@/lib/envelope";
import { ANALYZE } from "./copy";
import { AnalysisCard } from "./Section";
import type { AnalyzeSettings } from "./Analyze";

type SeriesCell = Cell & { scenario?: string; quantiles_short?: Record<string, string>; interval_short?: string; quantiles?: Record<string, string> };

export function SensitivitySection({ settings }: { settings: AnalyzeSettings }) {
  const { labels, dims, defaults } = useExplorer();
  const { from: fromP, to: toP } = settings;
  const pairKey = `${fromP}->${toP}`;
  const alt = dims.configurations.find((c) => c !== defaults.configuration_id);

  const pairU = useUncertainty({ scope: "series", period_id: pairKey }, !!fromP && !!toP && fromP !== toP);
  const ref = useEmissions({ periods: [defaults.period_id], group_by: ["sector_id"] });
  const survey = useEmissions(alt ? { periods: [defaults.period_id], configuration_id: alt, group_by: ["sector_id"] } : null, !!alt);
  const envs = useUncertainty({ scope: "categories", resolution: "annual_national" });

  const scenarios = (pairU.data?.values ?? []).filter((c): c is SeriesCell => typeof c.value === "number");
  const typed = scenarios.find((c) => c.scenario === "parameter_typed") ?? scenarios[0];
  const qnum = (c: SeriesCell | undefined, q: string) => {
    const v = c?.quantiles?.[q] ?? c?.quantiles_short?.[q];
    return v != null ? parseFloat(String(v)) : NaN;
  };
  // "robust": every served scenario's interval keeps the central's sign - a sign
  // check on the release's own numbers, never a new probability
  const robust = scenarios.length > 0 && scenarios.every((c) => {
    const lo = qnum(c, "P2.5");
    const hi = qnum(c, "P97.5");
    return Number.isFinite(lo) && Number.isFinite(hi) && (((c.value as number) >= 0 && lo > 0) || ((c.value as number) < 0 && hi < 0));
  });
  const grew = (typed?.value ?? 0) >= 0;

  // the strip's geometry: the typed scenario's own quantiles
  const lo = qnum(typed, "P2.5");
  const hi = qnum(typed, "P97.5");
  const center = typed?.value ?? NaN;
  const span = Number.isFinite(lo) && Number.isFinite(hi) && hi !== lo ? hi - lo : 1;
  const posPct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;

  const rows = dims.sectors.map((s) => ({
    s,
    l: ref.data?.values.find((c) => c.group?.sector_id === s),
    r: survey.data?.values.find((c) => c.group?.sector_id === s),
  })).filter((row) => row.l || row.r);
  const leadL = ref.data?.values.find((c) => c.rank === 1);
  const leadR = survey.data?.values.find((c) => c.rank === 1);
  const moved = rows.filter((row) => row.l?.rank != null && row.r?.rank != null && row.l.rank !== row.r.rank);
  const sameLead = leadL && leadR && leadL.group?.sector_id === leadR.group?.sector_id;

  const envRows = [...(envs.data?.values ?? [])]
    .filter((c) => typeof c.value === "number")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8);
  const envMax = Math.max(1, ...envRows.map((c) => {
    const e = (c as unknown as { envelope?: { high_pct?: string } }).envelope;
    return (c.value ?? 0) * (1 + (e?.high_pct ? parseFloat(e.high_pct) / 100 : 0));
  }));

  return (
    <AnalysisCard
      id="sensitivity"
      eyebrow={ANALYZE.sensitivity.eyebrow}
      title={ANALYZE.sensitivity.title}
      dek={ANALYZE.sensitivity.dek}
      action={
        scenarios.length > 0 ? (
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${robust ? "bg-green-700/10 text-green-800" : "bg-note-bg text-note-text"}`} data-testid="robustness-badge">
            <span className={`h-2 w-2 rounded-full ${robust ? "bg-green-700" : "bg-amber"}`} aria-hidden="true" />
            {robust ? ANALYZE.sensitivity.robust : ANALYZE.sensitivity.uncertain}
          </span>
        ) : undefined
      }
      more={ANALYZE.sensitivity.more}
    >
      {typed && typed.quantiles_short ? (
        <div data-testid="robustness-range">
          <div className="relative mx-1 mt-6 h-1 rounded bg-line" aria-hidden="true">
            <div className="absolute -top-1 h-3 w-0.5 rounded bg-fg/60" style={{ left: "0%" }} />
            <div className="absolute -top-1 h-3 w-0.5 rounded bg-fg/60" style={{ left: "100%" }} />
            {Number.isFinite(center) && <div className="absolute -top-1.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-card bg-accent" style={{ left: posPct(center) }} />}
          </div>
          <div className="relative mx-1 mt-1.5 h-4 text-xs text-muted">
            <span className="num absolute left-0">{typed.quantiles_short["P2.5"]}</span>
            {Number.isFinite(center) && <span className="num absolute -translate-x-1/2 font-semibold text-fg" style={{ left: posPct(center) }}>{typed.display_short}</span>}
            <span className="num absolute right-0">{typed.quantiles_short["P97.5"]}</span>
          </div>
          <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-fg" data-testid="robustness-sentence">
            The {grew ? "increase" : "decrease"} is likely between <b className="num">{typed.quantiles_short["P2.5"]}</b> and{" "}
            <b className="num">{typed.quantiles_short["P97.5"]} Mt CO₂e</b>, with a central estimate of{" "}
            <b className="num">{typed.display_short} Mt CO₂e</b>.
          </p>
        </div>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted" data-testid="robustness-nopair">{ANALYZE.sensitivity.noPair}</p>
      )}

      <details className="mt-4 border-t border-line pt-2.5" data-testid="sensitivity-details">
        <summary className="micro cursor-pointer select-none">{ANALYZE.sensitivity.configs}</summary>
        {scenarios.length > 1 && (
          <div className="mt-3 flex flex-col gap-1 text-xs text-muted" data-testid="robustness-scenarios">
            {scenarios.map((c) => (
              <div key={String(c.scenario)} className="flex items-center justify-between gap-3">
                <span>{String(c.scenario_label ?? c.scenario).replace(/_/g, " ")}</span>
                <span className="num">{c.interval_short ?? `${c.quantiles_short?.["P2.5"]}–${c.quantiles_short?.["P97.5"]}`}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs" data-testid="sensitivity-table">
            <thead>
              <tr className="text-muted">
                <th className="py-1.5 pr-3 text-left font-medium">Sector · {periodShort(labels, defaults.period_id)}</th>
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
          <p className="mt-2 text-xs text-muted" data-testid="sensitivity-finding">
            <b className="text-fg">{sectorLabel(labels, String(leadL.group?.sector_id ?? ""))}</b> leads the reference estimate
            {alt ? (
              sameLead
                ? <> and keeps the lead under {configLabel(labels, alt)}{moved.length ? <> (the re-run moves {moved.map((m) => sectorLabel(labels, m.s)).join(", ")} and nothing else)</> : <> — no sector's rank moves</>}.</>
                : <>, but <b className="text-fg">{sectorLabel(labels, String(leadR?.group?.sector_id ?? ""))}</b> leads under {configLabel(labels, alt)}.</>
            ) : "."}
          </p>
        )}

        <h3 className="mt-4 text-xs font-semibold text-fg">{ANALYZE.sensitivity.envelopes}</h3>
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
              <div key={String(extra.category ?? i)} className="grid grid-cols-[150px_1fr_140px] items-center gap-2 text-xs" data-testid={`envelope-${extra.category}`}>
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
        </div>
      </details>
    </AnalysisCard>
  );
}
