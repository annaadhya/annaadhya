import Link from "next/link";
import Image from "next/image";

/**
 * Annaadhya brand lockup — official brand assets.
 *
 * Left:  the animated honey-drop video (800x800, ~8s seamless loop) — muted,
 *        autoplaying, plays inline on mobile, no native controls, circular
 *        badge crop. Its background is color-matched to the site's warm ivory
 *        surfaces, and the circular crop keeps it seamless on every canvas.
 * Right: the transparent name-only logo image (asset typography — never
 *        recreated as HTML text) — the 2026-11 golden script mark, trimmed to
 *        its 704x172 bounding box with a fully transparent background.
 *
 * Reduced motion: the video is hidden via `motion-reduce` and the static
 * standalone logo mark takes the exact same grid cell, so the brand stays
 * visible and aligned without JavaScript or layout shift. The video's poster
 * (a still of the animation's first frame) covers playback-unavailable cases.
 *
 * `dark` is accepted for call-site compatibility — both supplied assets are
 * transparent and read correctly on every canvas the design system uses, so
 * it is a deliberate no-op.
 */

const VIDEO_SRC = "/brand/annaadhya-animated-logo.mp4";
const POSTER_SRC = "/brand/annaadhya-animated-logo-poster.jpg";
const STATIC_MARK_SRC = "/brand/annaadhya-logo.png";
const NAME_SRC = "/brand/annaadhya-name-logo.png";

export function Logo({
  height = 40,
  withWordmark = true,
  compactOnMobile = false,
  wordmarkHeight,
  mobileHeight,
  stacked = false,
}: {
  /** Rendered size of the animated mark in px (the name lockup scales with it). */
  height?: number;
  withWordmark?: boolean;
  /** Accepted for call-site compatibility — both supplied assets are transparent
   *  and read correctly on every canvas the design system uses, so `dark` is a
   *  deliberate no-op and is intentionally not destructured. */
  dark?: boolean;
  /** Hide the name logo below the sm breakpoint (animated mark only). Used by
   *  the sticky header so the lockup can never force horizontal overflow on phones. */
  compactOnMobile?: boolean;
  /** Explicit rendered height for the name lockup, independent of the mark.
   *  Defaults to 0.72 * height (min 18px) so existing call sites keep their
   *  proportions; the header pins it so the wordmark stays unchanged while the
   *  animated mark fills the full navbar height. */
  wordmarkHeight?: number;
  /** Optional LARGER mark size for phones (< sm). Scales only the animated mark
   *  via the `.brand-mark-size` rule (pure CSS, no layout shift or hydration
   *  mismatch); desktop keeps `height` untouched. The sticky header pairs this
   *  with a matching responsive bar height so nothing clips or overlaps. */
  mobileHeight?: number;
  /** Stack the name logo UNDER the mark (footer brand column): the mark reads
   *  larger as the anchor, the script wordmark sits beneath it. Row layout
   *  (default) keeps the classic side-by-side lockup for header/checkout. */
  stacked?: boolean;
}) {
  const nameHeight = wordmarkHeight ?? Math.max(18, Math.round(height * 0.72));

  return (
    <Link
      href="/"
      className={`flex shrink-0 items-center gap-2.5 ${stacked ? "flex-col items-start gap-3" : ""}`}
      aria-label="Annaadhya Products home"
    >
      {/* Animated mark + static reduced-motion fallback stacked in one grid cell. */}
      <span
        className="brand-mark-size grid shrink-0"
        style={
          {
            "--logo-size": `${height}px`,
            ...(mobileHeight ? { "--logo-size-mobile": `${mobileHeight}px` } : {}),
          } as React.CSSProperties
        }
      >
        <video
          className="col-start-1 row-start-1 h-full w-full rounded-full object-contain motion-reduce:hidden"
          width={800}
          height={800}
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden="true"
        />
        <Image
          className="col-start-1 row-start-1 h-full w-full object-contain motion-safe:hidden"
          src={STATIC_MARK_SRC}
          alt=""
          width={477}
          height={512}
          unoptimized
        />
      </span>

      {withWordmark && (
        <Image
          src={NAME_SRC}
          alt=""
          width={704}
          height={172}
          priority
          unoptimized
          className={compactOnMobile ? "hidden sm:block" : ""}
          style={{ height: nameHeight, width: "auto" }}
        />
      )}
    </Link>
  );
}
