import "@testing-library/jest-dom/vitest";
/** The TopNav: the PAQI logo alone as the brand mark (no wordmark, no hairline), the five sections in order, the current one marked and underlined, the Ask button as a link or the Map page's toggle, the mobile menu. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resetAskBus, subscribeAsk } from "@/lib/askBus";
import { isActive, NAV_LINKS, TopNav } from "./TopNav";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

describe("TopNav", () => {
  it("lists Overview, Explore data, Map, Methods & evidence, Downloads; Ask about this view toggles the drawer on the bus", () => {
    pathname.value = "/";
    resetAskBus();
    const bus = vi.fn();
    subscribeAsk(bus);
    render(<TopNav />);
    const links = screen.getAllByTestId("nav-link");
    expect(links.map((a) => a.textContent)).toEqual(["Overview", "Explore data", "Map", "Methods & evidence", "Downloads"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(NAV_LINKS.map((l) => l.href));
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[2]).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("nav-ask").tagName).toBe("BUTTON");
    fireEvent.click(screen.getByTestId("nav-ask"));
    expect(bus).toHaveBeenCalledWith({ type: "toggle" });
    // the brand mark is the logo alone: a link to /, no wordmark and no hairline beside it
    const brand = screen.getByTestId("brand");
    expect(brand).toHaveAttribute("href", "/");
    expect(brand.textContent).toBe("");
    expect(brand.querySelectorAll("span")).toHaveLength(0);
    expect(brand.children).toHaveLength(1);
    const logo = screen.getByAltText("Pakistan Air Quality Initiative");
    expect(logo).toHaveAttribute("src", "/brand/paqi-logo.png");
    expect(logo.className).toContain("h-8");
    expect(screen.getByTestId("brand")).toContainElement(logo);
    const underlines = screen.getAllByTestId("nav-underline");
    expect(underlines).toHaveLength(1);
    expect(links[0]).toContainElement(underlines[0]);
    expect(underlines[0].style.background).toContain("#ffb313");
    expect(document.body.textContent).not.toContain("1.0.0rc");
  });
  it("marks the current page with or without the export's trailing slash", () => {
    expect(isActive("/map/", "/map")).toBe(true);
    expect(isActive("/map", "/map")).toBe(true);
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/map", "/")).toBe(false);
    expect(isActive(null, "/")).toBe(true);
    pathname.value = "/methods/";
    render(<TopNav />);
    const methods = screen.getAllByTestId("nav-link").find((a) => a.textContent === "Methods & evidence")!;
    expect(methods).toHaveAttribute("aria-current", "page");
    expect(methods).toContainElement(screen.getByTestId("nav-underline"));
  });
  it("on the Map page the Ask button is the drawer toggle, and the slot carries the page's controls", () => {
    const onAsk = vi.fn();
    render(
      <TopNav compact onAsk={onAsk}>
        <span data-testid="slot">tabs</span>
      </TopNav>,
    );
    fireEvent.click(screen.getByTestId("nav-ask"));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("nav-ask").tagName).toBe("BUTTON");
    expect(screen.getByTestId("slot")).toBeInTheDocument();
  });
  it("the mobile menu opens and lists the same sections", () => {
    render(<TopNav />);
    expect(screen.queryByTestId("nav-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("nav-menu-button"));
    const menu = screen.getByTestId("nav-menu");
    expect(Array.from(menu.querySelectorAll("a")).map((a) => a.textContent)).toEqual(["Overview", "Explore data", "Map", "Methods & evidence", "Downloads"]);
    fireEvent.click(menu.querySelector("a")!);
    expect(screen.queryByTestId("nav-menu")).toBeNull();
  });
});
