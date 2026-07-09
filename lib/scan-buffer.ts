export interface ScanBufferState {
  buffer: string;
  lastKeyAt: number;
}

export interface ScanKeyEvent {
  key: string;
  now: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface ScanBufferResult {
  state: ScanBufferState;
  /** The barcode to emit, set only when Enter arrived with a non-empty buffer. */
  scanned: string | null;
}

export const emptyScanBufferState: ScanBufferState = { buffer: "", lastKeyAt: 0 };

/**
 * Pure reducer behind `useHardwareScanner` — buffers keystrokes from a
 * "keyboard wedge" barcode scanner and decides when Enter completes a scan.
 * Kept dependency-free (no DOM) so the buffering/timing rules are unit
 * testable without a browser environment.
 */
export function reduceScanKey(
  state: ScanBufferState,
  event: ScanKeyEvent,
  maxKeyIntervalMs: number,
): ScanBufferResult {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return { state, scanned: null };
  }

  if (event.key === "Enter") {
    const code = state.buffer.trim();
    return { state: emptyScanBufferState, scanned: code || null };
  }

  // Ignore everything but single printable characters (Shift, Tab,
  // Backspace, arrow keys, etc. all have multi-character `key` values).
  if (event.key.length !== 1) {
    return { state, scanned: null };
  }

  const gapTooLarge =
    state.buffer !== "" && event.now - state.lastKeyAt > maxKeyIntervalMs;
  const buffer = (gapTooLarge ? "" : state.buffer) + event.key;

  return { state: { buffer, lastKeyAt: event.now }, scanned: null };
}
