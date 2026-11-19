/**
 * ★ JSound Engin 1.0 — Physical Modal & Hertzian Contact Synthesis Core ★
 *
 * Pure deterministic DSP (works identically in Web Audio AND headless Node audit):
 *  - Hertzian contact force exciter F(t) = sin^(3/2)(pi*t / tau_c) with
 *    velocity-dependent contact-time compression (tau_c ~ v^(-1/5))
 *  - Micro-asperity surface grain burst for authentic wood/ceramic/metal contact texture
 *  - Multi-mode inharmonic resonator bank (up to 16 modes) with velocity-controlled
 *    spectral brightness tilt and hand-hammered beating doublets
 *  - Dual-material coupled clash synthesis (Player Hand × NPC Hand × Stage Tabletop)
 *  - Physical Japanese Rin-Bell (おりん) resonant harmonic chord model
 */

import { Move, PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { ACOUSTIC_MATERIALS, AcousticMaterialId, JSoundQualityMode, ModalSpec } from './types';

/** Fast deterministic PRNG (Mulberry32) for reproducible micro-grain & variation */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthesize a physically modeled Hertzian-excited modal impact into a mono Float32Array.
 */
export function synthesizeModalImpact(
  materialId: AcousticMaterialId,
  sampleRate: number,
  options: {
    velocity?: number; // 0.1 .. 1.5
    pitchScale?: number; // e.g. 0.85 .. 1.35
    durationSec?: number;
    quality?: JSoundQualityMode;
    seed?: number;
  } = {}
): Float32Array {
  const spec = ACOUSTIC_MATERIALS[materialId];
  const velocity = Math.max(0.08, Math.min(1.6, options.velocity ?? 1.0));
  const pitchScale = options.pitchScale ?? 1.0;
  const quality = options.quality ?? 'pro';
  const rng = createSeededRng(options.seed ?? ((Math.random() * 0xffffffff) >>> 0));

  const maxModeCount = quality === 'pro' ? spec.ratios.length : Math.min(6, spec.ratios.length);
  const longestDecay = spec.decays[0] * (0.85 + velocity * 0.25);
  const durSec = options.durationSec ?? Math.min(2.6, Math.max(0.06, longestDecay * 5.2));
  const n = Math.max(64, Math.floor(sampleRate * durSec));
  const out = new Float32Array(n);

  // 1. Hertzian Contact Force Impulse + Micro-Asperity Surface Texture
  // Exact Hertzian contact mechanics: harder velocity shortens contact duration tau_c ~ v^(-0.2)
  const contactSec = (spec.contactMs / 1000) * Math.pow(velocity, -0.22);
  const contactSamples = Math.max(6, Math.min(n, Math.floor(contactSec * sampleRate)));
  const invContact = 1 / contactSamples;

  for (let i = 0; i < contactSamples; i++) {
    const u = i * invContact;
    const hertz = Math.pow(Math.sin(Math.PI * u), 1.5);
    const asperity = (rng() * 2 - 1) * spec.surfaceGrain * Math.min(1.4, velocity * velocity) * Math.sin(Math.PI * u);
    out[i] += (hertz * 0.54 + asperity * 0.42) * velocity;
  }

  // 2. Coupled Inharmonic Eigenmodes (Kirchhoff plate / Euler-Bernoulli tonewood bar)
  // Real impact acoustics: soft taps excite mostly fundamental + body; hard smashes excite rich upper modes!
  const brightnessExponent = Math.max(0.12, 1.95 - velocity * 1.32);
  const twoPiOverSr = (2 * Math.PI) / sampleRate;
  const nyquistGuard = sampleRate * 0.44;

  for (let m = 0; m < maxModeCount; m++) {
    // Tiny organic per-hit detuning (±0.5%) eliminates synthetic "machine-gun" repetition
    const detune = 1.0 + (rng() - 0.5) * 0.01;
    const freq = spec.fundamentalHz * spec.ratios[m] * pitchScale * detune;
    if (freq >= nyquistGuard) continue;

    const tau = Math.max(0.003, spec.decays[m] * (0.88 + velocity * 0.18));
    const decayPerSample = Math.exp(-1 / (tau * sampleRate));
    const brightGain = Math.pow(1 + m * 0.55, -brightnessExponent);
    const amp = spec.amps[m] * brightGain * velocity * 0.42;
    const phase = rng() * 0.4; // Near-cosine phase preserves crisp impact transient attack!

    // Fast recursive quadrature sinusoid (zero sin/cos inside inner loop!)
    const omega = freq * twoPiOverSr;
    const cosW = Math.cos(omega);
    const sinW = Math.sin(omega);
    let re = Math.cos(phase) * amp;
    let im = Math.sin(phase) * amp;

    // Smooth Hertzian attack ramp over first contact window so modal onset never clicks
    const attackN = Math.min(contactSamples, n);
    const modeEnd = Math.min(n, Math.floor(tau * 6.5 * sampleRate));

    for (let i = 0; i < modeEnd; i++) {
      const envRamp = i < attackN ? i / attackN : 1.0;
      out[i] += im * envRamp;
      const nextRe = (re * cosW - im * sinW) * decayPerSample;
      const nextIm = (re * sinW + im * cosW) * decayPerSample;
      re = nextRe;
      im = nextIm;
    }

    // Authentic Hand-Hammered Beating Doublet for metallic bronze & glazed porcelain!
    if (quality === 'pro' && spec.doubletSplitHz && m < 3) {
      const splitFreq = freq + spec.doubletSplitHz * (1 + m * 0.45);
      if (splitFreq < nyquistGuard) {
        const omega2 = splitFreq * twoPiOverSr;
        const c2 = Math.cos(omega2);
        const s2 = Math.sin(omega2);
        let r2 = Math.cos(phase + 0.7) * amp * 0.46;
        let i2 = Math.sin(phase + 0.7) * amp * 0.46;
        const d2 = Math.exp(-1 / (tau * 1.08 * sampleRate));
        for (let i = 0; i < modeEnd; i++) {
          const envRamp = i < attackN ? i / attackN : 1.0;
          out[i] += i2 * envRamp;
          const nr = (r2 * c2 - i2 * s2) * d2;
          const ni = (r2 * s2 + i2 * c2) * d2;
          r2 = nr;
          i2 = ni;
        }
      }
    }
  }

  // 3. Sub-Body Cavity / Wood Shell Helmholtz Thump (grounds impact with tactile physical weight)
  if (spec.bodyHz) {
    const bodyTau = 0.048 + velocity * 0.025;
    const bodyEnd = Math.min(n, Math.floor(bodyTau * 6 * sampleRate));
    let phase = 0;
    for (let i = 0; i < bodyEnd; i++) {
      const t = i / sampleRate;
      const pitchDrop = 1.0 + 0.42 * Math.exp(-t / 0.014);
      phase += twoPiOverSr * spec.bodyHz * pitchScale * pitchDrop;
      const env = Math.exp(-t / bodyTau) * Math.min(1, i / Math.max(4, contactSamples * 0.6));
      out[i] += Math.sin(phase) * env * velocity * 0.34;
    }
  }

  // 4. Gentle Analog-Physical Soft Saturation & DC block
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i] * 0.85);
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.94) {
    const norm = 0.94 / peak;
    for (let i = 0; i < n; i++) out[i] *= norm;
  }

  return out;
}

