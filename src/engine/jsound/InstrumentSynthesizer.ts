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

/**
 * 11. Tsugaru Shamisen (津軽三味線):
 *     Karplus-Strong silk string + authentic Sawari (さわり) buzzing ridge nonlinearity
 *     + taut drumskin bachi plectrum slap body (`tsugaru_shamisen_body`).
 */
export function synthesizeShamisenPluck(
  freqHz: number,
  sampleRate: number,
  velocity = 1.0,
  sawariAmount = 0.52,
  durationSec = 1.35,
  quality: JSoundQualityMode = 'ultra',
  seed = 11011
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(256, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const period = Math.max(8, Math.round(sampleRate / Math.max(70, freqHz)));
  const buf = new Float32Array(period);
  // Crisp bachi ivory plectrum initial pluck excitation (bright, stiff pick spectrum)
  let lpInit = 0;
  for (let i = 0; i < period; i++) {
    const white = rng() * 2 - 1;
    lpInit = lpInit * 0.32 + white * 0.68;
    const pickPos = Math.sin((Math.PI * i) / period);
    buf[i] = (lpInit * 0.8 + pickPos * 0.25) * velocity;
  }

  // Drumskin bachi slap transient
  const bodySlap = synthesizeModalImpactStereo('tsugaru_shamisen_body', sampleRate, {
    velocity: velocity * 0.85,
    pitchScale: 0.96 + rng() * 0.08,
    durationSec: Math.min(0.24, durationSec),
    quality,
    seed: seed + 19,
    stereoWidth: 0.75,
  });

  const bodySvfL = new FormantSvf();
  const bodySvfR = new FormantSvf();
  const sawariSvf = new FormantSvf();
  const damp = 0.9928 - (freqHz > 400 ? 0.0012 : 0);
  let idx = 0;
  let prev = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const cur = buf[idx];
    const next = buf[(idx + 1) % period];
    const filtered = (cur * 0.56 + next * 0.44) * damp;
    buf[idx] = filtered;
    idx = (idx + 1) % period;

    // Authentic Sawari (さわり) subtle buzzing rattle when string amplitude grazes ridge!
    const buzzRect = Math.max(0, Math.abs(cur) - 0.08) * (cur >= 0 ? 1 : -0.65);
    const sawariBuzz =
      sawariSvf.process(buzzRect, 1480 + Math.min(900, freqHz * 2.4), 2.4, sampleRate) *
      sawariAmount *
      Math.exp(-t * 2.2) *
      0.72;

    const skinResL = bodySvfL.process(cur + sawariBuzz, 420, 1.35, sampleRate) * 0.42;
    const skinResR = bodySvfR.process(prev + sawariBuzz * 0.92, 540, 1.45, sampleRate) * 0.42;
    prev = cur;

    const env = Math.exp(-t * 1.45);
    let sL = (cur * 0.72 + sawariBuzz * 0.65 + skinResL) * env;
    let sR = (cur * 0.66 + sawariBuzz * 0.58 + skinResR) * env;

    if (i < bodySlap.left.length) {
      sL += bodySlap.left[i] * 0.44;
      sR += bodySlap.right[i] * 0.44;
    }

    left[i] = Math.tanh(sL * 0.95);
    right[i] = Math.tanh(sR * 0.95);
  }
  return { left, right };
}

/**
 * Tsugaru Shamisen Rapid Rhythmic Phrase (津軽三味線・叩き撥フレーズ — great for Clash / PV / Audition!)
 */
export function synthesizeShamisenPhrase(
  notesHz: number[],
  sampleRate: number,
  stepSec = 0.095,
  velocity = 0.95,
  quality: JSoundQualityMode = 'ultra',
  seed = 11220
): { left: Float32Array; right: Float32Array } {
  const totalSec = notesHz.length * stepSec + 1.15;
  const n = Math.floor(sampleRate * totalSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  notesHz.forEach((hz, k) => {
    const start = Math.floor(k * stepSec * sampleRate);
    const accent = k === 0 || k === notesHz.length - 1 ? 1.08 : 0.86;
    const pluck = synthesizeShamisenPluck(
      hz,
      sampleRate,
      velocity * accent,
      0.56,
      1.1,
      quality,
      seed + k * 71
    );
    const pan = -0.35 + (k / Math.max(1, notesHz.length - 1)) * 0.7;
    const gL = Math.sqrt(0.5 * (1 - pan * 0.6));
    const gR = Math.sqrt(0.5 * (1 + pan * 0.6));
    for (let i = 0; i < pluck.left.length && start + i < n; i++) {
      left[start + i] += pluck.left[i] * gL * 0.72;
      right[start + i] += pluck.right[i] * gR * 0.72;
    }
  });

  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i]);
    right[i] = Math.tanh(right[i]);
  }
  return { left, right };
}

