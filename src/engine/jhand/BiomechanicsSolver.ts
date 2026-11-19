/**
 * ★ JHand Kinesis 1.1 — 8-Layer 38-DOF Anatomical Micro-Kinematics & Tendon-Pulley Solver ★
 *
 * Pure deterministic musculoskeletal & anatomical physics solver (zero Three.js dependency)
 * engineered for lifelike, indistinguishable-from-human hand articulation:
 *
 *   Layer 1 · Two-Stage Intrinsic / Extrinsic Neuromotor Synergy Phase Planner
 *             ("Hook-Roll-Clamp" fist closure, "Unlatch-Bloom-Fan" paper unfurl,
 *              "Clamp-Fire-Shear" scissors deploy — eliminates robotic linear interpolation!)
 *   Layer 2 · Two-Row Carpal Wrist (Radiocarpal + Midcarpal) + Dart-Thrower's Motion (DTM)
 *             + Distal Radioulnar Joint (DRUJ) Pronation & Ulnar Styloid Prominence
 *   Layer 3 · 5-Metacarpal 3-Arch Palmar Skeleton (CMC2/3 compliance, CMC4/5 cupping +
 *             CMC5 opposition supination, Thenar/Hypothenar/FDI muscles, Webbing)
 *             + Landsmeer Tenodesis + ORL DIP–PIP + 4×4 Juncturae Tendinum Collagen Bridges
 *   Layer 4 · Eccentric Cam-Axis Volar ICR Glide + Collateral-Ligament Convergence
 *             + True MCP Passive Axial Twist + Distal Clinodactyly Fist Packing
 *   Layer 5 · Hill-Type Neuromuscular Activation + Proximal-to-Distal Inertial Whip-Lag
 *             (4× sub-stepped semi-implicit Euler for unconditional high-FPS precision)
 *   Layer 6 · Nonlinear Ligament Soft-Stops + Analytical Capsule Separation & Pulp Squash
 *   Layer 7 · Stochastic 1/f Pink Neuromuscular Micro-Life + 1.15 Hz Arterial Pulse
 *             + Effort-Scaled 8.5–12.5 Hz Physiological Motor-Unit Tremor
 *   Layer 8 · 9-Channel Kinetic Micro-Foley Event Stream to JSound Engin 1.1
 */

import { PAPER, ROCK, SCISSORS } from '../jnv1/types';
import {
  ANATOMICAL_ROM,
  FingerJointState,
  FingerName,
  HandFoleyEvent,
  HandPoseKey,
  JHandQualityMode,
  JHandSolvedFrame,
  JHandTelemetry,
  JointLimit,
  ThumbJointState,
} from './types';

interface FingerTarget {
  mcpFlex: number;
  mcpAbd: number;
  pipFlex: number;
  dipFlex: number;
}

interface ThumbTarget {
  cmcFlex: number;
  cmcAbd: number;
  cmcPronation: number;
  mcpFlex: number;
  mcpAbd: number;
  ipFlex: number;
}

interface FullAnatomicalTarget {
  thumb: ThumbTarget;
  fingers: Record<FingerName, FingerTarget>;
  wristPitch: number;
  wristYaw: number;
  wristRoll: number;
  forearmPronation: number;
  palmCupBias: number;
  effort: number;
}

type TransitionSynergy = 'neutral' | 'hook_roll_clamp' | 'unlatch_bloom_fan' | 'clamp_fire_shear';

/**
 * Second-order inertial joint integrator with Hill-type neuromuscular recruitment
 * and nonlinear physiological ligament soft-stop restoring torque.
 */
class BiomechJoint {
  public pos: number;
  public vel = 0;
  public activation = 0;
  public lastSnapCooldown = 0;

  constructor(
    initial: number,
    public readonly inertia: number,
    public readonly limit: JointLimit
  ) {
    this.pos = initial;
  }

  public snap(v: number): void {
    this.pos = Math.max(this.limit.min, Math.min(this.limit.max, v));
    this.vel = 0;
  }

  public addTorqueImpulse(velDelta: number): void {
    this.vel += velDelta / Math.max(0.25, this.inertia);
  }

  public step(
    target: number,
    stiffness: number,
    damping: number,
    externalTorque: number,
    dt: number,
    activationRate = 48.0,
    subSteps = 4
  ): void {
    if (this.lastSnapCooldown > 0) {
      this.lastSnapCooldown = Math.max(0, this.lastSnapCooldown - dt);
    }

    // Hill-type neuromuscular recruitment lag (organic S-curve acceleration instead of robot step)
    const alpha = 1 - Math.exp(-activationRate * dt);
    this.activation += (1.0 - this.activation) * alpha;

    const clampedTarget = Math.max(this.limit.min, Math.min(this.limit.max, target));
    const h = dt / subSteps;
    const invI = 1.0 / this.inertia;

    for (let s = 0; s < subSteps; s++) {
      let torque = (clampedTarget - this.pos) * stiffness * this.activation;
      torque -= this.vel * damping;
      torque += externalTorque;

      // Nonlinear anatomical ligament soft-stop barrier near physiological ROM limits
      const hiStart = this.limit.max - this.limit.softMargin;
      const loStart = this.limit.min + this.limit.softMargin;
      if (this.pos > hiStart) {
        const pen = (this.pos - hiStart) / Math.max(0.01, this.limit.softMargin);
        torque -= pen * pen * stiffness * 2.5;
        if (this.vel > 0) torque -= this.vel * damping * 1.45;
      } else if (this.pos < loStart) {
        const pen = (loStart - this.pos) / Math.max(0.01, this.limit.softMargin);
        torque += pen * pen * stiffness * 2.5;
        if (this.vel < 0) torque -= this.vel * damping * 1.45;
      }

      this.vel += torque * invI * h;
      if (this.vel > 28) this.vel = 28;
      if (this.vel < -28) this.vel = -28;
      this.pos += this.vel * h;

      // Hard bone-stop safety clamp (guarantees 100% Kapandji ROM compliance)
      if (this.pos > this.limit.max) {
        this.pos = this.limit.max;
        if (this.vel > 0) this.vel *= -0.12;
      } else if (this.pos < this.limit.min) {
        this.pos = this.limit.min;
        if (this.vel < 0) this.vel *= -0.12;
      }
    }
  }
}

interface FingerJointBank {
  mcpFlex: BiomechJoint;
  mcpAbd: BiomechJoint;
  mcpAxialTwist: BiomechJoint;
  pipFlex: BiomechJoint;
  dipFlex: BiomechJoint;
  palmContact: number;
  prevPalmContact: number;
  pulpCompression: number;
}

interface ThumbJointBank {
  cmcFlex: BiomechJoint;
  cmcAbd: BiomechJoint;
  cmcPronation: BiomechJoint;
  mcpFlex: BiomechJoint;
  mcpAbd: BiomechJoint;
  ipFlex: BiomechJoint;
  fingerContact: number;
  prevFingerContact: number;
  pulpCompression: number;
}

const FINGER_NAMES: FingerName[] = ['index', 'middle', 'ring', 'pinky'];

/**
 * Anatomical Juncturae Tendinum (4×4 extensor tendon collagen bridge matrix):
 * Strongest inter-digit linkages connect Ring↔Middle (0.18) and Ring↔Pinky (0.21).
 */
const JUNCTURAE_MATRIX: Record<FingerName, Record<FingerName, number>> = {
  index: { index: 0, middle: 0.055, ring: 0.015, pinky: 0.0 },
  middle: { index: 0.06, middle: 0, ring: 0.145, pinky: 0.025 },
  ring: { index: 0.02, middle: 0.185, ring: 0, pinky: 0.21 },
  pinky: { index: 0.0, middle: 0.03, ring: 0.155, pinky: 0 },
};

/** Scaphoid tubercle axial convergence factors (fingers converge toward thumb base on closure) */
const CONVERGENCE_FACTORS: Record<FingerName, number> = {
  index: -0.062,
  middle: -0.014,
  ring: 0.056,
  pinky: 0.128,
};

/** Subtle physiological distal clinodactyly cant so closed fingers pack with zero gap */
const DIP_CANT_FACTORS: Record<FingerName, number> = {
  index: -0.048,
  middle: -0.008,
  ring: 0.036,
  pinky: 0.064,
};

/**
 * Anatomically researched 38-DOF Pose Library
 */
