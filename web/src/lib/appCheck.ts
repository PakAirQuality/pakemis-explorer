/**
 * The page's half of the bot check on the assistant (the API's half is appcheck.py).
 *
 * An open API cannot tell this page from a script, and the assistant is the one route where the
 * difference costs money. With Firebase App Check the page obtains a short-lived token — granted
 * on a reCAPTCHA assessment made in this browser — and sends it with each question; the API
 * verifies it and, when the deployment enforces the check, refuses a request that carries none.
 *
 * FOUR BUILD-TIME VALUES, ALL OR NOTHING: the reCAPTCHA Enterprise site key and the Firebase web
 * app's `apiKey`, `appId` and `projectId`. All four are identifiers a browser is meant to hold;
 * none is a secret. With any one missing the module is inert — `appCheckHeaders()` answers `{}`
 * and nothing is loaded — which is the repository's default and what every local build is.
 *
 * LOADED ON THE FIRST QUESTION, NOT WITH THE PAGE. The Firebase client is imported inside
 * `appCheckHeaders`, so a reader who never opens the assistant never downloads it and the map is
 * no heavier for the check existing.
 *
 * A FAILURE TO MINT IS THE SERVER'S TO JUDGE. If the token cannot be had (an ad blocker, a
 * network that drops Google), the question is sent without one: a deployment that only reports
 * still answers, and one that enforces refuses with its own sentence, which the assistant shows.
 */
export const APP_CHECK_HEADER = "X-Firebase-AppCheck";

type Env = { siteKey?: string; apiKey?: string; appId?: string; projectId?: string };
export type AppCheckConfig = { siteKey: string; apiKey: string; appId: string; projectId: string };

/** The four values, or null unless every one is present. */
export function resolveAppCheck(env: Env): AppCheckConfig | null {
  const v = { siteKey: env.siteKey?.trim() ?? "", apiKey: env.apiKey?.trim() ?? "", appId: env.appId?.trim() ?? "", projectId: env.projectId?.trim() ?? "" };
  return v.siteKey && v.apiKey && v.appId && v.projectId ? v : null;
}

// Next.js inlines NEXT_PUBLIC_* only when each is read as a literal `process.env.NAME`.
const CONFIG = resolveAppCheck({
  siteKey: process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
export const APP_CHECK_ON = CONFIG !== null;

/** Mints a token from the one App Check instance this page holds. */
type Minter = () => Promise<string>;
let minter: Promise<Minter> | null = null;

function minterFor(config: AppCheckConfig): Promise<Minter> {
  minter ??= (async () => {
    const [{ initializeApp }, { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken }] = await Promise.all([import("firebase/app"), import("firebase/app-check")]);
    // a named app: this page holds no other Firebase app, and should not become one's default
    const app = initializeApp({ apiKey: config.apiKey, appId: config.appId, projectId: config.projectId }, "app-check");
    const check = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.siteKey), isTokenAutoRefreshEnabled: true });
    return async () => (await getToken(check, false)).token;
  })();
  return minter;
}

/** The header to send with a question: the token when the check is configured and one can be had, else nothing. */
export async function appCheckHeaders(): Promise<Record<string, string>> {
  if (!CONFIG) return {};
  try {
    const token = await (await minterFor(CONFIG))();
    return token ? { [APP_CHECK_HEADER]: token } : {};
  } catch {
    minter = null; // let the next question try again from the start
    return {};
  }
}
