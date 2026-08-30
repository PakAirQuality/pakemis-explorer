import type { Metadata, Viewport } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { inter, jetbrains } from "./fonts";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";

export const metadata: Metadata = {
  title: "PakEmis",
  description: "Pakistan's greenhouse-gas emissions, reconstructed from public documents: every number a server string with a receipt.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <NuqsAdapter>
          <Providers>
            <ExplorerProvider>{children}</ExplorerProvider>
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
