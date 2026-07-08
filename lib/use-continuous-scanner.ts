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
        const devs = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(devs);
        const chosen = deviceId ?? devs[0]?.deviceId ?? null;
        setDeviceId(chosen);

        if (!chosen) {
          setError("No camera found on this device.");
          return;
        }

        const controls = await reader.decodeFromVideoDevice(
          chosen,
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
        controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Camera access failed.");
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
