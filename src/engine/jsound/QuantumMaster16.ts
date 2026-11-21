/**
 * ★ JSound Engin 1.6 — "KIWAMI MASTER 16" Device-Adaptive Real-Time Mastering Kernel ★
 *
 * One self-contained DSP kernel that runs bit-identically in three places:
 *   - Node (`npm run test:jsound16`) for mathematical verification,
 *   - the browser's dedicated audio thread as an `AudioWorkletProcessor` (its source is generated
 *     from this very class via `Function.prototype.toString()`, so the two can never drift apart),
 *   - offline rendering.
 *
 * Signal flow per stereo sample:
 *   1. ISO 226 quiet-volume equal-loudness contour             (carried over from 1.5)
 *   2. 8-channel unitary Walsh-Hadamard modulated FDN air halo  (carried over from 1.5)
 *   3. 13-string stage-tuned sympathetic resonance bank         (carried over from 1.5)
 *   4. NEW Chebyshev "missing-fundamental" virtual bass:
 *        LR4 low-pass (bass band) -> RMS envelope normalisation -> T2/T3/T4 Chebyshev polynomials
 *        (T_k(cos θ) = cos kθ, so a pure tone produces clean 2nd/3rd/4th harmonics without IMD
 *        between amplitude levels) -> harmonic band-pass -> mixed back. Small phone speakers that
 *        cannot move air below ~150 Hz still convey the pitch and weight of taiko and bonsho.
 *   5. NEW speaker-protection high-pass (2nd-order Butterworth, per playback device)
 *   6. NEW 3-band Linkwitz-Riley (LR4) multiband dynamics with linked-stereo soft-knee detectors.
 *      With unity band gains the bands sum to AP2(f1)·AP2(f2): magnitude-flat (allpass) by construction.
 *   7. NEW true-peak limiter:
 *        - 4× polyphase windowed-sinc FIR intersample-peak detector (97 taps, Kaiser β=7.5)
 *          instead of the 1.5 Catmull-Rom estimate, which under-reads fs/4 content by ~1 dB;
 *        - sliding-window minimum (monotonic deque, O(1)) over the look-ahead window,
 *          release smoothing, then a moving-average attack ramp. The averaged gain is provably
 *          ≤ the required gain at the sample being output, so no hard clipper is needed.
 *   8. NEW ITU-R BS.1770-4 loudness at the real sample rate (K-weighting coefficients are
 *      re-derived from the analogue prototype for 44.1/48/96 kHz), momentary 400 ms,
 *      short-term 3 s, gated integrated (−70 LUFS absolute, −10 LU relative gate),
 *      4× true-peak meter, phase correlation, crest factor and per-band gain reduction.
 */

export type JSoundDeviceProfile = 'headphones' | 'phone_speaker' | 'pc_speakers';
export type JSoundDeviceProfileSetting = 'auto' | JSoundDeviceProfile;

/** Flat numeric config so it can be posted to the audio thread with zero (de)serialisation cost. */
export interface Master16Config {
  fdnWet: number;
  fdnFeedback: number;
  fdnDamping: number;
  sympatheticGain: number;
  sympatheticStageIndex: number;
  equalLoudnessComp: number;
  virtualBassAmount: number;
  virtualBassCutoffHz: number;
  speakerHpfHz: number;
  multibandAmount: number;
  crossoverLowHz: number;
  crossoverHighHz: number;
  mbLowThrDb: number;
  mbMidThrDb: number;
  mbHighThrDb: number;
  mbLowRatio: number;
  mbMidRatio: number;
  mbHighRatio: number;
  mbLowMakeupDb: number;
  mbMidMakeupDb: number;
  mbHighMakeupDb: number;
  limiterCeilingDb: number;
  limiterReleaseMs: number;
  outputTrimDb: number;
}

export interface Master16Metrics {
  lufsMomentary: number;
  lufsShortTerm: number;
  lufsIntegrated: number;
  truePeakDbTp: number;
  samplePeakDb: number;
  phaseCorrelation: number;
  crestFactorDb: number;
  limiterGrDb: number;
  bandLowGrDb: number;
  bandMidGrDb: number;
  bandHighGrDb: number;
  virtualBassDb: number;
  sympatheticEnergyDb: number;
  clipEvents: number;
  workletActive: boolean;
}

export interface DeviceProfileSpec {
  id: JSoundDeviceProfile;
  labelJp: string;
  shortJp: string;
  descriptionJp: string;
  /** Use the browser HRTF panner for point sources (only meaningful on headphones). */
  useHrtf: boolean;
  /** Multiplier applied to the Spatial4D externaliser/orbital/height layers (crossfeed is a headphone trick). */
  spatialLayerScale: number;
  /** Multiplier for the 38–82 Hz tactile sub layer (wasted headroom on phone speakers). */
  tactileSubScale: number;
  /** Multiplier for the M/S side width (very wide side content collapses on 1–2 cm spaced phone speakers). */
  sideWidthScale: number;
  master: Pick<
    Master16Config,
    | 'virtualBassAmount'
    | 'virtualBassCutoffHz'
    | 'speakerHpfHz'
    | 'multibandAmount'
    | 'crossoverLowHz'
    | 'crossoverHighHz'
    | 'mbLowThrDb'
    | 'mbMidThrDb'
    | 'mbHighThrDb'
    | 'mbLowRatio'
    | 'mbMidRatio'
    | 'mbHighRatio'
    | 'mbLowMakeupDb'
    | 'mbMidMakeupDb'
    | 'mbHighMakeupDb'
    | 'limiterCeilingDb'
    | 'limiterReleaseMs'
    | 'outputTrimDb'
  >;
}

/**
 * Playback-device profiles. Headphones keep the full binaural 4D chain and real bass; phone speakers
 * get virtual bass + excursion protection + loudness-oriented multiband; PC speakers sit in between.
 */
export const DEVICE_PROFILE_SPECS: Record<JSoundDeviceProfile, DeviceProfileSpec> = {
  headphones: {
    id: 'headphones',
    labelJp: 'イヤホン・ヘッドホン',
    shortJp: 'イヤホン',
    descriptionJp: 'HRTF立体音響と本物の重低音をそのまま再生（最も没入感が高い）',
    useHrtf: true,
    spatialLayerScale: 1.0,
    tactileSubScale: 1.0,
    sideWidthScale: 1.0,
    master: {
      virtualBassAmount: 0.0,
      virtualBassCutoffHz: 120,
      speakerHpfHz: 0,
      multibandAmount: 0.25,
      crossoverLowHz: 180,
      crossoverHighHz: 3600,
      mbLowThrDb: -20,
      mbMidThrDb: -18,
      mbHighThrDb: -20,
      mbLowRatio: 2.0,
      mbMidRatio: 1.6,
      mbHighRatio: 1.8,
      mbLowMakeupDb: 0.8,
      mbMidMakeupDb: 0.8,
      mbHighMakeupDb: 0.6,
      limiterCeilingDb: -1.0,
      limiterReleaseMs: 90,
      outputTrimDb: 0.0,
    },
  },
  phone_speaker: {
    id: 'phone_speaker',
    labelJp: 'スマホ本体スピーカー',
    shortJp: 'スマホ',
    descriptionJp: '仮想低音（倍音合成）＋スピーカー保護＋3バンド音圧で小型スピーカーでも迫力と明瞭さ',
    useHrtf: false,
    spatialLayerScale: 0.35,
    tactileSubScale: 0.0,
    sideWidthScale: 0.78,
    master: {
      virtualBassAmount: 1.0,
      virtualBassCutoffHz: 140,
      speakerHpfHz: 150,
      multibandAmount: 1.0,
      crossoverLowHz: 260,
      crossoverHighHz: 3800,
      mbLowThrDb: -24,
      mbMidThrDb: -21,
      mbHighThrDb: -23,
      mbLowRatio: 3.5,
      mbMidRatio: 2.4,
      mbHighRatio: 2.2,
      mbLowMakeupDb: 2.5,
      mbMidMakeupDb: 3.0,
      mbHighMakeupDb: 2.0,
      limiterCeilingDb: -1.0,
      limiterReleaseMs: 70,
      outputTrimDb: 1.5,
    },
  },
  pc_speakers: {
    id: 'pc_speakers',
    labelJp: 'PC・外部スピーカー',
    shortJp: 'スピーカー',
    descriptionJp: '軽い仮想低音と穏やかな3バンド処理で、部屋のスピーカーに自然に響く',
    useHrtf: false,
    spatialLayerScale: 0.6,
    tactileSubScale: 0.6,
    sideWidthScale: 0.92,
    master: {
      virtualBassAmount: 0.35,
      virtualBassCutoffHz: 95,
      speakerHpfHz: 40,
      multibandAmount: 0.6,
      crossoverLowHz: 200,
      crossoverHighHz: 3600,
      mbLowThrDb: -22,
      mbMidThrDb: -20,
      mbHighThrDb: -21,
      mbLowRatio: 2.5,
      mbMidRatio: 1.9,
      mbHighRatio: 1.9,
      mbLowMakeupDb: 1.5,
      mbMidMakeupDb: 1.5,
      mbHighMakeupDb: 1.2,
      limiterCeilingDb: -1.0,
      limiterReleaseMs: 80,
      outputTrimDb: 0.5,
    },
  },
};

