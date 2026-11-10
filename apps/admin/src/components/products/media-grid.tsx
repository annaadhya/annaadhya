"use client";
/**
 * MediaGrid — the design's "Product Visuals & Media" bento grid.
 *
 *  - Tile 0 is the Primary Hero (larger tile, gold badge); images[0] is what the
 *    storefront renders as the product's main image, so "Set as Primary" moves a
 *    tile to the front of the ordered list.
 *  - Uploads use the project's real Cloudinary signed-direct-upload flow:
 *    POST /admin/media/upload-signature → browser uploads straight to
 *    api.cloudinary.com → POST /admin/media/register to confirm provenance.
 *    The API secret never reaches the client; the request is refused with 503
 *    when Cloudinary env vars are not configured on the server.
 *  - When uploads are unavailable (no media:write permission / Cloudinary not
 *    configured) the grid falls back to the ordered URL+alt rows that existed
 *    before — honest UI, no fake progress.
 *  - Newly picked files preview via object URLs that are revoked once the real
 *    Cloudinary URL (or a failure) replaces them.
 */
import { useEffect, useRef, useState } from "react";
import { ApiError, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ImageRow } from "./product-form";

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  eager: string;
  uploadUrl: string;
  constraints: { maxFileSizeMb: number; allowedFormats: string[] };
}

interface UploadJob {
  key: string;
  name: string;
  previewUrl: string;
  progress: number;
  error?: string;
}

const MAX_IMAGES = 10; // mirrors productUpsertSchema images.max(10)

const MenuIcon = ({ path, className = "h-4 w-4" }: { path: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={path} />
  </svg>
);

function altFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 160);
}

