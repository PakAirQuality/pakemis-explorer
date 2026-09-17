"use client";
/**
 * Which chapter the reader is on, for the fixed illustration beside the story and the step strip.
 *
 * One IntersectionObserver over the chapter sections, its root shrunk to a band just above the
 * middle of the viewport (rootMargin -40% / -50%): the chapter crossing that band is the active
 * one, and when two cross it at once the lower one wins, so scrolling down hands over cleanly.
 * The first chapter is active until anything is observed - and stays so where
 * IntersectionObserver does not exist (jsdom, old browsers), which is also the reduced-motion
 * fallback: the stage then shows the first illustration and every chapter carries its own
 * inline copy anyway.
 */
import { useEffect, useState } from "react";

export const ACTIVE_BAND = "-40% 0px -50% 0px";

export function useActiveStep(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const crossing = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id;
          if (e.isIntersecting) crossing.add(id);
          else crossing.delete(id);
        }
        // the lowest chapter crossing the band; none crossing keeps the last answer
        for (let i = ids.length - 1; i >= 0; i--) {
          if (crossing.has(ids[i])) {
            setActive(ids[i]);
            return;
          }
        }
      },
      { rootMargin: ACTIVE_BAND, threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ids are the dependency, joined
  }, [key]);
  return active;
}