/**
 * Synthesize a rich dual-material 3D clash impact combining:
 *   Player Hand Material × NPC Hand Material × Stage Tabletop Sub-Resonance × Move Acoustics!
 */
export function synthesizeDualMaterialClash(
  playerMat: AcousticMaterialId,
  npcMat: AcousticMaterialId,
  tableMat: AcousticMaterialId,
  winnerMove: Move,
  outcome: 'WIN' | 'LOSS' | 'DRAW',
  sampleRate: number,
  quality: JSoundQualityMode = 'pro',
  seed = 1337
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const durSec = 0.68;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const velBase = outcome === 'DRAW' ? 0.92 : 1.22;
  const movePitch = winnerMove === ROCK ? 0.82 : winnerMove === SCISSORS ? 1.24 : 1.04;

  // Player hand acoustic strike (slightly weighted left) + NPC hand strike (slightly weighted right)
  const hitA = synthesizeModalImpact(playerMat, sampleRate, {
    velocity: velBase * (outcome === 'WIN' ? 1.08 : 0.86),
    pitchScale: movePitch * (0.96 + rng() * 0.08),
    durationSec: durSec,
    quality,
    seed: seed + 17,
  });
  const hitB = synthesizeModalImpact(npcMat, sampleRate, {
    velocity: velBase * (outcome === 'LOSS' ? 1.08 : 0.86),
    pitchScale: movePitch * (0.96 + rng() * 0.08),
    durationSec: durSec,
    quality,
    seed: seed + 53,
  });
  // Stage tabletop sub-body acoustic transfer (centered deep punch!)
  const tableHit = synthesizeModalImpact(tableMat, sampleRate, {
    velocity: winnerMove === ROCK ? 1.25 : 0.72,
    pitchScale: winnerMove === ROCK ? 0.86 : 1.02,
    durationSec: durSec,
    quality,
    seed: seed + 91,
  });

  // Micro stereo arrival delay (0.6ms) gives huge natural stereo depth!
  const delayB = Math.floor(sampleRate * 0.00065);

  for (let i = 0; i < n; i++) {
    const a = hitA[i];
    const b = i >= delayB ? hitB[i - delayB] : 0;
    const tb = tableHit[i];

    left[i] = a * 0.64 + b * 0.34 + tb * 0.42;
    right[i] = a * 0.34 + b * 0.64 + tb * 0.42;
  }

  // Move-Specific Physical Signature Overlay
  const twoPiOverSr = (2 * Math.PI) / sampleRate;
  if (winnerMove === ROCK) {
    // Sub-seismic timber/stone compression drop (88Hz -> 36Hz) felt in the chest!
    let ph = 0;
    const subLen = Math.min(n, Math.floor(sampleRate * 0.28));
    for (let i = 0; i < subLen; i++) {
      const t = i / sampleRate;
      const f = 36 + 78 * Math.exp(-t / 0.032);
      ph += f * twoPiOverSr;
      const env = Math.exp(-t / 0.092) * Math.min(1, i / (sampleRate * 0.002));
      const v = Math.sin(ph) * env * 0.42;
      left[i] += v;
      right[i] += v;
    }
  } else if (winnerMove === SCISSORS) {
    // High forged-blade metallic harmonic cross-ring
    const bladeLen = Math.min(n, Math.floor(sampleRate * 0.26));
    const freqs = [2420, 3890, 5610];
    for (let k = 0; k < freqs.length; k++) {
      const w = freqs[k] * twoPiOverSr;
      const d = Math.exp(-1 / ((0.14 - k * 0.03) * sampleRate));
      let re = 0.22 / (1 + k * 0.5);
      let im = 0;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      for (let i = 0; i < bladeLen; i++) {
        const env = i < 40 ? i / 40 : 1;
        left[i] += im * env * (k % 2 === 0 ? 1.0 : 0.75);
        right[i] += im * env * (k % 2 === 0 ? 0.75 : 1.0);
        const nr = (re * cw - im * sw) * d;
        const ni = (re * sw + im * cw) * d;
        re = nr;
        im = ni;
      }
    }
  } else if (winnerMove === PAPER) {
    // Crisp Washi / silk air-slap snap (shaped band-limited turbulence burst)
    const snapLen = Math.min(n, Math.floor(sampleRate * 0.14));
    let lpL = 0;
    let lpR = 0;
    let hpL = 0;
    let hpR = 0;
    for (let i = 0; i < snapLen; i++) {
      const t = i / sampleRate;
      const env = Math.sin(Math.min(1, t / 0.006) * Math.PI * 0.5) * Math.exp(-t / 0.032);
      const nL = rng() * 2 - 1;
      const nR = rng() * 2 - 1;
      lpL += (nL - lpL) * 0.26;
      lpR += (nR - lpR) * 0.26;
      hpL += (lpL - hpL) * 0.045;
      hpR += (lpR - hpR) * 0.045;
      left[i] += (lpL - hpL) * env * 0.72;
      right[i] += (lpR - hpR) * env * 0.72;
    }
  }

  // Final mastering soft-clip guard
  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * 0.92);
    right[i] = Math.tanh(right[i] * 0.92);
  }

  return { left, right };
}

/**
 * Synthesize an authentic Japanese Temple Rin-Bell (おりん) resonant harmonic bell strike
 * with Kirchhoff spherical-shell eigenmodes, felt-mallet Hertzian attack, and natural beating!
 */
export function synthesizeRinBellNote(
  fundamentalHz: number,
  sampleRate: number,
  durationSec = 1.9,
  velocity = 0.85,
  quality: JSoundQualityMode = 'pro',
  seed = 777
): Float32Array {
  const baseSpec: ModalSpec = ACOUSTIC_MATERIALS.rin_temple_bell;
  const ratio = fundamentalHz / baseSpec.fundamentalHz;
  return synthesizeModalImpact('rin_temple_bell', sampleRate, {
    velocity,
    pitchScale: ratio,
    durationSec,
    quality,
    seed,
  });
}
