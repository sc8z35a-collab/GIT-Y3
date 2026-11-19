/**
 * ★ JSound Engin 1.1 — Physical Acoustic Instrument & Heritage Sound Synthesizer ★
 *
 * Pure first-principles acoustic physics DSP (zero audio samples, 100% procedural):
 *  1. Taiko Drum (大太鼓 / 締太鼓 / 心鼓) — 8 Bessel circular-membrane eigenmodes +
 *     nonlinear tension pitch-droop + zelkova barrel Helmholtz cavity + bachi strike
 *  2. Kotsuzumi (小鼓) — Traditional Noh/Kabuki shoulder drum with cord-squeezed pitch bend
 *  3. Koto (十三絃箏) — Fractional-delay Karplus-Strong plucked silk waveguide +
 *     ivory tsume plectrum attack + 3-formant paulownia soundboard body
 *  4. Shakuhachi (尺八) — Jet-edge bamboo breath chiff + cylindrical bore formants + vibrato
 *  5. Edo Furin (江戸風鈴) — Hand-blown glass shell chime with delicate ceramic clapper
 *  6. Shishi-odoshi (鹿威し) — Hollow green Moso bamboo clapper onto wet river stone
 *  7. Kagura Suzu (神楽鈴) — Cascaded high-Q brass & gold-leaf shimmer bells
 *  8. Washi Tear (和紙裂断) — Stochastic mulberry cellulose fiber-snap shear burst
 *  9. Bonsho (梵鐘) — Deep cast-bronze sacred temple bell with rotating `うなり` beating
 * 10. Minnaert Bubble Droplet (洞窟滴水) — Physics-derived rising bubble resonance
 */

import {
  createSeededRng,
  decimate2xHalfBand,
  synthesizeModalImpactStereo,
} from './ModalSynthesizer';
import { JSoundQualityMode } from './types';

/** Fast Chamberlin State-Variable Filter for formants & body resonances */
class FormantSvf {
  public low = 0;
  public band = 0;
  public high = 0;

  public process(input: number, freqHz: number, q: number, sr: number): number {
    const f = Math.min(0.84, 2 * Math.sin((Math.PI * Math.min(freqHz, sr * 0.34)) / sr));
    const damp = 1 / Math.max(0.5, q);
    this.high = input - this.low - damp * this.band;
    this.band += f * this.high;
    this.low += f * this.band;
    return this.band;
  }
}

/**
 * 1. Physical Taiko Drum (大太鼓 / 締太鼓 / 心鼓)
 * Circular tensioned hide Bessel membrane modes (J_mn zeroes) + nonlinear strike pitch-droop
 * + wooden zelkova barrel cavity resonance + hinoki bachi impact!
 */
