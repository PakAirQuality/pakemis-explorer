import "@testing-library/jest-dom/vitest";
/**
 * The nav capsule: the oxblood pill with the PAQI logo alone as the brand mark (no wordmark),
 * the three sections — Explore · Methods · Downloads — in order with the current one
 * marked and underlined in saffron, and "Ask about this view" at its right end, which toggles
 * the drawer on the bus or calls a page's own handler. On the workspace it floats at the deck's
 * own left inset; everywhere else the same pill sits in a header row.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resetAskBus, subscribeAsk } from "@/lib/askBus";
import { CAPSULE_CLASS, isActive, NAV_LINKS, NavCapsule, NavHeader } from "./NavCapsule";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

describe("NavCapsule", () => {
  it("lists Explore, Methods, Downloads, at the deck's width, and offers no Ask action", () => {
    pathname.value = "/";
    resetAskBus();
    const bus = vi.fn();
    subscribeAsk(bus);
    render(<NavCapsule floating />);
    expect(screen.getByTestId("nav-capsule").className).toContain("w-[420px]");   // the deck's width: both edges line up
    const links = screen.getAllByTestId("nav-link");
    // Analyze was removed on 2026-09-16: the assistant answers what the page was built for
    expect(links.map((a) => a.textContent)).toEqual(["Explore", "Methods", "Downloads"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/methods", "/downloads"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(NAV_LINKS.map((l) => l.href));
    // THE LINKS SPREAD, THEY DO NOT BUNCH. The capsule is pinned to the deck's 420 px so their
    // edges line up, and the sections used to be pushed against the right end by justify-between -
    // which looked deliberate at four and lopsided the moment Analyze left at three. The nav grows
    // into the space instead, so the spacing survives the next section being added or removed.
    const sections = screen.getByLabelText("Sections");
    expect(sections.className).toContain("grow");
    expect(sections.className).toContain("justify-evenly");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    // the assistant has one entry only, the round button at the bottom left; the capsule offers it nowhere
    expect(screen.queryByTestId("nav-ask")).toBeNull();
    expect(bus).not.toHaveBeenCalled();
    // the brand mark is the logo alone: a link to /, no wordmark
    const brand = screen.getByTestId("brand");
    expect(brand).toHaveAttribute("href", "/");
    expect(brand.textContent).toBe("");
    expect(brand.children).toHaveLength(1);
    const logo = screen.getByAltText("Pakistan Air Quality Initiative");
    expect(logo).toHaveAttribute("src", "/brand/paqi-logo.png");
    expect(logo.className).toContain("h-7");
    // the active section carries the 2 px oxblood underline, and only it
    const underlines = screen.getAllByTestId("nav-underline");
    expect(underlines).toHaveLength(1);
    expect(links[0]).toContainElement(underlines[0]);
    expect(underlines[0].className).toContain("h-0.5");
    expect(underlines[0].className).toContain("bg-accent");   // oxblood, legible on the ivory pill
    expect(document.body.textContent).not.toContain("1.0.0rc");
  });
  it("the pill is warm ivory with charcoal text, and floats at the deck's left inset on the workspace", () => {
    pathname.value = "/";
    const { unmount } = render(<NavCapsule floating />);
    const capsule = screen.getByTestId("nav-capsule");
    for (const c of ["absolute", "left-5", "top-5", "z-30", "rounded-full", "bg-nav", "text-nav-fg", "border-nav-line", "shadow-lg", "px-5", "py-2.5", "flex", "items-center", "gap-6"]) expect(capsule.className, c).toContain(c);
    unmount();
    // docked: the same pill, in a normal header row at the top of the page
    render(<NavHeader />);
    const docked = screen.getByTestId("nav-capsule");
    expect(docked.className).not.toContain("absolute");
    for (const c of CAPSULE_CLASS.split(" ")) expect(docked.className, c).toContain(c);
    expect(screen.getByTestId("top-nav")).toContainElement(docked);
  });
  it("marks the current page with or without the export's trailing slash", () => {
    expect(isActive("/data/", "/data")).toBe(true);
    expect(isActive("/data", "/data")).toBe(true);
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/data", "/")).toBe(false);
    expect(isActive(null, "/")).toBe(true);
    pathname.value = "/methods/";
    render(<NavCapsule />);
    const methods = screen.getAllByTestId("nav-link").find((a) => a.textContent === "Methods")!;
    expect(methods).toHaveAttribute("aria-current", "page");
    expect(methods).toContainElement(screen.getByTestId("nav-underline"));
  });
  it("a page may put its own controls in the capsule's slot", () => {
    pathname.value = "/";
    render(<NavHeader><span data-testid="slot">slot</span></NavHeader>);
    expect(screen.getByTestId("slot")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-ask")).toBeNull();
  });
});
