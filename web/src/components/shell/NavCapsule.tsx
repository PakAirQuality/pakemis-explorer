"use client";
/**
 * The navigation capsule every page carries (it replaced TopNav on 2026-08-30): one warm ivory
 * `rounded-full` pill (`--color-nav`, a soft saffron hairline) holding the PAQI logo (a link to
 * /, no wordmark) and the four sections — Explore · Data · Methods · Downloads — in charcoal,
 * the current one in oxblood and underlined 2 px in the same. The assistant is not here: one entry only, the round button at the bottom left
 * (components/shell/AskFab.tsx), so the same action is not offered twice.
 *
 * On the workspace (`floating`) the capsule is `absolute left-5 top-5 z-30`, sharing the deck's
 * left inset and radius family so the two left edges form one line — 420 px wide when it holds
 * nothing but the logo and the links, growing to fit when the workspace hands it the pane
 * switch (a window under 1280 px); on every other page it is
 * the same pill inside a normal header row at the top of the page. Nothing here prints a number
 * or a version, and nothing here names the dataset: the chrome carries the initiative's name.
 */
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
export const CAPSULE_CLASS = "rounded-full bg-nav text-nav-fg border border-nav-line shadow-lg px-5 py-2.5 flex items-center gap-6";
/** Floating, the capsule is exactly the deck's width, so its left AND right edges line up with the cards beneath it. */
export const CAPSULE_WIDTH = "w-[420px] justify-between";
/**
 * Floating WITH something in the children slot — the workspace's pane switch, which only a
 * window under 1280 px mounts — the capsule grows to hold it rather than clipping the links:
 * the deck's width is not a promise it can keep once it carries a control as well. With no
 * children it keeps 420 px exactly, and its edges keep the deck's.
 */
export const CAPSULE_WIDTH_WITH_CHILDREN = "w-auto max-w-[calc(100vw-40px)] justify-between";
/** The floating placement on the workspace: the same left inset (20 px) and width as the deck beneath it. */
export const CAPSULE_FLOATING = "absolute left-5 top-5 z-30";

export function NavCapsule({ floating = false, children }: { floating?: boolean; children?: ReactNode }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative shrink-0 py-0.5 text-sm transition-colors ${active ? "font-semibold text-accent" : "text-nav-fg/65 hover:text-nav-fg"}`}
        data-testid="nav-link"
      >
        {label}
        {active && <span className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-accent" aria-hidden="true" data-testid="nav-underline" />}
      </Link>
    );
  };
  return (
    <div className={`${floating ? `${CAPSULE_FLOATING} ${children ? CAPSULE_WIDTH_WITH_CHILDREN : CAPSULE_WIDTH} ` : ""}${CAPSULE_CLASS} max-w-[calc(100vw-40px)] overflow-x-auto scrollbar-none`} data-testid="nav-capsule">
      <Link href="/" className="flex shrink-0 items-center" data-testid="brand" title="Pakistan Air Quality Initiative">
        <BrandLogo className="h-7 object-contain" />
      </Link>
      <nav className="flex items-center gap-5" aria-label="Sections">
        {NAV_LINKS.map((l) => link(l.href, l.label))}
      </nav>
      {children}
    </div>
  );
}

/**
 * The capsule in a normal header row: the pages that are not the workspace. A page whose
 * content is a centred max-width container passes the same container classes as `container`,
 * so the capsule's left edge lines up with the content's instead of hugging the viewport.
 */
export function NavHeader({ children, container }: { children?: ReactNode; container?: string }) {
  const capsule = <NavCapsule>{children}</NavCapsule>;
  return (
    <header className={`flex shrink-0 items-center pb-3 pt-5 ${container ? "" : "px-5"}`} data-testid="top-nav">
      {container ? <div className={`${container} flex`}>{capsule}</div> : capsule}
    </header>
  );
}
