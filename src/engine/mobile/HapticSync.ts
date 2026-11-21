/**
 * ★ KIWAMI HAPTIC SYNC 1.0 — audio-derived haptics ★
 *
 * The Vibration API can only switch the motor on/off, so intensity is expressed by pulse-width
 * modulation inside 24 ms slots. The pattern is extracted from the *actual* physically synthesised
 * clash buffer (the same PCM the player hears): a 6 ms RMS envelope, onset detection for transients,
 * and PWM duty = intensity^0.8. A taiko slam therefore feels like a long thump, a washi-paper slice
 * like a short crisp tick — and it is fired on the reveal frame together with the latency-compensated
 * audio (see `computeRevealSchedule`).
 */

export interface HapticExtractOptions {
  /** slot length for PWM (ms) */
  slotMs?: number;
  /** longest pattern (ms) — keep it subtle */
  maxTotalMs?: number;
  /** intensity below which the tail is cut */
  threshold?: number;
  /** global strength 0..1 */
  strength?: number;
}

/** Vibration pattern [on, off, on, off, …] (ms) from a mono PCM buffer. */
export function extractHapticPattern(pcm: Float32Array, sampleRate: number, opts: HapticExtractOptions = {}): number[] {
  const slotMs = opts.slotMs ?? 24;
  const maxTotal = opts.maxTotalMs ?? 360;
  const threshold = opts.threshold ?? 0.12;
  const strength = Math.max(0, Math.min(1, opts.strength ?? 1));
  const frame = Math.max(1, Math.round(sampleRate * 0.006));
  const maxFrames = Math.min(Math.floor(pcm.length / frame), Math.ceil(((maxTotal + slotMs) / 1000) * sampleRate / frame));
  if (maxFrames <= 0 || strength <= 0) return [];

  const env = new Float32Array(maxFrames);
  let peak = 0;
  for (let f = 0; f < maxFrames; f++) {
    let acc = 0;
    const o = f * frame;
    for (let i = 0; i < frame; i++) {
      const v = pcm[o + i];
      acc += v * v;
    }
    const rms = Math.sqrt(acc / frame);
    env[f] = rms;
    if (rms > peak) peak = rms;
  }
  if (peak < 1e-5) return [];

  const framesPerSlot = Math.max(1, Math.round(slotMs / 6));
  // Timing-preserving PWM: every slot (pulse, weak pulse or gap) advances the pattern clock by exactly
  // one slot, so pulse k always starts at k·slotMs — the motor stays phase-locked to the audio.
  const pattern: number[] = [];
  let total = 0;
  let quietSlots = 0;
  let leadSlots = 0;
  let prevI = 0;
  for (let s = 0; s * framesPerSlot < maxFrames && total < maxTotal; s++) {
    let sum = 0;
    let n = 0;
    let slotPeak = 0;
    for (let f = s * framesPerSlot; f < Math.min(maxFrames, (s + 1) * framesPerSlot); f++) {
      const v = env[f] / peak;
      sum += v;
      n++;
      if (v > slotPeak) slotPeak = v;
    }
    const intensity = n > 0 ? 0.5 * (sum / n) + 0.5 * slotPeak : 0;
    const onset = intensity > 0.25 && intensity > prevI * 1.8;
    prevI = intensity;

    let on = 0;
    if (intensity >= threshold) {
      quietSlots = 0;
      on = Math.round(slotMs * Math.pow(Math.min(1, intensity), 0.8) * strength);
      if (onset) on = Math.max(on, Math.round(slotMs * 0.75 * strength));
      on = Math.max(0, Math.min(slotMs, on));
      if (on < 3) on = 0; // too short for the actuator to spin up: treat as a gap
    } else {
      quietSlots++;
      if (quietSlots >= 2 && pattern.length > 0) break;
    }

    if (pattern.length === 0) {
      if (on === 0) {
        leadSlots++; // leading silence (e.g. a pre-delayed transient) is kept as an initial pause
        total += slotMs;
        continue;
      }
      if (leadSlots > 0) pattern.push(0, leadSlots * slotMs);
      pattern.push(on, slotMs - on);
    } else if (on === 0) {
      pattern[pattern.length - 1] += slotMs; // gap: extend the pause, keep the clock
    } else if (pattern[pattern.length - 1] === 0) {
      pattern[pattern.length - 2] += on; // contiguous full-duty slots merge into one longer pulse
      pattern[pattern.length - 1] = slotMs - on;
    } else {
      pattern.push(on, slotMs - on);
    }
    total += slotMs;
  }
  // drop the trailing pause (pointless for the motor)
  if (pattern.length >= 2 && pattern.length % 2 === 0) pattern.pop();
  return pattern;
}

/** Fire a pattern if the device supports it (Android Chrome); no-op elsewhere. */
export function vibrate(pattern: number | number[]): boolean {
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return false;
  try {
    return nav.vibrate(pattern);
  } catch {
    return false;
  }
}

export function hapticsSupported(): boolean {
  return typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === 'function';
}
