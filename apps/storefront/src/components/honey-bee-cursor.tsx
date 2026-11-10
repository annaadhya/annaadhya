"use client";

/*
 * HoneyBeeCursor — Annaadhya's premium honeybee pointer companion.
 *
 * A single global overlay (mounted once from the root layout) that renders an
 * original hand-drawn SVG honeybee which trails the pointer with a soft,
 * interpolated delay, tilts into its direction of travel, hovers with a gentle
 * bob while the pointer rests, and sheds small golden honey droplets that fade
 * and remove themselves from the DOM.
 *
 * Engineering contract:
 *  - Zero React re-renders on pointer movement (refs + requestAnimationFrame only).
 *  - pointer-events: none everywhere — never intercepts clicks, text selection
 *    or the native cursor (the OS cursor is left completely untouched).
 *  - Enabled only on fine-pointer devices (mouse/trackpad); skipped on touch
 *    and when the user prefers reduced motion (live-switchable).
 *  - Hidden when the pointer leaves the viewport or the window loses focus.
 *  - Every animation frame, listener and particle node is torn down on disable
 *    or unmount — no leaks.
 */

import { useEffect, useRef, useState } from "react";

/* --- Motion tuning ------------------------------------------------------- */
const FOLLOW_TAU_MS = 110; // exponential-follow time constant (natural lag)
const TILT_MAX_DEG = 15; // max banking angle in the direction of travel
const TILT_GAIN = 0.6;
const BOB_AMPLITUDE_PX = 2.6; // idle hovering bob
const SWAY_AMPLITUDE_PX = 1.5;
const TRAIL_INTERVAL_MS = 110; // controlled drip cadence — never per-event
const TRAIL_MIN_DISTANCE_PX = 7; // and only while the bee actually travels
const TRAIL_MAX_NODES = 14; // hard particle budget
/* The bee rides the cursor's tail, not its tip: the standard arrow points
 * up-left with its hotspot at the tip, so anchor the bee down-right of the
 * pointer along that same diagonal — hovering just off the arrow's tail. */
const CURSOR_TAIL_OFFSET_PX = 21;

/** Original Annaadhya bee — golden body, umber stripes, translucent wings.
 *  Palette is lifted straight from the design tokens: #edc06a / #d3a955 /
 *  #c39a48 golds with #45342a umber ink. Facing right; the JS layer handles
 *  banking and horizontal facing. */
function BeeArtwork() {
  return (
    <svg
      className="annaadhya-bee-svg"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      focusable="false"
    >
      <defs>
        <linearGradient id="annaadhya-bee-body" x1="18" y1="26" x2="40" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2c14e" />
          <stop offset="0.55" stopColor="#d3a955" />
          <stop offset="1" stopColor="#c39a48" />
        </linearGradient>
        <linearGradient id="annaadhya-bee-thorax" x1="34" y1="30" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d8ae5c" />
          <stop offset="1" stopColor="#a87f33" />
        </linearGradient>
        <clipPath id="annaadhya-bee-body-clip">
          <ellipse cx="27" cy="38" rx="16" ry="11" />
        </clipPath>
      </defs>

      {/* Wings (behind the body, bases tucked under the thorax). Each wing
          wraps its ellipse in a group: the group carries the CSS flutter
          about the wing joint while the ellipse keeps its static pose. */}
      <g className="annaadhya-bee-wing-back">
        <ellipse
          cx="36.5"
          cy="19.5"
          rx="5.2"
          ry="11.5"
          transform="rotate(-56 38.5 30.5)"
          fill="rgba(211,169,85,0.32)"
          stroke="rgba(195,154,72,0.8)"
          strokeWidth="1"
        />
      </g>
      <g className="annaadhya-bee-wing-front">
        <ellipse
          cx="33"
          cy="17.4"
          rx="5.8"
          ry="12"
          transform="rotate(-18 39 29)"
          fill="rgba(255,253,248,0.62)"
          stroke="rgba(195,154,72,0.75)"
          strokeWidth="1"
        />
      </g>

      {/* Abdomen with elegant umber stripes (clipped to the body) */}
      <ellipse cx="27" cy="38" rx="16" ry="11" fill="url(#annaadhya-bee-body)" />
      <g clipPath="url(#annaadhya-bee-body-clip)">
        <rect x="14.5" y="25" width="5.4" height="26" fill="#45342a" />
        <rect x="22.5" y="25" width="5.2" height="26" fill="#45342a" />
        <rect x="30" y="25" width="4.4" height="26" fill="#45342a" opacity="0.92" />
        <ellipse cx="25" cy="31.4" rx="7.2" ry="2.5" fill="#fffdf8" opacity="0.32" transform="rotate(-9 25 31.4)" />
      </g>
      {/* Stinger */}
      <path d="M12.2 37.6 L6.8 40.2 L12.6 41.4 Z" fill="#45342a" />

      {/* Thorax */}
      <ellipse cx="38.5" cy="36.5" rx="6.6" ry="7.2" fill="url(#annaadhya-bee-thorax)" />

      {/* Legs — three quiet strokes under the thorax */}
      <g stroke="#45342a" strokeWidth="1.5" strokeLinecap="round">
        <path d="M33.6 43.4 Q32.8 46.6 30.6 48.2" />
        <path d="M38.6 44.4 Q38.4 47.6 36.6 49.6" />
        <path d="M43.2 43 Q44.2 46 42.8 48.6" />
      </g>

      {/* Head + antennae */}
      <circle cx="49.6" cy="35" r="7.4" fill="#45342a" />
      <circle cx="52" cy="32.8" r="1.5" fill="#fffdf8" opacity="0.85" />
      <g stroke="#45342a" strokeWidth="1.6" strokeLinecap="round">
        <path d="M47.6 28.4 Q45.4 22.4 41.4 20" />
        <path d="M51.4 28 Q52.8 21.8 49.8 18" />
      </g>
      <circle cx="41.4" cy="20" r="1.9" fill="#d3a955" />
      <circle cx="49.8" cy="18" r="1.9" fill="#d3a955" />
    </svg>
  );
}

