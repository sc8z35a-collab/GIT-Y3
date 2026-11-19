/**
 * ★ JSound Engin 1.1 — Strouhal Aerodynamic Whoosh, Sleeve Textiles & 9-Channel JHand Foley DSP ★
 *
 * Physically models:
 *  1. Material-Synced Strouhal Aerodynamic Vortex-Shedding Whoosh (Strouhal Law: f_s = St * v / D)
 *     calibrated for all 4 craft sleeve textiles (Silk Kimono / Emerald Velvet / Crimson Brocade / Lacquer)
 *  2. 2× Oversampled Stick-Slip Shear Friction (forged Scissors blades sliding + tip closure snap)
 *  3. Complete 9-Channel JHand Kinesis 1.1 Biomechanical Micro-Foley Synthesis:
 *     `knuckle_snap`, `palm_clench`, `thumb_lock`, `finger_whip`, `scissors_shear`,
 *     `tendon_creak`, `nail_click`, `sleeve_rustle`, `wrist_crack`
 */

import { HandFoleyType } from '../jhand/types';
import { HandMaterialPreset } from '../../graphics/GraphicsConfig';
import {
  createSeededRng,
  decimate2xHalfBand,
  synthesizeModalImpact,
} from './ModalSynthesizer';
import {
  AcousticMaterialId,
  HAND_SLEEVE_PROFILES,
  JSoundQualityMode,
} from './types';

/** Unconditionally stable zero-delay-feedback Chamberlin SVF */
class SvfFilter {
  public low = 0;
  public band = 0;
  public high = 0;

  public process(input: number, freqHz: number, q: number, sampleRate: number): number {
    const f = Math.min(0.84, 2 * Math.sin((Math.PI * Math.min(freqHz, sampleRate * 0.34)) / sampleRate));
    const damp = 1 / Math.max(0.5, q);
    this.high = input - this.low - damp * this.band;
    this.band += f * this.high;
    this.low += f * this.band;
    return this.band;
  }
}

/**
 * Synthesize a physically shaped Strouhal aerodynamic vortex-shedding whoosh
 * customized to the hand's actual sleeve textile!
 */
