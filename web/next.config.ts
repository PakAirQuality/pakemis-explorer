import type { NextConfig } from "next";

/**
 * A static export: `next build` writes out/ (/, /data/, /about/, 404) for Firebase Hosting,
 * whose rewrite forwards /api/v1/emissions/** to the API. There are no server routes: the
 * tiles, the rasters and every envelope come from the API at NEXT_PUBLIC_API_BASE, and a
 * receipt's URL is /data?receipt=<hash> (a dynamic /r/<receipt> route cannot be exported).
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
