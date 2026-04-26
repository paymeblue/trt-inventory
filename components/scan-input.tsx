"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

import { extractBarcodeFromPayload } from "@/lib/scan-deep-link";

interface ScanInputProps {
  onScan: (value: string) => void;
  disabled?: boolean;
  /** True while a scan request is in flight (fetch + refresh). */
  busy?: boolean;
}

/**
 * Dual-mode scanner UI: camera-based (ZXing) or manual text entry / hardware
 * barcode scanner (which behaves like a keyboard). Manual mode is always
 * enabled so the app is usable without camera permissions.
 */
export function ScanInput({ onScan, disabled, busy = false }: ScanInputProps) {
  const [mode, setMode] = useState<"manual" | "camera">("manual");
  const [value, setValue] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  /**
   * Unifies what to do with a decoded payload regardless of source.
   *
   * Both the QR code and the CODE128 strip on each printed sticker
   * encode the full `/s/<barcode>` deep-link URL (so 3rd-party phone
   * scanner apps detect it as a URL and offer a tap-to-open action).
   * That means a USB scanner reading the linear barcode on this page
   * will type the URL into our input — we transparently unwrap it back
   * to the bare barcode so the rapid-scan loop on the order page
   * doesn't have to navigate away on every read.
   *
   * Held in a ref so the ZXing callback can always see the latest
   * version without having to restart the camera stream on every render.
   */
  const payloadRef = useRef<(raw: string) => void>(() => undefined);
  payloadRef.current = (raw: string) => {
    if (disabled || busyRef.current) return;
    const barcode = extractBarcodeFromPayload(raw);
    if (!barcode) return;
    onScan(barcode);
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
  }, [mode, deviceId]);

  const blocked = disabled || busy;

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    payloadRef.current(trimmed);
    setValue("");
  }

  return (
    <div
      className="card overflow-hidden"
      aria-busy={busy}
      data-scan-input-busy={busy ? "true" : undefined}
    >
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-3">
        <div>
          <div className="text-sm font-semibold">Verify item</div>
          <div className="text-[11px] text-[color:var(--text-muted)]">
            Scan the barcode or QR with a camera, or type/paste it.
          </div>
        </div>
        <div
          className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-1 text-xs font-semibold"
          role="tablist"
          aria-label="Input method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "manual"}
            onClick={() => setMode("manual")}
            disabled={blocked}
            className={`rounded-full px-3 py-1 transition-colors disabled:opacity-50 ${
              mode === "manual"
                ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            Manual / Keyboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "camera"}
            onClick={() => setMode("camera")}
            disabled={blocked}
            className={`rounded-full px-3 py-1 transition-colors disabled:opacity-50 ${
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
        {busy && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs text-[color:var(--text)]"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--primary)] border-t-transparent"
              aria-hidden
            />
            <span>
              Recording verification — hang on until this finishes before
              scanning the next item.
            </span>
          </div>
        )}
        {mode === "manual" ? (
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              autoFocus
              disabled={blocked}
              className="input font-mono"
              placeholder="Scan or enter a barcode (e.g. TRT-ABC123DEF456)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={blocked}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-[color:var(--primary-foreground)] border-t-transparent"
                    aria-hidden
                  />
                  Verifying…
                </span>
              ) : (
                "Verify"
              )}
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
              {busy && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 rounded-lg bg-black/80 px-4 py-2 text-sm font-medium text-white">
                    <span
                      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden
                    />
                    Verifying…
                  </div>
                </div>
              )}
            </div>
            {devices.length > 1 && (
              <select
                className="input"
                value={deviceId ?? ""}
                onChange={(e) => setDeviceId(e.target.value)}
                disabled={blocked}
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
