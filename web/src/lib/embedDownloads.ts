"use client";
/**
 * Downloads, in the embedded build.
 *
 * Every file the app offers - a product CSV, the release manifest, the complete archive, a
 * receipt's own result - is a plain `<a href>` to the API, and that is the right thing in the
 * public build: the browser streams it, resumes it and caches it, and no JavaScript stands in the
 * way. But a link is a navigation, and a navigation carries no Authorization header, so against a
 * gated API every one of those links would return 401 to a reader who is perfectly well signed in.
 *
 * So in the embedded build ONE listener, installed once, catches a click on any link that points
 * into the API, fetches the file with the reader's identity instead, and hands the browser the
 * bytes. Every link in the app is covered, including the ones written after this, because the
 * rule is about the destination rather than the component.
 *
 * Not installed at all when the build is not embedded: `interceptApiDownloads` returns a no-op and
 * the links stay the plain links they were.
 */
import { API_BASE } from "./api";
import { EMBEDDED, authedFetch } from "./embedAuth";

/** The API's absolute base, for deciding whether a link is ours. */
function apiPrefix(): string {
  if (typeof window === "undefined") return API_BASE;
  return new URL(API_BASE, window.location.origin).href.replace(/\/+$/, "");
}

/** The name to save under: what the server called it, else the URL's last segment. */
export function filenameOf(url: string, disposition: string | null): string {
  const quoted = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (quoted?.[1]) return decodeURIComponent(quoted[1]);
  const last = url.split("?")[0].split("/").pop();
  return last && last !== "" ? decodeURIComponent(last) : "download";
}

function save(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // the object URL is the browser's copy of the bytes; a tick is enough for the click to take it
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/**
 * Install the listener; returns the uninstall. A click the browser would handle differently
 * (another tab, a saved link, a modified click) is left alone - the reader asked for that, and a
 * blob cannot honour it.
 */
export function interceptApiDownloads(): () => void {
  if (!EMBEDDED || typeof document === "undefined") return () => {};
  const prefix = apiPrefix();

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || (anchor.target && anchor.target !== "_self")) return;
    const href = anchor.href;
    if (!href.startsWith(prefix)) return;
    event.preventDefault();
    void (async () => {
      try {
        const response = await authedFetch(href);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        save(await response.blob(), filenameOf(href, response.headers.get("content-disposition")));
      } catch (error) {
        // the reader asked for a file and must not be left wondering: let the browser try the
        // plain link, which shows the API's own refusal rather than nothing at all
        console.error("Could not download %s with the reader's identity: %s", href, error);
        window.open(href, "_blank", "noopener");
      }
    })();
  };

  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
