"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Reactive grid backdrop.
 *
 * A faint square grid that drifts toward the pointer and carries a soft light
 * that follows it. Used behind the landing hero so the top of the page is not a
 * flat expanse of background.
 *
 * Things this deliberately does:
 *
 *   • Reads the theme. The grid and glow are drawn from tokens that exist in
 *     both palettes, and the grid sits slightly brighter on dark, where a thin
 *     line at the light-theme opacity disappears entirely.
 *
 *   • Moves less than the pointer. The offset is a fraction of the distance from
 *     centre, capped, so the effect reads as parallax rather than as the page
 *     sliding around. A grid that tracks 1:1 is distracting within seconds.
 *
 *   • Costs nothing while idle. Pointer moves are coalesced into a single
 *     `requestAnimationFrame` write, so a fast mouse cannot queue a re-render per
 *     event, and the loop stops when the pointer leaves.
 *
 *   • Disappears under `prefers-reduced-motion`. The grid stays as a static
 *     texture and the light stops tracking. A background that moves on its own is
 *     exactly what that preference exists to prevent.
 *
 * Pure CSS custom properties drive both layers, so the browser composites them
 * and no React state is involved after the initial mount.
 */

/** Maximum drift in pixels. Small on purpose: this is texture, not motion. */
const DRIFT = 14;

/** How far the glow reaches, in pixels. */
const GLOW_RADIUS = 460;

export function GridBackdrop({
  className,
  /** Grid cell size in pixels. Larger reads as calmer. */
  cell = 32,
  /** Fade the grid toward the edges so it has no hard border. */
  fade = true,
}: {
  className?: string;
  cell?: number;
  fade?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });
  const [reducedMotion, setReducedMotion] = useState(false);

  // Read the preference once and keep it in sync, rather than querying on every
  // pointer move.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || reducedMotion) return;

    /** Writes the current pointer position into CSS variables. */
    const paint = () => {
      frameRef.current = null;
      const { x, y, active } = pointerRef.current;

      // Normalised distance from centre, in the range -1..1, inverted so the
      // grid moves *away* from the pointer and reads as depth.
      const offsetX = (x - 0.5) * 2;
      const offsetY = (y - 0.5) * 2;

      host.style.setProperty("--grid-shift-x", `${(-offsetX * DRIFT).toFixed(2)}px`);
      host.style.setProperty("--grid-shift-y", `${(-offsetY * DRIFT).toFixed(2)}px`);
      host.style.setProperty("--glow-x", `${(x * 100).toFixed(2)}%`);
      host.style.setProperty("--glow-y", `${(y * 100).toFixed(2)}%`);
      host.style.setProperty("--glow-opacity", active ? "1" : "0");
    };

    /** Coalesces pointer moves into at most one write per frame. */
    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(paint);
    };

    const onPointerMove = (event: PointerEvent) => {
      // Touch has no hover, and driving the effect from a finger would make the
      // background jump while scrolling.
      if (event.pointerType === "touch") return;

      const bounds = host.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;

      pointerRef.current = {
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height,
        active: true,
      };
      schedule();
    };

    const onPointerLeave = () => {
      // Recentre and fade the glow, so the grid settles rather than freezing
      // wherever the pointer happened to stop.
      pointerRef.current = { x: 0.5, y: 0.5, active: false };
      schedule();
    };

    // Listened for on the window rather than the element, so the grid keeps
    // responding while the pointer is over the hero text and cards above it.
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    const onBlur = () => onPointerLeave();
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onBlur);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute overflow-hidden",
        // Defaults matter: a first paint with no pointer interaction still shows
        // a centred, unshifted grid rather than nothing.
        "[--grid-shift-x:0px] [--grid-shift-y:0px] [--glow-x:50%] [--glow-y:50%] [--glow-opacity:0]",
        className,
      )}
    >
      {/*
        The grid.

        Drawn with two repeating gradients rather than an SVG pattern: it tiles
        infinitely at any size with no extra markup. The line colour is explicit
        per theme rather than a token, because the needed opacity differs — a
        light-theme hairline vanishes on a dark canvas, so dark uses a slightly
        stronger line and one further step of blur to stay soft.
      */}
      <div
        className={cn(
          "absolute -inset-8 transition-transform duration-slow ease-standard",
          "motion-reduce:transition-none motion-reduce:transform-none",
        )}
        style={{
          transform: "translate3d(var(--grid-shift-x), var(--grid-shift-y), 0)",
          backgroundImage:
            "linear-gradient(to right, var(--grid-line) 1px, transparent 1px)," +
            "linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: `${cell}px ${cell}px`,
          maskImage: fade
            ? "radial-gradient(ellipse 95% 75% at 50% 35%, black 35%, transparent 100%)"
            : undefined,
          WebkitMaskImage: fade
            ? "radial-gradient(ellipse 95% 75% at 50% 35%, black 35%, transparent 100%)"
            : undefined,
        }}
      />

      {/* The glow that follows the pointer. Hidden entirely under reduced-motion
          rather than merely fixed, since a static glow reads as a smudge. */}
      <div
        className="absolute inset-0 transition-opacity duration-slow ease-standard motion-reduce:hidden"
        style={{
          opacity: "var(--glow-opacity)",
          background: `radial-gradient(${GLOW_RADIUS}px circle at var(--glow-x) var(--glow-y), var(--grid-glow), transparent 72%)`,
        }}
      />
    </div>
  );
}
