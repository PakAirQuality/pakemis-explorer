"use client";
/**
 * A client-side redirect for a route that moved (about to methods, map to the workspace, explore to data).
 * The static export has no server redirects, so the old page renders this stub, which replaces
 * itself with the new path and carries the query string (`?receipt=`) and hash across.
 */
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function Redirect({ to, label }: { to: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    const carry = typeof window !== "undefined" ? `${window.location.search}${window.location.hash}` : "";
    router.replace(`${to}${carry}`);
  }, [router, to]);
  return (
    <p className="p-6 text-xs text-muted" data-testid="redirect" data-to={to}>
      This page has moved to <Link href={to} className="text-accent underline">{label}</Link>.
    </p>
  );
}
