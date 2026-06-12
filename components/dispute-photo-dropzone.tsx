"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DISPUTE_PHOTO_MAX_BYTES,
  validateDisputePhotoFile,
} from "@/lib/dispute-photo-shared";

type DisputePhotoDropzoneProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
};

export function DisputePhotoDropzone({
  file,
  onFileChange,
  disabled = false,
}: DisputePhotoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const applyFile = useCallback(
    (next: File | null) => {
      if (!next) {
        setLocalError(null);
        onFileChange(null);
        return;
      }
      const msg = validateDisputePhotoFile(next);
      if (msg) {
        setLocalError(msg);
        return;
      }
      setLocalError(null);
      onFileChange(next);
    },
    [onFileChange],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) applyFile(dropped);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10"
            : "border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 hover:border-[color:var(--primary)]/50"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
        aria-label="Upload dispute photo"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"
          capture="environment"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected evidence"
            className="mb-3 max-h-40 max-w-full rounded-lg object-contain shadow"
          />
        ) : (
          <>
            <svg
              className="mb-2 h-10 w-10 text-[color:var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p className="text-sm font-semibold text-[color:var(--text)]">
              Tap to take a photo or upload evidence
            </p>
          </>
        )}
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          Camera · drag &amp; drop · or browse · max{" "}
          {(DISPUTE_PHOTO_MAX_BYTES / 1_000_000).toFixed(1)} MB
        </p>
        {file ? (
          <p className="mt-2 max-w-full truncate text-xs font-mono text-[color:var(--text)]">
            {file.name}
          </p>
        ) : null}
      </div>
      {file ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            applyFile(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          Remove photo
        </button>
      ) : null}
      {localError ? (
        <p className="text-xs text-[color:var(--danger)]">{localError}</p>
      ) : null}
    </div>
  );
}
