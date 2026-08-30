"use client";
/** Explore data: the national result built from the URL state (period, breakdown, measure, sector; more settings), with every figure a server string. */
import { Suspense } from "react";
import { Explore } from "@/components/explore/Explore";

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <Explore />
    </Suspense>
  );
}