export function synthesizeTaikoDrum(
  variant: 'odaiko' | 'shime' | 'heartbeat',
  sampleRate: number,
  velocity = 1.0,
  quality: JSoundQualityMode = 'ultra',
  seed = 1001
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const v = Math.max(0.15, Math.min(1.5, velocity));
  const os = quality === 'ultra' ? 2 : 1;
  const dspSr = sampleRate * os;

  const durSec = variant === 'odaiko' ? 1.35 : variant === 'heartbeat' ? 0.58 : 0.65;
  const nOut = Math.floor(sampleRate * durSec);
  const n = nOut * os;
  const rawL = new Float32Array(n);
  const rawR = new Float32Array(n);

  // Fundamental hide frequencies + tension pitch-droop ratios
  const f0 = variant === 'odaiko' ? 68 : variant === 'heartbeat' ? 54 : 185;
  const droopRatio = variant === 'odaiko' ? 0.34 : variant === 'heartbeat' ? 0.24 : 0.28;
  const droopTau = variant === 'odaiko' ? 0.042 : variant === 'heartbeat' ? 0.036 : 0.024;
  const baseDecay = variant === 'odaiko' ? 0.42 : variant === 'heartbeat' ? 0.22 : 0.16;

  // Exact circular Bessel drumhead eigenmode ratios (J01, J11, J21, J02, J31, J12, J41, J22)
  const besselRatios = [1.0, 1.593, 2.136, 2.296, 2.653, 2.917, 3.155, 3.501];
  const besselAmps =
    variant === 'heartbeat'
      ? [1.0, 0.32, 0.14, 0.08, 0.04, 0.02, 0.01, 0.005]
      : [1.0, 0.56, 0.38, 0.3, 0.22, 0.16, 0.11, 0.075];

  const modeCount = quality === 'lite' ? 4 : besselRatios.length;
  const twoPiOverSr = (2 * Math.PI) / dspSr;

  // Bachi (hinoki stick) contact pulse onto taut cowhide
  const contactMs = variant === 'shime' ? 0.65 : variant === 'heartbeat' ? 2.8 : 1.35;
  const contactN = Math.max(8 * os, Math.floor((contactMs / 1000) * dspSr));
  for (let i = 0; i < contactN && i < n; i++) {
    const u = i / contactN;
    const hertz = Math.pow(Math.sin(Math.PI * u), 1.5);
    const slap = (rng() * 2 - 1) * Math.sin(Math.PI * u) * (variant === 'shime' ? 0.55 : 0.28);
    const val = (hertz * 0.65 + slap) * v * (variant === 'heartbeat' ? 0.35 : 0.85);
    rawL[i] += val;
    rawR[i] += val;
  }

  // Bessel membrane modes with authentic nonlinear hide-stretch pitch droop!
  for (let m = 0; m < modeCount; m++) {
    const freq = f0 * besselRatios[m] * (1 + (rng() - 0.5) * 0.008);
    const tau = baseDecay / (1 + m * 0.68);
    const decayMul = Math.exp(-1 / (tau * dspSr));
    let amp = besselAmps[m] * v * 0.55;
    let ph = rng() * 0.2;
    const endN = Math.min(n, Math.floor(tau * 6.5 * dspSr));

    const pan = (m % 2 === 0 ? 1 : -1) * Math.min(0.26, m * 0.045);
    const gL = 1 + pan;
    const gR = 1 - pan;

    for (let i = 0; i < endN; i++) {
      const t = i / dspSr;
      const ramp = i < contactN ? i / contactN : 1.0;
      const pitchMul = 1.0 + (droopRatio * Math.min(1.3, v)) / (1 + m * 0.45) * Math.exp(-t / droopTau);
      ph += freq * pitchMul * twoPiOverSr;
      const sVal = Math.sin(ph) * amp * ramp;
      rawL[i] += sVal * gL;
      rawR[i] += sVal * gR;
      amp *= decayMul;
    }
  }

  // Hollow Zelkova (Keyaki) Wooden Shell Helmholtz Resonance
  const shellHz = variant === 'odaiko' ? 116 : variant === 'heartbeat' ? 86 : 295;
  let shPh = 0;
  const shEnd = Math.min(n, Math.floor(baseDecay * 4.2 * dspSr));
  for (let i = 0; i < shEnd; i++) {
    const t = i / dspSr;
    shPh += shellHz * twoPiOverSr;
    const env = Math.exp(-t / (baseDecay * 0.72)) * Math.min(1, i / contactN);
    const sv = Math.sin(shPh) * env * v * 0.24;
    rawL[i] += sv;
    rawR[i] += sv;
  }

  for (let i = 0; i < n; i++) {
    rawL[i] = Math.tanh(rawL[i] * 0.88);
    rawR[i] = Math.tanh(rawR[i] * 0.88);
  }

  return os === 2
    ? { left: decimate2xHalfBand(rawL), right: decimate2xHalfBand(rawR) }
    : { left: rawL, right: rawR };
}

/**
 * 2. Traditional Japanese Kotsuzumi (小鼓 — Hourglass Shoulder Drum)
 * Signature Noh/Kabuki cord-squeezed pitch sweep ("pon!" / "po-o-on!")!
 */
