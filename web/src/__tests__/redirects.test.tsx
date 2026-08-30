import "@testing-library/jest-dom/vitest";
/** /about and /data are client-side redirect stubs (the static export has no server redirects); /data carries its ?receipt= across. */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AboutRedirect from "@/app/about/page";
import DataRedirect from "@/app/data/page";

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
  it("/data?receipt=<hash> replaces itself with /downloads?receipt=<hash>", () => {
    window.history.replaceState({}, "", "/data/?receipt=0123456789abcdef0123456789abcdef#x");
    render(<DataRedirect />);
    expect(replace).toHaveBeenCalledWith("/downloads?receipt=0123456789abcdef0123456789abcdef#x");
    window.history.replaceState({}, "", "/");
  });
});
