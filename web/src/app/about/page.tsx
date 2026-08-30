"use client";
/** /about moved to /methods (2026-08-30); this stub redirects so existing links keep working. */
import { Redirect } from "@/components/shell/Redirect";

export default function AboutRedirect() {
  return <Redirect to="/methods" label="Methods & evidence" />;
}
