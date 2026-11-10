"use client";
/** Product gallery in the approved Stitch composition: large 4:3 showcase with hover
 *  zoom, badge chip, and a thumbnail strip that appears only when a product genuinely
 *  has multiple images (demo catalogue ships one image per product — the strip is
 *  Cloudinary-ready and stays hidden until then). Includes a click-to-enlarge overlay.
 *  Existing product images and their mapping are used as-is, never substituted. */
import { useEffect, useState } from "react";
import type { ProductImage } from "@/lib/types";
import { IconX } from "./icons";

export function ProductGallery({
  images,
  name,
  typeLabel,
}: {
  images: ProductImage[];
  name: string;
  typeLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  // Keep the selection valid if the product changes between routes.
  useEffect(() => setIndex(0), [images]);

  // Esc closes the zoom overlay.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const safeIndex = Math.min(index, Math.max(0, images.length - 1));
  const current: ProductImage | undefined = images[safeIndex];
  const src = current?.url ?? "/demo-images/placeholder.svg";
  const alt = current?.alt || name;
  const isDemoAsset = src.startsWith("/demo-images/");
  const many = images.length > 1;

  return (
    <div className="flex flex-col gap-space-md">
      {/* Main showcase */}
      <div className="group relative w-full overflow-hidden rounded-xl bg-surface-container-low shadow-md">
        <div className="relative aspect-[4/3] w-full cursor-zoom-in" onClick={() => setZoomed(true)}>
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        {typeLabel && (
          <span className="absolute left-4 top-4 rounded bg-surface-container-lowest/90 px-space-sm py-1 text-label-sm font-bold uppercase tracking-widest text-primary shadow-sm backdrop-blur-md">
            {typeLabel}
          </span>
        )}
        <button
          type="button"
          aria-label="Enlarge product photo"
          onClick={() => setZoomed(true)}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:bg-surface-container-lowest"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7.5" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v6M8 11h6" />
          </svg>
        </button>
      </div>

      {/* Thumbnail strip — only when the product truly has multiple images */}
      {many && (
        <div
          className="grid grid-cols-4 gap-space-sm"
          role="group"
          aria-label={`${name} photo thumbnails`}
        >
          {images.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              aria-label={`Show photo ${i + 1} of ${images.length}`}
              aria-pressed={i === safeIndex}
              onClick={() => setIndex(i)}
              className={`group relative aspect-square overflow-hidden rounded-lg bg-surface-container-low shadow-sm transition-all ${
                i === safeIndex ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
              }`}
            >
              <img
                src={img.url}
                alt={img.alt || `${name} photo ${i + 1}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      {/* Honest asset note — disappears automatically once real photography replaces demo SVGs */}
      {isDemoAsset && (
        <p className="text-center text-[0.7rem] text-on-surface-variant">
          Demo imagery — replaced with real product photography before launch.
        </p>
      )}

      {/* Zoom overlay */}
      {zoomed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} enlarged photo`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/80 p-margin-mobile backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <div className="relative max-h-full w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={alt}
              className="mx-auto max-h-[85vh] w-auto rounded-xl object-contain shadow-lg"
            />
            <button
              type="button"
              aria-label="Close enlarged photo"
              onClick={() => setZoomed(false)}
              className="absolute -top-3 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface shadow-lg transition-colors hover:bg-surface-container-high sm:-right-3"
              autoFocus
            >
              <IconX size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
