import "@testing-library/jest-dom/vitest";
/**
 * The map's one status, and what it does when there is no map to have. jsdom has no WebGL, so
 * these tests stand a fake library in for Mapbox GL — with a token, unlike ExplorerMap.test.tsx,
 * so the component gets as far as building one — and drive the four ways it can go:
 *
 *  · the library's own probe says no: nothing is built, the status is `failed`;
 *  · the constructor throws after putting its canvas in the container, as 3.29 does: the status
 *    is `failed`, the container is emptied again, and the throw is caught rather than left as an
 *    unhandled rejection (which would fail this run);
 *  · the browser takes the context away and gives it back: `lost`, then `ready` — or `loading`
 *    when the map had not loaded yet;
 *  · a context that came back and could not be set up again arrives as an `error` event: `failed`,
 *    for good, whatever `webglcontextrestored` says next.
 *
 * The loading screen's store hears a failure too (shell/bootstrap.ts `markFailed`).
 *
 * And WHY it failed, which the page's sentence and its retry both turn on (`onFailure`, once, just
 * before the status): `unsupported`, `webgl` and `library` from the three ways above of having no
 * map at all, and three that used to report nothing —
 *
 *  · no token in the build: `token`, where the status used to sit at `loading` for good;
 *  · the style refused before `load`: `token` for a 401 or 403 (a token not allowed on this
 *    hostname), `style` for any other HTTP status; a tile's error is neither, before or after;
 *  · a map that says nothing at all for MAP_LOAD_TIMEOUT_MS: `timeout`, undone if it loads later.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { Providers } from "@/components/Providers";
import { getBootstrap, resetBootstrap } from "@/components/shell/bootstrap";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { absoluteApiBase } from "@/lib/api";
import { ExplorerMap, MAP_LOAD_TIMEOUT_MS, type MapFailure, type MapStatus } from "./ExplorerMap";

/**
 * What the fake library does next: whether its chunk arrives at all, its probe's answer (absent
 * on a library with no probe) and its constructor.
 */
const gl = vi.hoisted(() => ({
  arrives: true,
  supported: undefined as undefined | (() => boolean),
  construct: (() => ({})) as (options: { container: HTMLElement }) => object,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("mapbox-gl", () => {
  const library = {
    // a constructor that returns an object hands that object to `new`
    Map: class {
      constructor(options: { container: HTMLElement }) {
        return gl.construct(options);
      }
    },
    AttributionControl: class {},
    accessToken: "",
    get supported() {
      return gl.supported;
    },
  };
  return {
    // a chunk that did not arrive has no library in it; read on every import, so one test can lose it
    get default() {
      return gl.arrives ? library : undefined;
    },
  };
});

type Handler = (event?: unknown) => void;

/**
 * A map that records its listeners and answers every other call with something harmless, so the
 * effects that run after `load` (layers, paint, interactions) have a map to talk to. `emit` is the
 * library firing an event; `remove` is the teardown the component must survive.
 */
function fakeMap(remove: () => void = () => undefined) {
  const handlers = new Map<string, Handler[]>();
  const anything: unknown = new Proxy(function () {}, { get: (_t, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => "" : anything), apply: () => anything });
  const own: Record<string, unknown> = {
    on: (name: string, handler: unknown) => {
      if (typeof handler === "function") handlers.set(name, [...(handlers.get(name) ?? []), handler as Handler]);
    },
    remove,
  };
  const map = new Proxy(own, { get: (target, key) => (typeof key === "string" && key in target ? target[key] : key === "then" ? undefined : anything) });
  const emit = (name: string, event?: unknown) => act(() => (handlers.get(name) ?? []).forEach((h) => h(event)));
  return { map, emit, listens: (name: string) => (handlers.get(name) ?? []).length > 0 };
}

/** What 3.29's constructor does without WebGL: its DOM first, then the throw. */
function throwsAfterItsCanvas({ container }: { container: HTMLElement }): never {
  container.classList.add("mapboxgl-map");
  const holder = document.createElement("div");
  holder.className = "mapboxgl-canvas-container";
  holder.appendChild(document.createElement("canvas"));
  container.appendChild(holder);
  throw new Error("Failed to initialize WebGL.");
}

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, pol: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };

function ctx(): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state: base, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted", library: "", usable: false }, isMobile: false };
}

function mount(props: { onStatus?: (s: MapStatus) => void; onMap?: (m: unknown) => void; onFailure?: (r: MapFailure) => void } = {}) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx()}>
        <ExplorerMap variant="workspace" onStatus={props.onStatus} onMap={props.onMap} onFailure={props.onFailure} />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

