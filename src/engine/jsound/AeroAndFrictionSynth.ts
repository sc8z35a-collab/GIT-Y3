/**
 * ★ JSound Engin 1.0 — Strouhal Aerodynamic Whoosh & Stick-Slip Friction DSP ★
 *
 * Physically models:
 *  1. Aerodynamic Vortex-Shedding Whoosh (Strouhal Law: f_s(t) = St * v(t) / D)
 *     for sweeping kimono sleeves, velvet cuffs, and hand strikes through air
 *  2. Stick-Slip Shear Friction (forged scissors blades sliding past one another)
 *  3. JHand Kinesis 1.0 Micro-Joint Foley (knuckle clicks, tendon snaps, palm clenches)
 */

import { HandMaterialPreset } from '../../graphics/GraphicsConfig';
import { createSeededRng, synthesizeModalImpact } from './ModalSynthesizer';
import { JSoundQualityMode } from './types';

/**
 * State-variable bandpass/lowpass filter step (zero-delay-feedback Chamberlin SVF,
 * unconditionally stable up to ~0.35 * sampleRate).
 */
class SvfFilter {
  public low = 0;
  public band = 0;
  public high = 0;

  public process(input: number, freqHz: number, q: number, sampleRate: number): number {
    const f = Math.min(0.85, 2 * Math.sin((Math.PI * Math.min(freqHz, sampleRate * 0.34)) / sampleRate));
    const damp = 1 / Math.max(0.5, q);
    this.high = input - this.low - damp * this.band;
    this.band += f * this.high;
    this.low += f * this.band;
    return this.band;
  }
}

/**
 * Synthesize a physically shaped Strouhal aerodynamic vortex-shedding whoosh.
 * Higher `speed` raises Strouhal peak frequency & turbulent silk harmonics nonlinearly!
 */
export function synthesizeAeroWhoosh(
  sampleRate: number,
  options: {
    speed?: number; // 0.4 .. 2.0 (m/s normalized)
    durationSec?: number;
    fabricRoughness?: number; // 0.3 (lacquer) .. 1.0 (silk/velvet)
    seed?: number;
  } = {}
): { left: Float32Array; right: Float32Array } {
  const speed = Math.max(0.35, Math.min(2.2, options.speed ?? 1.0));
  const durSec = options.durationSec ?? 0.24;
  const roughness = options.fabricRoughness ?? 0.72;
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

  // Base Strouhal peak frequency scales proportionally with hand speed (St * v / D)!
  const fBase = 210 * speed;
  const fPeak = 1380 * speed;
  const fSilkBase = 1650 * speed;
  // Turbulent kimono-silk hiss scales nonlinearly with Reynolds number (~ speed^2)
  const reynoldsTurbulence = Math.min(1.0, speed * speed * 0.32) * roughness;

  for (let i = 0; i < n; i++) {
    const u = i / n; // 0..1 normalized swing trajectory
    // Asymmetric bell velocity curve v(t): rapid whip acceleration -> trailing deceleration
    const velCurve = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 1.65);
    const freqCore = fBase + (fPeak - fBase) * velCurve;
    const freqSilk = fSilkBase * (0.65 + 0.72 * velCurve);

    const wL = rng() * 2 - 1;
    const wR = rng() * 2 - 1;
    // Correlate 45% of noise for coherent air body + 55% decorrelated for wide silk stereo image!
    const nL = wL * 0.75 + wR * 0.25;
    const nR = wR * 0.75 + wL * 0.25;

    // 1. Cascaded 24dB/oct Strouhal vortex shedding core (eliminates harsh unfiltered HF hiss!)
    const coreL = svfCoreL2.process(svfCoreL1.process(nL, freqCore, 2.4, sampleRate), freqCore, 1.8, sampleRate);
    const coreR = svfCoreR2.process(svfCoreR1.process(nR, freqCore * 1.03, 2.4, sampleRate), freqCore * 1.03, 1.8, sampleRate);

    // 2. Woven kimono-silk / sleeve micro-turbulence sheen (Reynolds v^2 scaling!)
    const silkL = svfSilkL.process(nL, freqSilk, 2.6, sampleRate) * reynoldsTurbulence * 0.34;
    const silkR = svfSilkR.process(nR, freqSilk * 1.04, 2.6, sampleRate) * reynoldsTurbulence * 0.34;

    // 3. Low-pressure air-cavity chest displacement (95..195 Hz)
    svfSub.process((nL + nR) * 0.5, 95 + 100 * velCurve, 1.2, sampleRate);
    const airBody = svfSub.low * 0.52;

    const amp = velCurve * Math.min(1.25, speed * 0.68);
    left[i] = Math.tanh((coreL * 0.68 + silkL + airBody) * amp);
    right[i] = Math.tanh((coreR * 0.68 + silkR + airBody) * amp);
  }

  return { left, right };
}