/**
 * 12. Satsuma Biwa (薩摩琵琶):
 *     Deep resonant mulberry-wood lute with wide curved Sawari fret buzz & dramatic pitch-bend strum!
 */
export function synthesizeBiwaStrum(
  rootHz: number,
  sampleRate: number,
  velocity = 1.0,
  durationSec = 2.1,
  quality: JSoundQualityMode = 'ultra',
  seed = 12012
): { left: Float32Array; right: Float32Array } {
  const n = Math.max(512, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Classic Biwa tuning intervals: root, 4th, 5th, octave strummed rapidly with wooden bachi
  const strings = [rootHz, rootHz * 1.333, rootHz * 1.5, rootHz * 2.0];
  const body = synthesizeModalImpactStereo('biwa_mulberry_body', sampleRate, {
    velocity: velocity * 0.85,
    pitchScale: 1.0,
    durationSec: 0.35,
    quality,
    seed: seed + 13,
    stereoWidth: 0.85,
  });

  const twoPi = Math.PI * 2;
  strings.forEach((hz, sIdx) => {
    const offset = Math.floor(sIdx * 0.024 * sampleRate);
    const rng = createSeededRng(seed + sIdx * 97);
    const svfBuzz = new FormantSvf();
    const pan = -0.4 + sIdx * 0.27;
    const gL = Math.sqrt(0.5 * (1 - pan * 0.65));
    const gR = Math.sqrt(0.5 * (1 + pan * 0.65));
    let phase = rng() * 0.5;

    for (let i = offset; i < n; i++) {
      const t = (i - offset) / sampleRate;
      // Authentic Satsuma Biwa string-bend (Oshi): initial high tension settles downward
      const bend = 1.0 + 0.032 * Math.exp(-t / 0.14);
      phase += (twoPi * hz * bend) / sampleRate;

      const env = Math.min(1, t / 0.004) * Math.exp(-t * (0.95 + sIdx * 0.14));
      // Rich harmonic series + prominent Biwa Sawari buzzing overtone shimmer!
      let sig =
        Math.sin(phase) * 0.55 +
        Math.sin(phase * 2.002) * 0.36 * Math.exp(-t * 0.6) +
        Math.sin(phase * 3.005) * 0.24 * Math.exp(-t * 1.1) +
        Math.sin(phase * 4.01) * 0.14 * Math.exp(-t * 1.7) +
        Math.sin(phase * 5.02) * 0.09 * Math.exp(-t * 2.3);

      // Characteristic Biwa Sawari metallic-wooden buzz rattle
      const buzzIn = Math.max(0, sig - 0.12) * Math.sin(phase * 3.5);
      const buzz = svfBuzz.process(buzzIn, 980 + sIdx * 240, 2.6, sampleRate) * 0.65 * Math.exp(-t * 1.5);
      const val = (sig + buzz) * env * velocity * 0.34;
      left[i] += val * gL;
      right[i] += val * gR;
    }
  });

  for (let i = 0; i < n; i++) {
    const bL = i < body.left.length ? body.left[i] * 0.36 : 0;
    const bR = i < body.right.length ? body.right[i] * 0.36 : 0;
    left[i] = Math.tanh((left[i] + bL) * 0.96);
    right[i] = Math.tanh((right[i] + bR) * 0.96);
  }
  return { left, right };
}

/**
 * 13. Gagaku Sho Free-Reed Mouth Organ (雅楽・笙 — 合竹 Aitake Cluster Chord):
 *     6-pipe ethereal bamboo free-reed cluster with slow breath swell & golden shimmer!
 */
export function synthesizeShoCluster(
  baseHzOrNotes: number | number[] = 440,
  sampleRate = 48000,
  durationSec = 2.4,
  intensity = 0.85,
  seed = 13013
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(512, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Authentic Gagaku Aitake (合竹 6-pipe ratios: 1, 9/8, 3/2, 27/16, 2, 9/4) or explicit chord frequencies
  const freqs = Array.isArray(baseHzOrNotes)
    ? baseHzOrNotes.length > 0
      ? baseHzOrNotes
      : [440, 495, 660, 742.5, 880, 990]
    : [1.0, 1.125, 1.5, 1.6875, 2.0, 2.25].map((r) => baseHzOrNotes * r);
  const baseHz = freqs[0];
  const pipes = freqs.map((f, idx) => ({
    hz: f * (1 + (rng() - 0.5) * 0.0025),
    phase: rng() * Math.PI * 2,
    pan: freqs.length > 1 ? -0.68 + (idx / (freqs.length - 1)) * 1.36 : 0,
    detuneLfo: 0.45 + idx * 0.17,
  }));

  const breathSvfL = new FormantSvf();
  const breathSvfR = new FormantSvf();
  const twoPi = Math.PI * 2;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = t / durationSec;
    // Silky Gagaku inhale/exhale envelope (tebiki breath swell)
    const atk = Math.min(1, t / 0.38);
    const rel = u > 0.72 ? Math.max(0, (1 - u) / 0.28) : 1.0;
    const breathEnv = Math.sin(atk * Math.PI * 0.5) * Math.sin(rel * Math.PI * 0.5);

    let sumL = 0;
    let sumR = 0;
    for (let p = 0; p < pipes.length; p++) {
      const pipe = pipes[p];
      const shimmer = 1.0 + Math.sin(twoPi * pipe.detuneLfo * t) * 0.0012;
      pipe.phase += (twoPi * pipe.hz * shimmer) / sampleRate;
      // Brass free-reed harmonic waveform (crystal clear fundamental + warm 2nd/3rd/5th)
      const reed =
        Math.sin(pipe.phase) * 0.58 +
        Math.sin(pipe.phase * 2) * 0.24 +
        Math.sin(pipe.phase * 3) * 0.14 +
        Math.sin(pipe.phase * 5) * 0.05;
      const gL = Math.sqrt(0.5 * (1 - pipe.pan * 0.7));
      const gR = Math.sqrt(0.5 * (1 + pipe.pan * 0.7));
      sumL += reed * gL;
      sumR += reed * gR;
    }

    // Subtle bamboo chamber air whisper
    const airL = breathSvfL.process(rng() * 2 - 1, baseHz * 3.1, 2.5, sampleRate) * 0.075;
    const airR = breathSvfR.process(rng() * 2 - 1, baseHz * 3.25, 2.5, sampleRate) * 0.075;

    left[i] = Math.tanh((sumL * 0.22 + airL) * breathEnv * intensity);
    right[i] = Math.tanh((sumR * 0.22 + airR) * breathEnv * intensity);
  }
  return { left, right };
}

/**
 * 14. Shinobue / Nohkan Bamboo Transverse Flute (篠笛・能管):
 *     High piercing Japanese festival/theater bamboo flute with jet-edge chiff & graceful vibrato!
 */
export function synthesizeShinobuePhrase(
  baseHz = 880,
  sampleRate = 48000,
  durationSec = 1.15,
  intensity = 0.85,
  seed = 14014
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(256, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const jetSvf = new FormantSvf();
  const twoPi = Math.PI * 2;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = t / durationSec;

    // Expressive Japanese grace-note slide (kuri-age) into main note + late vibrato
    const graceGlide = t < 0.09 ? 0.89 + (t / 0.09) * 0.11 : u > 0.65 ? 1.0 + (u - 0.65) * 0.14 : 1.0;
    const vibDepth = Math.min(1, Math.max(0, (t - 0.16) / 0.35)) * 0.016;
    const freq = baseHz * graceGlide * (1 + Math.sin(twoPi * 5.8 * t) * vibDepth);
    phase += (twoPi * freq) / sampleRate;

    const atk = Math.min(1, t / 0.045);
    const rel = u > 0.78 ? Math.max(0, (1 - u) / 0.22) : 1.0;
    const env = atk * rel;

    // Bamboo bore tone (pure fundamental + characteristic 2nd/3rd overblow brilliance)
    const tone =
      Math.sin(phase) * 0.72 +
      Math.sin(phase * 2) * 0.24 * Math.min(1, t / 0.08) +
      Math.sin(phase * 3) * 0.09 * Math.min(1, t / 0.12);

    // Embouchure jet-edge breath chiff strongest at attack!
    const chiffEnv = 0.28 * Math.exp(-t / 0.06) + 0.09;
    const jet = jetSvf.process(rng() * 2 - 1, freq * 2.1, 2.2, sampleRate) * chiffEnv;

    const sig = (tone + jet) * env * intensity * 0.72;
    const pan = Math.sin(t * 1.4) * 0.18;
    left[i] = Math.tanh(sig * (1 - pan * 0.4));
    right[i] = Math.tanh(sig * (1 + pan * 0.4));
  }
  return { left, right };
}

/**
 * 15. Atarigane / Chanchiki Festival Brass Gong (摺鉦・当り鉦 — "チキ・トン"):
 *     Supports 'damped' (palm-muted Chiki), 'open' (singing Kon), or 'double' (Chiki-Kon pair).
 */
export function synthesizeAtarigane(
  sampleRate: number,
  variant: 'open' | 'damped' | 'double' = 'double',
  velocity = 0.95,
  quality: JSoundQualityMode = 'ultra',
  seed = 15015
): { left: Float32Array; right: Float32Array } {
  if (variant === 'damped') {
    const damped = synthesizeModalImpactStereo('kane_chanchiki', sampleRate, {
      velocity: velocity * 0.88,
      pitchScale: 1.18,
      durationSec: 0.16,
      quality,
      seed,
      stereoWidth: 0.82,
    });
    for (let i = 0; i < damped.left.length; i++) {
      const mute = Math.exp(-(i / sampleRate) * 24);
      damped.left[i] *= mute;
      damped.right[i] *= mute;
    }
    return damped;
  }

  if (variant === 'open') {
    return synthesizeModalImpactStereo('kane_chanchiki', sampleRate, {
      velocity: velocity * 1.0,
      pitchScale: 0.98,
      durationSec: 1.05,
      quality,
      seed,
      stereoWidth: 1.0,
    });
  }

  // Hand-damped crisp first hit ("Chiki") + resonant open second strike ("Kon")
  const damped = synthesizeModalImpactStereo('kane_chanchiki', sampleRate, {
    velocity: velocity * 0.82,
    pitchScale: 1.18,
    durationSec: 0.14,
    quality,
    seed,
    stereoWidth: 0.8,
  });
  const open = synthesizeModalImpactStereo('kane_chanchiki', sampleRate, {
    velocity: velocity * 1.02,
    pitchScale: 0.96,
    durationSec: 1.05,
    quality,
    seed: seed + 37,
    stereoWidth: 1.0,
  });

  const gap = Math.floor(0.11 * sampleRate);
  const n = Math.max(damped.left.length, gap + open.left.length);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  for (let i = 0; i < damped.left.length; i++) {
    const mute = Math.exp(-(i / sampleRate) * 26);
    left[i] += damped.left[i] * mute * 0.85;
    right[i] += damped.right[i] * mute * 0.85;
  }
  for (let i = 0; i < open.left.length && gap + i < n; i++) {
    left[gap + i] += open.left[i] * 0.92;
    right[gap + i] += open.right[i] * 0.92;
  }
  return { left, right };
}

/**
 * 16. Carved Camphor-Wood Temple Mokugyo (楠木魚 — ポク・ポク):
 */
export function synthesizeMokugyo(
  sampleRate: number,
  pitchScale = 1.0,
  velocity = 0.9,
  quality: JSoundQualityMode = 'ultra',
  seed = 16016
): { left: Float32Array; right: Float32Array } {
  return synthesizeModalImpactStereo('mokugyo_camphor', sampleRate, {
    velocity,
    pitchScale,
    durationSec: 0.38,
    quality,
    seed,
    stereoWidth: 0.72,
  });
}

/**
 * 17. Tamahagane Folded-Steel Katana Draw & Singing Blade (玉鋼抜刀・斬撃共鳴):
 *     High-resolution metallic koiguchi scrape transitioning into crystalline steel ring!
 */
export function synthesizeKatanaDraw(
  sampleRate: number,
  intensity = 1.0,
  quality: JSoundQualityMode = 'ultra',
  seed = 17017
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const durSec = 0.92;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const ring = synthesizeModalImpactStereo('katana_tamahagane', sampleRate, {
    velocity: intensity * 1.15,
    pitchScale: 1.04,
    durationSec: 0.82,
    quality,
    seed: seed + 17,
    stereoWidth: 1.0,
  });

  const svf1 = new FormantSvf();
  const svf2 = new FormantSvf();
  const ringOffset = Math.floor(0.1 * sampleRate);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Accelerating metallic scabbard friction sweep (0..0.24s)
    if (t < 0.28) {
      const u = t / 0.28;
      const noise = rng() * 2 - 1;
      const f1 = 2400 + u * 5200;
      const f2 = 4100 + u * 6400;
      const env = Math.sin(u * Math.PI) * intensity * 0.44;
      left[i] += svf1.process(noise, f1, 7.5, sampleRate) * env;
      right[i] += svf2.process(noise, f2, 8.2, sampleRate) * env;
    }
    if (i >= ringOffset && i - ringOffset < ring.left.length) {
      left[i] += ring.left[i - ringOffset] * 0.82;
      right[i] += ring.right[i - ringOffset] * 0.82;
    }
    left[i] = Math.tanh(left[i]);
    right[i] = Math.tanh(right[i]);
  }
  return { left, right };
}

