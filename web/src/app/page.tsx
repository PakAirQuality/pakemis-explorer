"use client";
/** The public Overview: the home page (components/overview/Overview.tsx). The map console lives at /map. */
import { Suspense } from "react";
import { Overview } from "@/components/overview/Overview";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Overview />
    </Suspense>
  );
}
