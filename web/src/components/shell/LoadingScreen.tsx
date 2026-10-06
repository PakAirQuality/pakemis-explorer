"use client";
/**
 * The loading screen (mounted once in app/layout.tsx, before the ExplorerProvider so it covers
 * the release fetch): a fixed overlay over everything with smoke rising behind (PlumeCanvas), the
 * floating PAQI logo, "Pakistan Air Quality Initiative", the dataset's one-line description, a
 * progress bar and a rotating fact about Pakistan's emissions.
 *
 * THE BAR IS REAL, not a timer: it reads the bootstrap store (shell/bootstrap.ts) — the release
 * resolved, the labels applied, the page's first envelope answered, the map loaded on the pages
 * that carry one (stagesFor) — and finishes when the page's last stage is reached. A map that
 * cannot start (no WebGL) is a stage that FAILED: the page stops waiting for it and finishes at
 * the envelope, onto a workspace that says so, rather than holding the screen to its ceiling.
 *
 * TWO CEILINGS, because there are two different waits. Once the release has answered, a slow tile
 * must not trap anyone: six seconds later the screen leaves regardless. But BEFORE it answers
 * there is nothing underneath to leave to — the API scales to zero and a cold start is about
 * thirty-five seconds — and the single six-second ceiling this had used to drop a reader onto an
 * empty page for half a minute. So that wait is held, to a hard cap that only an outage reaches,
 * and while it lasts the bar eases toward its first stage instead of sitting at nothing.
 *
 * THE FACTS CARRY NUMBERS, and every one is a string the release returned: loadingFacts.gen.ts is
 * written by scripts/build-loading-facts.mjs and the tests beside this file hold each digit to
 * the fact's own recorded strings. The minimum display is long enough to read one. The first
 * fact is drawn at random after mount (a prerendered page cannot pick), so a returning reader
 * does not meet the same sentence each time.
 *
 * Then a 700 ms fade and unmount. Shown once per session (sessionStorage, in try/catch);
 * `?loading=1` forces it (screenshots, tests) and `?loading=1&stage=<name>` holds the bar at that
 * stage for a capture.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./LoadingScreen.module.css";
import { BrandLogo } from "./BrandLogo";
import { PlumeCanvas } from "./PlumeCanvas";
import { LOADING_FACTS } from "./loadingFacts.gen";
import { finishedFor, progressFor, STAGE_PERCENT, STAGES, stagesFor, useBootstrap, type Stage } from "./bootstrap";

export const SESSION_KEY = "pakemis.loading-shown";
/** After the release has answered: how long a slow envelope or tile may hold the screen. */
export const CEILING_MS = 6000;
/** Before it has: how long a cold start may, which only an outage outlasts. */
export const HARD_CAP_MS = 45000;
export const MIN_SHOW_MS = 3000;
export const FADE_MS = 700;
/** One fact's stay: longer than the minimum display, so a fast load shows one fact, whole. */
export const LINE_MS = 3200;
/** While the release is awaited the bar eases toward (never to) its first stage. */
export const CREEP_MS = 400;
const CREEP_TOWARD = STAGE_PERCENT.release - 5;

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
  const { reached, failed } = useBootstrap();
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">("shown");
  const [pinned, setPinned] = useState<Stage | null>(pin ?? null);
  const [ceiling, setCeiling] = useState(false);
  const [minShown, setMinShown] = useState(false);
  const [factIx, setFactIx] = useState<number | null>(null);
  const [creep, setCreep] = useState(0);
  const answered = reached.has("release");

  // once per session, unless forced
  useEffect(() => {
    const q = typeof window === "undefined" ? { force: false, pin: null } : readLoadingQuery(window.location.search);
    const forced = force ?? q.force;
    if (pin === undefined && q.pin) setPinned(q.pin);
    if (!forced && seenThisSession()) setPhase("gone");
  }, [force, pin]);

  // the hard cap, the minimum display and the rotating fact (the first one drawn at random)
  useEffect(() => {
    if (phase === "gone") return;
    setFactIx(Math.floor(Math.random() * LOADING_FACTS.length));
    const c = window.setTimeout(() => setCeiling(true), HARD_CAP_MS);
    const m = window.setTimeout(() => setMinShown(true), MIN_SHOW_MS);
    const l = window.setInterval(() => setFactIx((i) => ((i ?? 0) + 1) % LOADING_FACTS.length), LINE_MS);
    return () => {
      window.clearTimeout(c);
      window.clearTimeout(m);
      window.clearInterval(l);
    };
  }, [phase === "gone"]); // eslint-disable-line react-hooks/exhaustive-deps

  // the release has answered: from here a slow envelope or tile gets the short ceiling
  useEffect(() => {
    if (phase === "gone" || !answered) return;
    const c = window.setTimeout(() => setCeiling(true), CEILING_MS);
    return () => window.clearTimeout(c);
  }, [phase === "gone", answered]); // eslint-disable-line react-hooks/exhaustive-deps

  // it has not: the bar eases toward its first stage, a fraction of what is left each tick
  useEffect(() => {
    if (phase === "gone" || answered) return;
    const t = window.setInterval(() => setCreep((v) => v + (CREEP_TOWARD - v) * 0.06), CREEP_MS);
    return () => window.clearInterval(t);
  }, [phase === "gone", answered]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const finished = finishedFor(reached, stages, failed) || ceiling;
  const progress = pinned ? STAGE_PERCENT[pinned] : ceiling ? 100 : answered ? progressFor(reached, stages) : Math.round(creep);

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
      <PlumeCanvas />
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
          <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #5e1a2a, #ffb313)" }} data-testid="loading-fill" />
        </div>
        <p key={factIx ?? "unset"} className={`mt-5 min-h-[66px] max-w-sm text-center text-[13px] leading-relaxed text-muted ${styles.line}`} data-testid="loading-line">
          {factIx === null ? null : LOADING_FACTS[factIx].text}
        </p>
      </div>
    </div>
  );
}