const ANATOMICAL_POSES: Record<HandPoseKey, FullAnatomicalTarget> = {
  ready: {
    thumb: { cmcFlex: 0.36, cmcAbd: -0.44, cmcPronation: 0.36, mcpFlex: 0.28, mcpAbd: 0.02, ipFlex: 0.22 },
    fingers: {
      index: { mcpFlex: 0.42, mcpAbd: 0.09, pipFlex: 0.52, dipFlex: 0.34 },
      middle: { mcpFlex: 0.5, mcpAbd: 0.01, pipFlex: 0.62, dipFlex: 0.41 },
      ring: { mcpFlex: 0.6, mcpAbd: -0.05, pipFlex: 0.72, dipFlex: 0.48 },
      pinky: { mcpFlex: 0.7, mcpAbd: -0.1, pipFlex: 0.78, dipFlex: 0.52 },
    },
    wristPitch: 0.1,
    wristYaw: 0.02,
    wristRoll: 0.12,
    forearmPronation: 0.24,
    palmCupBias: 0.26,
    effort: 0.18,
  },
  windup: {
    thumb: { cmcFlex: 0.72, cmcAbd: -0.82, cmcPronation: 0.64, mcpFlex: 0.68, mcpAbd: 0.08, ipFlex: 0.58 },
    fingers: {
      index: { mcpFlex: 1.48, mcpAbd: 0.01, pipFlex: 1.62, dipFlex: 1.06 },
      middle: { mcpFlex: 1.54, mcpAbd: 0.0, pipFlex: 1.66, dipFlex: 1.1 },
      ring: { mcpFlex: 1.58, mcpAbd: -0.02, pipFlex: 1.68, dipFlex: 1.1 },
      pinky: { mcpFlex: 1.6, mcpAbd: -0.03, pipFlex: 1.66, dipFlex: 1.08 },
    },
    wristPitch: 0.14,
    wristYaw: 0.04,
    wristRoll: 0.18,
    forearmPronation: 0.44,
    palmCupBias: 0.8,
    effort: 0.84,
  },
  [ROCK]: {
    // Deep martial fist: ulnar palm cupped & supinated, thumb firmly pressed over index/middle with slight radial yield!
    thumb: { cmcFlex: 0.81, cmcAbd: -0.9, cmcPronation: 0.78, mcpFlex: 0.72, mcpAbd: 0.13, ipFlex: 0.64 },
    fingers: {
      index: { mcpFlex: 1.56, mcpAbd: 0.01, pipFlex: 1.7, dipFlex: 1.12 },
      middle: { mcpFlex: 1.6, mcpAbd: 0.0, pipFlex: 1.74, dipFlex: 1.16 },
      ring: { mcpFlex: 1.62, mcpAbd: -0.02, pipFlex: 1.74, dipFlex: 1.15 },
      pinky: { mcpFlex: 1.64, mcpAbd: -0.03, pipFlex: 1.72, dipFlex: 1.12 },
    },
    wristPitch: 0.03,
    wristYaw: -0.03,
    wristRoll: 0.14,
    forearmPronation: 0.32,
    palmCupBias: 0.98,
    effort: 0.97,
  },
  [SCISSORS]: {
    // Crisp V-blade deployment with taut extensor cords, thumb clamping ring PIP cleanly!
    thumb: { cmcFlex: 0.86, cmcAbd: -0.98, cmcPronation: 0.73, mcpFlex: 0.76, mcpAbd: 0.1, ipFlex: 0.7 },
    fingers: {
      index: { mcpFlex: -0.11, mcpAbd: 0.32, pipFlex: 0.02, dipFlex: 0.01 },
      middle: { mcpFlex: -0.08, mcpAbd: -0.28, pipFlex: 0.03, dipFlex: 0.02 },
      ring: { mcpFlex: 1.56, mcpAbd: -0.04, pipFlex: 1.72, dipFlex: 1.14 },
      pinky: { mcpFlex: 1.6, mcpAbd: -0.07, pipFlex: 1.72, dipFlex: 1.12 },
    },
    wristPitch: 0.07,
    wristYaw: 0.1,
    wristRoll: 0.22,
    forearmPronation: 0.56,
    palmCupBias: 0.64,
    effort: 0.89,
  },
  [PAPER]: {
    // Wide taut palm bloom: slight MCP & Thumb IP hyperextension, taut EPL snuffbox & commissural webbing!
    thumb: { cmcFlex: 0.03, cmcAbd: 0.24, cmcPronation: -0.26, mcpFlex: 0.0, mcpAbd: -0.08, ipFlex: -0.18 },
    fingers: {
      index: { mcpFlex: -0.16, mcpAbd: 0.31, pipFlex: 0.015, dipFlex: -0.02 },
      middle: { mcpFlex: -0.17, mcpAbd: 0.06, pipFlex: 0.01, dipFlex: -0.02 },
      ring: { mcpFlex: -0.14, mcpAbd: -0.15, pipFlex: 0.025, dipFlex: 0.0 },
      pinky: { mcpFlex: -0.09, mcpAbd: -0.34, pipFlex: 0.04, dipFlex: 0.01 },
    },
    wristPitch: 0.04,
    wristYaw: 0.0,
    wristRoll: 0.08,
    forearmPronation: 0.16,
    palmCupBias: 0.0,
    effort: 0.85,
  },
  envelop: {
    // Regal curved canopy enveloping Rock with gentle 3-arch palmar dome!
    thumb: { cmcFlex: 0.24, cmcAbd: -0.12, cmcPronation: 0.14, mcpFlex: 0.22, mcpAbd: 0.02, ipFlex: 0.16 },
    fingers: {
      index: { mcpFlex: 0.28, mcpAbd: 0.22, pipFlex: 0.36, dipFlex: 0.26 },
      middle: { mcpFlex: 0.26, mcpAbd: 0.04, pipFlex: 0.34, dipFlex: 0.24 },
      ring: { mcpFlex: 0.32, mcpAbd: -0.12, pipFlex: 0.4, dipFlex: 0.28 },
      pinky: { mcpFlex: 0.36, mcpAbd: -0.24, pipFlex: 0.42, dipFlex: 0.3 },
    },
    wristPitch: 0.2,
    wristYaw: 0.0,
    wristRoll: 0.03,
    forearmPronation: 0.06,
    palmCupBias: 0.5,
    effort: 0.64,
  },
  bow: {
    thumb: { cmcFlex: 0.52, cmcAbd: -0.48, cmcPronation: 0.4, mcpFlex: 0.44, mcpAbd: 0.02, ipFlex: 0.36 },
    fingers: {
      index: { mcpFlex: 0.76, mcpAbd: 0.05, pipFlex: 0.84, dipFlex: 0.56 },
      middle: { mcpFlex: 0.82, mcpAbd: 0.0, pipFlex: 0.88, dipFlex: 0.58 },
      ring: { mcpFlex: 0.88, mcpAbd: -0.04, pipFlex: 0.92, dipFlex: 0.6 },
      pinky: { mcpFlex: 0.94, mcpAbd: -0.08, pipFlex: 0.94, dipFlex: 0.62 },
    },
    wristPitch: 0.32,
    wristYaw: 0.0,
    wristRoll: 0.08,
    forearmPronation: 0.14,
    palmCupBias: 0.32,
    effort: 0.12,
  },
  salute: {
    thumb: { cmcFlex: 0.13, cmcAbd: 0.16, cmcPronation: -0.18, mcpFlex: 0.06, mcpAbd: -0.05, ipFlex: -0.08 },
    fingers: {
      index: { mcpFlex: -0.07, mcpAbd: 0.19, pipFlex: 0.07, dipFlex: 0.04 },
      middle: { mcpFlex: -0.05, mcpAbd: 0.03, pipFlex: 0.09, dipFlex: 0.06 },
      ring: { mcpFlex: 0.01, mcpAbd: -0.08, pipFlex: 0.15, dipFlex: 0.1 },
      pinky: { mcpFlex: 0.09, mcpAbd: -0.2, pipFlex: 0.21, dipFlex: 0.14 },
    },
    wristPitch: -0.2,
    wristYaw: 0.14,
    wristRoll: -0.08,
    forearmPronation: -0.28,
    palmCupBias: 0.12,
    effort: 0.45,
  },
  guard: {
    // Martial Tegatana defensive stance: lightly cupped angled barrier, ready to counter!
    thumb: { cmcFlex: 0.44, cmcAbd: -0.34, cmcPronation: 0.34, mcpFlex: 0.34, mcpAbd: 0.04, ipFlex: 0.2 },
    fingers: {
      index: { mcpFlex: 0.16, mcpAbd: 0.06, pipFlex: 0.24, dipFlex: 0.16 },
      middle: { mcpFlex: 0.2, mcpAbd: 0.01, pipFlex: 0.28, dipFlex: 0.18 },
      ring: { mcpFlex: 0.26, mcpAbd: -0.04, pipFlex: 0.34, dipFlex: 0.22 },
      pinky: { mcpFlex: 0.32, mcpAbd: -0.09, pipFlex: 0.38, dipFlex: 0.24 },
    },
    wristPitch: -0.1,
    wristYaw: 0.12,
    wristRoll: 0.3,
    forearmPronation: 0.52,
    palmCupBias: 0.34,
    effort: 0.56,
  },
  feint_flick: {
    // Crisp high-speed feint flick: index & middle whip half-open while ulnar grip stays coiled
    thumb: { cmcFlex: 0.3, cmcAbd: -0.18, cmcPronation: 0.18, mcpFlex: 0.18, mcpAbd: -0.02, ipFlex: 0.1 },
    fingers: {
      index: { mcpFlex: -0.14, mcpAbd: 0.22, pipFlex: 0.12, dipFlex: 0.06 },
      middle: { mcpFlex: -0.06, mcpAbd: -0.1, pipFlex: 0.24, dipFlex: 0.14 },
      ring: { mcpFlex: 1.08, mcpAbd: -0.06, pipFlex: 1.24, dipFlex: 0.8 },
      pinky: { mcpFlex: 1.24, mcpAbd: -0.12, pipFlex: 1.38, dipFlex: 0.88 },
    },
    wristPitch: -0.16,
    wristYaw: 0.18,
    wristRoll: -0.22,
    forearmPronation: -0.12,
    palmCupBias: 0.42,
    effort: 0.72,
  },
  beckon: {
    // Confident supinated taunt beckon: palm rolled upward, digits curled invitingly
    thumb: { cmcFlex: 0.28, cmcAbd: -0.06, cmcPronation: 0.12, mcpFlex: 0.22, mcpAbd: 0.0, ipFlex: 0.18 },
    fingers: {
      index: { mcpFlex: 0.68, mcpAbd: 0.12, pipFlex: 0.96, dipFlex: 0.62 },
      middle: { mcpFlex: 0.78, mcpAbd: 0.02, pipFlex: 1.06, dipFlex: 0.68 },
      ring: { mcpFlex: 0.92, mcpAbd: -0.06, pipFlex: 1.18, dipFlex: 0.76 },
      pinky: { mcpFlex: 1.06, mcpAbd: -0.12, pipFlex: 1.26, dipFlex: 0.82 },
    },
    wristPitch: -0.24,
    wristYaw: 0.05,
    wristRoll: -0.34,
    forearmPronation: -0.68,
    palmCupBias: 0.46,
    effort: 0.42,
  },
  knuckle_crack: {
    // Pre-duel tension flex: deep proximal MCP roll with firm thumb opposition & taut extensor cords
    thumb: { cmcFlex: 0.68, cmcAbd: -0.68, cmcPronation: 0.6, mcpFlex: 0.62, mcpAbd: 0.08, ipFlex: 0.56 },
    fingers: {
      index: { mcpFlex: 1.24, mcpAbd: 0.11, pipFlex: 1.38, dipFlex: 0.84 },
      middle: { mcpFlex: 1.32, mcpAbd: 0.02, pipFlex: 1.44, dipFlex: 0.9 },
      ring: { mcpFlex: 1.38, mcpAbd: -0.06, pipFlex: 1.48, dipFlex: 0.92 },
      pinky: { mcpFlex: 1.42, mcpAbd: -0.14, pipFlex: 1.5, dipFlex: 0.94 },
    },
    wristPitch: 0.28,
    wristYaw: -0.08,
    wristRoll: 0.18,
    forearmPronation: 0.36,
    palmCupBias: 0.72,
    effort: 0.88,
  },
  blade_edge: {
    // Shuto vertical knife-hand chop: 4 fingers razor-aligned & compressed, thumb tightly tucked!
    thumb: { cmcFlex: 0.58, cmcAbd: -0.46, cmcPronation: 0.48, mcpFlex: 0.48, mcpAbd: 0.1, ipFlex: 0.36 },
    fingers: {
      index: { mcpFlex: -0.14, mcpAbd: -0.06, pipFlex: 0.01, dipFlex: 0.0 },
      middle: { mcpFlex: -0.14, mcpAbd: -0.02, pipFlex: 0.01, dipFlex: 0.0 },
      ring: { mcpFlex: -0.12, mcpAbd: 0.03, pipFlex: 0.02, dipFlex: 0.0 },
      pinky: { mcpFlex: -0.08, mcpAbd: 0.07, pipFlex: 0.02, dipFlex: 0.01 },
    },
    wristPitch: -0.06,
    wristYaw: -0.12,
    wristRoll: 0.48,
    forearmPronation: 0.86,
    palmCupBias: 0.22,
    effort: 0.92,
  },
  crane_poise: {
    // Tsuru-no-Kamae classical crane beak: thumb pinched cleanly to index/middle, ring/pinky fanned!
    thumb: { cmcFlex: 0.64, cmcAbd: -0.58, cmcPronation: 0.78, mcpFlex: 0.34, mcpAbd: 0.04, ipFlex: 0.14 },
    fingers: {
      index: { mcpFlex: 0.88, mcpAbd: -0.06, pipFlex: 0.62, dipFlex: 0.42 },
      middle: { mcpFlex: 0.92, mcpAbd: 0.04, pipFlex: 0.66, dipFlex: 0.44 },
      ring: { mcpFlex: 0.12, mcpAbd: -0.14, pipFlex: 0.26, dipFlex: 0.16 },
      pinky: { mcpFlex: -0.1, mcpAbd: -0.26, pipFlex: 0.14, dipFlex: 0.08 },
    },
    wristPitch: 0.44,
    wristYaw: 0.06,
    wristRoll: 0.12,
    forearmPronation: 0.22,
    palmCupBias: 0.54,
    effort: 0.58,
  },
  claw_charge: {
    // Spirit Overdrive (極一撃) coiled tiger-claw tension: MCP hyperextended, PIP/DIP fiercely hooked!
    thumb: { cmcFlex: 0.38, cmcAbd: 0.18, cmcPronation: 0.22, mcpFlex: 0.36, mcpAbd: -0.04, ipFlex: 0.88 },
    fingers: {
      index: { mcpFlex: -0.22, mcpAbd: 0.26, pipFlex: 1.18, dipFlex: 0.86 },
      middle: { mcpFlex: -0.24, mcpAbd: 0.05, pipFlex: 1.24, dipFlex: 0.92 },
      ring: { mcpFlex: -0.2, mcpAbd: -0.12, pipFlex: 1.22, dipFlex: 0.9 },
      pinky: { mcpFlex: -0.16, mcpAbd: -0.26, pipFlex: 1.16, dipFlex: 0.84 },
    },
    wristPitch: -0.26,
    wristYaw: 0.0,
    wristRoll: 0.04,
    forearmPronation: -0.16,
    palmCupBias: 0.48,
    effort: 0.98,
  },
  finger_gun: {
    // Decisive victory flourish point: index straight & poised, thumb elevated, ulnar fingers locked
    thumb: { cmcFlex: 0.06, cmcAbd: 0.24, cmcPronation: -0.18, mcpFlex: 0.04, mcpAbd: -0.06, ipFlex: -0.14 },
    fingers: {
      index: { mcpFlex: -0.12, mcpAbd: 0.08, pipFlex: 0.02, dipFlex: 0.0 },
      middle: { mcpFlex: 1.48, mcpAbd: -0.02, pipFlex: 1.66, dipFlex: 1.08 },
      ring: { mcpFlex: 1.56, mcpAbd: -0.05, pipFlex: 1.7, dipFlex: 1.1 },
      pinky: { mcpFlex: 1.6, mcpAbd: -0.08, pipFlex: 1.7, dipFlex: 1.08 },
    },
    wristPitch: -0.04,
    wristYaw: 0.08,
    wristRoll: 0.36,
    forearmPronation: 0.68,
    palmCupBias: 0.68,
    effort: 0.78,
  },
  palm_meditate: {
    // Tranquil Zen supinated open palm: serene curvature for PV intro & tea-room stillness
    thumb: { cmcFlex: 0.14, cmcAbd: 0.12, cmcPronation: -0.12, mcpFlex: 0.1, mcpAbd: -0.02, ipFlex: 0.06 },
    fingers: {
      index: { mcpFlex: 0.12, mcpAbd: 0.1, pipFlex: 0.18, dipFlex: 0.12 },
      middle: { mcpFlex: 0.16, mcpAbd: 0.01, pipFlex: 0.22, dipFlex: 0.14 },
      ring: { mcpFlex: 0.22, mcpAbd: -0.06, pipFlex: 0.28, dipFlex: 0.18 },
      pinky: { mcpFlex: 0.28, mcpAbd: -0.12, pipFlex: 0.32, dipFlex: 0.2 },
    },
    wristPitch: 0.06,
    wristYaw: 0.0,
    wristRoll: -0.44,
    forearmPronation: -0.78,
    palmCupBias: 0.24,
    effort: 0.14,
  },
  victory_fist: {
    // Proud triumphant clenched fist with strong radial tilt & firm thumb seal
    thumb: { cmcFlex: 0.84, cmcAbd: -0.92, cmcPronation: 0.82, mcpFlex: 0.76, mcpAbd: 0.14, ipFlex: 0.68 },
    fingers: {
      index: { mcpFlex: 1.58, mcpAbd: 0.02, pipFlex: 1.74, dipFlex: 1.16 },
      middle: { mcpFlex: 1.62, mcpAbd: 0.0, pipFlex: 1.76, dipFlex: 1.18 },
      ring: { mcpFlex: 1.64, mcpAbd: -0.02, pipFlex: 1.76, dipFlex: 1.16 },
      pinky: { mcpFlex: 1.66, mcpAbd: -0.04, pipFlex: 1.74, dipFlex: 1.14 },
    },
    wristPitch: -0.22,
    wristYaw: 0.14,
    wristRoll: -0.26,
    forearmPronation: -0.42,
    palmCupBias: 1.0,
    effort: 1.0,
  },
  // ★ 18 NEW 38-DOF ANATOMICAL POSES (Total 36 Poses!) ★
  lotus_mudra: {
    // 蓮華印: Sacred curved lotus mudra — thumb meets middle pad delicately, index & pinky bloom!
    thumb: { cmcFlex: 0.62, cmcAbd: -0.62, cmcPronation: 0.74, mcpFlex: 0.34, mcpAbd: 0.04, ipFlex: 0.16 },
    fingers: {
      index: { mcpFlex: 0.08, mcpAbd: 0.24, pipFlex: 0.22, dipFlex: 0.14 },
      middle: { mcpFlex: 0.96, mcpAbd: 0.02, pipFlex: 0.88, dipFlex: 0.56 },
      ring: { mcpFlex: 0.84, mcpAbd: -0.06, pipFlex: 0.78, dipFlex: 0.48 },
      pinky: { mcpFlex: -0.04, mcpAbd: -0.28, pipFlex: 0.18, dipFlex: 0.12 },
    },
    wristPitch: -0.14,
    wristYaw: 0.04,
    wristRoll: -0.32,
    forearmPronation: -0.58,
    palmCupBias: 0.48,
    effort: 0.32,
  },
  sword_seal: {
    // 剣印 (Kuji-in Sword Seal): Index & middle welded razor-straight together, thumb locks ring & pinky!
    thumb: { cmcFlex: 0.86, cmcAbd: -0.94, cmcPronation: 0.76, mcpFlex: 0.74, mcpAbd: 0.1, ipFlex: 0.66 },
    fingers: {
      index: { mcpFlex: -0.14, mcpAbd: -0.02, pipFlex: 0.01, dipFlex: 0.0 },
      middle: { mcpFlex: -0.13, mcpAbd: 0.01, pipFlex: 0.01, dipFlex: 0.0 },
      ring: { mcpFlex: 1.56, mcpAbd: -0.04, pipFlex: 1.72, dipFlex: 1.12 },
      pinky: { mcpFlex: 1.6, mcpAbd: -0.08, pipFlex: 1.72, dipFlex: 1.1 },
    },
    wristPitch: -0.08,
    wristYaw: 0.16,
    wristRoll: 0.34,
    forearmPronation: 0.62,
    palmCupBias: 0.66,
    effort: 0.92,
  },
  tiger_palm: {
    // 虎掌打: Martial pushing palm — dramatic dorsal wrist hyperextension, fingers taut & arched!
    thumb: { cmcFlex: 0.12, cmcAbd: 0.28, cmcPronation: -0.22, mcpFlex: 0.14, mcpAbd: -0.06, ipFlex: 0.26 },
    fingers: {
      index: { mcpFlex: -0.26, mcpAbd: 0.26, pipFlex: 0.54, dipFlex: 0.36 },
      middle: { mcpFlex: -0.28, mcpAbd: 0.04, pipFlex: 0.58, dipFlex: 0.4 },
      ring: { mcpFlex: -0.24, mcpAbd: -0.14, pipFlex: 0.56, dipFlex: 0.38 },
      pinky: { mcpFlex: -0.18, mcpAbd: -0.28, pipFlex: 0.5, dipFlex: 0.34 },
    },
    wristPitch: -0.48,
    wristYaw: 0.02,
    wristRoll: 0.04,
    forearmPronation: 0.08,
    palmCupBias: 0.18,
    effort: 0.94,
  },
  iron_knuckle: {
    // 鳳眼拳 (Phoenix-Eye Martial Fist): Index PIP protruding sharply braced by thumb!
    thumb: { cmcFlex: 0.72, cmcAbd: -0.78, cmcPronation: 0.7, mcpFlex: 0.52, mcpAbd: 0.12, ipFlex: 0.34 },
    fingers: {
      index: { mcpFlex: 0.88, mcpAbd: 0.04, pipFlex: 1.74, dipFlex: 1.18 },
      middle: { mcpFlex: 1.56, mcpAbd: 0.0, pipFlex: 1.72, dipFlex: 1.14 },
      ring: { mcpFlex: 1.6, mcpAbd: -0.03, pipFlex: 1.74, dipFlex: 1.14 },
      pinky: { mcpFlex: 1.64, mcpAbd: -0.05, pipFlex: 1.72, dipFlex: 1.12 },
    },
    wristPitch: 0.06,
    wristYaw: -0.06,
    wristRoll: 0.2,
    forearmPronation: 0.42,
    palmCupBias: 0.92,
    effort: 0.96,
  },
  tea_whisk: {
    // 茶筅構え: Refined chado tea-ceremony tripod hold with graceful ulnar taper!
    thumb: { cmcFlex: 0.54, cmcAbd: -0.44, cmcPronation: 0.62, mcpFlex: 0.26, mcpAbd: 0.02, ipFlex: 0.18 },
    fingers: {
      index: { mcpFlex: 0.62, mcpAbd: 0.06, pipFlex: 0.76, dipFlex: 0.48 },
      middle: { mcpFlex: 0.74, mcpAbd: 0.0, pipFlex: 0.84, dipFlex: 0.52 },
      ring: { mcpFlex: 0.52, mcpAbd: -0.08, pipFlex: 0.62, dipFlex: 0.38 },
      pinky: { mcpFlex: 0.24, mcpAbd: -0.2, pipFlex: 0.34, dipFlex: 0.22 },
    },
    wristPitch: 0.16,
    wristYaw: 0.12,
    wristRoll: -0.18,
    forearmPronation: -0.24,
    palmCupBias: 0.44,
    effort: 0.28,
  },
  fan_hold: {
    // 舞扇持ち: Ceremonial folding-fan grasp — thumb/index/middle cradle pivot, ring/pinky poised!
    thumb: { cmcFlex: 0.46, cmcAbd: -0.32, cmcPronation: 0.48, mcpFlex: 0.22, mcpAbd: 0.04, ipFlex: 0.1 },
    fingers: {
      index: { mcpFlex: 0.34, mcpAbd: 0.14, pipFlex: 0.44, dipFlex: 0.28 },
      middle: { mcpFlex: 0.82, mcpAbd: 0.02, pipFlex: 0.92, dipFlex: 0.58 },
      ring: { mcpFlex: 0.96, mcpAbd: -0.04, pipFlex: 1.04, dipFlex: 0.66 },
      pinky: { mcpFlex: 0.18, mcpAbd: -0.24, pipFlex: 0.28, dipFlex: 0.18 },
    },
    wristPitch: -0.14,
    wristYaw: 0.18,
    wristRoll: -0.28,
    forearmPronation: -0.38,
    palmCupBias: 0.4,
    effort: 0.38,
  },
  brush_grip: {
    // 筆執り: Master calligraphy brush tripod pinch with supple carpal arch!
    thumb: { cmcFlex: 0.58, cmcAbd: -0.5, cmcPronation: 0.68, mcpFlex: 0.3, mcpAbd: 0.04, ipFlex: 0.12 },
    fingers: {
      index: { mcpFlex: 0.72, mcpAbd: 0.04, pipFlex: 0.78, dipFlex: 0.46 },
      middle: { mcpFlex: 0.84, mcpAbd: -0.02, pipFlex: 0.88, dipFlex: 0.52 },
      ring: { mcpFlex: 1.08, mcpAbd: -0.06, pipFlex: 1.14, dipFlex: 0.7 },
      pinky: { mcpFlex: 1.18, mcpAbd: -0.1, pipFlex: 1.22, dipFlex: 0.74 },
    },
    wristPitch: 0.24,
    wristYaw: -0.08,
    wristRoll: 0.26,
    forearmPronation: 0.48,
    palmCupBias: 0.58,
    effort: 0.42,
  },
  koto_pluck: {
    // 箏爪弾き: 13-string Koto ivory-pick posture — thumb & index/middle arched over strings!
    thumb: { cmcFlex: 0.42, cmcAbd: -0.24, cmcPronation: 0.52, mcpFlex: 0.16, mcpAbd: -0.02, ipFlex: 0.08 },
    fingers: {
      index: { mcpFlex: 0.48, mcpAbd: 0.14, pipFlex: 0.68, dipFlex: 0.44 },
      middle: { mcpFlex: 0.58, mcpAbd: 0.02, pipFlex: 0.78, dipFlex: 0.5 },
      ring: { mcpFlex: 0.38, mcpAbd: -0.1, pipFlex: 0.52, dipFlex: 0.32 },
      pinky: { mcpFlex: 0.16, mcpAbd: -0.22, pipFlex: 0.26, dipFlex: 0.16 },
    },
    wristPitch: 0.22,
    wristYaw: -0.12,
    wristRoll: 0.16,
    forearmPronation: 0.34,
    palmCupBias: 0.42,
    effort: 0.46,
  },
  snap_ready: {
    // 指パッチン溜: Preloaded finger-snap — middle finger pressed firmly into thumb pad!
    thumb: { cmcFlex: 0.66, cmcAbd: -0.58, cmcPronation: 0.78, mcpFlex: 0.32, mcpAbd: 0.06, ipFlex: -0.08 },
    fingers: {
      index: { mcpFlex: 0.24, mcpAbd: 0.18, pipFlex: 0.34, dipFlex: 0.22 },
      middle: { mcpFlex: 0.92, mcpAbd: 0.04, pipFlex: 0.72, dipFlex: 0.34 },
      ring: { mcpFlex: 1.46, mcpAbd: -0.06, pipFlex: 1.62, dipFlex: 1.04 },
      pinky: { mcpFlex: 1.54, mcpAbd: -0.1, pipFlex: 1.66, dipFlex: 1.06 },
    },
    wristPitch: -0.12,
    wristYaw: 0.1,
    wristRoll: -0.24,
    forearmPronation: -0.46,
    palmCupBias: 0.62,
    effort: 0.86,
  },
  snap_release: {
    // 指弾き開放: Explosive snap follow-through — middle slapped onto thenar, thumb & index flared!
    thumb: { cmcFlex: 0.12, cmcAbd: 0.24, cmcPronation: -0.14, mcpFlex: 0.08, mcpAbd: -0.06, ipFlex: -0.14 },
    fingers: {
      index: { mcpFlex: -0.14, mcpAbd: 0.22, pipFlex: 0.06, dipFlex: 0.04 },
      middle: { mcpFlex: 1.54, mcpAbd: 0.02, pipFlex: 1.72, dipFlex: 1.12 },
      ring: { mcpFlex: 1.48, mcpAbd: -0.05, pipFlex: 1.64, dipFlex: 1.06 },
      pinky: { mcpFlex: 1.42, mcpAbd: -0.1, pipFlex: 1.58, dipFlex: 1.0 },
    },
    wristPitch: -0.22,
    wristYaw: 0.18,
    wristRoll: -0.34,
    forearmPronation: -0.64,
    palmCupBias: 0.54,
    effort: 0.78,
  },
  peace_tilt: {
    // 斜め双刃: Confident relaxed supinated victory V-sign with jaunty radial tilt!
    thumb: { cmcFlex: 0.82, cmcAbd: -0.92, cmcPronation: 0.74, mcpFlex: 0.7, mcpAbd: 0.08, ipFlex: 0.62 },
    fingers: {
      index: { mcpFlex: -0.12, mcpAbd: 0.34, pipFlex: 0.03, dipFlex: 0.02 },
      middle: { mcpFlex: -0.08, mcpAbd: -0.26, pipFlex: 0.04, dipFlex: 0.02 },
      ring: { mcpFlex: 1.54, mcpAbd: -0.04, pipFlex: 1.7, dipFlex: 1.1 },
      pinky: { mcpFlex: 1.58, mcpAbd: -0.08, pipFlex: 1.7, dipFlex: 1.08 },
    },
    wristPitch: -0.18,
    wristYaw: 0.2,
    wristRoll: -0.36,
    forearmPronation: -0.58,
    palmCupBias: 0.62,
    effort: 0.62,
  },
  open_offer: {
    // 献上掌: Supinated gracious offering hand — welcoming soft upward cup!
    thumb: { cmcFlex: 0.18, cmcAbd: 0.14, cmcPronation: -0.1, mcpFlex: 0.12, mcpAbd: -0.02, ipFlex: 0.04 },
    fingers: {
      index: { mcpFlex: 0.18, mcpAbd: 0.14, pipFlex: 0.24, dipFlex: 0.16 },
      middle: { mcpFlex: 0.22, mcpAbd: 0.02, pipFlex: 0.28, dipFlex: 0.18 },
      ring: { mcpFlex: 0.28, mcpAbd: -0.08, pipFlex: 0.34, dipFlex: 0.22 },
      pinky: { mcpFlex: 0.34, mcpAbd: -0.18, pipFlex: 0.38, dipFlex: 0.24 },
    },
    wristPitch: -0.16,
    wristYaw: 0.06,
    wristRoll: -0.52,
    forearmPronation: -0.84,
    palmCupBias: 0.38,
    effort: 0.2,
  },
  fist_pump: {
    // 凱旋握拳: Surging angled triumph fist with strong forearm twist!
    thumb: { cmcFlex: 0.84, cmcAbd: -0.9, cmcPronation: 0.8, mcpFlex: 0.74, mcpAbd: 0.14, ipFlex: 0.68 },
    fingers: {
      index: { mcpFlex: 1.58, mcpAbd: 0.02, pipFlex: 1.74, dipFlex: 1.14 },
      middle: { mcpFlex: 1.62, mcpAbd: 0.0, pipFlex: 1.76, dipFlex: 1.16 },
      ring: { mcpFlex: 1.64, mcpAbd: -0.02, pipFlex: 1.76, dipFlex: 1.14 },
      pinky: { mcpFlex: 1.66, mcpAbd: -0.04, pipFlex: 1.74, dipFlex: 1.12 },
    },
    wristPitch: -0.3,
    wristYaw: -0.12,
    wristRoll: 0.32,
    forearmPronation: 0.64,
    palmCupBias: 1.0,
    effort: 0.98,
  },
  defeat_slump: {
    // 脱力垂手: Heavy gravity-relaxed defeated hand — zero tension, limp natural cascade!
    thumb: { cmcFlex: 0.32, cmcAbd: -0.26, cmcPronation: 0.22, mcpFlex: 0.26, mcpAbd: 0.0, ipFlex: 0.24 },
    fingers: {
      index: { mcpFlex: 0.56, mcpAbd: 0.04, pipFlex: 0.68, dipFlex: 0.44 },
      middle: { mcpFlex: 0.64, mcpAbd: 0.0, pipFlex: 0.76, dipFlex: 0.5 },
      ring: { mcpFlex: 0.74, mcpAbd: -0.04, pipFlex: 0.84, dipFlex: 0.54 },
      pinky: { mcpFlex: 0.84, mcpAbd: -0.08, pipFlex: 0.9, dipFlex: 0.58 },
    },
    wristPitch: 0.52,
    wristYaw: -0.14,
    wristRoll: 0.16,
    forearmPronation: 0.36,
    palmCupBias: 0.28,
    effort: 0.05,
  },
  stealth_curl: {
    // 忍び構え: Low-profile covert coiled fingers ready to strike in any direction!
    thumb: { cmcFlex: 0.52, cmcAbd: -0.42, cmcPronation: 0.44, mcpFlex: 0.46, mcpAbd: 0.04, ipFlex: 0.48 },
    fingers: {
      index: { mcpFlex: 0.66, mcpAbd: 0.16, pipFlex: 1.18, dipFlex: 0.78 },
      middle: { mcpFlex: 0.74, mcpAbd: 0.02, pipFlex: 1.24, dipFlex: 0.82 },
      ring: { mcpFlex: 0.84, mcpAbd: -0.08, pipFlex: 1.28, dipFlex: 0.84 },
      pinky: { mcpFlex: 0.94, mcpAbd: -0.18, pipFlex: 1.32, dipFlex: 0.86 },
    },
    wristPitch: 0.12,
    wristYaw: -0.08,
    wristRoll: 0.22,
    forearmPronation: 0.46,
    palmCupBias: 0.64,
    effort: 0.72,
  },
  wave_flourish: {
    // 歌舞伎波動: Sweeping theatrical kabuki radial-to-ulnar finger fan cascade!
    thumb: { cmcFlex: 0.08, cmcAbd: 0.26, cmcPronation: -0.2, mcpFlex: 0.04, mcpAbd: -0.06, ipFlex: -0.14 },
    fingers: {
      index: { mcpFlex: -0.2, mcpAbd: 0.3, pipFlex: 0.06, dipFlex: 0.02 },
      middle: { mcpFlex: 0.06, mcpAbd: 0.08, pipFlex: 0.26, dipFlex: 0.16 },
      ring: { mcpFlex: 0.42, mcpAbd: -0.12, pipFlex: 0.58, dipFlex: 0.36 },
      pinky: { mcpFlex: 0.82, mcpAbd: -0.28, pipFlex: 0.96, dipFlex: 0.62 },
    },
    wristPitch: -0.24,
    wristYaw: 0.22,
    wristRoll: -0.26,
    forearmPronation: -0.34,
    palmCupBias: 0.24,
    effort: 0.68,
  },
  counter_parry: {
    // 受け流し: Sweeping ulnar-deviated martial deflection palm with tightly tucked thumb!
    thumb: { cmcFlex: 0.64, cmcAbd: -0.58, cmcPronation: 0.54, mcpFlex: 0.52, mcpAbd: 0.08, ipFlex: 0.4 },
    fingers: {
      index: { mcpFlex: -0.08, mcpAbd: -0.04, pipFlex: 0.08, dipFlex: 0.05 },
      middle: { mcpFlex: -0.06, mcpAbd: -0.01, pipFlex: 0.1, dipFlex: 0.06 },
      ring: { mcpFlex: -0.02, mcpAbd: 0.02, pipFlex: 0.14, dipFlex: 0.08 },
      pinky: { mcpFlex: 0.04, mcpAbd: 0.05, pipFlex: 0.18, dipFlex: 0.1 },
    },
    wristPitch: -0.18,
    wristYaw: -0.26,
    wristRoll: 0.42,
    forearmPronation: 0.74,
    palmCupBias: 0.26,
    effort: 0.84,
  },
  zen_circle: {
    // 禅円相 (Chin-Mudra / Perfection Ring): Thumb & index form an unbroken golden circle, 3 fingers gracefully tiered!
    thumb: { cmcFlex: 0.66, cmcAbd: -0.62, cmcPronation: 0.84, mcpFlex: 0.34, mcpAbd: 0.04, ipFlex: 0.42 },
    fingers: {
      index: { mcpFlex: 0.86, mcpAbd: 0.06, pipFlex: 0.98, dipFlex: 0.64 },
      middle: { mcpFlex: -0.12, mcpAbd: 0.12, pipFlex: 0.08, dipFlex: 0.04 },
      ring: { mcpFlex: -0.06, mcpAbd: -0.08, pipFlex: 0.14, dipFlex: 0.08 },
      pinky: { mcpFlex: 0.02, mcpAbd: -0.24, pipFlex: 0.2, dipFlex: 0.12 },
    },
    wristPitch: -0.12,
    wristYaw: 0.08,
    wristRoll: -0.24,
    forearmPronation: -0.44,
    palmCupBias: 0.36,
    effort: 0.36,
  },
};

