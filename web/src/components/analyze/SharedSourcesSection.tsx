"use client";
/**
 * The CLIMATE + CLEAN AIR card: the sectors that moved the chosen span, each with its
 * exact contribution (the same compare envelope the waterfall draws) and a tag - both,
 * climate, or air quality - decided by the envelopes' own share strings (at least 5 %
 * of the CO₂e total, at least 5 % of any pollutant's covered total, in the To year).
 * The full source × pollutant matrix and the share scatter fold into the card's
 * details. Shares are parsed only to tag, shade and place; every printed number is a
 * server string.
 */
import { useMemo, useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { useAirMany, useCompare, useEmissions } from "@/lib/queries";
import { periodShort, sectorLabel } from "@/lib/labels";
import { POLLUTANTS, POLLUTANT_LABELS } from "@/lib/explore/query";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import type { Envelope } from "@/lib/envelope";
import { ANALYZE } from "./copy";
import { AnalysisCard, Finding } from "./Section";
import { alignedDeltas, signed } from "./ChangeSection";
import type { AnalyzeSettings } from "./Analyze";

const pct = (s: string | undefined) => (s ? parseFloat(s) : NaN);
const TAG_THRESHOLD = 5;

function cellFor(env: Envelope | undefined, sector: string) {
  return env?.values.find((c) => c.group?.sector_id === sector);
}

/** The completeness rows the air envelope ships for a typed-absent sector (the screening's scenario ends). */
function absenceWords(env: Envelope | undefined, sector: string): string {
  const rows = (env?.completeness ?? []).filter((r) => r.sector_id === sector);
  if (!rows.length) return ANALYZE.shared.neTitle;
  const ends = rows
    .map((r) => {
      const un = String(r.scenario_uncontrolled_kt ?? "");
      const co = String(r.scenario_controlled_kt ?? "");
      return co && un ? `${co}–${un} kt` : un ? `uncontrolled end ${un} kt` : "";
    })
    .filter(Boolean);
  return ends.length ? `${ANALYZE.shared.neTitle} Screening for this period: ${ends.join("; ")}.` : ANALYZE.shared.neTitle;
}

export function SharedSourcesSection({ settings }: { settings: AnalyzeSettings }) {
  const { labels, dims } = useExplorer();
  const { from: fromP, to: toP } = settings;
  const period = toP;
  const [scatterPol, setScatterPol] = useState<string>("PM2.5");

  const enabled = !!fromP && !!toP && fromP !== toP;
  const cmp = useCompare({ left: { periods: [fromP], group_by: ["sector_id"] }, right: { periods: [toP], group_by: ["sector_id"] }, mode: "absolute" }, enabled);
  const co2e = useEmissions({ periods: [period], group_by: ["sector_id"] });
  const ch4 = useEmissions({ periods: [period], gases: ["CH4"], group_by: ["sector_id"] });
  const airBodies = useMemo(() => POLLUTANTS.map((pl) => ({ pollutants: [pl], periods: [period], group_by: ["sector_id"] })), [period]);
  const air = useAirMany(airBodies);

  const deltas = alignedDeltas(cmp.data?.values, "sector_id").slice(0, 6);
  const maxAbs = Math.max(1e-9, ...deltas.map(({ c }) => Math.abs(c.value as number)));

  const tagOf = (sector: string): string | null => {
    const climate = pct(cellFor(co2e.data, sector)?.share_pct_short) >= TAG_THRESHOLD;
    const airHeavy = air.some((q) => pct(cellFor(q.data, sector)?.share_pct_short) >= TAG_THRESHOLD);
    if (climate && airHeavy) return ANALYZE.shared.tagBoth;
    if (climate) return ANALYZE.shared.tagClimate;
    if (airHeavy) return ANALYZE.shared.tagAir;
    return null;
  };

  const columns = [
    { id: "co2e", label: "CO₂e", env: co2e.data },
    { id: "CH4", label: "CH₄", env: ch4.data },
    ...POLLUTANTS.map((pl, i) => ({ id: pl, label: POLLUTANT_LABELS[pl] ?? pl, env: air[i]?.data })),
  ];
  const sectors = dims.sectors;
  const scatterEnv = columns.find((c) => c.id === scatterPol)?.env;
  const points = sectors
    .map((s) => {
      const g = cellFor(co2e.data, s);
      const a = cellFor(scatterEnv, s);
      return g?.share_pct_short && a?.share_pct_short
        ? { sector: s, x: pct(g.share_pct_short), y: pct(a.share_pct_short), xs: g.share_pct_short, ys: a.share_pct_short }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const both = [...points].sort((a, b) => Math.min(b.x, b.y) - Math.min(a.x, a.y))[0];
  const maxX = Math.max(10, ...points.map((p) => p.x));
  const maxY = Math.max(10, ...points.map((p) => p.y));

  return (
    <AnalysisCard
      id="shared"
      eyebrow={ANALYZE.shared.eyebrow}
      title={ANALYZE.shared.title}
      dek={ANALYZE.shared.dekOf(periodShort(labels, fromP), periodShort(labels, toP))}
      more={ANALYZE.shared.more}
    >
      <div className="flex flex-col gap-2" data-testid="shared-contributions">
        {deltas.map(({ c, id }) => {
          const tag = tagOf(id);
          const width = (Math.abs(c.value as number) / maxAbs) * 100;
          return (
            <div key={id} className="grid grid-cols-[110px_minmax(0,1fr)_84px] items-center gap-3 text-sm" data-testid={`shared-row-${id}`}>
              <span className="truncate font-medium text-fg">{sectorLabel(labels, id)}</span>
              <span className="flex items-center gap-2">
                <span
                  className="h-3.5 shrink-0 rounded-sm"
                  style={{ width: `${Math.max(1.5, width * 0.72)}%`, background: (c.value as number) >= 0 ? "var(--color-accent-bright)" : "var(--color-brand-gold)" }}
                  aria-hidden="true"
                />
                <span className="num whitespace-nowrap text-xs text-fg">{signed(c)}</span>
              </span>
              {tag ? (
                <span className="justify-self-end rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent" data-testid={`shared-tag-${id}`}>{tag}</span>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          );
        })}
        {!deltas.length && <p className="py-6 text-sm text-muted">Comparing…</p>}
      </div>
      {both && (
        <Finding testId="shared-finding">
          In <b>{periodShort(labels, period)}</b>, <b>{sectorLabel(labels, both.sector)}</b> carries the largest combined weight:{" "}
          <b className="num">{both.xs} %</b> of the CO₂e total and <b className="num">{both.ys} %</b> of the covered{" "}
          {POLLUTANT_LABELS[scatterPol] ?? scatterPol}.
        </Finding>
      )}

      <details className="mt-4 border-t border-line pt-2.5" data-testid="shared-matrix-details">
        <summary className="micro cursor-pointer select-none">{ANALYZE.shared.matrixLabel}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] border-separate border-spacing-0 text-xs" data-testid="shared-matrix">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card py-2 pr-3 text-left font-medium text-muted">{periodShort(labels, period)}</th>
                {columns.map((c) => <th key={c.id} className="px-1.5 py-2 text-right font-medium text-muted">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={s}>
                  <td className="sticky left-0 bg-card py-1.5 pr-3 font-medium text-fg">{sectorLabel(labels, s)}</td>
                  {columns.map((c) => {
                    const cell = cellFor(c.env, s);
                    if (!c.env) return <td key={c.id} className="px-1.5 py-1.5 text-right text-muted">…</td>;
                    if (!cell) {
                      if (c.id === "co2e" || c.id === "CH4") {
                        return (
                          <td key={c.id} className="px-1.5 py-1.5 text-right text-muted" data-testid={`matrix-none-${s}-${c.id}`}>
                            <span title={`No separately estimated ${c.label} is reported for this source in this envelope.`}>—</span>
                          </td>
                        );
                      }
                      return (
                        <td key={c.id} className="px-1.5 py-1.5 text-right" data-testid={`matrix-ne-${s}-${c.id}`}>
                          <span className="inline-block rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[10px] font-medium text-muted" title={absenceWords(c.env, s)}>
                            {ANALYZE.shared.ne}
                          </span>
                        </td>
                      );
                    }
                    const share = pct(cell.share_pct_short);
                    const bg = Number.isFinite(share) ? `rgba(94, 26, 42, ${Math.min(0.85, 0.04 + share / 110)})` : undefined;
                    const dark = Number.isFinite(share) && share > 45;
                    return (
                      <td key={c.id} className="px-0.5 py-0.5" data-testid={`matrix-${s}-${c.id}`}>
                        <div className={`num rounded px-1 py-1 text-right ${dark ? "text-white" : "text-fg"}`} style={{ background: bg }} title={`${sectorLabel(labels, s)} · ${c.label}: ${cell.display_short} ${cell.unit_short ?? cell.unit} — ${cell.share_pct_short} % of the covered total`}>
                          {cell.share_pct_short ? `${cell.share_pct_short} %` : (cell.display_short ?? "")}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-fg">{ANALYZE.shared.scatter}</h3>
              <p className="text-xs text-muted">{ANALYZE.shared.scatterDek}</p>
            </div>
            <select className={SELECT_CLASS} value={scatterPol} onChange={(e) => setScatterPol(e.target.value)} aria-label="Pollutant" data-testid="shared-scatter-pol">
              {POLLUTANTS.map((pl) => <option key={pl} value={pl}>{POLLUTANT_LABELS[pl] ?? pl}</option>)}
            </select>
          </div>
          <svg viewBox="0 0 640 300" className="w-full" role="img" data-testid="shared-scatter">
            <line x1={48} y1={264} x2={624} y2={264} stroke="var(--color-line)" />
            <line x1={48} y1={16} x2={48} y2={264} stroke="var(--color-line)" />
            <text x={336} y={294} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">share of the CO₂e total (%)</text>
            <text x={14} y={140} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)" transform="rotate(-90 14 140)">{`share of ${POLLUTANT_LABELS[scatterPol] ?? scatterPol} (%)`}</text>
            {points.map((p) => {
              const x = 48 + (p.x / maxX) * (624 - 48 - 12);
              const y = 264 - (p.y / maxY) * (264 - 16 - 8);
              return (
                <g key={p.sector} data-testid={`scatter-${p.sector}`}>
                  <circle cx={x} cy={y} r={5.5} fill="var(--color-accent)" fillOpacity={0.8}>
                    <title>{`${sectorLabel(labels, p.sector)}: ${p.xs} % of CO₂e · ${p.ys} % of ${POLLUTANT_LABELS[scatterPol] ?? scatterPol}`}</title>
                  </circle>
                  <text x={x + 8} y={y + 3.5} fontSize={10.5} fill="var(--color-fg)">{sectorLabel(labels, p.sector)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </details>
    </AnalysisCard>
  );
}
