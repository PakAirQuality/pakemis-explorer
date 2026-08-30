import "@testing-library/jest-dom/vitest";
/** The round Ask button: toggles the drawer over the bus; hidden while the drawer is open, when the drawer closes itself it returns; absent on /ask. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAsk, openAsk, resetAskBus, subscribeAsk } from "@/lib/askBus";
import { AskFab } from "./AskFab";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

afterEach(() => {
  resetAskBus();
  pathname.value = "/";
});

describe("AskFab", () => {
  it("is the blue round button labelled Ask PakEmis and toggles the drawer on the bus", () => {
    const bus = vi.fn();
    subscribeAsk(bus);
    render(<AskFab />);
    const fab = screen.getByTestId("ask-fab");
    expect(fab).toHaveAttribute("aria-label", "Ask PakEmis");
    expect(fab.className).toContain("fixed bottom-6 right-6");
    expect(fab.className).toContain("rounded-full bg-accent text-on-accent");
    expect(fab.querySelector("svg")).not.toBeNull();
    fireEvent.click(fab);
    expect(bus).toHaveBeenCalledWith({ type: "toggle" });
    // the toggle the button sent also hid it
    expect(screen.queryByTestId("ask-fab")).toBeNull();
  });
  it("hides while the drawer is open and returns when it closes, over the bus", () => {
    render(<AskFab />);
    act(() => openAsk({ question: "Which sector is largest?" }));
    expect(screen.queryByTestId("ask-fab")).toBeNull();
    act(() => closeAsk());
    expect(screen.getByTestId("ask-fab")).toBeInTheDocument();
  });
  it("follows the drawer's own data-open attribute (its X and Escape close it without the bus)", async () => {
    const drawer = document.createElement("aside");
    drawer.setAttribute("data-testid", "ask-drawer");
    drawer.setAttribute("data-open", "1");
    document.body.appendChild(drawer);
    try {
      render(<AskFab />);
      expect(screen.queryByTestId("ask-fab")).toBeNull();
      await act(async () => {
        drawer.setAttribute("data-open", "0");
        await Promise.resolve();
      });
      expect(screen.getByTestId("ask-fab")).toBeInTheDocument();
    } finally {
      drawer.remove();
    }
  });
  it("is absent on the Ask page, where the dock is the page", () => {
    pathname.value = "/ask/";
    render(<AskFab />);
    expect(screen.queryByTestId("ask-fab")).toBeNull();
  });
});