export function synthesizeKotsuzumi(
  sampleRate: number,
  options: {
    variant?: 'pon_rise' | 'pon_drop' | 'ta_tight';
    velocity?: number;
    quality?: JSoundQualityMode;
    seed?: number;
  } = {}
): { left: Float32Array; right: Float32Array } {
  const variant = options.variant ?? 'pon_rise';
  const v = Math.max(0.2, Math.min(1.5, options.velocity ?? 1.0));
  const quality = options.quality ?? 'ultra';
  const rng = createSeededRng(options.seed ?? 2026);
  const os = quality === 'ultra' ? 2 : 1;
  const dspSr = sampleRate * os;

  const durSec = variant === 'ta_tight' ? 0.32 : 0.62;
  const n = Math.floor(sampleRate * durSec) * os;
  const rawL = new Float32Array(n);
  const rawR = new Float32Array(n);

  const fStart = variant === 'pon_rise' ? 195 : variant === 'pon_drop' ? 290 : 340;
  const fEnd = variant === 'pon_rise' ? 298 : variant === 'pon_drop' ? 178 : 275;
  const sweepTau = variant === 'ta_tight' ? 0.045 : 0.135;
  const decayTau = variant === 'ta_tight' ? 0.085 : 0.22;

  const twoPiOverSr = (2 * Math.PI) / dspSr;
  const slapN = Math.floor(0.0022 * dspSr);

  // Palm-finger dry horsehide slap exciter
  for (let i = 0; i < slapN && i < n; i++) {
    const u = i / slapN;
    const slap = (Math.pow(Math.sin(Math.PI * u), 1.4) * 0.55 + (rng() * 2 - 1) * 0.35 * Math.sin(Math.PI * u)) * v;
    rawL[i] += slap;
    rawR[i] += slap;
  }

  // Expressive tension-modulated harmonic/Bessel partials
  const ratios = [1.0, 1.62, 2.28, 3.05, 4.12];
  const amps = [1.0, 0.52, 0.32, 0.18, 0.09];
  for (let m = 0; m < ratios.length; m++) {
    let ph = rng() * 0.2;
    const tau = decayTau / (1 + m * 0.72);
    const endN = Math.min(n, Math.floor(tau * 6.5 * dspSr));
    const pan = (m % 2 === 0 ? 1 : -1) * 0.14;
    for (let i = 0; i < endN; i++) {
      const t = i / dspSr;
      const ramp = i < slapN ? i / slapN : 1.0;
      // Smooth silk-cord squeeze pitch bend!
      const bend = 1.0 - Math.exp(-t / sweepTau);
      const curF = (fStart + (fEnd - fStart) * bend) * ratios[m];
      ph += curF * twoPiOverSr;
      const env = Math.exp(-t / tau) * ramp * amps[m] * v * 0.58;
      const val = Math.sin(ph) * env;
      rawL[i] += val * (1 + pan);
      rawR[i] += val * (1 - pan);
    }
  }

  // Hourglass lacquer cherry-wood waist resonance (~640 Hz)
  let bodyPh = 0;
  const bodyEnd = Math.min(n, Math.floor(0.18 * dspSr));
  for (let i = 0; i < bodyEnd; i++) {
    const t = i / dspSr;
    bodyPh += 645 * twoPiOverSr;
    const val = Math.sin(bodyPh) * Math.exp(-t / 0.048) * v * 0.18;
    rawL[i] += val;
    rawR[i] += val;
  }

  for (let i = 0; i < n; i++) {
    rawL[i] = Math.tanh(rawL[i] * 0.9);
    rawR[i] = Math.tanh(rawR[i] * 0.9);
  }

  return os === 2
    ? { left: decimate2xHalfBand(rawL), right: decimate2xHalfBand(rawR) }
    : { left: rawL, right: rawR };
}

/**
 * 3. Physical 13-String Japanese Koto (十三絃箏)
 * Real Fractional-Delay Karplus-Strong Plucked Silk Waveguide + Ivory Tsume Plectrum
 * + 3-Formant Paulownia (Kiri) Soundboard Body Resonator!
 */
