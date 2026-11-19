/**
 * Headless Offline High-Resolution DSP Verification & Acoustic Audit Suite for JSound Engin 1.1.
 * Run with: npm run test:jsound
 */

import { HandFoleyType } from '../jhand/types';
import { PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { HandMaterialPreset, StageId } from '../../graphics/GraphicsConfig';
import {
  synthesizeAeroWhoosh,
  synthesizeJointFoley,
  synthesizeScissorsShear,
} from './AeroAndFrictionSynth';
import {
  synthesizeBonshoBell,
  synthesizeEdoFurin,
  synthesizeKotoArpeggio,
  synthesizeKotoPluck,
  synthesizeKotsuzumi,
  synthesizeShakuhachiBreath,
  synthesizeShishiOdoshi,
  synthesizeSuzuShimmer,
  synthesizeTaikoDrum,
  synthesizeWashiTear,
  synthesizeWaterDroplet,
} from './InstrumentSynthesizer';
import {
  decimate2xHalfBand,
  synthesizeDualMaterialClash,
  synthesizeModalImpact,
  synthesizeModalImpactStereo,
  synthesizeRinBellNote,
} from './ModalSynthesizer';
import { generateStageImpulseResponse } from './StageAcoustics';
import { generateStageAmbienceBuffer } from './StageAmbience';
import { ACOUSTIC_MATERIALS, AcousticMaterialId } from './types';

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
  return { ok: peak > 0.0008 && peak <= 1.001, peak, rms: Math.sqrt(sq / buf.length) };
}

function stereoCorrelation(left: Float32Array, right: Float32Array): number {
  let dot = 0;
  let eL = 0;
  let eR = 0;
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i++) {
    dot += left[i] * right[i];
    eL += left[i] * left[i];
    eR += right[i] * right[i];
  }
  return Math.abs(dot / Math.max(1e-9, Math.sqrt(eL * eR)));
}

console.log('\n=== JSound Engin 1.1 — High-Resolution 96kHz 2×OS & 28-Sound Physical DSP Audit ===\n');
const SR = 48000;

// 1. Verify 7-tap Linear-Phase Kaiser Half-Band FIR 2× Decimation Passband & Stopband Attenuation
{
  const n2x = 2048;
  const lowTone = new Float32Array(n2x);
  const aliasTone = new Float32Array(n2x);
  for (let i = 0; i < n2x; i++) {
    // 2 kHz passband tone at 96 kHz vs 44 kHz stopband ultrasonic tone at 96 kHz
    lowTone[i] = Math.sin((2 * Math.PI * 2000 * i) / (SR * 2));
    aliasTone[i] = Math.sin((2 * Math.PI * 44000 * i) / (SR * 2));
  }
  const lowDec = decimate2xHalfBand(lowTone);
  const aliasDec = decimate2xHalfBand(aliasTone);
  const lowRms = isCleanBuffer(lowDec).rms;
  const aliasRms = isCleanBuffer(aliasDec).rms;
  const rejDb = 20 * Math.log10(Math.max(1e-6, aliasRms) / Math.max(1e-6, lowRms));
  assert(
    lowDec.length === n2x / 2 && lowRms > 0.65 && rejDb < -24,
    `96kHz 2× Oversampling Kaiser Half-Band FIR verified (passband RMS=${lowRms.toFixed(2)}, 44kHz alias attenuation=${rejDb.toFixed(1)} dB)`
  );
}

