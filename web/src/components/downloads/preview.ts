/**
 * The first rows of a product, read from the product itself.
 *
 * `/products/{file}` serves HTTP Range (the API pins it), so a preview needs no new endpoint and no
 * server-side parsing: ask for the first stretch of bytes and show what comes back. Every value on
 * screen is therefore a byte of the file a reader is about to download — the same rule the rest of
 * the app follows, where a figure is a string the server sent.
 *
 * ⚠ RAW IDS BELONG HERE, and only here. Everywhere else the app is forbidden to print `FY2015-16`
 * or `REF_2023_24` — they are the warehouse's vocabulary and a reader is owed the release's words.
 * A preview is the exception because it is a window onto the file itself: a reader deciding whether
 * to download this CSV needs to see the values it actually contains, ids included. Prettifying them
 * would misrepresent the bytes. (The page's own audit sweeps the page, not this drawer.)
 *
 * ⚠ THE LAST LINE OF A RANGE IS USUALLY HALF A ROW. 64 KB lands wherever it lands, almost never on a
 * newline, so the final line is a fragment: a truncated number, a field cut mid-word. Rendering it
 * would put a wrong value on screen that looks exactly like a right one. It is dropped unless the
 * response proves the file ended there.
 */

/** Enough for a header and a screenful of rows in every product we offer. */
export const PREVIEW_BYTES = 64 * 1024;

export type Preview = { columns: string[]; rows: string[][]; complete: boolean };

/**
 * CSV text into rows of fields, tracking quotes across newlines.
 *
 * ⚠ A QUOTED FIELD CAN CONTAIN A NEWLINE, and in this release it routinely does: `fact_completeness`
 * carries multi-sentence justifications, one of which runs onto a second line inside its quotes.
 * Splitting the text on "\n" before parsing tears that row in half and misaligns every column after
 * it — the preview would look fine and be wrong, which is the worst way to be wrong.
 *
 * Returns the rows, plus whether the text ended mid-row or inside an open quote.
 */
export function parseRows(text: string): { rows: string[][]; tail: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let dirty = false;                       // something has been read since the last row ended
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
      dirty = true;
      continue;
    }
    if (ch === '"') { quoted = true; dirty = true; }
    else if (ch === ",") { row.push(field); field = ""; dirty = true; }
    else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
      dirty = false;
    } else { field += ch; dirty = true; }
  }
  // whatever is left had no closing newline: a fragment the range cut, or the file's last line
  if (dirty || field.length > 0) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return { rows, tail: dirty || quoted || field.length > 0 };
}

/**
 * Parse a range of CSV text. `complete` says the bytes ran to the end of the file, which is the only
 * case where a trailing partial row is actually a whole one.
 */
export function parsePreview(text: string, complete: boolean, limit = 10): Preview {
  const { rows: all, tail } = parseRows(text);
  // a leading '#' banner is a comment the release writes above some tables, not the header
  while (all.length && (all[0][0] ?? "").startsWith("#")) all.shift();
  if (all.length === 0) return { columns: [], rows: [], complete };
  const columns = all[0];
  const body = all.slice(1);
  if (!complete && tail && body.length) body.pop();     // the fragment the range cut in half
  return { columns, rows: body.slice(0, limit), complete };
}

/** Fetch the head of a product and parse it. A 206 means the server honoured the range. */
export async function fetchPreview(url: string, limit = 10): Promise<Preview> {
  const res = await fetch(url, { headers: { Range: `bytes=0-${PREVIEW_BYTES - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`the preview could not be read (${String(res.status)})`);
  const text = await res.text();
  // 200 means the whole file came back - it was smaller than the range we asked for
  return parsePreview(text, res.status === 200, limit);
}
