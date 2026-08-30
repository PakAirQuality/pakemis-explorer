import type { Metadata, Viewport } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { inter, jetbrains } from "./fonts";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import { AskDrawer } from "@/components/ask/AskDrawer";
import { AskFab } from "@/components/shell/AskFab";
import { LoadingScreen } from "@/components/shell/LoadingScreen";

export const metadata: Metadata = {
  title: "Pakistan Air Quality Initiative — emissions",
  description: "Pakistan's greenhouse-gas emissions, reconstructed from public documents: every number a server string with a receipt.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <NuqsAdapter>
          <Providers>
            {/* before the provider, so the overlay covers the release fetch too */}
            <LoadingScreen />
            <ExplorerProvider>
              {children}
              <AskDrawer />
              <AskFab />
            </ExplorerProvider>
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
