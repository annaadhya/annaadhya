/**
 * MediaService — self-hosted media storage on the hosting server's own disk (Hostinger).
 * The browser posts the file straight to the API (multipart/form-data); the API persists it
 * under the media root (MEDIA_STORAGE_DIR, default <cwd>/uploads) and returns the public URL.
 * Files are served back at /uploads/** by the API's static handler registered in boot.ts —
 * no external object storage, no third-party CDN, no secrets involved in the delivery path.
 * Constraints are enforced server-side; without a writable media directory the endpoint
 * returns a stable 503 with setup instructions (never fake success).
 */
import { Injectable, Inject } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AppError, badRequest, serviceUnconfigured, unprocessable } from "@annaadhya/data-core";
import type { ApiEnv } from "../../config/env";
import { resolveMediaDir } from "../../config/env";
import { API_ENV } from "../../data/data.module";

export interface MediaConstraints {
  maxFileSizeMb: number;
  allowedFormats: string[];
}

export interface StoredMedia {
  /** Absolute public URL to reference from products/categories/CMS content. */
  url: string;
  /** Path under the media root — the server-side storage key persisted with the doc. */
  storagePath: string;
  bytes: number;
  mimeType: string;
}

/** Permitted upload formats — mirrors the admin uploader's accept list. */
const MIME_BY_FORMAT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * Public origin a request was addressed through (proxy-aware). Managed hosts terminate
 * TLS in front of the Node process, so X-Forwarded-Proto / X-Forwarded-Host win over
 * the internal protocol/hostname. The raw Host header keeps its `:port` (req.hostname
 * strips it), which matters for direct-to-process access in local/dev setups.
 */
export function requestOrigin(headers: Record<string, unknown>, fallbackProto: unknown, fallbackHost: unknown): string {
  const first = (v: unknown) => String(v ?? "").split(",")[0].trim();
  const proto = first(headers["x-forwarded-proto"]) || first(fallbackProto) || "https";
  const host = first(headers["x-forwarded-host"]) || first(headers["host"]) || first(fallbackHost);
  return host ? `${proto}://${host}` : "";
}

@Injectable()
export class MediaService {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  constraints(): MediaConstraints {
    return { maxFileSizeMb: 10, allowedFormats: Object.keys(MIME_BY_FORMAT) };
  }

  private ensureWritable(): void {
    if (!this.env.mediaConfigured) {
      throw serviceUnconfigured(
        "Media storage is not available on this server. Set MEDIA_STORAGE_DIR to a writable directory (Hostinger Node.js hosting has a writable home directory) and redeploy.",
        { setup: "See docs/environment-setup.md - Media storage" },
      );
    }
  }

  /**
   * Persist an uploaded image under `<mediaRoot>/<folder>/<yyyymm>/<timestamp>-<rand>-<name>.<ext>`
   * and return its public URL + storage key. The timestamp+random prefix makes filenames
   * collision-proof; original names are sanitized and never trusted as paths.
   */
  async saveUpload(input: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
    folder: string;
    /** Origin the upload request arrived on (used when MEDIA_PUBLIC_BASE_URL is unset). */
    requestOrigin: string;
  }): Promise<StoredMedia> {
    this.ensureWritable();

    const constraints = this.constraints();
    if (!input.buffer || input.buffer.length === 0) {
      throw badRequest("The uploaded file is empty. Nothing was saved.");
    }
    if (input.size > constraints.maxFileSizeMb * 1024 * 1024 || input.buffer.length > constraints.maxFileSizeMb * 1024 * 1024) {
      throw badRequest(`File exceeds the ${constraints.maxFileSizeMb}MB upload limit. Nothing was saved.`);
    }

    // Folder: simple relative path segments only — no traversal, no absolute paths.
    const folder = input.folder.replace(/^\/+|\/+$/g, "");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-_/]{0,79}$/.test(folder) || folder.includes("//") || folder.split("/").includes("..")) {
      throw unprocessable("Folder must be a simple path segment (letters, digits, dashes, slashes).");
    }

    // Extension + declared mimetype must both be in the allowlist (defence in depth;
    // content-type headers are client-supplied and never trusted alone).
    const ext = (input.originalname.split(".").pop() ?? "").toLowerCase();
    const expectedMime = MIME_BY_FORMAT[ext];
    if (!expectedMime) {
      throw unprocessable(`Unsupported file type. Allowed formats: ${constraints.allowedFormats.join(", ")}.`);
    }
    if (input.mimetype && input.mimetype !== expectedMime) {
      throw unprocessable(`File content-type (${input.mimetype}) does not match its extension (.${ext}).`);
    }

    const base =
      input.originalname
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "image";
    const now = new Date();
    const monthBucket = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const rel = `${folder}/${monthBucket}/${now.getTime()}-${randomBytes(6).toString("hex")}-${base}.${ext}`;

    const mediaRoot = resolveMediaDir();
    const abs = resolve(mediaRoot, rel);
    if (!abs.startsWith(mediaRoot + "/")) {
      throw new AppError("unprocessable", "Resolved storage path escaped the media root.", 422);
    }

    await mkdir(resolve(abs, ".."), { recursive: true });
    await writeFile(abs, input.buffer);

    return {
      url: this.publicUrl(rel, input.requestOrigin),
      storagePath: rel,
      bytes: input.buffer.length,
      mimeType: expectedMime,
    };
  }

  /** Absolute public URL for a stored path. MEDIA_PUBLIC_BASE_URL wins over the request origin. */
  publicUrl(rel: string, requestOrigin: string): string {
    const origin = (this.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/+$/, "") || requestOrigin.replace(/\/+$/, "")).trim();
    return origin ? `${origin}/uploads/${rel}` : `/uploads/${rel}`;
  }

  /** HMAC for the short-lived export download links. */
  signDownloadToken(jobId: string, ttlMinutes = 15): string {
    const secret = this.env.DEV_TOKEN_SECRET ?? "annaadhya-export-signing";
    const exp = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
    const payload = `${jobId}.${exp}`;
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  verifyDownloadToken(token: string): { jobId: string } | null {
    const secret = this.env.DEV_TOKEN_SECRET ?? "annaadhya-export-signing";
    const [jobId, expStr, sig] = token.split(".");
    if (!jobId || !expStr || !sig) return null;
    const expected = createHmac("sha256", secret).update(`${jobId}.${expStr}`).digest("base64url");
    if (expected !== sig) return null;
    if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
    return { jobId };
  }
}
