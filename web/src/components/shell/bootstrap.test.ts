/** The bootstrap store: stages marked once, never backwards, late subscribers read them; the page's stages and the bar's width. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { finishedFor, getBootstrap, markStage, progressFor, resetBootstrap, STAGE_PERCENT, stagesFor, subscribeBootstrap, type Stage } from "./bootstrap";

afterEach(() => resetBootstrap());

describe("bootstrap store", () => {
  it("marks a stage once and tells its subscribers", () => {
    const l = vi.fn();
    subscribeBootstrap(l);
    markStage("release");
    markStage("release");
    expect(l).toHaveBeenCalledTimes(1);
    expect(Array.from(getBootstrap().reached)).toEqual(["release"]);
    markStage("unknown" as Stage);
    expect(l).toHaveBeenCalledTimes(1);
    expect(getBootstrap().reached.size).toBe(1);
  });
  it("a late subscriber reads the stages already reached; unsubscribe stops the calls", () => {
    markStage("release");
    markStage("labels");
    const l = vi.fn();
    const off = subscribeBootstrap(l);
    expect(getBootstrap().reached.has("labels")).toBe(true);
    off();
    markStage("map");
    expect(l).not.toHaveBeenCalled();
    expect(getBootstrap().reached.has("map")).toBe(true);
  });
  it("the pages' stages: the envelope and the map on the workspace, the envelope on /data, the labels elsewhere (the redirect stubs included)", () => {
    expect(stagesFor("/")).toEqual(["release", "labels", "envelope", "map"]);
    expect(stagesFor("/data/")).toEqual(["release", "labels", "envelope"]);
    expect(stagesFor("/methods/")).toEqual(["release", "labels"]);
    expect(stagesFor("/map/")).toEqual(["release", "labels"]);
    expect(stagesFor("/explore")).toEqual(["release", "labels"]);
    expect(stagesFor(null)).toEqual(["release", "labels", "envelope", "map"]);
  });
  it("progress is the furthest of the page's stages, and finished is its last one", () => {
    const reached = new Set<Stage>();
    const home = stagesFor("/");
    expect(progressFor(reached, home)).toBe(0);
    reached.add("release");
    expect(progressFor(reached, home)).toBe(STAGE_PERCENT.release);
    reached.add("envelope");
    expect(progressFor(reached, home)).toBe(STAGE_PERCENT.envelope);
    expect(finishedFor(reached, home)).toBe(false);
    expect(finishedFor(reached, stagesFor("/data"))).toBe(true);
    // a stage the page does not wait for does not move its bar
    expect(progressFor(new Set<Stage>(["map"]), stagesFor("/data"))).toBe(0);
    reached.add("map");
    expect(progressFor(reached, home)).toBe(100);
    expect(finishedFor(reached, home)).toBe(true);
  });
});
