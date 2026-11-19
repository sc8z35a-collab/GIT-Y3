/**
 * ★ Layered Procedural Physical Foley Web Audio Engine (Zero External Assets) ★
 *
 * Synthesizes authentic acoustic craft audio:
 *  - Crisp hinoki wood tile taps & tactile UI feedback
 *  - Filtered silk/fabric air-whoosh sweeps during 3D hand windup & clash lunge
 *  - Wooden hyoshigi cadence beats (`じゃん・けん・ぽん！`)
 *  - Watchmaker brass escapement seal lock
 *  - Move-specific clash acoustics (heavy timber-stone crush, twin metallic shear snips,
 *    parchment snap)
 *  - Ballistic ceramic Go-stone double-bounce clack onto wooden score tray
 *  - Warm resonant Japanese temple-bell (rin) harmonic triad for Match Victory!
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

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
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
    gain.gain.linearRampToValueAtTime(0.13, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Filtered silk/sleeve air-whoosh synced with dramatic hand windup or clash strike */
  public playWhoosh(intensity = 1.0, pitchMult = 1.0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.22;

    const src = ctx.createBufferSource();
    src.buffer = this.createNoiseBuffer(ctx, dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.6, now);
    filter.frequency.setValueAtTime(340 * pitchMult, now);
    filter.frequency.exponentialRampToValueAtTime(1480 * pitchMult, now + dur * 0.55);
    filter.frequency.exponentialRampToValueAtTime(420 * pitchMult, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11 * intensity, now + dur * 0.32);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
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
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.038);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.042);
    }
  }

  /** Traditional wooden hyoshigi percussion beat during "Jan - Ken - Pon" windup */
  public playBeat(step: 1 | 2): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = step === 1 ? 520 : 660;

    // Resonant hardwood body + bright clack overtone
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.56, now + 0.095);
    osc2.frequency.setValueAtTime(freq * 2.45, now);
    osc2.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.12);
    osc2.stop(now + 0.12);

    this.playWhoosh(step === 1 ? 0.6 : 0.88, step === 1 ? 0.9 : 1.15);
  }

  /** Crisp twin metallic shear snips for Scissors victory flourish */
  public playScissorsDoubleSnip(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.15;
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 0.07);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(3400 + i * 420, t);
      hp.Q.setValueAtTime(5.2, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      src.connect(hp);
      hp.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.075);
    }
  }

  /** Ceramic Go-stone double bounce tap onto carved hardwood scoreboard tray */
  public playGoStoneBounce(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const taps = [
      { dt: 0.0, amp: 0.14, freq: 1480 },
      { dt: 0.12, amp: 0.065, freq: 1620 },
      { dt: 0.19, amp: 0.025, freq: 1710 },
    ];
    for (const tap of taps) {
      const t = now + tap.dt;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tap.freq, t);
      osc.frequency.exponentialRampToValueAtTime(tap.freq * 0.48, t + 0.028);
      gain.gain.setValueAtTime(tap.amp, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.034);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.038);
    }
  }

  /** Rich physical impact & acoustic outcome chime on "PON!!" */
  public playClashImpact(outcome: 'WIN' | 'LOSS' | 'DRAW', winnerMove: Move): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Physical contact body impact tailored to Rock / Scissors / Paper
    if (winnerMove === ROCK) {
      // Heavy taiko-wood + stone thump
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
      gain.gain.setValueAtTime(0.34, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.27);
    } else if (winnerMove === SCISSORS) {
      // Crisp forged-steel blade shimmer
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(1180, now + 0.14);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (winnerMove === PAPER) {
      // Crisp washi-parchment & sweeping air snap
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1250, now);
      bp.Q.setValueAtTime(1.5, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.13);
    }

    // 2. Warm acoustic outcome bell resonance
    const notes =
      outcome === 'WIN'
        ? [523.25, 659.25, 783.99] // Warm C5 major triad (gold chime)
        : outcome === 'LOSS'
        ? [392.0, 311.13] // Deep muted bronze minor interval
        : [440.0, 587.33]; // Crisp neutral bamboo fifth

    notes.forEach((freq, idx) => {
      const t = now + idx * 0.052;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(outcome === 'WIN' ? 0.12 : 0.085, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0007, t + 0.62);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  /** Ceremonial resonant Japanese brass rin-bell chord on Match Victory */
  public playMatchVictoryChord(playerWon: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = playerWon ? [523.25, 659.25, 783.99, 1046.5] : [329.63, 293.66, 220.0];
    freqs.forEach((f, idx) => {
      const t = now + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0006, t + 1.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  }
}
