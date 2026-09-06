"use client";
/**
 * The round oxblood Ask button every page carries at the bottom right (their chat button): it
 * toggles the Ask drawer over the bus (lib/askBus.ts). Hidden while the drawer is open and on
 * the /ask page, where the dock is the page. The drawer also closes itself (its X, Escape)
 * without the bus, so the button follows the drawer's `data-open` attribute as well.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { subscribeAsk, toggleAsk } from "@/lib/askBus";
import { isActive } from "./NavCapsule";

export const ASK_FAB_CLASS = "fixed bottom-6 right-6 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg transition-colors hover:bg-accent-bright";

export function AskFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      subscribeAsk((ev) => {
        if (ev.type === "open") setOpen(true);
        else if (ev.type === "close") setOpen(false);
        else setOpen((o) => !o);
      }),
    [],
  );
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const el = document.querySelector('[data-testid="ask-drawer"]');
    if (!el) return;
    const read = () => setOpen(el.getAttribute("data-open") === "1");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-open"] });
    return () => mo.disconnect();
  }, []);
  // hidden on /ask (the dock is the page) and on the reader's sector pages, which end at
  // their actions with nothing after them
  if (open || isActive(pathname, "/ask") || (pathname ?? "").startsWith("/methods/sectors/")) return null;
  return (
    <button type="button" onClick={() => toggleAsk()} className={ASK_FAB_CLASS} aria-label="Ask about this view" title="Ask about this view: a question to the inventory, answered from receipts" data-testid="ask-fab">
      <MessageSquare size={24} aria-hidden="true" />
    </button>
  );
}
