import type { Metadata, Viewport } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { inter, jetbrains } from "./fonts";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import { AskDrawer } from "@/components/ask/AskDrawer";
import { AskFab } from "@/components/shell/AskFab";
import { LoadingScreen } from "@/components/shell/LoadingScreen";
import { EmbedGate } from "@/components/shell/EmbedGate";
import { SITE_URL } from "@/lib/site";

const page: Metadata = {
  title: "Pakistan Air Quality Initiative — emissions",
  description: "Pakistan's greenhouse-gas emissions, reconstructed from public documents: every number a server string with a receipt.",
  icons: { icon: "/favicon.svg" },
};
// a build that knows its public address says so on every page: "./" resolves against each
// route, so one entry here gives each page its own canonical link under that address
export const metadata: Metadata = SITE_URL
  ? {
      ...page,
      metadataBase: new URL(SITE_URL),
      alternates: { canonical: "./" },
      openGraph: { type: "website", url: "./", siteName: "Pakistan Air Quality Initiative", title: page.title as string, description: page.description as string },
    }
  : page;
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <NuqsAdapter>
          {/* the embedded build waits here for its host to say who is reading; the public build
              is a pass-through and nothing below it knows the difference */}
          <EmbedGate>
            <Providers>
              {/* before the provider, so the overlay covers the release fetch too */}
              <LoadingScreen />
              <ExplorerProvider>
                {children}
                <AskDrawer />
                <AskFab />
              </ExplorerProvider>
            </Providers>
          </EmbedGate>
        </NuqsAdapter>
      </body>
    </html>
  );
}
