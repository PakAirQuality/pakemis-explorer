/**
 * The basemap is Mapbox light-v11 (emissions.web.app's grey land and white water) and Map
 * settings' second choice is streets-v12; without a token there is no map and
 * the notice says so; the style override wins. The layer helpers cope with a style that has
 * no symbol layer or no fog slot, and the fill-opacity expression is the slider's percent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASEMAP_CHOICES, BASEMAP_DEFAULT, BASE_STYLE, basemap, NO_TOKEN_NOTICE, STREETS_STYLE, styleFor } from "./basemap";
import { ensureAtmosphere, fillOpacity, firstSymbolLayerId, FILL_OPACITY_PCT, layerSpecs, setFillOpacity } from "./layers";
import type { Map as MBMap } from "mapbox-gl";

afterEach(() => vi.unstubAllEnvs());

describe("basemap", () => {
  it("light-v11 by default, streets-v12 as Map settings' other choice", () => {
    expect(BASE_STYLE).toBe("mapbox://styles/mapbox/light-v11");
    expect(STREETS_STYLE).toBe("mapbox://styles/mapbox/streets-v12");
    expect(BASEMAP_CHOICES.map((c) => c.id)).toEqual(["light", "streets"]);
    expect(BASEMAP_CHOICES.map((c) => c.label)).toEqual(["Light", "Streets"]);
    expect(BASEMAP_DEFAULT).toBe("light");
  });
  it("the choice picks a style: Light keeps the release's own (env override included), Streets is streets-v12", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
    vi.stubEnv("NEXT_PUBLIC_BASEMAP_STYLE", "");
    expect(styleFor(basemap(), "light")).toBe(BASE_STYLE);
    expect(styleFor(basemap())).toBe(BASE_STYLE);
    expect(styleFor(basemap(), "streets")).toBe(STREETS_STYLE);
    vi.stubEnv("NEXT_PUBLIC_BASEMAP_STYLE", "mapbox://styles/x/y");
    expect(styleFor(basemap(), "light")).toBe("mapbox://styles/x/y");
  });
  it("no token: kind none, the notice, the default style named", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
    const bm = basemap();
    expect(bm.kind).toBe("none");
    expect(bm.token).toBeNull();
    expect(bm.notice).toBe(NO_TOKEN_NOTICE);
    expect(bm.style).toBe(BASE_STYLE);
  });
  it("a token: mapbox-light; NEXT_PUBLIC_BASEMAP_STYLE overrides the style", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test");
    vi.stubEnv("NEXT_PUBLIC_BASEMAP_STYLE", "");
    expect(basemap()).toMatchObject({ kind: "mapbox-light", style: BASE_STYLE, notice: "" });
    vi.stubEnv("NEXT_PUBLIC_BASEMAP_STYLE", "mapbox://styles/x/y");
    expect(basemap()).toMatchObject({ kind: "style-url", style: "mapbox://styles/x/y" });
  });
});

describe("layers on the light style", () => {
  it("the first symbol layer is found (light-v11's labels), and a style without one gives undefined", () => {
    const withLabels = { getStyle: () => ({ layers: [{ id: "land", type: "background" }, { id: "water", type: "fill" }, { id: "road-label", type: "symbol" }, { id: "place-label", type: "symbol" }] }) } as unknown as MBMap;
    expect(firstSymbolLayerId(withLabels)).toBe("road-label");
    const bare = { getStyle: () => ({ layers: [{ id: "land", type: "background" }] }) } as unknown as MBMap;
    expect(firstSymbolLayerId(bare)).toBeUndefined();
    expect(firstSymbolLayerId({ getStyle: () => undefined } as unknown as MBMap)).toBeUndefined();
  });
  it("the atmosphere is set once when the style has no fog, kept when it has, and a style that refuses fog does not throw", () => {
    const setFog = vi.fn();
    ensureAtmosphere({ getFog: () => null, setFog } as unknown as MBMap);
    expect(setFog).toHaveBeenCalledTimes(1);
    ensureAtmosphere({ getFog: () => ({ range: [1, 2] }), setFog } as unknown as MBMap);
    expect(setFog).toHaveBeenCalledTimes(1);
    expect(() => ensureAtmosphere({ getFog: () => { throw new Error("no fog"); }, setFog } as unknown as MBMap)).not.toThrow();
  });
  it("fillOpacity is the percent as a fraction, stronger under the hover, clamped; the layer stack uses the console default", () => {
    expect(fillOpacity(80)).toEqual(["case", ["boolean", ["feature-state", "hover"], false], 0.93, 0.8]);
    expect(fillOpacity(100)).toEqual(["case", ["boolean", ["feature-state", "hover"], false], 1, 1]);
    expect(fillOpacity(-5)).toEqual(["case", ["boolean", ["feature-state", "hover"], false], 0.13, 0]);
    const fills = layerSpecs().filter((l) => l.id === "adm1-fill" || l.id === "adm2-fill");
    expect(fills).toHaveLength(2);
    for (const f of fills) expect((f as { paint: Record<string, unknown> }).paint["fill-opacity"]).toEqual(fillOpacity(FILL_OPACITY_PCT));
    const setPaintProperty = vi.fn();
    setFillOpacity({ getLayer: (id: string) => (id === "adm1-fill" ? {} : undefined), setPaintProperty } as unknown as MBMap, 40);
    expect(setPaintProperty).toHaveBeenCalledTimes(1);
    expect(setPaintProperty).toHaveBeenCalledWith("adm1-fill", "fill-opacity", fillOpacity(40));
  });
});
