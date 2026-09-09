"use client";
/** Analyze: change contributions, shared climate/air sources, assumption sensitivity. */
import { Suspense } from "react";
import { Analyze } from "@/components/analyze/Analyze";

export default function AnalyzePage() {
  return (
    <Suspense fallback={null}>
      <Analyze />
    </Suspense>
  );
}
