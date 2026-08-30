import "@testing-library/jest-dom/vitest";
/**
 * "No FY anywhere": with a release whose labels come in the API's shape (short "2023–24", label
 * "July 2023 – June 2024", basis_note), the workspace's filter panel and the Current view bar
 * print no "FY" token; the year slider's value and its ticks carry the spelled-out months as
 * their tooltip (`title`); the ids stay in the state and the requests. (The map's timeline bar
 * retired with the merge: the year slider replaced it and its month row moved into Map settings.)
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseAgent, releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { FilterPanel } from "@/components/workspace/FilterPanel";
import { CurrentView } from "@/components/shell/CurrentView";
import { RELEASE, envelope, mockFetch } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const state: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", c: null, cam: null, raster: false, view3d: false };

function ctx(): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: releaseAgent(release), isMobile: true };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.includes("/timeseries")) return envelope([{ display: "372.397", group: { period_id: "FY2020-21" } }, { display: "452.347", group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries" });
      if (body?.group_by?.[0] === "sector_id") return envelope([{ display: "196.789", group: { sector_id: "agriculture" } }], { context: { ...envelope([]).context, periods: ["FY2023-24"] } });
      return envelope([{ display: "452.34662" }], { context: { ...envelope([]).context, periods: ["FY2023-24"] } });
    }),
  );
});

describe("no FY anywhere", () => {
  it("the year slider, its ticks and the Current view bar print the release's labels, never a period id", async () => {
    render(
      <Providers>
        <ExplorerContext.Provider value={ctx()}>
          <FilterPanel open onToggle={() => {}} place="Pakistan" />
          <CurrentView />
        </ExplorerContext.Provider>
      </Providers>,
    );
    await screen.findByTestId("current-view-line");
    expect(RELEASE.labels.periods["FY2023-24"].short).toBe("2023–24");
    const text = document.body.textContent ?? "";
    expect(text).toContain("2023–24");
    expect(text).not.toContain("FY");
    expect(screen.getAllByTestId("year-tick").some((t) => t.getAttribute("title") === "July 2023 – June 2024")).toBe(true);
    expect(screen.getByTestId("year-value")).toHaveTextContent("2023–24");
    expect(screen.getByTestId("year-value")).toHaveAttribute("title", "July 2023 – June 2024");
    expect(screen.getByTestId("year-range")).toHaveAttribute("title", "a fiscal year runs from July to June");
    expect(screen.getByTestId("current-view-line")).toHaveTextContent("2023–24 · Pakistan · Reference estimate");
    expect(screen.getByTestId("current-view-line")).toHaveAttribute("title", expect.stringContaining("July 2023 – June 2024"));
    // nothing in any title attribute either
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) expect(el.getAttribute("title")).not.toContain("FY");
  });
});
