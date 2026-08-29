import "@testing-library/jest-dom/vitest";
/**
 * "No FY anywhere": with a release whose labels come in the API's shape (short "2023–24", label
 * "July 2023 – June 2024", basis_note), the explainer (all four screens, the mobile scroll), the
 * time rail and the scope chips print no "FY" token; the rail and the period chip carry the
 * spelled-out months as their tooltip (`title`); the ids stay in the state and the requests.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseAgent, releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { TimeRail } from "@/components/map/TimeRail";
import { ScopeChips } from "@/components/map/ScopeChips";
import { WelcomeModal } from "@/components/shell/WelcomeModal";
import { RELEASE, envelope, mockFetch } from "./fixtures";

vi.mock("@/components/ui/BarChart", () => ({ BarChart: ({ env }: { env: { values: { display: string }[] } }) => <div data-testid="bar-chart">{env.values.map((v) => v.display).join(" ")}</div> }));

const state: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, panel: null, ask: false, c: null, cam: null, raster: false, view3d: false };

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
  it("the explainer, the rail and the chips print the release's labels, never a period id", async () => {
    render(
      <Providers>
        <ExplorerContext.Provider value={ctx()}>
          <TimeRail />
          <ScopeChips />
          <WelcomeModal />
        </ExplorerContext.Provider>
      </Providers>,
    );
    await screen.findByTestId("welcome-modal");
    await screen.findByTestId("intro-question");
    await screen.findByTestId("bar-chart");
    expect(RELEASE.labels.periods["FY2023-24"].short).toBe("2023–24");
    const text = document.body.textContent ?? "";
    expect(text).toContain("2023–24");
    expect(text).not.toContain("FY");
    expect(screen.getByTestId("time-rail")).toHaveTextContent("2023–24");
    expect(screen.getByTestId("time-rail").querySelector('[title="July 2023 – June 2024"]')).toHaveTextContent("2023–24");
    const periodChip = screen.getAllByTestId("scope-chip").find((c) => c.textContent === "2023–24");
    expect(periodChip).toBeTruthy();
    expect(periodChip).toHaveAttribute("title", "July 2023 – June 2024");
    expect(screen.getByRole("heading", { level: 1, name: "Pakistan greenhouse-gas emissions, 2020–21 to 2023–24" })).toBeInTheDocument();
    expect(screen.getByTestId("intro-facts")).toHaveTextContent("2 fiscal years");
    expect(screen.getByTestId("intro-sectors-title")).toHaveTextContent("Emissions by sector, 2023–24");
    expect(screen.getByTestId("intro-question")).toHaveTextContent("since 2020–21?");
    // nothing in any title attribute either
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) expect(el.getAttribute("title")).not.toContain("FY");
  });
});
