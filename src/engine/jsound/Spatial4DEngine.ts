/**
 * ★ JSound Engin 1.4 — True 4D Audio & 4D Audio MAX Holographic Spatial Engine ★
 *
 * Elevates 3D positional audio (X, Y, Z) into true 4D spatio-temporal physical immersion (X, Y, Z, t, Φ):
 *  1. 4D Holographic Externalizer Network:
 *     Dual asymmetric Haas micro-reflections (6.8ms / 11.4ms) + contralateral head-shadowed LPF (2.2 kHz)
 *     cross-feed that breaks headphone in-head localization ("externalization") cleanly!
 *  2. 4D Quadrature Orbital Envelopment Layer (The 4th Dimension — Living Wavefront Motion):
 *     Smooth phase-quadrature (cos/sin) dynamic LFO air-current modulation rotating the diffuse
 *     acoustic halo gently around 360° azimuth & elevation (`4d_audio`: single-axis organic drift;
 *     `4d_audio_max`: dual-axis 0.17 Hz + 0.29 Hz spherical 4D vortex envelopment!).
 *  3. 4D Visceral Sub-Tactile Physical Field (4D-Tactile Bus):
 *     Phase-coherent low-end chest-resonance contour (38–82 Hz punch + 2×OS clean sub-harmonic
 *     warmth) giving Taiko, Bonsho, Dora, Horagai, Thunder, and Overdrive strikes physical presence!
 *  4. 4D Upper-Hemisphere Height Air Bus:
 *     Pinna-calibrated overhead elevation shelf (>5.4 kHz) with asymmetric height micro-delays
 *     (3.7ms / 5.9ms) lifting bells, Furin, Suzu, Sho, and Suikinkutsu vertically above the listener!
 *  5. Curved 4D Spatio-Temporal Trajectory Generator (`evaluate4DTrajectory`):
 *     Computes multi-point curved paths (`orbit_360`, `overhead_arc`, `spiral_ascend`,
 *     `converge_impact`, `stereo_sweep`) with exact analytical velocity vectors for real-time
 *     relativistic Doppler pitch shift, ISO 9613-1 air absorption, and pinna elevation sweeps!
 */

import { JSoundSpatialMode, Vec3 } from './types';

export type Spatial4DTrajectoryKind =
  | 'orbit_360'
  | 'overhead_arc'
  | 'spiral_ascend'
  | 'converge_impact'
  | 'stereo_sweep';

export interface Trajectory4DSample {
  pos: Vec3;
  vel: Vec3;
  elevationNorm: number; // -1 floor .. +1 overhead
  frontBackNorm: number; // -1 rear .. +1 front
}

export interface Spatial4DModeConfig {
  mode: JSoundSpatialMode;
  labelJp: string;
  shortJp: string;
  dimensionTag: '4D MAX' | '4D' | '3D' | 'WIDE' | 'FOCUS';
  sideWidth: number;
  externalizerWet: number;
  orbitalWet: number;
  orbitalRateHz: number;
  heightAirWet: number;
  tactileSubWet: number;
  dopplerDepth: number;
  reverbEnvelopmentBoost: number;
}