const status = () => screen.getByTestId("explorer-map").getAttribute("data-status");
/** The div the library is given: the map's first child. */
const container = () => screen.getByTestId("explorer-map").firstElementChild as HTMLElement;

/**
 * A request the server answered with an error, as the map's `error` event carries it: the
 * library's AJAXError has the HTTP `status` and the `url`, and a message that is only the status
 * text — which over HTTP/2 is empty, the default here. An event from a source or one of its tiles
 * also carries `sourceId` (and `tile`); the style's own carries neither.
 */
function httpError(code: number, url: string, statusText = "", from: { sourceId?: string; tile?: object } = {}) {
  return { error: Object.assign(new Error(statusText), { status: code, url }), ...from };
}
const STYLE_URL = "https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=pk.test";
const TILE_URL = "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/4/11/6.vector.pbf?access_token=pk.test";
const A_TILE = { sourceId: "composite", tile: {} };

beforeEach(() => {
  resetBootstrap();
  gl.arrives = true;
  gl.supported = undefined;
  gl.construct = () => ({});
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
  vi.stubGlobal("fetch", mockFetch((url) => (url.includes("/tiles") ? { raster: undefined, adm1: {}, adm2: {} } : envelope([{ display: "228.7168", display_short: "228.72", group: { province: "Punjab" } }]))));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a map that cannot be built", () => {
  it("the library's own probe says no: nothing is constructed, the status is failed, the reason is unsupported and the loading screen is told", async () => {
    const construct = vi.fn(() => ({}));
    gl.construct = construct;
    gl.supported = () => false;
    const said: string[] = [];
    const onStatus = vi.fn((s: MapStatus) => void said.push(s));
    const onFailure = vi.fn((r: MapFailure) => void said.push(`because ${r}`));
    const onMap = vi.fn();
    mount({ onStatus, onMap, onFailure });
    expect(status()).toBe("loading"); // where every map starts
    await waitFor(() => expect(status()).toBe("failed"));
    expect(construct).not.toHaveBeenCalled();
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["unsupported"]]);
    // the reason first: the page knows which failure it is by the time it hears there is one
    expect(said).toEqual(["because unsupported", "failed"]);
    expect(onMap).not.toHaveBeenCalled();
    expect(getBootstrap().failed.has("map")).toBe(true);
    expect(getBootstrap().reached.has("map")).toBe(false);
  });
  it("the constructor throws after inserting its canvas: caught, reported once as webgl, and the half-built map is taken out of the container", async () => {
    const construct = vi.fn(throwsAfterItsCanvas);
    gl.construct = construct;
    gl.supported = () => true; // the probe can pass and the context still be refused
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(status()).toBe("failed"));
    expect(construct).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["webgl"]]);
    expect(container().childElementCount).toBe(0);
    expect(container().querySelector("canvas")).toBeNull();
    expect(container()).not.toHaveClass("mapboxgl-map");
    expect(getBootstrap().failed.has("map")).toBe(true);
    // the library's jargon is not what the reader is shown: the page owns the words
    expect(screen.queryByTestId("map-error")).toBeNull();
  });
  it("a library with no probe is not refused on that account: the constructor is the judge", async () => {
    gl.construct = vi.fn(throwsAfterItsCanvas);
    mount();
    await waitFor(() => expect(status()).toBe("failed"));
    expect(gl.construct).toHaveBeenCalledTimes(1);
  });
  it("the library's chunk does not arrive: nothing to probe or construct, and the reason is library", async () => {
    const construct = vi.fn(() => ({}));
    gl.construct = construct;
    gl.arrives = false;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(status()).toBe("failed"));
    expect(construct).not.toHaveBeenCalled();
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["library"]]);
    expect(getBootstrap().failed.has("map")).toBe(true);
  });
  it("no token in the build is a failure, not a silence: failed, the reason is token, nothing is constructed and the loading screen stops waiting", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
    const construct = vi.fn(() => ({}));
    gl.construct = construct;
    gl.supported = () => true;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onFailure, onMap });
    expect(status()).toBe("loading");
    // it used to stay there: no status, no failed stage, a page with live buttons over nothing
    await waitFor(() => expect(status()).toBe("failed"));
    expect(construct).not.toHaveBeenCalled();
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["token"]]);
    expect(onMap).not.toHaveBeenCalled();
    expect(getBootstrap().failed.has("map")).toBe(true);
    expect(getBootstrap().reached.has("map")).toBe(false);
    // the developer's own line about the missing variable is still the map's to show
    expect(screen.getByTestId("basemap-notice")).toBeInTheDocument();
  });
  it("a failure after the unmount is nobody's news: no callback, no failed stage", async () => {
    let release: () => void = () => undefined;
    // the probe runs after the library's chunk has arrived, so the unmount is slipped in from it
    gl.supported = () => {
      release();
      return false;
    };
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const { unmount } = mount({ onStatus, onFailure });
    release = unmount;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onStatus).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(getBootstrap().failed.size).toBe(0);
  });
});