export function MediaGrid({
  rows,
  setRows,
  disabled,
}: {
  rows: ImageRow[];
  setRows: React.Dispatch<React.SetStateAction<ImageRow[]>>;
  disabled?: boolean;
}) {
  const { principal, mode } = useAuth();
  const canUpload = Boolean(principal && can(principal, "media:write")) && mode?.cloudinaryConfigured === true;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlAlt, setUrlAlt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  // Revoke any surviving object previews when the editor unmounts.
  useEffect(() => {
    const list = jobsRef.current;
    return () => list.forEach((j) => URL.revokeObjectURL(j.previewUrl));
  }, []);

  const remaining = MAX_IMAGES - rows.length - jobs.length;

  function patchAlt(key: string, alt: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, alt } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function makePrimary(key: string) {
    setRows((prev) => {
      const tile = prev.find((r) => r.key === key);
      if (!tile) return prev;
      return [tile, ...prev.filter((r) => r.key !== key)];
    });
  }

  function addUrlRow() {
    const url = urlDraft.trim();
    if (url === "") return;
    if (rows.length + jobsRef.current.length >= MAX_IMAGES) {
      setNotice(`Up to ${MAX_IMAGES} images per product.`);
      return;
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
      setNotice("Image URL must be absolute (https://…) or a site-rooted path (/demo-images/…)");
      return;
    }
    setRows((prev) => [...prev, { key: `i${Math.random().toString(36).slice(2, 9)}`, url, alt: urlAlt.trim() }]);
    setUrlDraft("");
    setUrlAlt("");
    setNotice(null);
  }

  async function uploadOne(file: File, jobKey: string): Promise<void> {
    const sig = await apiPost<UploadSignature>("/admin/media/upload-signature", { folder: "annaadhya/products" });

    const constraints = sig.constraints ?? { maxFileSizeMb: 10, allowedFormats: ["jpg", "jpeg", "png", "webp", "avif"] };
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (file.size > constraints.maxFileSizeMb * 1024 * 1024) {
      throw new ApiError(`${file.name} is larger than ${constraints.maxFileSizeMb}MB.`, "bad_request", 0);
    }
    if (constraints.allowedFormats.length > 0 && !constraints.allowedFormats.includes(ext)) {
      throw new ApiError(`${file.name}: supported formats are ${constraints.allowedFormats.join(", ")}.`, "bad_request", 0);
    }

    const cloudinaryUrl = await new Promise<{ secure_url: string; public_id: string; width: number; height: number; bytes: number }>(
      (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", sig.uploadUrl);
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90); // keep 10% for register
            setJobs((prev) => prev.map((j) => (j.key === jobKey ? { ...j, progress: pct } : j)));
          }
        });
        xhr.addEventListener("load", () => {
          try {
            const body = JSON.parse(xhr.responseText) as { secure_url?: string; public_id?: string; width?: number; height?: number; bytes?: number; error?: { message?: string } };
            if (xhr.status >= 200 && xhr.status < 300 && body.secure_url && body.public_id) {
              resolve({
                secure_url: body.secure_url,
                public_id: body.public_id,
                width: body.width ?? 0,
                height: body.height ?? 0,
                bytes: body.bytes ?? file.size,
              });
            } else {
              reject(new ApiError(body.error?.message ?? `Cloudinary upload failed (${xhr.status}).`, "internal", xhr.status));
            }
          } catch {
            reject(new ApiError(`Cloudinary upload failed (${xhr.status}).`, "internal", xhr.status));
          }
        });
        xhr.addEventListener("error", () => reject(new ApiError("Network error while uploading to Cloudinary.", "network_error", 0)));

        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sig.apiKey);
        fd.append("timestamp", String(sig.timestamp));
        fd.append("signature", sig.signature);
        fd.append("eager", sig.eager);
        fd.append("folder", sig.folder);
        xhr.send(fd);
      },
    );

    // Confirm provenance with the API before the asset may be referenced.
    await apiPost("/admin/media/register", {
      publicId: cloudinaryUrl.public_id,
      url: cloudinaryUrl.secure_url,
      width: cloudinaryUrl.width || undefined,
      height: cloudinaryUrl.height || undefined,
      bytes: cloudinaryUrl.bytes || undefined,
    });

    return new Promise((resolve) => {
      setJobs((prev) => prev.map((j) => (j.key === jobKey ? { ...j, progress: 100 } : j)));
      setRows((prev) => {
        if (prev.length >= MAX_IMAGES) return prev;
        return [
          ...prev,
          {
            key: jobKey,
            url: cloudinaryUrl.secure_url,
            cloudinaryPublicId: cloudinaryUrl.public_id,
            alt: altFromFileName(file.name),
            width: cloudinaryUrl.width || undefined,
            height: cloudinaryUrl.height || undefined,
          },
        ];
      });
      resolve();
    });
  }

  async function handleFiles(files: FileList | File[]) {
    if (disabled) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    if (remaining <= 0) {
      setNotice(`Up to ${MAX_IMAGES} images per product.`);
      return;
    }

    for (const file of list.slice(0, Math.max(0, remaining))) {
      const jobKey = `up${Math.random().toString(36).slice(2, 9)}`;
      const previewUrl = URL.createObjectURL(file);
      setJobs((prev) => [...prev, { key: jobKey, name: file.name, previewUrl, progress: 3 }]);
      try {
        await uploadOne(file, jobKey);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        setJobs((prev) => prev.map((j) => (j.key === jobKey ? { ...j, error: message } : j)));
        // leave the failed tile visible briefly, then drop it
        window.setTimeout(() => {
          setJobs((prev) => {
            const job = prev.find((j) => j.key === jobKey);
            if (job) URL.revokeObjectURL(job.previewUrl);
            return prev.filter((j) => j.key !== jobKey);
          });
        }, 6000);
        continue;
      }
      URL.revokeObjectURL(previewUrl);
      setJobs((prev) => prev.filter((j) => j.key !== jobKey));
    }
  }

  const tiles = rows;

  return (
    <div>
      <p className="mb-4 text-body-sm text-on-surface-variant">
        High-resolution imagery reflecting authentic textures, lighting and packaging. High-res JPG, PNG or WebP up to 10MB.
      </p>

      <div
        className={`grid grid-cols-2 gap-4 md:grid-cols-4${dragOver ? " rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : ""}`}
        onDragOver={(e) => {
          if (disabled || !canUpload) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled || !canUpload) return;
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        {tiles.map((img, idx) => {
          const isPrimary = idx === 0;
          return (
            <div
              key={img.key}
              className={`group relative overflow-hidden rounded-xl bg-surface-container shadow-sm ${
                isPrimary ? "col-span-2 row-span-2" : "h-36"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary/remote thumbs, plain img keeps the admin bundle lean */}
              <img
                src={img.url}
                alt={img.alt}
                className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${isPrimary ? "h-72 md:h-80" : "h-full"}`}
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

              {isPrimary ? (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-tertiary-fixed px-2 py-1 text-label-sm font-bold text-on-tertiary-fixed shadow-sm">
                  <MenuIcon path="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8Z" className="h-3.5 w-3.5" />
                  Primary Hero
                </span>
              ) : (
                <span className="absolute left-2 top-2 rounded bg-surface-container-lowest/90 px-1.5 py-0.5 text-[10px] font-bold text-on-surface">
                  Gallery {idx + 1}
                </span>
              )}

              {!disabled ? (
                <div className={`absolute right-2 top-2 flex items-center gap-1 ${isPrimary ? "" : "opacity-0 transition-opacity group-hover:opacity-100"}`}>
                  {!isPrimary ? (
                    <button
                      type="button"
                      title="Set as primary"
                      aria-label={`Set image ${idx + 1} as primary`}
                      onClick={() => makePrimary(img.key)}
                      className="rounded-full bg-surface-container-lowest/90 p-1.5 text-on-surface shadow-sm transition-colors hover:text-primary"
                    >
                      <MenuIcon path="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8Z" className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    title="Remove image"
                    aria-label={`Remove image ${idx + 1}`}
                    onClick={() => removeRow(img.key)}
                    className="rounded-full bg-surface-container-lowest/90 p-1.5 text-error shadow-sm transition-colors hover:bg-surface-container-lowest"
                  >
                    <MenuIcon path="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {/* Alt text — editable caption overlay */}
              <div className={`absolute inset-x-2 bottom-2 ${isPrimary ? "" : "opacity-0 transition-opacity group-hover:opacity-100"}`}>
                <input
                  aria-label={`Alt text for image ${idx + 1}`}
                  value={img.alt}
                  disabled={disabled}
                  onChange={(e) => patchAlt(img.key, e.target.value)}
                  placeholder="Describe this image (alt text)"
                  className="w-full rounded-lg bg-surface-container-lowest/95 px-2.5 py-1.5 text-xs text-on-surface shadow-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:shadow-[0_0_0_2px_#541620] disabled:opacity-70"
                />
              </div>
            </div>
          );
        })}

        {/* In-flight upload tiles */}
        {jobs.map((job) => (
          <div key={job.key} className="relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-xl bg-surface-container-low p-2 text-center shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- transient local preview */}
            <img src={job.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="relative z-10 w-full">
              {job.error ? (
                <>
                  <p className="text-[11px] font-semibold text-error" title={job.error}>
                    {job.error.length > 60 ? `${job.error.slice(0, 60)}…` : job.error}
                  </p>
                  <p className="mt-1 text-[10px] text-on-surface-variant">Removing…</p>
                </>
              ) : (
                <>
                  <p className="truncate px-2 text-[11px] font-semibold text-on-surface" title={job.name}>
                    {job.name}
                  </p>
                  <div className="mx-auto mt-2 h-1.5 w-4/5 overflow-hidden rounded-full bg-surface-container-highest">
                    <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-on-surface-variant">Uploading {job.progress}%</p>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Dropzone plinth */}
        {canUpload && !disabled ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={remaining <= 0}
            className={`relative flex min-h-36 flex-col items-center justify-center rounded-xl bg-surface-container-low p-4 text-center shadow-[0_0_0_1.5px_dashed_rgba(134,114,115,0.4)] transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-lowest text-primary transition-transform group-hover:scale-110">
              <MenuIcon path="M12 16V8m0 0-3 3m3-3 3 3M4 20h16" className="h-5 w-5" />
            </span>
            <span className="text-label-md font-semibold text-primary">Upload Photo</span>
            <span className="mt-0.5 text-[11px] text-outline">Drag files or browse</span>
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {/* Status / fallback row */}
      <div className="mt-4 rounded-lg bg-surface-container-low px-4 py-3">
        {notice ? (
          <p role="alert" className="text-xs font-semibold text-error">
            {notice}
          </p>
        ) : null}
        {canUpload && !disabled ? (
          <p className="text-xs text-on-surface-variant">
            {rows.length + jobs.length} of {MAX_IMAGES} uploaded. Uploads go straight to the shop&apos;s Cloudinary CDN.
          </p>
        ) : (
          <p className="text-xs text-on-surface-variant">
            {disabled
              ? "You have read-only access to this product's images."
              : mode?.cloudinaryConfigured === false
                ? "Direct uploads activate once Cloudinary is connected on the server — paste image URLs below for now."
                : "Paste hosted image URLs below (first image is the storefront's primary photo)."}
          </p>
        )}

        {!disabled ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://res.cloudinary.com/…"
              aria-label="Image URL"
              className="h-9 flex-1 rounded-lg bg-surface-container-lowest px-3 text-body-sm text-on-surface shadow-[0_0_0_1px_rgba(217,193,194,0.6)] placeholder:text-on-surface-variant/40 focus:outline-none focus:shadow-[0_0_0_2px_#541620]"
            />
            <input
              type="text"
              value={urlAlt}
              onChange={(e) => setUrlAlt(e.target.value)}
              placeholder="Alt text"
              aria-label="Image alt text"
              className="h-9 w-full rounded-lg bg-surface-container-lowest px-3 text-body-sm text-on-surface shadow-[0_0_0_1px_rgba(217,193,194,0.6)] placeholder:text-on-surface-variant/40 focus:outline-none focus:shadow-[0_0_0_2px_#541620] sm:w-44"
            />
            <button
              type="button"
              onClick={addUrlRow}
              className="h-9 shrink-0 rounded-lg bg-surface-container px-4 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
            >
              Add image
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