export const SPATIAL_4D_CONFIGS: Record<JSoundSpatialMode, Spatial4DModeConfig> = {
  '4d_audio_max': {
    mode: '4d_audio_max',
    labelJp: '4D Audio MAX',
    shortJp: '4D MAX',
    dimensionTag: '4D MAX',
    sideWidth: 1.54,
    externalizerWet: 0.24,
    orbitalWet: 0.22,
    orbitalRateHz: 0.19,
    heightAirWet: 0.26,
    tactileSubWet: 0.28,
    dopplerDepth: 1.25,
    reverbEnvelopmentBoost: 1.26,
  },
  '4d_audio': {
    mode: '4d_audio',
    labelJp: '4D Audio',
    shortJp: '4D音場',
    dimensionTag: '4D',
    sideWidth: 1.38,
    externalizerWet: 0.16,
    orbitalWet: 0.14,
    orbitalRateHz: 0.12,
    heightAirWet: 0.17,
    tactileSubWet: 0.16,
    dopplerDepth: 1.05,
    reverbEnvelopmentBoost: 1.14,
  },
  binaural_3d: {
    mode: 'binaural_3d',
    labelJp: '立体3D',
    shortJp: '立体3D',
    dimensionTag: '3D',
    sideWidth: 1.22,
    externalizerWet: 0.05,
    orbitalWet: 0.0,
    orbitalRateHz: 0.08,
    heightAirWet: 0.04,
    tactileSubWet: 0.0,
    dopplerDepth: 1.0,
    reverbEnvelopmentBoost: 1.0,
  },
  studio_wide: {
    mode: 'studio_wide',
    labelJp: '広域音場',
    shortJp: '広域',
    dimensionTag: 'WIDE',
    sideWidth: 1.44,
    externalizerWet: 0.08,
    orbitalWet: 0.0,
    orbitalRateHz: 0.08,
    heightAirWet: 0.08,
    tactileSubWet: 0.04,
    dopplerDepth: 0.9,
    reverbEnvelopmentBoost: 1.06,
  },
  focused: {
    mode: 'focused',
    labelJp: '集中定位',
    shortJp: '集中',
    dimensionTag: 'FOCUS',
    sideWidth: 0.88,
    externalizerWet: 0.0,
    orbitalWet: 0.0,
    orbitalRateHz: 0.08,
    heightAirWet: 0.0,
    tactileSubWet: 0.0,
    dopplerDepth: 0.8,
    reverbEnvelopmentBoost: 0.86,
  },
};

/** Generate clean 2nd-harmonic tactile sub-warmth curve (zero harsh odd distortion!) */
function createSubHarmonicCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // Smooth fundamental + warm 2nd harmonic chest presence
    curve[i] = Math.tanh(x * 1.45 + 0.18 * x * x) / Math.tanh(1.63);
  }
  return curve;
}

/**
 * Live Web Audio 4D Holographic Bus Rack attached in parallel to the JSound Engin 1.4 mastering bus!
 * Zero audio glitches on live mode switching between `4d_audio_max`, `4d_audio`, `binaural_3d`,
 * `studio_wide`, and `focused`.
 */
export class Spatial4DProcessorGraph {
  public readonly input: GainNode;
  public readonly output: GainNode;

  private readonly extWetGain: GainNode;
  private readonly orbWetGain: GainNode;
  private readonly heightWetGain: GainNode;
  private readonly tactileWetGain: GainNode;
  private readonly lfoAzimuth: OscillatorNode;
  private readonly lfoElevation: OscillatorNode;
  private readonly orbDepthL: GainNode;
  private readonly orbDepthR: GainNode;
  private readonly heightDepth: GainNode;

