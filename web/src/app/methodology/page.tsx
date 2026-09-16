"use client";
/** The detailed scientific methodology, on its own route (the story's "Read the full methodology"). */
import { Suspense } from "react";
import { NavHeader } from "@/components/shell/NavCapsule";
import { Methodology } from "@/components/methods/Methodology";
import { MapMotif } from "@/components/shell/MapMotif";
import { MotifCredit } from "@/components/shell/MotifCredit";

export default function MethodologyPage() {
  return (
    <Suspense fallback={null}>
      <div className="relative min-h-dvh" data-testid="methodology-page">
      <MapMotif />
        <NavHeader />
        <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-4 md:px-6">
          <Methodology />
        <MotifCredit />
        </main>
      </div>
    </Suspense>
  );
}
