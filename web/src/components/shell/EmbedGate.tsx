"use client";
/**
 * What an embedded build shows before it knows who is reading.
 *
 * In the public build this is a pass-through: `EMBEDDED` is false, the children render, nothing
 * here runs. In the build that is embedded in a dashboard with its own sign-in
 * (NEXT_PUBLIC_EMBED_AUTH=parent), the API is gated, so rendering the app before the host has
 * answered would fire a page of requests that all come back 401. Instead the gate waits for the
 * host's answer - a beat, usually - and only then mounts the app.
 *
 * When no host answers (somebody opened the deployment's URL directly rather than through the
 * dashboard), the reader gets one card that says where the page lives, rather than a screen of
 * failures. This is a courtesy, not the security: the enforcement is the API's, which refuses the
 * data whatever this page chooses to render.
 */
import { useEffect, useState } from "react";
import { BrandMark } from "./BrandLogo";
import { EMBEDDED, authToken, embedStatus, watchEmbedStatus, type EmbedStatus } from "@/lib/embedAuth";

const HOST = process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN ?? "";

export function EmbedGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<EmbedStatus>(() => (EMBEDDED ? embedStatus() : "open"));

  useEffect(() => {
    if (!EMBEDDED) return;
    const stop = watchEmbedStatus(setStatus);
    void authToken().then(() => setStatus(embedStatus()));
    return stop;
  }, []);

  if (!EMBEDDED || status === "open" || status === "ready") return <>{children}</>;
  if (status === "waiting") return <div className="min-h-dvh bg-ground" data-testid="embed-waiting" aria-busy="true" />;
  return <SignInCard misconfigured={status === "misconfigured"} />;
}

function SignInCard({ misconfigured }: { misconfigured: boolean }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground px-5" data-testid="embed-gate-card">
      <div className="card max-w-[34em] p-6 text-center">
        <div className="flex justify-center"><BrandMark className="h-11 w-11" /></div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-fg">Open this from the dashboard</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {misconfigured
            ? "This build expects to be opened inside a dashboard, and no host was configured for it. Nothing is wrong with the data; this page simply cannot tell who is reading."
            : "This deployment serves the people signed in to the internal dashboard. Open the Emissions tab there and this page comes with it."}
        </p>
        {HOST ? (
          <p className="mt-4">
            <a href={HOST} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright" data-testid="embed-gate-link">
              Go to the dashboard
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
