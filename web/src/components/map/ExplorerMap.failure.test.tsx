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
import { ExplorerMap, type MapStatus } from "./ExplorerMap";

/** What the fake library does next: its probe's answer (absent on a library with no probe) and its constructor. */
const gl = vi.hoisted(() => ({
  supported: undefined as undefined | (() => boolean),
  construct: (() => ({})) as (options: { container: HTMLElement }) => object,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("mapbox-gl", () => ({
  default: {
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
  },
}));

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

function mount(props: { onStatus?: (s: MapStatus) => void; onMap?: (m: unknown) => void } = {}) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx()}>
        <ExplorerMap variant="workspace" onStatus={props.onStatus} onMap={props.onMap} />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

const status = () => screen.getByTestId("explorer-map").getAttribute("data-status");
/** The div the library is given: the map's first child. */
const container = () => screen.getByTestId("explorer-map").firstElementChild as HTMLElement;

beforeEach(() => {
  resetBootstrap();
  gl.supported = undefined;
  gl.construct = () => ({});
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
  vi.stubGlobal("fetch", mockFetch((url) => (url.includes("/tiles") ? { raster: undefined, adm1: {}, adm2: {} } : envelope([{ display: "228.7168", display_short: "228.72", group: { province: "Punjab" } }]))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a map that cannot be built", () => {
  it("the library's own probe says no: nothing is constructed, the status is failed and the loading screen is told", async () => {
    const construct = vi.fn(() => ({}));
    gl.construct = construct;
    gl.supported = () => false;
    const onStatus = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onMap });
    expect(status()).toBe("loading"); // where every map starts
    await waitFor(() => expect(status()).toBe("failed"));
    expect(construct).not.toHaveBeenCalled();
    expect(onStatus.mock.calls).toEqual([["failed"]]);
    expect(onMap).not.toHaveBeenCalled();
    expect(getBootstrap().failed.has("map")).toBe(true);
    expect(getBootstrap().reached.has("map")).toBe(false);
  });
  it("the constructor throws after inserting its canvas: caught, reported once, and the half-built map is taken out of the container", async () => {
    const construct = vi.fn(throwsAfterItsCanvas);
    gl.construct = construct;
    gl.supported = () => true; // the probe can pass and the context still be refused
    const onStatus = vi.fn();
    mount({ onStatus });
    await waitFor(() => expect(status()).toBe("failed"));
    expect(construct).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls).toEqual([["failed"]]);
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
  it("a failure after the unmount is nobody's news: no callback, no failed stage", async () => {
    let release: () => void = () => undefined;
    // the probe runs after the library's chunk has arrived, so the unmount is slipped in from it
    gl.supported = () => {
      release();
      return false;
    };
    const onStatus = vi.fn();
    const { unmount } = mount({ onStatus });
    release = unmount;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onStatus).not.toHaveBeenCalled();
    expect(getBootstrap().failed.size).toBe(0);
  });
});

describe("a map whose context the browser takes away", () => {
  it("built and loaded: ready, and the map handed to the page as before", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    gl.supported = () => true;
    const onStatus = vi.fn();
    const onMap = vi.fn();
    mount({ onStatus, onMap });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    for (const name of ["error", "style.load", "moveend", "webglcontextlost", "webglcontextrestored"]) expect(fake.listens(name), name).toBe(true);
    expect(status()).toBe("loading");
    expect(onStatus).not.toHaveBeenCalled(); // the initial loading is not an event
    fake.emit("load");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"]]);
    expect(onMap).toHaveBeenCalledWith(fake.map);
    expect(getBootstrap().reached.has("map")).toBe(true);
    expect(getBootstrap().failed.size).toBe(0);
  });
  it("lost after load, then restored: lost, then ready again — the same instance, nothing rebuilt", async () => {
    const fake = fakeMap();
    const construct = vi.fn(() => fake.map);
    gl.construct = construct;
    const onStatus = vi.fn();
    mount({ onStatus });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("webglcontextlost");
    expect(status()).toBe("lost");
    fake.emit("webglcontextrestored");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"], ["lost"], ["ready"]]);
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
  it("a context that came back and could not be set up again: failed for good, whatever the restore event says after it", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    mount({ onStatus });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("webglcontextlost");
    // the library's order inside its restore handler: the error first, then the event
    fake.emit("error", { error: new Error("Failed to initialize WebGL") });
    fake.emit("webglcontextrestored");
    expect(status()).toBe("failed");
    expect(onStatus.mock.calls).toEqual([["ready"], ["lost"], ["failed"]]);
    expect(screen.queryByTestId("map-error")).toBeNull();
  });
  it("any other error is still the one-line strip, and no change of status", async () => {
    const fake = fakeMap();
    gl.construct = () => fake.map;
    const onStatus = vi.fn();
    mount({ onStatus });
    await waitFor(() => expect(fake.listens("load")).toBe(true));
    fake.emit("load");
    fake.emit("error", { error: new Error("a tile did not arrive") });
    expect(screen.getByTestId("map-error")).toHaveTextContent("Map: a tile did not arrive");
    expect(status()).toBe("ready");
    expect(onStatus.mock.calls).toEqual([["ready"]]);
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