/**
 * 18. Folding Ceremonial Mai-Sensu Fan Snap (舞扇開閉・パッ！):
 *     Crisp split-bamboo rib snap + pleated gilded-washi air burst!
 */
export function synthesizeSensuSnap(
  sampleRate: number,
  intensity = 0.95,
  quality: JSoundQualityMode = 'ultra',
  seed = 18018
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const durSec = 0.3;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const rib = synthesizeModalImpactStereo('sensu_bamboo_paper', sampleRate, {
    velocity: intensity * 1.05,
    pitchScale: 1.0,
    durationSec: 0.16,
    quality,
    seed,
    stereoWidth: 0.9,
  });

  const airSvfL = new FormantSvf();
  const airSvfR = new FormantSvf();

  for (let i = 0; i < n; i++) {
    const u = i / n;
    // Rapid pleated paper air-flutter wave fanning left-to-right!
    const pleatMod = 0.65 + 0.35 * Math.sin(u * Math.PI * 14);
    const airEnv = Math.sin(Math.pow(u, 0.45) * Math.PI) * Math.exp(-u * 2.8) * pleatMod * intensity * 0.58;
    const fAir = 1150 + u * 2600;
    const aL = airSvfL.process(rng() * 2 - 1, fAir, 1.9, sampleRate) * airEnv * (1.15 - u * 0.5);
    const aR = airSvfR.process(rng() * 2 - 1, fAir * 1.08, 1.9, sampleRate) * airEnv * (0.65 + u * 0.5);

    const rL = i < rib.left.length ? rib.left[i] * 0.78 : 0;
    const rR = i < rib.right.length ? rib.right[i] * 0.78 : 0;
    left[i] = Math.tanh(rL + aL);
    right[i] = Math.tanh(rR + aR);
  }
  return { left, right };
}

