"use client";
/**
 * The navigation capsule every page carries (it replaced TopNav on 2026-08-30): one oxblood
 * `rounded-full` pill holding the PAQI logo (a link to /, no wordmark), the four sections
 * — Explore · Data · Methods · Downloads — in white with the current one underlined 2 px in
 * saffron, and the "Ask about this view" action at its right end (it toggles the AskDrawer on
 * lib/askBus.ts, mounted once in the layout, or calls `onAsk` when a page supplies its own).
 *
 * On the workspace (`floating`) the capsule is `absolute left-5 top-5 z-30`, sharing the deck's
 * left inset and radius family so the two left edges form one line; on every other page it is
 * the same pill inside a normal header row at the top of the page. Nothing here prints a number
 * or a version, and nothing here names the dataset: the chrome carries the initiative's name.
 */
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toggleAsk } from "@/lib/askBus";
import { BrandLogo } from "./BrandLogo";

export const NAV_LINKS = [
  { href: "/", label: "Explore" },
  { href: "/data", label: "Data" },
  { href: "/methods", label: "Methods" },
  { href: "/downloads", label: "Downloads" },
] as const;

/** The assistant's name in the chrome; the dataset's own name belongs to the citation. */
export const ASK_LABEL = "Ask about this view";

/** Whether a link is the current page: the pathname without its trailing slash (the static export serves `/data/`). */
export function isActive(pathname: string | null, href: string): boolean {
  const p = (pathname ?? "/").replace(/\/+$/, "") || "/";
  return p === href;
}

/** The pill itself: the classes the deck's left inset and radius family are matched to. */
export const CAPSULE_CLASS = "rounded-full bg-accent text-white shadow-lg px-5 py-2.5 flex items-center gap-6";
/** The floating placement on the workspace: the same left inset (20 px) as the deck beneath it. */
export const CAPSULE_FLOATING = "absolute left-5 top-5 z-30";

export function NavCapsule({ floating = false, onAsk, children }: { floating?: boolean; onAsk?: () => void; children?: ReactNode }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative shrink-0 py-0.5 text-sm transition-colors ${active ? "font-semibold text-white" : "text-white/75 hover:text-white"}`}
        data-testid="nav-link"
      >
        {label}
        {active && <span className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full" style={{ background: "var(--color-brand-gold, #ffb313)" }} aria-hidden="true" data-testid="nav-underline" />}
      </Link>
    );
  };
  return (
    <div className={`${floating ? `${CAPSULE_FLOATING} ` : ""}${CAPSULE_CLASS} max-w-[calc(100vw-40px)] overflow-x-auto scrollbar-none`} data-testid="nav-capsule">
      <Link href="/" className="flex shrink-0 items-center" data-testid="brand" title="Pakistan Air Quality Initiative">
        <BrandLogo className="h-7 object-contain" />
      </Link>
      <nav className="flex items-center gap-5" aria-label="Sections">
        {NAV_LINKS.map((l) => link(l.href, l.label))}
      </nav>
      {children}
      <button
        type="button"
        onClick={onAsk ?? toggleAsk}
        className="pill flex h-8 shrink-0 items-center gap-1.5 bg-brand-gold px-3.5 text-xs font-semibold text-fg transition-[filter] hover:brightness-105"
        data-testid="nav-ask"
        title="Ask about this view: a question to the inventory, answered from receipts"
      >
        <Sparkles size={14} aria-hidden="true" /> <span className="whitespace-nowrap">{ASK_LABEL}</span>
      </button>
    </div>
  );
}

/** The capsule in a normal header row: the pages that are not the workspace. */
export function NavHeader({ onAsk, children }: { onAsk?: () => void; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center px-5 pb-3 pt-5" data-testid="top-nav">
      <NavCapsule onAsk={onAsk}>{children}</NavCapsule>
    </header>
  );
}
