import "@testing-library/jest-dom/vitest";
/**
 * /methods smoke (today's /about prose, moved): the sections render from the mocked release
 * (period, GWP bases, LULUCF note, limitation texts, functions, licences incl. the ODbL note),
 * the territories' unit is named from the boundary file, no decimal is printed, no "avoid"
 * phrase appears, and the nav marks Methods & evidence as the current page.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import MethodsPage from "@/app/methods/page";
import { RELEASE, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/methods", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const BBOXES = { adm1: { "Azad Kashmir": [73, 33, 75, 35], Balochistan: [61, 24, 70, 32], "Gilgit-Baltistan": [72, 34, 77, 37], "Islamabad Capital Territory": [72.8, 33.5, 73.4, 33.9], "Khyber Pakhtunkhwa": [69, 31, 74, 37], Punjab: [69, 27, 75, 34], Sindh: [66, 23, 71, 28] }, adm2: {} };

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    mockFetch((url) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/tiles/bboxes")) return BBOXES;
      return {};
    }),
  );
});

describe("/methods", () => {
  it("renders the sections from the release and the boundary file", async () => {
    render(
      <Providers>
        <MethodsPage />
      </Providers>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Methods & evidence" })).toBeInTheDocument();
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Methods & evidence")).toHaveAttribute("aria-current", "page");
    // the version is printed once, under "Release"; nowhere else on the page
    expect(await screen.findByTestId("about-release")).toHaveTextContent("This Explorer reads PakEmis 1.0.0rc42 at commit bc1716d6");
    expect(screen.getAllByText(/1\.0\.0rc42/).length).toBe(1);
    const what = await screen.findByTestId("about-what");
    expect(what).toHaveTextContent("rebuilt from public documents");
    const data = screen.getByTestId("about-data");
    expect(data).toHaveTextContent("every sector reports the same twelve months");
    expect(data).toHaveTextContent("on IPCC 2013 (AR5), with IPCC 2021 (AR6) carried as a secondary basis");
    const gwp = screen.getByTestId("about-gwp");
    expect(gwp).toHaveTextContent("CO₂-equivalent and warming potentials");
    expect(gwp).toHaveTextContent("IPCC 2013 (AR5) (the default): CO₂-equivalent using the IPCC Fifth Assessment Report's 100-year warming potentials (CH₄ × 28, fossil CH₄ × 30, N₂O × 265).");
    expect(gwp).toHaveTextContent("IPCC 2021 (AR6): CO₂-equivalent using the IPCC Sixth Assessment Report's");
    const est = screen.getByTestId("about-estimates");
    expect(est).toHaveTextContent("Two estimates");
    expect(est).toHaveTextContent("Reference estimate — every axis at its reference setting");
    expect(est).toHaveTextContent("Survey-based estimate — the residential module re-run on observed household demand");
    expect(data).toHaveTextContent("excluded (NE): an exploratory Tier-1 module");
    expect(data).toHaveTextContent("configuration S substitutes the residential module");
    const map = screen.getByTestId("about-map");
    expect(map).toHaveTextContent("their CO2e is a bounded interval, never a midpoint");
    expect(map).toHaveTextContent("the map tiles are visual only");
    expect(map).toHaveTextContent("ar6_adm2_ne");
    await waitFor(() => expect(screen.getByTestId("about-territories")).toHaveTextContent("Azad Kashmir, Gilgit-Baltistan and Islamabad Capital Territory together"));
    expect(screen.getByTestId("about-territories")).toHaveTextContent("Coverage of the three territories differs by sector");
    expect(screen.getByTestId("about-ask")).toHaveTextContent("get_timeseries");
    expect(screen.getByTestId("about-ask")).toHaveTextContent("not mounted");
    const lic = screen.getByTestId("about-licences");
    expect(lic).toHaveTextContent("Code MIT; data and text CC-BY-4.0");
    expect(lic).toHaveTextContent("OpenStreetMap (c) contributors");
    expect(lic).toHaveTextContent("data/gis/rail/pak_rail_network.geojson");
    expect(screen.getByTestId("about-vocabulary")).toBeInTheDocument();
    expect(screen.getByTestId("about-links")).toHaveTextContent("Downloads");
    expect(screen.getByTestId("about-links").querySelector('a[href="/downloads"]')).not.toBeNull();
  });
  it("every decimal is a string of the release (id, licence names); no avoid-list phrase", async () => {
    const { container } = render(
      <Providers>
        <MethodsPage />
      </Providers>,
    );
    await screen.findByTestId("about-territories");
    const fromRelease = new Set(JSON.stringify(RELEASE).match(/\d+\.\d+/g) ?? []);
    const tokens = (container.textContent ?? "").match(/\d+\.\d+/g) ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(fromRelease.has(t)).toBe(true);
    expect(avoidPhrasesIn(container.textContent ?? "")).toEqual([]);
  });
});
