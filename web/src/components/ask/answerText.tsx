"use client";
/**
 * The answer text rendered (the AnswerCard's first part). `<cite k cell receipt>display</cite>`
 * tags become underlined number spans; hovering one highlights its tool card and cell, clicking
 * scrolls to it. The text between tags is the model's prose (paragraphs, line breaks, **bold**,
 * `code`); every figure in it arrived inside a cite, and the server withheld any answer that
 * typed one bare.
 */
import type { ReactNode } from "react";
import type { Highlight } from "./ToolCard";

const CITE = /<cite k="(\d+)" cell="(\d+)" receipt="([0-9a-f]*)">([^<]*)<\/cite>/g;
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function unescape(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${keyBase}b${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`${keyBase}c${i}`} className="mono">{part.slice(1, -1)}</code>;
    return part.split("\n").flatMap((line, j, arr) => (j < arr.length - 1 ? [line, <br key={`${keyBase}n${i}_${j}`} />] : [line]));
  });
}

export function renderAnswer(text: string, onCite: { hover: (h: Highlight) => void; click: (h: Highlight) => void }): ReactNode[] {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((para, pi) => {
      const nodes: ReactNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      const re = new RegExp(CITE.source, "g");
      let n = 0;
      while ((m = re.exec(para)) !== null) {
        if (m.index > last) nodes.push(...inline(para.slice(last, m.index), `p${pi}t${n}`));
        const k = Number(m[1]);
        const cell = Number(m[2]);
        const h: Highlight = { k, cell };
        nodes.push(
          <button
            key={`p${pi}c${n}`}
            type="button"
            className="cite num cursor-pointer rounded-sm px-0.5 font-semibold text-accent underline decoration-accent/50 decoration-dotted underline-offset-2 hover:bg-accent-soft"
            data-testid="cite"
            data-k={m[1]}
            data-cell={m[2]}
            data-receipt={m[3]}
            title={`tool call ${m[1]}, cell ${m[2]} · receipt ${m[3]}`}
            onMouseEnter={() => onCite.hover(h)}
            onMouseLeave={() => onCite.hover(null)}
            onFocus={() => onCite.hover(h)}
            onBlur={() => onCite.hover(null)}
            onClick={() => onCite.click(h)}
          >
            {unescape(m[4])}
          </button>,
        );
        last = m.index + m[0].length;
        n += 1;
      }
      if (last < para.length) nodes.push(...inline(para.slice(last), `p${pi}e`));
      return (
        <p key={pi} className={pi > 0 ? "mt-2" : ""}>
          {nodes}
        </p>
      );
    });
}
