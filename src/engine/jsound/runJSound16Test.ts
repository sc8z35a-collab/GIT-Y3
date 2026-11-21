/**
 * ★ JSound Engin 1.6 — Verification Suite (`npm run test:jsound16`) ★
 *
 * Every claim made for 1.6 is checked numerically here:
 *  1. 4× polyphase FIR true-peak detector vs the 1.5 Catmull-Rom estimate (fs/4 @ 45°: +3.01 dB ISP)
 *  2. Look-ahead limiter: sample peaks never exceed the ceiling, no safety-clip events, true peak
 *     (16× reference) within 0.2 dB of the ceiling, transparent below threshold (pure delay)
 *  3. Lower limiter distortion than 1.5 on a steadily over-driven sine (THD+N comparison)
 *  4. LR4 3-band split sums to an exact allpass (magnitude flat to < 0.01 dB)
 *  5. Chebyshev virtual bass turns a 60 Hz tone into 120/180/240 Hz harmonics, speaker HPF removes 60 Hz
 *  6. BS.1770-4: −20 dBFS 997 Hz stereo sine reads −20.0 LUFS integrated; K-weighting matches the
 *     ITU 48 kHz reference coefficients; −70/−10 gating ignores silence
 *  7. The AudioWorklet source generated from the kernel runs and is bit-identical to the kernel
 *  8. Render-farm job dispatch is deterministic and covers every timing-critical synth
 *  9. Priority voice manager steals the right voice and never drops a critical one
 * 10. Synthesis budget governor steps quality down on slow devices and back up when fast
 */

