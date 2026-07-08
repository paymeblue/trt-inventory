'use client';

import { useEffect, useRef, useState } from 'react';

import { normalizeScanBarcode } from '@/lib/scan-deep-link';
import { useHardwareScanner } from '@/lib/use-hardware-scanner';
import { primeScanFeedbackAudio } from '@/lib/scan-feedback';
import {
  ScanSessionOverlay,
  type ScanSessionFlash,
} from '@/components/scan-session-overlay';

interface PhysicalReceiveScannerProps {
  onScan: (barcode: string) => void;
  /** True while a scan request is in flight — pauses new decodes. */
  busy: boolean;
  /** Every item on the order is already resolved. */
  allDone: boolean;
  remaining: number;
  total: number;
  /** Latest outcome from the parent, used to drive beep/vibrate + the flash. */
  flash: ScanSessionFlash | null;
}

/**
 * Camera-free counterpart to `ReceiveScanner` for receivers using a
 * USB/Bluetooth "keyboard wedge" barcode scanner (e.g. Sunlux XL361OS)
 * instead of their phone camera — common when the assigned receiver
 * doesn't have a phone good enough to scan reliably. Opens the same
 * full-screen session chrome, but listens for hardware keystrokes instead
 * of decoding video.
 */
export function PhysicalReceiveScanner({
  onScan,
  busy,
  allDone,
  remaining,
  total,
  flash,
}: PhysicalReceiveScannerProps) {
  const [open, setOpen] = useState(false);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useHardwareScanner({
    active: open,
    onScan: (text) => {
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
          className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-full border-2 border-[color:var(--primary)] bg-[color:var(--surface)] text-[color:var(--primary)] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Start receiving with a physical barcode scanner"
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
            <path d="M4 5v14M8 5v14M11 5v14M15 5v10M18 5v14M21 5v14" />
          </svg>
          <span className="text-xs font-bold leading-tight tracking-wide">
            PHYSICAL
            <br />
            SCAN
          </span>
        </button>
        <p className="text-center text-xs text-[color:var(--text-muted)]">
          For a USB/Bluetooth barcode scanner — pull the trigger on each item
          back-to-back, no camera needed.
        </p>
      </div>

      <ScanSessionOverlay
        open={open}
        onClose={() => setOpen(false)}
        title="Scanning…"
        remaining={remaining}
        total={total}
        busy={busy}
        allDone={allDone}
        flash={flash}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-white">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-3xl">
            |||||||||||
          </div>
          <div className="text-center">
            <div className="text-base font-semibold">
              Ready — scan the next item
            </div>
            <p className="mt-1 max-w-xs text-center text-xs text-white/70">
              Point the scanner at each barcode and pull the trigger. No need to
              tap anything between scans.
            </p>
          </div>
        </div>
      </ScanSessionOverlay>
    </>
  );
}