export function synthesizeKotoPluck(
  freqHz: number,
  sampleRate: number,
  options: {
    velocity?: number;
    durationSec?: number;
    seed?: number;
  } = {}
): { left: Float32Array; right: Float32Array } {
  const v = Math.max(0.15, Math.min(1.4, options.velocity ?? 0.85));
  const durSec = options.durationSec ?? 1.65;
  const rng = createSeededRng(options.seed ?? 3030);
  const n = Math.max(256, Math.floor(sampleRate * durSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Fractional delay line length for exact pitch tuning (zero tuning quantization!)
  const exactDelay = Math.max(16, sampleRate / Math.max(80, Math.min(2600, freqHz)) - 0.5);
  const delayInt = Math.floor(exactDelay);
  const frac = exactDelay - delayInt;
  const bufLen = delayInt + 4;
  const ring = new Float32Array(bufLen);

  // Exciter: Ivory Tsume plectrum plucking twisted silk string at 1/7 bridge position (comb-shaped!)
  const pluckPos = Math.max(2, Math.floor(delayInt / 7));
  let lpInit = 0;
  for (let i = 0; i < delayInt; i++) {
    const raw = rng() * 2 - 1;
    // Silk brightness scales with pluck velocity
    lpInit += (raw - lpInit) * (0.28 + v * 0.36);
    ring[i] = lpInit * v * 0.82;
  }
  // Bridge-pluck comb cancellation (authentic Koto bright nasal twang!)
  for (let i = delayInt - 1; i >= pluckPos; i--) {
    ring[i] -= ring[i - pluckPos] * 0.52;
  }
  // Remove DC offset from initial string excitation
  let mean = 0;
  for (let i = 0; i < delayInt; i++) mean += ring[i];
  mean /= delayInt;
  for (let i = 0; i < delayInt; i++) ring[i] -= mean;

  // Paulownia (Kiri) hollow soundboard 3-formant body resonances!
  const body1 = new FormantSvf();
  const body2 = new FormantSvf();
  const body3 = new FormantSvf();

  let writeIdx = 0;
  let prevOut = 0;
  let apState = 0;
  const damping = 0.9942 - Math.min(0.0025, (freqHz / 2400) * 0.0022);
  const brighten = 0.42 + v * 0.14; // Loop lowpass brightness
  const allpassCoeff = (1 - frac) / (1 + frac);

  // Subtle ivory tsume plectrum micro-click on first 2.5ms
  const tsumeN = Math.floor(sampleRate * 0.0025);

  for (let i = 0; i < n; i++) {
    const readIdx = (writeIdx - delayInt + bufLen) % bufLen;
    const rawS = ring[readIdx];

    // First-order Thiran all-pass fractional delay for exact cent-accurate pitch!
    const fracS = allpassCoeff * rawS + prevOut - allpassCoeff * apState;
    prevOut = rawS;
    apState = fracS;

    // Frequency-dependent silk string loss lowpass inside waveguide loop
    const prevRing = ring[(writeIdx - 1 + bufLen) % bufLen];
    const filtered = (fracS * brighten + prevRing * (1 - brighten)) * damping;
    ring[writeIdx] = filtered;
    writeIdx = (writeIdx + 1) % bufLen;

    // Soundboard body formants (215Hz air cavity, 480Hz top plate, 1180Hz bridge wood)
    const b1 = body1.process(filtered, 215, 2.6, sampleRate) * 0.34;
    const b2 = body2.process(filtered, 480, 3.1, sampleRate) * 0.24;
    const b3 = body3.process(filtered, 1180, 2.8, sampleRate) * 0.16;

    const tsume = i < tsumeN ? (rng() * 2 - 1) * Math.sin((i / tsumeN) * Math.PI) * 0.14 * v : 0;
    const attack = i < 24 ? i / 24 : 1.0;

    // Natural stereo radiation: direct string centered-left, hollow paulownia soundboard wide!
    left[i] = Math.tanh((filtered * 0.72 + b1 + b2 * 1.15 + b3 * 0.75 + tsume) * attack);
    right[i] = Math.tanh((filtered * 0.66 + b1 + b2 * 0.8 + b3 * 1.2 + tsume) * attack);
  }

  return { left, right };
}

/**
 * 3B. Multi-Note Koto Glissando / Pentatonic Phrase (Hirajoshi / Miyako-bushi tuning!)
 */
export function synthesizeKotoArpeggio(
  notesHz: number[],
  noteSpacingSec: number,
  sampleRate: number,
  velocity = 0.75,
  seed = 3131
): { left: Float32Array; right: Float32Array } {
  const totalSec = notesHz.length * noteSpacingSec + 1.55;
  const n = Math.floor(sampleRate * totalSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  notesHz.forEach((hz, idx) => {
    const start = Math.floor(idx * noteSpacingSec * sampleRate);
    const note = synthesizeKotoPluck(hz, sampleRate, {
      velocity: velocity * (0.88 + (idx / Math.max(1, notesHz.length)) * 0.2),
      durationSec: 1.5,
      seed: seed + idx * 71,
    });
    // Pan gently left-to-right across the 13 silk strings!
    const pan = notesHz.length > 1 ? idx / (notesHz.length - 1) : 0.5;
    const gL = Math.cos(pan * Math.PI * 0.42);
    const gR = Math.sin(pan * Math.PI * 0.42 + 0.12);
    for (let i = 0; i < note.left.length && start + i < n; i++) {
      left[start + i] += note.left[i] * gL * 0.65;
      right[start + i] += note.right[i] * gR * 0.65;
    }
  });

  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i]);
    right[i] = Math.tanh(right[i]);
  }
  return { left, right };
}