export function synthesizeAeroWhoosh(
  sampleRate: number,
  options: {
    speed?: number; // 0.35 .. 2.2
    durationSec?: number;
    fabricRoughness?: number;
    handMaterial?: HandMaterialPreset;
    seed?: number;
  } = {}
): { left: Float32Array; right: Float32Array } {
  const speed = Math.max(0.35, Math.min(2.2, options.speed ?? 1.0));
  const durSec = options.durationSec ?? 0.24;
  const sleeve = options.handMaterial ? HAND_SLEEVE_PROFILES[options.handMaterial] : null;
  const roughness = options.fabricRoughness ?? sleeve?.roughness ?? 0.72;
  const silkMult = sleeve?.silkFreqMult ?? 1.0;
  const airGain = sleeve?.airBodyGain ?? 0.52;
  const rustleQ = sleeve?.rustleQ ?? 2.6;
  const rng = createSeededRng(options.seed ?? ((Math.random() * 0xffffffff) >>> 0));

  const n = Math.max(64, Math.floor(sampleRate * durSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const svfCoreL1 = new SvfFilter();
  const svfCoreL2 = new SvfFilter();
  const svfCoreR1 = new SvfFilter();
  const svfCoreR2 = new SvfFilter();
  const svfSilkL = new SvfFilter();
  const svfSilkR = new SvfFilter();
  const svfSub = new SvfFilter();

  const fBase = 210 * speed;
  const fPeak = 1380 * speed;
  const fSilkBase = 1650 * speed * silkMult;
  const reynoldsTurbulence = Math.min(1.0, speed * speed * 0.34) * roughness;

  for (let i = 0; i < n; i++) {
    const u = i / n;
    const velCurve = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 1.65);
    const freqCore = fBase + (fPeak - fBase) * velCurve;
    const freqSilk = fSilkBase * (0.65 + 0.72 * velCurve);

    const wL = rng() * 2 - 1;
    const wR = rng() * 2 - 1;
    const nL = wL * 0.75 + wR * 0.25;
    const nR = wR * 0.75 + wL * 0.25;

    // 1. Cascaded 24dB/oct Strouhal vortex shedding core
    const coreL = svfCoreL2.process(svfCoreL1.process(nL, freqCore, 2.4, sampleRate), freqCore, 1.8, sampleRate);
    const coreR = svfCoreR2.process(svfCoreR1.process(nR, freqCore * 1.03, 2.4, sampleRate), freqCore * 1.03, 1.8, sampleRate);

    // 2. Sleeve textile weave turbulence sheen (Silk vs Velvet vs Brocade vs Lacquer!)
    const silkL = svfSilkL.process(nL, freqSilk, rustleQ, sampleRate) * reynoldsTurbulence * 0.35;
    const silkR = svfSilkR.process(nR, freqSilk * 1.04, rustleQ, sampleRate) * reynoldsTurbulence * 0.35;

    // 3. Low-pressure chest air-displacement swell
    svfSub.process((nL + nR) * 0.5, 92 + 98 * velCurve, 1.2, sampleRate);
    const airBody = svfSub.low * airGain;

    const amp = velCurve * Math.min(1.25, speed * 0.68);
    left[i] = Math.tanh((coreL * 0.68 + silkL + airBody) * amp);
    right[i] = Math.tanh((coreR * 0.68 + silkR + airBody) * amp);
  }

  return { left, right };
}

/**
 * Synthesize 2× oversampled forged-blade Scissors stick-slip shear + sharp craft closure snap!
 */
export function synthesizeScissorsShear(
  material: HandMaterialPreset,
  sampleRate: number,
  velocity = 1.0,
  quality: JSoundQualityMode = 'ultra',
  seed = 404
): Float32Array {
  const rng = createSeededRng(seed);
  const os = quality === 'ultra' ? 2 : 1;
  const dspSr = sampleRate * os;
  const durSec = 0.15;
  const n = Math.floor(sampleRate * durSec) * os;
  const raw = new Float32Array(n);

  const isMetallic = material === 'karakuri_bronze' || material === 'obsidian_gold';
  const svf = new SvfFilter();

  // Phase 1 (0..45ms): Stick-slip microscopic blade asperity shear at 2× oversampling!
  const scrapeN = Math.floor(dspSr * 0.045);
  for (let i = 0; i < scrapeN && i < n; i++) {
    const u = i / scrapeN;
    const slip = rng() > 0.72 ? (rng() * 2 - 1) * 1.95 : (rng() * 2 - 1) * 0.34;
    const fShear = (isMetallic ? 3250 : 2050) * (0.85 + u * 0.68);
    const filtered = svf.process(slip, fShear, isMetallic ? 6.2 : 3.4, dspSr);
    const env = Math.sin(Math.PI * u) * velocity * 0.38;
    raw[i] += filtered * env;
  }

  for (let i = 0; i < n; i++) raw[i] = Math.tanh(raw[i]);
  const out = os === 2 ? decimate2xHalfBand(raw) : raw;

  // Phase 2 (32ms..end): Crisp blade-tip closure modal ring!
  const snapStart = Math.floor(sampleRate * 0.032);
  const modal = synthesizeModalImpact(material, sampleRate, {
    velocity: velocity * 0.78,
    pitchScale: isMetallic ? 1.88 : 1.58,
    durationSec: durSec - 0.03,
    quality,
    seed: seed + 19,
  });

  for (let i = 0; i < modal.length && i + snapStart < out.length; i++) {
    out[i + snapStart] = Math.tanh(out[i + snapStart] + modal[i] * 0.6);
  }
  return out;
}

/**
 * Complete 9-Channel JHand Kinesis 1.1 Biomechanical Micro-Foley Synthesizer!
 */
export function synthesizeJointFoley(
  kind: Exclude<HandFoleyType, 'scissors_shear'>,
  material: HandMaterialPreset,
  intensity: number,
  sampleRate: number,
  quality: JSoundQualityMode = 'ultra',
  seed = 909
): Float32Array {
  const rng = createSeededRng(seed);
  const inten = Math.max(0.12, Math.min(1.2, intensity));

  if (kind === 'finger_whip') {
    const w = synthesizeAeroWhoosh(sampleRate, {
      speed: 0.8 + inten * 0.78,
      durationSec: 0.085,
      handMaterial: material,
      seed,
    });
    const out = new Float32Array(w.left.length);
    for (let i = 0; i < out.length; i++) out[i] = (w.left[i] + w.right[i]) * 0.25 * inten;
    return out;
  }

  if (kind === 'sleeve_rustle') {
    // Authentic textile friction rustle synced to forearm pronation / cuff twist!
    const sleeve = HAND_SLEEVE_PROFILES[material];
    const durSec = 0.145;
    const n = Math.floor(sampleRate * durSec);
    const out = new Float32Array(n);
    const svf1 = new SvfFilter();
    const svf2 = new SvfFilter();
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const env = Math.sin(Math.PI * Math.pow(u, 0.75)) * inten * 0.36;
      const noise = (rng() * 2 - 1) * (0.65 + 0.35 * Math.sin(u * Math.PI * 7));
      const f1 = (1150 + u * 680) * sleeve.silkFreqMult;
      const f2 = (2650 - u * 450) * sleeve.silkFreqMult;
      const s =
        svf1.process(noise, f1, sleeve.rustleQ, sampleRate) * 0.62 +
        svf2.process(noise, f2, sleeve.rustleQ * 1.2, sampleRate) * 0.38 * sleeve.roughness;
      out[i] = Math.tanh(s * env);
    }
    return out;
  }

  if (kind === 'palm_clench') {
    const hit = synthesizeModalImpact(material, sampleRate, {
      velocity: 0.28 + inten * 0.38,
      pitchScale: 0.56,
      durationSec: 0.082,
      quality,
      seed,
    });
    let lp = 0;
    for (let i = 0; i < hit.length; i++) {
      lp += (hit[i] - lp) * 0.16;
      hit[i] = lp * 0.72;
    }
    return hit;
  }

  if (kind === 'thumb_lock') {
    // Firm two-phalanx thumb clamp: damped wood/ceramic/metal contact + soft elastic pad settle!
    const hit = synthesizeModalImpact(material, sampleRate, {
      velocity: 0.34 + inten * 0.42,
      pitchScale: 0.92,
      durationSec: 0.075,
      quality,
      seed,
    });
    const out = new Float32Array(hit.length);
    let lp = 0;
    for (let i = 0; i < hit.length; i++) {
      lp += (hit[i] - lp) * 0.36;
      out[i] = Math.tanh((hit[i] * 0.35 + lp * 0.65) * 0.72);
    }
    return out;
  }

  if (kind === 'nail_click') {
    // Crystalline delicate fingernail-to-palm / nail-to-nail micro-tick!
    const nailMat: AcousticMaterialId =
      material === 'bisque_porcelain'
        ? 'porcelain_nail'
        : material === 'karakuri_bronze' || material === 'obsidian_gold'
        ? 'bronze_nail'
        : 'ivory_nail';
    const click = synthesizeModalImpact(nailMat, sampleRate, {
      velocity: 0.26 + inten * 0.34,
      pitchScale: 0.95 + rng() * 0.14,
      durationSec: 0.042,
      quality,
      seed,
    });
    for (let i = 0; i < click.length; i++) click[i] *= 0.44;
    return click;
  }

  if (kind === 'tendon_creak') {
    // Ultra-subtle multi-pulse dry horological / wood / ceramic tendon tension micro-creak!
    const durSec = 0.095;
    const n = Math.floor(sampleRate * durSec);
    const out = new Float32Array(n);
    const pulses = 4;
    for (let p = 0; p < pulses; p++) {
      const start = Math.floor((p * 0.017 + rng() * 0.006) * sampleRate);
      const tick = synthesizeModalImpact(material, sampleRate, {
        velocity: 0.16 + inten * 0.18,
        pitchScale: 1.65 + p * 0.16,
        durationSec: 0.025,
        quality: quality === 'ultra' ? 'pro' : quality,
        seed: seed + p * 31,
      });
      for (let i = 0; i < tick.length && start + i < n; i++) {
        out[start + i] += tick[i] * 0.28;
      }
    }
    for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i]);
    return out;
  }

  if (kind === 'wrist_crack') {
    // Deep, brief, organic radiocarpal synovial micro-pop during deep windup coil!
    const hit = synthesizeModalImpact(material, sampleRate, {
      velocity: 0.32 + inten * 0.32,
      pitchScale: 0.72,
      durationSec: 0.055,
      quality,
      seed,
    });
    let lp = 0;
    for (let i = 0; i < hit.length; i++) {
      const u = i / hit.length;
      lp += (hit[i] - lp) * 0.22;
      hit[i] = lp * Math.exp(-u * 4.2) * 0.58;
    }
    return hit;
  }

  // Default `knuckle_snap`: crisp watchmaker/carved condyle micro-click
  const click = synthesizeModalImpact(material, sampleRate, {
    velocity: 0.22 + inten * 0.34,
    pitchScale: 2.35,
    durationSec: 0.045,
    quality,
    seed,
  });
  for (let i = 0; i < click.length; i++) {
    click[i] *= 0.42;
  }
  return click;
}
