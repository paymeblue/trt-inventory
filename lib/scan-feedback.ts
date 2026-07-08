"use client";

export type ScanFeedbackKind = "valid" | "duplicate" | "invalid";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/**
 * Primes the audio context from a user-gesture handler (e.g. the button
 * click that opens the scanner). Browsers refuse to start audio outside a
 * gesture, so calling this anywhere else is a silent no-op.
 */
export function primeScanFeedbackAudio() {
  getAudioContext();
}

function beep(frequency: number, durationMs: number, delayMs = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const startAt = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationMs / 1000 + 0.02);
}

const FEEDBACK: Record<
  ScanFeedbackKind,
  { vibrate: number[]; beep: () => void }
> = {
  valid: {
    vibrate: [40],
    beep: () => beep(1046, 90),
  },
  duplicate: {
    vibrate: [30, 60, 30],
    beep: () => {
      beep(660, 70);
      beep(660, 70, 110);
    },
  },
  invalid: {
    vibrate: [150],
    beep: () => beep(220, 220),
  },
};

/** Plays a short beep + haptic pulse distinguishing scan outcomes. */
export function playScanFeedback(kind: ScanFeedbackKind) {
  const entry = FEEDBACK[kind];
  entry.beep();
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(entry.vibrate);
  }
}
