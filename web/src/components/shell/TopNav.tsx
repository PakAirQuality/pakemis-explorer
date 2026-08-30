"use client";
/**
 * The top navigation every page carries: the brand, the five sections (Overview, Explore data,
 * Map, Methods & evidence, Downloads) with the current one highlighted, and the green Ask
 * PakEmis button (a link to /ask, or the Map page's drawer toggle when `onAsk` is given).
 * Under 768 px the sections fold into a menu. `children` is a slot for a page's own controls
 * (the Map page's tabs). Nothing here prints a number or a version.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, X } from "lucide-react";

export const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/explore", label: "Explore data" },
  { href: "/map", label: "Map" },
  { href: "/methods", label: "Methods & evidence" },
  { href: "/downloads", label: "Downloads" },
] as const;

/** Whether a link is the current page: the pathname without its trailing slash (the static export serves `/map/`). */
export function isActive(pathname: string | null, href: string): boolean {
  const p = (pathname ?? "/").replace(/\/+$/, "") || "/";
  return p === href;
}

const ASK_CLASS = "pill flex h-9 items-center gap-1.5 bg-accent-fill px-3.5 text-sm font-semibold text-on-accent shadow-pill hover:brightness-110";

export function TopNav({ compact = false, onAsk, children }: { compact?: boolean; onAsk?: () => void; children?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const link = (href: string, label: string, block = false) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
        className={`${block ? "block" : ""} rounded-md px-2.5 py-1.5 text-sm transition-colors ${active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-3 hover:text-fg"}`}
        data-testid="nav-link"
      >
        {label}
      </Link>
    );
  };
  const ask = onAsk ? (
    <button type="button" onClick={onAsk} className={ASK_CLASS} data-testid="nav-ask" title="Ask PakEmis: a question to the inventory, answered from receipts">
      <Sparkles size={15} /> <span>Ask PakEmis</span>
    </button>
  ) : (
    <Link href="/ask" className={ASK_CLASS} data-testid="nav-ask" aria-current={isActive(pathname, "/ask") ? "page" : undefined} title="Ask PakEmis: a question to the inventory, answered from receipts">
      <Sparkles size={15} /> <span>Ask PakEmis</span>
    </Link>
  );
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur" data-testid="top-nav">
      <div className={`flex h-14 items-center gap-3 px-4 ${compact ? "" : "mx-auto max-w-6xl md:px-6"}`}>
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 text-sm font-semibold text-fg" data-testid="brand" title="PakEmis">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-fill text-[11px] font-bold text-on-accent">PE</span>
          <span>PakEmis</span>
        </Link>
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Sections">
          {NAV_LINKS.map((l) => link(l.href, l.label))}
        </nav>
        {children}
        <div className="flex-1" />
        {ask}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close the menu" : "Open the menu"} aria-expanded={open} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg md:hidden" data-testid="nav-menu-button">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-line px-3 py-2 md:hidden" aria-label="Sections" data-testid="nav-menu">
          {NAV_LINKS.map((l) => link(l.href, l.label, true))}
        </nav>
      )}
    </header>
  );
}
