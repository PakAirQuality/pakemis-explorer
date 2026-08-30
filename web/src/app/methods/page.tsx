"use client";
/** Methods & evidence: the sector cards over the release's method registry, evidence streams and completeness ledger, with the methodology prose under them (/about redirects here). */
import { Suspense } from "react";
import { Methods } from "@/components/methods/Methods";

export default function MethodsPage() {
  return (
    <Suspense fallback={null}>
      <Methods />
    </Suspense>
  );
}
