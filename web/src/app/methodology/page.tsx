"use client";
/** The detailed scientific methodology, on its own route (the story's "Read the full methodology"). */
import { Suspense } from "react";
import { NavHeader } from "@/components/shell/NavCapsule";
import { Methodology } from "@/components/methods/Methodology";

export default function MethodologyPage() {
  return (
    <Suspense fallback={null}>
      <div className="min-h-dvh bg-surface" data-testid="methodology-page">
        <NavHeader />
        <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-4 md:px-6">
          <Methodology />
        </main>
      </div>
    </Suspense>
  );
}
