"use client";
/**
 * MediaUploader — admin file-picker for self-hosted media uploads (Hostinger disk).
 *
 * Flow (single hop, no third-party service):
 *   1. Browser POSTs the file multipart to the API → POST /admin/media/upload
 *   2. API writes it under MEDIA_STORAGE_DIR and serves it back at /uploads/**
 *   3. The returned URL fills the image field it was picked for
 *
 * Honest states only: client-side constraint violations, server-unavailable
 * (503 with setup hint) and API errors are surfaced verbatim — never a fake
 * success. Nothing is stored unless the upload succeeds.
 */
import { useRef, useState } from "react";
import { ApiError, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/** Matches the API's StoredMedia response (apps/api …/media.service.ts). */
export interface UploadedMedia {
  url: string;
  /** Path under the API's media root — the server-side storage key. */
  storagePath: string;
  bytes: number;
  mimeType: string;
}

const DEFAULT_FOLDER = "annaadhya/products";
const MAX_FILE_MB = 10;
const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp", "avif"];

type Phase = "idle" | "uploading";

export function MediaUploader({
  onUploaded,
  disabled = false,
  variant = "outline",
  size = "sm",
  children,
}: {
  onUploaded: (media: UploadedMedia) => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  const { mode } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  const mediaUnavailable = mode?.mediaConfigured === false;
  const busy = phase !== "idle";

  async function handleFile(file: File) {
    setError(null);
    setLastFileName(file.name);

    // --- client-side constraints (mirrors the server's enforced limits) ---
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_FORMATS.includes(ext)) {
      setError(`"${file.name}" is not a supported image (jpg, jpeg, png, webp, avif only). Nothing was uploaded.`);
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`"${file.name}" is larger than ${MAX_FILE_MB} MB. Nothing was uploaded.`);
      return;
    }

    try {
      setPhase("uploading");
      const stored = await uploadFile<UploadedMedia>("/admin/media/upload", file, DEFAULT_FOLDER);
      setPhase("idle");
      onUploaded(stored);
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError) {
        setError(
          err.status === 503
            ? "Media storage is not available on the server yet. The owner needs to set MEDIA_STORAGE_DIR (a writable directory) in the API service (see docs/environment-setup.md). Nothing was uploaded."
            : err.message,
        );
      } else {
        setError(err instanceof Error ? err.message : "Upload failed. Nothing was saved.");
      }
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2">
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={disabled || busy || mediaUnavailable}
          onClick={() => {
            setError(null);
            inputRef.current?.click();
          }}
        >
          {busy ? "Uploading…" : children}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file after a failure
            if (file) void handleFile(file);
          }}
        />
      </span>
      {mediaUnavailable && !busy ? (
        <span className="text-[0.7rem] text-ink/50">
          Media storage isn&apos;t available on the server — ask the owner to set MEDIA_STORAGE_DIR.
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="max-w-md text-[0.7rem] leading-snug text-red-700">
          {error}
        </span>
      ) : null}
      {!error && lastFileName && phase === "idle" ? (
        <span className="text-[0.7rem] text-ink/40">Last file picked: {lastFileName}</span>
      ) : null}
    </span>
  );
}
