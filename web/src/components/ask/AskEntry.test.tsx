/** The Ask pill toggles `ask`; the hint shows once and localStorage remembers the dismissal. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE } from "@/__tests__/fixtures";
import { ASK_HINT_KEY, AskHint, AskPill } from "./AskEntry";

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, panel: null, ask: false, c: null, cam: null, raster: false, view3d: false };

function ctx(setState = vi.fn(), state = base): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}

beforeEach(() => window.localStorage.clear());

describe("AskEntry", () => {
  it("the pill opens the dock (ask=1) and closes it again", () => {
    const setState = vi.fn();
    const { rerender } = render(
      <ExplorerContext.Provider value={ctx(setState)}>
        <AskPill />
      </ExplorerContext.Provider>,
    );
    fireEvent.click(screen.getByTestId("ask-pill"));
    expect(setState).toHaveBeenCalledWith({ ask: true });
    rerender(
      <ExplorerContext.Provider value={ctx(setState, { ...base, ask: true })}>
        <AskPill />
      </ExplorerContext.Provider>,
    );
    expect(screen.getByTestId("ask-pill")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("ask-pill"));
    expect(setState).toHaveBeenLastCalledWith({ ask: false });
  });
  it("the hint shows once, opens the dock, and stays dismissed", () => {
    const setState = vi.fn();
    const { unmount } = render(
      <ExplorerContext.Provider value={ctx(setState)}>
        <AskHint />
      </ExplorerContext.Provider>,
    );
    fireEvent.click(screen.getByText(/Ask the inventory a question/));
    expect(setState).toHaveBeenCalledWith({ ask: true });
    expect(window.localStorage.getItem(ASK_HINT_KEY)).toBe("1");
    expect(screen.queryByTestId("ask-hint")).toBeNull();
    unmount();
    render(
      <ExplorerContext.Provider value={ctx(setState)}>
        <AskHint />
      </ExplorerContext.Provider>,
    );
    expect(screen.queryByTestId("ask-hint")).toBeNull();
  });
  it("the hint's close button dismisses without opening the dock; the hint hides while the dock is open", () => {
    const setState = vi.fn();
    render(
      <ExplorerContext.Provider value={ctx(setState)}>
        <AskHint />
      </ExplorerContext.Provider>,
    );
    fireEvent.click(screen.getByLabelText("Dismiss the hint"));
    expect(setState).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ASK_HINT_KEY)).toBe("1");
    window.localStorage.clear();
    render(
      <ExplorerContext.Provider value={ctx(setState, { ...base, ask: true })}>
        <AskHint />
      </ExplorerContext.Provider>,
    );
    expect(screen.queryByTestId("ask-hint")).toBeNull();
  });
});
