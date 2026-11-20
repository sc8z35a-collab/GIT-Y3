/**
 * Automated Mathematical & Geometric Audit Suite for Hand Fine-Detail Breakthroughs:
 *  1. DERMA-TENSOR 1.0 (Subcutaneous 3D Dorsal Tendon/Venous Vertex Field + Langer-Line Counter-Phase Strain)
 *  2. CHROMA-DERM & KERATIN OPTICS 1.0 (3-Band Spectral Skin Diffusion, Dual-Lobe GGX, 3D Backlit Vellus Hair, Hydraulic Nail Capillary Refill)
 */

import * as THREE from 'three';
import { JHandKinesisEngine } from '../jhand/BiomechanicsSolver';
import { PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { createFingerS1SculptedPalmGeo } from '../../graphics/FingerS1Engine';
import {
  SculptedPalmSubcutaneousField,
  evaluateDermaTensorState,
  evaluateSubcutaneousDisplacementAt,
} from './DermaTensorEngine';
import {
  NailPressureRefillSolver,
  createVellusHairInstancedField,
  evaluateSpectralDermalBRDF,
} from './ChromaDermOptics';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function solvePose(pose: typeof ROCK | typeof SCISSORS | typeof PAPER) {
  const engine = new JHandKinesisEngine(0);
  engine.setTargetPose(pose, true, false);
  let frame = engine.step(1 / 120);
  for (let i = 0; i < 140; i++) {
    frame = engine.step(1 / 120);
  }
  return frame;
}

console.log('\n=== HAND FINE-DETAIL BREAKTHROUGHS MATHEMATICAL AUDIT ===\n');

// =============================================================================
// 1. DERMA-TENSOR 1.0 AUDIT
// =============================================================================
console.log('1. DERMA-TENSOR 1.0 (Subcutaneous 3D Tendon/Venous Field & Langer-Line Strain Tensor)');

const rockFrame = solvePose(ROCK);
const scissorsFrame = solvePose(SCISSORS);
const paperFrame = solvePose(PAPER);

const rockDerma = evaluateDermaTensorState(rockFrame, 0.5, 0.92);
const scissorsDerma = evaluateDermaTensorState(scissorsFrame, 0.4, 0.45);
const paperDerma = evaluateDermaTensorState(paperFrame, 0.35, 0.05);

// 1A. Scissors selective EDC tendon activation (index + middle extended vs ring + pinky flexed!)
const scExtMean = (scissorsDerma.edcTensions[0] + scissorsDerma.edcTensions[1]) * 0.5;
const scFlexMean = (scissorsDerma.edcTensions[2] + scissorsDerma.edcTensions[3]) * 0.5;
assert(
  scExtMean > scFlexMean + 0.25,
  'Scissors selective EDC tendon relief (index/mid >> ring/pinky)',
  `ext=${scExtMean.toFixed(3)} vs flex=${scFlexMean.toFixed(3)}, status="${scissorsDerma.statusJp}"`
);

// 1B. Paper full 4-EDC + EPL snuffbox activation
const paperEdcMin = Math.min(...paperDerma.edcTensions);
assert(
  paperEdcMin > 0.62 && paperDerma.peakTendonLiftMm >= 3.5,
  'Paper activates all 4 dorsal EDC tendons & prominent anatomical lift',
  `minEDC=${paperEdcMin.toFixed(3)}, EPL=${paperDerma.eplTension.toFixed(3)}, peakLift=${paperDerma.peakTendonLiftMm}mm`
);

// 1C. Langer-Line counter-phase dorsal vs. volar wrinkle law (Rock vs Paper!)
assert(
  rockDerma.dorsalWrinkleDepth < paperDerma.dorsalWrinkleDepth - 0.35,
  'Langer-Line dorsal skin pulls taut/flat on Rock clench vs deep folds on Paper',
  `Rock=${rockDerma.dorsalWrinkleDepth} < Paper=${paperDerma.dorsalWrinkleDepth}`
);
assert(
  rockDerma.volarCreaseDepth > paperDerma.volarCreaseDepth + 0.35,
  'Langer-Line counter-phase volar creases deepen on Rock clench vs flat on Paper',
  `Rock=${rockDerma.volarCreaseDepth} > Paper=${paperDerma.volarCreaseDepth}`
);
assert(
  rockDerma.skinRoughnessShift < paperDerma.skinRoughnessShift - 0.08,
  'Collagen alignment makes taut fist dorsal skin sleeker than bunched matte skin',
  `Rock shift=${rockDerma.skinRoughnessShift} < Paper shift=${paperDerma.skinRoughnessShift}`
);

// 1D. Subcutaneous displacement zero volar leakage & Scissors spatial selectivity
const volarLeak = evaluateSubcutaneousDisplacementAt(0.25, -0.45, 0.25, 1, paperDerma);
assert(volarLeak === 0, 'Zero subcutaneous extensor leakage onto volar palm (uy <= 0.08)', `volarLift=${volarLeak}`);

const scIndexCord = evaluateSubcutaneousDisplacementAt(0.42, 0.85, 0.35, 1, scissorsDerma);
const scPinkyCord = evaluateSubcutaneousDisplacementAt(-0.44, 0.85, 0.35, 1, scissorsDerma);
assert(
  scIndexCord > scPinkyCord * 2.0 && scIndexCord > 0.0022,
  '3D dorsal vertex field selectively raises index EDC cord over flexed pinky cord in Scissors',
  `indexLift=${(scIndexCord * 1000).toFixed(2)}mm vs pinkyLift=${(scPinkyCord * 1000).toFixed(2)}mm`
);

// 1E. Live 3D BufferGeometry SculptedPalmSubcutaneousField mutation & clean toggle-OFF restoration
const palmGeo = createFingerS1SculptedPalmGeo(1);
const posAttr = palmGeo.attributes.position as THREE.BufferAttribute;
const restYCopy = new Float32Array(posAttr.count);
for (let i = 0; i < posAttr.count; i++) restYCopy[i] = posAttr.getY(i);

const palmField = new SculptedPalmSubcutaneousField(palmGeo, 1);
palmField.applyState(paperDerma, true);

let maxDeltaY = 0;
let allFinite = true;
const normAttr = palmGeo.attributes.normal as THREE.BufferAttribute;
for (let i = 0; i < posAttr.count; i++) {
  const y = posAttr.getY(i);
  const nx = normAttr.getX(i);
  const ny = normAttr.getY(i);
  const nz = normAttr.getZ(i);
  if (!Number.isFinite(y) || !Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
    allFinite = false;
  }
  maxDeltaY = Math.max(maxDeltaY, y - restYCopy[i]);
}
assert(
  allFinite && maxDeltaY > 0.0025 && maxDeltaY < 0.015,
  'Live 3D palm vertex deformation produces finite anatomical relief (2.5–15mm)',
  `maxDeltaY=${(maxDeltaY * 1000).toFixed(2)}mm`
);

// Toggle OFF must restore exact rest vertex coordinates!
palmField.applyState(paperDerma, false);
let maxRestoreErr = 0;
for (let i = 0; i < posAttr.count; i++) {
  maxRestoreErr = Math.max(maxRestoreErr, Math.abs(posAttr.getY(i) - restYCopy[i]));
}
assert(
  maxRestoreErr < 1e-6,
  'Disabling DERMA-TENSOR cleanly restores rest sculpted palm geometry',
  `maxRestoreErr=${maxRestoreErr.toExponential(2)}`
);

// =============================================================================
// 2. CHROMA-DERM & KERATIN OPTICS 1.0 AUDIT
// =============================================================================
console.log('\n2. CHROMA-DERM & KERATIN OPTICS 1.0 (3-Band Spectral SSS, Dual-Lobe GGX, 3D Vellus Hair, Nail Refill)');

// 2A. 3-Band Wavelength-Dependent Spectral Skin Diffusion ordering across shadow terminator
const termSample = evaluateSpectralDermalBRDF(-0.15, 0.72, 0.65, 0.18, 0.25);
const grazingSample = evaluateSpectralDermalBRDF(0.05, 0.65, 0.7, 0.18, 0.25);
assert(
  termSample.diffuseRgb[0] > termSample.diffuseRgb[1] &&
    termSample.diffuseRgb[1] > termSample.diffuseRgb[2] &&
    termSample.diffuseRgb[0] > 0.25 &&
    termSample.diffuseRgb[2] === 0,
  '3-Band spectral skin diffusion exhibits warm R(650nm)>G(550nm)>B(450nm) terminator phase lag',
  `ndotl=-0.15 -> RGB=[${termSample.diffuseRgb.map((v) => v.toFixed(3)).join(', ')}]`
);
assert(
  grazingSample.diffuseRgb[0] > grazingSample.diffuseRgb[1] &&
    grazingSample.diffuseRgb[1] > grazingSample.diffuseRgb[2],
  '3-Band spectral diffusion preserves monotonic R>G>B wrap across grazing illumination',
  `ndotl=+0.05 -> RGB=[${grazingSample.diffuseRgb.map((v) => v.toFixed(3)).join(', ')}]`
);

// 2B. Dual-Lobe Sebum Lipid + Stratum Corneum Keratin GGX Microfacet Specular BRDF
const specPeakDry = evaluateSpectralDermalBRDF(0.75, 0.75, 0.99, 0.08, 0.2);
const specPeakSweat = evaluateSpectralDermalBRDF(0.75, 0.75, 0.99, 0.85, 0.2);
const specOffPeak = evaluateSpectralDermalBRDF(0.75, 0.75, 0.45, 0.18, 0.2);
assert(
  specPeakDry.totalSpec > specOffPeak.totalSpec * 5.0 &&
    specPeakSweat.sebumSpec > specPeakDry.sebumSpec * 1.6 &&
    Number.isFinite(specPeakSweat.totalSpec),
  'Dual-Lobe Sebum/Keratin GGX BRDF focuses narrow sebum micro-glints & responds to perspiration',
  `drySebum=${specPeakDry.sebumSpec.toFixed(4)}, sweatSebum=${specPeakSweat.sebumSpec.toFixed(4)}, offPeak=${specOffPeak.totalSpec.toFixed(5)}`
);

// 2C. Asymmetric Hydraulic Nail-Bed Capillary Refill ODE Solver (fast blanch vs gradual refill)
const nailSolver = new NailPressureRefillSolver();
for (let i = 0; i < 12; i++) nailSolver.step(1.0, 0.01); // 0.12s press
const afterPress = nailSolver.pressureBlanch;
for (let i = 0; i < 12; i++) nailSolver.step(0.0, 0.01); // 0.12s release
const dropOnRelease = afterPress - nailSolver.pressureBlanch;
for (let i = 0; i < 180; i++) nailSolver.step(0.0, 0.01); // 1.8s full refill
const afterFullRefill = nailSolver.pressureBlanch;

assert(
  afterPress > 0.72 && dropOnRelease < afterPress * 0.42 && afterFullRefill < 0.03,
  'Hydraulic nail-bed capillary refill blanches fast (τ=0.08s) and refills smoothly rosy (τ=0.38s)',
  `0.12s press=${(afterPress * 100).toFixed(1)}%, 0.12s releaseDrop=${(dropOnRelease * 100).toFixed(1)}%, 1.8s recovery=${(afterFullRefill * 100).toFixed(2)}%`
);

// 2D. 3D Backlit Dorsal Vellus Micro-Hair Instanced Field
const vellus = createVellusHairInstancedField(
  palmGeo,
  1,
  new THREE.Vector3(0.45, 0.78, 0.42).normalize(),
  340
);
const m4 = new THREE.Matrix4();
const pTmp = new THREE.Vector3();
let allHairFinite = true;
let allDorsal = true;
let minHairY = Infinity;
for (let k = 0; k < vellus.mesh.count; k++) {
  vellus.mesh.getMatrixAt(k, m4);
  for (let e = 0; e < 16; e++) {
    if (!Number.isFinite(m4.elements[e])) allHairFinite = false;
  }
  pTmp.setFromMatrixPosition(m4);
  minHairY = Math.min(minHairY, pTmp.y);
  if (pTmp.y <= 0.008) allDorsal = false;
}
assert(
  vellus.mesh.count >= 300 && allHairFinite && allDorsal,
  '3D Backlit Vellus Hair InstancedMesh spawns 340 finite dorsal fibers with zero volar leakage',
  `count=${vellus.mesh.count}, drawCalls=1, minY=${(minHairY * 1000).toFixed(2)}mm`
);
vellus.mesh.geometry.dispose();
vellus.material.dispose();

console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) {
  throw new Error(`Hand fine-detail audit failed (${failed} checks failed).`);
}