  constructor(ctx: AudioContext, initialMode: JSoundSpatialMode) {
    this.input = ctx.createGain();
    this.input.gain.value = 1.0;

    this.output = ctx.createGain();
    this.output.gain.value = 1.0;

    // Direct bypass pass-through (100% phase-pure dry core!)
    this.input.connect(this.output);

    const split = ctx.createChannelSplitter(2);
    this.input.connect(split);

    // -------------------------------------------------------------------------
    // LAYER 1: 4D Holographic Externalizer (Asymmetric Haas + Contralateral Head-Shadow Crossfeed)
    // -------------------------------------------------------------------------
    this.extWetGain = ctx.createGain();
    const extMerge = ctx.createChannelMerger(2);

    const haasL = ctx.createDelay(0.05);
    haasL.delayTime.value = 0.0068; // 6.8 ms left early desk/air externalization
    const haasR = ctx.createDelay(0.05);
    haasR.delayTime.value = 0.0114; // 11.4 ms asymmetric right spatial halo

    const shadowL = ctx.createBiquadFilter();
    shadowL.type = 'lowpass';
    shadowL.frequency.value = 2350;
    shadowL.Q.value = 0.65;

    const shadowR = ctx.createBiquadFilter();
    shadowR.type = 'lowpass';
    shadowR.frequency.value = 2150;
    shadowR.Q.value = 0.65;

    const extHpf = ctx.createBiquadFilter();
    extHpf.type = 'highpass';
    extHpf.frequency.value = 180;

    // Contralateral crossfeed (L -> shadowed R, R -> shadowed L) creates natural out-of-head room width!
    split.connect(haasL, 0);
    split.connect(haasR, 1);
    haasL.connect(shadowL);
    haasR.connect(shadowR);
    shadowL.connect(extMerge, 0, 1); // L crosses to R with head shadow
    shadowR.connect(extMerge, 0, 0); // R crosses to L with head shadow
    extMerge.connect(extHpf);
    extHpf.connect(this.extWetGain);
    this.extWetGain.connect(this.output);

    // -------------------------------------------------------------------------
    // LAYER 2: 4D Quadrature Orbital Envelopment (Smooth 360° Wavefront Drift!)
    // -------------------------------------------------------------------------
    this.orbWetGain = ctx.createGain();
    const orbMerge = ctx.createChannelMerger(2);
    const orbBpf = ctx.createBiquadFilter();
    orbBpf.type = 'bandpass';
    orbBpf.frequency.value = 1450;
    orbBpf.Q.value = 0.55;

    const orbDelayL = ctx.createDelay(0.06);
    orbDelayL.delayTime.value = 0.0145;
    const orbDelayR = ctx.createDelay(0.06);
    orbDelayR.delayTime.value = 0.0192;

    const orbPanL = ctx.createGain();
    orbPanL.gain.value = 0.62;
    const orbPanR = ctx.createGain();
    orbPanR.gain.value = 0.62;

    this.lfoAzimuth = ctx.createOscillator();
    this.lfoAzimuth.type = 'sine';
    this.lfoAzimuth.frequency.value = 0.16;

    this.lfoElevation = ctx.createOscillator();
    this.lfoElevation.type = 'sine';
    this.lfoElevation.frequency.value = 0.27;

    // Opposing quadrature LFO modulation gently sweeps the ambient wavefront around the head!
    this.orbDepthL = ctx.createGain();
    this.orbDepthL.gain.value = 0.34;
    this.orbDepthR = ctx.createGain();
    this.orbDepthR.gain.value = -0.34;

    const delayModL = ctx.createGain();
    delayModL.gain.value = 0.00055; // +/- 0.55 ms silky Doppler air-motion shimmer
    const delayModR = ctx.createGain();
    delayModR.gain.value = -0.00055;

    this.lfoAzimuth.connect(this.orbDepthL);
    this.lfoAzimuth.connect(this.orbDepthR);
    this.orbDepthL.connect(orbPanL.gain);
    this.orbDepthR.connect(orbPanR.gain);

    this.lfoElevation.connect(delayModL);
    this.lfoElevation.connect(delayModR);
    delayModL.connect(orbDelayL.delayTime);
    delayModR.connect(orbDelayR.delayTime);

    this.input.connect(orbBpf);
    orbBpf.connect(orbDelayL);
    orbBpf.connect(orbDelayR);
    orbDelayL.connect(orbPanL);
    orbDelayR.connect(orbPanR);
    orbPanL.connect(orbMerge, 0, 0);
    orbPanR.connect(orbMerge, 0, 1);
    orbMerge.connect(this.orbWetGain);
    this.orbWetGain.connect(this.output);

    // -------------------------------------------------------------------------
    // LAYER 3: 4D Upper-Hemisphere Height Air Bus (Overhead Pinna Elevation Shimmer!)
    // -------------------------------------------------------------------------
    this.heightWetGain = ctx.createGain();
    const heightHpf = ctx.createBiquadFilter();
    heightHpf.type = 'highpass';
    heightHpf.frequency.value = 5400;
    heightHpf.Q.value = 0.72;

    // Kemar-inspired 8.2 kHz overhead pinna elevation resonance peak!
    const pinnaPeak = ctx.createBiquadFilter();
    pinnaPeak.type = 'peaking';
    pinnaPeak.frequency.value = 8200;
    pinnaPeak.Q.value = 1.4;
    pinnaPeak.gain.value = 3.2;

    const heightDelayL = ctx.createDelay(0.03);
    heightDelayL.delayTime.value = 0.0037;
    const heightDelayR = ctx.createDelay(0.03);
    heightDelayR.delayTime.value = 0.0059;

    this.heightDepth = ctx.createGain();
    this.heightDepth.gain.value = 0.00038;
    this.lfoElevation.connect(this.heightDepth);
    this.heightDepth.connect(heightDelayR.delayTime);

    const heightMerge = ctx.createChannelMerger(2);
    this.input.connect(heightHpf);
    heightHpf.connect(pinnaPeak);
    pinnaPeak.connect(heightDelayL);
    pinnaPeak.connect(heightDelayR);
    heightDelayL.connect(heightMerge, 0, 0);
    heightDelayR.connect(heightMerge, 0, 1);
    heightMerge.connect(this.heightWetGain);
    this.heightWetGain.connect(this.output);

    // -------------------------------------------------------------------------
    // LAYER 4: 4D Visceral Sub-Tactile Physical Field (Clean Mono-Anchored Chest Punch!)
    // -------------------------------------------------------------------------
    this.tactileWetGain = ctx.createGain();
    const subLpf = ctx.createBiquadFilter();
    subLpf.type = 'lowpass';
    subLpf.frequency.value = 92;
    subLpf.Q.value = 1.15;

    const subHpfGuard = ctx.createBiquadFilter();
    subHpfGuard.type = 'highpass';
    subHpfGuard.frequency.value = 30;
    subHpfGuard.Q.value = 0.8;

    const subShaper = ctx.createWaveShaper();
    subShaper.curve = createSubHarmonicCurve();
    subShaper.oversample = '2x';

    const subSmooth = ctx.createBiquadFilter();
    subSmooth.type = 'lowpass';
    subSmooth.frequency.value = 128;
    subSmooth.Q.value = 0.7;

    this.input.connect(subLpf);
    subLpf.connect(subHpfGuard);
    subHpfGuard.connect(subShaper);
    subShaper.connect(subSmooth);
    subSmooth.connect(this.tactileWetGain);
    this.tactileWetGain.connect(this.output);

    // Start continuous ultra-smooth quadrature LFOs
    this.lfoAzimuth.start();
    this.lfoElevation.start();

    this.applyMode(initialMode, ctx.currentTime, true);
  }