describe("a map whose context the browser takes away", () => {
  it("built and loaded: ready, and the map handed to the page as before", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    gl.supported = () => true;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onMap, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    for (const name of ["error", "style.load", "moveend", "webglcontextlost", "webglcontextrestored"]) expect(fake.listens(name), name).toBe(true);
    expect(status()).toBe("loading");
    expect(onStatus).not.toHaveBeenCalled(); // the initial loading is not an event
    fake.emit("load");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"]]);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onMap).toHaveBeenCalledWith(fake.map);
    expect(getBootstrap().reached.has("map")).toBe(true);
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("lost after load, then restored: lost, then ready again — the same instance, nothing rebuilt", async () => {
    const fake = fakeMap();
    const construct = vi.fn(() => fake.map);
    gl.construct = construct;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("webglcontextlost");
    expect(status()).toBe("lost");
    fake.emit("webglcontextrestored");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"], ["lost"], ["ready"]]);
    expect(onFailure).not.toHaveBeenCalled(); // a loss is not a failure, and has no reason
    expect(construct).toHaveBeenCalledTimes(1);
    // the loading screen had its map: a later loss is not a failed stage
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("lost before the first load: the loading screen stops waiting; restored is loading, and the load that follows is ready", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    mount({ onStatus });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("webglcontextlost");
    expect(status()).toBe("lost");
    expect(getBootstrap().failed.has("map")).toBe(true);
    fake.emit("webglcontextrestored");
    expect(status()).toBe("loading");
    fake.emit("load");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["lost"], ["loading"], ["ready"]]);
    expect(getBootstrap().reached.has("map")).toBe(true);
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("a context that came back and could not be set up again: failed for good as webgl, whatever the restore event says after it", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("webglcontextlost");
    // the library's order inside its restore handler: the error first, then the event
    fake.emit("error", { error: new Error("Failed to initialize WebGL") });
    fake.emit("webglcontextrestored");
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["ready"], ["lost"], ["failed"]]);
    expect(onFailure.mock.calls).toEqual([["webgl"]]);
    expect(screen.queryByTestId("map-error")).toBeNull();
  });
  it("a tile that did not arrive after load is still the one-line strip, and no change of status — with or without an HTTP status of its own", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("error", { error: new Error("a tile did not arrive"), ...A_TILE });
    expect(screen.getByTestId("map-error")).toHaveTextContent("Map: a tile did not arrive");
    fake.emit("error", httpError(503, TILE_URL, "Service Unavailable", A_TILE));
    expect(screen.getByTestId("map-error")).toHaveTextContent("Map: Service Unavailable");
    // and the style's own late complaint (a sprite, a glyph range) is no more than that either
    fake.emit("error", httpError(500, STYLE_URL, "Internal Server Error"));
    expect(screen.getByTestId("map-error")).toHaveTextContent("Map: Internal Server Error");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"]]);
    expect(onFailure).not.toHaveBeenCalled();
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("a tile's or a source's HTTP error before load is not the style's: the strip, and the map goes on loading", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("error", httpError(500, TILE_URL, "Internal Server Error", A_TILE));
    fake.emit("error", httpError(502, "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?access_token=pk.test", "Bad Gateway", { sourceId: "composite" }));
    expect(screen.getByTestId("map-error")).toHaveTextContent("Map: Bad Gateway");
    expect(status()).toBe("loading");
    expect(onStatus).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    fake.emit("load");
    expect(status()).toBe("ready");
  });
  it("a dead map that throws from its own teardown does not take the page with it", async () => {
    const remove = vi.fn(() => {
      throw new Error("the context is gone");
    });
    const fake = fakeMap(remove);
    gl.construct = () => fake.map;
    const onMap = vi.fn();
    const { unmount } = mount({ onMap });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("webglcontextlost");
    expect(() => unmount()).not.toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(onMap).toHaveBeenLastCalledWith(null);
  });
});

