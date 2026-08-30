import "@testing-library/jest-dom/vitest";
/**
 * The legend capsule's five faces against mocked envelopes:
 *
 *  · Relative (the default) — the two words and the ramp, and NOT ONE NUMBER: the shading is a
 *    quantile rank, and a rank is a colour, never a label. Its ⓘ says where the values are;
 *  · Fixed — the two ends are the server's own strings from the reference year's all-sector,
 *    all-gas envelope, and no break of ours;
 *  · Absolute — the band count and, in the panel, Legend.tsx's rows: the server's displays;
 *  · a categorical layer — the layer's name, and the panel is LayerLegend's own;
 *  · a refused request, or any year off the reference one — the release's typed refusal in its
 *    own words, never a reason of ours.
 *
 * Every panel carries the sentence saying the map is an allocation and not an observation.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { LAYERS, NOT_OBSERVATION } from "@/components/map/layerModes";
import { LegendCapsule, legendFace } from "./LegendCapsule";
import { LEGEND } from "./copy";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", c: null, cam: null, raster: false, view3d: false };

const PROVINCES = [
  { display: "228.7168", display_short: "228.72", group: { province: "Punjab" }, value: 228.716826597061 },
  { display: "134.7255", display_short: "134.73", group: { province: "Sindh" }, value: 134.725492797539 },
  { display: "56.0600", display_short: "56.06", group: { province: "Khyber Pakhtunkhwa" }, value: 56.05995760742 },
  { display: "30.8471", display_short: "30.85", group: { province: "Balochistan" }, value: 30.847144491259 },
  { display: "1.9972", display_short: "2.00", group: { province: "Other" }, value: 1.997204043148 },
];
const LOW = "2.00";
const HIGH = "228.72";
/** The release's own wording of the refusal off the reference year (the API's `message_worded`). */
const WORDED = "spatial products exist for 2023–24 only";

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.includes("/tiles/bboxes")) return { adm1: { Punjab: [69, 29, 74, 34], Sindh: [66, 23, 71, 28] }, adm2: {} };
      if (url.includes("/tiles")) return { raster: undefined };
      // the API's own refusal for a year it does not map, `message_worded` and all
      if ((body?.periods as string[] | undefined)?.[0] === "FY2020-21") return { __status: 422, body: { error: "grain_unavailable", error_class: "GrainUnavailable", message: "spatial products exist for FY2023-24 only", message_worded: WORDED, limitation_id: "grid_not_tabular", detail: {} } };
      return envelope(PROVINCES);
    }),
  );
});

function mount(state: Partial<ExplorerState> = {}) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx({ ...base, ...state })}>
        <LegendCapsule />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

const capsule = () => screen.getByTestId("legend-capsule");
const openPanel = () => fireEvent.click(screen.getByTestId("legend-note"));

describe("which face the capsule wears", () => {
  it("is the layer, the scale, the year and the refusal, in that order of precedence", () => {
    expect(legendFace({ layer: "magnitude", scale: "relative", mapped: true, refused: false })).toBe("relative");
    expect(legendFace({ layer: "magnitude", scale: "fixed", mapped: true, refused: false })).toBe("fixed");
    expect(legendFace({ layer: "magnitude", scale: "absolute", mapped: true, refused: false })).toBe("absolute");
    expect(legendFace({ layer: "evidence", scale: "relative", mapped: true, refused: false })).toBe("categorical");
    // a refusal, or a year the release does not map, beats every other face
    expect(legendFace({ layer: "evidence", scale: "absolute", mapped: true, refused: true })).toBe("refused");
    expect(legendFace({ layer: "magnitude", scale: "relative", mapped: false, refused: false })).toBe("refused");
  });
});

