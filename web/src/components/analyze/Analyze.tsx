"use client";
/**
 * Analyze (round 4): Explore's spatial logic without a map. One grid -
 * [420px_minmax(0,1fr)] - on the plain house ground: the LEFT RAIL shares the nav
 * capsule's width and left edge and stacks the hero (title, dek, question tabs),
 * the analysis settings, and the key finding; the MAIN column gives the waterfall
 * the full remaining width, with the two secondary analyses as teaser cards
 * beneath it that expand in place. Every number on the page is a server string.
 */
import { useState } from "react";
import { ExplorerMap } from "@/components/map/ExplorerMap";
import { RotateCcw } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { NavHeader } from "@/components/shell/NavCapsule";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { gasLabel, periodShort, type SectorView } from "@/lib/labels";
import { ANALYZE } from "./copy";
import { ChangeSection } from "./ChangeSection";
import { SharedSourcesSection } from "./SharedSourcesSection";
import { SensitivitySection } from "./SensitivitySection";

export type AnalyzeSettings = { from: string; to: string; gases: string[] | null; view: SectorView };

const TAB = (on: boolean) =>
  `whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${on ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg/70 hover:text-fg"}`;

export function Analyze() {
  const { labels, dims } = useExplorer();
  const periods = dims.fiscalPeriods;
  const [tab, setTab] = useState("change");
  const [fromP, setFromP] = useState(periods[0] ?? "");
  const [toP, setToP] = useState(periods[periods.length - 1] ?? "");
  const [gas, setGas] = useState<string>("");
  // the sector grouping: by the module that computed the atoms (IPCC, the default - the
  // reference is IPCC-coded) or by what the code says the activity is (economic)
  const [view, setView] = useState<SectorView>("ipcc");
  const [sharedOpen, setSharedOpen] = useState(false);
  // the selection is page state: the chart highlights it, the explainer tells it, the map mirrors it
  const [selected, setSelected] = useState<string | null>(null);
  const [sensitivityOpen, setSensitivityOpen] = useState(false);
  const settings: AnalyzeSettings = { from: fromP, to: toP, gases: gas ? [gas] : null, view };
  const reset = () => {
    setFromP(periods[0] ?? "");
    setToP(periods[periods.length - 1] ?? "");
    setGas("");
    setView("ipcc");
    setSelected(null);
  };
  const pickView = (v: SectorView) => {
    setView(v);
    setSelected(null);
  };
  const pickTab = (id: string) => {
    setTab(id);
    if (id === "shared") setSharedOpen(true);
    if (id === "sensitivity") setSensitivityOpen(true);
  };

  const field = (label: string, control: React.ReactNode) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      {control}
    </label>
  );

  return (
    <div className="relative min-h-dvh">
      {/* the same ground Explore stands on: the map as a fixed backdrop the cards
          scroll over - it follows the To year and the drilled source */}
      <div className="fixed inset-0" data-testid="analyze-map-pane" aria-hidden="true">
        {/* the map is module-grained: the economic 'industrial' aggregate is not a module, so it steers no sector */}
        <ExplorerMap variant="workspace" override={{ ...(toP ? { period: toP } : {}), sector: selected === "industrial" ? null : selected }} />
      </div>
      <div className="relative z-10">
      <NavHeader />
      <main className="w-full px-5 pb-16 pt-1" data-testid="analyze">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="grid gap-4" data-testid="analyze-rail">
            <header className="relative overflow-hidden rounded-[20px] border border-nav-line bg-nav px-5 py-5 shadow-sm">
              <ContourMotif />
              <div className="relative">
                <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-fg" data-testid="analyze-title">{ANALYZE.title}</h1>
                <p className="mt-1 text-[13.5px] text-muted">{ANALYZE.dek}</p>
                <nav className="mt-3 flex flex-wrap gap-1" aria-label="Analyses" data-testid="analyze-questions">
                  {ANALYZE.questions.map((q) => (
                    <a key={q.id} href={`#${q.id}`} onClick={() => pickTab(q.id)} className={TAB(tab === q.id)} aria-current={tab === q.id ? "true" : undefined} data-testid={`analyze-tab-${q.id}`}>
                      {q.label}
                    </a>
                  ))}
                </nav>
              </div>
            </header>

            <section className="rounded-[20px] border border-line border-t-[3px] border-t-brand-gold bg-card px-5 py-4 shadow-card" data-testid="analyze-settings">
              <div className="micro text-accent">{ANALYZE.settings.eyebrow}</div>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
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
              </div>
              <div className="mt-3 flex flex-col gap-1 text-xs text-muted" data-testid="analyze-view">
                {ANALYZE.settings.view}
                <div className="flex flex-wrap gap-1" role="group" aria-label={ANALYZE.settings.view}>
                  <button type="button" onClick={() => pickView("ipcc")} className={TAB(view === "ipcc")} aria-pressed={view === "ipcc"} title={ANALYZE.settings.viewIpccTitle} data-testid="analyze-view-ipcc">
                    {ANALYZE.settings.viewIpcc}
                  </button>
                  <button type="button" onClick={() => pickView("economic")} className={TAB(view === "economic")} aria-pressed={view === "economic"} title={ANALYZE.settings.viewEconomicTitle} data-testid="analyze-view-economic">
                    {ANALYZE.settings.viewEconomic}
                  </button>
                </div>
              </div>
              <button type="button" onClick={reset} className="mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft" data-testid="analyze-reset">
                <RotateCcw size={14} aria-hidden="true" /> {ANALYZE.settings.reset}
              </button>
            </section>

          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <ChangeSection settings={settings} selected={selected} onSelect={setSelected} />
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <SharedSourcesSection settings={settings} open={sharedOpen} onOpen={setSharedOpen} />
              <SensitivitySection settings={settings} open={sensitivityOpen} onOpen={setSensitivityOpen} />
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}
