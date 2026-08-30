import "@testing-library/jest-dom/vitest";
/**
 * The year slider and the release's one mapped year. Nine ticks, one per fiscal period; the
 * reference year's tick is FILLED and every other one HOLLOW, and a hollow tick's tooltip says
 * which year the map shows. Standing on a hollow year the slider carries THE API'S OWN refusal
 * — its `message_worded`, never a reason of ours — while the deck goes on answering nationally;
 * and the map greys, which is the paint contract asserted here directly: off the reference year
 * `mapsPeriod` is false and the branch it selects, `clearPaint`, leaves the level with no
 * feature state and the no-data colour, outlines only.
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

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", c: null, cam: null, raster: false, view3d: false };
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
  it("one tick per published year, the current one found even when the state names another", () => {
    expect(sliderTicks(["a", "b", "c"], "b")).toEqual({ ids: ["a", "b", "c"], index: 1 });
    expect(sliderTicks(["a", "b", "c"], "zz").index).toBe(2);
    mount();
    expect(screen.getAllByTestId("year-tick")).toHaveLength(RELEASE.labels.periods ? Object.keys(RELEASE.labels.periods).length : 0);
    expect(screen.getByTestId("year-value")).toHaveTextContent("2023–24");
    expect(screen.getByTestId("year-first")).toHaveTextContent("2020–21");
    expect(screen.getByTestId("year-last")).toHaveTextContent("2023–24");
  });

  it("the reference year's tick is filled and every other one hollow, and a hollow tick's tooltip says which year the map shows", () => {
    mount();
    const ticks = screen.getAllByTestId("year-tick");
    const filled = ticks.filter((t) => t.getAttribute("data-mapped") === "1");
    const hollow = ticks.filter((t) => t.getAttribute("data-mapped") === "0");
    expect(filled).toHaveLength(1);
    expect(hollow.length).toBeGreaterThan(0);
    expect(filled[0]).toHaveAttribute("aria-label", "2023–24");
    expect(filled[0].className).toContain("bg-amber");
    for (const t of hollow) {
      expect(t.className).toContain("bg-transparent");
      expect(t.getAttribute("title")).toContain(FILTERS.mappedYear("2023–24"));
      expect(t.getAttribute("title")).not.toContain("FY");
    }
    // a tick selects its year, as the track does
    fireEvent.click(hollow[0]);
    expect(setState).toHaveBeenCalledWith({ period: "FY2020-21" });
    fireEvent.change(screen.getByTestId("year-range"), { target: { value: "0" } });
    expect(setState).toHaveBeenCalledWith({ period: "FY2020-21" });
  });

  it("on the reference year nothing is refused and no national-only line is drawn", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("year-value")).toHaveTextContent("2023–24"));
    expect(screen.queryByTestId("year-national-only")).toBeNull();
  });

  it("off the reference year the slider carries the API's own refusal, in the API's words", async () => {
    mount({ period: "FY2020-21" });
    const line = await screen.findByTestId("year-national-only");
    expect(line).toHaveTextContent(FILTERS.nationalOnly);
    await waitFor(() => expect(screen.getByTestId("year-refusal")).toHaveTextContent(WORDED));
    expect(screen.getByTestId("year-refusal").getAttribute("title")).toContain("GrainUnavailable");
    // the release's words, and no id and no invented reason
    expect(line.textContent ?? "").not.toContain("FY");
    expect(screen.getByTestId("year-value")).toHaveTextContent("2020–21");
  });

  it("the map greys off the reference year: mapsPeriod is false and clearPaint leaves outlines only", () => {
    const labels = releaseLabels(RELEASE as unknown as ReleaseInfo);
    expect(mapsPeriod(labels, "FY2023-24")).toBe(true);
    expect(mapsPeriod(labels, "FY2020-21")).toBe(false);
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
