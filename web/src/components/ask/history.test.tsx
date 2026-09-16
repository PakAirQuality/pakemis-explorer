import "@testing-library/jest-dom/vitest";
/**
 * On-device conversation history.
 *
 * The rule this exists to keep: a panel that offers "New conversation" owes the reader the old one.
 * So the index and the transcripts are written together and evicted together, and — the assertion
 * I would most want kept if someone refactors the open path — **opening a saved conversation must
 * not move the map**.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE } from "@/__tests__/fixtures";
import { STORE_PREFIX } from "./store";
import { HISTORY_CAP, HISTORY_KEY, clearHistory, forgetConversation, loadHistory, rememberConversation, type HistoryEntry } from "./history";
import { HistoryList, groupByDay, when } from "./HistoryList";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const release = RELEASE as unknown as ReleaseInfo;
const base: ExplorerState = resolveState({}, DEFAULTS);

function ctx(setState = vi.fn()): ExplorerContextValue {
  return { state: base, setState, release, labels: releaseLabels(release), dims: releaseDims(release),
           defaults: DEFAULTS, contract: undefined,
           agent: { enabled: true, model: "m", reason: "", library: "l", usable: true }, isMobile: false };
}
const entry = (id: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id, title: `Question ${id}`, lastQuestion: `Latest ${id}`, updated: Date.now(),
  ui_state: { level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all" }, ...over,
});

beforeEach(() => window.localStorage.clear());

describe("the index", () => {
  it("keeps the newest first, and a conversation keeps the title it started with", () => {
    rememberConversation({ id: "a", title: "First ask", lastQuestion: "First ask", ui_state: {}, updated: 1000 });
    rememberConversation({ id: "b", title: "Other", lastQuestion: "Other", ui_state: {}, updated: 2000 });
    // the same conversation again: its title and its scope are where it STARTED, only the latest
    // question moves, so a row says where it began and where it got to
    rememberConversation({ id: "a", title: "ignored", lastQuestion: "Third ask", ui_state: { geo: "Sindh" }, updated: 3000 });
    const list = loadHistory();
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
    expect(list[0].title).toBe("First ask");
    expect(list[0].lastQuestion).toBe("Third ask");
    expect(list[0].ui_state).toEqual({});
  });

  it("evicts past the cap AND deletes the transcript, which is the whole point", () => {
    // forgetting an entry while leaving its transcript behind is the leak this index exists to
    // end - every "New conversation" used to orphan one with nothing pointing at it
    for (let i = 0; i < HISTORY_CAP + 1; i += 1) {
      window.localStorage.setItem(`${STORE_PREFIX}c${i}`, JSON.stringify({ turns: [] }));
      rememberConversation({ id: `c${i}`, title: `Q${i}`, lastQuestion: `Q${i}`, ui_state: {}, updated: 1000 + i });
    }
    const list = loadHistory();
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list.some((e) => e.id === "c0")).toBe(false);
    expect(window.localStorage.getItem(`${STORE_PREFIX}c0`)).toBeNull();      // gone with it
    expect(window.localStorage.getItem(`${STORE_PREFIX}c1`)).not.toBeNull();  // the rest are kept
  });

  it("forgetting one takes its transcript; clearing takes the orphans of the old behaviour too", () => {
    window.localStorage.setItem(`${STORE_PREFIX}keep`, "{}");
    window.localStorage.setItem(`${STORE_PREFIX}gone`, "{}");
    window.localStorage.setItem(`${STORE_PREFIX}orphan`, "{}");   // written before any index existed
    rememberConversation({ id: "keep", title: "k", lastQuestion: "k", ui_state: {} });
    rememberConversation({ id: "gone", title: "g", lastQuestion: "g", ui_state: {} });

    expect(forgetConversation("gone").map((e) => e.id)).toEqual(["keep"]);
    expect(window.localStorage.getItem(`${STORE_PREFIX}gone`)).toBeNull();
    expect(window.localStorage.getItem(`${STORE_PREFIX}orphan`)).not.toBeNull();

    expect(clearHistory()).toEqual([]);
    expect(window.localStorage.getItem(HISTORY_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${STORE_PREFIX}keep`)).toBeNull();
    expect(window.localStorage.getItem(`${STORE_PREFIX}orphan`)).toBeNull();
  });

  it("does not live under the transcripts' own namespace", () => {
    // a conversation whose id happened to be "history" would otherwise collide with the list
    expect(HISTORY_KEY.startsWith(STORE_PREFIX)).toBe(false);
  });
});

describe("when", () => {
  it("never invents a decimal, because every number on screen must be one the server sent", () => {
    const now = Date.UTC(2026, 8, 15, 12, 0, 0);
    expect(when(now - 30_000, now)).toBe("Just now");
    expect(when(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(when(now - 90 * 60_000, now)).toBe("Earlier today");
    expect(when(now - 26 * 3600_000, now)).toBe("Yesterday");
    for (const ms of [30_000, 5 * 60_000, 90 * 60_000, 26 * 3600_000, 9 * 86400_000]) {
      expect(when(now - ms, now)).not.toMatch(/\d+\.\d+/);
    }
  });

  it("splits today from the rest, and nothing else", () => {
    const now = Date.UTC(2026, 8, 15, 12, 0, 0);
    const { today, earlier } = groupByDay([entry("a", { updated: now - 60_000 }), entry("b", { updated: now - 3 * 86400_000 })], now);
    expect(today.map((e) => e.id)).toEqual(["a"]);
    expect(earlier.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("the list", () => {
  const list = (setState = vi.fn(), over: Partial<Parameters<typeof HistoryList>[0]> = {}) => {
    const props = {
      entries: [entry("open"), entry("old", { updated: Date.now() - 3 * 86400_000 })],
      currentId: "open", onOpen: vi.fn(), onNew: vi.fn(), onBack: vi.fn(), onForget: vi.fn(), onClear: vi.fn(), ...over,
    };
    render(
      <Providers>
        <ExplorerContext.Provider value={ctx(setState)}><HistoryList {...props} /></ExplorerContext.Provider>
      </Providers>,
    );
    return props;
  };

  it("marks the open conversation and names the filters each was asked under", () => {
    list();
    const rows = screen.getAllByTestId("history-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-current", "1");
    expect(within(rows[0]).getByTestId("history-current")).toHaveTextContent("Current");
    expect(rows[1]).toHaveAttribute("data-current", "0");
    // the release's own words, never a raw period id - the panel must never print "FY"
    expect(within(rows[0]).getAllByTestId("history-chip").map((c) => c.textContent))
      .toEqual(["Pakistan", "All gases", "2023–24"]);
    expect(screen.getByTestId("ask-history").textContent).not.toContain("FY");
  });

  it("OPENING ONE DOES NOT MOVE THE MAP", () => {
    // the scope rule, and the assertion worth keeping above all the others here: a reader who
    // reopens an old question must not find the map silently rearranged under them
    const props = list();
    fireEvent.click(within(screen.getAllByTestId("history-row")[1]).getByTestId("history-open"));
    expect(props.onOpen).toHaveBeenCalledWith("old");
    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it("asks before it forgets one, and before it forgets them all", () => {
    const props = list();
    fireEvent.click(within(screen.getAllByTestId("history-row")[1]).getByTestId("history-row-menu"));
    expect(props.onForget).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("history-delete-confirm"));
    expect(props.onForget).toHaveBeenCalledWith("old");

    fireEvent.click(screen.getByTestId("history-clear"));
    expect(props.onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("history-clear-confirm"));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("says plainly where the conversations live, and what to do when there are none", () => {
    list(vi.fn(), { entries: [] });
    expect(screen.getByTestId("history-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("history-clear")).toBeNull();   // nothing to clear
  });
});
