"use client";
/** Downloads & API: the release's products with digests and schema, the citation, an API example and the receipt replay (/data redirects here, carrying ?receipt=). */
import { Suspense } from "react";
import { Downloads } from "@/components/downloads/Downloads";

export default function DownloadsPage() {
  return (
    <Suspense fallback={null}>
      <Downloads />
    </Suspense>
  );
}
