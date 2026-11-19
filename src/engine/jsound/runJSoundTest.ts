/**
 * Headless Offline DSP Verification & Acoustic Audit Suite for JSound Engin 1.0.
 * Run with: npm run test:jsound
 */

import { PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { HandMaterialPreset, StageId } from '../../graphics/GraphicsConfig';
import {
  synthesizeAeroWhoosh,
  synthesizeJointFoley,
  synthesizeScissorsShear,
} from './AeroAndFrictionSynth';
import {
  synthesizeDualMaterialClash,
  synthesizeModalImpact,
  synthesizeRinBellNote,
} from './ModalSynthesizer';
import { generateStageImpulseResponse } from './StageAcoustics';
import { generateStageAmbienceBuffer } from './StageAmbience';

let failedChecks = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    failedChecks++;
  } else {
    console.log(`  [PASS] ${msg}`);
  }
}

/** Measure approximate zero-crossing spectral centroid (Hz) as a physical brightness gauge */
function estimateCentroidHz(buf: Float32Array, sr: number): number {
  let crossings = 0;
  let energy = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] <= 0 && buf[i] > 0) || (buf[i - 1] >= 0 && buf[i] < 0)) {
      crossings++;
    }
    energy += buf[i] * buf[i];
  }
  if (energy < 1e-9) return 0;
  return (crossings * sr) / (2 * buf.length);
}

function isCleanBuffer(buf: Float32Array): { ok: boolean; peak: number; rms: number } {
  let peak = 0;
  let sq = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    if (!Number.isFinite(v)) return { ok: false, peak: NaN, rms: NaN };
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sq += v * v;
  }
  return { ok: peak > 0.001 && peak <= 1.001, peak, rms: Math.sqrt(sq / buf.length) };
}

console.log('\n=== JSound Engin 1.0 — Physical Acoustics & Spatial DSP Audit ===\n');
const SR = 48000;

// 1. Verify Modal Synthesis across all 4 craft hand materials + hardness/velocity physics!
const mats: HandMaterialPreset[] = ['hinoki_ivory', 'karakuri_bronze', 'bisque_porcelain', 'obsidian_gold'];
let allMatsClean = true;
const matCentroids: Record<string, number> = {};

for (const mat of mats) {
  const buf = synthesizeModalImpact(mat, SR, { velocity: 1.0, quality: 'pro', seed: 42 });
  const stat = isCleanBuffer(buf);
  if (!stat.ok) allMatsClean = false;
  matCentroids[mat] = Math.round(estimateCentroidHz(buf, SR));
}
assert(
  allMatsClean,
  `All 4 hand material modal models finite & peak-safe (centroids: Hinoki ${matCentroids.hinoki_ivory}Hz, Bronze ${matCentroids.karakuri_bronze}Hz, Porcelain ${matCentroids.bisque_porcelain}Hz, Obsidian ${matCentroids.obsidian_gold}Hz)`
);
assert(
  matCentroids.bisque_porcelain > matCentroids.hinoki_ivory,
  `Physical material brightness ordering verified: Porcelain (${matCentroids.bisque_porcelain}Hz) brighter than Hinoki wood (${matCentroids.hinoki_ivory}Hz)`
);

// 2. Verify Hertzian Velocity-Hardness Spectral Brightness Shift
const softHit = synthesizeModalImpact('hinoki_ivory', SR, { velocity: 0.25, quality: 'pro', seed: 99 });
const hardHit = synthesizeModalImpact('hinoki_ivory', SR, { velocity: 1.4, quality: 'pro', seed: 99 });
const cSoft = estimateCentroidHz(softHit, SR);
const cHard = estimateCentroidHz(hardHit, SR);
assert(
  cHard > cSoft * 1.08,
  `Hertzian velocity brightness verified: hard hit (${Math.round(cHard)}Hz) brighter than soft hit (${Math.round(cSoft)}Hz)`
);

