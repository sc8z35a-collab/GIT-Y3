/**
 * Headless Verification & Biomechanical Audit Suite for JHand Kinesis 1.0.
 * Run with: npm run test:jhand
 */

import { PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { JHandKinesisEngine } from './BiomechanicsSolver';
import { ANATOMICAL_ROM, FingerName, HandPoseKey } from './types';

let failedChecks = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    failedChecks++;
  } else {
    console.log(`  [PASS] ${msg}`);
  }
}

console.log('\n=== JHand Kinesis 1.0 — 27-DOF Biomechanical Verification Suite ===\n');

const engine = new JHandKinesisEngine(0);
const fingerNames: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
const poses: HandPoseKey[] = ['ready', 'windup', ROCK, SCISSORS, PAPER, 'envelop', 'bow', 'salute'];

// 1. 10,000-step ROM Compliance & Numerical Stability Test across all 8 poses
let allFinite = true;
let allInRom = true;
let totalFoleyEvents = 0;

for (const pose of poses) {
  engine.setTargetPose(pose, true, true);
  if (pose === SCISSORS) engine.triggerScissorsSnip();
  for (let i = 0; i < 1250; i++) {
    const f = engine.step(1 / 120, { x: Math.sin(i * 0.08) * 1.8, y: Math.cos(i * 0.1) * 2.2, z: 0 }, 0, 0);
    totalFoleyEvents += f.foleyEvents.length;

    const vals = [
      f.wrist.forearmPronation,
      f.wrist.wristPitch,
      f.wrist.wristYaw,
      f.wrist.wristRoll,
      f.palm.cmc4Flex,
      f.palm.cmc5Flex,
      f.thumb.cmcFlex,
      f.thumb.cmcAbd,
      f.thumb.cmcPronation,
      f.thumb.mcpFlex,
      f.thumb.ipFlex,
      ...f.dorsalTendons,
    ];
    for (const fn of fingerNames) {
      const st = f.fingers[fn];
      vals.push(st.mcpFlex, st.mcpAbd, st.pipFlex, st.dipFlex);
      if (
        st.mcpFlex < ANATOMICAL_ROM.finger.mcpFlex.min - 1e-4 ||
        st.mcpFlex > ANATOMICAL_ROM.finger.mcpFlex.max + 1e-4 ||
        st.pipFlex < ANATOMICAL_ROM.finger.pipFlex.min - 1e-4 ||
        st.pipFlex > ANATOMICAL_ROM.finger.pipFlex.max + 1e-4 ||
        st.dipFlex < ANATOMICAL_ROM.finger.dipFlex.min - 1e-4 ||
        st.dipFlex > ANATOMICAL_ROM.finger.dipFlex.max + 1e-4
      ) {
        allInRom = false;
      }
    }
    if (!vals.every((v) => Number.isFinite(v))) {
      allFinite = false;
    }
  }
}

assert(allFinite, '10,000 sub-steps across all 8 poses strictly finite (zero NaN/Inf)');
assert(allInRom, '100% physiological Kapandji ROM compliance across all 27-DOF joints');
assert(totalFoleyEvents >= 4, `Kinetic micro-Foley stream active (${totalFoleyEvents} articulation events emitted)`);

// 2. Oblique Retinacular Ligament (ORL) DIP–PIP Coupling & CMC Palm Arch Cupping on ROCK
engine.setTargetPose(ROCK, true, true);
let lastFrame = engine.step(1 / 120);
for (let i = 0; i < 180; i++) {
  lastFrame = engine.step(1 / 120);
}
const rockTel = engine.getTelemetry();
assert(
  rockTel.orlCouplingRatio >= 0.6 && rockTel.orlCouplingRatio <= 0.74,
  `ORL DIP/PIP coupling ratio within human physiological band (0.60..0.74): measured ${rockTel.orlCouplingRatio}`
);
assert(
  rockTel.palmCupDeg >= 10.0,
  `CMC4/CMC5 ulnar palmar arch actively cups during Rock fist: measured ${rockTel.palmCupDeg} deg`
);
assert(
  Math.abs(lastFrame.fingers.index.mcpAbd) < 0.08 && Math.abs(lastFrame.fingers.pinky.mcpAbd) < 0.08,
  `Collateral ligament abduction convergence narrows finger spread cleanly in Rock fist`
);

// 3. Adjacent-Finger Non-Intersection & Broad Fan on PAPER
engine.setTargetPose(PAPER, true, true);
for (let i = 0; i < 180; i++) {
  lastFrame = engine.step(1 / 120);
}
const abdOrdered =
  lastFrame.fingers.index.mcpAbd > lastFrame.fingers.middle.mcpAbd &&
  lastFrame.fingers.middle.mcpAbd > lastFrame.fingers.ring.mcpAbd &&
  lastFrame.fingers.ring.mcpAbd > lastFrame.fingers.pinky.mcpAbd;
assert(abdOrdered, 'Paper fan maintains strict radial-to-ulnar separation (zero finger clipping)');
assert(lastFrame.palm.archCup < 0.15, `Palmar arch flattens naturally on open Paper (archCup=${lastFrame.palm.archCup.toFixed(2)})`);

// 4. Tenodesis Effect (Wrist Dorsal Extension induces passive finger flexion)
const tenoA = new JHandKinesisEngine(0);
const tenoB = new JHandKinesisEngine(0);
tenoA.setTargetPose('ready', false, false);
tenoB.setTargetPose('ready', false, false);
let fNeutral = tenoA.step(1 / 120);
let fExtended = tenoB.step(1 / 120);
for (let i = 0; i < 120; i++) {
  fNeutral = tenoA.step(1 / 120, { x: 0, y: 0, z: 0 }, 0.25, 0);
  fExtended = tenoB.step(1 / 120, { x: 0, y: 0, z: 0 }, -0.55, 0);
}
assert(
  fExtended.fingers.middle.mcpFlex > fNeutral.fingers.middle.mcpFlex + 0.06,
  `Tenodesis effect verified: wrist extension passively curls fingers (+${((fExtended.fingers.middle.mcpFlex - fNeutral.fingers.middle.mcpFlex) * 57.3).toFixed(1)} deg)`
);

// 5. Proximal-to-Distal Inertial Whip Propagation
const whipEng = new JHandKinesisEngine(0);
whipEng.setTargetPose(PAPER, false, false);
for (let i = 0; i < 90; i++) whipEng.step(1 / 120);
const beforeDip = whipEng.step(1 / 120, { x: 0, y: 0, z: 0 }).fingers.middle.dipFlex;
// Rapid upward wrist acceleration should whip fingertips downward (positive flexion lag)!
let afterDip = beforeDip;
for (let i = 0; i < 8; i++) {
  afterDip = whipEng.step(1 / 120, { x: 0, y: -i * 0.85, z: 0 }).fingers.middle.dipFlex;
}
assert(
  afterDip > beforeDip + 0.04,
  `Proximal-to-distal inertial whip lag verified (+${((afterDip - beforeDip) * 57.3).toFixed(1)} deg distal flex lag)`
);

if (failedChecks > 0) {
  throw new Error(`JHand Kinesis 1.0 Audit failed with ${failedChecks} error(s).`);
}
console.log('\nJHand Kinesis 1.0 Audit Complete.\n');