/**
 * Synthesize physical forged-blade Scissors stick-slip shear + sharp metallic/craft snip!
 */
export function synthesizeScissorsShear(
  material: HandMaterialPreset,
  sampleRate: number,
  velocity = 1.0,
  quality: JSoundQualityMode = 'pro',
  seed = 404
): Float32Array {
  const rng = createSeededRng(seed);
  const durSec = 0.145;
  const n = Math.floor(sampleRate * durSec);
  const out = new Float32Array(n);

  const isMetallic = material === 'karakuri_bronze' || material === 'obsidian_gold';
  const svf = new SvfFilter();

  // Phase 1 (0..42ms): Sliding blade-edge stick-slip friction scrape
  const scrapeN = Math.floor(sampleRate * 0.044);
  for (let i = 0; i < scrapeN; i++) {
    const u = i / scrapeN;
    // Stochastic micro-slip pulses (stick-slip physics!)
    const slip = rng() > 0.72 ? (rng() * 2 - 1) * 1.9 : (rng() * 2 - 1) * 0.35;
    const fShear = (isMetallic ? 3100 : 1950) * (0.85 + u * 0.65);
    const filtered = svf.process(slip, fShear, isMetallic ? 5.8 : 3.2, sampleRate);
    const env = Math.sin(Math.PI * u) * velocity * 0.38;
    out[i] += filtered * env;
  }

  // Phase 2 (34ms..end): Crisp blade-tip closure snap modal ring!
  const snapStart = Math.floor(sampleRate * 0.032);
  const modal = synthesizeModalImpact(material, sampleRate, {
    velocity: velocity * 0.75,
    pitchScale: isMetallic ? 1.85 : 1.55,
    durationSec: durSec - 0.03,
    quality,
    seed: seed + 19,
  });

  for (let i = 0; i < modal.length && i + snapStart < n; i++) {
    out[i + snapStart] += modal[i] * 0.58;
  }

  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i]);
  }
  return out;
}

/**
 * Synthesize micro-articulated joint foley driven directly by JHand Kinesis 1.0!
 *  - `knuckle_snap`: delicate watchmaker/wooden joint pin click
 *  - `palm_clench`: soft muted thumb/finger compression into sculpted palm bed
 *  - `finger_whip`: quick finger-flick air snap
 */
export function synthesizeJointFoley(
  kind: 'knuckle_snap' | 'palm_clench' | 'finger_whip',
  material: HandMaterialPreset,
  intensity: number,
  sampleRate: number,
  quality: JSoundQualityMode = 'pro',
  seed = 909
): Float32Array {
  if (kind === 'finger_whip') {
    const w = synthesizeAeroWhoosh(sampleRate, {
      speed: 0.75 + intensity * 0.75,
      durationSec: 0.085,
      fabricRoughness: 0.55,
      seed,
    });
    const out = new Float32Array(w.left.length);
    for (let i = 0; i < out.length; i++) out[i] = (w.left[i] + w.right[i]) * 0.24 * intensity;
    return out;
  }

  if (kind === 'palm_clench') {
    // Muted low-pass flesh/wood palm bed compression thump + subtle surface contact
    const hit = synthesizeModalImpact(material, sampleRate, {
      velocity: 0.28 + intensity * 0.38,
      pitchScale: 0.58,
      durationSec: 0.08,
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

  // `knuckle_snap`: razor-crisp micro pin/condyle click (very short, understated luxury craft!)
  const click = synthesizeModalImpact(material, sampleRate, {
    velocity: 0.22 + intensity * 0.32,
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
