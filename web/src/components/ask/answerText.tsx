"use client";
/**
 * The answer text rendered (the AnswerCard's first part). `<cite k cell receipt>display</cite>`
 * tags become underlined number spans; hovering one highlights its tool card and cell, clicking
 * scrolls to it. `<plink to>label</plink>` tags - links the server checked - become links to this
 * site's own pages, through `CiteHandlers.link`. The text between tags is the model's prose:
 * paragraphs, line breaks, **bold**, `code`, bulleted and numbered lists (with or without an intro
 * line above them) and Markdown tables. Every figure in it arrived inside a cite, and the server
 * withheld any answer that typed one bare.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import type { Highlight } from "./ToolCard";
import type { ResolvedLink } from "./answerLinks";

/**
 * The cite's behaviours, the test that decides whether a figure is labelled `modelled`, and the
 * resolver that turns a checked link's `to` into a route (null: print the label as plain text).
 */
export type CiteHandlers = {
  hover: (h: Highlight) => void;
  click: (h: Highlight) => void;
  modelled?: (h: { k: number; cell: number; text: string }) => boolean;
  link?: (to: string, label: string) => ResolvedLink | null;
};

/** A cited VALUE, as against a cited unit ("Mt CO₂e") - only the value carries the marker. */
const NUMERIC_TEXT = /\d/;

const CITE = /<cite k="(\d+)" cell="(\d+)" receipt="([0-9a-f]*)">([^<]*)<\/cite>/g;
const PLINK = /<plink to="([^"]*)">([^<]*)<\/plink>/g;
/** A cite or a link, whichever comes first: groups 1-4 are a cite's, 5-6 a link's. */
const TAG = new RegExp(`${CITE.source}|${PLINK.source}`, "g");
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
/** A numbered item: the run it starts is an ordered list. */
const NUMBERED = /^\s*\d+\.\s+/;
/** A Markdown table row: it starts and ends with a pipe. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** The row under a table's header: pipes, dashes and the colons that set a column's alignment. */
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

type Align = "left" | "right" | "center";
type Block =
  | { kind: "text"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; align: Align[]; rows: string[][] };

/** "| a | b |" -> ["a", "b"]. A cite carries no pipe, so a split on the bar is safe. */
function cellsOf(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function alignOf(rule: string): Align[] {
  return cellsOf(rule).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
}

/**
 * A paragraph's lines as blocks: runs of plain text, of list items, and tables. THE MODEL'S LISTS
 * HAVE AN INTRO LINE. "These records include:" followed by six "- item" lines used to be one
 * paragraph that was not all bullets, so it printed as text, the markers were stripped as stray
 * markup, and the reader saw six bare lines run together. A lone "- " line with no intro above it
 * stays text: one dash is more often prose than a list.
 */
function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const header = cellsOf(line);
      const align = alignOf(lines[i + 1]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        // a ragged row is padded or trimmed to the header, so no cell lands under the wrong heading
        const cells = cellsOf(lines[i]);
        rows.push(header.map((_, ci) => cells[ci] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "table", header, align: header.map((_, ci) => align[ci] ?? "left"), rows });
      continue;
    }
    if (BULLET.test(line)) {
      const start = i;
      while (i < lines.length && BULLET.test(lines[i])) i += 1;
      const run = lines.slice(start, i);
      const prev = blocks[blocks.length - 1];
      const introduced = prev?.kind === "text" && /:\s*$/.test(prev.lines[prev.lines.length - 1] ?? "");
      if (run.length > 1 || introduced) {
        blocks.push({ kind: "list", ordered: NUMBERED.test(run[0]), items: run.map((l) => l.replace(BULLET, "")) });
        continue;
      }
      i = start;   // a lone dash line: fall through to text
    }
    const prev = blocks[blocks.length - 1];
    if (prev?.kind === "text") prev.lines.push(line);
    else blocks.push({ kind: "text", lines: [line] });
    i += 1;
  }
  return blocks;
}

/**
 * A streaming draft, made safe to draw: a table's header line is held back until the separator
 * under it has arrived, so the draft never flashes "| Class | Registered |" as text and then
 * re-draws it as a table a line later.
 */
