/**
 * The focused sector page. A server file so the static export can enumerate the routes:
 * the build-time list is the authored plain-language map's own key set (SECTOR_TEXT) - the
 * same ten modules the release carries. The page itself is the client SectorRoute.
 */
import { Suspense } from "react";
import { SECTOR_TEXT } from "@/components/methods/sectorText";
import { SectorRoute } from "@/components/methods/SectorRoute";

export function generateStaticParams() {
  return Object.keys(SECTOR_TEXT).map((sector) => ({ sector }));
}

export default async function SectorMethodPage({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  return (
    <Suspense fallback={null}>
      <SectorRoute sector={sector} />
    </Suspense>
  );
}
