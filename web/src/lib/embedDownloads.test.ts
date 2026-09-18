/**
 * Downloads in the embedded build: a file link is a navigation and carries no identity, so the
 * click is served by fetch instead - but only for this API's own links, only for a plain click,
 * and only when the build is embedded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOST = "https://dashboard.example.org";

async function load(embedded: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_EMBED_AUTH", embedded ? "parent" : "");
  vi.stubEnv("NEXT_PUBLIC_EMBED_PARENT_ORIGIN", embedded ? HOST : "");
  vi.stubEnv("NEXT_PUBLIC_API_BASE", "/api/v1/emissions");
  return { downloads: await import("./embedDownloads"), embed: await import("./embedAuth") };
}

/** A host that answers the identity request at once, as the dashboard does. */
function fakeParent(token = "token-abc") {
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: {
      postMessage: () => {
        window.dispatchEvent(new MessageEvent("message", { data: { type: "pakemis:auth-token", token }, origin: HOST }));
      },
    },
  });
}

function anchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
}

let fetchMock: ReturnType<typeof vi.fn>;
let created: string[];
beforeEach(() => {
  document.body.innerHTML = "";
  created = [];
  fetchMock = vi.fn(async () => new Response("a,b\n1,2\n", { status: 200, headers: { "content-disposition": 'attachment; filename="fact_annual.csv"' } }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn((): string => { created.push("blob:x"); return "blob:x"; }),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the public build", () => {
  it("installs nothing: a file link is the plain link it was", async () => {
    const { downloads } = await load(false);
    const stop = downloads.interceptApiDownloads();
    const a = anchor("http://localhost:3000/api/v1/emissions/products/fact_annual.csv");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });
});

describe("the embedded build", () => {
  it("serves this API's file links by fetch, with the reader's identity, and saves what the server named", async () => {
    const { downloads } = await load(true);
    fakeParent();
    const stop = downloads.interceptApiDownloads();
    const a = anchor("http://localhost:3000/api/v1/emissions/products/fact_annual.csv");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-abc" });
    await vi.waitFor(() => expect(created).toHaveLength(1));
    stop();
  });

  it("leaves every other link alone", async () => {
    const { downloads } = await load(true);
    const stop = downloads.interceptApiDownloads();
    for (const href of ["https://example.org/a.csv", "http://localhost:3000/methods/"]) {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      anchor(href).dispatchEvent(event);
      expect(event.defaultPrevented, href).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });

  it("leaves a click the reader meant for another tab alone", async () => {
    const { downloads } = await load(true);
    const stop = downloads.interceptApiDownloads();
    const href = "http://localhost:3000/api/v1/emissions/products/fact_annual.csv";
    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    anchor(href).dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    const newTab = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor(href, { target: "_blank" }).dispatchEvent(newTab);
    expect(newTab.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });

  it("names the file as the server named it, else from the path", async () => {
    const { downloads } = await load(true);
    expect(downloads.filenameOf("https://x/products/a.csv", 'attachment; filename="RECEIPT_abc.json"')).toBe("RECEIPT_abc.json");
    expect(downloads.filenameOf("https://x/products/fact_annual.csv", null)).toBe("fact_annual.csv");
    expect(downloads.filenameOf("https://x/products/", null)).toBe("download");
  });
});
