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

/** The cite's behaviours, plus the test that decides whether a figure is labelled `modelled`. */
export type CiteHandlers = { hover: (h: Highlight) => void; click: (h: Highlight) => void; modelled?: (h: { k: number; cell: number; text: string }) => boolean };

/** A cited VALUE, as against a cited unit ("Mt CO₂e") - only the value carries the marker. */
const NUMERIC_TEXT = /\d/;

const CITE = /<cite k="(\d+)" cell="(\d+)" receipt="([0-9a-f]*)">([^<]*)<\/cite>/g;
const INLINE = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;

function unescape(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

/**
 * The inline pass: `**bold**`, `` `code` `` and single newlines. Exported because the model writes
 * its REASONING in the same notation, and ThinkingCard used to print the asterisks raw. A markdown
 * library would be a new dependency and a new XSS surface on model-written text; this is four
 * lines and renders elements, never HTML.
 */
export function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    // *** IS BOLD-ITALIC AND MUST BE TRIED FIRST. `**[^*]+**` cannot start at index 0 of "***x***"
    // because index 2 is another asterisk, so it matched the INNER pair and orphaned one asterisk on
    // each side - which is the stray ":*" a reader saw at the end of a list item.
    if (part.startsWith("***") && part.endsWith("***")) return <strong key={`${keyBase}bi${i}`}><em>{part.slice(3, -3)}</em></strong>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${keyBase}b${i}`}>{part.slice(2, -2)}</strong>;
    // single asterisks are the model's emphasis, and it uses them for its own asides - the receipt
    // it quotes after a list arrived as a literal "*(receipt 1a2b…)*" on screen
    if (part.startsWith("*") && part.endsWith("*")) return <em key={`${keyBase}i${i}`}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`${keyBase}c${i}`} className="mono">{part.slice(1, -1)}</code>;
    // any asterisk still standing is unbalanced markup the model wrote, not punctuation a reader
    // wants: strip it rather than print it
    return part.replace(/\*/g, "").split("\n").flatMap((line, j, arr) => (j < arr.length - 1 ? [line, <br key={`${keyBase}n${i}_${j}`} />] : [line]));
  });
}

/**
 * Brace syntax that reached the text anyway. The server now strikes it, but TRANSCRIPTS ALREADY SAVED
 * ON THE DEVICE CARRY IT - `?c=` replays them verbatim - so without this the defect stays on screen
 * in a reader's own history however well the server behaves from here.
 */
const TEMPLATE = /\{\{[^}]*\}\}/g;

/**
 * Receipt hashes the model wrote into its own prose. The prompt asked for them once - "cite the
 * receipt of each result you used, in the form `receipt <receipt>`" - and answers ended with a line
 * of hexadecimal no reader could use. The instruction is gone, but the same saved transcripts apply:
 * what is on the device still carries them.
 *
 * ONLY THE PROSE FORM MATCHES. A cite's own receipt lives in an attribute, `receipt="<hash>"`, and
 * these patterns require whitespace after the word, so the citations themselves are untouched - the
 * hash keeps travelling with every number, which is the whole point of it.
 */
const RECEIPT_LINE = /\s*Receipts?:\s*(?:receipt\s+[0-9a-f]{32}\s*,?\s*)+\.?/gi;
const RECEIPT_ASIDE = /\s*\(?\breceipt\s+[0-9a-f]{32}\)?/gi;

function despite(text: string): string {
  let out = text;
  if (TEMPLATE.test(out)) { TEMPLATE.lastIndex = 0; out = out.replace(TEMPLATE, ""); }
  out = out.replace(RECEIPT_LINE, "").replace(RECEIPT_ASIDE, "");
  if (out === text) return text;
  return out.replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

/** A line the model meant as a bullet: "* item", "- item", "1. item". */
const BULLET = /^\s*(?:[*-]|\d+\.)\s+/;

export function renderAnswer(raw: string, onCite: CiteHandlers): ReactNode[] {
  // ONE MARKER PER FIGURE. The unit is a cite of its own, and a figure can be cited twice, so a
  // naive test put "modelled" three times behind a single number.
  const marked = new Set<string>();
  const handlers: CiteHandlers = { ...onCite, modelled: onCite.modelled ? (h) => {
    const key = `${h.k}:${h.cell}`;
    if (marked.has(key) || !NUMERIC_TEXT.test(h.text)) return false;   // the unit is not the figure
    marked.add(key);
    return onCite.modelled!(h);
  } : undefined };
  return despite(raw)
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((para, pi) => {
      // THE MODEL WRITES LISTS AND THIS PRINTED THE MARKERS. Asked for a nine-year series it
      // answers with nine "* 2016-17: …" lines, which arrived as literal asterisks joined by <br>.
      // That was survivable when the prose sat inside a card of its own; it is the whole answer now.
      const lines = para.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 1 && lines.every((l) => BULLET.test(l))) {
        return (
          <ul key={pi} className={`list-disc space-y-0.5 pl-4 ${pi > 0 ? "mt-2" : ""}`} data-testid="answer-list">
            {lines.map((line, li) => (
              <li key={li}>{renderInlineWithCites(line.replace(BULLET, ""), handlers, `p${pi}l${li}`)}</li>
            ))}
          </ul>
        );
      }
      return renderParagraph(para, pi, handlers);
    });
}

function renderParagraph(para: string, pi: number, onCite: CiteHandlers): ReactNode {
  return (
    <p key={pi} className={pi > 0 ? "mt-2" : ""}>
      {renderInlineWithCites(para, onCite, `p${pi}`)}
    </p>
  );
}

function renderInlineWithCites(para: string, onCite: CiteHandlers, pi: string): ReactNode[] {
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
    // A MODELLED FIGURE SAYS SO WHERE IT IS READ. Punjab and Sindh were both presented as provincial
    // road-transport data; both are a national fuel total spread by a proxy. A reader who only reads
    // the sentence must not have to open a fold to learn that.
    if (onCite.modelled?.({ k, cell, text: unescape(m[4]) })) {
      nodes.push(
        <span key={`${pi}m${n}`} className="pill ml-1 bg-surface-3 px-1.5 py-px text-micro normal-case tracking-normal text-muted"
              data-testid="modelled-marker" title="a national total allocated to this place, not measured here">
          modelled
        </span>,
      );
    }
    last = m.index + m[0].length;
    n += 1;
  }
  if (last < para.length) nodes.push(...inline(para.slice(last), `p${pi}e`));
  return nodes;
}
