import "@testing-library/jest-dom/vitest";
/**
 * The year slider in the year-aware era (1.0.0rc47): the polygon levels map EVERY period
 * from fact_adm2_year, so standing off the reference year no longer greys the map or draws
 * a line - the line appears only when the release itself refuses the map's request (its
 * `message_worded`, never a reason of ours) or on the grid level, whose value rasters are
 * built from the reference cubes alone. The paint contract is asserted directly:
 * `mapsPeriod` is level-aware - true for polygons in every year, reference-gated for grid -
 * and the grid's `clearPaint` branch leaves the level with no feature state and the
 * no-data colour, outlines only.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { Envelope, ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { NO_CELL } from "@/lib/palette";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { mapsPeriod } from "@/components/map/layerModes";
import { clearPaint, indexCells, paintEnvelope } from "@/components/map/paint";
import { YearSlider, sliderTicks } from "./YearSlider";
import { FILTERS } from "./copy";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, pol: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };
/** The API's own wording of the refusal for a year it does not map. */
const WORDED = "spatial products exist for 2023–24 only";

const setState = vi.fn<ExplorerContextValue["setState"]>();
function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}

beforeEach(() => {
  setState.mockClear();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.endsWith("/release")) return RELEASE;
      if ((body?.periods as string[] | undefined)?.[0] === "FY2020-21") return { __status: 422, body: { error: "grain_unavailable", error_class: "GrainUnavailable", message: "spatial products exist for FY2023-24 only", message_worded: WORDED, limitation_id: "grid_not_tabular", detail: {} } };
      return envelope([{ display: "228.7168", display_short: "228.72", group: { province: "Punjab" } }]);
    }),
  );
});

function mount(state: Partial<ExplorerState> = {}) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx({ ...base, ...state })}>
        <YearSlider />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

describe("the year slider", () => {
  it("one step per published year, the current one found even when the state names another, and the year named once", () => {
    expect(sliderTicks(["a", "b", "c"], "b")).toEqual({ ids: ["a", "b", "c"], index: 1 });
    expect(sliderTicks(["a", "b", "c"], "zz").index).toBe(2);
    mount();
    const range = screen.getByTestId("year-range");
    expect(range).toHaveAttribute("max", String(Object.keys(RELEASE.labels.periods).length - 1));
    expect(screen.getByTestId("year-value")).toHaveTextContent("2023–24");
    // the year is said once: the tick row and the end labels went on 2026-08-31
    expect(screen.queryAllByTestId("year-tick")).toHaveLength(0);
    expect(screen.queryByTestId("year-first")).toBeNull();
    expect(screen.queryByTestId("year-last")).toBeNull();
  });

  it("the track selects a year", () => {
    mount();
    fireEvent.change(screen.getByTestId("year-range"), { target: { value: "0" } });
    expect(setState).toHaveBeenCalledWith({ period: "FY2020-21" });
  });

  it("on the reference year nothing is refused and no national-only line is drawn", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("year-value")).toHaveTextContent("2023–24"));
    expect(screen.queryByTestId("year-national-only")).toBeNull();
  });

  it("when the release refuses a year's map request the slider carries its words - and only then", async () => {
    // the fixture still refuses FY2020-21 the way any live refusal would arrive; the
    // line exists for THAT, not for the year itself (the polygons are year-aware now)
    mount({ period: "FY2020-21" });
    const line = await screen.findByTestId("year-national-only");
    expect(line).toHaveTextContent(FILTERS.nationalOnly);
    await waitFor(() => expect(screen.getByTestId("year-refusal")).toHaveTextContent(WORDED));
    expect(screen.getByTestId("year-refusal").getAttribute("title")).toContain("GrainUnavailable");
    // the release's words, and no id and no invented reason
    expect(line.textContent ?? "").not.toContain("FY");
    expect(screen.getByTestId("year-value")).toHaveTextContent("2020–21");
  });

  it("mapsPeriod is level-aware: polygons map every year, the grid stays reference-gated; clearPaint leaves outlines only", () => {
    const labels = releaseLabels(RELEASE as unknown as ReleaseInfo);
    // rc47: fact_adm2_year serves all nine periods at the polygon levels
    expect(mapsPeriod(labels, "FY2023-24", "adm1")).toBe(true);
    expect(mapsPeriod(labels, "FY2020-21", "adm1")).toBe(true);
    expect(mapsPeriod(labels, "FY2020-21", "adm2")).toBe(true);
    // the grid's value rasters are built from the reference cubes alone
    expect(mapsPeriod(labels, "FY2023-24", "grid")).toBe(true);
    expect(mapsPeriod(labels, "FY2020-21", "grid")).toBe(false);
    const states = new Map<string, unknown>();
    const paints = new Map<string, unknown>();
    const map = {
      setFeatureState: (f: { source: string; id?: string }, s: unknown) => states.set(`${f.source}:${f.id}`, s),
      removeFeatureState: (f: { source: string }) => {
        for (const k of [...states.keys()]) if (k.startsWith(`${f.source}:`)) states.delete(k);
      },
      setPaintProperty: (l: string, p: string, v: unknown) => paints.set(`${l}.${p}`, v),
      getLayer: (id: string) => ({ id }),
    };
    const env = envelope([{ display: "228.7168", group: { province: "Punjab" }, value: 228.7 }]) as unknown as Envelope;
    paintEnvelope(map as never, "adm1", indexCells(env, "adm1"), ["Punjab"]);
    expect(states.size).toBe(1);
    clearPaint(map as never, "adm1");
    expect(states.size).toBe(0);
    expect(paints.get("adm1-fill.fill-color")).toBe(NO_CELL);
  });
});