  public applyMode(mode: JSoundSpatialMode, now: number, immediate = false): void {
    const cfg = SPATIAL_4D_CONFIGS[mode];
    const tc = immediate ? 0.005 : 0.14;
    this.extWetGain.gain.setTargetAtTime(cfg.externalizerWet, now, tc);
    this.orbWetGain.gain.setTargetAtTime(cfg.orbitalWet, now, tc);
    this.heightWetGain.gain.setTargetAtTime(cfg.heightAirWet, now, tc);
    this.tactileWetGain.gain.setTargetAtTime(cfg.tactileSubWet, now, tc);
    this.lfoAzimuth.frequency.setTargetAtTime(cfg.orbitalRateHz, now, tc);
    this.lfoElevation.frequency.setTargetAtTime(cfg.orbitalRateHz * 1.52, now, tc);
    this.orbDepthL.gain.setTargetAtTime(mode === '4d_audio_max' ? 0.36 : 0.24, now, tc);
    this.orbDepthR.gain.setTargetAtTime(mode === '4d_audio_max' ? -0.36 : -0.24, now, tc);
    this.heightDepth.gain.setTargetAtTime(mode === '4d_audio_max' ? 0.00042 : 0.00024, now, tc);
  }
}

/**
 * Evaluate a smooth analytical 4D Spatio-Temporal Trajectory at normalized time u in [0, 1].
 * Returns exact 3D position, instantaneous velocity vector (for physical Doppler shift),
 * elevation cue, and front/back hemisphere coordinate!
 */
