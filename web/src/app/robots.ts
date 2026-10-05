import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** A build with a public address invites indexing and names its sitemap; one without asks for none. */
export default function robots(): MetadataRoute.Robots {
  if (!SITE_URL) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` };
}
