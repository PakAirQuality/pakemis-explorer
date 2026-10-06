/**
 * A selection that changes while its request is in flight: the superseded request is ABORTED, the
 * new selection never shows the old one's numbers, and an answer that arrives late lands nowhere
 * a reader can see.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { echoing, envelope } from "@/__tests__/fixtures";
import { RefusalError } from "./api";
import { useAir } from "./queries";

type Pending = { body: { periods?: string[] }; signal: AbortSignal | null; resolve: (payload: unknown) => void };

function deferredFetch() {
  const pending: Pending[] = [];
  const fetchSpy = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = (init?.signal as AbortSignal | undefined) ?? null;
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        const body = JSON.parse(String(init?.body));
        // like the API, an answer says which request it is for - unless the test wrote its own echo
        pending.push({ body, signal, resolve: (payload) => resolve({ ok: true, status: 200, statusText: "OK", json: async () => echoing(String(url), body, payload) } as Response) });
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

/**
 * The keys above keep a late answer out of the wrong cache entry. This is the other half: an answer
 * that arrives ON TIME, for the right request as far as the network is concerned, and is not the
 * answer to it. It becomes an error, with no data, so there is nothing to print under the heading.
 */
describe("an answer that is not the answer to what was asked", () => {
  const asked = { pollutants: ["PM2.5"], periods: ["FY2020-21"] };
  const answering = (request: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
    envelope([{ display: "821.18", unit: "kt PM2.5" }], { request_type: "query_air", request: JSON.stringify({ _type: "QueryAir", ...request }), ...overrides });

  it("another year's answer is refused, not shown under this year", async () => {
    const pending = deferredFetch();
    const { result } = renderHook(() => useAir(asked), { wrapper: Providers });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].resolve(answering({ pollutants: ["PM2.5"], periods: ["FY2023-24"] })));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(RefusalError);
    expect((result.current.error as RefusalError).refusal).toMatchObject({ error: "response_mismatch", detail: { path: "periods", asked: ["FY2020-21"], answered: ["FY2023-24"] } });
  });
  it("an answer read from the single-year air layer is refused whatever it echoes", async () => {
    const pending = deferredFetch();
    const { result } = renderHook(() => useAir(asked), { wrapper: Providers });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].resolve(answering(asked, { context: { ...envelope([]).context, periods: ["FY2020-21"] }, calculation: { kind: "sum", table: "fact_air_annual" } })));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as RefusalError).refusal.detail).toMatchObject({ path: "calculation.table", answered: "fact_air_annual" });
  });
});