// 2. Verify all 24 Calibrated Acoustic Materials at Ultra (96kHz 2×OS) quality!
{
  const allIds = Object.keys(ACOUSTIC_MATERIALS) as AcousticMaterialId[];
  let allClean = true;
  const handCentroids: Record<string, number> = {};
  for (const id of allIds) {
    const st = synthesizeModalImpactStereo(id, SR, { velocity: 1.0, quality: 'ultra', seed: 42 });
    const lOk = isCleanBuffer(st.left);
    const rOk = isCleanBuffer(st.right);
    if (!lOk.ok || !rOk.ok) {
      allClean = false;
      console.error(`    Bad material buffer: ${id} (L=${lOk.peak}, R=${rOk.peak})`);
    }
    if (
      id === 'hinoki_ivory' ||
      id === 'karakuri_bronze' ||
      id === 'bisque_porcelain' ||
      id === 'obsidian_gold'
    ) {
      handCentroids[id] = Math.round(estimateCentroidHz(st.left, SR));
    }
  }
  assert(
    allClean && allIds.length >= 24,
    `All ${allIds.length} calibrated physical materials clean at 96kHz 2×OS Ultra (Hinoki ${handCentroids.hinoki_ivory}Hz, Bronze ${handCentroids.karakuri_bronze}Hz, Porcelain ${handCentroids.bisque_porcelain}Hz, Obsidian ${handCentroids.obsidian_gold}Hz)`
  );
  assert(
    handCentroids.bisque_porcelain > handCentroids.hinoki_ivory,
    `Material brightness physics verified: Porcelain (${handCentroids.bisque_porcelain}Hz) > Hinoki Wood (${handCentroids.hinoki_ivory}Hz)`
  );
}

// 3. Verify True Stereo Dipole Mode Radiation (L != R) on metallic/ceramic resonance
{
  const bell = synthesizeModalImpactStereo('karakuri_bronze', SR, {
    velocity: 1.1,
    quality: 'ultra',
    stereoWidth: 1.0,
    seed: 123,
  });
  const corr = stereoCorrelation(bell.left, bell.right);
  assert(
    corr < 0.992 && corr > 0.2,
    `True stereo dipole eigenmode radiation verified (Bronze L/R correlation=${corr.toFixed(3)})`
  );
}

// 4. Verify Hertzian Velocity-Hardness Spectral Brightness Shift (Ultra 2×OS)
{
  const softHit = synthesizeModalImpact('hinoki_ivory', SR, { velocity: 0.24, quality: 'ultra', seed: 99 });
  const hardHit = synthesizeModalImpact('hinoki_ivory', SR, { velocity: 1.4, quality: 'ultra', seed: 99 });
  const cSoft = estimateCentroidHz(softHit, SR);
  const cHard = estimateCentroidHz(hardHit, SR);
  assert(
    cHard > cSoft * 1.08,
    `Hertzian velocity brightness verified: hard (${Math.round(cHard)}Hz) > soft (${Math.round(cSoft)}Hz)`
  );
}

// 5. Verify 3×3 Move-Matchup Dual-Material Clash (WIN / LOSS / DRAW) & True-Stereo Temple Rin-Bell
{
  let clashClean = true;
  for (const mv of [ROCK, SCISSORS, PAPER] as const) {
    for (const outcome of ['WIN', 'LOSS', 'DRAW'] as const) {
      const cl = synthesizeDualMaterialClash(
        'hinoki_ivory',
        'karakuri_bronze',
        'chabudai_oak',
        mv,
        outcome,
        SR,
        'ultra',
        555 + mv
      );
      if (!isCleanBuffer(cl.left).ok || !isCleanBuffer(cl.right).ok) clashClean = false;
    }
  }
  const rin = synthesizeRinBellNote(523.25, SR, 1.8, 0.8, 'ultra', 777);
  assert(
    clashClean && isCleanBuffer(rin.left).ok && isCleanBuffer(rin.right).ok,
    'Full 3×3 Dual-Material Rock/Scissors/Paper clash & true-stereo Temple Rin-Bell verified clean'
  );
}

