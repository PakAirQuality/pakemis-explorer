/**
 * A selection that changes while its request is in flight: the superseded request is ABORTED, the
 * new selection never shows the old one's numbers, and an answer that arrives late lands nowhere
 * a reader can see.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { envelope } from "@/__tests__/fixtures";
import { useAir } from "./queries";

type Pending = { body: { periods?: string[] }; signal: AbortSignal | null; resolve: (payload: unknown) => void };

function deferredFetch() {
  const pending: Pending[] = [];
  const fetchSpy = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = (init?.signal as AbortSignal | undefined) ?? null;
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        pending.push({ body: JSON.parse(String(init?.body)), signal, resolve: (payload) => resolve({ ok: true, status: 200, statusText: "OK", json: async () => payload } as Response) });
      }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  return pending;
}

const cell = (display: string) => envelope([{ display, display_short: display, unit: "kt PM2.5", unit_short: "kt PM₂.₅" }], { request_type: "query_air" });

afterEach(() => vi.unstubAllGlobals());

describe("out-of-order responses", () => {
  it("a newer selection aborts the older request and never shows its answer", async () => {
    const pending = deferredFetch();
    const { result, rerender } = renderHook(({ period }: { period: string }) => useAir({ pollutants: ["PM2.5"], periods: [period] }), { wrapper: Providers, initialProps: { period: "FY2020-21" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    // the reader moves the year before the first answer is back
    rerender({ period: "FY2023-24" });
    await waitFor(() => expect(pending).toHaveLength(2));
    // the request for the selection that is no longer on screen has been cancelled...
    expect(pending[0].signal).not.toBeNull();
    expect(pending[0].signal!.aborted).toBe(true);
    expect(pending[1].signal!.aborted).toBe(false);
    // ...and while the new one is pending nothing is shown: no old number under the new label
    expect(result.current.data).toBeUndefined();
    // the OLD answer arrives late; it must not become what the new selection displays
    await act(async () => {
      pending[0].resolve(cell("600.10"));
      await Promise.resolve();
    });
    expect(result.current.data).toBeUndefined();
    // then the new one answers, and that is what is shown
    await act(async () => pending[1].resolve(cell("771.87")));
    await waitFor(() => expect(result.current.data?.values[0].display).toBe("771.87"));
    expect(pending[1].body.periods).toEqual(["FY2023-24"]);
  });
  it("answers arriving in the wrong order still land on their own selections", async () => {
    const pending = deferredFetch();
    const { result, rerender } = renderHook(({ period }: { period: string }) => useAir({ pollutants: ["PM2.5"], periods: [period] }), { wrapper: Providers, initialProps: { period: "FY2020-21" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ period: "FY2023-24" });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].resolve(cell("771.87")));
    await waitFor(() => expect(result.current.data?.values[0].display).toBe("771.87"));
    // going back to the first year asks again (its request was aborted, nothing was cached for it)
    rerender({ period: "FY2020-21" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => pending[2].resolve(cell("600.10")));
    await waitFor(() => expect(result.current.data?.values[0].display).toBe("600.10"));
  });
});
