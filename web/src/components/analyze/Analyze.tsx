"use client";
/**
 * Analyze (round 3, the user's mockup): a document page. The ivory hero with the
 * three question tabs; one ANALYSIS SETTINGS card whose Geography, Metric, From and
 * To feed every card below; then the WHAT CHANGED card (waterfall + key finding),
 * and CLIMATE + CLEAN AIR beside ROBUSTNESS. Every number on the page is a server
 * string; parsing happens only to shade, place or size.
 */
import { useState } from "react";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { RotateCcw } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { NavHeader } from "@/components/shell/NavCapsule";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { gasLabel, periodShort } from "@/lib/labels";
import { ANALYZE } from "./copy";
import { ChangeSection } from "./ChangeSection";
import { SharedSourcesSection } from "./SharedSourcesSection";
import { SensitivitySection } from "./SensitivitySection";

export type AnalyzeSettings = { from: string; to: string; gases: string[] | null };

const TAB = (on: boolean) =>
  `rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${on ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg/70 hover:text-fg"}`;

export function Analyze() {
  const { labels, dims } = useExplorer();
  const periods = dims.fiscalPeriods;
  const [tab, setTab] = useState("change");
  const [fromP, setFromP] = useState(periods[0] ?? "");
  const [toP, setToP] = useState(periods[periods.length - 1] ?? "");
  const [gas, setGas] = useState<string>("");
  // the backdrop map mirrors the analysis: the To year, and the source under study
  const [mapSector, setMapSector] = useState<string | null>(null);
  const settings: AnalyzeSettings = { from: fromP, to: toP, gases: gas ? [gas] : null };
  const reset = () => {
    setFromP(periods[0] ?? "");
    setToP(periods[periods.length - 1] ?? "");
    setGas("");
  };

  const field = (label: string, control: React.ReactNode) => (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs text-muted">
      {label}
      {control}
    </label>
  );

  return (
    <div className="relative min-h-dvh">
      {/* the same ground Explore stands on: the map as a fixed backdrop the cards
          scroll over - it follows the To year and the drilled source */}
      <div className="fixed inset-0" data-testid="analyze-map-pane" aria-hidden="true">
        <ExplorerMap variant="workspace" override={{ ...(toP ? { period: toP } : {}), sector: mapSector }} />
      </div>
      <div className="relative z-10">
        <NavHeader />
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-5 pb-16 pt-1" data-testid="analyze">
        <header className="relative overflow-hidden rounded-[20px] border border-nav-line bg-nav px-7 py-6 shadow-sm">
          <ContourMotif />
          <ContourMotif corner="bottom-right" />
          <div className="relative">
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-fg" data-testid="analyze-title">{ANALYZE.title}</h1>
            <p className="mt-1 text-[15px] text-muted">{ANALYZE.dek}</p>
            <nav className="mt-3.5 flex flex-wrap gap-1.5" aria-label="Analyses" data-testid="analyze-questions">
              {ANALYZE.questions.map((q) => (
                <a key={q.id} href={`#${q.id}`} onClick={() => setTab(q.id)} className={TAB(tab === q.id)} aria-current={tab === q.id ? "true" : undefined} data-testid={`analyze-tab-${q.id}`}>
                  {q.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <section className="rounded-[20px] border border-line bg-card px-6 py-4 shadow-sm" data-testid="analyze-settings">
          <div className="micro text-accent">{ANALYZE.settings.eyebrow}</div>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            {field(ANALYZE.settings.geography, (
              <select className={SELECT_CLASS} value="PK" onChange={() => {}} data-testid="analyze-geo">
                <option value="PK">Pakistan</option>
              </select>
            ))}
            {field(ANALYZE.settings.metric, (
              <select className={SELECT_CLASS} value={gas} onChange={(e) => setGas(e.target.value)} data-testid="analyze-metric">
                <option value="">{ANALYZE.settings.allGases}</option>
                {dims.gases.map((g) => <option key={g} value={g}>{gasLabel(labels, g)}</option>)}
              </select>
            ))}
            {field(ANALYZE.settings.from, (
              <select className={SELECT_CLASS} value={fromP} onChange={(e) => setFromP(e.target.value)} data-testid="change-from">
                {periods.map((p) => <option key={p} value={p}>{periodShort(labels, p)}</option>)}
              </select>
            ))}
            {field(ANALYZE.settings.to, (
              <select className={SELECT_CLASS} value={toP} onChange={(e) => setToP(e.target.value)} data-testid="change-to">
                {periods.map((p) => <option key={p} value={p}>{periodShort(labels, p)}</option>)}
              </select>
            ))}
            <button type="button" onClick={reset} className="flex h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent transition-colors hover:bg-accent-soft" data-testid="analyze-reset">
              <RotateCcw size={14} aria-hidden="true" /> {ANALYZE.settings.reset}
            </button>
          </div>
        </section>

        <ChangeSection settings={settings} onScope={setMapSector} />
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <SharedSourcesSection settings={settings} />
          <SensitivitySection settings={settings} />
        </div>
        </main>
      </div>
    </div>
  );
}