describe("a map the service will not serve", () => {
  it("the style refused with 403 before load — a token not allowed on this hostname, the message empty over HTTP/2: failed as token, no strip, and nothing after it is news", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onFailure, onMap });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("error", httpError(403, STYLE_URL));
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["token"]]);
    expect(getBootstrap().failed.has("map")).toBe(true);
    expect(screen.queryByTestId("map-error")).toBeNull();
    // the same refusal for every other request behind it, a lost context, even a `load`: said once
    fake.emit("error", httpError(403, TILE_URL, "", A_TILE));
    fake.emit("webglcontextlost");
    fake.emit("webglcontextrestored");
    fake.emit("load");
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["token"]]);
    expect(onMap).not.toHaveBeenCalled();
  });
  it("a 401 is the same refusal, in Mapbox's own words or in none", async () => {
    for (const statusText of ["", "Unauthorized: you may have provided an invalid Mapbox access token. See https://docs.mapbox.com/api/guides/#access-tokens-and-token-scopes"]) {
      const fake = fakeMap();
      gl.construct = () => fake.map;
      const onFailure = vi.fn();
      const { unmount } = mount({ onFailure });
      await waitFor(() => expect(fake.listens("load")).toBe(true));
      fake.emit("error", httpError(401, STYLE_URL, statusText));
      expect(status()).toBe("failed");
      expect(onFailure.mock.calls).toEqual([["token"]]);
      unmount();
    }
  });
  it("the style answered with any other HTTP error before load: failed as style, which a retry may cure", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("error", httpError(500, STYLE_URL, "Internal Server Error"));
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["style"]]);
    expect(getBootstrap().failed.has("map")).toBe(true);
    expect(screen.queryByTestId("map-error")).toBeNull();
  });
  it("a map judged on one HTTP error that loads all the same is a map: the style verdict is undone by the load it said would not come", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onFailure, onMap });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    // the style's sprite reports as the style does, and a map loads without it
    fake.emit("error", httpError(404, "https://api.mapbox.com/styles/v1/mapbox/light-v11/sprite@2x.json?access_token=pk.test", "Not Found"));
    expect(status()).toBe("failed");
    fake.emit("load");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["failed"], ["ready"]]);
    expect(onFailure.mock.calls).toEqual([["style"]]);
    expect(onMap).toHaveBeenCalledWith(fake.map);
    expect(getBootstrap().reached.has("map")).toBe(true);
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("Mapbox withdraws the session after load and clears the canvas itself: failed as token, not a strip over a blank map", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("error", { error: new Error("A valid Mapbox access token is required to use Mapbox GL JS. To create an account or a new access token, visit https://account.mapbox.com/") });
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["ready"], ["failed"]]);
    expect(onFailure.mock.calls).toEqual([["token"]]);
    expect(screen.queryByTestId("map-error")).toBeNull();
  });
  it("a 403 on a Mapbox tile after load is the token too; a 403 from this page's own API is one of our layers refused, and only the strip", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("error", httpError(403, `${absoluteApiBase()}/tiles/adm1/4/11/6.pbf`, "Forbidden", { sourceId: "adm1", tile: {} }));
    expect(screen.getByTestId("map-error")).toHaveTextContent("Map: Forbidden");
    expect(status()).toBe("ready");
    expect(onFailure).not.toHaveBeenCalled();
    fake.emit("error", httpError(403, TILE_URL, "", A_TILE));
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["ready"], ["failed"]]);
    expect(onFailure.mock.calls).toEqual([["token"]]);
  });
});