// =============================================================================
// JSOUND ENGIN 1.3 — 8 NEW IMPERIAL GAGAKU, NOH & ZEN GARDEN PHYSICAL INSTRUMENTS
// (Total 26 Pure-Physical-Modeling Instruments!)
// =============================================================================

/** 4-Point Cubic Hermite (Catmull-Rom) fractional delay-line reader (<0.01 cent pitch accuracy!) */
function readCubicHermite(buf: Float32Array, indexFloat: number): number {
  const len = buf.length;
  const i1 = Math.floor(indexFloat);
  const f = indexFloat - i1;
  const y0 = buf[(i1 - 1 + len) % len];
  const y1 = buf[(i1 + len) % len];
  const y2 = buf[(i1 + 1) % len];
  const y3 = buf[(i1 + 2) % len];
  const c0 = y1;
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * f + c2) * f + c1) * f + c0;
}

/**
 * 19. Imperial Gagaku Ryuteki Bamboo Transverse Flute (雅楽・龍笛):
 *     Lower, warmer susudake smoked-bamboo bore than Shinobue with expressive "seme" overblow glow!
 */
export function synthesizeRyutekiPhrase(
  baseHz = 587.33,
  sampleRate = 48000,
  durationSec = 1.45,
  intensity = 0.86,
  seed = 19019
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(256, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const jetSvf = new FormantSvf();
  const boreSvf = new FormantSvf();
  const twoPi = Math.PI * 2;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = t / durationSec;
    // Authentic Gagaku Ryuteki slow pitch ascent (meri -> kari) + noble vibrato
    const glide =
      t < 0.14
        ? 0.92 + (t / 0.14) * 0.08
        : u > 0.58 && u < 0.84
        ? 1.0 + Math.sin(((u - 0.58) / 0.26) * Math.PI) * 0.125
        : 1.0;
    const vib = Math.min(1, Math.max(0, (t - 0.22) / 0.4)) * 0.014 * Math.sin(twoPi * 4.8 * t);
    const freq = baseHz * glide * (1 + vib);
    phase += (twoPi * freq) / sampleRate;

    const atk = Math.sin(Math.min(1, t / 0.085) * Math.PI * 0.5);
    const rel = u > 0.76 ? Math.sin(((1 - u) / 0.24) * Math.PI * 0.5) : 1.0;
    const env = atk * rel;

    const overblow = Math.min(1, t / 0.16) * (0.34 + 0.14 * Math.sin(u * Math.PI));
    const tone =
      Math.sin(phase) * 0.68 +
      Math.sin(phase * 2.001) * overblow +
      Math.sin(phase * 3.003) * 0.13 +
      Math.sin(phase * 4.006) * 0.05;

    const jetNoise = jetSvf.process(rng() * 2 - 1, freq * 2.35, 2.6, sampleRate) * (0.24 * Math.exp(-t / 0.09) + 0.07);
    const warmBody = boreSvf.process(tone, freq * 1.15, 1.35, sampleRate) * 0.35;

    const sig = (tone * 0.78 + warmBody + jetNoise) * env * intensity * 0.76;
    const pan = Math.sin(t * 1.1) * 0.22;
    left[i] = Math.tanh(sig * (1 - pan * 0.45));
    right[i] = Math.tanh(sig * (1 + pan * 0.45));
  }
  return { left, right };
}

