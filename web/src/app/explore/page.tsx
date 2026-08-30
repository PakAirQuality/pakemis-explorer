"use client";
/** The Grapher moved to /data on 2026-08-30 (the nav reads Explore · Data · Methods · Downloads); this stub redirects, carrying the query string across. */
import { Redirect } from "@/components/shell/Redirect";

export default function ExploreRedirect() {
  return <Redirect to="/data" label="Data" />;
}
