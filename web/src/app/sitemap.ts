import type { MetadataRoute } from "next";
import { SECTOR_TEXT } from "@/components/methods/sectorText";
import { SITE_URL, sitePaths } from "@/lib/site";

export const dynamic = "force-static";

/** Every page of the export under the site's public address; empty when the build has none. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL) return [];
  return sitePaths(Object.keys(SECTOR_TEXT)).map((path) => ({ url: `${SITE_URL}${path}` }));
}