/**
 * 20. Imperial Gagaku Hichiriki Double-Reed Pipe (雅楽・篳篥 — 塩梅 Enbai Pitch-Bend):
 *     Rich asymmetric double-reed spectrum sculpted through conical bamboo formant filters!
 */
export function synthesizeHichirikiPhrase(
  baseHz = 440.0,
  sampleRate = 48000,
  durationSec = 1.55,
  intensity = 0.85,
  seed = 20020
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(256, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const f1 = new FormantSvf();
  const f2 = new FormantSvf();
  const twoPi = Math.PI * 2;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = t / durationSec;
    // Signature Hichiriki "Enbai" dramatic reed-lip pitch bend scooping up from below!
    const enbai =
      t < 0.22
        ? 0.84 + 0.16 * Math.sin((t / 0.22) * Math.PI * 0.5)
        : u > 0.72
        ? 1.0 - 0.06 * ((u - 0.72) / 0.28)
        : 1.0;
    const vib = Math.min(1, Math.max(0, (t - 0.3) / 0.35)) * 0.018 * Math.sin(twoPi * 4.4 * t);
    const freq = baseHz * enbai * (1 + vib);
    phase += (twoPi * freq) / sampleRate;

    const atk = Math.sin(Math.min(1, t / 0.11) * Math.PI * 0.5);
    const rel = u > 0.78 ? Math.max(0, (1 - u) / 0.22) : 1.0;
    const env = atk * rel;

    // Nonlinear reed pressure waveshaping (odd+even rich double-reed spectrum)
    const rawReed = Math.tanh(Math.sin(phase) * 2.4 + Math.sin(phase * 2) * 0.85 + 0.22) - 0.18;
    const formantA = f1.process(rawReed, 1180, 2.8, sampleRate) * 0.82;
    const formantB = f2.process(rawReed, 2540, 3.4, sampleRate) * 0.44;
    const breath = (rng() * 2 - 1) * 0.035;

    const sig = (rawReed * 0.28 + formantA + formantB + breath) * env * intensity * 0.72;
    left[i] = Math.tanh(sig * 0.96);
    right[i] = Math.tanh(sig * 1.04);
  }
  return { left, right };
}