/**
 * Resolve 'auto' to a concrete device profile from coarse device signals.
 * Phones/tablets (touch-first, small screen) default to their built-in speakers; everything else to
 * PC speakers. Users with earphones pick「イヤホン」 once and it is remembered.
 */
export function resolveDeviceProfile(
  setting: JSoundDeviceProfileSetting,
  env: { coarsePointer: boolean; maxScreenSidePx: number }
): JSoundDeviceProfile {
  if (setting !== 'auto') return setting;
  if (env.coarsePointer && env.maxScreenSidePx <= 1366) return 'phone_speaker';
  return 'pc_speakers';
}

export const DEFAULT_MASTER16_CONFIG: Master16Config = {
  fdnWet: 0.14,
  fdnFeedback: 0.68,
  fdnDamping: 0.34,
  sympatheticGain: 0.055,
  sympatheticStageIndex: 0,
  equalLoudnessComp: 0.0,
  ...DEVICE_PROFILE_SPECS.pc_speakers.master,
};

/**
 * The kernel. IMPORTANT: this class must stay fully self-contained (no references to module-level
 * identifiers, no static members, no private `#fields`) because its source text is shipped verbatim
 * into the AudioWorklet global scope.
 */
export class JSound16MasterKernel {
  sr: number;
  cfg: Master16Config;
  stageFreqs: number[][];

  // --- FDN (8 lines) ---
  fdnLines: Float32Array[];
  fdnWriteIdx: Int32Array;
  fdnBaseLen: Int32Array;
  fdnLp: Float64Array;
  fdnS: Float64Array;
  lfoPh: Float64Array;
  lfoRt: Float64Array;
  lfoC: Float64Array; // LFO phasors (cos, sin) rotated per sample — no Math.sin in the inner loop
  lfoS: Float64Array;
  lfoDc: Float64Array;
  lfoDs: Float64Array;

  // --- Sympathetic bank (13 resonators) ---
  sympB0: Float64Array;
  sympA1: Float64Array;
  sympA2: Float64Array;
  sympY1: Float64Array;
  sympY2: Float64Array;
  curStage: number;

  // --- ISO 226 contour ---
  isoBassL: number;
  isoBassR: number;
  isoAirL: number;
  isoAirR: number;

  // --- Biquad banks (transposed direct form II) ---
  // coefficient layout per biquad: [b0, b1, b2, a1, a2]; state layout per biquad: [z1, z2]
  bqC: Float64Array;
  bqZ: Float64Array;
  // biquad slot indices (coefficients shared between L/R; states are per channel)
  vbEnvLpA: number;
  vbEnvLpB: number;

  // --- Virtual bass state ---
  vbEnergy: number;
  vbEnvC: number;
  vbAcc: number;

  // --- Multiband detectors ---
  mbEnv: Float64Array; // 3 bands
  mbGainDb: Float64Array; // smoothed gain (dB) per band
  mbAtt: Float64Array;
  mbRel: Float64Array;
  mbMinGain: Float64Array;
  mbGainLin: Float64Array; // currently applied linear gain per band
  mbGainStep: Float64Array; // per-sample linear ramp toward the next control-rate target
  mbCtlCount: number;
  tpRing: Float64Array; // detection true peak per input sample (re-used by the output TP meter)

  // --- True-peak limiter ---
  firPhases: Float64Array; // 3 phases × firTapsPerPhase (phase 0 is an exact delay)
  firTaps: number;
  firDelay: number;
  histL: Float64Array; // doubled ring buffer (no modulo in inner loop)
  histR: Float64Array;
  histIdx: number;
  prevP3L: number;
  prevP3R: number;
  phOut: Float64Array;
  lookLen: number;
  delayL: Float64Array;
  delayR: Float64Array;
  delayIdx: number;
  minWin: number;
  dqIdx: Float64Array;
  dqVal: Float64Array;
  dqHead: number;
  dqTail: number;
  dqCap: number;
  sampleCounter: number;
  hRel: number;
  boxLen: number;
  boxBuf: Float64Array;
  boxIdx: number;
  boxSum: number;
  boxRefresh: number;
  limGain: number;
  clipEvents: number;


  // --- Loudness ---
  kShC: Float64Array; // shelf coefficients
  kHpC: Float64Array; // hp coefficients
  kZ: Float64Array; // 2 channels × 2 stages × 2 states
  subBlockLen: number;
  subBlockCount: number;
  subBlockEnergy: number;
  subBlocks: Float64Array; // ring of 30 × 100 ms energies (for 3 s short-term)
  subBlockWrite: number;
  subBlocksFilled: number;
  gatedBlocks: Float64Array; // 400 ms block mean-square energies, 100 ms hop
  gatedCount: number;
  gatedWrite: number;
  integratedLufs: number;
  hopsSinceIntegrated: number;

  // --- Metering accumulators ---
  meterLen: number;
  meterN: number;
  accRms: number;
  accCorrNum: number;
  accCorrL: number;
  accCorrR: number;
  accTp: number;
  accSp: number;
  accSymp: number;
  accVb: number;
  accMinLim: number;
  metrics: Master16Metrics;
  metricsSeq: number;

