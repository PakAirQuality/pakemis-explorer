/** The Ask bus: open/close/toggle reach every subscriber; a request raised before any subscriber waits for the first one. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeAsk, openAsk, resetAskBus, subscribeAsk, toggleAsk } from "./askBus";

beforeEach(() => resetAskBus());

describe("askBus", () => {
  it("delivers open, close and toggle to every subscriber, and stops after unsubscribe", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAsk(a);
    subscribeAsk(b);
    openAsk({ question: "How certain is this?", scope: { geo: "Punjab" } });
    closeAsk();
    toggleAsk();
    expect(a.mock.calls.map((c) => c[0])).toEqual([{ type: "open", request: { question: "How certain is this?", scope: { geo: "Punjab" } } }, { type: "close" }, { type: "toggle" }]);
    expect(b).toHaveBeenCalledTimes(3);
    offA();
    openAsk();
    expect(a).toHaveBeenCalledTimes(3);
    expect(b).toHaveBeenCalledTimes(4);
    expect(b).toHaveBeenLastCalledWith({ type: "open", request: {} });
  });
  it("keeps a request raised before any subscriber and hands it to the first one, once", () => {
    openAsk({ question: "What is Pakistan's largest source?" });
    const a = vi.fn();
    subscribeAsk(a);
    expect(a).toHaveBeenCalledWith({ type: "open", request: { question: "What is Pakistan's largest source?" } });
    const b = vi.fn();
    subscribeAsk(b);
    expect(b).not.toHaveBeenCalled();
  });
  it("only the last pending event survives while nobody listens", () => {
    openAsk({ question: "first" });
    closeAsk();
    const a = vi.fn();
    subscribeAsk(a);
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith({ type: "close" });
  });
});
