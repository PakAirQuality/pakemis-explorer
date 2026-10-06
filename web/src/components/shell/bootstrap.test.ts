/**
 * The bootstrap store: stages marked once, never backwards, late subscribers read them; the page's
 * stages and the bar's width; and a stage that FAILED (the map, with no WebGL) is one the page
 * stops waiting for without being counted as reached.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { finishedFor, getBootstrap, markFailed, markStage, progressFor, resetBootstrap, STAGE_PERCENT, stagesFor, subscribeBootstrap, type Stage } from "./bootstrap";

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
  it("a failed stage is recorded once beside the reached ones, told to subscribers, and never moves the bar", () => {
    const l = vi.fn();
    subscribeBootstrap(l);
    markFailed("map");
    markFailed("map");
    markFailed("unknown" as Stage);
    expect(l).toHaveBeenCalledTimes(1);
    expect(Array.from(getBootstrap().failed)).toEqual(["map"]);
    expect(getBootstrap().reached.size).toBe(0);
    expect(progressFor(getBootstrap().reached, stagesFor("/"))).toBe(0);
  });
  it("the page stops waiting for a failed stage: it finishes at the last stage that can still happen, not before", () => {
    const home = stagesFor("/");
    const failed = new Set<Stage>(["map"]);
    // the map is dead and the envelope has not answered: the deck is still worth waiting for
    expect(finishedFor(new Set<Stage>(["release", "labels"]), home, failed)).toBe(false);
    expect(finishedFor(new Set<Stage>(["release", "labels", "envelope"]), home, failed)).toBe(true);
    // without the failure the same stages are not a finish, and no failure set reads as none
    expect(finishedFor(new Set<Stage>(["release", "labels", "envelope"]), home)).toBe(false);
    expect(finishedFor(new Set<Stage>(["release", "labels", "envelope"]), home, new Set<Stage>())).toBe(false);
    // a page that never waited for the map is indifferent to its failure
    expect(finishedFor(new Set<Stage>(["release", "labels"]), stagesFor("/methods"), failed)).toBe(true);
    expect(finishedFor(new Set<Stage>(["release"]), stagesFor("/methods"), failed)).toBe(false);
  });
  it("what has happened cannot fail, and a failed stage that then happens (a retry that worked) has happened", () => {
    markStage("map");
    markFailed("map");
    expect(getBootstrap().failed.size).toBe(0);
    resetBootstrap();
    markFailed("map");
    expect(getBootstrap().failed.has("map")).toBe(true);
    markStage("map");
    expect(getBootstrap().reached.has("map")).toBe(true);
    expect(getBootstrap().failed.size).toBe(0);
    resetBootstrap();
    expect(getBootstrap().failed.size).toBe(0);
  });
});
