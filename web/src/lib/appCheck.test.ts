/**
 * The page's half of the bot check: all four build-time values or nothing; inert when unset (no
 * Firebase module is even imported); with them set, the token rides on the header, the client is
 * initialised once however many questions are asked, and a failure to mint sends no header
 * rather than failing the question.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_CHECK_HEADER, resolveAppCheck } from "./appCheck";

const { initializeApp, initializeAppCheck, getToken, ReCaptchaEnterpriseProvider } = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: "app-check" })),
  initializeAppCheck: vi.fn(() => ({ kind: "app-check-instance" })),
  getToken: vi.fn(async () => ({ token: "minted-token" })),
  // constructed with `new`: the mock needs a function, not an arrow
  ReCaptchaEnterpriseProvider: vi.fn(function Provider() {}),
}));
vi.mock("firebase/app", () => ({ initializeApp }));
vi.mock("firebase/app-check", () => ({ initializeAppCheck, getToken, ReCaptchaEnterpriseProvider }));

const ALL = { NEXT_PUBLIC_APPCHECK_SITE_KEY: "site-key", NEXT_PUBLIC_FIREBASE_API_KEY: "browser-key", NEXT_PUBLIC_FIREBASE_APP_ID: "app-id", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "project-id" };

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./appCheck");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("the bot check, on the page", () => {
  it("is configured by all four values or not at all", () => {
    const full = { siteKey: " k ", apiKey: "a", appId: "i", projectId: "p" };
    expect(resolveAppCheck(full)).toEqual({ siteKey: "k", apiKey: "a", appId: "i", projectId: "p" });
    for (const missing of Object.keys(full)) expect(resolveAppCheck({ ...full, [missing]: "" }), missing).toBeNull();
    expect(resolveAppCheck({})).toBeNull();
  });
  it("unset: no header, and the Firebase client is never loaded", async () => {
    const m = await load({});
    expect(m.APP_CHECK_ON).toBe(false);
    expect(await m.appCheckHeaders()).toEqual({});
    expect(initializeApp).not.toHaveBeenCalled();
  });
  it("partly set is unset", async () => {
    const m = await load({ ...ALL, NEXT_PUBLIC_FIREBASE_API_KEY: "" });
    expect(m.APP_CHECK_ON).toBe(false);
    expect(await m.appCheckHeaders()).toEqual({});
    expect(initializeApp).not.toHaveBeenCalled();
  });
  it("set: the token rides on the header, and the client is initialised once", async () => {
    const m = await load(ALL);
    expect(m.APP_CHECK_ON).toBe(true);
    expect(await m.appCheckHeaders()).toEqual({ [APP_CHECK_HEADER]: "minted-token" });
    expect(await m.appCheckHeaders()).toEqual({ [APP_CHECK_HEADER]: "minted-token" });
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeApp).toHaveBeenCalledWith({ apiKey: "browser-key", appId: "app-id", projectId: "project-id" }, "app-check");
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith("site-key");
    expect(getToken).toHaveBeenCalledTimes(2);
  });
  it("a token that cannot be had sends no header instead of failing the question, and the next one tries again", async () => {
    const m = await load(ALL);
    getToken.mockRejectedValueOnce(new Error("blocked"));
    expect(await m.appCheckHeaders()).toEqual({});
    expect(await m.appCheckHeaders()).toEqual({ [APP_CHECK_HEADER]: "minted-token" });
    expect(initializeApp).toHaveBeenCalledTimes(2);
  });
  it("opening the assistant prepares a token and Send shares the in-flight assessment", async () => {
    const m = await load(ALL);
    let finish!: (v: { token: string }) => void;
    getToken.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    m.prepareAppCheck();
    const send = m.appCheckHeaders();
    await vi.waitFor(() => expect(getToken).toHaveBeenCalledTimes(1));
    finish({ token: "prepared" });
    expect(await send).toEqual({ [APP_CHECK_HEADER]: "prepared" });
    expect(getToken).toHaveBeenCalledTimes(1);
    // Later calls use the SDK again so it can enforce expiry and refresh.
    expect(await m.appCheckHeaders()).toEqual({ [APP_CHECK_HEADER]: "minted-token" });
  });
});
