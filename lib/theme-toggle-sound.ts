/**
 * Short UI tick when switching light/dark (must run from a user gesture for
 * AudioContext policies in most browsers).
 */
export function playThemeToggleSound(toDark: boolean): void {
  try {
    const AC =
      typeof globalThis !== "undefined"
        ? (globalThis as typeof globalThis & {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }).AudioContext ||
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) return;

    const ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = toDark ? 520 : 380;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore — optional feedback */
  }
}
