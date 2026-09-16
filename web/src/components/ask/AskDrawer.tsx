"use client";
/**
 * The "Ask about this view" drawer, mounted once in app/layout.tsx inside the ExplorerProvider: a
 * right-side panel (440 px; full-screen under 768 px) over whatever page is open, opened by
 * the nav's "Ask about this view" button and by `openAsk()` (lib/askBus.ts) from any component. It
 * inherits the current URL scope through the AskDock, applies a request's `scope` and sends
 * its `question` once. Escape closes it. On the /ask page the page itself is the panel, so the
 * drawer stays out of the way there (the page takes the bus). The conversation survives page
 * changes because the drawer never unmounts.
 *
 * ON THE WORKSPACE AT 1280 px AND ABOVE IT DOES NOT SLIDE: it is the page's right column, always
 * open and with no way to dismiss it (`useAskDocked`, ./docked.ts). The element is the same one -
 * same testid, same `data-open` - so the round button still hides itself by watching that
 * attribute, and nothing else in the app needs to know. What changes is only the transform, and
 * that no `onClose` is handed down, which is what removes the X.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useExplorer } from "@/components/ExplorerContext";
import { isActive } from "@/components/shell/NavCapsule";
import { closeAsk, subscribeAsk, type AskRequest } from "@/lib/askBus";
import { ASK_PANEL_WIDTH, useAskDocked } from "./docked";
import { AskDock } from "./AskDock";

export const DRAWER_WIDTH = ASK_PANEL_WIDTH;

export function AskDrawer() {
  const { isMobile } = useExplorer();
  const pathname = usePathname();
  const onAskPage = isActive(pathname, "/ask");
  const docked = useAskDocked();
  const [open, setOpen] = useState(false);
  const shown = docked || open;
  const [request, setRequest] = useState<{ req: AskRequest; key: number } | null>(null);
  useEffect(
    () =>
      subscribeAsk((ev) => {
        if (onAskPage) return;
        // docked, the panel has no closed state to reach: open/close/toggle are inert and only a
        // request's seed still lands
        if (docked) {
          if (ev.type !== "close" && ev.type !== "toggle" && (ev.request.question || ev.request.scope)) {
            setRequest((r) => ({ req: ev.request, key: (r?.key ?? 0) + 1 }));
          }
          return;
        }
        if (ev.type === "close") setOpen(false);
        else if (ev.type === "toggle") setOpen((o) => !o);
        else {
          setOpen(true);
          if (ev.request.question || ev.request.scope) setRequest((r) => ({ req: ev.request, key: (r?.key ?? 0) + 1 }));
        }
      }),
    [onAskPage, docked],
  );
  useEffect(() => {
    if (!open || docked) return;   // nothing for Escape to close when the panel is the page
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAsk();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, docked]);
  if (onAskPage) return null;
  return (
    <aside
      className={`fixed z-[60] flex flex-col border-l border-line bg-card ${docked ? "translate-x-0" : `shadow-pill transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`} ${isMobile && !docked ? "inset-0 border-l-0" : "bottom-0 right-0 top-0"}`}
      style={isMobile && !docked ? undefined : { width: DRAWER_WIDTH, maxWidth: "100vw" }}
      aria-hidden={!shown}
      aria-label="Ask about this view"
      data-testid="ask-drawer"
      data-open={shown ? "1" : "0"}
      data-docked={docked ? "1" : "0"}
    >
      <AskDock variant={docked ? "dock" : "drawer"} active={shown} onClose={docked ? undefined : () => closeAsk()} seed={request?.req.question ?? null} seedScope={request?.req.scope ?? null} seedKey={request?.key ?? 0} />
    </aside>
  );
}
