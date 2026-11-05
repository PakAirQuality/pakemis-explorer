"use client";
/**
 * The "Ask about this view" drawer, mounted once in app/layout.tsx inside the ExplorerProvider: a
 * right-side panel (440 px by default, and the reader can drag its left edge between three quarters
 * of that and half the window - remembered per browser; full-screen under 768 px, where there is
 * no edge to drag) over whatever page is open, opened by
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
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { useExplorer } from "@/components/ExplorerContext";
import { isActive } from "@/components/shell/NavCapsule";
import { closeAsk, subscribeAsk, type AskRequest } from "@/lib/askBus";
import { ASK_PANEL_MIN, ASK_PANEL_WIDTH, clampAskWidth, setAskPanelDragging, setAskPanelWidth, useAskDocked, useAskPanelWidth, viewportWidth } from "./docked";
import { AskDock } from "./AskDock";

/** The panel's default width. The width in use is the reader's (useAskPanelWidth). */
export const DRAWER_WIDTH = ASK_PANEL_WIDTH;

/** How far one arrow key moves the edge; Shift moves it three times as far. */
export const RESIZE_STEP_PX = 16;

/**
 * THE PANEL'S LEFT EDGE, WHICH THE READER CAN DRAG. The panel is anchored to the right of the
 * window, so dragging the edge left widens it. The width follows the pointer from where the drag
 * began (start width + distance moved), so grabbing the handle a few pixels off the edge does not
 * make the panel jump. Pointer capture keeps the moves coming when the pointer crosses the map's
 * canvas. Keyboard: ArrowLeft widens, ArrowRight narrows - the edge moves the way the arrow points.
 */
function ResizeHandle({ width }: { width: number }) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    el.setPointerCapture?.(e.pointerId);
    const body = document.body.style;
    const before = { select: body.userSelect, cursor: body.cursor };
    body.userSelect = "none";   // no text selection sweeping across the transcript
    body.cursor = "col-resize";
    setAskPanelDragging(true);
    const move = (ev: PointerEvent) => setAskPanelWidth(startWidth + (startX - ev.clientX));
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      body.userSelect = before.select;
      body.cursor = before.cursor;
      setAskPanelDragging(false);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? RESIZE_STEP_PX * 3 : RESIZE_STEP_PX;
    if (e.key === "ArrowLeft") setAskPanelWidth(width + step);
    else if (e.key === "ArrowRight") setAskPanelWidth(width - step);
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the assistant panel"
      aria-valuenow={width}
      aria-valuemin={ASK_PANEL_MIN}
      aria-valuemax={clampAskWidth(Number.MAX_SAFE_INTEGER, viewportWidth())}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none"
      data-testid="ask-resize"
    >
      {/* the visible line: the panel's own border until hovered, focused or held */}
      <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" aria-hidden="true" />
    </div>
  );
}

export function AskDrawer() {
  const { isMobile } = useExplorer();
  const pathname = usePathname();
  const onAskPage = isActive(pathname, "/ask");
  const docked = useAskDocked();
  const width = useAskPanelWidth();
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
  // full screen on a phone: no edge to drag
  const fullScreen = isMobile && !docked;
  return (
    <aside
      className={`fixed z-[60] flex flex-col border-l border-line bg-card ${docked ? "translate-x-0" : `shadow-pill transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`} ${fullScreen ? "inset-0 border-l-0" : "bottom-0 right-0 top-0"}`}
      style={fullScreen ? undefined : { width, maxWidth: "100vw" }}
      aria-hidden={!shown}
      aria-label="Ask about this view"
      data-testid="ask-drawer"
      data-open={shown ? "1" : "0"}
      data-docked={docked ? "1" : "0"}
    >
      {/* only while shown: a closed drawer sits just off the window's right edge, and half the
          handle hangs outside the panel, so it would still be grabbable at the window's edge */}
      {!fullScreen && shown && <ResizeHandle width={width} />}
      <AskDock variant={docked ? "dock" : "drawer"} active={shown} panelWidth={width} onClose={docked ? undefined : () => closeAsk()} seed={request?.req.question ?? null} seedScope={request?.req.scope ?? null} seedKey={request?.key ?? 0} />
    </aside>
  );
}
