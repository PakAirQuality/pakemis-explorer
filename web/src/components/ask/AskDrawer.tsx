"use client";
/**
 * The Ask PakEmis drawer, mounted once in app/layout.tsx inside the ExplorerProvider: a
 * right-side panel (440 px; full-screen under 768 px) over whatever page is open, opened by
 * the nav's Ask PakEmis button and by `openAsk()` (lib/askBus.ts) from any component. It
 * inherits the current URL scope through the AskDock, applies a request's `scope` and sends
 * its `question` once. Escape closes it. On the /ask page the page itself is the panel, so the
 * drawer stays out of the way there (the page takes the bus). The conversation survives page
 * changes because the drawer never unmounts.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useExplorer } from "@/components/ExplorerContext";
import { isActive } from "@/components/shell/TopNav";
import { closeAsk, subscribeAsk, type AskRequest } from "@/lib/askBus";
import { AskDock } from "./AskDock";

export const DRAWER_WIDTH = 440;

export function AskDrawer() {
  const { isMobile } = useExplorer();
  const pathname = usePathname();
  const onAskPage = isActive(pathname, "/ask");
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<{ req: AskRequest; key: number } | null>(null);
  useEffect(
    () =>
      subscribeAsk((ev) => {
        if (onAskPage) return;
        if (ev.type === "close") setOpen(false);
        else if (ev.type === "toggle") setOpen((o) => !o);
        else {
          setOpen(true);
          if (ev.request.question || ev.request.scope) setRequest((r) => ({ req: ev.request, key: (r?.key ?? 0) + 1 }));
        }
      }),
    [onAskPage],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAsk();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (onAskPage) return null;
  return (
    <aside
      className={`fixed z-[60] flex flex-col border-l border-line bg-card shadow-pill transition-transform duration-200 ease-out ${isMobile ? "inset-0 border-l-0" : "bottom-0 right-0 top-0"} ${open ? "translate-x-0" : "translate-x-full"}`}
      style={isMobile ? undefined : { width: DRAWER_WIDTH, maxWidth: "100vw" }}
      aria-hidden={!open}
      aria-label="Ask PakEmis"
      data-testid="ask-drawer"
      data-open={open ? "1" : "0"}
    >
      <AskDock variant="drawer" onClose={() => closeAsk()} seed={request?.req.question ?? null} seedScope={request?.req.scope ?? null} seedKey={request?.key ?? 0} />
    </aside>
  );
}
