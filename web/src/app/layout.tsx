import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { ContextBar } from "@/components/ContextBar";

export const metadata: Metadata = {
  title: "PakEmis Explorer",
  description: "Pakistan's national emissions inventory: one numerical truth layer, every view a receipt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <ContextBar />
          <main>{children}</main>
          <footer className="small">
            Every number on this page is a <code>display</code> string from an API envelope carrying a receipt; the browser computes nothing. Data CC-BY-4.0, code MIT, OSM-derived tables ODbL.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