describe("the legend capsule", () => {
  it("Relative is the default face: Lower ▬▬ Higher and no number at all", async () => {
    mount();
    await waitFor(() => expect(capsule()).toHaveAttribute("data-face", "relative"));
    expect(capsule()).toHaveTextContent(LEGEND.relative);
    expect(capsule()).toHaveTextContent(LEGEND.lower);
    expect(capsule()).toHaveTextContent(LEGEND.higher);
    expect(screen.getByTestId("legend-ramp").getAttribute("style")).toContain("linear-gradient(90deg");
    expect(capsule().textContent ?? "").not.toMatch(/\d/);
    // its ⓘ says where the exact values are, and the panel keeps the allocation sentence
    expect(screen.getByTestId("legend-note")).toHaveAttribute("title", LEGEND.relativeNote);
    openPanel();
    expect(screen.getByTestId("legend-panel-note")).toHaveTextContent(LEGEND.relativeNote);
    expect(screen.getByTestId("legend-panel")).toHaveTextContent(NOT_OBSERVATION);
  });

  it("Fixed names the mode and its two ends, and both are the server's own strings", async () => {
    mount({ scale: "fixed" });
    await waitFor(() => expect(screen.getByTestId("legend-low")).toHaveTextContent(LOW));
    expect(capsule()).toHaveAttribute("data-face", "fixed");
    expect(capsule()).toHaveTextContent(LEGEND.fixed);
    expect(screen.getByTestId("legend-high")).toHaveTextContent(HIGH);
    // the only figures on the line are those two strings
    expect((capsule().textContent ?? "").replace(LOW, "").replace(HIGH, "")).not.toMatch(/\d/);
    openPanel();
    expect(screen.getByTestId("legend-panel-note")).toHaveTextContent(LEGEND.fixedNote);
    expect(screen.getByTestId("legend-panel")).toHaveTextContent(NOT_OBSERVATION);
  });

  it("Absolute counts its bands and opens the server's break strings — Legend.tsx's own rows", async () => {
    mount({ scale: "absolute" });
    await waitFor(() => expect(capsule()).toHaveAttribute("data-face", "absolute"));
    expect(capsule()).toHaveTextContent(LEGEND.absolute);
    expect(screen.getByTestId("legend-bands")).toHaveTextContent(LEGEND.bands(5));
    openPanel();
    const labels = await screen.findAllByTestId("legend-label");
    expect(labels.map((e) => e.textContent)).toEqual([LOW, "30.85", "56.06", "134.73", HIGH]);
    expect(screen.getByTestId("legend-panel")).toHaveTextContent(NOT_OBSERVATION);
  });

  it("a categorical layer shows its name and opens LayerLegend's panel", async () => {
    mount({ layer: "evidence", level: "adm2" });
    await waitFor(() => expect(capsule()).toHaveAttribute("data-face", "categorical"));
    expect(screen.getByTestId("legend-layer")).toHaveTextContent(LAYERS.evidence.label);
    openPanel();
    const panel = await screen.findByTestId("layer-legend");
    expect(panel).toHaveAttribute("data-layer", "evidence");
    expect(screen.getByTestId("layer-sentence")).toHaveTextContent(NOT_OBSERVATION);
  });

  it("off the reference year the capsule carries the release's own refusal, worded as the API words it", async () => {
    mount({ period: "FY2020-21" });
    await waitFor(() => expect(screen.getByTestId("legend-refusal")).toHaveTextContent(WORDED));
    expect(capsule()).toHaveAttribute("data-face", "refused");
    expect(capsule()).toHaveTextContent(LEGEND.notMapped);
    // the API's words, and no reason of ours
    expect(screen.getByTestId("legend-refusal")).toHaveTextContent(WORDED);
    expect(capsule().textContent ?? "").not.toContain("FY");
    openPanel();
    const card = await screen.findByTestId("refusal-card");
    expect(card).toHaveTextContent("GrainUnavailable");
    expect(card).toHaveAttribute("data-limitation", "grid_not_tabular");
    expect(screen.getByTestId("legend-panel")).toHaveTextContent(NOT_OBSERVATION);
  });
});
