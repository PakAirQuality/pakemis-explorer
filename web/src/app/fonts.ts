/** Inter for the UI (tabular figures on), JetBrains Mono for receipts, exact strings, ids and SQL.
 *  next/font/google needs the network at build; the CSS variables fall back to the system stacks
 *  declared in globals.css if a face fails to load at runtime. */
import { Inter, JetBrains_Mono } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", fallback: ["system-ui", "Segoe UI", "Roboto", "sans-serif"] });
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", fallback: ["ui-monospace", "Menlo", "monospace"] });
