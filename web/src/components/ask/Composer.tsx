"use client";
/**
 * The question box: a white card carrying a textarea (Enter sends, Shift+Enter breaks a line), a
 * round send button, and an optional `footer` slot (the dock leaves it empty since the scope row
 * under the box was removed). `@` mentions are inserted when a map feature is clicked while the panel is open
 * (mentions.ts). The suggested questions live in the dock's empty state (suggestions.ts);
 * ui_state is sent by the dock.
 *
 * ONE LOOK, TWO PLACES. On the empty state the dock sets this card under the invitation; once a
 * turn exists it sets the same card at the foot beneath the transcript. Only the placeholder
 * changes - it asks for a follow-up once there is something to follow - so a reader who has typed
 * once knows where to type again.
 *
 * There is no attachment control. The API takes a question and the URL scope and nothing else, and
 * a paperclip that opens nothing teaches a reader that the panel is broken.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { districtName } from "@/lib/labels";
import { subscribeMapPick, type MapPick } from "./mentions";

export function pickName(pick: MapPick, dims: { adm2: { shape_id: string; shape_name: string; name: string }[] }): string {
  if (pick.level === "adm2") return districtName(dims as Parameters<typeof districtName>[0], pick.id);
  if (pick.level === "grid") return `cell ${String(pick.props.lat ?? "")},${String(pick.props.lon ?? "")}`;
  return pick.id;
}

export function Composer({ onSend, onStop, streaming, disabled, footer, placeholder }: { onSend: (text: string) => void; onStop: () => void; streaming: boolean; disabled: boolean; footer?: React.ReactNode; placeholder?: string }) {
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
    <div className="rounded-[14px] border border-line bg-card shadow-pill" data-testid="composer">
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
        placeholder={disabled ? "The assistant is not enabled" : (placeholder ?? "What would you like to understand?")}
        disabled={disabled}
        aria-label="Question"
        title="Enter sends · Shift+Enter breaks a line"
        className="min-h-[3.25rem] w-full resize-none rounded-[14px] bg-transparent px-4 pt-4 text-base outline-none placeholder:text-muted disabled:opacity-60"
        data-testid="question"
      />
      <div className="flex items-center justify-end px-3.5 pb-3.5">
        {streaming ? (
          <button type="button" onClick={onStop} className="pill flex h-10 w-10 items-center justify-center bg-warn text-card shadow-card" aria-label="Stop" title="Stop">
            <Square size={15} />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={disabled || !text.trim()} className="pill flex h-10 w-10 items-center justify-center bg-accent-fill text-on-accent shadow-card transition-opacity disabled:opacity-40" aria-label="Send" title="Send (Enter) · Shift+Enter breaks a line">
            <ArrowUp size={19} />
          </button>
        )}
      </div>
      {footer}
    </div>
  );
}
