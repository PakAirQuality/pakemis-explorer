"use client";
/**
 * The loading screen (mounted once in app/layout.tsx, before the ExplorerProvider so it covers
 * the release fetch): a fixed overlay over everything with the particle field behind, the
 * floating PAQI logo, "Pakistan Air Quality Initiative", the dataset's one-line description, a
 * progress bar and a
 * rotating status line. The bar is real, not a timer: it reads the bootstrap store
 * (shell/bootstrap.ts) — the release resolved, the labels applied, the page's first envelope
 * answered, the map loaded on the pages that carry one (stagesFor) — and finishes when the
 * page's last stage is reached, or at a six-second ceiling so a slow tile never traps anyone.
 * A minimum display keeps the animation from flashing; then a 700 ms fade and unmount. Shown
 * once per session (sessionStorage, in try/catch); `?loading=1` forces it (screenshots, tests)
 * and `?loading=1&stage=<name>` holds the bar at that stage for a capture. The status lines
 * (loadingLines.ts) carry no digit: nothing here prints a number.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./LoadingScreen.module.css";
import { BrandLogo } from "./BrandLogo";
import { ParticleCanvas } from "./ParticleCanvas";
import { LOADING_LINES } from "./loadingLines";
import { finishedFor, progressFor, STAGE_PERCENT, STAGES, stagesFor, useBootstrap, type Stage } from "./bootstrap";

export const SESSION_KEY = "pakemis.loading-shown";
export const CEILING_MS = 6000;
export const MIN_SHOW_MS = 900;
export const FADE_MS = 700;
export const LINE_MS = 2200;

type Query = { force: boolean; pin: Stage | null };

/** `?loading=1` forces the screen; `stage=<name>` pins the bar there (a capture aid). */
export function readLoadingQuery(search: string): Query {
  const q = new URLSearchParams(search);
  const stage = q.get("stage");
  return { force: q.get("loading") === "1", pin: stage && (STAGES as readonly string[]).includes(stage) ? (stage as Stage) : null };
}

/** Whether this session has shown the screen already; records that it now has. */
function seenThisSession(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return true;
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* storage unavailable: show the screen */
  }
  return false;
}

export function LoadingScreen({ force, pin }: { force?: boolean; pin?: Stage | null } = {}) {
  const pathname = usePathname();
  const { reached } = useBootstrap();
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">("shown");
  const [pinned, setPinned] = useState<Stage | null>(pin ?? null);
  const [ceiling, setCeiling] = useState(false);
  const [minShown, setMinShown] = useState(false);
  const [lineIx, setLineIx] = useState(0);

  // once per session, unless forced
  useEffect(() => {
    const q = typeof window === "undefined" ? { force: false, pin: null } : readLoadingQuery(window.location.search);
    const forced = force ?? q.force;
    if (pin === undefined && q.pin) setPinned(q.pin);
    if (!forced && seenThisSession()) setPhase("gone");
  }, [force, pin]);

  // the ceiling, the minimum display and the rotating line
  useEffect(() => {
    if (phase === "gone") return;
    const c = window.setTimeout(() => setCeiling(true), CEILING_MS);
    const m = window.setTimeout(() => setMinShown(true), MIN_SHOW_MS);
    const l = window.setInterval(() => setLineIx((i) => (i + 1) % LOADING_LINES.length), LINE_MS);
    return () => {
      window.clearTimeout(c);
      window.clearTimeout(m);
      window.clearInterval(l);
    };
  }, [phase === "gone"]); // eslint-disable-line react-hooks/exhaustive-deps

  // the page beneath does not scroll while the overlay covers it
  useEffect(() => {
    if (phase === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase === "gone"]); // eslint-disable-line react-hooks/exhaustive-deps

  const stages = stagesFor(pathname);
  const finished = finishedFor(reached, stages) || ceiling;
  const progress = pinned ? STAGE_PERCENT[pinned] : ceiling ? 100 : progressFor(reached, stages);

  // finish: fade, then unmount (two effects: the fade's own phase change must not clear its timer)
  useEffect(() => {
    if (phase === "shown" && !pinned && finished && minShown) setPhase("fading");
  }, [phase, pinned, finished, minShown]);
  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("gone"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center transition-opacity duration-700 ${phase === "fading" ? "pointer-events-none opacity-0" : "opacity-100"}`}
      style={{ background: "#f6f4f1" }}
      role="status"
      aria-label="Pakistan Air Quality Initiative is loading"
      data-testid="loading-screen"
      data-phase={phase}
      data-progress={progress}
    >
      <ParticleCanvas />
      <div className="relative flex flex-col items-center px-6">
        <div className={styles.float} data-testid="loading-logo">
          <BrandLogo className="h-20 object-contain" style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.08))" }} />
        </div>
        <h1 className={`mt-6 text-xl font-bold tracking-tight text-fg ${styles.title}`} data-testid="loading-title">
          Pakistan Air Quality Initiative
        </h1>
        <p className={`mt-1 mb-10 text-sm text-muted ${styles.subtitle}`} data-testid="loading-subtitle">
          Pakistan&apos;s greenhouse-gas emissions, reconstructed from public documents
        </p>
        <div className="h-1 w-64 overflow-hidden rounded-full" style={{ background: "#e5e1da" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} data-testid="loading-progress">
          <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #462e32, #ffb313)" }} data-testid="loading-fill" />
        </div>
        <p key={lineIx} className={`mt-4 min-h-[36px] max-w-xs text-center text-[12px] leading-relaxed text-muted ${styles.line}`} data-testid="loading-line">
          {LOADING_LINES[lineIx]}
        </p>
      </div>
    </div>
  );
}