/**
 * 4. Physical Shakuhachi (尺八) Bamboo Aerophone Breath Harmonic Swell
 * Jet-edge turbulent breath chiff + cylindrical bamboo bore formants + organic vibrato!
 */
export function synthesizeShakuhachiBreath(
  fundamentalHz: number,
  sampleRate: number,
  durationSec = 1.45,
  velocity = 0.65,
  seed = 4040
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const chiffSvfL = new FormantSvf();
  const chiffSvfR = new FormantSvf();
  const airSvf = new FormantSvf();

  const twoPi = Math.PI * 2;
  let ph = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = i / n;
    // Expressive Japanese breath envelope: gentle airy bloom -> sustained resonance -> graceful taper
    const attack = Math.min(1, Math.pow(t / 0.16, 1.35));
    const release = u > 0.62 ? Math.cos(((u - 0.62) / 0.38) * Math.PI * 0.5) : 1.0;
    const env = attack * release * velocity;

    // Subtle organic meri/kari pitch scoop on attack + gentle diaphragm vibrato (4.6 Hz)
    const scoop = 1.0 - 0.032 * Math.exp(-t / 0.085);
    const vib = 1.0 + Math.sin(twoPi * 4.6 * t) * 0.0085 * Math.min(1, t / 0.35);
    const curF = fundamentalHz * scoop * vib;
    ph += (twoPi * curF) / sampleRate;

    // Cylindrical bamboo bore harmonic series (warm fundamental + crisp 2nd & airy 3rd!)
    const tone =
      Math.sin(ph) * 0.66 +
      Math.sin(ph * 2 + 0.18) * 0.24 * (0.65 + 0.35 * env) +
      Math.sin(ph * 3 + 0.4) * 0.095 +
      Math.sin(ph * 4) * 0.035;

    // Utaguchi (beveled bamboo edge) turbulent breath chiff!
    const wnL = rng() * 2 - 1;
    const wnR = rng() * 2 - 1;
    const chiffEnv = (Math.exp(-t / 0.11) * 0.72 + 0.28) * env;
    const chiffL = chiffSvfL.process(wnL, curF * 2.15, 3.8, sampleRate) * chiffEnv * 0.26;
    const chiffR = chiffSvfR.process(wnR, curF * 2.22, 3.8, sampleRate) * chiffEnv * 0.26;
    const breathAir = airSvf.process((wnL + wnR) * 0.5, 2900, 1.6, sampleRate) * env * 0.12;

    left[i] = Math.tanh((tone * env * 0.62 + chiffL + breathAir) * 0.85);
    right[i] = Math.tanh((tone * env * 0.58 + chiffR + breathAir) * 0.85);
  }

  return { left, right };
}

/**
 * 5. Edo Furin (江戸風鈴) — Hand-Blown Glass Wind Chime!
 */
export function synthesizeEdoFurin(
  sampleRate: number,
  pitchScale = 1.0,
  velocity = 0.65,
  quality: JSoundQualityMode = 'ultra',
  seed = 5050
): { left: Float32Array; right: Float32Array } {
  return synthesizeModalImpactStereo('furin_edo_glass', sampleRate, {
    velocity,
    pitchScale,
    durationSec: 1.5,
    quality,
    seed,
    stereoWidth: 0.9,
  });
}

/**
 * 6. Shishi-odoshi (鹿威し) — Garden Green Bamboo Clapper onto Wet River Stone!
 * Combines hollow bamboo bar modes + open tube air column resonance + delicate water splash!
 */
export function synthesizeShishiOdoshi(
  sampleRate: number,
  velocity = 0.85,
  quality: JSoundQualityMode = 'ultra',
  seed = 6060
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const knock = synthesizeModalImpactStereo('bamboo_shishi_odoshi', sampleRate, {
    velocity,
    pitchScale: 0.96 + rng() * 0.08,
    durationSec: 0.62,
    quality,
    seed,
    stereoWidth: 0.75,
  });

  // Add subtle hollow bamboo tube air-column resonance (~325 Hz) + tiny river water splash!
  const n = knock.left.length;
  const twoPiOverSr = (2 * Math.PI) / sampleRate;
  let tubePh = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    tubePh += 328 * twoPiOverSr;
    const tube = Math.sin(tubePh) * Math.exp(-t / 0.082) * Math.min(1, t / 0.003) * velocity * 0.24;
    knock.left[i] = Math.tanh(knock.left[i] + tube);
    knock.right[i] = Math.tanh(knock.right[i] + tube);
  }
  return knock;
}

