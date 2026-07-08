"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

interface UseContinuousScannerOptions {
  /** Camera stream only runs while true; stopped and released otherwise. */
  active: boolean;
  onDecode: (text: string) => void;
}

/**
 * Opens a device camera once and keeps decoding barcodes/QRs from the live
 * video stream until `active` goes false — the "ping, ping, ping" loop
 * shared by the manual/camera scan tab and the full-screen receive scanner.
 * Duplicate reads of the same payload within 1.5s are suppressed so holding
 * a code in view doesn't double-count.
 */
export function useContinuousScanner({
  active,
  onDecode,
}: UseContinuousScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        // iOS Safari (and some other mobile browsers) refuse to enumerate
        // devices — returning an empty list with no error — until camera
        // permission has already been granted once. Enumerating first is
        // only a best-effort attempt to pre-select a device; if it comes
        // back empty we still proceed and let decodeFromVideoDevice's
        // built-in `facingMode: "environment"` fallback request the
        // camera directly, which is what actually triggers the OS
        // permission prompt.
        let chosen = deviceId;
        if (!chosen) {
          try {
            const devs = await BrowserMultiFormatReader.listVideoInputDevices();
            if (!cancelled) setDevices(devs);
            chosen = devs[0]?.deviceId ?? null;
          } catch {
            // Ignored — fall through to the facingMode fallback below.
          }
        }

        const controls = await reader.decodeFromVideoDevice(
          chosen ?? undefined,
          videoRef.current!,
          (result) => {
            if (!result) return;
            const text = result.getText();
            const now = Date.now();
            if (
              lastScanRef.current &&
              lastScanRef.current.value === text &&
              now - lastScanRef.current.at < 1500
            ) {
              return;
            }
            lastScanRef.current = { value: text, at: now };
            onDecodeRef.current(text);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        if (chosen) setDeviceId(chosen);

        // Permission is granted now, so device labels/ids are reliably
        // available — refresh the list to populate the camera picker.
        try {
          const devs = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!cancelled) setDevices(devs);
        } catch {
          // Non-fatal — the picker just won't offer alternate cameras.
        }
      } catch (err) {
        if (!cancelled) {
          const name = (err as { name?: string } | undefined)?.name;
          const message =
            name === "NotAllowedError"
              ? "Camera permission was denied. Enable camera access for this site in your browser settings and try again."
              : name === "NotFoundError"
                ? "No camera found on this device."
                : name === "NotReadableError"
                  ? "The camera is already in use by another app. Close it and try again."
                  : (err as Error).message || "Camera access failed.";
          setError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
      lastScanRef.current = null;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, deviceId]);

  return { videoRef, devices, deviceId, setDeviceId, error: active ? error : null };
}