  constructor(sampleRate: number, stageFreqs: number[][], initial?: Partial<Master16Config>) {
    this.sr = sampleRate;
    this.stageFreqs = stageFreqs;
    this.cfg = {
      fdnWet: 0.14,
      fdnFeedback: 0.68,
      fdnDamping: 0.34,
      sympatheticGain: 0.055,
      sympatheticStageIndex: 0,
      equalLoudnessComp: 0.0,
      virtualBassAmount: 0.35,
      virtualBassCutoffHz: 95,
      speakerHpfHz: 40,
      multibandAmount: 0.6,
      crossoverLowHz: 200,
      crossoverHighHz: 3600,
      mbLowThrDb: -22,
      mbMidThrDb: -20,
      mbHighThrDb: -21,
      mbLowRatio: 2.5,
      mbMidRatio: 1.9,
      mbHighRatio: 1.9,
      mbLowMakeupDb: 1.5,
      mbMidMakeupDb: 1.5,
      mbHighMakeupDb: 1.2,
      limiterCeilingDb: -1.0,
      limiterReleaseMs: 80,
      outputTrimDb: 0.5,
    };
    if (initial) {
      for (const k in initial) {
        const v = (initial as Record<string, unknown>)[k];
        if (typeof v === 'number' && Number.isFinite(v)) (this.cfg as unknown as Record<string, number>)[k] = v;
      }
    }

    // FDN
    const primes = [347, 463, 599, 733, 887, 1039, 1213, 1399];
    const rateScale = sampleRate / 48000;
    this.fdnBaseLen = new Int32Array(8);
    this.fdnWriteIdx = new Int32Array(8);
    this.fdnLines = [];
    for (let i = 0; i < 8; i++) {
      const base = Math.max(64, Math.round(primes[i] * rateScale));
      this.fdnBaseLen[i] = base;
      this.fdnLines.push(new Float32Array(base + 32));
    }
    this.fdnLp = new Float64Array(8);
    this.fdnS = new Float64Array(8);
    this.lfoPh = new Float64Array([0, 0.78, 1.57, 2.35, 3.14, 3.92, 4.71, 5.49]);
    this.lfoRt = new Float64Array([0.11, 0.14, 0.17, 0.21, 0.25, 0.29, 0.33, 0.37]);
    this.lfoC = new Float64Array(8);
    this.lfoS = new Float64Array(8);
    this.lfoDc = new Float64Array(8);
    this.lfoDs = new Float64Array(8);
    for (let i = 0; i < 8; i++) {
      this.lfoC[i] = Math.cos(this.lfoPh[i]);
      this.lfoS[i] = Math.sin(this.lfoPh[i]);
      const d = (2 * Math.PI * this.lfoRt[i]) / sampleRate;
      this.lfoDc[i] = Math.cos(d);
      this.lfoDs[i] = Math.sin(d);
    }

    // Sympathetic bank
    this.sympB0 = new Float64Array(13);
    this.sympA1 = new Float64Array(13);
    this.sympA2 = new Float64Array(13);
    this.sympY1 = new Float64Array(13);
    this.sympY2 = new Float64Array(13);
    this.curStage = -1;

    this.isoBassL = 0;
    this.isoBassR = 0;
    this.isoAirL = 0;
    this.isoAirR = 0;

    // Biquad slots:
    //  0,1   : virtual-bass LR4 low-pass (mono)
    //  2     : virtual-bass harmonic high-pass (mono)
    //  3     : virtual-bass harmonic low-pass (mono)
    //  4,5   : virtual-bass envelope smoothing low-pass (mono, 2 poles)
    //  6     : speaker-protection high-pass (L, R states)
    //  7,8   : LR4 LP @ f1   (L, R)
    //  9,10  : LR4 HP @ f1   (L, R)
    //  11,12 : LR4 LP @ f2   (L, R)
    //  13,14 : LR4 HP @ f2   (L, R)
    //  15    : AP2 @ f2 for low band phase alignment (L, R)
    this.bqC = new Float64Array(16 * 5);
    this.bqZ = new Float64Array(16 * 2 * 2); // slot × channel × 2
    this.vbEnvLpA = 4;
    this.vbEnvLpB = 5;
    this.vbEnergy = 0;
    this.vbEnvC = 0;
    this.vbAcc = 0;

    this.mbEnv = new Float64Array(3);
    this.mbGainDb = new Float64Array(3);
    this.mbAtt = new Float64Array(3);
    this.mbRel = new Float64Array(3);
    this.mbMinGain = new Float64Array([1, 1, 1]);
    this.mbGainLin = new Float64Array([1, 1, 1]);
    this.mbGainStep = new Float64Array(3);
    this.mbCtlCount = 0;
    const attMs = [12, 7, 3];
    const relMs = [190, 140, 110];
    for (let b = 0; b < 3; b++) {
      this.mbAtt[b] = Math.exp(-1 / (attMs[b] * 0.001 * sampleRate));
      this.mbRel[b] = Math.exp(-1 / (relMs[b] * 0.001 * sampleRate));
    }

    // 4× polyphase windowed-sinc interpolator: 97 taps total -> 24 taps per fractional phase.
    const totalTaps = 97;
    const center = (totalTaps - 1) / 2; // 48 at the 4× rate == 12 input samples
    const beta = 7.5;
    const i0 = (x: number): number => {
      // Modified Bessel function of the first kind, order 0 (power series)
      let sum = 1;
      let term = 1;
      const hx = x * 0.5;
      for (let k = 1; k < 40; k++) {
        term *= (hx / k) * (hx / k);
        sum += term;
        if (term < sum * 1e-16) break;
      }
      return sum;
    };
    const i0Beta = i0(beta);
    const h = new Float64Array(totalTaps);
    for (let n = 0; n < totalTaps; n++) {
      const t = (n - center) / 4;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const r = (n - center) / center;
      const w = i0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0Beta;
      h[n] = sinc * w;
    }
    this.firTaps = 24;
    this.firDelay = 12;
    this.firPhases = new Float64Array(3 * this.firTaps);
    for (let p = 1; p <= 3; p++) {
      let dc = 0;
      for (let k = 0; k < this.firTaps; k++) dc += h[4 * k + p];
      for (let k = 0; k < this.firTaps; k++) this.firPhases[(p - 1) * this.firTaps + k] = h[4 * k + p] / dc;
    }
    this.histL = new Float64Array(this.firTaps * 2);
    this.histR = new Float64Array(this.firTaps * 2);
    this.histIdx = 0;
    this.prevP3L = 0;
    this.prevP3R = 0;
    this.phOut = new Float64Array(6);

    // Look-ahead limiter geometry (see header proof): L look-ahead, A attack box, W min-hold window.
    this.lookLen = Math.max(this.firDelay + 32, Math.round(sampleRate * 0.0015));
    this.boxLen = Math.max(8, this.lookLen - this.firDelay);
    this.minWin = this.lookLen + 1;
    this.delayL = new Float64Array(this.lookLen + 1);
    this.delayR = new Float64Array(this.lookLen + 1);
    this.delayIdx = 0;
    this.tpRing = new Float64Array(this.lookLen + 1);
    this.dqCap = this.minWin + 4;
    this.dqIdx = new Float64Array(this.dqCap);
    this.dqVal = new Float64Array(this.dqCap);
    this.dqHead = 0;
    this.dqTail = 0;
    this.sampleCounter = 0;
    this.hRel = 1;
    this.boxBuf = new Float64Array(this.boxLen).fill(1);
    this.boxIdx = 0;
    this.boxSum = this.boxLen;
    this.boxRefresh = 0;
    this.limGain = 1;
    this.clipEvents = 0;

    // Loudness (BS.1770-4) at the real sample rate
    this.kShC = new Float64Array(5);
    this.kHpC = new Float64Array(5);
    this.kZ = new Float64Array(8);
    this.computeKWeighting();
    this.subBlockLen = Math.max(16, Math.round(sampleRate * 0.1));
    this.subBlockCount = 0;
    this.subBlockEnergy = 0;
    this.subBlocks = new Float64Array(30);
    this.subBlockWrite = 0;
    this.subBlocksFilled = 0;
    this.gatedBlocks = new Float64Array(18000); // 30 minutes of 100 ms hops
    this.gatedCount = 0;
    this.gatedWrite = 0;
    this.integratedLufs = -70;
    this.hopsSinceIntegrated = 0;

    this.meterLen = Math.max(64, Math.round(sampleRate * 0.2));
    this.meterN = 0;
    this.accRms = 0;
    this.accCorrNum = 0;
    this.accCorrL = 0;
    this.accCorrR = 0;
    this.accTp = 0;
    this.accSp = 0;
    this.accSymp = 0;
    this.accVb = 0;
    this.accMinLim = 1;
    this.metrics = {
      lufsMomentary: -70,
      lufsShortTerm: -70,
      lufsIntegrated: -70,
      truePeakDbTp: -70,
      samplePeakDb: -70,
      phaseCorrelation: 1,
      crestFactorDb: 0,
      limiterGrDb: 0,
      bandLowGrDb: 0,
      bandMidGrDb: 0,
      bandHighGrDb: 0,
      virtualBassDb: -90,
      sympatheticEnergyDb: -90,
      clipEvents: 0,
      workletActive: false,
    };
    this.metricsSeq = 0;

    this.tuneSympathetic(this.cfg.sympatheticStageIndex);
    this.updateFilters();
  }

