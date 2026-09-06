"use client";
/** The sector catalogue: ten tiles, each a link to its sector's own page. */
import { Suspense } from "react";
import { SectorsIndex } from "@/components/methods/SectorsIndex";

export default function SectorsPage() {
  return (
    <Suspense fallback={null}>
      <SectorsIndex />
    </Suspense>
  );
}