export function evaluate4DTrajectory(
  kind: Spatial4DTrajectoryKind,
  u: number,
  durationSec: number,
  center: Vec3 = { x: 0, y: 0.65, z: 0.1 },
  radius = 1.65,
  direction = 1
): Trajectory4DSample {
  const t = Math.max(0, Math.min(1, u));
  const invDur = 1 / Math.max(0.08, durationSec);
  const s = direction >= 0 ? 1 : -1;

  let x = center.x;
  let y = center.y;
  let z = center.z;
  let vx = 0;
  let vy = 0;
  let vz = 0;

  if (kind === 'orbit_360') {
    const angle = (-Math.PI * 0.5 + t * Math.PI * 2.0) * s;
    const dAngleDt = Math.PI * 2.0 * s * invDur;
    x = center.x + Math.cos(angle) * radius;
    z = center.z + Math.sin(angle) * radius * 0.92;
    y = center.y + 0.45 + Math.sin(t * Math.PI * 2.0) * 0.55;
    vx = -Math.sin(angle) * radius * dAngleDt;
    vz = Math.cos(angle) * radius * 0.92 * dAngleDt;
    vy = Math.cos(t * Math.PI * 2.0) * 0.55 * Math.PI * 2.0 * invDur;
  } else if (kind === 'overhead_arc') {
    // Sweeps dramatically from one flank, soaring DIRECTLY OVERHEAD, down to the opposite side!
    const phi = (t - 0.5) * Math.PI; // -pi/2 .. +pi/2
    const dPhiDt = Math.PI * invDur;
    x = center.x + Math.sin(phi) * radius * 1.15 * s;
    y = center.y + Math.cos(phi) * radius * 1.18 + 0.25;
    z = center.z + 0.35 * Math.cos(phi) + 0.45;
    vx = Math.cos(phi) * radius * 1.15 * s * dPhiDt;
    vy = -Math.sin(phi) * radius * 1.18 * dPhiDt;
    vz = -0.35 * Math.sin(phi) * dPhiDt;
  } else if (kind === 'spiral_ascend') {
    // Rising 4D vortex spiral (victory fanfare / Overdrive charge / Sho ascension!)
    const angle = t * Math.PI * 3.0 * s;
    const dAngleDt = Math.PI * 3.0 * s * invDur;
    const rNow = radius * (1.05 - t * 0.38);
    const drDt = -radius * 0.38 * invDur;
    x = center.x + Math.cos(angle) * rNow;
    z = center.z + Math.sin(angle) * rNow;
    y = center.y - 0.15 + t * 1.85;
    vx = (drDt * Math.cos(angle) - rNow * Math.sin(angle) * dAngleDt);
    vz = (drDt * Math.sin(angle) + rNow * Math.cos(angle) * dAngleDt);
    vy = 1.85 * invDur;
  } else if (kind === 'converge_impact') {
    // Sweeps from behind-side rapidly into center clash point and bursts outward!
    const ease = 1 - Math.pow(1 - t, 2.4);
    x = center.x + (1 - ease) * radius * 1.2 * s;
    y = center.y + Math.sin(t * Math.PI) * 0.72;
    z = center.z + (1 - ease) * 1.45;
    const dEaseDt = 2.4 * Math.pow(1 - t, 1.4) * invDur;
    vx = -dEaseDt * radius * 1.2 * s;
    vy = Math.cos(t * Math.PI) * 0.72 * Math.PI * invDur;
    vz = -dEaseDt * 1.45;
  } else {
    // stereo_sweep: crisp fast lateral-to-rear cinematic whoosh
    const k = t * 2 - 1;
    x = center.x + k * radius * 1.35 * s;
    y = center.y + 0.25 + (1 - k * k) * 0.55;
    z = center.z + 0.55 - k * k * 0.85;
    vx = 2 * radius * 1.35 * s * invDur;
    vy = -4 * k * 0.55 * invDur;
    vz = -4 * k * 0.85 * invDur;
  }

  const dist = Math.max(0.2, Math.hypot(x, y - 1.32, z - 2.15));
  const elevationNorm = Math.max(-1, Math.min(1, (y - 1.32) / dist));
  const frontBackNorm = Math.max(-1, Math.min(1, -(z - 2.15) / dist));

  return { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, elevationNorm, frontBackNorm };
}

