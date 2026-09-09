"use client";
/**
 * The source × pollutant matrix: rows are the ten sectors, columns the CO₂e total, CH₄,
 * and the seven air species. EVERY COLUMN IS ITS OWN DENOMINATOR - a cell is that
 * envelope's own share_pct_short, shaded by it; a sector absent from a pollutant's
 * covered panel renders NE (a typed absence, hatched, with the absence-screening
 * scenario ends in its tooltip), never a zero. Beneath it, one point per sector:
 * CO₂e share against the chosen pollutant's share. Shares are parsed only to shade
 * and to place - every printed number is the server's string.
 */
import { useMemo, useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { useAirMany, useEmissions } from "@/lib/queries";
import { periodShort, sectorLabel } from "@/lib/labels";
import { POLLUTANTS, POLLUTANT_LABELS } from "@/lib/explore/query";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import type { Envelope } from "@/lib/envelope";
import { ANALYZE } from "./copy";
import { Section, Finding } from "./Section";

const pct = (s: string | undefined) => (s ? parseFloat(s) : NaN);

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

export function SharedSourcesSection() {
  const { labels, dims, defaults } = useExplorer();
  const [period, setPeriod] = useState(defaults.period_id);
  const [scatterPol, setScatterPol] = useState<string>("PM2.5");

  const co2e = useEmissions({ periods: [period], group_by: ["sector_id"] });
  const ch4 = useEmissions({ periods: [period], gases: ["CH4"], group_by: ["sector_id"] });
  const airBodies = useMemo(() => POLLUTANTS.map((pl) => ({ pollutants: [pl], periods: [period], group_by: ["sector_id"] })), [period]);
  const air = useAirMany(airBodies);

  const columns = [
    { id: "co2e", label: "CO₂e", env: co2e.data },
    { id: "CH4", label: "CH₄", env: ch4.data },
    ...POLLUTANTS.map((pl, i) => ({ id: pl, label: POLLUTANT_LABELS[pl] ?? pl, env: air[i]?.data })),
  ];
  const sectors = dims.sectors;

  // the scatter's two axes: CO₂e share and the chosen pollutant's share, per sector
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
    <Section id="shared" title={ANALYZE.shared.title} dek={ANALYZE.shared.dek}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Year
          <select className={SELECT_CLASS} value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="shared-period">
            {dims.fiscalPeriods.map((p) => <option key={p} value={p}>{periodShort(labels, p)}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs" data-testid="shared-matrix">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card py-2 pr-3 text-left font-medium text-muted">{ANALYZE.shared.matrix}</th>
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
                    // a greenhouse column's absent cell is a gas the source does not
                    // separately report, not an air typed-absence
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

      <div className="mt-6">
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
        {both && (
          <Finding testId="shared-finding">
            In <b>{periodShort(labels, period)}</b>, <b>{sectorLabel(labels, both.sector)}</b> carries the largest combined weight:{" "}
            <b className="num">{both.xs} %</b> of the CO₂e total and <b className="num">{both.ys} %</b> of the covered{" "}
            {POLLUTANT_LABELS[scatterPol] ?? scatterPol}. NE columns say nothing about a source's air share — they are typed absences.
          </Finding>
        )}
      </div>
    </Section>
  );
}
