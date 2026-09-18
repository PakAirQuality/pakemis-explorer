/**
 * The embedded build's identity handshake: it is inert unless the build asks for it, and when it
 * does, the reader's token comes from the host page and rides on every request - once, from an
 * origin we named, with exactly one retry when an hour has passed.
 *
 * The module reads its two variables at import time (Next inlines NEXT_PUBLIC_*), so each test
 * that wants the embedded build stubs the environment and re-imports it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOST = "https://dashboard.example.org";

type Embed = typeof import("./embedAuth");

async function load(env: Record<string, string> = {}): Promise<Embed> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_EMBED_AUTH", env.NEXT_PUBLIC_EMBED_AUTH ?? "");
  vi.stubEnv("NEXT_PUBLIC_EMBED_PARENT_ORIGIN", env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN ?? "");
  return import("./embedAuth");
}

/** A host window that records what the page asked it, and can answer. */
function fakeParent() {
  const posts: { data: unknown; origin: string }[] = [];
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: (data: unknown, origin: string) => posts.push({ data, origin }) },
  });
  return posts;
}

function answer(token: string, origin = HOST) {
  window.dispatchEvent(new MessageEvent("message", { data: { type: "pakemis:auth-token", token }, origin }));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the public build", () => {
  it("is inert: no identity, no message to any host, the request is the one the app made", async () => {
    const embed = await load();
    const posts = fakeParent();
    expect(embed.EMBEDDED).toBe(false);
    expect(embed.embedStatus()).toBe("open");
    await embed.authedFetch("https://api.example.org/release", { headers: { accept: "application/json" } });
    expect(posts).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(await embed.authToken()).toBe("");
  });
});

describe("the embedded build", () => {
  it("asks its host once, then sends the reader's identity with the request", async () => {
    const embed = await load({ NEXT_PUBLIC_EMBED_AUTH: "parent", NEXT_PUBLIC_EMBED_PARENT_ORIGIN: HOST });
    const posts = fakeParent();
    const inflight = embed.authedFetch("https://api.example.org/release");
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ data: { type: "pakemis:auth-request" }, origin: HOST });
    answer("token-abc");
    await inflight;
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-abc");
    expect(embed.embedStatus()).toBe("ready");
    // the token is held: a second request asks the host nothing
    await embed.authedFetch("https://api.example.org/products");
    expect(posts).toHaveLength(1);
    expect(embed.heldToken()).toBe("token-abc");
  });

  it("believes no other origin", async () => {
    const embed = await load({ NEXT_PUBLIC_EMBED_AUTH: "parent", NEXT_PUBLIC_EMBED_PARENT_ORIGIN: HOST });
    fakeParent();
    const pending = embed.authToken();
    answer("stolen", "https://attacker.example.net");
    expect(embed.heldToken()).toBe("");
    answer("token-abc");
    expect(await pending).toBe("token-abc");
  });

  it("takes a 401 at its word once: it re-asks the host and retries, and a second 401 is the answer", async () => {
    const embed = await load({ NEXT_PUBLIC_EMBED_AUTH: "parent", NEXT_PUBLIC_EMBED_PARENT_ORIGIN: HOST });
    const posts = fakeParent();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 401 }));
    const inflight = embed.authedFetch("https://api.example.org/release");
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    answer("stale");
    await vi.waitFor(() => expect(posts).toHaveLength(2));   // the 401 sent it back to the host
    answer("fresh");
    const res = await inflight;
    expect(res.status).toBe(401);                            // the second refusal is returned, not retried
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer stale" });
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer fresh" });
  });

  it("when no host answers, it says so and sends no identity rather than hanging", async () => {
    vi.useFakeTimers();
    const embed = await load({ NEXT_PUBLIC_EMBED_AUTH: "parent", NEXT_PUBLIC_EMBED_PARENT_ORIGIN: HOST });
    fakeParent();
    const pending = embed.authToken();
    await vi.advanceTimersByTimeAsync(embed.WAIT_MS + 10);
    expect(await pending).toBe("");
    expect(embed.embedStatus()).toBe("unavailable");
  });

  it("without a host origin it refuses to believe anyone, and says it is misconfigured", async () => {
    const embed = await load({ NEXT_PUBLIC_EMBED_AUTH: "parent" });
    const posts = fakeParent();
    expect(await embed.authToken()).toBe("");
    expect(posts).toHaveLength(0);              // nothing is asked of a host we cannot name
    expect(embed.embedStatus()).toBe("misconfigured");
  });

  it("tells watchers when the status changes", async () => {
    const embed = await load({ NEXT_PUBLIC_EMBED_AUTH: "parent", NEXT_PUBLIC_EMBED_PARENT_ORIGIN: HOST });
    fakeParent();
    const seen: string[] = [];
    const stop = embed.watchEmbedStatus((s) => seen.push(s));
    const pending = embed.authToken();
    answer("token-abc");
    await pending;
    expect(seen).toEqual(["ready"]);
    stop();
  });
});