/** C² Quintic Hermite Smoothstep (zero velocity & acceleration discontinuity -> ultra-silky!) */
function quinticSmooth(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Irrational-frequency 1/f pink quasi-stochastic drift generator (zero cyclic repetition!) */
function pinkBioDrift(t: number, phase: number): number {
  return (
    Math.sin(t * 0.6180339 + phase) * 0.48 +
    Math.sin(t * 1.4142135 + phase * 1.7) * 0.28 +
    Math.sin(t * 2.7182818 + phase * 2.9) * 0.15 +
    Math.sin(t * 5.2360679 + phase * 4.1) * 0.09
  );
}

export class JHandKinesisEngine {
  private mode: JHandQualityMode = 'biomech_ultra';
  private currentPoseKey: HandPoseKey = 'ready';
  private prevPoseKey: HandPoseKey = 'ready';
  private activeSynergy: TransitionSynergy = 'neutral';
  private target: FullAnatomicalTarget = structuredClone(ANATOMICAL_POSES.ready);
  private prevTarget: FullAnatomicalTarget = structuredClone(ANATOMICAL_POSES.ready);
  private blendDuration = 0.09;

  // 38-DOF Biomechanical Joint Bank (anatomically scaled moments of inertia!)
  private readonly fingers: Record<FingerName, FingerJointBank>;
  private readonly thumb: ThumbJointBank;

  // 5-Metacarpal 3-Arch Palmar Joints
  private readonly cmc2: BiomechJoint;
  private readonly cmc3: BiomechJoint;
  private readonly cmc4: BiomechJoint;
  private readonly cmc5: BiomechJoint;
  private readonly cmc5Sup: BiomechJoint;

  // Forearm DRUJ + Two-Row Carpal Wrist (Radiocarpal + Midcarpal)
  private readonly forearmPron: BiomechJoint;
  private readonly rcPitch: BiomechJoint;
  private readonly mcPitch: BiomechJoint;
  private readonly wristYaw: BiomechJoint;
  private readonly wristRoll: BiomechJoint;

  // Stiffness & damping schedules
  private baseStiffness = 240;
  private baseDamping = 22;
  private poseElapsed = 1.0;
  private cascadeDelays: Record<FingerName | 'thumb', number> = {
    thumb: 0,
    index: 0,
    middle: 0,
    ring: 0,
    pinky: 0,
  };

  // Biological & dynamic soft-tissue states
  private simClock: number;
  private effortSmooth = 0.2;
  private intrinsicToneSmooth = 0.0;
  private thenarBulgeSmooth = 0.25;
  private hypothenarBulgeSmooth = 0.2;
  private fdiBulgeSmooth = 0.15;
  private ulnarStyloidSmooth = 0.35;
  private flexorTendonSmooth = 0.2;
  private idleDrumWeight = 1.0;
  private thoughtPulse = 0;
  private scissorSnipTimer = 0;
  private lastSnipPulseIdx = -1;

  // Foley rate/cooldown guards
  private sleeveRustleCooldown = 0;
  private tendonCreakCooldown = 0;
  private wristCrackCooldown = 0;
  private nailClickCooldown = 0;

  // Previous-frame kinematics for proximal-to-distal inertial whip propagation
  private prevWristPitchVel = 0;
  private prevWristLinearVel = { x: 0, y: 0, z: 0 };
  private smoothedWhipLag = 0;
  private lastPeakIcrGlideMm = 0;

  constructor(phaseOffset = 0) {
    this.simClock = phaseOffset;
    const p = ANATOMICAL_POSES.ready;

    const makeFinger = (ft: FingerTarget, inertiaScale: number): FingerJointBank => ({
      mcpFlex: new BiomechJoint(ft.mcpFlex, 1.0 * inertiaScale, ANATOMICAL_ROM.finger.mcpFlex),
      mcpAbd: new BiomechJoint(ft.mcpAbd, 0.72 * inertiaScale, ANATOMICAL_ROM.finger.mcpAbd),
      mcpAxialTwist: new BiomechJoint(0, 0.55 * inertiaScale, ANATOMICAL_ROM.finger.mcpAxialTwist),
      pipFlex: new BiomechJoint(ft.pipFlex, 0.58 * inertiaScale, ANATOMICAL_ROM.finger.pipFlex),
      dipFlex: new BiomechJoint(ft.dipFlex, 0.34 * inertiaScale, ANATOMICAL_ROM.finger.dipFlex),
      palmContact: 0,
      prevPalmContact: 0,
      pulpCompression: 0,
    });

    this.fingers = {
      index: makeFinger(p.fingers.index, 0.96),
      middle: makeFinger(p.fingers.middle, 1.06),
      ring: makeFinger(p.fingers.ring, 0.98),
      pinky: makeFinger(p.fingers.pinky, 0.76),
    };

    this.thumb = {
      cmcFlex: new BiomechJoint(p.thumb.cmcFlex, 1.12, ANATOMICAL_ROM.thumb.cmcFlex),
      cmcAbd: new BiomechJoint(p.thumb.cmcAbd, 1.05, ANATOMICAL_ROM.thumb.cmcAbd),
      cmcPronation: new BiomechJoint(p.thumb.cmcPronation, 0.9, ANATOMICAL_ROM.thumb.cmcPronation),
      mcpFlex: new BiomechJoint(p.thumb.mcpFlex, 0.65, ANATOMICAL_ROM.thumb.mcpFlex),
      mcpAbd: new BiomechJoint(p.thumb.mcpAbd, 0.52, ANATOMICAL_ROM.thumb.mcpAbd),
      ipFlex: new BiomechJoint(p.thumb.ipFlex, 0.38, ANATOMICAL_ROM.thumb.ipFlex),
      fingerContact: 0,
      prevFingerContact: 0,
      pulpCompression: 0,
    };

    this.cmc2 = new BiomechJoint(0.01, 1.35, ANATOMICAL_ROM.palm.cmc2Flex);
    this.cmc3 = new BiomechJoint(0.008, 1.4, ANATOMICAL_ROM.palm.cmc3Flex);
    this.cmc4 = new BiomechJoint(0.05, 1.25, ANATOMICAL_ROM.palm.cmc4Flex);
    this.cmc5 = new BiomechJoint(0.08, 1.15, ANATOMICAL_ROM.palm.cmc5Flex);
    this.cmc5Sup = new BiomechJoint(0.05, 1.1, ANATOMICAL_ROM.palm.cmc5Supination);

    this.forearmPron = new BiomechJoint(p.forearmPronation, 1.45, ANATOMICAL_ROM.wrist.forearmPronation);
    this.rcPitch = new BiomechJoint(p.wristPitch * 0.48, 1.28, ANATOMICAL_ROM.wrist.rcPitch);
    this.mcPitch = new BiomechJoint(p.wristPitch * 0.52, 0.98, ANATOMICAL_ROM.wrist.mcPitch);
    this.wristYaw = new BiomechJoint(p.wristYaw, 1.35, ANATOMICAL_ROM.wrist.yaw);
    this.wristRoll = new BiomechJoint(p.wristRoll, 1.1, ANATOMICAL_ROM.wrist.roll);
  }

  public setQualityMode(mode: JHandQualityMode): void {
    this.mode = mode;
  }

  public getQualityMode(): JHandQualityMode {
    return this.mode;
  }

  public getPoseKey(): HandPoseKey {
    return this.currentPoseKey;
  }

  /** Capture current C² blended target state so rapid pose interrupts remain 100% butter-smooth! */
  private snapshotBlendedTarget(): FullAnatomicalTarget {
    const b = quinticSmooth(this.poseElapsed / Math.max(0.001, this.blendDuration));
    const lerpFinger = (a: FingerTarget, c: FingerTarget): FingerTarget => ({
      mcpFlex: lerpScalar(a.mcpFlex, c.mcpFlex, b),
      mcpAbd: lerpScalar(a.mcpAbd, c.mcpAbd, b),
      pipFlex: lerpScalar(a.pipFlex, c.pipFlex, b),
      dipFlex: lerpScalar(a.dipFlex, c.dipFlex, b),
    });
    return {
      thumb: {
        cmcFlex: lerpScalar(this.prevTarget.thumb.cmcFlex, this.target.thumb.cmcFlex, b),
        cmcAbd: lerpScalar(this.prevTarget.thumb.cmcAbd, this.target.thumb.cmcAbd, b),
        cmcPronation: lerpScalar(this.prevTarget.thumb.cmcPronation, this.target.thumb.cmcPronation, b),
        mcpFlex: lerpScalar(this.prevTarget.thumb.mcpFlex, this.target.thumb.mcpFlex, b),
        mcpAbd: lerpScalar(this.prevTarget.thumb.mcpAbd, this.target.thumb.mcpAbd, b),
        ipFlex: lerpScalar(this.prevTarget.thumb.ipFlex, this.target.thumb.ipFlex, b),
      },
      fingers: {
        index: lerpFinger(this.prevTarget.fingers.index, this.target.fingers.index),
        middle: lerpFinger(this.prevTarget.fingers.middle, this.target.fingers.middle),
        ring: lerpFinger(this.prevTarget.fingers.ring, this.target.fingers.ring),
        pinky: lerpFinger(this.prevTarget.fingers.pinky, this.target.fingers.pinky),
      },
      wristPitch: lerpScalar(this.prevTarget.wristPitch, this.target.wristPitch, b),
      wristYaw: lerpScalar(this.prevTarget.wristYaw, this.target.wristYaw, b),
      wristRoll: lerpScalar(this.prevTarget.wristRoll, this.target.wristRoll, b),
      forearmPronation: lerpScalar(this.prevTarget.forearmPronation, this.target.forearmPronation, b),
      palmCupBias: lerpScalar(this.prevTarget.palmCupBias, this.target.palmCupBias, b),
      effort: lerpScalar(this.prevTarget.effort, this.target.effort, b),
    };
  }

  /**
   * Layer 1: Command target pose & classify real human Two-Stage Neuromotor Synergy!
   */
  public setTargetPose(
    poseKey: HandPoseKey,
    snappy = false,
    cascadeWave = true,
    hoverMode = false
  ): void {
    this.prevTarget = this.snapshotBlendedTarget();
    this.prevPoseKey = this.currentPoseKey;
    this.currentPoseKey = poseKey;
    this.target = structuredClone(ANATOMICAL_POSES[poseKey]);
    this.idleDrumWeight = poseKey === 'ready' && !hoverMode ? 1.0 : 0.0;
    // Silky C² quintic target transition window (crisp on combat reveal, liquid-smooth on poses!)
    this.blendDuration = snappy ? 0.032 : hoverMode ? 0.095 : 0.145;

    // Classify authentic human 2-stage grasp/release neuromotor synergy!
    if (
      poseKey === ROCK ||
      poseKey === 'windup' ||
      poseKey === 'victory_fist' ||
      poseKey === 'knuckle_crack' ||
      poseKey === 'iron_knuckle' ||
      poseKey === 'fist_pump'
    ) {
      this.activeSynergy = 'hook_roll_clamp';
    } else if (
      poseKey === PAPER ||
      poseKey === 'salute' ||
      poseKey === 'blade_edge' ||
      poseKey === 'palm_meditate' ||
      poseKey === 'guard' ||
      poseKey === 'tiger_palm' ||
      poseKey === 'open_offer' ||
      poseKey === 'counter_parry' ||
      poseKey === 'wave_flourish'
    ) {
      this.activeSynergy = 'unlatch_bloom_fan';
    } else if (
      poseKey === SCISSORS ||
      poseKey === 'feint_flick' ||
      poseKey === 'finger_gun' ||
      poseKey === 'sword_seal' ||
      poseKey === 'peace_tilt'
    ) {
      this.activeSynergy = 'clamp_fire_shear';
    } else {
      this.activeSynergy = 'neutral';
    }

    if (snappy) {
      this.baseStiffness = 565;
      this.baseDamping = 25.4;
    } else if (hoverMode) {
      this.baseStiffness = 285;
      this.baseDamping = 24.5;
    } else {
      this.baseStiffness = 225;
      this.baseDamping = 22.4;
    }

    // Reset Hill activation subtly on explosive transitions for realistic torque recruitment curve
    const resetAct = snappy ? 0.44 : 0.72;
    for (const f of FINGER_NAMES) {
      this.fingers[f].mcpFlex.activation = Math.min(this.fingers[f].mcpFlex.activation, resetAct);
      this.fingers[f].pipFlex.activation = Math.min(this.fingers[f].pipFlex.activation, resetAct);
    }

    // Subtle preparatory radiocarpal counter-motion impulse on explosive bloom (authentic human anticipation!)
    if (this.mode === 'biomech_ultra' && snappy && this.activeSynergy === 'unlatch_bloom_fan') {
      this.rcPitch.addTorqueImpulse(-1.6);
    }

    this.poseElapsed = 0;
    if (cascadeWave) {
      if (this.activeSynergy === 'unlatch_bloom_fan') {
        // Real human Rock -> Paper: Thumb releases FIRST (0ms), then radial-to-ulnar bloom!
        this.cascadeDelays = { thumb: 0.0, index: 0.016, middle: 0.032, ring: 0.05, pinky: 0.068 };
      } else if (this.activeSynergy === 'hook_roll_clamp') {
        // Real human Paper -> Rock: Ulnar grip (pinky->ring->middle->index) hooks first, thumb clamps last!
        this.cascadeDelays = { pinky: 0.0, ring: 0.01, middle: 0.02, index: 0.03, thumb: 0.072 };
      } else if (this.activeSynergy === 'clamp_fire_shear') {
        // Ring/Pinky lock immediate; Thumb secures Ring; Index/Middle fire out cleanly into V-blades!
        this.cascadeDelays = { ring: 0.0, pinky: 0.0, thumb: 0.013, index: 0.015, middle: 0.027 };
      } else {
        this.cascadeDelays = { thumb: 0, index: 0.012, middle: 0.024, ring: 0.036, pinky: 0.048 };
      }
    } else {
      this.cascadeDelays = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
    }
  }

  public getPoseCount(): number {
    return Object.keys(ANATOMICAL_POSES).length;
  }

  public triggerScissorsSnip(): void {
    this.scissorSnipTimer = 0.56;
    this.lastSnipPulseIdx = -1;
  }

  public triggerThoughtTell(): void {
    this.thoughtPulse = 1.0;
    this.forearmPron.addTorqueImpulse(-1.15);
    this.mcPitch.addTorqueImpulse(-0.65);
  }

  /** Explosive wrist-flick feint impulse for tactical 牽制 (Feint) choreography */
  public triggerFeintFlick(): void {
    this.forearmPron.addTorqueImpulse(-2.6);
    this.wristYaw.addTorqueImpulse(1.9);
    this.rcPitch.addTorqueImpulse(-1.5);
    this.fingers.index.mcpFlex.addTorqueImpulse(-3.4);
    this.fingers.middle.mcpFlex.addTorqueImpulse(-2.6);
    this.fingers.ring.pipFlex.addTorqueImpulse(2.2);
    this.fingers.pinky.pipFlex.addTorqueImpulse(2.8);
  }

  /** Sequential pre-duel knuckle tension ripple (pinky -> index) */
  public triggerKnuckleFlex(): void {
    const order: FingerName[] = ['pinky', 'ring', 'middle', 'index'];
    order.forEach((fn, idx) => {
      const k = 1.6 + idx * 0.45;
      this.fingers[fn].mcpFlex.addTorqueImpulse(k);
      this.fingers[fn].pipFlex.addTorqueImpulse(k * 1.35);
      this.fingers[fn].dipFlex.addTorqueImpulse(k * 0.9);
    });
    this.cmc5.addTorqueImpulse(1.2);
    this.thumb.cmcFlex.addTorqueImpulse(1.4);
  }

  /** Celebratory post-clash rolling finger flourish wave */
  public triggerVictoryRoll(): void {
    this.forearmPron.addTorqueImpulse(-2.2);
    this.mcPitch.addTorqueImpulse(-1.8);
    this.fingers.index.mcpFlex.addTorqueImpulse(-2.2);
    this.fingers.middle.mcpFlex.addTorqueImpulse(-1.6);
    this.fingers.ring.mcpFlex.addTorqueImpulse(-1.1);
    this.fingers.pinky.mcpFlex.addTorqueImpulse(-0.7);
    this.thumb.cmcAbd.addTorqueImpulse(1.5);
  }

  /** Crisp explosive middle-finger snap into palm + thumb radial kick! */
  public triggerFingerSnap(): void {
    this.setTargetPose('snap_release', true, false);
    this.fingers.middle.mcpFlex.addTorqueImpulse(5.4);
    this.fingers.middle.pipFlex.addTorqueImpulse(6.2);
    this.thumb.cmcAbd.addTorqueImpulse(3.2);
    this.wristYaw.addTorqueImpulse(1.8);
    this.forearmPron.addTorqueImpulse(-2.4);
  }

  /** Theatrical kabuki-style radial-to-ulnar flowing finger wave! */
  public triggerWaveFlourish(): void {
    this.setTargetPose('wave_flourish', false, true);
    this.forearmPron.addTorqueImpulse(-1.8);
    this.mcPitch.addTorqueImpulse(-1.6);
    this.fingers.index.mcpFlex.addTorqueImpulse(-2.6);
    this.fingers.middle.pipFlex.addTorqueImpulse(-1.6);
    this.fingers.ring.pipFlex.addTorqueImpulse(1.4);
    this.fingers.pinky.pipFlex.addTorqueImpulse(2.2);
  }

  /** Crisp Kuji-in Sword Seal energy lock pulse! */
  public triggerSwordSealPulse(): void {
    this.setTargetPose('sword_seal', true, true);
    this.forearmPron.addTorqueImpulse(2.4);
    this.wristYaw.addTorqueImpulse(1.6);
    this.fingers.index.mcpFlex.addTorqueImpulse(-2.2);
    this.fingers.middle.mcpFlex.addTorqueImpulse(-2.2);
  }

  /** Serene Zen Mudra harmonic breath ripple */
  public triggerZenBreath(): void {
    this.setTargetPose('zen_circle', false, true);
    this.mcPitch.addTorqueImpulse(-0.85);
    this.forearmPron.addTorqueImpulse(-0.9);
  }

  /** Subtle non-cheating NPC neuromuscular micro-tell triggered on player Feint */
  public triggerNpcTell(stanceCue: 'tight' | 'poised' | 'open'): void {
    this.thoughtPulse = 0.85;
    if (stanceCue === 'tight') {
      // Subtle inward metacarpal tension ripple
      this.cmc5.addTorqueImpulse(0.95);
      this.fingers.ring.pipFlex.addTorqueImpulse(1.65);
      this.fingers.pinky.pipFlex.addTorqueImpulse(1.85);
      this.thumb.cmcFlex.addTorqueImpulse(1.1);
    } else if (stanceCue === 'poised') {
      // Subtle radial index/middle edge readiness twitch
      this.fingers.index.mcpAbd.addTorqueImpulse(1.15);
      this.fingers.middle.mcpFlex.addTorqueImpulse(-1.1);
      this.forearmPron.addTorqueImpulse(1.1);
    } else {
      // Subtle palmar extension & thumb unlatch micro-twitch
      this.thumb.cmcAbd.addTorqueImpulse(1.25);
      this.fingers.index.mcpFlex.addTorqueImpulse(-1.25);
      this.fingers.pinky.mcpAbd.addTorqueImpulse(-0.95);
      this.mcPitch.addTorqueImpulse(-0.9);
    }
  }

  public injectClashShock(intensity: number): void {
    for (let i = 0; i < FINGER_NAMES.length; i++) {
      const f = this.fingers[FINGER_NAMES[i]];
      const sign = i % 2 === 0 ? 1 : -0.82;
      f.mcpFlex.addTorqueImpulse(-intensity * 2.4 * sign);
      f.pipFlex.addTorqueImpulse(intensity * 3.1);
      f.dipFlex.addTorqueImpulse(intensity * 2.6);
      f.mcpAxialTwist.addTorqueImpulse(intensity * 0.9 * sign);
    }
    this.rcPitch.addTorqueImpulse(-intensity * 1.4);
    this.mcPitch.addTorqueImpulse(-intensity * 1.8);
  }

  /**
   * Step the 8-Layer 38-DOF Biomechanical Articulation Engine forward by `dt` seconds.
   * Uses 6× sub-stepping in Ultra mode + C² Quintic target blending for ultra-silky ("ぬるぬる") fluidity!
   */
  public step(
    dt: number,
    wristLinearVel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    extraWristPitch = 0,
    extraWristRoll = 0
  ): JHandSolvedFrame {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    this.simClock += safeDt;
    this.poseElapsed += safeDt;
    this.thoughtPulse = Math.max(0, this.thoughtPulse - safeDt * 1.55);

    this.sleeveRustleCooldown = Math.max(0, this.sleeveRustleCooldown - safeDt);
    this.tendonCreakCooldown = Math.max(0, this.tendonCreakCooldown - safeDt);
    this.wristCrackCooldown = Math.max(0, this.wristCrackCooldown - safeDt);
    this.nailClickCooldown = Math.max(0, this.nailClickCooldown - safeDt);

    const ultra = this.mode === 'biomech_ultra';
    const pro = this.mode === 'biomech_ultra' || this.mode === 'biomech_pro';
    const subSteps = ultra ? 6 : 4;
    const foleyEvents: HandFoleyEvent[] = [];

    // C² Quintic target blend factor for silky zero-jerk transitions!
    const qBlend = quinticSmooth(this.poseElapsed / Math.max(0.001, this.blendDuration));

    // -------------------------------------------------------------------------
    // Compute wrist linear & angular acceleration for Layer 5 Inertial Whip-Lag
    // -------------------------------------------------------------------------
    const linAccelY = (wristLinearVel.y - this.prevWristLinearVel.y) / safeDt;
    const linAccelX = (wristLinearVel.x - this.prevWristLinearVel.x) / safeDt;
    this.prevWristLinearVel = { ...wristLinearVel };

    const combinedWristVel = this.rcPitch.vel + this.mcPitch.vel;
    const wristSpeed = Math.hypot(
      wristLinearVel.x,
      wristLinearVel.y,
      wristLinearVel.z,
      combinedWristVel * 0.25,
      this.forearmPron.vel * 0.22
    );

    // -------------------------------------------------------------------------
    // Layer 2: DRUJ Forearm Pronation + Two-Row Carpal Wrist (Radiocarpal + Midcarpal + DTM)
    // -------------------------------------------------------------------------
    const kW = this.baseStiffness * 0.86;
    const dW = this.baseDamping * 0.94;
    const tgtForearmPron = lerpScalar(this.prevTarget.forearmPronation, this.target.forearmPronation, qBlend);
    const tgtWristYaw = lerpScalar(this.prevTarget.wristYaw, this.target.wristYaw, qBlend);
    const tgtWristRoll = lerpScalar(this.prevTarget.wristRoll, this.target.wristRoll, qBlend);
    const tgtWristPitch = lerpScalar(this.prevTarget.wristPitch, this.target.wristPitch, qBlend);

    this.forearmPron.step(
      tgtForearmPron + extraWristRoll * 0.54,
      kW,
      dW,
      0,
      safeDt,
      46,
      subSteps
    );
    this.wristYaw.step(tgtWristYaw, kW, dW, 0, safeDt, 46, subSteps);
    this.wristRoll.step(tgtWristRoll, kW * 1.05, dW, 0, safeDt, 46, subSteps);

    // Dart-Thrower's Motion (DTM) oblique plane coupling: radial deviation biases subtle extension!
    const dtmBias = ultra ? -this.wristYaw.pos * 0.14 : 0;
    const targetTotalPitch = tgtWristPitch + dtmBias;

    // Anatomical carpal row partition:
    // Dorsal extension (<0): ~42% Radiocarpal + ~58% Midcarpal
    // Palmar flexion (>0):  ~52% Radiocarpal + ~48% Midcarpal
    const rcShare = ultra ? (targetTotalPitch < 0 ? 0.42 : 0.52) : 0.5;
    const mcShare = 1.0 - rcShare;
    this.rcPitch.step(targetTotalPitch * rcShare, kW * 0.92, dW * 0.96, 0, safeDt, 44, subSteps);
    this.mcPitch.step(targetTotalPitch * mcShare, kW * 1.12, dW * 0.9, 0, safeDt, 52, subSteps);

    const totalWristPitch = this.rcPitch.pos + this.mcPitch.pos;
    const wristPitchAccel = (combinedWristVel - this.prevWristPitchVel) / safeDt;
    this.prevWristPitchVel = combinedWristVel;

    // DRUJ Ulnar Styloid dorsal prominence shifts visibly as radius crosses ulna during pronation!
    const ulnarTarget = Math.max(0, Math.min(1, 0.35 + this.forearmPron.pos * 0.65));
    this.ulnarStyloidSmooth += (ulnarTarget - this.ulnarStyloidSmooth) * Math.min(1, safeDt * 12);

    // Emit realistic silk/velvet sleeve rustle when forearm pronates or swings swiftly!
    if (
      ultra &&
      (Math.abs(this.forearmPron.vel) > 2.4 || wristSpeed > 1.85) &&
      this.sleeveRustleCooldown <= 0
    ) {
      this.sleeveRustleCooldown = 0.28;
      foleyEvents.push({
        type: 'sleeve_rustle',
        intensity: Math.min(1, Math.max(Math.abs(this.forearmPron.vel) / 6.5, wristSpeed / 3.8)),
        finger: 'sleeve',
      });
    }

    // Subtle radiocarpal settle micro-crack when coiling forcefully into deep windup!
    if (
      ultra &&
      this.currentPoseKey === 'windup' &&
      this.poseElapsed > 0.015 &&
      this.poseElapsed < 0.18 &&
      (Math.abs(combinedWristVel) > 1.25 || Math.abs(this.forearmPron.vel) > 1.65) &&
      this.wristCrackCooldown <= 0
    ) {
      this.wristCrackCooldown = 1.6;
      foleyEvents.push({
        type: 'wrist_crack',
        intensity: Math.min(0.85, Math.max(Math.abs(combinedWristVel), Math.abs(this.forearmPron.vel)) / 4.2),
        finger: 'wrist',
      });
    }

    // Clamped inertial whip excitation propagating down the phalangeal chain
    const rawWhipTorque = pro
      ? Math.max(-24, Math.min(24, -linAccelY * 1.2 - wristPitchAccel * 0.38 + linAccelX * 0.3))
      : 0;
    this.smoothedWhipLag += (Math.abs(rawWhipTorque) * 0.0088 - this.smoothedWhipLag) * Math.min(1, safeDt * 14);

    // -------------------------------------------------------------------------
    // Layer 3A: Landsmeer Tenodesis Effect (Wrist extension passively pulls finger flexors!)
    // -------------------------------------------------------------------------
    const effectiveWristPitch = totalWristPitch + extraWristPitch;
    const tenodesisFlex = pro ? Math.max(-0.085, Math.min(0.17, -effectiveWristPitch * 0.23)) : 0;

    // -------------------------------------------------------------------------
    // Layer 1B: Two-Stage Intrinsic / Extrinsic Neuromotor Synergy Modulation!
    // -------------------------------------------------------------------------
    let intrinsicTarget = 0;
    let hookPipBoost = 0;
    let hookMcpHoldback = 0;
    let bloomPipLag = 0;
    if (ultra && this.poseElapsed < 0.22) {
      const p = this.poseElapsed;
      if (this.activeSynergy === 'hook_roll_clamp') {
        // Phase 1 (0..65ms): Extrinsic FDP/FDS hook PIP & DIP first while MCP rolls slightly behind!
        const hookWindow = Math.sin(Math.min(1, p / 0.085) * Math.PI);
        hookPipBoost = hookWindow * 0.28;
        hookMcpHoldback = -hookWindow * 0.22;
        intrinsicTarget = -0.85;
      } else if (this.activeSynergy === 'unlatch_bloom_fan') {
        // Phase 2 (15..115ms): Intrinsic-Plus lumbrical sweep extends MCP first while PIP/DIP gracefully trail!
        const bloomWindow = Math.sin(Math.min(1, p / 0.11) * Math.PI);
        bloomPipLag = bloomWindow * 0.34;
        intrinsicTarget = 0.92;
      } else if (this.activeSynergy === 'clamp_fire_shear') {
        intrinsicTarget = 0.45;
      }
    } else if (this.currentPoseKey === PAPER || this.currentPoseKey === 'salute') {
      intrinsicTarget = 0.65;
    } else if (this.currentPoseKey === ROCK || this.currentPoseKey === 'windup') {
      intrinsicTarget = -0.7;
    }
    this.intrinsicToneSmooth += (intrinsicTarget - this.intrinsicToneSmooth) * Math.min(1, safeDt * 14);

    // -------------------------------------------------------------------------
    // Scissors Dynamic Double-Snip Modulation
    // -------------------------------------------------------------------------
    let snipSpread = 0;
    let snipPitch = 0;
    if (this.scissorSnipTimer > 0) {
      this.scissorSnipTimer = Math.max(0, this.scissorSnipTimer - safeDt);
      if (this.currentPoseKey === SCISSORS) {
        const p = (0.56 - this.scissorSnipTimer) / 0.56;
        const snipWave = Math.sin(p * Math.PI * 4.0);
        const closeAmt = Math.max(0, snipWave) * Math.exp(-p * 0.85);
        snipSpread = -closeAmt * 0.26;
        snipPitch = closeAmt * 0.088;

        const cycleIdx = Math.floor(p * 2);
        if (closeAmt > 0.42 && cycleIdx !== this.lastSnipPulseIdx) {
          this.lastSnipPulseIdx = cycleIdx;
          foleyEvents.push({ type: 'scissors_shear', intensity: 0.78 - cycleIdx * 0.14, finger: 'index' });
        }
      }
    }

    // -------------------------------------------------------------------------
    // Layer 7: Stochastic 1/f Pink Micro-Life + 1.15 Hz Arterial Pulse + 8.5–12.5 Hz Tremor
    // -------------------------------------------------------------------------
    const tgtEffort = lerpScalar(this.prevTarget.effort, this.target.effort, qBlend);
    this.effortSmooth += (tgtEffort - this.effortSmooth) * Math.min(1, safeDt * 8.5);
    const breath = Math.sin(this.simClock * 1.82) + Math.sin(this.simClock * 0.73) * 0.22;
    // Authentic 69 BPM (1.15 Hz) resting arterial pulse systolic peak!
    const pulsePhase = (this.simClock * 1.15) % 1.0;
    const arterialPulse = ultra
      ? Math.exp(-Math.pow((pulsePhase - 0.14) / 0.055, 2)) * 0.0042 +
        Math.exp(-Math.pow((pulsePhase - 0.31) / 0.075, 2)) * 0.0018 // dicrotic notch!
      : 0;
    const drumPhase = this.simClock * 2.08;
    const drumAmp = this.idleDrumWeight * 0.064;
    const thoughtBoost = this.thoughtPulse * 0.095;

    const curMcp: Record<FingerName, number> = {
      index: this.fingers.index.mcpFlex.pos,
      middle: this.fingers.middle.mcpFlex.pos,
      ring: this.fingers.ring.mcpFlex.pos,
      pinky: this.fingers.pinky.mcpFlex.pos,
    };

    const kJ = this.baseStiffness;
    const dJ = this.baseDamping;

    // -------------------------------------------------------------------------
    // Step All 4 Fingers through Layers 1–6 (with per-digit C² Quintic target blending!)
    // -------------------------------------------------------------------------
    for (let idx = 0; idx < FINGER_NAMES.length; idx++) {
      const name = FINGER_NAMES[idx];
      const bank = this.fingers[name];
      const delay = this.cascadeDelays[name];

      if (this.poseElapsed >= delay) {
        const fBlend = quinticSmooth((this.poseElapsed - delay) / Math.max(0.001, this.blendDuration));
        const prevT = this.prevTarget.fingers[name];
        const nextT = this.target.fingers[name];
        const tgtMcpFlex = lerpScalar(prevT.mcpFlex, nextT.mcpFlex, fBlend);
        const tgtMcpAbd = lerpScalar(prevT.mcpAbd, nextT.mcpAbd, fBlend);
        const tgtPipFlex = lerpScalar(prevT.pipFlex, nextT.pipFlex, fBlend);
        const tgtDipFlex = lerpScalar(prevT.dipFlex, nextT.dipFlex, fBlend);

        // Layer 3B: Juncturae Tendinum sympathetic tendon coupling
        let juncturaeOffset = 0;
        if (pro) {
          const row = JUNCTURAE_MATRIX[name];
          for (const other of FINGER_NAMES) {
            const w = row[other];
            if (w > 0) {
              juncturaeOffset += (curMcp[other] - bank.mcpFlex.pos) * w * 0.34;
            }
          }
        }

        // Layer 7: Pink 1/f organic drift + contemplation wave + arterial pulse + effort-scaled tremor
        const wave =
          Math.pow(Math.max(0, Math.sin(drumPhase - idx * 0.68)), 3) * (drumAmp + thoughtBoost);
        const pinkDrift = ultra ? pinkBioDrift(this.simClock, idx * 2.17) * (0.007 + this.idleDrumWeight * 0.012) : 0;
        const tremorHz = 8.6 + idx * 1.18 + (idx === 1 ? 0.3 : 0);
        const microTremor = pro
          ? Math.sin(this.simClock * Math.PI * 2 * tremorHz + idx * 1.93) *
            (0.002 + this.effortSmooth * 0.0058)
          : 0;
        const bioOverlay =
          breath * (0.012 + idx * 0.0042) + wave + pinkDrift + arterialPulse + microTremor;

        // Scissors blade overlay
        const extraSpread = name === 'index' ? snipSpread : name === 'middle' ? -snipSpread : 0;
        const extraCurl = name === 'index' ? snipPitch : name === 'middle' ? -snipPitch * 0.55 : 0;

        // Layer 4A: Collateral-Ligament Abduction–Flexion Convergence
        const flexFactor = Math.max(0, bank.mcpFlex.pos) / 1.65;
        const ligamentAbdGain = pro ? Math.pow(Math.max(0.07, 1.0 - flexFactor * 0.9), 1.38) : 1.0;
        const effectiveAbdTarget = (tgtMcpAbd + extraSpread) * ligamentAbdGain;

        // Layer 1B Two-Stage Synergy offset applied to MCP vs PIP
        const isBlade = this.currentPoseKey === SCISSORS && (name === 'index' || name === 'middle');
        const mcpSynergy = isBlade ? 0 : hookMcpHoldback;
        const pipSynergy = isBlade ? 0 : hookPipBoost + bloomPipLag;

        const mcpTarget = tgtMcpFlex + tenodesisFlex + juncturaeOffset + bioOverlay + extraCurl + mcpSynergy;
        bank.mcpFlex.step(mcpTarget, kJ, dJ, rawWhipTorque * 0.42, safeDt, 48, subSteps);
        bank.mcpAbd.step(effectiveAbdTarget, kJ * 0.9, dJ * 0.92, 0, safeDt, 50, subSteps);

        // Layer 4B: True Passive MCP Axial Twist (scaphoid convergence + dynamic pronation roll!)
        const twistTarget = pro
          ? CONVERGENCE_FACTORS[name] * Math.max(0, bank.mcpFlex.pos / 1.52) +
            (ultra ? bank.mcpAbd.pos * -0.09 : 0)
          : 0;
        bank.mcpAxialTwist.step(twistTarget, kJ * 0.8, dJ * 0.96, 0, safeDt, 42, subSteps);

        // PIP integration with stronger mid-chain inertial whip
        const pipTarget = tgtPipFlex + tenodesisFlex * 0.9 + bioOverlay * 0.85 + pipSynergy;
        bank.pipFlex.step(pipTarget, kJ * 1.08, dJ * 0.94, rawWhipTorque * 0.84, safeDt, 52, subSteps);

        // Layer 3C: Oblique Retinacular Ligament (ORL) + Central Slip DIP–PIP Biomechanical Coupling!
        const orlDipTarget = pro
          ? 0.67 * bank.pipFlex.pos + 0.33 * (tgtDipFlex + bioOverlay * 0.48 + pipSynergy * 0.45)
          : tgtDipFlex + bioOverlay * 0.55;
        bank.dipFlex.step(orlDipTarget, kJ * 1.18, dJ * 0.91, rawWhipTorque * 1.16, safeDt, 54, subSteps);

        // Layer 6A: Analytical Fingertip-to-Palm-Bed Elastic Contact & Pulp Pad Compression!
        const closureMetric = (bank.mcpFlex.pos + bank.pipFlex.pos * 1.1 + bank.dipFlex.pos * 0.5) / 3.95;
        const contact = Math.max(0, Math.min(1, (closureMetric - 0.81) / 0.19));
        bank.prevPalmContact = bank.palmContact;
        bank.palmContact = contact;
        bank.pulpCompression += (contact - bank.pulpCompression) * Math.min(1, safeDt * 24);

        if (contact > 0.22 && bank.pipFlex.vel > 0.4) {
          bank.pipFlex.vel *= Math.max(0.52, 1.0 - contact * 0.38);
          bank.dipFlex.vel *= Math.max(0.52, 1.0 - contact * 0.38);
        }

        // Layer 8: Emit Rich Articulated Micro-Foley Events to JSound Engin 1.3!
        if (
          contact > 0.45 &&
          bank.prevPalmContact <= 0.45 &&
          bank.pipFlex.vel > 3.0 &&
          bank.pipFlex.lastSnapCooldown <= 0
        ) {
          bank.pipFlex.lastSnapCooldown = 0.22;
          foleyEvents.push({
            type: idx <= 1 ? 'palm_clench' : 'knuckle_snap',
            intensity: Math.min(1, bank.pipFlex.vel / 13.5),
            finger: name,
          });
          // Delicate fingernail-to-palm micro-click on crisp closure!
          if (ultra && idx >= 1 && bank.pipFlex.vel > 3.6 && this.nailClickCooldown <= 0) {
            this.nailClickCooldown = 0.35;
            foleyEvents.push({
              type: 'nail_click',
              intensity: Math.min(0.9, bank.pipFlex.vel / 13.0),
              finger: name,
            });
          }
        } else if (
          Math.abs(bank.mcpFlex.vel) > 9.2 &&
          bank.mcpFlex.lastSnapCooldown <= 0 &&
          idx <= 1
        ) {
          bank.mcpFlex.lastSnapCooldown = 0.25;
          foleyEvents.push({
            type: 'finger_whip',
            intensity: Math.min(1, Math.abs(bank.mcpFlex.vel) / 17.5),
            finger: name,
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // Layer 6B: Adjacent-Finger Capsule Separation Solver (Zero Interpenetration!)
    // -------------------------------------------------------------------------
    if (pro) {
      const minOrderGap = 0.036;
      const pairs: Array<[FingerName, FingerName]> = [
        ['index', 'middle'],
        ['middle', 'ring'],
        ['ring', 'pinky'],
      ];
      for (const [radial, ulnar] of pairs) {
        const rB = this.fingers[radial];
        const uB = this.fingers[ulnar];
        const flexProximity = Math.exp(-Math.abs(rB.mcpFlex.pos - uB.mcpFlex.pos) * 2.2);
        const gap = rB.mcpAbd.pos - uB.mcpAbd.pos;
        const required = minOrderGap * flexProximity;
        if (gap < required) {
          const push = (required - gap) * 0.48;
          rB.mcpAbd.pos = Math.min(ANATOMICAL_ROM.finger.mcpAbd.max, rB.mcpAbd.pos + push);
          uB.mcpAbd.pos = Math.max(ANATOMICAL_ROM.finger.mcpAbd.min, uB.mcpAbd.pos - push);
          // Subtle lateral contact roll when fingers press side-by-side!
          if (ultra) {
            rB.mcpAxialTwist.vel -= push * 0.6;
            uB.mcpAxialTwist.vel += push * 0.6;
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Step 6-DOF True Saddle-Joint Thumb with Clearance Arc + IP Hyperextension Clamp!
    // -------------------------------------------------------------------------
    const thumbDelay = this.cascadeDelays.thumb;
    if (this.poseElapsed >= thumbDelay) {
      const tBlend = quinticSmooth((this.poseElapsed - thumbDelay) / Math.max(0.001, this.blendDuration));
      const indexClosure = Math.max(0, Math.min(1, this.fingers.index.mcpFlex.pos / 1.45));
      const ringClosure = Math.max(0, Math.min(1, this.fingers.ring.mcpFlex.pos / 1.45));

      let thumbClearanceLift = 0;
      if (pro && (this.currentPoseKey === ROCK || this.currentPoseKey === 'windup')) {
        const sweepWindow = Math.sin(indexClosure * Math.PI);
        thumbClearanceLift = sweepWindow * 0.3;
      } else if (pro && this.currentPoseKey === SCISSORS) {
        const sweepWindow = Math.sin(ringClosure * Math.PI);
        thumbClearanceLift = sweepWindow * 0.25;
      }

      const prevTh = this.prevTarget.thumb;
      const nextTh = this.target.thumb;
      const thCmcFlex = lerpScalar(prevTh.cmcFlex, nextTh.cmcFlex, tBlend);
      const thCmcAbd = lerpScalar(prevTh.cmcAbd, nextTh.cmcAbd, tBlend);
      const thCmcPron = lerpScalar(prevTh.cmcPronation, nextTh.cmcPronation, tBlend);
      const thMcpFlex = lerpScalar(prevTh.mcpFlex, nextTh.mcpFlex, tBlend);
      const thMcpAbd = lerpScalar(prevTh.mcpAbd, nextTh.mcpAbd, tBlend);
      const thIpFlex = lerpScalar(prevTh.ipFlex, nextTh.ipFlex, tBlend);

      const thumbDrift = ultra ? pinkBioDrift(this.simClock, 9.31) * (0.006 + this.idleDrumWeight * 0.01) : 0;
      const thumbTremor = pro
        ? Math.sin(this.simClock * Math.PI * 2 * 9.35) * (0.002 + this.effortSmooth * 0.0044)
        : 0;

      // Firm fist lock induces realistic subtle IP distal pad counter-hyperextension press!
      const firmPressHyperExt =
        ultra && this.currentPoseKey === ROCK && indexClosure > 0.86 ? -0.09 : 0;

      this.thumb.cmcFlex.step(
        thCmcFlex - thumbClearanceLift * 0.55 + thumbDrift + thumbTremor,
        kJ,
        dJ,
        0,
        safeDt,
        48,
        subSteps
      );
      this.thumb.cmcAbd.step(thCmcAbd + thumbClearanceLift * 0.75, kJ, dJ, 0, safeDt, 48, subSteps);
      this.thumb.cmcPronation.step(thCmcPron, kJ * 0.96, dJ * 0.95, 0, safeDt, 46, subSteps);
      this.thumb.mcpFlex.step(
        thMcpFlex - thumbClearanceLift * 0.34,
        kJ * 1.05,
        dJ,
        rawWhipTorque * 0.28,
        safeDt,
        50,
        subSteps
      );
      this.thumb.mcpAbd.step(ultra ? thMcpAbd : 0, kJ * 0.9, dJ * 0.96, 0, safeDt, 46, subSteps);
      this.thumb.ipFlex.step(
        thIpFlex + firmPressHyperExt,
        kJ * 1.15,
        dJ * 0.92,
        rawWhipTorque * 0.48,
        safeDt,
        52,
        subSteps
      );

      const fc = Math.max(
        0,
        Math.min(1, (-this.thumb.cmcAbd.pos - 0.6) * 2.4 * Math.max(indexClosure, ringClosure))
      );
      this.thumb.prevFingerContact = this.thumb.fingerContact;
      this.thumb.fingerContact = fc;
      this.thumb.pulpCompression += (fc - this.thumb.pulpCompression) * Math.min(1, safeDt * 22);

      // Emit crisp `'thumb_lock'` Foley the exact millisecond thumb locks across closed fingers!
      if (
        ultra &&
        fc > 0.34 &&
        this.thumb.prevFingerContact <= 0.34 &&
        Math.abs(this.thumb.cmcAbd.vel) > 0.75 &&
        this.thumb.cmcAbd.lastSnapCooldown <= 0
      ) {
        this.thumb.cmcAbd.lastSnapCooldown = 0.28;
        foleyEvents.push({
          type: 'thumb_lock',
          intensity: Math.min(1, Math.abs(this.thumb.cmcAbd.vel) / 6.5 + 0.24),
          finger: 'thumb',
        });
      }
    }

    // -------------------------------------------------------------------------
    // Layer 3D: 5-Metacarpal 3-Arch Palmar Skeleton + Intrinsic Muscle Bulges + Webbing!
    // -------------------------------------------------------------------------
    const idxFlexNorm = Math.max(0, Math.min(1, this.fingers.index.mcpFlex.pos / 1.6));
    const midFlexNorm = Math.max(0, Math.min(1, this.fingers.middle.mcpFlex.pos / 1.6));
    const ringFlexNorm = Math.max(0, Math.min(1, this.fingers.ring.mcpFlex.pos / 1.6));
    const pinkyFlexNorm = Math.max(0, Math.min(1, this.fingers.pinky.mcpFlex.pos / 1.6));
    const tgtPalmCup = lerpScalar(this.prevTarget.palmCupBias, this.target.palmCupBias, qBlend);

    this.cmc2.step(ultra ? idxFlexNorm * 0.042 + tgtPalmCup * 0.014 : 0, kW, dW, 0, safeDt, 44, subSteps);
    this.cmc3.step(ultra ? midFlexNorm * 0.026 + tgtPalmCup * 0.008 : 0, kW, dW, 0, safeDt, 44, subSteps);
    this.cmc4.step(pro ? ringFlexNorm * 0.165 + tgtPalmCup * 0.058 : 0, kW * 1.1, dW, 0, safeDt, 46, subSteps);
    this.cmc5.step(pro ? pinkyFlexNorm * 0.265 + tgtPalmCup * 0.095 : 0, kW * 1.1, dW, 0, safeDt, 46, subSteps);
    // 5th metacarpal axial opposition supination rotates pinky heel toward thumb during Rock/Envelop!
    this.cmc5Sup.step(
      ultra ? pinkyFlexNorm * 0.22 + tgtPalmCup * 0.095 : 0,
      kW * 1.05,
      dW,
      0,
      safeDt,
      46,
      subSteps
    );

    const archCup = Math.max(0, Math.min(1, (this.cmc4.pos / 0.22 + this.cmc5.pos / 0.35) * 0.5));
    const thenarTarget = Math.max(
      0,
      Math.min(1, (this.thumb.cmcFlex.pos * 0.72 + Math.max(0, -this.thumb.cmcAbd.pos) * 0.55) * 0.88)
    );
    const hypoTarget = Math.max(0, Math.min(1, archCup * 0.78 + pinkyFlexNorm * 0.32));
    // First Dorsal Interosseous (FDI) muscle in thumb-index web swells dramatically on thumb pinch/lock!
    const fdiTarget = Math.max(
      0,
      Math.min(1, this.thumb.fingerContact * 0.72 + this.effortSmooth * idxFlexNorm * 0.45)
    );
    const flexTendonTarget = Math.max(
      0,
      Math.min(1, Math.max(0, totalWristPitch * 0.85) + this.effortSmooth * 0.65)
    );

    const softRate = Math.min(1, safeDt * 13);
    this.thenarBulgeSmooth += (thenarTarget - this.thenarBulgeSmooth) * softRate;
    this.hypothenarBulgeSmooth += (hypoTarget - this.hypothenarBulgeSmooth) * softRate;
    this.fdiBulgeSmooth += (fdiTarget - this.fdiBulgeSmooth) * softRate;
    this.flexorTendonSmooth += (flexTendonTarget - this.flexorTendonSmooth) * softRate;

    // 3 Interdigital Commissural Webbing stretch factors (spread + flexion divergence)
    const webIM = Math.max(
      0,
      Math.min(
        1,
        (this.fingers.index.mcpAbd.pos - this.fingers.middle.mcpAbd.pos) * 1.65 +
          Math.abs(this.fingers.index.mcpFlex.pos - this.fingers.middle.mcpFlex.pos) * 0.42
      )
    );
    const webMR = Math.max(
      0,
      Math.min(
        1,
        (this.fingers.middle.mcpAbd.pos - this.fingers.ring.mcpAbd.pos) * 1.65 +
          Math.abs(this.fingers.middle.mcpFlex.pos - this.fingers.ring.mcpFlex.pos) * 0.48
      )
    );
    const webRP = Math.max(
      0,
      Math.min(
        1,
        (this.fingers.ring.mcpAbd.pos - this.fingers.pinky.mcpAbd.pos) * 1.75 +
          Math.abs(this.fingers.ring.mcpFlex.pos - this.fingers.pinky.mcpFlex.pos) * 0.42
      )
    );

    // -------------------------------------------------------------------------
    // Layer 4C: Eccentric Cam-Axis Volar ICR Glide + Dorsal Extensor Tendon Tensions!
    // -------------------------------------------------------------------------
    const dorsalTendons: [number, number, number, number] = [0, 0, 0, 0];
    const fingerStates = {} as Record<FingerName, FingerJointState>;
    let peakIcrMeters = 0;

    for (let i = 0; i < FINGER_NAMES.length; i++) {
      const name = FINGER_NAMES[i];
      const b = this.fingers[name];

      const extTension = Math.max(0, Math.min(1, 1.0 - (b.mcpFlex.pos + 0.18) / 1.25));
      const clenchStretch = Math.max(0, Math.min(1, (b.mcpFlex.pos - 1.05) / 0.6)) * 0.68;
      const tension = Math.max(
        0,
        Math.min(1, extTension * 0.94 + clenchStretch + Math.abs(b.mcpFlex.vel) * 0.028)
      );
      dorsalTendons[i] = tension;

      // Eccentric Cam-Axis Volar Translation (anatomical ICR glide keeps knuckles crisp & unpinched!)
      const mcpFlexClamped = Math.max(0, b.mcpFlex.pos);
      const pipFlexClamped = Math.max(0, b.pipFlex.pos);
      const dipFlexClamped = Math.max(0, b.dipFlex.pos);

      const mcpVolarGlide = ultra ? Math.sin(Math.min(1.57, mcpFlexClamped * 0.92)) * 0.0036 : 0;
      const pipVolarGlide = ultra ? Math.sin(Math.min(1.57, pipFlexClamped * 0.88)) * 0.0024 : 0;
      const dipVolarGlide = ultra ? Math.sin(Math.min(1.57, dipFlexClamped * 0.95)) * 0.0013 : 0;
      if (mcpVolarGlide > peakIcrMeters) peakIcrMeters = mcpVolarGlide;

      const knuckleCreaseStretch = Math.max(0, Math.min(1, (mcpFlexClamped + pipFlexClamped * 0.65) / 2.65));
      const dipCant = ultra ? DIP_CANT_FACTORS[name] * Math.max(0, b.pipFlex.pos / 1.65) : 0;

      fingerStates[name] = {
        mcpFlex: b.mcpFlex.pos,
        mcpAbd: b.mcpAbd.pos,
        mcpAxialTwist: b.mcpAxialTwist.pos,
        pipFlex: b.pipFlex.pos,
        dipFlex: b.dipFlex.pos,
        dipCant,
        convergenceRoll: b.mcpAxialTwist.pos,
        mcpVolarGlide,
        pipVolarGlide,
        dipVolarGlide,
        knuckleCreaseStretch,
        tendonTension: tension,
        palmContact: b.palmContact,
        pulpCompression: b.pulpCompression,
      };
    }

    this.lastPeakIcrGlideMm = peakIcrMeters * 1000;

    // Juncturae Tendinum visible diagonal collagen band tensions (Middle↔Ring & Ring↔Pinky)
    const juncMR = Math.max(
      0,
      Math.min(1, (dorsalTendons[1] + dorsalTendons[2]) * 0.45 + Math.abs(curMcp.middle - curMcp.ring) * 0.35)
    );
    const juncRP = Math.max(
      0,
      Math.min(1, (dorsalTendons[2] + dorsalTendons[3]) * 0.45 + Math.abs(curMcp.ring - curMcp.pinky) * 0.35)
    );

    // Subtle tendon/horological tension creak during explosive high-effort transitions (Scissors/Paper)
    if (
      ultra &&
      this.poseElapsed > 0.02 &&
      this.poseElapsed < 0.16 &&
      this.effortSmooth > 0.72 &&
      (dorsalTendons[0] > 0.82 || juncMR > 0.75) &&
      this.tendonCreakCooldown <= 0
    ) {
      this.tendonCreakCooldown = 0.55;
      foleyEvents.push({
        type: 'tendon_creak',
        intensity: Math.min(1, Math.max(dorsalTendons[0], juncMR)),
        finger: 'palm',
      });
    }

    // Extensor Pollicis Longus (EPL) snuffbox tendon rises vividly on Paper extension!
    const eplTendonTension = Math.max(
      0,
      Math.min(1, (this.thumb.cmcAbd.pos + 0.55) * 0.92 + Math.max(0, -this.thumb.ipFlex.pos) * 1.4)
    );

    const thumbState: ThumbJointState = {
      cmcFlex: this.thumb.cmcFlex.pos,
      cmcAbd: this.thumb.cmcAbd.pos,
      cmcPronation: this.thumb.cmcPronation.pos,
      mcpFlex: this.thumb.mcpFlex.pos,
      mcpAbd: this.thumb.mcpAbd.pos,
      ipFlex: this.thumb.ipFlex.pos,
      eplTendonTension,
      fingerContact: this.thumb.fingerContact,
      pulpCompression: this.thumb.pulpCompression,
    };

    return {
      wrist: {
        forearmPronation: this.forearmPron.pos,
        ulnarStyloidProminence: this.ulnarStyloidSmooth,
        rcPitch: this.rcPitch.pos,
        mcPitch: this.mcPitch.pos,
        wristPitch: totalWristPitch,
        wristYaw: this.wristYaw.pos,
        wristRoll: this.wristRoll.pos,
        flexorTendonTension: this.flexorTendonSmooth,
      },
      palm: {
        cmc2Flex: this.cmc2.pos,
        cmc3Flex: this.cmc3.pos,
        cmc4Flex: this.cmc4.pos,
        cmc5Flex: this.cmc5.pos,
        cmc5Supination: this.cmc5Sup.pos,
        archCup,
        thenarBulge: this.thenarBulgeSmooth,
        hypothenarBulge: this.hypothenarBulgeSmooth,
        fdiBulge: this.fdiBulgeSmooth,
        webbingStretch: [webIM, webMR, webRP],
        juncturaeTension: [juncMR, juncRP],
      },
      thumb: thumbState,
      fingers: fingerStates,
      dorsalTendons,
      intrinsicTone: this.intrinsicToneSmooth,
      muscleEffort: this.effortSmooth,
      kineticSpeed: wristSpeed,
      foleyEvents,
    };
  }

  public getTelemetry(): JHandTelemetry {
    let ratioSum = 0;
    let ratioCnt = 0;
    for (const f of FINGER_NAMES) {
      const pip = this.fingers[f].pipFlex.pos;
      const dip = this.fingers[f].dipFlex.pos;
      if (pip > 0.25) {
        ratioSum += dip / pip;
        ratioCnt++;
      }
    }

    const totalAbsPitch = Math.abs(this.rcPitch.pos) + Math.abs(this.mcPitch.pos);
    const mcSplitPct =
      totalAbsPitch > 0.01 ? Math.round((Math.abs(this.mcPitch.pos) / totalAbsPitch) * 100) : 52;

    const synergyPhaseJp =
      this.activeSynergy === 'hook_roll_clamp'
        ? '外在屈筋フック→握込'
        : this.activeSynergy === 'unlatch_bloom_fan'
        ? '母指解放→虫様筋開花'
        : this.activeSynergy === 'clamp_fire_shear'
        ? '尺側固定→V刃射出'
        : '自然脈動待機';

    return {
      engineName: 'JHand Kinesis 1.1',
      activeDof: this.mode === 'biomech_ultra' ? 38 : this.mode === 'biomech_pro' ? 27 : 21,
      mode: this.mode,
      orlCouplingRatio: ratioCnt > 0 ? Number((ratioSum / ratioCnt).toFixed(2)) : 0.67,
      palmCupDeg: Number(((this.cmc5.pos * 180) / Math.PI).toFixed(1)),
      forearmPronationDeg: Number(((this.forearmPron.pos * 180) / Math.PI).toFixed(1)),
      midcarpalSplitPct: mcSplitPct,
      icrGlideMm: Number(this.lastPeakIcrGlideMm.toFixed(1)),
      fdiBulgePct: Math.round(this.fdiBulgeSmooth * 100),
      muscleEffort: Number(this.effortSmooth.toFixed(2)),
      whipLagDeg: Number(((this.smoothedWhipLag * 180) / Math.PI).toFixed(1)),
      synergyPhaseJp,
    };
  }
}
