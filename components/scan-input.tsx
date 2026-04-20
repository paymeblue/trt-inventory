"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

import { extractScanDeepLink } from "@/lib/scan-deep-link";

interface ScanInputProps {
  onScan: (value: string) => void;
  disabled?: boolean;
}

/**
 * Dual-mode scanner UI: camera-based (ZXing) or manual text entry / hardware
 * barcode scanner (which behaves like a keyboard). Manual mode is always
 * enabled so the app is usable without camera permissions.
 */
export function ScanInput({ onScan, disabled }: ScanInputProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "camera">("manual");
  const [value, setValue] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  /**
   * Unifies what to do with a decoded payload (regardless of source):
   *   - if it's a `/s/<barcode>` deep-link, navigate there so the auto-
   *     complete flow kicks in;
   *   - otherwise hand the raw barcode to the parent.
   *
   * Held in a ref so the ZXing callback can always see the latest version
   * without having to restart the camera stream on every render.
   */
  const payloadRef = useRef<(raw: string) => void>(() => undefined);
  payloadRef.current = (raw: string) => {
    const deep = extractScanDeepLink(raw);
    if (deep) {
      router.push(deep);
      return;
    }
    onScan(raw);
  };

  useEffect(() => {
    if (mode !== "camera") return;

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
          setCameraError("No camera found on this device.");
          return;
        }

        const controls = await reader.decodeFromVideoDevice(
          chosen,
          videoRef.current!,
          (result) => {
            if (!result) return;
            const text = result.getText();
            const now = Date.now();
            // debounce duplicate reads within 1.5s
            if (
              lastScanRef.current &&
              lastScanRef.current.value === text &&
              now - lastScanRef.current.at < 1500
            ) {
              return;
            }
            lastScanRef.current = { value: text, at: now };
            payloadRef.current(text);
          },
        );
        controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) {
          setCameraError((err as Error).message || "Camera access failed.");
        }
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [mode, deviceId, onScan]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    payloadRef.current(trimmed);
    setValue("");
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-3">
        <div className="text-sm font-semibold">Scan barcode</div>
        <div
          className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-1 text-xs font-semibold"
          role="tablist"
          aria-label="Scan mode"
        >
          <button
            role="tab"
            aria-selected={mode === "manual"}
            onClick={() => setMode("manual")}
            className={`rounded-full px-3 py-1 transition-colors ${
              mode === "manual"
                ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            Manual / Keyboard
          </button>
          <button
            role="tab"
            aria-selected={mode === "camera"}
            onClick={() => setMode("camera")}
            className={`rounded-full px-3 py-1 transition-colors ${
              mode === "camera"
                ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            Camera
          </button>
        </div>
      </div>

      <div className="p-6">
        {mode === "manual" ? (
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              autoFocus
              disabled={disabled}
              className="input font-mono"
              placeholder="Scan or type a barcode (e.g. TRT-ABC123DEF456)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              Scan
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-dashed border-white/70" />
            </div>
            {devices.length > 1 && (
              <select
                className="input"
                value={deviceId ?? ""}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            )}
            {cameraError && (
              <div className="rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-xs text-[color:var(--danger)]">
                {cameraError}
              </div>
            )}
            <p className="text-xs text-[color:var(--text-muted)]">
              Point the camera at the barcode. Results are debounced so holding
              the code in view won&apos;t double-count.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
