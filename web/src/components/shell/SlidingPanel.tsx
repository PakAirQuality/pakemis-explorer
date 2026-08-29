"use client";
/** A width-animated column (0 | width) beside the map; a full-screen sheet under 768 px. */
import type { ReactNode } from "react";
import { X } from "lucide-react";

export function SlidingPanel({ open, width = 370, title, onClose, children, mobile = false }: { open: boolean; width?: number; title?: ReactNode; onClose: () => void; children: ReactNode; mobile?: boolean }) {
  if (mobile) {
    if (!open) return null;
    return (
      <div className="fixed inset-x-0 bottom-12 top-0 z-[55] flex flex-col bg-white">
        <PanelHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    );
  }
  return (
    <aside className="relative z-40 h-full shrink-0 overflow-hidden border-r border-line bg-white transition-[width] duration-250 ease-out" style={{ width: open ? width : 0 }} aria-hidden={!open}>
      <div className="flex h-full flex-col" style={{ width }}>
        <PanelHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </aside>
  );
}

function PanelHeader({ title, onClose }: { title?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
      <div className="micro">{title}</div>
      <button aria-label="Close panel" onClick={onClose} className="pill p-1 text-muted hover:bg-canvas hover:text-ink"><X size={14} /></button>
    </div>
  );
}
