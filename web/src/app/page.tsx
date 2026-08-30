"use client";
/** The workspace: one full-bleed map with the insight deck and the filter panel floating over it (components/workspace/Workspace.tsx). */
import { Suspense } from "react";
import { Workspace } from "@/components/workspace/Workspace";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}
