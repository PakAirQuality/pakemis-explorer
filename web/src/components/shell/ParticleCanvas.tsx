"use client";
/**
 * The loading screen's backdrop: a full-bleed canvas of slow-drifting soft dots in the palette
 * greys with a faint blue tint, gently drawn towards the pointer (mouse or touch). One
 * requestAnimationFrame loop; the resize and pointer listeners and the frame are removed on
 * unmount. Under prefers-reduced-motion one static frame is painted and nothing moves. Purely
 * decorative: aria-hidden, no text, no number.
 */
import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; vx: number; vy: number; r: number; a: number; blue: boolean };

const DRIFT = 0.25; // px per frame, at most
const PULL_RADIUS = 160; // px around the pointer that attracts
const PULL = 0.012;
const DAMPING = 0.985;

export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function seed(count: number, w: number, h: number): Dot[] {
  const dots: Dot[] = [];
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * DRIFT * 2,
      vy: (Math.random() - 0.5) * DRIFT * 2,
      r: 1 + Math.random() * 2.2,
      a: 0.12 + Math.random() * 0.3,
      blue: Math.random() < 0.22,
    });
  }
  return dots;
}

export function ParticleCanvas({ count = 90 }: { count?: number }) {
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
    let dots: Dot[] = [];
    const pointer = { x: -1e4, y: -1e4 };

    const resize = () => {
      w = canvas.clientWidth || window.innerWidth || 1;
      h = canvas.clientHeight || window.innerHeight || 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (dots.length === 0) dots = seed(count, w, h);
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = d.blue ? `rgba(59, 130, 246, ${d.a * 0.6})` : `rgba(100, 116, 139, ${d.a})`;
        ctx.fill();
      }
    };
    const step = () => {
      for (const d of dots) {
        const dx = pointer.x - d.x;
        const dy = pointer.y - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < PULL_RADIUS) {
          const f = (PULL * (PULL_RADIUS - dist)) / PULL_RADIUS;
          d.vx += (dx / dist) * f;
          d.vy += (dy / dist) * f;
        }
        d.vx *= DAMPING;
        d.vy *= DAMPING;
        const speed = Math.hypot(d.vx, d.vy);
        if (speed < DRIFT * 0.3) {
          d.vx += (Math.random() - 0.5) * 0.03;
          d.vy += (Math.random() - 0.5) * 0.03;
        } else if (speed > DRIFT * 6) {
          d.vx *= 0.9;
          d.vy *= 0.9;
        }
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -d.r) d.x = w + d.r;
        else if (d.x > w + d.r) d.x = -d.r;
        if (d.y < -d.r) d.y = h + d.r;
        else if (d.y > h + d.r) d.y = -d.r;
      }
    };
    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onLeave = () => {
      pointer.x = -1e4;
      pointer.y = -1e4;
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
      window.addEventListener("pointerleave", onLeave);
      frame = window.requestAnimationFrame(loop);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [count]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" data-testid="particle-canvas" />;
}
