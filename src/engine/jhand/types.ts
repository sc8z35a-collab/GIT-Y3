/**
 * ★ JHand Kinesis 1.0 — 27-DOF Biomechanical Hand Articulation Engine Types ★
 *
 * Anatomically modeled hand state including:
 *  - Forearm pronation/supination twist (radius/ulna axial rotation)
 *  - 2-axis Radiocarpal wrist + Tenodesis passive tendon tension
 *  - Dynamic Palmar Metacarpal Arch (CMC4 & CMC5 cupping + Thenar eminence bulge)
 *  - 5-DOF Saddle-Joint Thumb with Kapandji opposition pronation
 *  - 4 × 4-DOF Fingers with ORL DIP–PIP coupling, Juncturae Tendinum inter-digit
 *    bridges, collateral-ligament abduction convergence, and inertial whip-lag
 *  - 4-Channel Dorsal Extensor Tendon tension driving visible 3D tendon ribbons
 *  - Real-time kinetic micro-Foley events streamed directly to JSound Engin 1.0
 */

import { Move } from '../jnv1/types';

export type HandPoseKey = 'ready' | 'windup' | 'envelop' | 'bow' | 'salute' | Move;
export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
export type JHandQualityMode = 'biomech_pro' | 'standard';

export interface JointLimit {
  min: number;
  max: number;
  /** Soft ligament resistance start margin inside [min, max] (radians) */
  softMargin: number;
}

export interface FingerJointState {
  /** MCP flexion (+) / hyperextension (-) in radians */
  mcpFlex: number;
  /** MCP radial/ulnar abduction (positive = toward thumb side) in radians */
  mcpAbd: number;
  /** PIP flexion in radians */
  pipFlex: number;
  /** DIP flexion in radians (coupled with PIP via Oblique Retinacular Ligament) */
  dipFlex: number;
  /** Anatomical scaphoid convergence axial tilt during deep flexion (radians) */
  convergenceRoll: number;
  /** Dorsal extensor tendon tension 0..1 (visibly raises & tightens 3D dorsal tendon cord) */
  tendonTension: number;
  /** Fingertip-to-palm elastic contact pressure 0..1 */
  palmContact: number;
}

export interface ThumbJointState {
  /** CMC flexion/extension (trapeziometacarpal saddle axis 1) */
  cmcFlex: number;
  /** CMC palmar abduction/adduction (saddle axis 2) */
  cmcAbd: number;
  /** CMC Kapandji axial opposition pronation (rotates thumb pad to face fingers) */
  cmcPronation: number;
  /** Thumb MCP flexion */
  mcpFlex: number;
  /** Thumb IP flexion */
  ipFlex: number;
  /** Contact pressure against index/middle or ring finger 0..1 */
  fingerContact: number;
}

export interface PalmArchState {
  /** 4th metacarpal (ring base) palmar cupping flexion (radians, 0..0.24) */
  cmc4Flex: number;
  /** 5th metacarpal (pinky base) palmar cupping flexion (radians, 0..0.38) */
  cmc5Flex: number;
  /** Transverse metacarpal arch depth 0..1 */
  archCup: number;
  /** Thenar eminence (thumb-base muscle) visible bulge/shift 0..1 */
  thenarBulge: number;
}

export interface WristForearmState {
  /** Forearm pronation/supination twist distributed proximal to wrist (radians) */
  forearmPronation: number;
  /** Radiocarpal palmar flexion (+) / dorsal extension (-) (radians) */
  wristPitch: number;
  /** Radial/ulnar deviation (radians) */
  wristYaw: number;
  /** Distal carpal roll residual (radians) */
  wristRoll: number;
}

export interface HandFoleyEvent {
  type: 'knuckle_snap' | 'palm_clench' | 'finger_whip' | 'scissors_shear';
  /** Normalized physical kinetic intensity 0..1 */
  intensity: number;
  /** Which digit or part emitted the micro-event */
  finger?: FingerName | 'thumb' | 'palm';
}

export interface JHandSolvedFrame {
  wrist: WristForearmState;
  palm: PalmArchState;
  thumb: ThumbJointState;
  fingers: Record<FingerName, FingerJointState>;
  /** 4-channel dorsal extensor tendon tension [index, middle, ring, pinky] */
  dorsalTendons: [number, number, number, number];
  /** Total neuromuscular effort / clench tension 0..1 */
  muscleEffort: number;
  /** Instantaneous wrist linear+angular speed metric (for JSound Engin 1.0 whoosh) */
  kineticSpeed: number;
  /** Active micro-Foley events emitted during this simulation step */
  foleyEvents: HandFoleyEvent[];
}

export interface JHandTelemetry {
  activeDof: number;
  mode: JHandQualityMode;
  orlCouplingRatio: number;
  palmCupDeg: number;
  forearmPronationDeg: number;
  muscleEffort: number;
  whipLagDeg: number;
}

/**
 * Physiological Human Hand Range-of-Motion (ROM) Constants (radians).
 * Based on Kapandji "The Physiology of the Joints, Vol. 1: Upper Limb".
 */
export const ANATOMICAL_ROM = {
  finger: {
    mcpFlex: { min: -0.32, max: 1.68, softMargin: 0.14 } as JointLimit,
    mcpAbd: { min: -0.38, max: 0.38, softMargin: 0.06 } as JointLimit,
    pipFlex: { min: 0.0, max: 1.84, softMargin: 0.14 } as JointLimit,
    dipFlex: { min: -0.04, max: 1.32, softMargin: 0.12 } as JointLimit,
  },
  thumb: {
    cmcFlex: { min: -0.18, max: 1.05, softMargin: 0.1 } as JointLimit,
    cmcAbd: { min: -1.15, max: 0.42, softMargin: 0.1 } as JointLimit,
    cmcPronation: { min: -0.45, max: 0.96, softMargin: 0.08 } as JointLimit,
    mcpFlex: { min: -0.08, max: 1.02, softMargin: 0.09 } as JointLimit,
    ipFlex: { min: -0.12, max: 1.24, softMargin: 0.1 } as JointLimit,
  },
  palm: {
    cmc4Flex: { min: -0.03, max: 0.24, softMargin: 0.03 } as JointLimit,
    cmc5Flex: { min: -0.04, max: 0.38, softMargin: 0.04 } as JointLimit,
  },
  wrist: {
    forearmPronation: { min: -0.95, max: 1.15, softMargin: 0.12 } as JointLimit,
    pitch: { min: -0.78, max: 0.85, softMargin: 0.1 } as JointLimit,
    yaw: { min: -0.38, max: 0.48, softMargin: 0.06 } as JointLimit,
    roll: { min: -0.65, max: 0.65, softMargin: 0.08 } as JointLimit,
  },
} as const;
