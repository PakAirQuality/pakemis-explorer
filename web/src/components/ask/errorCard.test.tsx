/**
 * The error cards. `budget_exhausted` covered two different situations - this conversation is
 * full, or the whole day's shared budget is gone - and titled both "the token budget is spent",
 * so a reader could not tell whether starting a new conversation would help. Neither branch, nor
 * `turn_limit`, had a single test; the screenshot that prompted this fix showed both codes.
 */
import { describe, expect, it } from "vitest";
import { errorTitle, ERROR_TITLES } from "./ReasoningTimeline";
import { timelineOf } from "./timeline";
import type { AskEvent, TimelineItem } from "./types";

const items = (events: [string, unknown][]): TimelineItem[] =>
  timelineOf(events.map(([name, data]): AskEvent => ({ name, data }))).items;

describe("budget_exhausted names WHICH budget", () => {
  it("distinguishes a full conversation from a spent day", () => {
    expect(errorTitle("budget_exhausted", "conversation")).toContain("this conversation");
    expect(errorTitle("budget_exhausted", "daily")).toContain("today's");
    expect(errorTitle("budget_exhausted", "conversation")).not.toEqual(
      errorTitle("budget_exhausted", "daily"),
    );
  });

  it("still titles the code when the server sends no scope", () => {
    expect(errorTitle("budget_exhausted")).toEqual(ERROR_TITLES.budget_exhausted);
    expect(errorTitle("budget_exhausted", "something_new")).toEqual(ERROR_TITLES.budget_exhausted);
  });

  it("carries the scope from the stream to the card", () => {
    const tl = items([
      ["status", { phase: "model", turn: 1 }],
      [
        "error",
        {
          code: "budget_exhausted",
          scope: "conversation",
          message: "this conversation has spent its token budget; start a new one to carry on",
        },
      ],
    ]);
    const err = tl.find((i) => i.kind === "error");
    expect(err).toBeDefined();
    if (err?.kind !== "error") throw new Error("not an error item");
    expect(err.scope).toEqual("conversation");
    expect(errorTitle(err.code, err.scope)).toContain("this conversation");
    // the remedy is on the card, not only in the title
    expect(err.message).toContain("start a new one");
  });
});

describe("turn_limit", () => {
  it("has a title of its own rather than the bare code", () => {
    expect(errorTitle("turn_limit")).toEqual(ERROR_TITLES.turn_limit);
    expect(errorTitle("turn_limit")).not.toEqual("turn limit");
  });

  it("falls back to the humanised code for something unknown", () => {
    expect(errorTitle("some_new_code")).toEqual("some new code");
  });
});
