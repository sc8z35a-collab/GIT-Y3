/**
 * Procedural Physical Foley Web Audio Engine (Zero External Audio Assets).
 * Synthesizes authentic wooden hyoshigi beats, brass clockwork seal locks,
 * stone/shear/parchment clash acoustics, and warm temple-bell resonance.
 */

import { Move, PAPER, ROCK, SCISSORS } from '../engine/jnv1/types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  public enabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = (): void => {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true, once: true });
      window.addEventListener('keydown', unlock, { passive: true, once: true });
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    const navAct = (navigator as unknown as { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    const canStart = this.unlocked || Boolean(navAct?.hasBeenActive);
    if (!canStart) return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /** Crisp wooden tile hover/click tactile clack */
  public playWoodTap(pitch = 680): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.42, now + 0.048);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Precision watchmaker brass escapement click when JNV1.0 seals its SHA-256 commit */
  public playClockworkLock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.042;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 1850 : 2420, t);
      osc.frequency.exponentialRampToValueAtTime(920, t + 0.032);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.038);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    }
  }

  /** Wooden hyoshigi rhythmic anticipation beat ("Jan..." / "Ken...") */
  public playBeat(step: 1 | 2): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const baseFreq = step === 1 ? 520 : 620;

    // Resonant hardwood body + harmonic click
    for (const mult of [1.0, 2.32, 3.85]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = mult === 1.0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(baseFreq * mult, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * mult * 0.82, now + 0.09);

      const amp = mult === 1.0 ? 0.16 : 0.05 / mult;
      gain.gain.setValueAtTime(amp, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  }

  /** Distinct physical clash impact acoustic based on winning move & round outcome */
  public playClashImpact(outcome: 'WIN' | 'LOSS' | 'DRAW', winningMove: Move): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Low wooden table thump
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(winningMove === ROCK ? 135 : 165, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.16);
    thumpGain.gain.setValueAtTime(0.28, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.2);

    // 2. Material signature transient (Stone knock / Metallic scissor shear / Crisp paper snap)
    if (winningMove === SCISSORS) {
      // Crisp forged steel blade ring
      for (const f of [2240, 3410, 4880]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 0.94, now + 0.22);
        g.gain.setValueAtTime(0.045, now);
        g.gain.exponentialRampToValueAtTime(0.0006, now + 0.24);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now);
        o.stop(now + 0.25);
      }
    } else if (winningMove === PAPER) {
      // Filtered parchment air-snap noise burst
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.025));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 1450;
      filt.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.value = 0.26;
      src.connect(filt);
      filt.connect(g);
      g.connect(ctx.destination);
      src.start(now);
    }

    // 3. Outcome harmonic chord (warm pentatonic bronze bell on WIN, deep muted wood on LOSS, crisp double-click on DRAW)
    if (outcome === 'WIN') {
      const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 warm acoustic chime
      notes.forEach((freq, idx) => {
        const t = now + 0.05 + idx * 0.055;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.095, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.52);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.55);
      });
    } else if (outcome === 'LOSS') {
      const notes = [293.66, 246.94]; // D4 -> B3 dignified somber tone
      notes.forEach((freq, idx) => {
        const t = now + 0.06 + idx * 0.09;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.38);
      });
    } else {
      // Crisp Aiko double-knock
      this.playWoodTap(840);
      setTimeout(() => this.playWoodTap(960), 95);
    }
  }
}