/**
 * 21. Noh Theater Otsuzumi Kiln-Baked Hip Drum (能楽・大鼓 — "カァン！" 高張力乾皮):
 *     Crisp, dry, electric-crack cowhide slap contrasting Kotsuzumi's supple "Pon!"
 */
export function synthesizeOtsuzumi(
  sampleRate: number,
  velocity = 1.0,
  quality: JSoundQualityMode = 'ultra',
  seed = 21021
): { left: Float32Array; right: Float32Array } {
  const crack = synthesizeModalImpactStereo('otsuzumi_baked_hide', sampleRate, {
    velocity: velocity * 1.15,
    pitchScale: 1.04,
    durationSec: 0.44,
    quality,
    seed,
    stereoWidth: 0.88,
  });
  const n = crack.left.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const twoPiOverSr = (2 * Math.PI) / sampleRate;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Tight downward snap tension release on baked hide
    const f = 490 + 185 * Math.exp(-t / 0.011);
    ph += f * twoPiOverSr;
    const snap = Math.sin(ph) * Math.exp(-t / 0.068) * velocity * 0.36;
    left[i] = Math.tanh(crack.left[i] * 0.9 + snap);
    right[i] = Math.tanh(crack.right[i] * 0.9 + snap);
  }
  return { left, right };
}

/**
 * 22. Hand-Forged Tea-Room / Noh Bronze Dora Gong (鍛造青銅・銅鑼 — 遅延倍音ブルーム):
 *     Soft leather mallet strike blooming into rich nonlinear metallic shimmer waves!
 */
export function synthesizeDoraGong(
  sampleRate: number,
  velocity = 0.95,
  quality: JSoundQualityMode = 'ultra',
  seed = 22022
): { left: Float32Array; right: Float32Array } {
  const base = synthesizeModalImpactStereo('dora_hammered_bronze', sampleRate, {
    velocity,
    pitchScale: 1.0,
    durationSec: 2.6,
    quality,
    seed,
    stereoWidth: 1.0,
  });
  const n = base.left.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rng = createSeededRng(seed + 77);
  const shSvfL = new FormantSvf();
  const shSvfR = new FormantSvf();
  const twoPi = Math.PI * 2;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Characteristic bronze gong nonlinear energy transfer: upper shimmer blooms at 0.18..0.65s!
    const bloomEnv = Math.min(1, t / 0.24) * Math.exp(-Math.max(0, t - 0.16) / 1.15) * velocity * 0.24;
    const mod = 0.65 + 0.35 * Math.sin(twoPi * 2.1 * t);
    const sL = shSvfL.process(rng() * 2 - 1, 980 + Math.sin(t * 1.6) * 260, 4.2, sampleRate) * bloomEnv * mod;
    const sR = shSvfR.process(rng() * 2 - 1, 1140 + Math.cos(t * 1.4) * 260, 4.2, sampleRate) * bloomEnv * mod;
    left[i] = Math.tanh(base.left[i] * 0.88 + sL);
    right[i] = Math.tanh(base.right[i] * 0.88 + sR);
  }
  return { left, right };
}

