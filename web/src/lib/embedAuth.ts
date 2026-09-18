"use client";
/**
 * The embedded deployment's identity, and nothing else.
 *
 * This app is a public-data product and its default build has no accounts: it asks the API for
 * numbers and the API answers. One deployment is different - the Hawanama internal dashboard
 * embeds the app beside its own modules, and that dashboard already knows who is signed in. There
 * the API runs with its sign-in gate on (api/pakemis_api/auth.py), so every request needs the
 * reader's identity, and the honest place to get it is the host page rather than a second
 * sign-in of our own: the page asks its host for the current token, the host answers with what
 * its own session already holds, and we attach it.
 *
 * Two build-time variables turn this on, both unset in every other build:
 *   NEXT_PUBLIC_EMBED_AUTH=parent            ask the host window for a token
 *   NEXT_PUBLIC_EMBED_PARENT_ORIGIN=https://…  the ONLY origin whose answer is believed
 *
 * With them unset the module is inert: `authedFetch` is `fetch`, no message is posted, no listener
 * is installed, and the app behaves exactly as the public build does. Nothing here stores a token
 * anywhere but memory, and nothing writes one to the URL, to storage or to a receipt.
 */
const MODE = process.env.NEXT_PUBLIC_EMBED_AUTH ?? "";
const PARENT_ORIGIN = process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN ?? "";

/** Whether this build asks a host page who the reader is. */
export const EMBEDDED = MODE === "parent";
/** The two messages: we ask, the host answers. The host implements the other half. */
export const AUTH_REQUEST = "pakemis:auth-request";
export const AUTH_REPLY = "pakemis:auth-token";
/** How long a host has to answer before the reader is told to open the page from the dashboard. */
export const WAIT_MS = 5000;
/** A Firebase token lasts an hour; re-ask well before, so a long reading session never breaks. */
const REUSE_MS = 45 * 60 * 1000;

export type EmbedStatus = "open" | "waiting" | "ready" | "unavailable" | "misconfigured";

let token = "";
let tokenAt = 0;
let pending: { promise: Promise<string>; resolve: (t: string) => void; timer: ReturnType<typeof setTimeout> } | null = null;
let listening = false;
const watchers = new Set<(s: EmbedStatus) => void>();
let status: EmbedStatus = EMBEDDED ? (PARENT_ORIGIN ? "waiting" : "misconfigured") : "open";

function settle(next: EmbedStatus) {
  if (status === next) return;
  status = next;
  for (const watcher of watchers) watcher(status);
}

function believable(origin: string): boolean {
  return Boolean(PARENT_ORIGIN) && origin === PARENT_ORIGIN;
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (!believable(event.origin)) return;
    const data = event.data as { type?: string; token?: string } | null;
    if (!data || data.type !== AUTH_REPLY || typeof data.token !== "string" || !data.token) return;
    token = data.token;
    tokenAt = Date.now();
    settle("ready");
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(token);
      pending = null;
    }
  });
}

/**
 * The reader's current token, asking the host when we hold none: "" when this build is not
 * embedded, when no host answers within WAIT_MS, or when no parent origin was configured. A
 * caller treats "" as "send no Authorization header" and lets the API say what it thinks.
 */
export function authToken(): Promise<string> {
  if (!EMBEDDED || typeof window === "undefined") return Promise.resolve("");
  if (!PARENT_ORIGIN) {
    settle("misconfigured");
    return Promise.resolve("");
  }
  if (token && Date.now() - tokenAt < REUSE_MS) return Promise.resolve(token);
  if (pending) return pending.promise;
  listen();
  let resolve!: (t: string) => void;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  const timer = setTimeout(() => {
    pending = null;
    settle(token ? "ready" : "unavailable");
    resolve(token);
  }, WAIT_MS);
  pending = { promise, resolve, timer };
  window.parent?.postMessage({ type: AUTH_REQUEST }, PARENT_ORIGIN);
  return promise;
}

/** Drop the held token so the next request asks the host again (what a 401 means). */
export function forgetToken(): void {
  token = "";
  tokenAt = 0;
}

/** The token already in hand, for callers that cannot await - Mapbox's request transform. */
export function heldToken(): string {
  return token;
}

export function embedStatus(): EmbedStatus {
  return status;
}

/** Subscribe to the status; returns the unsubscribe, the shape useSyncExternalStore wants. */
export function watchEmbedStatus(watcher: (s: EmbedStatus) => void): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

function withToken(init: RequestInit | undefined, bearer: string): RequestInit {
  if (!bearer) return init ?? {};
  return { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${bearer}` } };
}

/**
 * `fetch`, with the reader's identity when this build is embedded. A 401 is taken at its word
 * ONCE: the held token is dropped, the host is asked again, and the request is retried - the case
 * where an hour passed with the tab open. A second 401 is returned to the caller, which is how
 * the gate's refusal reaches the page instead of a retry loop.
 */
export async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!EMBEDDED) return fetch(url, init);
  const first = await authToken();
  const response = await fetch(url, withToken(init, first));
  if (response.status !== 401) return response;
  forgetToken();
  const second = await authToken();
  if (!second || second === first) return response;
  return fetch(url, withToken(init, second));
}

/** Test seam: forget everything this module holds. */
export function resetEmbedAuth(): void {
  token = "";
  tokenAt = 0;
  if (pending) clearTimeout(pending.timer);
  pending = null;
  status = EMBEDDED ? (PARENT_ORIGIN ? "waiting" : "misconfigured") : "open";
}
