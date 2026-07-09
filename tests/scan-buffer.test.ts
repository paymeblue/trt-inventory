import { describe, expect, it } from "vitest";
import {
  emptyScanBufferState,
  reduceScanKey,
  type ScanBufferState,
} from "@/lib/scan-buffer";

const MAX_GAP = 60;

/** Feeds a sequence of characters typed `stepMs` apart, starting at `startAt`. */
function typeSequence(
  state: ScanBufferState,
  chars: string,
  startAt: number,
  stepMs: number,
) {
  let s = state;
  let now = startAt;
  for (const key of chars) {
    const { state: next } = reduceScanKey(s, { key, now }, MAX_GAP);
    s = next;
    now += stepMs;
  }
  return { state: s, lastNow: now };
}

describe("reduceScanKey", () => {
  it("buffers rapid keystrokes and emits the code on Enter", () => {
    const { state, lastNow } = typeSequence(
      emptyScanBufferState,
      "TRT-ABC123",
      1000,
      5,
    );
    const { state: finalState, scanned } = reduceScanKey(
      state,
      { key: "Enter", now: lastNow },
      MAX_GAP,
    );
    expect(scanned).toBe("TRT-ABC123");
    expect(finalState).toEqual(emptyScanBufferState);
  });

  it("Enter with an empty buffer emits nothing", () => {
    const { scanned, state } = reduceScanKey(
      emptyScanBufferState,
      { key: "Enter", now: 100 },
      MAX_GAP,
    );
    expect(scanned).toBeNull();
    expect(state).toEqual(emptyScanBufferState);
  });

  it("a gap larger than maxKeyIntervalMs drops the stale prefix instead of concatenating", () => {
    // 'A' typed, then a human-speed pause, then 'B' — simulates someone
    // idly pressing a key before the scanner actually fires, or a scan
    // that trails off. The stale 'A' must not survive into the next scan.
    const afterA = reduceScanKey(emptyScanBufferState, { key: "A", now: 0 }, MAX_GAP);
    const afterGap = reduceScanKey(
      afterA.state,
      { key: "B", now: 0 + MAX_GAP + 1 },
      MAX_GAP,
    );
    expect(afterGap.state.buffer).toBe("B");

    const { scanned } = reduceScanKey(
      afterGap.state,
      { key: "Enter", now: 0 + MAX_GAP + 2 },
      MAX_GAP,
    );
    expect(scanned).toBe("B");
  });

  it("a gap within maxKeyIntervalMs keeps accumulating", () => {
    const afterA = reduceScanKey(emptyScanBufferState, { key: "A", now: 0 }, MAX_GAP);
    const afterB = reduceScanKey(
      afterA.state,
      { key: "B", now: MAX_GAP },
      MAX_GAP,
    );
    expect(afterB.state.buffer).toBe("AB");
  });

  it("ignores Ctrl/Meta/Alt-modified keystrokes without touching the buffer", () => {
    const started = reduceScanKey(emptyScanBufferState, { key: "A", now: 0 }, MAX_GAP);
    const ctrlA = reduceScanKey(
      started.state,
      { key: "a", now: 5, ctrlKey: true },
      MAX_GAP,
    );
    expect(ctrlA.scanned).toBeNull();
    expect(ctrlA.state).toEqual(started.state);

    const metaA = reduceScanKey(
      started.state,
      { key: "a", now: 5, metaKey: true },
      MAX_GAP,
    );
    expect(metaA.state).toEqual(started.state);

    const altA = reduceScanKey(
      started.state,
      { key: "a", now: 5, altKey: true },
      MAX_GAP,
    );
    expect(altA.state).toEqual(started.state);
  });

  it("ignores multi-character key values (Shift, Backspace, arrows, etc.)", () => {
    const started = reduceScanKey(emptyScanBufferState, { key: "T", now: 0 }, MAX_GAP);
    for (const key of ["Shift", "Backspace", "ArrowLeft", "Tab", "CapsLock"]) {
      const result = reduceScanKey(started.state, { key, now: 5 }, MAX_GAP);
      expect(result.scanned).toBeNull();
      expect(result.state).toEqual(started.state);
    }
  });

  it("trims incidental whitespace at the edges of the buffer on Enter", () => {
    const withSpace = reduceScanKey(
      { buffer: " TRT-1 ", lastKeyAt: 0 },
      { key: "Enter", now: 10 },
      MAX_GAP,
    );
    expect(withSpace.scanned).toBe("TRT-1");
  });

  it("a whitespace-only buffer emits nothing on Enter", () => {
    const result = reduceScanKey(
      { buffer: "   ", lastKeyAt: 0 },
      { key: "Enter", now: 10 },
      MAX_GAP,
    );
    expect(result.scanned).toBeNull();
  });

  it("resets cleanly between scans regardless of how much time passes after Enter", () => {
    const first = typeSequence(emptyScanBufferState, "AAA", 0, 5);
    const afterEnter = reduceScanKey(
      first.state,
      { key: "Enter", now: first.lastNow },
      MAX_GAP,
    );
    expect(afterEnter.state).toEqual(emptyScanBufferState);

    // Next character arrives long after the previous Enter — because the
    // buffer is empty, this must NOT be treated as a stale-gap reset that
    // drops anything (there's nothing to drop) and must start fresh.
    const nextScan = reduceScanKey(
      afterEnter.state,
      { key: "B", now: first.lastNow + 10_000 },
      MAX_GAP,
    );
    expect(nextScan.state.buffer).toBe("B");
  });
});