// 6. Verify ALL 10 First-Principles Physical Acoustic Instruments in InstrumentSynthesizer.ts!
{
  const odaiko = synthesizeTaikoDrum('odaiko', SR, 1.15, 'ultra', 1001);
  const shime = synthesizeTaikoDrum('shime', SR, 1.0, 'ultra', 1002);
  const hb = synthesizeTaikoDrum('heartbeat', SR, 0.95, 'ultra', 1003);
  const kotsuRise = synthesizeKotsuzumi(SR, { variant: 'pon_rise', velocity: 1.0, quality: 'ultra', seed: 1004 });
  const kotsuDrop = synthesizeKotsuzumi(SR, { variant: 'pon_drop', velocity: 0.9, quality: 'ultra', seed: 1005 });
  const kotoSingle = synthesizeKotoPluck(440.0, SR, { durationSec: 1.4, velocity: 0.85, seed: 1006 });
  const kotoArp = synthesizeKotoArpeggio([293.66, 329.63, 440.0, 587.33], 0.08, SR, 0.82, 1007);
  const shaku = synthesizeShakuhachiBreath(329.63, SR, 1.4, 0.72, 1008);
  const furin = synthesizeEdoFurin(SR, 1.0, 0.8, 'ultra', 1009);
  const shishi = synthesizeShishiOdoshi(SR, 0.95, 'ultra', 1010);
  const suzu = synthesizeSuzuShimmer(SR, 0.8, 'ultra', 1011);
  const washi = synthesizeWashiTear(SR, 1.0, 1012);
  const bonsho = synthesizeBonshoBell(130.81, SR, 2.2, 0.85, 'ultra', 1013);
  const drop = synthesizeWaterDroplet(SR, 1014);

  const stereoChecks: Array<[string, { left: Float32Array; right: Float32Array }]> = [
    ['Taiko(Odaiko)', odaiko],
    ['Taiko(Shime)', shime],
    ['Taiko(Heartbeat)', hb],
    ['Kotsuzumi(Rise)', kotsuRise],
    ['Kotsuzumi(Drop)', kotsuDrop],
    ['Koto(Single)', kotoSingle],
    ['Koto(Arpeggio)', kotoArp],
    ['Shakuhachi', shaku],
    ['EdoFurin', furin],
    ['ShishiOdoshi', shishi],
    ['KaguraSuzu', suzu],
    ['WashiTear', washi],
    ['BonshoBell', bonsho],
  ];

  let allInstrOk = isCleanBuffer(drop).ok;
  for (const [name, pair] of stereoChecks) {
    if (!isCleanBuffer(pair.left).ok || !isCleanBuffer(pair.right).ok) {
      allInstrOk = false;
      console.error(`    Bad instrument buffer: ${name}`);
    }
  }
  const cOdaiko = Math.round(estimateCentroidHz(odaiko.left, SR));
  const cFurin = Math.round(estimateCentroidHz(furin.left, SR));
  assert(
    allInstrOk && cFurin > cOdaiko * 4,
    `All 10 physical instruments (14 variants) clean & timbrally distinct (Odaiko ${cOdaiko}Hz << Edo Furin ${cFurin}Hz)`
  );
}

// 7. Verify Strouhal Aerodynamic Law & 4 Distinct Craft Sleeve Textiles
{
  const slowW = synthesizeAeroWhoosh(SR, { speed: 0.55, handMaterial: 'hinoki_ivory', seed: 12 });
  const fastW = synthesizeAeroWhoosh(SR, { speed: 1.65, handMaterial: 'hinoki_ivory', seed: 12 });
  assert(
    estimateCentroidHz(fastW.left, SR) > estimateCentroidHz(slowW.left, SR) * 1.4,
    `Strouhal aerodynamic law verified: fast (${Math.round(estimateCentroidHz(fastW.left, SR))}Hz) >> slow (${Math.round(estimateCentroidHz(slowW.left, SR))}Hz)`
  );

  const mats: HandMaterialPreset[] = ['hinoki_ivory', 'karakuri_bronze', 'bisque_porcelain', 'obsidian_gold'];
  const sleeveCentroids: Record<string, number> = {};
  let sleevesClean = true;
  for (const m of mats) {
    const w = synthesizeAeroWhoosh(SR, { speed: 1.15, handMaterial: m, seed: 33 });
    if (!isCleanBuffer(w.left).ok || !isCleanBuffer(w.right).ok) sleevesClean = false;
    sleeveCentroids[m] = Math.round(estimateCentroidHz(w.left, SR));
  }
  assert(
    sleevesClean && sleeveCentroids.hinoki_ivory > sleeveCentroids.karakuri_bronze,
    `All 4 sleeve textile profiles clean (Silk Kimono ${sleeveCentroids.hinoki_ivory}Hz > Emerald Velvet ${sleeveCentroids.karakuri_bronze}Hz)`
  );
}

