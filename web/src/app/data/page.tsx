"use client";
/** /data moved to /downloads (2026-08-30); this stub redirects, carrying `?receipt=` across. */
import { Redirect } from "@/components/shell/Redirect";

export default function DataRedirect() {
  return <Redirect to="/downloads" label="Downloads" />;
}
