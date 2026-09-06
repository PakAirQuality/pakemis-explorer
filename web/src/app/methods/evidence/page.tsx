"use client";
/** The advanced evidence tool: the claim-record browser, on its own route (?claim= permalinks land here). */
import { Suspense } from "react";
import { EvidencePage } from "@/components/methods/EvidencePage";

export default function MethodsEvidencePage() {
  return (
    <Suspense fallback={null}>
      <EvidencePage />
    </Suspense>
  );
}
