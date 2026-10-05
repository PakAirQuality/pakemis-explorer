/**
 * The site's own public address, when a build has one: `NEXT_PUBLIC_SITE_URL` (an origin such as
 * `https://emissions.example.org`, no path). It is what the canonical link, the sitemap and the
 * robots file are written from. Unset — a local build, or one embedded in somebody else's
 * dashboard — the page claims no address and asks not to be indexed.
 *
 * It exists because one Hosting site answers under more than one name (its custom domain and its
 * own *.web.app name) and Hosting cannot redirect by hostname: the canonical link is what tells a
 * crawler the two are one page.
 */
export function resolveSiteUrl(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

// Next.js inlines NEXT_PUBLIC_* only when each is read as a literal `process.env.NAME`.
export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/**
 * The pages a reader can land on, as the static export serves them (trailing slash). The redirect
 * stubs (/about, /analyze, /explore, /map) are left out: they are old addresses, not pages.
 */
export function sitePaths(sectors: readonly string[]): string[] {
  return [
    "/",
    "/ask/",
    "/data/",
    "/data-library/",
    "/downloads/",
    "/methodology/",
    "/methods/",
    "/methods/evidence/",
    "/methods/sectors/",
    ...sectors.map((sector) => `/methods/sectors/${sector}/`),
  ];
}
