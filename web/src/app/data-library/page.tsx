"use client";
import { Suspense } from "react";
import { DataLibrary } from "@/components/data-library/DataLibrary";

export default function DataLibraryPage() {
  return <Suspense fallback={null}><DataLibrary /></Suspense>;
}
