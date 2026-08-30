"use client";
/**
 * The question box: a textarea (Enter sends, Shift+Enter breaks a line) and `@` mentions
 * inserted when a map feature is clicked while the dock is open (mentions.ts). The suggested
 * questions live in the dock's empty state (suggestions.ts); ui_state is sent by the dock.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizontal, Square } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { districtName } from "@/lib/labels";
import { subscribeMapPick, type MapPick } from "./mentions";

export function pickName(pick: MapPick, dims: { adm2: { shape_id: string; shape_name: string; name: string }[] }): string {
  if (pick.level === "adm2") return districtName(dims as Parameters<typeof districtName>[0], pick.id);
  if (pick.level === "grid") return `cell ${String(pick.props.lat ?? "")},${String(pick.props.lon ?? "")}`;
  return pick.id;
}

export function Composer({ onSend, onStop, streaming, disabled }: { onSend: (text: string) => void; onStop: () => void; streaming: boolean; disabled: boolean }) {
  const { dims } = useExplorer();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = useCallback((snippet: string) => {
    setText((t) => {
      const el = ref.current;
      const start = el?.selectionStart ?? t.length;
      const end = el?.selectionEnd ?? t.length;
      const before = t.slice(0, start);
      const pad = before.length && !/\s$/.test(before) ? " " : "";
      const next = before + pad + snippet + t.slice(end);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        const pos = (before + pad + snippet).length;
        el.setSelectionRange(pos, pos);
      });
      return next;
    });
  }, []);

  useEffect(() => subscribeMapPick((pick) => insert(`@${pickName(pick, dims)} `)), [insert, dims]);

  const submit = () => {
    const t = text.trim();
    if (!t || streaming || disabled) return;
    onSend(t);
    setText("");
  };
  return (
    <div className="border-t border-line bg-card px-3 pb-3 pt-2" data-testid="composer">
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={disabled ? "Ask PakEmis is not enabled" : "Ask about a place, a sector, a year or a method…"}
          disabled={disabled}
          aria-label="Question"
          className="min-h-[2.5rem] flex-1 resize-none rounded-card border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
          data-testid="question"
        />
        {streaming ? (
          <button type="button" onClick={onStop} className="pill flex h-9 w-9 items-center justify-center bg-warn text-card" aria-label="Stop" title="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={disabled || !text.trim()} className="pill flex h-9 w-9 items-center justify-center bg-accent-fill text-on-accent disabled:opacity-40" aria-label="Send" title="Send (Enter)">
            <SendHorizontal size={16} />
          </button>
        )}
      </div>
      <div className="mt-1 text-micro normal-case tracking-normal text-muted">Enter sends · Shift+Enter breaks a line · the current scope is sent with every question</div>
    </div>
  );
}
