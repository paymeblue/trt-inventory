"use client";

import { useEffect, useRef, useState } from "react";

import { normalizeScanBarcode } from "@/lib/scan-deep-link";
import { useContinuousScanner } from "@/lib/use-continuous-scanner";
import { primeScanFeedbackAudio } from "@/lib/scan-feedback";
import {
  ScanSessionOverlay,
  type ScanSessionFlash,
} from "@/components/scan-session-overlay";

export type ReceiveFlash = ScanSessionFlash;

interface ReceiveScannerProps {
  onScan: (barcode: string) => void;
  /** True while a scan request is in flight — pauses new decodes. */
  busy: boolean;
  /** Every item on the order is already resolved. */
  allDone: boolean;
  remaining: number;
  total: number;
  /** Latest outcome from the parent, used to drive beep/vibrate + the flash. */
  flash: ReceiveFlash | null;
}

/**
 * Big circular trigger that opens a full-screen, continuously-scanning
 * camera: point-and-go, no re-opening the camera between items. Plays a
 * distinct beep/vibrate per outcome, holds the screen awake for the
 * duration, and closes itself automatically once the order is fulfilled.
 */
export function ReceiveScanner({
  onScan,
  busy,
  allDone,
  remaining,
  total,
  flash,
}: ReceiveScannerProps) {
  const [open, setOpen] = useState(false);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const { videoRef, error: cameraError } = useContinuousScanner({
    active: open,
    onDecode: (text) => {
      if (busyRef.current) return;
      const barcode = normalizeScanBarcode(text);
      if (!barcode) return;
      onScan(barcode);
    },
  });

  return (
    <>
      <div className="card flex flex-col items-center gap-3 p-8">
        <button
          type="button"
          onClick={() => {
            primeScanFeedbackAudio();
            setOpen(true);
          }}
          disabled={allDone}
          className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-full bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Start receiving — opens the camera for continuous scanning"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-8 w-8"
            aria-hidden
          >
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
          <span className="text-sm font-bold tracking-wide">RECEIVE</span>
        </button>
        <p className="text-center text-xs text-[color:var(--text-muted)]">
          Opens the camera once — keep scanning items back-to-back until this
          delivery is fulfilled.
        </p>
      </div>

      <ScanSessionOverlay
        open={open}
        onClose={() => setOpen(false)}
        title="Receiving…"
        remaining={remaining}
        total={total}
        busy={busy}
        allDone={allDone}
        flash={flash}
        errorMessage={cameraError}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-dashed border-white/60 sm:inset-16" />
      </ScanSessionOverlay>
    </>
  );
}
