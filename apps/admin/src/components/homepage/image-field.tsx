"use client";
/**
 * ImageField — URL input + MediaUploader pair used by every homepage image slot.
 * The URL stays authoritative (paste any approved path/URL); uploading fills the
 * same input with the delivered Cloudinary URL. A live thumbnail previews the
 * current value so broken URLs are obvious before saving.
 */
import { Field, Input } from "@/components/ui/form";
import { MediaUploader } from "@/components/products/media-uploader";

export function ImageField({
  label,
  value,
  onChange,
  disabled,
  hint,
  uploadLabel = "Upload",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  hint?: string;
  uploadLabel?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={600}
          placeholder="https://… or /images/…"
          className="min-w-0 flex-1 font-mono"
          disabled={disabled}
          aria-label={label}
        />
        <MediaUploader onUploaded={(media) => onChange(media.url)} disabled={disabled}>
          {uploadLabel}
        </MediaUploader>
        {value.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.trim()}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-md border border-outline-variant/40 object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
            onLoad={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "visible";
            }}
          />
        ) : null}
      </div>
    </Field>
  );
}