export function settledDraft(draft: string): string {
  const lines = draft.split("\n");
  const ended = lines[lines.length - 1] === "";          // the server sends whole lines
  const complete = ended ? lines.slice(0, -1) : lines;
  const last = complete[complete.length - 1] ?? "";
  const before = complete[complete.length - 2] ?? "";
  if (TABLE_ROW.test(last) && !TABLE_ROW.test(before) && !TABLE_RULE.test(before)) {
    return complete.slice(0, -1).join("\n") + (complete.length > 1 ? "\n" : "");
  }
  return draft;
}

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
  const out: ReactNode[] = [];
  despite(raw)
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .forEach((para, pi) => {
      // THE MODEL WRITES LISTS AND THIS PRINTED THE MARKERS. Asked for a nine-year series it
      // answers with nine "* 2016-17: …" lines, which arrived as literal asterisks joined by <br>.
      // That was survivable when the prose sat inside a card of its own; it is the whole answer now.
      const lines = para.split("\n").filter((l) => l.trim().length > 0);
      blocksOf(lines).forEach((block, bi) => {
        const key = `${pi}.${bi}`;
        const spaced = out.length > 0 ? "mt-2" : "";
        out.push(renderBlock(block, key, spaced, handlers));
      });
    });
  return out;
}

function renderBlock(block: Block, key: string, spaced: string, onCite: CiteHandlers): ReactNode {
  if (block.kind === "list") {
    const items = block.items.map((item, li) => <li key={li}>{renderInlineWithCites(item, onCite, `${key}l${li}`)}</li>);
    return block.ordered ? (
      <ol key={key} className={`list-decimal space-y-0.5 pl-5 ${spaced}`} data-testid="answer-list" data-ordered="1">{items}</ol>
    ) : (
      <ul key={key} className={`list-disc space-y-0.5 pl-4 ${spaced}`} data-testid="answer-list">{items}</ul>
    );
  }
  if (block.kind === "table") {
    const alignClass = (a: Align) => (a === "right" ? "text-right tabular-nums" : a === "center" ? "text-center" : "text-left");
    // its own horizontal scroll: a wide table must not widen the panel (the panel is resizable, and
    // at its narrowest a four-column table is wider than it)
    return (
      <div key={key} className={`overflow-x-auto ${spaced}`} data-testid="answer-table-wrap">
        <table className="w-full border-collapse text-sm" data-testid="answer-table">
          <thead>
            <tr className="border-b border-line-strong">
              {block.header.map((h, ci) => (
                <th key={ci} scope="col" className={`px-2 py-1 text-xs font-semibold text-muted first:pl-0 ${alignClass(block.align[ci])}`}>
                  {renderInlineWithCites(h, onCite, `${key}h${ci}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-line last:border-b-0" data-testid="answer-table-row">
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-2 py-1 align-top first:pl-0 ${alignClass(block.align[ci])}`}>
                    {renderInlineWithCites(cell, onCite, `${key}r${ri}c${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <p key={key} className={spaced}>
      {renderInlineWithCites(block.lines.join("\n"), onCite, `p${key}`)}
    </p>
  );
}

function renderInlineWithCites(para: string, onCite: CiteHandlers, pi: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(TAG.source, "g");
  let n = 0;
  while ((m = re.exec(para)) !== null) {
    if (m.index > last) nodes.push(...inline(para.slice(last, m.index), `p${pi}t${n}`));
    if (m[1] === undefined) {
      // A CHECKED LINK, drawn only where this site knows the destination. An unknown `to` prints
      // its label as text: a link to nowhere is worse than no link.
      const to = unescape(m[5]);
      const label = unescape(m[6]);
      const target = onCite.link?.(to, label) ?? null;
      nodes.push(
        target ? (
          <Link key={`p${pi}a${n}`} href={target.href} className="font-semibold text-accent underline underline-offset-2 hover:text-accent-bright"
                data-testid="answer-link" data-to={to}>
            {target.label}
          </Link>
        ) : (
          <span key={`p${pi}a${n}`}>{label}</span>
        ),
      );
      last = m.index + m[0].length;
      n += 1;
      continue;
    }
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
