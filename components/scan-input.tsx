"use client";

import { useEffect, useRef, useState } from "react";

import { normalizeScanBarcode } from "@/lib/scan-deep-link";
import { QrCodeLoader } from "@/components/qr-code-loader";
import { useContinuousScanner } from "@/lib/use-continuous-scanner";
import { useHardwareScanner } from "@/lib/use-hardware-scanner";
import {
  playScanFeedback,
  primeScanFeedbackAudio,
  type ScanFeedbackKind,
} from "@/lib/scan-feedback";

interface ScanInputProps {
  onScan: (value: string) => void;
  disabled?: boolean;
  /** True while a scan request is in flight (fetch + refresh). */
  busy?: boolean;
  /**
   * Outcome of the most recent scan, used to play a beep/vibrate cue and
   * flash a result color in the hands-free modes (camera / physical
   * scanner). Optional — omit if the caller doesn't track outcomes.
   */
  lastResult?: { kind: ScanFeedbackKind; at: number } | null;
}

/**
 * Triple-mode scanner UI: camera-based (ZXing), a physical USB/Bluetooth
 * "keyboard wedge" barcode scanner (e.g. Sunlux XL361OS), or manual text
 * entry. Manual mode is always enabled so the app is usable without camera
 * permissions or hardware.
 */
export function ScanInput({
  onScan,
  disabled,
  busy = false,
  lastResult = null,
}: ScanInputProps) {
  const [mode, setMode] = useState<"manual" | "camera" | "physical">(
    "manual",
  );
  const [value, setValue] = useState("");
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

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
  useEffect(() => {
    payloadRef.current = (raw: string) => {
      if (disabled || busyRef.current) return;
      const barcode = normalizeScanBarcode(raw);
      if (!barcode) return;
      onScan(barcode);
    };
  }, [disabled, onScan]);

  const {
    videoRef,
    devices,
    deviceId,
    setDeviceId,
    error: cameraError,
  } = useContinuousScanner({
    active: mode === "camera",
    onDecode: (text) => payloadRef.current(text),
  });

  useHardwareScanner({
    active: mode === "physical",
    onScan: (code) => payloadRef.current(code),
  });

  const lastFeedbackAtRef = useRef(0);
  useEffect(() => {
    if (
      mode === "manual" ||
      !lastResult ||
      lastResult.at === lastFeedbackAtRef.current
    ) {
      return;
    }
    lastFeedbackAtRef.current = lastResult.at;
    playScanFeedback(lastResult.kind);
  }, [mode, lastResult]);

  const [physicalFlash, setPhysicalFlash] = useState<{
    kind: ScanFeedbackKind;
    at: number;
  } | null>(null);
  const lastPhysicalFlashAtRef = useRef(0);
  useEffect(() => {
    if (
      mode !== "physical" ||
      !lastResult ||
      lastResult.at === lastPhysicalFlashAtRef.current
    ) {
      return;
    }
    lastPhysicalFlashAtRef.current = lastResult.at;
    setPhysicalFlash(lastResult);
    const t = setTimeout(() => setPhysicalFlash(null), 900);
    return () => clearTimeout(t);
  }, [mode, lastResult]);

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
            Scan with a camera, a physical barcode scanner, or type/paste it.
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
          <button
            type="button"
            role="tab"
            aria-selected={mode === "physical"}
            onClick={() => {
              primeScanFeedbackAudio();
              setMode("physical");
            }}
            disabled={blocked}
            className={`rounded-full px-3 py-1 transition-colors disabled:opacity-50 ${
              mode === "physical"
                ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            Physical scanner
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
            <QrCodeLoader size={36} label="Verifying scan" flat />
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
                  <QrCodeLoader size={32} label="Verifying" flat />
                  Verifying…
                </span>
              ) : (
                "Verify"
              )}
            </button>
          </form>
        ) : mode === "camera" ? (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover [image-rendering:crisp-edges]"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-4 border-dashed border-white/80" />
              {busy && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 rounded-lg bg-black/80 px-4 py-2 text-sm font-medium text-white">
                    <QrCodeLoader size={32} label="Verifying" flat />
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
        ) : (
          <div className="space-y-3">
            <div
              className={`relative mx-auto flex aspect-square w-full max-w-md flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
                physicalFlash
                  ? physicalFlash.kind === "valid"
                    ? "border-[color:var(--success)] bg-[color:var(--success)]/10"
                    : physicalFlash.kind === "duplicate"
                      ? "border-[color:var(--warning)] bg-[color:var(--warning)]/10"
                      : "border-[color:var(--danger)] bg-[color:var(--danger)]/10"
                  : "border-[color:var(--border)] bg-[color:var(--surface-muted)]"
              }`}
              role="status"
              aria-live="polite"
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white ${
                  physicalFlash
                    ? physicalFlash.kind === "valid"
                      ? "bg-[color:var(--success)]"
                      : physicalFlash.kind === "duplicate"
                        ? "bg-[color:var(--warning)]"
                        : "bg-[color:var(--danger)]"
                    : "bg-[color:var(--primary)]"
                }`}
                aria-hidden
              >
                {physicalFlash
                  ? physicalFlash.kind === "valid"
                    ? "✓"
                    : physicalFlash.kind === "duplicate"
                      ? "↺"
                      : "!"
                  : "»"}
              </div>
              <div className="text-sm font-semibold">
                {busy
                  ? "Recording…"
                  : blocked
                    ? "Not ready"
                    : "Ready — scan the next item"}
              </div>
              <p className="max-w-xs text-center text-xs text-[color:var(--text-muted)]">
                Point the physical scanner at each barcode and pull the
                trigger. No need to click anything between scans.
              </p>
            </div>
            <p className="text-xs text-[color:var(--text-muted)]">
              Works with any USB or Bluetooth barcode scanner set to keyboard
              mode (e.g. Sunlux XL361OS) — it types the code and presses
              Enter, just like typing it in yourself.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
