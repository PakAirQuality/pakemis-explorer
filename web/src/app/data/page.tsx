"use client";
/** Data: the Grapher over the release (the national result built from the URL state — period, breakdown, measure, sector; more settings), with every figure a server string. It moved here from /explore on 2026-08-30. */
import { Suspense } from "react";
import { Explore } from "@/components/explore/Explore";

export default function DataPage() {
  return (
    <Suspense fallback={null}>
      <Explore />
    </Suspense>
  );
}
