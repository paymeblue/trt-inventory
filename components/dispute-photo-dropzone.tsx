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
          className="sr-only"
          disabled={disabled}
          onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected evidence"
            className="mb-3 max-h-32 max-w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-sm font-medium text-[color:var(--text)]">
            Drag and drop an image here
          </p>
        )}
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          or click to browse · max {(DISPUTE_PHOTO_MAX_BYTES / 1_000_000).toFixed(1)} MB
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