// 3. Verify Dual-Material Clash & Temple Rin-Bell Synthesis
let clashClean = true;
for (const mv of [ROCK, SCISSORS, PAPER] as const) {
  const cl = synthesizeDualMaterialClash('hinoki_ivory', 'karakuri_bronze', 'chabudai_oak', mv, 'WIN', SR, 'pro', 555);
  if (!isCleanBuffer(cl.left).ok || !isCleanBuffer(cl.right).ok) clashClean = false;
}
const rin = synthesizeRinBellNote(523.25, SR, 1.8, 0.8, 'pro', 777);
assert(clashClean && isCleanBuffer(rin).ok, 'Dual-material Rock/Scissors/Paper clash & Temple Rin-Bell buffers clean & distortion-free');

// 4. Verify Strouhal Aerodynamic Whoosh Velocity Pitch Law + Scissors Shear + Joint Foley
const slowW = synthesizeAeroWhoosh(SR, { speed: 0.55, seed: 12 });
const fastW = synthesizeAeroWhoosh(SR, { speed: 1.65, seed: 12 });
assert(
  estimateCentroidHz(fastW.left, SR) > estimateCentroidHz(slowW.left, SR) * 1.4,
  `Strouhal aerodynamic law verified: fast swing (${Math.round(estimateCentroidHz(fastW.left, SR))}Hz) >> slow swing (${Math.round(estimateCentroidHz(slowW.left, SR))}Hz)`
);
const shear = synthesizeScissorsShear('karakuri_bronze', SR, 1.0, 'pro', 300);
const knuckle = synthesizeJointFoley('knuckle_snap', 'hinoki_ivory', 0.8, SR, 'pro', 301);
assert(
  isCleanBuffer(shear).ok && isCleanBuffer(knuckle).ok,
  'Stick-slip Scissors shear & JHand-coupled micro-joint Foley buffers verified clean'
);

// 5. Verify 3D Image-Source Ray-Traced Stage IRs & Seamless Ambience across all 5 architectural stages!
const stages: StageId[] = ['zashiki', 'salon', 'shrine', 'onsen', 'atelier'];
let allIrOk = true;
let allAmbOk = true;
for (const st of stages) {
  const ir = generateStageImpulseResponse(st, SR, 'pro');
  const lOk = isCleanBuffer(ir.left);
  const rOk = isCleanBuffer(ir.right);
  // Check stereo decorrelation (L/R correlation < 0.55 confirms spacious true stereo!)
  let dot = 0, eL = 0, eR = 0;
  for (let i = 0; i < ir.left.length; i++) {
    dot += ir.left[i] * ir.right[i];
    eL += ir.left[i] * ir.left[i];
    eR += ir.right[i] * ir.right[i];
  }
  const corr = Math.abs(dot / Math.max(1e-9, Math.sqrt(eL * eR)));
  if (!lOk.ok || !rOk.ok || ir.earlyReflectionCount < 12 || corr > 0.55) {
    allIrOk = false;
  }
  const amb = generateStageAmbienceBuffer(st, SR, 1.5);
  if (!isCleanBuffer(amb.left).ok || !isCleanBuffer(amb.right).ok) {
    allAmbOk = false;
  }
  console.log(
    `  [STAGE IR] ${st.padEnd(8)} | RT60: ${ir.rt60Sec.toFixed(2)}s | Early: ${ir.earlyReflectionCount} rays | L/R Corr: ${corr.toFixed(2)} | Peak: ${lOk.peak.toFixed(2)}`
  );
}
assert(allIrOk, 'All 5 architectural stage Image-Source + Velvet-Noise stereo IRs verified true-stereo & finite');
assert(allAmbOk, 'All 5 seamless crossfaded procedural stage ambience beds verified clean');

if (failedChecks > 0) {
  throw new Error(`JSound Engin 1.0 Audit failed with ${failedChecks} error(s).`);
}
console.log('\nJSound Engin 1.0 Audit Complete.\n');