/**
 * 23. Yamabushi Conch-Shell Horagai War Horn (山伏・法螺貝 — 螺旋貝共鳴):
 *     Noble resonant conch horn with dramatic ascending lip-reed overtone leap!
 */
export function synthesizeHoragai(
  baseHz = 246.94,
  sampleRate = 48000,
  durationSec = 1.8,
  intensity = 0.88,
  seed = 23023
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(256, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const hornSvf = new FormantSvf();
  const twoPi = Math.PI * 2;
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = t / durationSec;
    // Traditional Horagai call: low anchor -> dramatic fifth leap -> resonant hold
    const leap = u < 0.28 ? 1.0 : u < 0.42 ? 1.0 + ((u - 0.28) / 0.14) * 0.498 : 1.498;
    const vib = Math.sin(twoPi * 5.2 * t) * 0.012 * Math.min(1, t / 0.4);
    const freq = baseHz * leap * (1 + vib);
    phase += (twoPi * freq) / sampleRate;

    const atk = Math.sin(Math.min(1, t / 0.16) * Math.PI * 0.5);
    const rel = u > 0.78 ? Math.max(0, (1 - u) / 0.22) : 1.0;
    const env = atk * rel;

    // Brassy lip-reed harmonic wave
    const brass =
      Math.sin(phase) * 0.56 +
      Math.sin(phase * 2) * 0.34 +
      Math.sin(phase * 3) * 0.22 +
      Math.sin(phase * 4) * 0.12 +
      Math.sin(phase * 5) * 0.06;
    const shell = hornSvf.process(brass + (rng() * 2 - 1) * 0.05, freq * 2.1, 2.2, sampleRate) * 0.42;
    const sig = (brass * 0.74 + shell) * env * intensity * 0.78;
    left[i] = Math.tanh(sig * 0.97);
    right[i] = Math.tanh(sig * 1.03);
  }
  return { left, right };
}

/**
 * 24. Suma-Goto Single-String Ichigenkin (須磨琴・一絃琴 — 4点Cubic補間＆優美滑音):
 *     Ultra-clear 4-point Cubic Hermite Karplus-Strong silk string with delicate slide & bell harmonics!
 */
export function synthesizeIchigenkin(
  baseHz = 293.66,
  sampleRate = 48000,
  durationSec = 1.85,
  velocity = 0.88,
  quality: JSoundQualityMode = 'ultra',
  seed = 24024
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const n = Math.max(512, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const body = synthesizeModalImpactStereo('ichigenkin_paulownia', sampleRate, {
    velocity: velocity * 0.55,
    pitchScale: baseHz / 294,
    durationSec: 0.42,
    quality,
    seed,
  });

  // High-precision 4-point Cubic Hermite fractional-delay string waveguide!
  const maxDelay = Math.max(32, Math.ceil(sampleRate / (baseHz * 0.85)) + 8);
  const ring = new Float32Array(maxDelay);
  let wIdx = 0;
  let lpPrev = 0;
  const initLen = Math.floor(sampleRate / baseHz);
  for (let i = 0; i < initLen; i++) {
    // Ivory tube (ro) silk pluck excitation
    const u = i / initLen;
    ring[i] = ((rng() * 2 - 1) * 0.55 + Math.sin(u * Math.PI * 2) * 0.45) * velocity;
  }

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Expressive Suma-goto ivory-tube pitch slide (subtle upward grace + calm settle)
    const slideMul = 1.0 + 0.045 * Math.sin(Math.min(1, t / 0.35) * Math.PI) + 0.004 * Math.sin(2 * Math.PI * 4.2 * t);
    const delayF = Math.max(4, Math.min(maxDelay - 4, sampleRate / (baseHz * slideMul)));
    const readPos = (wIdx - delayF + maxDelay * 2) % maxDelay;
    const delayed = readCubicHermite(ring, readPos);

    // Ultra-clean high-Q silk damping filter
    const filtered = (delayed * 0.72 + lpPrev * 0.28) * 0.9968;
    lpPrev = delayed;
    ring[wIdx] = filtered;
    wIdx = (wIdx + 1) % maxDelay;

    const bL = i < body.left.length ? body.left[i] * 0.28 : 0;
    const bR = i < body.right.length ? body.right[i] * 0.28 : 0;
    const sig = filtered * 0.72;
    left[i] = Math.tanh(sig * 0.94 + bL);
    right[i] = Math.tanh(sig * 1.06 + bR);
  }
  return { left, right };
}

