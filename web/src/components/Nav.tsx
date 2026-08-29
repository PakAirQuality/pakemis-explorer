"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES: [string, string][] = [
  ["/", "Overview"],
  ["/inventory", "Inventory Explorer"],
  ["/spatial", "Spatial Explorer"],
  ["/compare", "Compare"],
  ["/evidence", "Evidence & Methods"],
  ["/ask", "Ask PakEmis"],
  ["/downloads", "Downloads & API"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="top-nav">
      <span className="brand">PakEmis Explorer</span>
      {PAGES.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "active" : ""}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
