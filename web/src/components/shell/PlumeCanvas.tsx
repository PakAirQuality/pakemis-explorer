"use client";
/**
 * The loading screen's backdrop: smoke. Soft puffs are born just below the bottom edge, rise,
 * drift sideways, swell and thin out — each fades in over the first fifth of its life and out
 * over the last two fifths — in the palette's warm greys. The pointer (mouse or touch) is a
 * second source: puffs leave it faster and smaller, and the ones nearby are pushed aside. It is
 * the motion of the initiative's transport app (emissions.web.app), whose loader this screen
 * started from; the first version here drew drifting dots instead, which read as dust.
 *
 * One requestAnimationFrame loop; the resize and pointer listeners and the frame are removed on
 * unmount. Under prefers-reduced-motion one static frame is painted and nothing moves. Purely
 * decorative: aria-hidden, no text, no number.
 */
import { useEffect, useRef } from "react";

type Puff = { x: number; y: number; vx: number; vy: number; r: number; alpha: number; maxAlpha: number; life: number; maxLife: number; drift: number };

const SEEDED = 40; // puffs already in the air when the screen opens
const AMBIENT = 80; // the column's steady population
const WITH_POINTER = 120; // and with the pointer feeding it
const PUSH_RADIUS = 150; // px around the pointer that pushes
const PUSH = 0.8;
const SWELL = 0.15; // px of radius per frame
// warm greys of the page's ground (#f6f4f1), dense at the core and gone at the rim
const CORE = "150, 140, 132";
const BODY = "165, 156, 148";
const RIM = "180, 172, 165";

export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** A puff from the bottom edge, or — given a point — from the pointer: faster, smaller, shorter-lived. */
function puff(w: number, h: number, at?: { x: number; y: number }): Puff {
  return {
    x: at ? at.x + (Math.random() - 0.5) * 40 : Math.random() * w,
    y: at ? at.y : h + 10,
    vx: (Math.random() - 0.5) * 0.3,
    vy: at ? -(Math.random() * 1.5 + 1) : -(Math.random() * 0.8 + 0.3),
    r: at ? Math.random() * 30 + 15 : Math.random() * 50 + 25,
    alpha: 0,
    maxAlpha: Math.random() * 0.12 + 0.04,
    life: 0,
    maxLife: at ? 120 + Math.random() * 60 : 200 + Math.random() * 150,
    drift: (Math.random() - 0.5) * 0.15,
  };
}

/** Opacity over a life: in over the first fifth, held, out over the last two fifths. */
function fade(p: Puff): number {
  const t = p.life / p.maxLife;
  if (t < 0.2) return p.maxAlpha * (t / 0.2);
  if (t > 0.6) return p.maxAlpha * (1 - (t - 0.6) / 0.4);
  return p.maxAlpha;
}

export function PlumeCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!ctx) return;
    const still = reducedMotion();
    canvas.dataset.motion = still ? "static" : "animated";
    const dpr = Math.min(typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1, 2) || 1;
    let w = 0;
    let h = 0;
    const puffs: Puff[] = [];
    const pointer = { x: 0, y: 0, active: false };

    const resize = () => {
      w = canvas.clientWidth || window.innerWidth || 1;
      h = canvas.clientHeight || window.innerHeight || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (puffs.length === 0) {
        // the air is not empty when the screen opens: a column already part-way up, part-way through
        for (let i = 0; i < SEEDED; i++) {
          const p = puff(w, h);
          p.y = Math.random() * h;
          p.life = Math.random() * p.maxLife;
          p.alpha = fade(p);
          puffs.push(p);
        }
      }
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of puffs) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(${CORE}, ${p.alpha})`);
        g.addColorStop(0.4, `rgba(${BODY}, ${p.alpha * 0.6})`);
        g.addColorStop(1, `rgba(${RIM}, 0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    };
    const step = () => {
      if (puffs.length < AMBIENT) puffs.push(puff(w, h));
      if (pointer.active && puffs.length < WITH_POINTER) {
        puffs.push(puff(w, h, pointer));
        puffs.push(puff(w, h, pointer));
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life++;
        p.alpha = fade(p);
        if (p.life >= p.maxLife || p.alpha <= 0) {
          puffs.splice(i, 1);
          continue;
        }
        p.r += SWELL;
        p.vx += p.drift * 0.01;
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < PUSH_RADIUS) {
            const f = ((PUSH_RADIUS - dist) / PUSH_RADIUS) * PUSH;
            p.vx += (dx / dist) * f;
            p.vy += (dy / dist) * f;
          }
        }
        p.vx *= 0.995;
        p.vy *= 0.998;
        p.x += p.vx;
        p.y += p.vy;
      }
    };
    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    // a finger lifted is a pointer gone; a mouse button released is not
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") pointer.active = false;
    };

    let frame = 0;
    const loop = () => {
      step();
      draw();
      frame = window.requestAnimationFrame(loop);
    };
    resize();
    window.addEventListener("resize", resize);
    if (still) {
      draw();
    } else {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onLeave);
      document.documentElement.addEventListener("pointerleave", onLeave);
      frame = window.requestAnimationFrame(loop);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" data-testid="plume-canvas" />;
}
