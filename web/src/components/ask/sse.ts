/**
 * A server-sent-events parser over text chunks of any boundary. `feed(chunk)` returns the
 * events completed by that chunk: an event is `event:` + one or more `data:` lines (joined with
 * a newline, as the spec says) terminated by a blank line; `\r\n` and `\n` both end a line;
 * comment lines (`: ping`, sse-starlette's keep-alive) and `id:`/`retry:` fields are skipped;
 * an event without a name is a `message`. The trailing partial line stays in the buffer.
 */
export type SseEvent = { name: string; data: string };

export function createSseParser() {
  let buffer = "";
  let name: string | null = null;
  let data: string[] = [];
  const flush = (out: SseEvent[]) => {
    if (data.length === 0 && name === null) return;
    if (data.length > 0) out.push({ name: name ?? "message", data: data.join("\n") });
    name = null;
    data = [];
  };
  const line = (raw: string, out: SseEvent[]) => {
    if (raw === "") {
      flush(out);
      return;
    }
    if (raw.startsWith(":")) return;
    const colon = raw.indexOf(":");
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? "" : raw.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  };
  return {
    feed(chunk: string): SseEvent[] {
      buffer += chunk;
      const out: SseEvent[] = [];
      let idx: number;
      while ((idx = buffer.search(/\r\n|\n|\r/)) !== -1) {
        const raw = buffer.slice(0, idx);
        const sep = buffer[idx] === "\r" && buffer[idx + 1] === "\n" ? 2 : 1;
        // a lone "\r" at the very end may be the first half of "\r\n": wait for the next chunk
        if (buffer[idx] === "\r" && idx + 1 >= buffer.length) break;
        buffer = buffer.slice(idx + sep);
        line(raw, out);
      }
      return out;
    },
    /** End of stream: a final event without a trailing blank line still counts. */
    end(): SseEvent[] {
      const out: SseEvent[] = [];
      if (buffer.length) {
        line(buffer, out);
        buffer = "";
      }
      flush(out);
      return out;
    },
  };
}

/** Parse a whole SSE body at once (tests, restored logs). */
export function parseSse(text: string): SseEvent[] {
  const p = createSseParser();
  return [...p.feed(text), ...p.end()];
}
