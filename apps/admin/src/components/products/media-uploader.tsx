"use client";
/**
 * MediaUploader — admin file-picker for Cloudinary direct uploads.
 *
 * Flow (the API secret never leaves the server):
 *   1. API issues short-lived signed params  → POST /admin/media/upload-signature
 *   2. Browser posts the file STRAIGHT to Cloudinary with those params
 *   3. API validates provenance              → POST /admin/media/register
 *   4. The delivered URL + public id fill the product's image row
 *
 * Honest states only: client-side constraint violations, server-unconfigured
 * (503 with setup hint) and Cloudinary's own errors are surfaced verbatim —
 * never a fake success. Nothing is stored unless every step succeeds.
 */
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/** Matches the API's UploadSignature response (apps/api …/media.service.ts). */
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

export interface UploadedMedia {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
}

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
  error?: { message?: string };
}

const DEFAULT_FOLDER = "annaadhya/products";

type Phase = "idle" | "signature" | "uploading" | "registering";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  signature: "Requesting upload permission…",
  uploading: "Uploading to Cloudinary…",
  registering: "Registering asset…",
};

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

  const cloudinaryUnconfigured = mode?.cloudinaryConfigured === false;
  const busy = phase !== "idle";

  async function handleFile(file: File) {
    setError(null);
    setLastFileName(file.name);

    // --- client-side constraints (mirrors the server's signed constraints) ---
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["jpg", "jpeg", "png", "webp", "avif"];
    if (!allowed.includes(ext)) {
      setError(`"${file.name}" is not a supported image (jpg, jpeg, png, webp, avif only). Nothing was uploaded.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`"${file.name}" is larger than 10 MB. Nothing was uploaded.`);
      return;
    }

    try {
      // --- 1. short-lived signed params from the API ---
      setPhase("signature");
      const sig = await api<UploadSignature>("/admin/media/upload-signature", {
        method: "POST",
        body: { folder: DEFAULT_FOLDER },
      });

      // --- 2. direct browser → Cloudinary upload (no secret involved) ---
      setPhase("uploading");
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("signature", sig.signature);
      form.append("folder", sig.folder);
      form.append("eager", sig.eager);
      const upRes = await fetch(sig.uploadUrl, { method: "POST", body: form });
      const upBody = (await upRes.json().catch(() => null)) as CloudinaryUploadResponse | null;
      if (!upRes.ok || !upBody?.secure_url || !upBody.public_id) {
        throw new Error(
          upBody?.error?.message
            ? `Cloudinary rejected the upload: ${upBody.error.message}`
            : `Cloudinary upload failed (status ${upRes.status}). Nothing was saved.`,
        );
      }

      // --- 3. provenance check + acknowledgement ---
      setPhase("registering");
      await api("/admin/media/register", {
        method: "POST",
        body: {
          publicId: upBody.public_id,
          url: upBody.secure_url,
          ...(upBody.width ? { width: upBody.width } : {}),
          ...(upBody.height ? { height: upBody.height } : {}),
          ...(upBody.bytes ? { bytes: upBody.bytes } : {}),
        },
      });

      setPhase("idle");
      onUploaded({
        url: upBody.secure_url,
        publicId: upBody.public_id,
        ...(upBody.width ? { width: upBody.width } : {}),
        ...(upBody.height ? { height: upBody.height } : {}),
        ...(upBody.bytes ? { bytes: upBody.bytes } : {}),
      });
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError) {
        setError(
          err.status === 503
            ? "Image hosting is not configured on the server yet. The owner needs to set the CLOUDINARY_* environment variables in the API service (see docs/environment-setup.md). Nothing was uploaded."
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
          disabled={disabled || busy || cloudinaryUnconfigured}
          onClick={() => {
            setError(null);
            inputRef.current?.click();
          }}
        >
          {busy ? PHASE_LABEL[phase] : children}
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
      {cloudinaryUnconfigured && !busy ? (
        <span className="text-[0.7rem] text-ink/50">
          Image hosting isn&apos;t configured on the server — ask the owner to set the CLOUDINARY_* env vars.
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