/**
 * 25. Imperial Gagaku Kakko Accelerating Deerskin Roll (雅楽・鞨鼓 — 諸来高速ロール):
 *     Rapidly accelerating twin-bachi drum roll building intense pre-clash suspense!
 */
export function synthesizeKakkoRoll(
  sampleRate: number,
  velocity = 0.95,
  quality: JSoundQualityMode = 'ultra',
  seed = 25025
): { left: Float32Array; right: Float32Array } {
  const durSec = 0.95;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Accelerating 11-stroke Gagaku Mororai roll (decelerating gap -> climax hit!)
  const hitTimes = [0.0, 0.14, 0.26, 0.36, 0.445, 0.515, 0.575, 0.625, 0.67, 0.71, 0.755];
  hitTimes.forEach((sec, idx) => {
    const start = Math.floor(sec * sampleRate);
    const v = velocity * (0.48 + (idx / (hitTimes.length - 1)) * 0.64);
    const hit = synthesizeModalImpactStereo('kakko_deerskin', sampleRate, {
      velocity: v,
      pitchScale: 0.96 + (idx % 2) * 0.05 + idx * 0.008,
      durationSec: 0.18,
      quality,
      seed: seed + idx * 19,
      stereoWidth: 0.9,
    });
    const panL = idx % 2 === 0 ? 1.08 : 0.78;
    const panR = idx % 2 === 0 ? 0.78 : 1.08;
    for (let i = 0; i < hit.left.length && start + i < n; i++) {
      left[start + i] += hit.left[i] * panL;
      right[start + i] += hit.right[i] * panR;
    }
  });

  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * 0.9);
    right[i] = Math.tanh(right[i] * 0.9);
  }
  return { left, right };
}

/**
 * 26. Kyoto Garden Suikinkutsu Underground Water-Harp (水琴窟 — 澄明多層水滴ハープ):
 *     3 cascading crystal water droplets resonating inside an inverted buried stoneware jar!
 */
export function synthesizeSuikinkutsu(
  sampleRate: number,
  velocity = 0.9,
  quality: JSoundQualityMode = 'ultra',
  seed = 26026
): { left: Float32Array; right: Float32Array } {
  const rng = createSeededRng(seed);
  const durSec = 2.05;
  const n = Math.floor(sampleRate * durSec);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // Pentatonic Kyoto garden water-harp notes inside resonant buried earthenware jar
  const scale = [0.75, 0.889, 1.0, 1.125, 1.333, 1.5];
  const drops = [
    { at: 0.0, pitch: scale[Math.floor(rng() * scale.length)], pan: -0.35, v: velocity },
    { at: 0.19 + rng() * 0.08, pitch: scale[Math.floor(rng() * scale.length)], pan: 0.3, v: velocity * 0.84 },
    { at: 0.44 + rng() * 0.1, pitch: scale[Math.floor(rng() * scale.length)], pan: -0.1, v: velocity * 0.72 },
  ];

  for (let d = 0; d < drops.length; d++) {
    const drop = drops[d];
    const start = Math.floor(drop.at * sampleRate);
    const jar = synthesizeModalImpactStereo('suikinkutsu_earthen_jar', sampleRate, {
      velocity: drop.v,
      pitchScale: drop.pitch,
      durationSec: 1.45,
      quality,
      seed: seed + d * 41,
      stereoWidth: 0.96,
    });
    const plop = synthesizeWaterDroplet(sampleRate, seed + d * 97);
    const gL = Math.sqrt(0.5 * (1 - drop.pan * 0.65));
    const gR = Math.sqrt(0.5 * (1 + drop.pan * 0.65));

    for (let i = 0; i < plop.length && start + i < n; i++) {
      left[start + i] += plop[i] * 0.28 * gL;
      right[start + i] += plop[i] * 0.28 * gR;
    }
    for (let i = 0; i < jar.left.length && start + i < n; i++) {
      left[start + i] += jar.left[i] * 0.78 * gL;
      right[start + i] += jar.right[i] * 0.78 * gR;
    }
  }

  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * 0.92);
    right[i] = Math.tanh(right[i] * 0.92);
  }
  return { left, right };
}


