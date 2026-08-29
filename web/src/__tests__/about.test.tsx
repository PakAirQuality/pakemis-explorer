import "@testing-library/jest-dom/vitest";
/**
 * /about smoke: the sections render from the mocked release (period, GWP bases, LULUCF note,
 * limitation texts, functions, licences incl. the ODbL note), the territories' unit is named
 * from the boundary file, no decimal is printed, and no "avoid" phrase appears.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import AboutPage from "@/app/about/page";
import { INTRO_KEY } from "@/components/shell/WelcomeModal";
import { RELEASE, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

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

describe("/about", () => {
  it("renders the sections from the release and the boundary file", async () => {
    render(
      <Providers>
        <AboutPage />
      </Providers>,
    );
    expect(await screen.findByText("About PakEmis Explorer")).toBeInTheDocument();
    expect(await screen.findByText(/PakEmis 1\.0\.0rc42 · commit/)).toBeInTheDocument();
    const what = await screen.findByTestId("about-what");
    expect(what).toHaveTextContent("rebuilt from public documents");
    const data = screen.getByTestId("about-data");
    expect(data).toHaveTextContent("every sector reports the same twelve months");
    expect(data).toHaveTextContent("on AR5, with AR6 carried as a secondary basis");
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
    expect(screen.getByTestId("about-links")).toHaveTextContent("Data & API");
  });
  it("every decimal is a string of the release (id, licence names); no avoid-list phrase; the intro link forgets the dismissal", async () => {
    window.localStorage.setItem(INTRO_KEY, "1");
    const { container } = render(
      <Providers>
        <AboutPage />
      </Providers>,
    );
    await screen.findByTestId("about-territories");
    const fromRelease = new Set(JSON.stringify(RELEASE).match(/\d+\.\d+/g) ?? []);
    const tokens = (container.textContent ?? "").match(/\d+\.\d+/g) ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(fromRelease.has(t)).toBe(true);
    expect(avoidPhrasesIn(container.textContent ?? "")).toEqual([]);
    screen.getByTestId("about-intro").click();
    expect(window.localStorage.getItem(INTRO_KEY)).toBeNull();
  });
});