/**
 * 7. Kagura Suzu / Hammered Gold-Leaf Shimmer Bells (神楽鈴・金箔閃光)
 */
export function synthesizeSuzuShimmer(
  sampleRate: number,
  intensity = 0.8,
  quality: JSoundQualityMode = 'ultra',
  seed = 7070
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const durSec = 0.95;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const grains = quality === 'lite' ? 4 : 8;
  for (let g = 0; g < grains; g++) {
    const start = Math.floor((g * 0.036 + rng() * 0.025) * sampleRate);
    const bell = synthesizeModalImpactStereo('suzu_brass_bell', sampleRate, {
      velocity: (0.45 + rng() * 0.45) * intensity,
      pitchScale: 0.85 + rng() * 0.48,
      durationSec: 0.42,
      quality: quality === 'ultra' ? 'pro' : quality,
      seed: seed + g * 43,
    });
    const pan = rng();
    const gL = Math.cos(pan * Math.PI * 0.5) * 0.42;
    const gR = Math.sin(pan * Math.PI * 0.5) * 0.42;
    for (let i = 0; i < bell.left.length && start + i < n; i++) {
      left[start + i] += bell.left[i] * gL;
      right[start + i] += bell.right[i] * gR;
    }
  }

  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i]);
    right[i] = Math.tanh(right[i]);
  }
  return { left, right };
}

/**
 * 8. Crisp Mulberry Washi Paper Slice / Tear (和紙裂断 — Scissors beats Paper!)
 */
export function synthesizeWashiTear(
  sampleRate: number,
  intensity = 1.0,
  seed = 8080
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const durSec = 0.18;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const svfL = new FormantSvf();
  const svfR = new FormantSvf();

  for (let i = 0; i < n; i++) {
    const u = i / n;
    // Rapid stochastic cellulose fiber-snap impulses sweeping upward as blade slices!
    const fiberSnapL = rng() > 0.68 ? (rng() * 2 - 1) * 1.85 : (rng() * 2 - 1) * 0.35;
    const fiberSnapR = rng() > 0.68 ? (rng() * 2 - 1) * 1.85 : (rng() * 2 - 1) * 0.35;
    const fBand = 2200 + u * 3100;
    const env = Math.sin(Math.pow(u, 0.6) * Math.PI) * Math.exp(-u * 1.6) * intensity * 0.62;
    left[i] = Math.tanh(svfL.process(fiberSnapL, fBand, 2.2, sampleRate) * env);
    right[i] = Math.tanh(svfR.process(fiberSnapR, fBand * 1.05, 2.2, sampleRate) * env);
  }
  return { left, right };
}

/**
 * 9. Deep Cast-Bronze Sacred Temple Bonsho Bell (梵鐘)
 */
export function synthesizeBonshoBell(
  fundamentalHz: number,
  sampleRate: number,
  durationSec = 2.8,
  velocity = 0.85,
  quality: JSoundQualityMode = 'ultra',
  seed = 9090
): { left: Float32Array; right: Float32Array } {
  return synthesizeModalImpactStereo('bonsho_bronze_bell', sampleRate, {
    velocity,
    pitchScale: fundamentalHz / 130.81,
    durationSec,
    quality,
    seed,
    stereoWidth: 1.0,
  });
}

/**
 * 10. Minnaert Physics Cave Water Droplet (洞窟水滴 — live 3D Onsen spatial actor!)
 */
export function synthesizeWaterDroplet(
  sampleRate: number,
  seed = 9595
): Float32Array {
  const rng = createSeededRng(seed);
  const durSec = 0.045;
  const n = Math.floor(sampleRate * durSec);
  const out = new Float32Array(n);
  const baseF = 780 + rng() * 1450;
  const twoPi = Math.PI * 2;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    // Exact Minnaert bubble oscillation upward pitch chirp!
    const f = baseF * (1 + u * 0.64);
    ph += (twoPi * f) / sampleRate;
    const env = Math.sin(Math.PI * u) * Math.exp(-u * 3.1);
    out[i] = Math.sin(ph) * env * 0.65;
  }
  return out;
}