const BEE_STYLES = `
.annaadhya-bee-layer{position:fixed;inset:0;z-index:70;pointer-events:none;}
.annaadhya-bee-trail{position:absolute;inset:0;}
.annaadhya-bee{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;opacity:0;transition:opacity .35s ease;will-change:transform;}
.annaadhya-bee.is-visible{opacity:1;}
.annaadhya-bee-flip{display:block;transition:transform .24s ease;}
.annaadhya-bee-tilt{display:block;will-change:transform;}
.annaadhya-bee-svg{display:block;width:100%;height:100%;filter:drop-shadow(0 2px 5px rgba(84,22,32,.20)) drop-shadow(0 0 6px rgba(211,169,85,.38));}
.annaadhya-bee-wing-back{transform-box:fill-box;transform-origin:92% 74%;animation:annaadhya-bee-wing-back .16s ease-in-out infinite;}
.annaadhya-bee-wing-front{transform-box:fill-box;transform-origin:100% 86%;animation:annaadhya-bee-wing-front .12s ease-in-out infinite;}
@keyframes annaadhya-bee-wing-back{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-18deg)}}
@keyframes annaadhya-bee-wing-front{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-10deg)}}
.annaadhya-bee-drop{position:absolute;border-radius:9999px;background:radial-gradient(circle at 32% 30%, #f7dc9a 0%, #edc06a 45%, #c39a48 100%);opacity:0;transform:translate(-50%,-50%) scale(.45);animation:annaadhya-bee-drop var(--bee-dur,.9s) cubic-bezier(.22,.61,.36,1) forwards;will-change:transform,opacity;}
@keyframes annaadhya-bee-drop{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.45);}
  22%{opacity:.85;}
  100%{opacity:0;transform:translate(calc(-50% + var(--bee-dx,8px)),calc(-50% + var(--bee-dy,14px))) scale(.72);}
}
`;