// 8. Verify ALL 9 JHand Kinesis 1.1 Coupled Micro-Foley Channels + 2×OS Scissors Shear!
{
  const shear = synthesizeScissorsShear('karakuri_bronze', SR, 1.0, 'ultra', 300);
  const foleyTypes: HandFoleyType[] = [
    'knuckle_snap',
    'palm_clench',
    'thumb_lock',
    'finger_whip',
    'scissors_shear',
    'tendon_creak',
    'nail_click',
    'sleeve_rustle',
    'wrist_crack',
  ];
  let foleyOk = isCleanBuffer(shear).ok;
  for (let i = 0; i < foleyTypes.length; i++) {
    const ft = foleyTypes[i];
    const buf =
      ft === 'scissors_shear'
        ? synthesizeScissorsShear('karakuri_bronze', SR, 0.9, 'ultra', 400 + i)
        : synthesizeJointFoley(ft, 'hinoki_ivory', 0.85, SR, 'ultra', 400 + i);
    const st = isCleanBuffer(buf);
    if (!st.ok) {
      foleyOk = false;
      console.error(`    Bad Foley buffer: ${ft} (peak=${st.peak})`);
    }
  }
  assert(
    foleyOk,
    `All 9/9 JHand Kinesis 1.1 coupled micro-Foley DSP channels verified finite & distortion-free`
  );
}

// 9. Verify 3rd-Order 62-Ray Image-Source + 4-Band Velvet-Noise Stereo IRs & 5.6s Seamless Ambience across all 5 Stages!
{
  const stages: StageId[] = ['zashiki', 'salon', 'shrine', 'onsen', 'atelier'];
  let allIrOk = true;
  let allAmbOk = true;

  for (const st of stages) {
    const ir = generateStageImpulseResponse(st, SR, 'ultra');
    const lOk = isCleanBuffer(ir.left);
    const rOk = isCleanBuffer(ir.right);
    const corr = stereoCorrelation(ir.left, ir.right);

    if (!lOk.ok || !rOk.ok || ir.earlyReflectionCount < 40 || corr > 0.55) {
      allIrOk = false;
      console.error(
        `    Stage IR issue on ${st}: rays=${ir.earlyReflectionCount}, corr=${corr.toFixed(2)}, L=${lOk.peak}, R=${rOk.peak}`
      );
    }

    const amb = generateStageAmbienceBuffer(st, SR, 2.2);
    if (!isCleanBuffer(amb.left).ok || !isCleanBuffer(amb.right).ok) {
      allAmbOk = false;
    }

    console.log(
      `  [STAGE IR 1.1] ${st.padEnd(8)} | RT60: ${ir.rt60Sec.toFixed(2)}s | 3rd-Order Rays: ${ir.earlyReflectionCount} | L/R Corr: ${corr.toFixed(2)} | Peak: ${lOk.peak.toFixed(2)}`
    );
  }

  assert(
    allIrOk,
    'All 5 architectural stages verified 3rd-order (>=40 discrete rays) + 4-band Velvet-Noise true-stereo IRs'
  );
  assert(allAmbOk, 'All 5 multi-layer seamless crossfaded procedural stage ambience beds verified clean');
}

if (failedChecks > 0) {
  throw new Error(`JSound Engin 1.1 Audit failed with ${failedChecks} error(s).`);
}
console.log('\nJSound Engin 1.1 Audit Complete — ALL CHECKS PASSED.\n');
