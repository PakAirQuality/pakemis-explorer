import type { Metadata, Viewport } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { inter, jetbrains } from "./fonts";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "PakEmis Explorer",
  description: "Pakistan's national emissions inventory on a map: one numerical truth layer, every number a receipt.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="overflow-hidden">
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
