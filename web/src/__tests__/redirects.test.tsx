import "@testing-library/jest-dom/vitest";
/**
 * The routes that moved are client-side redirect stubs (the static export has no server
 * redirects): /about → /methods, /map → / (the workspace absorbed the map on 2026-08-30) and
 * /explore → /data (the Grapher moved there). Each carries its query string and hash across, so
 * a shared `/map?level=adm2&geo=…` link opens the same view on the workspace.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AboutRedirect from "@/app/about/page";
import MapRedirect from "@/app/map/page";
import ExploreRedirect from "@/app/explore/page";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace }) }));

beforeEach(() => replace.mockClear());

describe("redirect stubs", () => {
  it("/about replaces itself with /methods and offers the link", () => {
    window.history.replaceState({}, "", "/about/");
    render(<AboutRedirect />);
    expect(replace).toHaveBeenCalledWith("/methods");
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/methods");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/methods");
  });
  it("/map carries the whole view across to the workspace", () => {
    window.history.replaceState({}, "", "/map/?level=adm2&geo=Punjab&sector=power");
    render(<MapRedirect />);
    expect(replace).toHaveBeenCalledWith("/?level=adm2&geo=Punjab&sector=power");
    expect(screen.getByTestId("redirect")).toHaveAttribute("data-to", "/");
    expect(screen.getByRole("link")).toHaveTextContent("Explore");
    window.history.replaceState({}, "", "/");
  });
  it("/explore replaces itself with /data, hash and all", () => {
    window.history.replaceState({}, "", "/explore/?sector=transport#x");
    render(<ExploreRedirect />);
    expect(replace).toHaveBeenCalledWith("/data?sector=transport#x");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/data");
    window.history.replaceState({}, "", "/");
  });
});
