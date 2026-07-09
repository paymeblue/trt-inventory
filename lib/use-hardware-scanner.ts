"use client";

import { useEffect, useRef } from "react";
import {
  emptyScanBufferState,
  reduceScanKey,
  type ScanBufferState,
} from "@/lib/scan-buffer";

interface UseHardwareScannerOptions {
  /** Listener is attached only while true. */
  active: boolean;
  onScan: (code: string) => void;
  /**
   * Hardware scanners fire keystrokes a few ms apart — far faster than a
   * human typing. A gap larger than this resets the buffer so genuine
   * keyboard typing elsewhere on the page can't be mistaken for a scan.
   */
  maxKeyIntervalMs?: number;
}

/**
 * Listens for keystrokes from a USB/Bluetooth "keyboard wedge" barcode
 * scanner (e.g. Sunlux XL361OS) anywhere on the page — no input needs to be
 * focused. These scanners type each character of the barcode then send
 * Enter; this buffers those keystrokes and fires `onScan` once Enter
 * arrives, exactly like a supermarket checkout scanner. Because the
 * listener lives on `document`, scanning keeps working no matter where the
 * operator last tapped on screen.
 */
export function useHardwareScanner({
  active,
  onScan,
  maxKeyIntervalMs = 60,
}: UseHardwareScannerOptions) {
  const stateRef = useRef<ScanBufferState>(emptyScanBufferState);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const { state, scanned } = reduceScanKey(
        stateRef.current,
        {
          key: e.key,
          now: Date.now(),
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
        },
        maxKeyIntervalMs,
      );
      stateRef.current = state;
      if (scanned) onScanRef.current(scanned);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      stateRef.current = emptyScanBufferState;
    };
  }, [active, maxKeyIntervalMs]);
}