describe("a map that never says anything", () => {
  /** Fake timers that still let the testing library's own polling run. */
  const fakeClock = () => vi.useFakeTimers({ shouldAdvanceTime: true });
  const pass = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  // the fake clock also moves with the real one, so "just before" keeps a margin wider than a test takes
  const MARGIN = 2000;

  it("neither load nor a failure by the timeout: failed as timeout, and the loading screen stops waiting", async () => {
    fakeClock();
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    expect(MAP_LOAD_TIMEOUT_MS).toBe(20000);
    pass(MAP_LOAD_TIMEOUT_MS - MARGIN);
    expect(status()).toBe("loading");
    expect(onStatus).not.toHaveBeenCalled();
    pass(MARGIN);
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["timeout"]]);
    expect(getBootstrap().failed.has("map")).toBe(true);
    // one timer, fired once: nothing more however long the silence lasts
    pass(3 * MAP_LOAD_TIMEOUT_MS);
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["timeout"]]);
  });
  it("a page that cannot be seen is not timed: the clock stops while the document is hidden and starts whole when it is shown", async () => {
    // FOUND LIVE, the day the timer shipped: a hidden document gets no animation frames, so a map
    // in a background tab cannot load, and twenty seconds later the page had declared it too slow.
    fakeClock();
    let visibility: DocumentVisibilityState = "hidden";
    const spy = vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const show = (next: DocumentVisibilityState) => {
      visibility = next;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };
    try {
      const fake = fakeMap();
      gl.construct = () => fake.map;
      const onFailure = vi.fn();
      mount({ onFailure });
      await waitFor(() => expect(fake.listens("load")).toBe(true));
      // opened behind another tab: no verdict, however long it stays there
      pass(5 * MAP_LOAD_TIMEOUT_MS);
      expect(status()).toBe("loading");
      expect(onFailure).not.toHaveBeenCalled();
      // shown, then hidden again before the time is up: the count does not carry over
      show("visible");
      pass(MAP_LOAD_TIMEOUT_MS - MARGIN);
      show("hidden");
      pass(5 * MAP_LOAD_TIMEOUT_MS);
      expect(status()).toBe("loading");
      // shown and silent for the whole of it: that is a map taking too long
      show("visible");
      pass(MAP_LOAD_TIMEOUT_MS - MARGIN);
      expect(status()).toBe("loading");
      pass(MARGIN);
      expect(status()).toBe("failed");
      expect(onFailure.mock.calls).toEqual([["timeout"]]);
    } finally {
      spy.mockRestore();
    }
  });
  it("a map given up on that loads after all is shown: the timeout is undone by the load it was waiting for", async () => {
    fakeClock();
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onFailure, onMap });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    pass(MAP_LOAD_TIMEOUT_MS);
    expect(status()).toBe("failed");
    fake.emit("load");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["failed"], ["ready"]]);
    expect(onFailure.mock.calls).toEqual([["timeout"]]);
    expect(onMap).toHaveBeenCalledWith(fake.map);
    expect(getBootstrap().reached.has("map")).toBe(true);
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("but not if Mapbox refused the token in the meantime: said once as timeout, and the load that follows does not bring back a canvas Mapbox has cleared", async () => {
    fakeClock();
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onFailure, onMap });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    pass(MAP_LOAD_TIMEOUT_MS);
    fake.emit("error", httpError(401, "https://api.mapbox.com/map-sessions/v1?sku=x&access_token=pk.test"));
    fake.emit("load");
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["timeout"]]);
    expect(onMap).not.toHaveBeenCalled();
  });
  it("no timeout once the map has loaded, however long it then sits there", async () => {
    fakeClock();
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    pass(MAP_LOAD_TIMEOUT_MS - MARGIN);
    fake.emit("load");
    pass(3 * MAP_LOAD_TIMEOUT_MS);
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"]]);
    expect(onFailure).not.toHaveBeenCalled();
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("a map that has already failed does not fail again when the timer would have fired", async () => {
    fakeClock();
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("error", httpError(403, STYLE_URL));
    pass(3 * MAP_LOAD_TIMEOUT_MS);
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onFailure.mock.calls).toEqual([["token"]]);
  });
  it("a map unmounted while it was still silent — the one a retry replaces — never calls back", async () => {
    fakeClock();
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    const onFailure = vi.fn();
    const { unmount } = mount({ onStatus, onFailure });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    unmount();
    pass(3 * MAP_LOAD_TIMEOUT_MS);
    expect(onStatus).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(getBootstrap().failed.size).toBe(0);
  });
});