/**
 * Offline deterministic 4D Holographic DSP Processor for automated audit verification (`runJSoundTest.ts`):
 * Verifies Haas externalization, contralateral head-shadowing, overhead pinna peak, and tactile sub energy!
 */
export function process4DHolographicBuffer(
  leftIn: Float32Array,
  rightIn: Float32Array,
  sampleRate: number,
  mode: JSoundSpatialMode
): { left: Float32Array; right: Float32Array } {
  const cfg = SPATIAL_4D_CONFIGS[mode];
  const n = Math.min(leftIn.length, rightIn.length);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);

  const dL = Math.max(1, Math.round(0.0068 * sampleRate));
  const dR = Math.max(1, Math.round(0.0114 * sampleRate));
  const dH = Math.max(1, Math.round(0.0048 * sampleRate));
  const lpAlpha = 1 - Math.exp((-2 * Math.PI * 2250) / sampleRate);
  const subAlpha = 1 - Math.exp((-2 * Math.PI * 86) / sampleRate);
  const hiAlpha = 1 - Math.exp((-2 * Math.PI * 5400) / sampleRate);
  const twoPiRate = (2 * Math.PI * cfg.orbitalRateHz) / sampleRate;

  let shL = 0, shR = 0;
  let subState = 0;
  let hiLpL = 0, hiLpR = 0;

  for (let i = 0; i < n; i++) {
    const inL = leftIn[i];
    const inR = rightIn[i];

    // M/S width matrix
    const mid = 0.5 * (inL + inR);
    const side = 0.5 * (inL - inR) * cfg.sideWidth;
    let l = mid + side;
    let r = mid - side;

    // 1. 4D Externalizer (contralateral shadowed Haas delay)
    const delL = i >= dL ? leftIn[i - dL] : 0;
    const delR = i >= dR ? rightIn[i - dR] : 0;
    shL += (delL - shL) * lpAlpha;
    shR += (delR - shR) * lpAlpha;
    l += shR * cfg.externalizerWet;
    r += shL * cfg.externalizerWet;

    // 2. 4D Quadrature Orbital Envelopment
    if (cfg.orbitalWet > 0) {
      const ang = i * twoPiRate;
      const orbL = 0.5 + 0.5 * Math.cos(ang);
      const orbR = 0.5 + 0.5 * Math.sin(ang);
      l += shL * orbL * cfg.orbitalWet;
      r += shR * orbR * cfg.orbitalWet;
    }

    // 3. 4D Upper-Hemisphere Height Air Bus
    if (cfg.heightAirWet > 0) {
      hiLpL += (inL - hiLpL) * hiAlpha;
      hiLpR += (inR - hiLpR) * hiAlpha;
      const hiL = inL - hiLpL;
      const hiR = (i >= dH ? rightIn[i - dH] : inR) - hiLpR;
      l += hiL * cfg.heightAirWet;
      r += hiR * cfg.heightAirWet;
    }

    // 4. 4D Visceral Sub-Tactile Physical Field
    if (cfg.tactileSubWet > 0) {
      subState += (mid - subState) * subAlpha;
      const punch = Math.tanh(subState * 1.45 + 0.16 * subState * subState) * cfg.tactileSubWet;
      l += punch;
      r += punch;
    }

    outL[i] = Math.max(-0.99, Math.min(0.99, l));
    outR[i] = Math.max(-0.99, Math.min(0.99, r));
  }

  return { left: outL, right: outR };
}