export function HoneyBeeCursor() {
  const [enabled, setEnabled] = useState(false);
  const beeRef = useRef<HTMLDivElement | null>(null);
  const flipRef = useRef<HTMLSpanElement | null>(null);
  const tiltRef = useRef<HTMLSpanElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);

  /* Gate: fine pointer + no reduced-motion preference. Stays live — if the
   * user flips the OS reduce-motion switch, the whole effect dismounts. */
  useEffect(() => {
    const fineQuery = window.matchMedia("(pointer: fine)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fineQuery.matches || reducedQuery.matches) return;

    setEnabled(true);
    const reconsider = () => {
      if (!fineQuery.matches || reducedQuery.matches) setEnabled(false);
    };
    fineQuery.addEventListener?.("change", reconsider);
    reducedQuery.addEventListener?.("change", reconsider);
    return () => {
      fineQuery.removeEventListener?.("change", reconsider);
      reducedQuery.removeEventListener?.("change", reconsider);
    };
  }, []);

  /* The motion engine — pure refs/rAF, never re-renders on pointer move. */
  useEffect(() => {
    if (!enabled) return;
    const trailNode = trailRef.current;

    let rafId = 0;
    let lastFrameTime = 0;
    let pointerInside = false;
    // Rendered bee position (lerped) vs pointer target position.
    let currentX = -100;
    let currentY = -100;
    let targetX = -100;
    let targetY = -100;
    // Smoothed frame displacement, used for banking + facing.
    let smoothVX = 0;
    let smoothVY = 0;
    let lastDropAt = 0;
    let lastDropX = -100;
    let lastDropY = -100;

    const spawnDrop = (now: number) => {
      const trail = trailNode;
      if (!trail) return;
      const speed = Math.hypot(smoothVX, smoothVY) || 1;
      // Shed the droplet just behind the bee, with a light scatter.
      const dropX = currentX - (smoothVX / speed) * 10 + (Math.random() * 8 - 4);
      const dropY = currentY - (smoothVY / speed) * 10 + (Math.random() * 6 - 3);
      const drop = document.createElement("span");
      drop.className = "annaadhya-bee-drop";
      const size = 3 + Math.random() * 3.2;
      drop.style.left = `${dropX.toFixed(1)}px`;
      drop.style.top = `${dropY.toFixed(1)}px`;
      drop.style.width = `${size.toFixed(1)}px`;
      drop.style.height = `${size.toFixed(1)}px`;
      drop.style.setProperty("--bee-dx", `${(Math.random() * 22 - 11).toFixed(1)}px`);
      drop.style.setProperty("--bee-dy", `${(10 + Math.random() * 16).toFixed(1)}px`);
      drop.style.setProperty("--bee-dur", `${(0.7 + Math.random() * 0.5).toFixed(2)}s`);
      drop.addEventListener("animationend", () => drop.remove(), { once: true });
      trail.appendChild(drop);
      while (trail.childElementCount > TRAIL_MAX_NODES) {
        trail.firstElementChild?.remove();
      }
      lastDropAt = now;
      lastDropX = currentX;
      lastDropY = currentY;
    };

    const onPointerMove = (event: PointerEvent) => {
      // Anchor at the cursor's tail (down-right of the hotspot), not the tip.
      targetX = event.clientX + CURSOR_TAIL_OFFSET_PX;
      targetY = event.clientY + CURSOR_TAIL_OFFSET_PX;
      if (!pointerInside) {
        // First contact: snap so the bee never flies in from off-screen.
        currentX = targetX;
        currentY = targetY;
        pointerInside = true;
        beeRef.current?.classList.add("is-visible");
      }
    };

    const hideBee = () => {
      pointerInside = false;
      beeRef.current?.classList.remove("is-visible");
    };

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      if (!lastFrameTime) {
        lastFrameTime = now;
        return;
      }
      const dt = Math.min(now - lastFrameTime, 50); // clamp tab-switch jumps
      lastFrameTime = now;

      // Exponential follow — frame-rate independent natural delay.
      const ease = 1 - Math.exp(-dt / FOLLOW_TAU_MS);
      const prevX = currentX;
      const prevY = currentY;
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;
      const frameVX = currentX - prevX;
      const frameVY = currentY - prevY;
      const smooth = Math.min(1, dt / 90);
      smoothVX += (frameVX - smoothVX) * smooth;
      smoothVY += (frameVY - smoothVY) * smooth;

      // Gentle hovering bob — alive even when the pointer rests.
      const bobX = Math.cos(now / 520) * SWAY_AMPLITUDE_PX;
      const bobY = Math.sin(now / 380) * BOB_AMPLITUDE_PX;
      if (beeRef.current) {
        beeRef.current.style.transform = `translate3d(${(currentX + bobX).toFixed(2)}px, ${(
          currentY + bobY
        ).toFixed(2)}px, 0)`;
      }

      // Bank into the direction of travel.
      const tilt = Math.max(-TILT_MAX_DEG, Math.min(TILT_MAX_DEG, smoothVX * TILT_GAIN));
      if (tiltRef.current) {
        tiltRef.current.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
      }
      // Face the way it flies.
      if (flipRef.current) {
        const nextFlip = smoothVX < -0.8 ? "scaleX(-1)" : "";
        if (flipRef.current.style.transform !== nextFlip) {
          flipRef.current.style.transform = nextFlip;
        }
      }

      // Honey trail: time-gated, distance-gated, budget-capped.
      const travelled = Math.hypot(currentX - lastDropX, currentY - lastDropY);
      if (
        pointerInside &&
        Math.hypot(smoothVX, smoothVY) > 0.35 &&
        now - lastDropAt >= TRAIL_INTERVAL_MS &&
        travelled >= TRAIL_MIN_DISTANCE_PX
      ) {
        spawnDrop(now);
      }
    };

    rafId = requestAnimationFrame(frame);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", hideBee);
    window.addEventListener("blur", hideBee);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", hideBee);
      window.removeEventListener("blur", hideBee);
      trailNode?.replaceChildren(); // drop every particle node
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="annaadhya-bee-layer" aria-hidden="true" data-testid="honey-bee-cursor">
      <div ref={trailRef} className="annaadhya-bee-trail" />
      <div ref={beeRef} className="annaadhya-bee">
        <span ref={flipRef} className="annaadhya-bee-flip">
          <span ref={tiltRef} className="annaadhya-bee-tilt">
            <BeeArtwork />
          </span>
        </span>
      </div>
      <style>{BEE_STYLES}</style>
    </div>
  );
}
