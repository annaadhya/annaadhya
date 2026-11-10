/**
 * MediaService — Cloudinary signed-direct-upload authorization.
 * The API secret NEVER leaves the server: the browser requests short-lived upload params,
 * uploads directly to Cloudinary, then registers the resulting asset.
 * Without credentials the endpoint returns a stable 503 with setup instructions (never fake success).
 */
import { Injectable } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import { AppError, serviceUnconfigured } from "@annaadhya/data-core";
import { Inject } from "@nestjs/common";
import type { ApiEnv } from "../../config/env";
import { API_ENV } from "../../data/data.module";

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  /** Signed eager transformation — MUST be sent verbatim in the upload form or
   *  Cloudinary rejects the whole request with "Invalid signature". */
  eager: string;
  uploadUrl: string;
  constraints: { maxFileSizeMb: number; allowedFormats: string[] };
}

@Injectable()
export class MediaService {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  uploadSignature(folder: string): UploadSignature {
    if (!this.env.cloudinaryConfigured) {
      throw serviceUnconfigured(
        "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
        { setup: "See docs/environment-setup.md - Cloudinary" },
      );
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const eager = "c_limit,w_1600,q_auto/f_auto";
    // Cloudinary signature = SHA1 of sorted params + api secret
    const params = `eager=${eager}&folder=${folder}&timestamp=${timestamp}${this.env.CLOUDINARY_API_SECRET}`;
    const signature = createHash("sha1").update(params).digest("hex");
    return {
      cloudName: this.env.CLOUDINARY_CLOUD_NAME!,
      apiKey: this.env.CLOUDINARY_API_KEY!,
      timestamp,
      signature,
      folder,
      eager,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      constraints: { maxFileSizeMb: 10, allowedFormats: ["jpg", "jpeg", "png", "webp", "avif"] },
    };
  }

  /**
   * Validate and acknowledge a completed upload. The asset itself is attached to product
   * images through the product upsert endpoint; this step confirms provenance (folder +
   * extension constraints) before the asset may be referenced.
   */
  validateUploadedAsset(input: { publicId: string; url: string; folder: string }): { accepted: true; publicId: string } {
    if (!this.env.cloudinaryConfigured) {
      throw serviceUnconfigured("Cloudinary is not configured on this server.");
    }
    if (!input.publicId.startsWith(input.folder)) {
      throw new AppError("unprocessable", `Uploaded asset must live under the ${input.folder} folder`, 422);
    }
    if (!/\.(jpe?g|png|webp|avif)$/i.test(input.url) && !input.url.includes("/upload/")) {
      throw new AppError("unprocessable", "Asset URL does not look like a Cloudinary delivery URL", 422);
    }
    return { accepted: true, publicId: input.publicId };
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