  // ---------------------------------------------------------------------------
  // Coefficient design (RBJ cookbook; identical bilinear map for every filter so the
  // LR4 identity LP4 + HP4 = AP2 holds exactly in the digital domain too)
  // ---------------------------------------------------------------------------
  setBiquad(slot: number, type: number, freq: number, q: number, gainDb: number): void {
    const fs = this.sr;
    const f = Math.max(5, Math.min(fs * 0.45, freq));
    const w0 = (2 * Math.PI * f) / fs;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    let a0 = 1;
    let a1 = 0;
    let a2 = 0;
    if (type === 0) {
      // low-pass
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
    } else if (type === 1) {
      // high-pass
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
    } else if (type === 2) {
      // all-pass
      b0 = 1 - alpha;
      b1 = -2 * cw;
      b2 = 1 + alpha;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
    } else {
      // high-shelf
      const A = Math.pow(10, gainDb / 40);
      const sA = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + sA);
      b1 = -2 * A * (A - 1 + (A + 1) * cw);
      b2 = A * (A + 1 + (A - 1) * cw - sA);
      a0 = A + 1 - (A - 1) * cw + sA;
      a1 = 2 * (A - 1 - (A + 1) * cw);
      a2 = A + 1 - (A - 1) * cw - sA;
    }
    const o = slot * 5;
    this.bqC[o] = b0 / a0;
    this.bqC[o + 1] = b1 / a0;
    this.bqC[o + 2] = b2 / a0;
    this.bqC[o + 3] = a1 / a0;
    this.bqC[o + 4] = a2 / a0;
  }

  /** Run one biquad slot on one channel (transposed direct form II). */
  bq(slot: number, ch: number, x: number): number {
    const c = this.bqC;
    const z = this.bqZ;
    const o = slot * 5;
    const s = (slot * 2 + ch) * 2;
    const y = c[o] * x + z[s];
    z[s] = c[o + 1] * x - c[o + 3] * y + z[s + 1];
    z[s + 1] = c[o + 2] * x - c[o + 4] * y;
    return y;
  }

  computeKWeighting(): void {
    // ITU-R BS.1770-4 pre-filter re-derived for the actual sample rate (libebur128 parametrisation;
    // reproduces the standard's 48 kHz coefficient table exactly).
    const fs = this.sr;
    {
      const f0 = 1681.974450955533;
      const G = 3.999843853973347;
      const Q = 0.7071752369554196;
      const K = Math.tan((Math.PI * f0) / fs);
      const Vh = Math.pow(10, G / 20);
      const Vb = Math.pow(Vh, 0.4996667741545416);
      const a0 = 1 + K / Q + K * K;
      this.kShC[0] = (Vh + (Vb * K) / Q + K * K) / a0;
      this.kShC[1] = (2 * (K * K - Vh)) / a0;
      this.kShC[2] = (Vh - (Vb * K) / Q + K * K) / a0;
      this.kShC[3] = (2 * (K * K - 1)) / a0;
      this.kShC[4] = (1 - K / Q + K * K) / a0;
    }
    {
      const f0 = 38.13547087602444;
      const Q = 0.5003270373238773;
      const K = Math.tan((Math.PI * f0) / fs);
      const den = 1 + K / Q + K * K;
      // The standard's RLB high-pass numerator is exactly [1, −2, 1] (not normalised).
      this.kHpC[0] = 1;
      this.kHpC[1] = -2;
      this.kHpC[2] = 1;
      this.kHpC[3] = (2 * (K * K - 1)) / den;
      this.kHpC[4] = (1 - K / Q + K * K) / den;
    }
  }

  updateFilters(): void {
    const c = this.cfg;
    const q = 0.7071067811865476;
    const vbF = Math.max(40, Math.min(250, c.virtualBassCutoffHz));
    this.setBiquad(0, 0, vbF, q, 0);
    this.setBiquad(1, 0, vbF, q, 0);
    this.setBiquad(2, 1, vbF * 0.9, q, 0);
    this.setBiquad(3, 0, vbF * 5.0, q, 0);
    this.setBiquad(4, 0, 9, q, 0);
    this.setBiquad(5, 0, 9, q, 0);
    this.setBiquad(6, 1, Math.max(10, c.speakerHpfHz), q, 0);
    const f1 = Math.max(60, Math.min(800, c.crossoverLowHz));
    const f2 = Math.max(f1 * 2.5, Math.min(9000, c.crossoverHighHz));
    this.setBiquad(7, 0, f1, q, 0);
    this.setBiquad(8, 0, f1, q, 0);
    this.setBiquad(9, 1, f1, q, 0);
    this.setBiquad(10, 1, f1, q, 0);
    this.setBiquad(11, 0, f2, q, 0);
    this.setBiquad(12, 0, f2, q, 0);
    this.setBiquad(13, 1, f2, q, 0);
    this.setBiquad(14, 1, f2, q, 0);
    this.setBiquad(15, 2, f2, q, 0);
  }

  tuneSympathetic(stageIndex: number): void {
    const idx = Math.max(0, Math.min(this.stageFreqs.length - 1, Math.round(stageIndex)));
    if (idx === this.curStage) return;
    this.curStage = idx;
    const freqs = this.stageFreqs[idx];
    for (let i = 0; i < 13; i++) {
      const f = Math.min(this.sr * 0.42, freqs[i]);
      const w0 = (2 * Math.PI * f) / this.sr;
      const r = Math.exp((-Math.PI * (0.45 + i * 0.09)) / this.sr);
      this.sympA1[i] = -2.0 * r * Math.cos(w0);
      this.sympA2[i] = r * r;
      this.sympB0[i] = (1.0 - r) * 0.42;
      this.sympY1[i] = 0;
      this.sympY2[i] = 0;
    }
  }

  applyConfig(patch: Partial<Master16Config>): void {
    if (!patch || typeof patch !== 'object') return;
    let filtersDirty = false;
    for (const k in patch) {
      const v = (patch as Record<string, unknown>)[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (!(k in this.cfg)) continue;
      (this.cfg as unknown as Record<string, number>)[k] = v;
      if (
        k === 'virtualBassCutoffHz' ||
        k === 'speakerHpfHz' ||
        k === 'crossoverLowHz' ||
        k === 'crossoverHighHz'
      ) {
        filtersDirty = true;
      }
    }
    if (filtersDirty) this.updateFilters();
    if (this.cfg.sympatheticStageIndex !== this.curStage) this.tuneSympathetic(this.cfg.sympatheticStageIndex);
  }

  /** Reset the integrated-loudness history (e.g. on a new match). */
  resetLoudness(): void {
    this.gatedCount = 0;
    this.gatedWrite = 0;
    this.integratedLufs = -70;
  }

  /**
   * Parabolic vertex refinement of the 4×-oversampled peak: values at quarter-sample positions
   * −1..4 (p[0..5]); fits a parabola through the largest |p| and its neighbours. Removes the
   * up-to −0.4 dB scalloping loss of plain 4× detection near 18 kHz at almost no cost.
   */
  refinePeak(p: Float64Array): number {
    let j = 1;
    let best = p[1] < 0 ? -p[1] : p[1];
    for (let k = 2; k <= 4; k++) {
      const a = p[k] < 0 ? -p[k] : p[k];
      if (a > best) {
        best = a;
        j = k;
      }
    }
    const a = p[j - 1];
    const b = p[j];
    const c = p[j + 1];
    const den = a - 2 * b + c;
    if (den > 1e-12 || den < -1e-12) {
      const xv = (a - c) / (2 * den);
      if (xv <= 0.6 && xv >= -0.6) {
        let f = b - ((a - c) * (a - c)) / (8 * den);
        if (f < 0) f = -f;
        if (f > best) best = f < best * 1.12 ? f : best * 1.12;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Real-time processing
  // ---------------------------------------------------------------------------
  processBlock(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array): void {
    const n = outL.length;
    const c = this.cfg;
    const sr = this.sr;

    const fdnWet = Math.max(0, Math.min(0.32, c.fdnWet));
    const fb = Math.max(0.1, Math.min(0.86, c.fdnFeedback));
    const damp = Math.max(0.05, Math.min(0.85, c.fdnDamping));
    const sympGain = Math.max(0, Math.min(0.16, c.sympatheticGain));
    const eqComp = Math.max(0, Math.min(1, c.equalLoudnessComp));
    const vbAmt = Math.max(0, Math.min(1.5, c.virtualBassAmount));
    const useHpf = c.speakerHpfHz >= 10;
    const mbAmt = Math.max(0, Math.min(1, c.multibandAmount));
    const ceiling = Math.pow(10, Math.max(-12, Math.min(-0.05, c.limiterCeilingDb)) / 20);
    const relCoef = Math.exp(-1 / (Math.max(5, c.limiterReleaseMs) * 0.001 * sr));
    const trim = Math.pow(10, Math.max(-12, Math.min(9, c.outputTrimDb)) / 20);

    const modAmp = 0.00018 * sr;
    const aBass = 1 - Math.exp((-2 * Math.PI * 95) / sr);
    const aAir = 1 - Math.exp((-2 * Math.PI * 8500) / sr);
    const invSqrt8 = 0.3535533905932738;

    // Multiband gain computers (soft knee 6 dB). Effective ratio scales with mbAmt.
    const thr0 = c.mbLowThrDb;
    const thr1 = c.mbMidThrDb;
    const thr2 = c.mbHighThrDb;
    const rat0 = 1 + (Math.max(1, c.mbLowRatio) - 1) * mbAmt;
    const rat1 = 1 + (Math.max(1, c.mbMidRatio) - 1) * mbAmt;
    const rat2 = 1 + (Math.max(1, c.mbHighRatio) - 1) * mbAmt;
    const mk0 = c.mbLowMakeupDb * mbAmt;
    const mk1 = c.mbMidMakeupDb * mbAmt;
    const mk2 = c.mbHighMakeupDb * mbAmt;
    const knee = 6;

    // keep the LFO phasors on the unit circle (drift is ~1e-16 per sample)
    for (let ch = 0; ch < 8; ch++) {
      const m = 1 / Math.sqrt(this.lfoC[ch] * this.lfoC[ch] + this.lfoS[ch] * this.lfoS[ch]);
      this.lfoC[ch] *= m;
      this.lfoS[ch] *= m;
    }
    const taps = this.firTaps;
    const ph = this.firPhases;
    const sympFreqStage = this.cfg.sympatheticStageIndex;
    if (sympFreqStage !== this.curStage) this.tuneSympathetic(sympFreqStage);

    for (let i = 0; i < n; i++) {
      let xL = inL ? inL[i] : 0;
      let xR = inR ? inR[i] : xL;
      if (!(xL === xL)) xL = 0; // NaN guard
      if (!(xR === xR)) xR = 0;

      // 1. ISO 226 quiet-volume contour
      if (eqComp > 0.01) {
        this.isoBassL += (xL - this.isoBassL) * aBass;
        this.isoBassR += (xR - this.isoBassR) * aBass;
        this.isoAirL += (xL - this.isoAirL) * aAir;
        this.isoAirR += (xR - this.isoAirR) * aAir;
        xL += this.isoBassL * (eqComp * 0.42) + (xL - this.isoAirL) * (eqComp * 0.22);
        xR += this.isoBassR * (eqComp * 0.42) + (xR - this.isoAirR) * (eqComp * 0.22);
      }

      // 2. Unitary Hadamard FDN air halo
      let fdnL = 0;
      let fdnR = 0;
      if (fdnWet > 0.001) {
        const S = this.fdnS;
        const lc = this.lfoC;
        const ls = this.lfoS;
        for (let ch = 0; ch < 8; ch++) {
          const buf = this.fdnLines[ch];
          const len = buf.length;
          const wIdx = this.fdnWriteIdx[ch];
          // rotate the LFO phasor (exactly sin(phase) without a transcendental per sample)
          const c0 = lc[ch];
          const s0 = ls[ch];
          const dc = this.lfoDc[ch];
          const ds = this.lfoDs[ch];
          lc[ch] = c0 * dc - s0 * ds;
          ls[ch] = s0 * dc + c0 * ds;
          let rPos = wIdx - (this.fdnBaseLen[ch] + ls[ch] * modAmp);
          if (rPos < 0) rPos += len;
          const r0 = rPos | 0;
          const frac = rPos - r0;
          const r1 = r0 + 1 < len ? r0 + 1 : 0;
          const del = buf[r0] * (1 - frac) + buf[r1] * frac;
          this.fdnLp[ch] += (del - this.fdnLp[ch]) * (1 - damp);
          S[ch] = this.fdnLp[ch];
        }
        fdnL = (S[0] - S[2] + S[4] - S[6]) * 0.42;
        fdnR = (S[1] - S[3] + S[5] - S[7]) * 0.42;
        const s0 = S[0] + S[1];
        const d0 = S[0] - S[1];
        const s1 = S[2] + S[3];
        const d1 = S[2] - S[3];
        const s2 = S[4] + S[5];
        const d2 = S[4] - S[5];
        const s3 = S[6] + S[7];
        const d3 = S[6] - S[7];
        const a0 = s0 + s1;
        const a1 = d0 + d1;
        const a2 = s0 - s1;
        const a3 = d0 - d1;
        const a4 = s2 + s3;
        const a5 = d2 + d3;
        const a6 = s2 - s3;
        const a7 = d2 - d3;
        S[0] = (a0 + a4) * invSqrt8;
        S[1] = (a1 + a5) * invSqrt8;
        S[2] = (a2 + a6) * invSqrt8;
        S[3] = (a3 + a7) * invSqrt8;
        S[4] = (a0 - a4) * invSqrt8;
        S[5] = (a1 - a5) * invSqrt8;
        S[6] = (a2 - a6) * invSqrt8;
        S[7] = (a3 - a7) * invSqrt8;
        const mIn = (xL + xR) * 0.25;
        const sIn = (xL - xR) * 0.22;
        for (let ch = 0; ch < 8; ch++) {
          const buf = this.fdnLines[ch];
          const wIdx = this.fdnWriteIdx[ch];
          const inj = (ch % 2 === 0 ? mIn + sIn : mIn - sIn) * (ch < 4 ? 1 : -1);
          buf[wIdx] = S[ch] * fb + inj;
          this.fdnWriteIdx[ch] = wIdx + 1 < buf.length ? wIdx + 1 : 0;
        }
      }

      // 3. Sympathetic resonance bank
      let sympL = 0;
      let sympR = 0;
      if (sympGain > 0.0005) {
        const ex = (xL + xR) * 0.5;
        for (let s = 0; s < 13; s++) {
          const y = this.sympB0[s] * ex - this.sympA1[s] * this.sympY1[s] - this.sympA2[s] * this.sympY2[s];
          this.sympY2[s] = this.sympY1[s];
          this.sympY1[s] = y;
          const pR = s / 12;
          sympL += y * (1 - pR * 0.65);
          sympR += y * (0.35 + pR * 0.65);
        }
        sympL *= sympGain;
        sympR *= sympGain;
        this.accSymp += sympL * sympL + sympR * sympR;
      }

      let yL = xL + fdnL * fdnWet + sympL;
      let yR = xR + fdnR * fdnWet + sympR;

      // 4. Chebyshev missing-fundamental virtual bass
      if (vbAmt > 0.001) {
        const mono = (yL + yR) * 0.5;
        const low = this.bq(1, 0, this.bq(0, 0, mono));
        // RMS envelope: 2-pole 9 Hz smoothing of 2·low² -> amplitude for a sinusoid
        const e2 = this.bq(this.vbEnvLpB, 0, this.bq(this.vbEnvLpA, 0, 2 * low * low));
        const env = Math.sqrt(Math.max(0, e2));
        let harm = 0;
        if (env > 1e-5) {
          let xn = low / env;
          if (xn > 1) xn = 1;
          else if (xn < -1) xn = -1;
          const x2 = xn * xn;
          const t2 = 2 * x2 - 1;
          const t3 = xn * (4 * x2 - 3);
          const t4 = 8 * x2 * x2 - 8 * x2 + 1;
          harm = (0.62 * t2 + 0.46 * t3 + 0.24 * t4) * env;
        }
        const band = this.bq(3, 0, this.bq(2, 0, harm)) * (1.35 * vbAmt);
        this.accVb += band * band;
        yL += band;
        yR += band;
      }

      // 5. Speaker-protection high-pass
      if (useHpf) {
        yL = this.bq(6, 0, yL);
        yR = this.bq(6, 1, yR);
      }

      // 6. 3-band LR4 multiband dynamics
      if (mbAmt > 0.001) {
        const loL0 = this.bq(8, 0, this.bq(7, 0, yL));
        const loR0 = this.bq(8, 1, this.bq(7, 1, yR));
        const restL = this.bq(10, 0, this.bq(9, 0, yL));
        const restR = this.bq(10, 1, this.bq(9, 1, yR));
        const loL = this.bq(15, 0, loL0);
        const loR = this.bq(15, 1, loR0);
        const midL = this.bq(12, 0, this.bq(11, 0, restL));
        const midR = this.bq(12, 1, this.bq(11, 1, restR));
        const hiL = this.bq(14, 0, this.bq(13, 0, restL));
        const hiR = this.bq(14, 1, this.bq(13, 1, restR));

        // Envelope followers run every sample (cheap); the dB gain computer runs at a 1/8 control
        // rate with per-sample linear ramps (attack ≥ 3 ms ≫ 8 samples, so this is inaudible).
        const env0 = this.mbEnv[0];
        const lvl0 = Math.max(Math.abs(loL), Math.abs(loR));
        this.mbEnv[0] = lvl0 > env0 ? this.mbAtt[0] * env0 + (1 - this.mbAtt[0]) * lvl0 : this.mbRel[0] * env0 + (1 - this.mbRel[0]) * lvl0;
        const env1 = this.mbEnv[1];
        const lvl1 = Math.max(Math.abs(midL), Math.abs(midR));
        this.mbEnv[1] = lvl1 > env1 ? this.mbAtt[1] * env1 + (1 - this.mbAtt[1]) * lvl1 : this.mbRel[1] * env1 + (1 - this.mbRel[1]) * lvl1;
        const env2 = this.mbEnv[2];
        const lvl2 = Math.max(Math.abs(hiL), Math.abs(hiR));
        this.mbEnv[2] = lvl2 > env2 ? this.mbAtt[2] * env2 + (1 - this.mbAtt[2]) * lvl2 : this.mbRel[2] * env2 + (1 - this.mbRel[2]) * lvl2;

        if (this.mbCtlCount === 0) {
          for (let b = 0; b < 3; b++) {
            const env = this.mbEnv[b];
            const thr = b === 0 ? thr0 : b === 1 ? thr1 : thr2;
            const rat = b === 0 ? rat0 : b === 1 ? rat1 : rat2;
            const mk = b === 0 ? mk0 : b === 1 ? mk1 : mk2;
            const lev = env > 1e-7 ? 20 * Math.log10(env) : -140;
            const over = lev - thr;
            let gr = 0;
            if (2 * over > knee) gr = (1 / rat - 1) * over;
            else if (2 * over > -knee) gr = ((1 / rat - 1) * (over + knee / 2) * (over + knee / 2)) / (2 * knee);
            const target = Math.pow(10, (gr + mk) / 20);
            this.mbGainStep[b] = (target - this.mbGainLin[b]) * 0.125;
            if (target < this.mbMinGain[b]) this.mbMinGain[b] = target;
          }
        }
        this.mbCtlCount = (this.mbCtlCount + 1) & 7;
        const g0 = (this.mbGainLin[0] += this.mbGainStep[0]);
        const g1 = (this.mbGainLin[1] += this.mbGainStep[1]);
        const g2 = (this.mbGainLin[2] += this.mbGainStep[2]);

        yL = loL * g0 + midL * g1 + hiL * g2;
        yR = loR * g0 + midR * g1 + hiR * g2;
      }

      yL *= trim;
      yR *= trim;

      // 7. True-peak limiter ------------------------------------------------
      // 7a. 4× polyphase intersample-peak detection (phase 0 = sample delayed by firDelay)
      const hi = this.histIdx;
      this.histL[hi] = yL;
      this.histL[hi + taps] = yL;
      this.histR[hi] = yR;
      this.histR[hi + taps] = yR;
      // newest sample sits at index hi; history[hi + k] (k = 0..taps-1) = x[n - k] after reversal below
      let tp = 0;
      {
        // quarter-sample values around x[n - firDelay]: p[0] = previous phase 3, p[1] = phase 0 (exact
        // delayed sample), p[2..4] = phases 1..3, p[5] = next sample (next phase 0)
        const cIdx = hi + taps - this.firDelay;
        const P = this.phOut;
        let p1L = 0;
        let p2L = 0;
        let p3L = 0;
        let p1R = 0;
        let p2R = 0;
        let p3R = 0;
        // Linear-phase symmetry: phase 2 is palindromic and phase 3 is phase 1 reversed, so both
        // reuse phase-1/phase-2 coefficients (h3[k] = h1[taps-1-k], h2[k] = h2[taps-1-k]).
        const hl = this.histL;
        const hr = this.histR;
        const base = hi + taps;
        const last = taps - 1;
        for (let k = 0; k < taps; k++) {
          const xl = hl[base - k];
          const xr = hr[base - k];
          const h1 = ph[k];
          p1L += h1 * xl;
          p1R += h1 * xr;
          const xl3 = hl[base - last + k];
          const xr3 = hr[base - last + k];
          p3L += h1 * xl3;
          p3R += h1 * xr3;
        }
        const half = taps >> 1;
        for (let k = 0; k < half; k++) {
          const h2 = ph[taps + k];
          p2L += h2 * (hl[base - k] + hl[base - last + k]);
          p2R += h2 * (hr[base - k] + hr[base - last + k]);
        }
        P[0] = this.prevP3L;
        P[1] = this.histL[cIdx];
        P[2] = p1L;
        P[3] = p2L;
        P[4] = p3L;
        P[5] = this.histL[cIdx + 1];
        const tL = this.refinePeak(P);
        P[0] = this.prevP3R;
        P[1] = this.histR[cIdx];
        P[2] = p1R;
        P[3] = p2R;
        P[4] = p3R;
        P[5] = this.histR[cIdx + 1];
        const tR = this.refinePeak(P);
        this.prevP3L = p3L;
        this.prevP3R = p3R;
        tp = tL > tR ? tL : tR;
      }
      this.histIdx = hi + 1 >= taps ? 0 : hi + 1;

      // 7b. required gain, sliding-window minimum (monotonic deque)
      const gReq = tp > ceiling ? ceiling / tp : 1;
      const cnt = this.sampleCounter++;
      const ringLen = this.tpRing.length;
      // detection index (cnt - (L+1-D)) covers the output sample's interval [m, m+1)
      const tpForOutput = this.tpRing[(cnt + this.firDelay) % ringLen];
      this.tpRing[cnt % ringLen] = tp;
      const cap = this.dqCap;
      while (this.dqTail !== this.dqHead) {
        const back = this.dqTail === 0 ? cap - 1 : this.dqTail - 1;
        if (this.dqVal[back] >= gReq) this.dqTail = back;
        else break;
      }
      this.dqIdx[this.dqTail] = cnt;
      this.dqVal[this.dqTail] = gReq;
      this.dqTail = this.dqTail + 1 >= cap ? 0 : this.dqTail + 1;
      while (this.dqIdx[this.dqHead] <= cnt - this.minWin) {
        this.dqHead = this.dqHead + 1 >= cap ? 0 : this.dqHead + 1;
      }
      const hMin = this.dqVal[this.dqHead];

      // 7c. release smoothing (only ever slower to recover -> stays ≤ hMin)
      if (hMin <= this.hRel) this.hRel = hMin;
      else this.hRel = hMin + (this.hRel - hMin) * relCoef;

      // 7d. moving-average attack ramp
      const bi = this.boxIdx;
      this.boxSum += this.hRel - this.boxBuf[bi];
      this.boxBuf[bi] = this.hRel;
      this.boxIdx = bi + 1 >= this.boxLen ? 0 : bi + 1;
      if (++this.boxRefresh >= 4096) {
        this.boxRefresh = 0;
        let s = 0;
        for (let k = 0; k < this.boxLen; k++) s += this.boxBuf[k];
        this.boxSum = s;
      }
      let g = this.boxSum / this.boxLen;
      if (g > 1) g = 1;
      this.limGain = g;

      // 7e. look-ahead delay line
      const di = this.delayIdx;
      const dL = this.delayL[di];
      const dR = this.delayR[di];
      this.delayL[di] = yL;
      this.delayR[di] = yR;
      this.delayIdx = di + 1 >= this.delayL.length ? 0 : di + 1;

      let oL = dL * g;
      let oR = dR * g;
      // Safety net only (should never engage — counted & reported)
      const lim = ceiling * 1.000001;
      if (oL > lim || oL < -lim || oR > lim || oR < -lim) {
        this.clipEvents++;
        oL = oL > lim ? lim : oL < -lim ? -lim : oL;
        oR = oR > lim ? lim : oR < -lim ? -lim : oR;
      }
      outL[i] = oL;
      outR[i] = oR;

      // 8. Metering ---------------------------------------------------------
      // 8a. output peaks: sample peak exactly; true peak = detected input true peak of the same
      //     interval × the gain applied to it (the gain is smooth across one sample)
      {
        const aL = oL < 0 ? -oL : oL;
        const aR = oR < 0 ? -oR : oR;
        const sp = aL > aR ? aL : aR;
        if (sp > this.accSp) this.accSp = sp;
        let tpo = tpForOutput * g;
        if (sp > tpo) tpo = sp;
        if (tpo > this.accTp) this.accTp = tpo;
      }

      // 8b. K-weighting (shelf -> high-pass) per channel
      const kz = this.kZ;
      const ks = this.kShC;
      const kh = this.kHpC;
      let s1 = ks[0] * oL + kz[0];
      kz[0] = ks[1] * oL - ks[3] * s1 + kz[1];
      kz[1] = ks[2] * oL - ks[4] * s1;
      const kwL = kh[0] * s1 + kz[2];
      kz[2] = kh[1] * s1 - kh[3] * kwL + kz[3];
      kz[3] = kh[2] * s1 - kh[4] * kwL;
      s1 = ks[0] * oR + kz[4];
      kz[4] = ks[1] * oR - ks[3] * s1 + kz[5];
      kz[5] = ks[2] * oR - ks[4] * s1;
      const kwR = kh[0] * s1 + kz[6];
      kz[6] = kh[1] * s1 - kh[3] * kwR + kz[7];
      kz[7] = kh[2] * s1 - kh[4] * kwR;
      this.subBlockEnergy += kwL * kwL + kwR * kwR;
      if (++this.subBlockCount >= this.subBlockLen) this.closeSubBlock();

      this.accRms += oL * oL + oR * oR;
      this.accCorrNum += oL * oR;
      this.accCorrL += oL * oL;
      this.accCorrR += oR * oR;
      if (g < this.accMinLim) this.accMinLim = g;
      if (++this.meterN >= this.meterLen) this.publishMetrics();
    }
  }

  /** 100 ms sub-block boundary: update momentary/short-term rings and the gated block list. */
  closeSubBlock(): void {
    const meanSq = this.subBlockEnergy / this.subBlockCount;
    this.subBlocks[this.subBlockWrite] = meanSq;
    this.subBlockWrite = (this.subBlockWrite + 1) % this.subBlocks.length;
    if (this.subBlocksFilled < this.subBlocks.length) this.subBlocksFilled++;
    this.subBlockEnergy = 0;
    this.subBlockCount = 0;

    if (this.subBlocksFilled >= 4) {
      // 400 ms block (4 × 100 ms, 75 % overlap) for gating
      let e = 0;
      for (let k = 1; k <= 4; k++) {
        e += this.subBlocks[(this.subBlockWrite - k + this.subBlocks.length) % this.subBlocks.length];
      }
      e *= 0.25;
      this.gatedBlocks[this.gatedWrite] = e;
      this.gatedWrite = (this.gatedWrite + 1) % this.gatedBlocks.length;
      if (this.gatedCount < this.gatedBlocks.length) this.gatedCount++;
      if (++this.hopsSinceIntegrated >= 5) {
        this.hopsSinceIntegrated = 0;
        this.integratedLufs = this.computeIntegrated();
      }
    }
  }

  computeIntegrated(): number {
    // Absolute gate −70 LUFS: mean-square threshold
    const absThr = Math.pow(10, (-70 + 0.691) / 10);
    let sum = 0;
    let count = 0;
    for (let k = 0; k < this.gatedCount; k++) {
      const e = this.gatedBlocks[k];
      if (e > absThr) {
        sum += e;
        count++;
      }
    }
    if (count === 0) return -70;
    const relLufs = -0.691 + 10 * Math.log10(sum / count) - 10;
    const relThr = Math.pow(10, (relLufs + 0.691) / 10);
    sum = 0;
    count = 0;
    for (let k = 0; k < this.gatedCount; k++) {
      const e = this.gatedBlocks[k];
      if (e > absThr && e > relThr) {
        sum += e;
        count++;
      }
    }
    if (count === 0) return -70;
    return -0.691 + 10 * Math.log10(sum / count);
  }

  publishMetrics(): void {
    const toDb = (v: number, floor: number): number => (v > 1e-9 ? Math.max(floor, 20 * Math.log10(v)) : floor);
    const ringLen = this.subBlocks.length;
    let eM = 0;
    const mCount = Math.min(4, this.subBlocksFilled);
    for (let k = 1; k <= mCount; k++) eM += this.subBlocks[(this.subBlockWrite - k + ringLen) % ringLen];
    let eS = 0;
    const sCount = Math.min(30, this.subBlocksFilled);
    for (let k = 1; k <= sCount; k++) eS += this.subBlocks[(this.subBlockWrite - k + ringLen) % ringLen];
    const lufsM = mCount > 0 && eM > 0 ? -0.691 + 10 * Math.log10(eM / mCount) : -70;
    const lufsS = sCount > 0 && eS > 0 ? -0.691 + 10 * Math.log10(eS / sCount) : -70;

    const rms = Math.sqrt(this.accRms / (2 * this.meterN));
    const den = Math.sqrt(this.accCorrL * this.accCorrR);
    const corr = den > 1e-12 ? Math.max(-1, Math.min(1, this.accCorrNum / den)) : 1;
    const tpDb = toDb(this.accTp, -70);
    const rmsDb = toDb(rms, -70);
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const mbAmt = Math.max(0, Math.min(1, this.cfg.multibandAmount));
    const mbOn = mbAmt > 0.001 && this.mbMinGain[0] <= 1.999;

    this.metrics = {
      lufsMomentary: r1(Math.max(-70, lufsM)),
      lufsShortTerm: r1(Math.max(-70, lufsS)),
      lufsIntegrated: r1(Math.max(-70, this.integratedLufs)),
      truePeakDbTp: r1(tpDb),
      samplePeakDb: r1(toDb(this.accSp, -70)),
      phaseCorrelation: Math.round(corr * 100) / 100,
      crestFactorDb: r1(Math.max(0, tpDb - rmsDb)),
      limiterGrDb: r1(toDb(this.accMinLim, -40)),
      bandLowGrDb: mbOn ? r1(Math.min(0, toDb(this.mbMinGain[0], -40) - this.cfg.mbLowMakeupDb * mbAmt)) : 0,
      bandMidGrDb: mbOn ? r1(Math.min(0, toDb(this.mbMinGain[1], -40) - this.cfg.mbMidMakeupDb * mbAmt)) : 0,
      bandHighGrDb: mbOn ? r1(Math.min(0, toDb(this.mbMinGain[2], -40) - this.cfg.mbHighMakeupDb * mbAmt)) : 0,
      virtualBassDb: r1(toDb(Math.sqrt(this.accVb / this.meterN), -90)),
      sympatheticEnergyDb: r1(toDb(Math.sqrt(this.accSymp / (2 * this.meterN)), -90)),
      clipEvents: this.clipEvents,
      workletActive: false,
    };
    this.metricsSeq++;
    this.meterN = 0;
    this.accRms = 0;
    this.accCorrNum = 0;
    this.accCorrL = 0;
    this.accCorrR = 0;
    this.accTp = 0;
    this.accSp = 0;
    this.accSymp = 0;
    this.accVb = 0;
    this.accMinLim = 1;
    this.mbMinGain[0] = 2;
    this.mbMinGain[1] = 2;
    this.mbMinGain[2] = 2;
  }
}

/** Stage sympathetic tunings, in STAGE_INDEX_MAP order (zashiki, salon, shrine, onsen, atelier). */
export const MASTER16_STAGE_FREQS: number[][] = [
  [146.83, 164.81, 174.61, 220.0, 233.08, 293.66, 329.63, 349.23, 440.0, 466.16, 587.33, 659.25, 880.0],
  [130.81, 164.81, 196.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 987.77],
  [110.0, 165.0, 220.4, 304.8, 396.2, 528.0, 661.5, 842.0, 1054.0, 1318.5, 1620.0, 1980.0, 2410.0],
  [123.47, 185.0, 246.94, 311.13, 369.99, 493.88, 554.37, 659.25, 739.99, 987.77, 1108.73, 1318.51, 1479.98],
  [155.56, 207.65, 261.63, 311.13, 415.3, 466.16, 554.37, 622.25, 830.61, 932.33, 1174.66, 1480.0, 1864.66],
];

/**
 * Build the AudioWorklet module source from the kernel's own source text, so the audio thread runs
 * exactly the code that the Node test-suite verifies.
 */
export function buildMaster16WorkletSource(): string {
  // Bundlers may decorate classes with helper calls (e.g. esbuild keepNames `__name`); strip the
  // static-block form (unsupported on older Safari audio threads) and shim the helpers.
  const kernelSrc = JSound16MasterKernel.toString().replace(/static\s*\{\s*__name\(this,\s*["'][^"']*["']\)\s*;?\s*\}/g, '');
  return `
var __defProp = Object.defineProperty;
var __name = (target, value) => { try { __defProp(target, 'name', { value, configurable: true }); } catch (e) {} return target; };
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : (obj[key] = value);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== 'symbol' ? key + '' : key, value);
const __JSOUND16_STAGE_FREQS = ${JSON.stringify(MASTER16_STAGE_FREQS)};
const __JSound16Kernel = (${kernelSrc});
class JSound16MasterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.k = new __JSound16Kernel(sampleRate, __JSOUND16_STAGE_FREQS);
    this.lastSeq = -1;
    this.silentIn = new Float32Array(128);
    this.port.onmessage = (ev) => {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.__resetLoudness) { this.k.resetLoudness(); return; }
      this.k.applyConfig(d);
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const input = inputs[0];
    let inL = input && input[0] ? input[0] : null;
    let inR = input && input[1] ? input[1] : inL;
    if (!inL) {
      if (this.silentIn.length !== outL.length) this.silentIn = new Float32Array(outL.length);
      inL = this.silentIn;
      inR = this.silentIn;
    }
    this.k.processBlock(inL, inR, outL, outR);
    if (this.k.metricsSeq !== this.lastSeq) {
      this.lastSeq = this.k.metricsSeq;
      const m = this.k.metrics;
      m.workletActive = true;
      this.port.postMessage(m);
    }
    return true;
  }
}
registerProcessor('jsound16-kiwami-master', JSound16MasterProcessor);
`;
}

/**
 * Browser host for the 1.6 master. Audio flows through a conservative safety chain
 * (glue compressor + DynamicsCompressor limiter) until the worklet is registered, then
 * crossfades to the worklet in 30 ms. If AudioWorklet is unavailable the safety chain stays.
 */
export class Master16WorkletHost {
  public readonly input: GainNode;
  public readonly output: GainNode;
  public metrics: Master16Metrics = {
    lufsMomentary: -70,
    lufsShortTerm: -70,
    lufsIntegrated: -70,
    truePeakDbTp: -70,
    samplePeakDb: -70,
    phaseCorrelation: 1,
    crestFactorDb: 0,
    limiterGrDb: 0,
    bandLowGrDb: 0,
    bandMidGrDb: 0,
    bandHighGrDb: 0,
    virtualBassDb: -90,
    sympatheticEnergyDb: -90,
    clipEvents: 0,
    workletActive: false,
  };

  private readonly ctx: AudioContext;
  private readonly safetyGain: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private blobUrl: string | null = null;
  private pending: Master16Config;

  constructor(ctx: AudioContext, initial: Partial<Master16Config> = {}) {
    this.ctx = ctx;
    this.pending = { ...DEFAULT_MASTER16_CONFIG, ...initial };
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.safetyGain = ctx.createGain();

    // Fallback safety chain (only audible until/unless the worklet is live)
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -12.5;
    glue.knee.value = 14;
    glue.ratio.value = 2.2;
    glue.attack.value = 0.008;
    glue.release.value = 0.13;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1.5;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.06;
    this.input.connect(glue);
    glue.connect(lim);
    lim.connect(this.safetyGain);
    this.safetyGain.connect(this.output);

    void this.init();
  }

  private async init(): Promise<void> {
    if (
      typeof AudioWorkletNode === 'undefined' ||
      !this.ctx.audioWorklet ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined'
    ) {
      return;
    }
    try {
      const blob = new Blob([buildMaster16WorkletSource()], { type: 'application/javascript' });
      this.blobUrl = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(this.blobUrl);
      const node = new AudioWorkletNode(this.ctx, 'jsound16-kiwami-master', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      node.port.onmessage = (ev: MessageEvent<Master16Metrics>) => {
        if (ev.data && typeof ev.data.lufsMomentary === 'number') this.metrics = ev.data;
      };
      node.port.postMessage(this.pending);

      const wGain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      wGain.gain.setValueAtTime(0, now);
      wGain.gain.linearRampToValueAtTime(1, now + 0.03);
      this.input.connect(node);
      node.connect(wGain);
      wGain.connect(this.output);
      this.safetyGain.gain.setValueAtTime(1, now);
      this.safetyGain.gain.linearRampToValueAtTime(0, now + 0.03);
      this.workletNode = node;
      this.metrics = { ...this.metrics, workletActive: true };
    } catch {
      this.metrics = { ...this.metrics, workletActive: false };
    }
  }

  public updateConfig(patch: Partial<Master16Config>): void {
    this.pending = { ...this.pending, ...patch };
    this.workletNode?.port.postMessage(patch);
  }

  public resetLoudness(): void {
    this.workletNode?.port.postMessage({ __resetLoudness: true });
  }

  public get isWorkletActive(): boolean {
    return this.workletNode !== null;
  }

  public dispose(): void {
    try {
      this.workletNode?.disconnect();
      this.input.disconnect();
      this.output.disconnect();
      this.safetyGain.disconnect();
    } catch {
      // ignore
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