import {
  DEVICE_PROFILE_SPECS,
  JSound16MasterKernel,
  MASTER16_STAGE_FREQS,
  buildMaster16WorkletSource,
  resolveDeviceProfile,
} from './QuantumMaster16';
import { QuantumMasterKernel, estimateCubicTruePeak4x } from './QuantumMasterWorklet';
import {
  CLASH_LAYER_KINDS,
  RenderJob,
  SynthesisBudgetGovernor,
  VoicePriorityManager,
  planClashLayers,
  runRenderJob,
} from './RenderFarm16';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${name} — ${detail}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name} — ${detail}`);
  }
}

const SR = 48000;
const db = (v: number): number => 20 * Math.log10(Math.max(1e-12, v));

function makeKernel(patch: Record<string, number> = {}): JSound16MasterKernel {
  return new JSound16MasterKernel(SR, MASTER16_STAGE_FREQS, {
    fdnWet: 0,
    sympatheticGain: 0,
    equalLoudnessComp: 0,
    virtualBassAmount: 0,
    speakerHpfHz: 0,
    multibandAmount: 0,
    outputTrimDb: 0,
    limiterCeilingDb: -1.0,
    ...patch,
  });
}

function runKernel(k: JSound16MasterKernel, l: Float32Array, r: Float32Array): { l: Float32Array; r: Float32Array } {
  const outL = new Float32Array(l.length);
  const outR = new Float32Array(r.length);
  const B = 128;
  for (let i = 0; i < l.length; i += B) {
    const end = Math.min(l.length, i + B);
    k.processBlock(l.subarray(i, end), r.subarray(i, end), outL.subarray(i, end), outR.subarray(i, end));
  }
  return { l: outL, r: outR };
}

/** 16× band-limited reference interpolation for measuring true peak independently of the kernel. */
function referenceTruePeak(x: Float32Array, start = 0): number {
  const os = 16;
  const half = 48; // input samples each side
  let peak = 0;
  for (let n = start + half; n < x.length - half; n++) {
    for (let p = 0; p < os; p++) {
      const t = n + p / os;
      let acc = 0;
      for (let k = n - half + 1; k <= n + half; k++) {
        const d = t - k;
        const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
        const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (half + 1));
        acc += x[k] * sinc * w;
      }
      const a = Math.abs(acc);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

/** THD+N via least-squares fit of the fundamental (sin/cos at f) and residual energy. */
function thdN(x: Float32Array, f: number, start: number, len: number): number {
  let ss = 0;
  let sc = 0;
  let cc = 0;
  let xs = 0;
  let xc = 0;
  let mean = 0;
  for (let i = start; i < start + len; i++) mean += x[i];
  mean /= len;
  for (let i = start; i < start + len; i++) {
    const w = (2 * Math.PI * f * i) / SR;
    const s = Math.sin(w);
    const c = Math.cos(w);
    const v = x[i] - mean;
    ss += s * s;
    sc += s * c;
    cc += c * c;
    xs += v * s;
    xc += v * c;
  }
  const det = ss * cc - sc * sc;
  const a = (xs * cc - xc * sc) / det;
  const b = (xc * ss - xs * sc) / det;
  let res = 0;
  let sig = 0;
  for (let i = start; i < start + len; i++) {
    const w = (2 * Math.PI * f * i) / SR;
    const fit = a * Math.sin(w) + b * Math.cos(w);
    const v = x[i] - mean;
    sig += fit * fit;
    res += (v - fit) * (v - fit);
  }
  return Math.sqrt(res / Math.max(1e-20, sig));
}

/** Goertzel magnitude of frequency f over a block. */
function goertzel(x: Float32Array, f: number, start: number, len: number): number {
  const w = (2 * Math.PI * f) / SR;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = start; i < start + len; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - start)) / (len - 1));
    const s0 = x[i] * hann + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const re = s1 - s2 * Math.cos(w);
  const im = s2 * Math.sin(w);
  return (2 * Math.sqrt(re * re + im * im)) / (len * 0.5);
}

console.log('\n=== JSound Engin 1.6 — KIWAMI MASTER 16 × Render Farm Verification Suite ===\n');

// -----------------------------------------------------------------------------
// 1. True-peak detection accuracy
// -----------------------------------------------------------------------------
{
  const n = SR;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((Math.PI / 2) * i + Math.PI / 4); // fs/4, samples at ±0.7071
  // 1.5 estimate
  let cr = 0;
  for (let i = 3; i < n; i++) cr = Math.max(cr, estimateCubicTruePeak4x(x[i - 3], x[i - 2], x[i - 1], x[i]));
  // 1.6 detector: run a kernel with a ceiling far above the signal and read the metered true peak
  const k = makeKernel({ limiterCeilingDb: -0.05 });
  const scaled = new Float32Array(n);
  for (let i = 0; i < n; i++) scaled[i] = x[i] * 0.5; // true peak 0.5 (−6.02 dBTP), samples at 0.3536
  runKernel(k, scaled, scaled);
  const tp16 = k.metrics.truePeakDbTp;
  const errCr = Math.abs(db(cr) - 0);
  const err16 = Math.abs(tp16 - db(0.5));
  check(
    '4× polyphase FIR true-peak detector resolves the fs/4 @ 45° intersample peak',
    err16 < 0.1 && errCr > 0.8,
    `true ISP=+3.01 dB over samples | 1.6 FIR error=${err16.toFixed(3)} dB vs 1.5 Catmull-Rom error=${errCr.toFixed(2)} dB`
  );
}

// -----------------------------------------------------------------------------
// 2. Limiter guarantees
// -----------------------------------------------------------------------------
{
  const n = SR * 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  // 4th-order 18 kHz low-pass for the noise component (all JSound sources pass a 19.2 kHz FIR decimator)
  let z1 = 0, z2 = 0, z3 = 0, z4 = 0;
  const lp = (v: number): number => {
    z1 += (v - z1) * 0.86;
    z2 += (z1 - z2) * 0.86;
    z3 += (z2 - z3) * 0.86;
    z4 += (z3 - z4) * 0.86;
    return z4;
  };
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const burst = Math.sin(2 * Math.PI * 3 * t) > 0.2 ? 4.0 : 0.6; // +12 dB bursts
    const hf = Math.sin(2 * Math.PI * 11025 * t + 0.785) * 0.8; // fs/4-ish tone with ISPs
    const nz = lp(rnd() * 1.6);
    l[i] = (nz + Math.sin(2 * Math.PI * 97 * t) * 0.7 + hf) * burst;
    r[i] = (-nz * 0.8 + rnd() * 0.05 + Math.sin(2 * Math.PI * 131 * t + 1) * 0.7 - hf) * burst;
    if (i % 9000 === 0) {
      l[i] = 8; // isolated +18 dB single-sample spikes
      r[i] = -8;
    }
  }
  const k = makeKernel();
  const out = runKernel(k, l, r);
  const ceiling = Math.pow(10, -1 / 20);
  let maxSample = 0;
  for (let i = 0; i < n; i++) maxSample = Math.max(maxSample, Math.abs(out.l[i]), Math.abs(out.r[i]));
  const refTp = Math.max(referenceTruePeak(out.l.subarray(0, 24000)), referenceTruePeak(out.r.subarray(0, 24000)));
  check(
    'Look-ahead min-hold limiter never exceeds the ceiling and never needs its safety clipper',
    maxSample <= ceiling * 1.000001 && k.clipEvents === 0,
    `input peak=+18.1 dBFS -> output sample peak=${db(maxSample).toFixed(3)} dBFS (ceiling −1.000), safety clips=${k.clipEvents}`
  );
  check(
    'Output true peak (independent 16× reference) stays within 0.2 dB of the −1.0 dBTP ceiling',
    db(refTp) <= -1.0 + 0.2,
    `reference true peak=${db(refTp).toFixed(3)} dBTP`
  );
}
{
  // transparency below threshold: exact pure delay
  const n = 8192;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = Math.sin(i * 0.031) * 0.3 + Math.sin(i * 0.47) * 0.2;
    r[i] = Math.cos(i * 0.017) * 0.25;
  }
  const k = makeKernel();
  const out = runKernel(k, l, r);
  const delay = k.lookLen + 1;
  let maxErr = 0;
  for (let i = delay; i < n; i++) {
    maxErr = Math.max(maxErr, Math.abs(out.l[i] - l[i - delay]), Math.abs(out.r[i] - r[i - delay]));
  }
  check(
    'Limiter is bit-transparent below the ceiling (pure look-ahead delay)',
    maxErr < 1e-6,
    `latency=${delay} samples (${((delay / SR) * 1000).toFixed(2)} ms), max deviation=${maxErr.toExponential(2)}`
  );
}

// -----------------------------------------------------------------------------
// 3. Distortion comparison vs 1.5
// -----------------------------------------------------------------------------
{
  const results: string[] = [];
  let allBetter = true;
  for (const f of [80, 1000]) {
    const n = SR * 2;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * f * i) / SR) * 1.6; // +4.1 dBFS steady
    const k16 = makeKernel({ limiterCeilingDb: -0.4 });
    const o16 = runKernel(k16, x, x);
    const k15 = new QuantumMasterKernel(SR, { fdnWet: 0, sympatheticGain: 0, equalLoudnessComp: 0, truePeakCeiling: Math.pow(10, -0.4 / 20) });
    const o15L = new Float32Array(n);
    const o15R = new Float32Array(n);
    for (let i = 0; i < n; i += 128) {
      const e = Math.min(n, i + 128);
      k15.processBlock(x.subarray(i, e), x.subarray(i, e), o15L.subarray(i, e), o15R.subarray(i, e));
    }
    const start = SR;
    const len = SR / 2;
    const t16 = thdN(o16.l, f, start, len);
    const t15 = thdN(o15L, f, start, len);
    if (!(t16 < t15 * 0.5)) allBetter = false;
    results.push(`${f} Hz: 1.5=${(t15 * 100).toFixed(2)}% -> 1.6=${(t16 * 100).toFixed(3)}%`);
  }
  check('Limiter THD+N on a +4 dBFS steady sine is at least 2× lower than JSound 1.5', allBetter, results.join(' | '));
}

// -----------------------------------------------------------------------------
// 4. LR4 3-band allpass reconstruction
// -----------------------------------------------------------------------------
{
  const k = makeKernel({ multibandAmount: 1.0, mbLowThrDb: 40, mbMidThrDb: 40, mbHighThrDb: 40, mbLowMakeupDb: 0, mbMidMakeupDb: 0, mbHighMakeupDb: 0, limiterCeilingDb: -0.05 });
  const N = 16384;
  const imp = new Float32Array(N);
  imp[0] = 0.25;
  const out = runKernel(k, imp, imp);
  // DFT magnitude at log-spaced frequencies
  let maxDev = 0;
  for (let fi = 0; fi < 60; fi++) {
    const f = 20 * Math.pow(1000, fi / 59);
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / SR;
    for (let i = 0; i < N; i++) {
      re += out.l[i] * Math.cos(w * i);
      im -= out.l[i] * Math.sin(w * i);
    }
    const mag = Math.sqrt(re * re + im * im) / 0.25;
    maxDev = Math.max(maxDev, Math.abs(db(mag)));
  }
  check(
    'LR4 3-band (low/mid/high) split recombines as an exact allpass',
    maxDev < 0.01,
    `max magnitude deviation 20 Hz–20 kHz = ${maxDev.toFixed(5)} dB (crossovers 200 Hz / 3.6 kHz)`
  );
}

// -----------------------------------------------------------------------------
// 5. Virtual bass on a phone speaker profile
// -----------------------------------------------------------------------------
{
  const phone = DEVICE_PROFILE_SPECS.phone_speaker.master;
  const n = SR * 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 60 * i) / SR) * 0.25;
  const kPhone = makeKernel({ ...phone, multibandAmount: 0, outputTrimDb: 0 });
  const kPlain = makeKernel({ ...phone, virtualBassAmount: 0, multibandAmount: 0, outputTrimDb: 0 });
  const oP = runKernel(kPhone, x, x).l;
  const oN = runKernel(kPlain, x, x).l;
  const start = SR;
  const len = 24000;
  const fund = goertzel(x, 60, start, len);
  const f60 = goertzel(oP, 60, start, len);
  const h2 = goertzel(oP, 120, start, len);
  const h3 = goertzel(oP, 180, start, len);
  const h4 = goertzel(oP, 240, start, len);
  const h3Plain = goertzel(oN, 180, start, len);
  const harmDb = db(Math.sqrt(h2 * h2 + h3 * h3 + h4 * h4) / fund);
  check(
    'Chebyshev virtual bass recreates a 60 Hz taiko fundamental as audible 2nd–4th harmonics',
    harmDb > -12 && h3 > h3Plain * 20,
    `harmonics (120/180/240 Hz) = ${harmDb.toFixed(1)} dB re. fundamental [${db(h2 / fund).toFixed(1)} / ${db(h3 / fund).toFixed(1)} / ${db(h4 / fund).toFixed(1)} dB]`
  );
  check(
    'Speaker-protection HPF keeps unreproducible 60 Hz excursion energy out of the phone speaker',
    db(f60 / fund) < -12,
    `60 Hz after 150 Hz HPF = ${db(f60 / fund).toFixed(1)} dB`
  );
}

// -----------------------------------------------------------------------------
// 6. Loudness
// -----------------------------------------------------------------------------
{
  // K-weighting coefficients match ITU-R BS.1770-4 Table 1/2 at 48 kHz
  const k = makeKernel();
  const ref = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
  const refHp = [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621];
  let maxErr = 0;
  for (let i = 0; i < 5; i++) maxErr = Math.max(maxErr, Math.abs(k.kShC[i] - ref[i]));
  for (let i = 0; i < 5; i++) maxErr = Math.max(maxErr, Math.abs(k.kHpC[i] - refHp[i]));
  check('K-weighting pre-filter re-derived from the analogue prototype matches ITU 48 kHz coefficients', maxErr < 1e-4, `max coefficient error=${maxErr.toExponential(2)}`);
}
{
  const n = SR * 10;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 997 * i) / SR) * 0.1; // −20 dBFS peak
  const k = makeKernel({ limiterCeilingDb: -0.05 });
  runKernel(k, x, x);
  const integ = k.computeIntegrated();
  const shortTerm = k.metrics.lufsShortTerm;
  const momentary = k.metrics.lufsMomentary;
  // silence must not drag the gated integrated loudness down
  const silence = new Float32Array(SR * 5);
  runKernel(k, silence, silence);
  const integAfterSilence = k.computeIntegrated();
  const ungatedDrop = 10 * Math.log10(10 / 15);
  check(
    'BS.1770-4 loudness calibrated: −20 dBFS 997 Hz stereo sine reads −20.0 LUFS (M / S / I)',
    Math.abs(integ - -20) < 0.1 && Math.abs(shortTerm - -20) < 0.15 && Math.abs(momentary - -20) < 0.15,
    `momentary=${momentary} LUFS, short-term=${shortTerm} LUFS, integrated=${integ.toFixed(2)} LUFS`
  );
  check(
    'Absolute (−70 LUFS) & relative (−10 LU) gates ignore 5 s of silence',
    Math.abs(integAfterSilence - integ) < 0.15,
    `gated change=${(integAfterSilence - integ).toFixed(2)} dB (an ungated meter would drop ${ungatedDrop.toFixed(2)} dB)`
  );
}

// -----------------------------------------------------------------------------
// 7. AudioWorklet source == kernel
// -----------------------------------------------------------------------------
{
  const src = buildMaster16WorkletSource();
  let registered: { name: string; cls: new () => { process: (i: Float32Array[][], o: Float32Array[][]) => boolean } } | null = null;
  class FakePort {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    posted: unknown[] = [];
    postMessage(m: unknown): void {
      this.posted.push(m);
    }
  }
  class FakeAudioWorkletProcessor {
    port = new FakePort();
  }
  const factory = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', `${src}`);
  factory(
    FakeAudioWorkletProcessor,
    (name: string, cls: new () => { process: (i: Float32Array[][], o: Float32Array[][]) => boolean }) => {
      registered = { name, cls };
    },
    SR
  );
  let identical = false;
  let maxDiff = Infinity;
  const reg = registered as { name: string; cls: new () => { process: (i: Float32Array[][], o: Float32Array[][]) => boolean; port: FakePort } } | null;
  if (reg) {
    const proc = new reg.cls();
    const phone = { ...DEVICE_PROFILE_SPECS.phone_speaker.master, fdnWet: 0.14, sympatheticGain: 0.055 };
    proc.port.onmessage?.({ data: phone });
    const k = new JSound16MasterKernel(SR, MASTER16_STAGE_FREQS);
    k.applyConfig(phone);
    const n = 128 * 200;
    const inL = new Float32Array(n);
    const inR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      inL[i] = Math.sin(i * 0.013) * 0.9 + Math.sin(i * 0.31) * 0.4;
      inR[i] = Math.sin(i * 0.011 + 1) * 0.8;
    }
    const wL = new Float32Array(n);
    const wR = new Float32Array(n);
    for (let b = 0; b < n; b += 128) {
      proc.process([[inL.subarray(b, b + 128), inR.subarray(b, b + 128)]], [[wL.subarray(b, b + 128), wR.subarray(b, b + 128)]]);
    }
    const ref = runKernel(k, inL, inR);
    maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(wL[i] - ref.l[i]), Math.abs(wR[i] - ref.r[i]));
    identical = maxDiff === 0 && proc.port.posted.length > 0;
  }
  check(
    'AudioWorklet module generated from the kernel registers and is bit-identical to the Node kernel',
    Boolean(reg) && identical,
    `processor=${reg ? reg.name : 'none'}, max |Δ|=${maxDiff}, source=${(src.length / 1024).toFixed(1)} KB`
  );
}

// -----------------------------------------------------------------------------
// 8. Device profile resolution
// -----------------------------------------------------------------------------
{
  const phone = resolveDeviceProfile('auto', { coarsePointer: true, maxScreenSidePx: 932 });
  const desk = resolveDeviceProfile('auto', { coarsePointer: false, maxScreenSidePx: 2560 });
  const forced = resolveDeviceProfile('headphones', { coarsePointer: true, maxScreenSidePx: 932 });
  check(
    'Device-adaptive playback profiles resolve correctly (auto → phone/PC, explicit override kept)',
    phone === 'phone_speaker' && desk === 'pc_speakers' && forced === 'headphones' && !DEVICE_PROFILE_SPECS.phone_speaker.useHrtf && DEVICE_PROFILE_SPECS.headphones.useHrtf,
    `phone→${phone}, desktop→${desk}, override→${forced}`
  );
}

// -----------------------------------------------------------------------------
// 9. Render farm job dispatch
// -----------------------------------------------------------------------------
{
  const jobs = planClashLayers({
    outcome: 'WIN',
    winnerMove: 0,
    isMatchPoint: false,
    variant: 2,
    playerMat: 'living_skin',
    npcMat: 'karakuri_bronze',
    tableMat: 'chabudai_oak',
    quality: 'lite',
    sampleRate: SR,
    seedBase: 777,
  });
  const kinds = new Set(jobs.map((j) => j.job.kind));
  let allFinite = true;
  let deterministic = true;
  const t0 = performance.now();
  for (const j of jobs) {
    const a = runRenderJob(j.job);
    const b = runRenderJob(j.job);
    for (let i = 0; i < a.left.length; i += 97) {
      if (!Number.isFinite(a.left[i])) allFinite = false;
      if (a.left[i] !== b.left[i]) deterministic = false;
    }
  }
  const ms = performance.now() - t0;
  const coverage = CLASH_LAYER_KINDS.every((kind) => {
    const job: RenderJob = { kind, sampleRate: SR, quality: 'lite', seed: 5, args: [] };
    try {
      const r = runRenderJob(job);
      return r.left.length > 0;
    } catch {
      return false;
    }
  });
  check(
    'Render-farm clash plan is deterministic, finite, and every timing-critical synth is dispatchable off-thread',
    allFinite && deterministic && coverage && kinds.has('dual_clash') && kinds.has('rin'),
    `${jobs.length} layers for WIN/Rock (${[...kinds].join(', ')}), ${CLASH_LAYER_KINDS.length} kinds covered, 2× render ${ms.toFixed(0)} ms`
  );
}

// -----------------------------------------------------------------------------
// 10. Voice manager + governor
// -----------------------------------------------------------------------------
{
  const stopped: string[] = [];
  const vm = new VoicePriorityManager(4);
  const mk = (id: string, prio: number, t: number) => vm.allocate({ id, priority: prio, startedAt: t, stop: () => stopped.push(id) });
  mk('amb1', 0, 0);
  mk('foley', 1, 1);
  mk('amb2', 0, 2);
  mk('beat', 2, 3);
  const r1 = mk('clash', 3, 4); // must steal oldest lowest priority = amb1
  const r2 = mk('amb3', 0, 5); // must steal amb2 (lowest/oldest) — equal priority allowed only if oldest is ambient
  const r3 = mk('ui', 1, 6); // steals foley? priorities: amb3(0) lowest -> steals amb3
  // Fill with critical voices then try a low-priority one: must be rejected
  const vm2 = new VoicePriorityManager(2);
  vm2.allocate({ id: 'c1', priority: 3, startedAt: 0, stop: () => stopped.push('c1') });
  vm2.allocate({ id: 'c2', priority: 3, startedAt: 1, stop: () => stopped.push('c2') });
  const rejected = !vm2.allocate({ id: 'amb', priority: 0, startedAt: 2, stop: () => undefined });
  check(
    'Priority voice manager steals the oldest lowest-priority voice (click-free fade) and protects critical voices',
    r1 && r2 && r3 && stopped[0] === 'amb1' && stopped[1] === 'amb2' && stopped[2] === 'amb3' && rejected,
    `stolen order=${stopped.join(' → ')}, low-priority request vs full critical bank rejected=${rejected}`
  );
}
{
  const gov = new SynthesisBudgetGovernor({ budgetMs: 120 });
  const q0 = gov.effectiveQuality('ultra');
  for (let i = 0; i < 6; i++) gov.report('ultra', 380); // slow phone
  const q1 = gov.effectiveQuality('ultra');
  for (let i = 0; i < 6; i++) gov.report(q1, 260);
  const q2 = gov.effectiveQuality('ultra');
  for (let i = 0; i < 30; i++) gov.report(q2, 12); // device became fast (e.g. warmed JIT)
  const q3 = gov.effectiveQuality('ultra');
  check(
    'Synthesis budget governor adapts quality to the device (ultra → pro → lite on slow phones, back up when fast)',
    q0 === 'ultra' && q1 === 'pro' && q2 === 'lite' && q3 !== 'lite',
    `${q0} → ${q1} → ${q2} → ${q3}`
  );
}

console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) (globalThis as { process?: { exit: (code: number) => void } }).process?.exit(1);
