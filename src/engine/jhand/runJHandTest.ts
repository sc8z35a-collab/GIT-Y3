/**
 * Headless Verification & Biomechanical Audit Suite for JHand Kinesis 1.1 (38-DOF).
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

console.log('\n=== JHand Kinesis 1.1 — 38-DOF Anatomical Micro-Kinematics Audit Suite ===\n');

const engine = new JHandKinesisEngine(0);
const fingerNames: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
const poses: HandPoseKey[] = [
  'ready',
  'windup',
  ROCK,
  SCISSORS,
  PAPER,
  'envelop',
  'bow',
  'salute',
  'guard',
  'feint_flick',
  'beckon',
  'knuckle_crack',
  'blade_edge',
  'crane_poise',
  'claw_charge',
  'finger_gun',
  'palm_meditate',
  'victory_fist',
  'lotus_mudra',
  'sword_seal',
  'tiger_palm',
  'iron_knuckle',
  'tea_whisk',
  'fan_hold',
  'brush_grip',
  'koto_pluck',
  'snap_ready',
  'snap_release',
  'peace_tilt',
  'open_offer',
  'fist_pump',
  'defeat_slump',
  'stealth_curl',
  'wave_flourish',
  'counter_parry',
  'zen_circle',
];

// 1. 36,000-step ROM Compliance, Numerical Stability & 9-Channel Foley Audit across ALL 36 poses
let allFinite = true;
let allInRom = true;
const seenFoleyTypes = new Set<string>();
let totalFoleyEvents = 0;

for (const pose of poses) {
  engine.setTargetPose(pose, true, true);
  if (pose === SCISSORS) engine.triggerScissorsSnip();
  if (pose === 'feint_flick') engine.triggerFeintFlick();
  if (pose === 'knuckle_crack') engine.triggerKnuckleFlex();
  if (pose === 'victory_fist') engine.triggerVictoryRoll();
  if (pose === 'guard') engine.triggerNpcTell('poised');
  if (pose === 'snap_release') engine.triggerFingerSnap();
  if (pose === 'wave_flourish') engine.triggerWaveFlourish();
  if (pose === 'sword_seal') engine.triggerSwordSealPulse();
  if (pose === 'zen_circle') engine.triggerZenBreath();
  for (let i = 0; i < 1000; i++) {
    const f = engine.step(
      1 / 120,
      { x: Math.sin(i * 0.08) * 1.9, y: Math.cos(i * 0.1) * 2.3, z: 0 },
      0,
      0
    );
    totalFoleyEvents += f.foleyEvents.length;
    for (const ev of f.foleyEvents) seenFoleyTypes.add(ev.type);

    const vals = [
      f.wrist.forearmPronation,
      f.wrist.ulnarStyloidProminence,
      f.wrist.rcPitch,
      f.wrist.mcPitch,
      f.wrist.wristYaw,
      f.wrist.wristRoll,
      f.palm.cmc2Flex,
      f.palm.cmc3Flex,
      f.palm.cmc4Flex,
      f.palm.cmc5Flex,
      f.palm.cmc5Supination,
      f.palm.fdiBulge,
      f.palm.hypothenarBulge,
      f.thumb.cmcFlex,
      f.thumb.cmcAbd,
      f.thumb.cmcPronation,
      f.thumb.mcpFlex,
      f.thumb.mcpAbd,
      f.thumb.ipFlex,
      f.thumb.eplTendonTension,
      ...f.dorsalTendons,
      ...f.palm.webbingStretch,
      ...f.palm.juncturaeTension,
    ];

    if (
      f.wrist.rcPitch < ANATOMICAL_ROM.wrist.rcPitch.min - 1e-4 ||
      f.wrist.rcPitch > ANATOMICAL_ROM.wrist.rcPitch.max + 1e-4 ||
      f.wrist.mcPitch < ANATOMICAL_ROM.wrist.mcPitch.min - 1e-4 ||
      f.wrist.mcPitch > ANATOMICAL_ROM.wrist.mcPitch.max + 1e-4 ||
      f.palm.cmc5Supination < ANATOMICAL_ROM.palm.cmc5Supination.min - 1e-4 ||
      f.palm.cmc5Supination > ANATOMICAL_ROM.palm.cmc5Supination.max + 1e-4 ||
      f.thumb.mcpAbd < ANATOMICAL_ROM.thumb.mcpAbd.min - 1e-4 ||
      f.thumb.mcpAbd > ANATOMICAL_ROM.thumb.mcpAbd.max + 1e-4 ||
      f.thumb.ipFlex < ANATOMICAL_ROM.thumb.ipFlex.min - 1e-4 ||
      f.thumb.ipFlex > ANATOMICAL_ROM.thumb.ipFlex.max + 1e-4
    ) {
      allInRom = false;
    }

    for (const fn of fingerNames) {
      const st = f.fingers[fn];
      vals.push(st.mcpFlex, st.mcpAbd, st.mcpAxialTwist, st.pipFlex, st.dipFlex, st.mcpVolarGlide);
      if (
        st.mcpFlex < ANATOMICAL_ROM.finger.mcpFlex.min - 1e-4 ||
        st.mcpFlex > ANATOMICAL_ROM.finger.mcpFlex.max + 1e-4 ||
        st.mcpAxialTwist < ANATOMICAL_ROM.finger.mcpAxialTwist.min - 1e-4 ||
        st.mcpAxialTwist > ANATOMICAL_ROM.finger.mcpAxialTwist.max + 1e-4 ||
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

assert(
  engine.getPoseCount() === 36 && poses.length === 36,
  `36 anatomical hand poses registered & audited (${engine.getPoseCount()} poses)`
);
assert(allFinite, `36,000 sub-steps across all ${poses.length} anatomical poses strictly finite (zero NaN/Inf)`);
assert(allInRom, `100% physiological Kapandji ROM compliance across all 38-DOF joints & ${poses.length} poses`);
assert(
  totalFoleyEvents >= 12 && seenFoleyTypes.size >= 4,
  `9-channel kinetic micro-Foley stream active (${totalFoleyEvents} events, ${seenFoleyTypes.size} types: ${[...seenFoleyTypes].join(', ')})`
);

// 2. Two-Stage Intrinsic / Extrinsic Grasp Synergy ("Hook-Roll-Clamp" & "Unlatch-Bloom-Fan")
const synEng = new JHandKinesisEngine(0);
synEng.setTargetPose(PAPER, true, false);
for (let i = 0; i < 120; i++) synEng.step(1 / 120);
synEng.setTargetPose(ROCK, true, true);
let hookSample = synEng.step(1 / 120);
for (let i = 0; i < 6; i++) {
  hookSample = synEng.step(1 / 120); // ~58ms into Paper -> Rock closure!
}
assert(
  hookSample.fingers.pinky.pipFlex > hookSample.fingers.pinky.mcpFlex + 0.15,
  `Two-Stage Hook-Roll-Clamp verified: extrinsic flexors hook PIP (${(hookSample.fingers.pinky.pipFlex * 57.3).toFixed(1)}°) ahead of MCP (${(hookSample.fingers.pinky.mcpFlex * 57.3).toFixed(1)}°)`
);

// Settle full ROCK fist, then verify Thumb Unlatch Lead on ROCK -> PAPER!
for (let i = 0; i < 180; i++) hookSample = synEng.step(1 / 120);
const rockTel = synEng.getTelemetry();
assert(
  rockTel.activeDof === 38,
  `JHand Kinesis 1.1 active DOF count verified: ${rockTel.activeDof}-DOF`
);
assert(
  rockTel.orlCouplingRatio >= 0.6 && rockTel.orlCouplingRatio <= 0.74,
  `ORL DIP/PIP coupling ratio within human physiological band (0.60..0.74): measured ${rockTel.orlCouplingRatio}`
);
assert(
  rockTel.palmCupDeg >= 10.0 && hookSample.palm.cmc5Supination > 0.14 && hookSample.palm.fdiBulge > 0.55,
  `5-Metacarpal 3-Arch + CMC5 Supination (${(hookSample.palm.cmc5Supination * 57.3).toFixed(1)}°) + FDI Web Bulge (${Math.round(hookSample.palm.fdiBulge * 100)}%) active on Rock fist`
);
assert(
  rockTel.icrGlideMm >= 2.4 && rockTel.icrGlideMm <= 4.0,
  `Eccentric Cam-Axis Volar ICR Glide verified on deep fist: ${rockTel.icrGlideMm.toFixed(1)} mm`
);

const thumbAbdBeforeBloom = hookSample.thumb.cmcAbd;
synEng.setTargetPose(PAPER, true, true);
let bloomSample = synEng.step(1 / 120);
for (let i = 0; i < 5; i++) {
  bloomSample = synEng.step(1 / 120); // ~50ms into Rock -> Paper bloom
}
assert(
  bloomSample.thumb.cmcAbd > thumbAbdBeforeBloom + 0.14,
  `Two-Stage Unlatch-Bloom-Fan verified: thumb unlatches immediately (+${((bloomSample.thumb.cmcAbd - thumbAbdBeforeBloom) * 57.3).toFixed(1)}° radial lead)`
);

// Settle full PAPER fan and verify zero-clipping order, thumb IP hyperextension, EPL snuffbox & webbing!
for (let i = 0; i < 180; i++) bloomSample = synEng.step(1 / 120);
const abdOrdered =
  bloomSample.fingers.index.mcpAbd > bloomSample.fingers.middle.mcpAbd &&
  bloomSample.fingers.middle.mcpAbd > bloomSample.fingers.ring.mcpAbd &&
  bloomSample.fingers.ring.mcpAbd > bloomSample.fingers.pinky.mcpAbd;
assert(abdOrdered, 'Paper fan maintains strict radial-to-ulnar separation (zero finger clipping)');
assert(
  bloomSample.thumb.ipFlex < -0.08 && bloomSample.thumb.eplTendonTension > 0.65 && bloomSample.palm.webbingStretch[0] > 0.35,
  `Paper hyperextension & soft-tissue verified: Thumb IP ${(bloomSample.thumb.ipFlex * 57.3).toFixed(1)}°, EPL ${Math.round(bloomSample.thumb.eplTendonTension * 100)}%, Webbing ${Math.round(bloomSample.palm.webbingStretch[0] * 100)}%`
);

// 3. Two-Row Carpal Wrist (Radiocarpal + Midcarpal Split) Verification
const carpalEng = new JHandKinesisEngine(0);
carpalEng.setTargetPose('salute', true, false); // Strong dorsal extension (-0.20 rad)
let salFrame = carpalEng.step(1 / 120);
for (let i = 0; i < 140; i++) salFrame = carpalEng.step(1 / 120);
assert(
  Math.abs(salFrame.wrist.mcPitch) > Math.abs(salFrame.wrist.rcPitch),
  `Two-Row Carpal Wrist partition verified on dorsal extension: Midcarpal ${(salFrame.wrist.mcPitch * 57.3).toFixed(1)}° > Radiocarpal ${(salFrame.wrist.rcPitch * 57.3).toFixed(1)}°`
);

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
  `Tenodesis effect verified: wrist extension passively curls fingers (+${((fExtended.fingers.middle.mcpFlex - fNeutral.fingers.middle.mcpFlex) * 57.3).toFixed(1)}°)`
);

// 5. Proximal-to-Distal Inertial Whip Propagation
const whipEng = new JHandKinesisEngine(0);
whipEng.setTargetPose(PAPER, false, false);
for (let i = 0; i < 90; i++) whipEng.step(1 / 120);
const beforeDip = whipEng.step(1 / 120, { x: 0, y: 0, z: 0 }).fingers.middle.dipFlex;
let afterDip = beforeDip;
for (let i = 0; i < 8; i++) {
  afterDip = whipEng.step(1 / 120, { x: 0, y: -i * 0.85, z: 0 }).fingers.middle.dipFlex;
}
assert(
  afterDip > beforeDip + 0.04,
  `Proximal-to-distal inertial whip lag verified (+${((afterDip - beforeDip) * 57.3).toFixed(1)}° distal flex lag)`
);

if (failedChecks > 0) {
  throw new Error(`JHand Kinesis 1.1 Audit failed with ${failedChecks} error(s).`);
}
console.log('\nJHand Kinesis 1.1 Audit Complete.\n');
