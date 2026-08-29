"use client";
/** The 48 px dark rail (analyst-desk pattern): panel tabs, then Data (link) and Ask at the bottom. Horizontal under 768 px. */
import Link from "next/link";
import { BarChart3, Compass, Database, GitCompare, MessageSquare, ScrollText } from "lucide-react";
import type { Panel } from "@/lib/urlState";

const TABS: { id: Panel; icon: typeof Compass; label: string }[] = [
  { id: "explore", icon: Compass, label: "Explore" },
  { id: "inventory", icon: BarChart3, label: "Inventory" },
  { id: "compare", icon: GitCompare, label: "Compare" },
  { id: "evidence", icon: ScrollText, label: "Evidence" },
];

function RailButton({ active, onClick, icon: Icon, label, dot, title }: { active: boolean; onClick?: () => void; icon: typeof Compass; label: string; dot?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-pressed={active}
      className={`relative flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${active ? "bg-amber/20 text-amber-soft" : "text-white/50 hover:bg-white/10 hover:text-white/80"}`}
    >
      <Icon size={18} />
      <span className="text-[7px] font-semibold tracking-wide">{label}</span>
      {dot && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber" />}
    </button>
  );
}

export function IconRail({ active, onChange, ask, onAsk, horizontal = false }: { active: Panel | null; onChange: (p: Panel | null) => void; ask: boolean; onAsk: () => void; horizontal?: boolean }) {
  return (
    <nav className={`z-[60] flex shrink-0 items-center bg-rail ${horizontal ? "h-12 w-full flex-row justify-around px-1" : "h-full w-12 flex-col gap-0.5 pt-1.5"}`} aria-label="Sections">
      {!horizontal && (
        <Link href="/" className="mb-1 flex h-9 w-9 items-center justify-center rounded-md text-[10px] font-bold text-white/90" title="PakEmis Explorer">
          PE
        </Link>
      )}
      {TABS.map((t) => (
        <RailButton key={t.id} active={active === t.id} onClick={() => onChange(active === t.id ? null : t.id)} icon={t.icon} label={t.label} />
      ))}
      {!horizontal && <div className="flex-1" />}
      <Link href="/data" title="Data & API" className="flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg text-white/50 hover:bg-white/10 hover:text-white/80">
        <Database size={18} />
        <span className="text-[7px] font-semibold tracking-wide">Data</span>
      </Link>
      <RailButton active={ask} onClick={onAsk} icon={MessageSquare} label="Ask" title="Ask PakEmis" />
      {!horizontal && <div className="h-2" />}
    </nav>
  );
}
