/**
 * ★ JHand Kinesis 1.1 — 38-DOF Anatomical Micro-Kinematics & Tendon-Pulley-Skin Types ★
 *
 * Upgraded from 27-DOF (v1.0) to full 38-DOF human hand biomechanics:
 *  - Forearm Distal Radioulnar Joint (DRUJ) pronation/supination + visible ulnar styloid shift (2 DOF)
 *  - Two-Row Carpal Wrist (Radiocarpal + Midcarpal pitch with Dart-Thrower's Motion coupling,
 *    radial/ulnar deviation, carpal roll + volar FCR/PL wrist flexor tendon tension) (4 DOF)
 *  - 5-Metacarpal 3-Arch Palmar Skeleton (CMC2/CMC3 compliance, CMC4/CMC5 cupping + CMC5 axial
 *    opposition supination, Thenar, Hypothenar, First Dorsal Interosseous FDI web muscle,
 *    and 3 Interdigital Commissural Webbing stretches) (5 DOF)
 *  - 6-DOF True Saddle-Joint Thumb (CMC Flex/Abd/Pronation + MCP Flex/Abd + IP Flex/Hyperextension
 *    + Extensor Pollicis Longus EPL snuffbox tendon + distal pulp compression) (6 DOF)
 *  - 4 × 5-DOF Fingers (MCP Flex/Abd/AxialTwist, PIP Flex, DIP Flex with ORL + Central Slip
 *    coupling, clinodactyly packing cant, Eccentric Cam-Axis Volar ICR Glide, dorsal hood crease
 *    stretch, pulp pad compression, and 4×4 Juncturae Tendinum collagen bands) (20 DOF)
 *  - Neuromuscular Intrinsic/Extrinsic Synergy Tone State (1 DOF) => 38 Total DOF!
 *  - 9-Channel Kinetic Micro-Foley Stream routed directly to JSound Engin 1.1
 */

import { Move } from '../jnv1/types';

export type HandPoseKey =
  | 'ready'
  | 'windup'
  | 'envelop'
  | 'bow'
  | 'salute'
  | 'guard'
  | 'feint_flick'
  | 'beckon'
  | 'knuckle_crack'
  | 'blade_edge'
  | 'crane_poise'
  | 'claw_charge'
  | 'finger_gun'
  | 'palm_meditate'
  | 'victory_fist'
  | 'lotus_mudra'
  | 'sword_seal'
  | 'tiger_palm'
  | 'iron_knuckle'
  | 'tea_whisk'
  | 'fan_hold'
  | 'brush_grip'
  | 'koto_pluck'
  | 'snap_ready'
  | 'snap_release'
  | 'peace_tilt'
  | 'open_offer'
  | 'fist_pump'
  | 'defeat_slump'
  | 'stealth_curl'
  | 'wave_flourish'
  | 'counter_parry'
  | 'zen_circle'
  | Move;

export interface HandPoseMeta {
  key: HandPoseKey;
  labelJp: string;
  category: 'core' | 'martial' | 'craft' | 'expressive';
}

export const HAND_POSE_CATALOG: HandPoseMeta[] = [
  { key: 'ready', labelJp: '自然構え', category: 'core' },
  { key: 'windup', labelJp: '溜め拳', category: 'core' },
  { key: 0, labelJp: '剛拳（グー）', category: 'core' },
  { key: 1, labelJp: '双刃（チョキ）', category: 'core' },
  { key: 2, labelJp: '開掌（パー）', category: 'core' },
  { key: 'envelop', labelJp: '包摂掌', category: 'core' },
  { key: 'bow', labelJp: '一礼', category: 'expressive' },
  { key: 'salute', labelJp: '敬礼掌', category: 'expressive' },
  { key: 'guard', labelJp: '手刀防御', category: 'martial' },
  { key: 'feint_flick', labelJp: '牽制弾き', category: 'martial' },
  { key: 'beckon', labelJp: '手招き', category: 'expressive' },
  { key: 'knuckle_crack', labelJp: '拳鳴らし', category: 'martial' },
  { key: 'blade_edge', labelJp: '貫手・手刀', category: 'martial' },
  { key: 'crane_poise', labelJp: '鶴の構え', category: 'martial' },
  { key: 'claw_charge', labelJp: '虎爪・極気迫', category: 'martial' },
  { key: 'finger_gun', labelJp: '一指極め', category: 'expressive' },
  { key: 'palm_meditate', labelJp: '静寂開掌', category: 'craft' },
  { key: 'victory_fist', labelJp: '勝鬨拳', category: 'expressive' },
  { key: 'lotus_mudra', labelJp: '蓮華印', category: 'craft' },
  { key: 'sword_seal', labelJp: '剣印（九字）', category: 'martial' },
  { key: 'tiger_palm', labelJp: '虎掌打', category: 'martial' },
  { key: 'iron_knuckle', labelJp: '鳳眼拳', category: 'martial' },
  { key: 'tea_whisk', labelJp: '茶筅持ち', category: 'craft' },
  { key: 'fan_hold', labelJp: '舞扇構え', category: 'craft' },
  { key: 'brush_grip', labelJp: '筆執り', category: 'craft' },
  { key: 'koto_pluck', labelJp: '箏爪弾き', category: 'craft' },
  { key: 'snap_ready', labelJp: '指パッチン溜', category: 'expressive' },
  { key: 'snap_release', labelJp: '指弾き開放', category: 'expressive' },
  { key: 'peace_tilt', labelJp: '斜め双刃', category: 'expressive' },
  { key: 'open_offer', labelJp: '献上掌', category: 'craft' },
  { key: 'fist_pump', labelJp: '凱旋握拳', category: 'expressive' },
  { key: 'defeat_slump', labelJp: '脱力垂手', category: 'expressive' },
  { key: 'stealth_curl', labelJp: '忍び構え', category: 'martial' },
  { key: 'wave_flourish', labelJp: '歌舞伎波動', category: 'expressive' },
  { key: 'counter_parry', labelJp: '受け流し', category: 'martial' },
  { key: 'zen_circle', labelJp: '禅円相', category: 'craft' },
];

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
export type JHandQualityMode = 'biomech_ultra' | 'biomech_pro' | 'standard';

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
  /** True MCP passive axial pronation/supination twist (radians, scaphoid convergence + lateral pressure) */
  mcpAxialTwist: number;
  /** PIP flexion in radians */
  pipFlex: number;
  /** DIP flexion in radians (coupled with PIP via Oblique Retinacular Ligament & Central Slip) */
  dipFlex: number;
  /** Subtle physiological DIP clinodactyly packing cant during tight fist closure (radians) */
  dipCant: number;
  /** Legacy alias equal to mcpAxialTwist for backward compatibility */
  convergenceRoll: number;
  /** Eccentric Cam-Axis Instantaneous Center of Rotation (ICR) volar glide offsets (meters) */
  mcpVolarGlide: number;
  pipVolarGlide: number;
  dipVolarGlide: number;
  /** Dorsal extensor hood & knuckle skin-fold stretch 0..1 */
  knuckleCreaseStretch: number;
  /** Dorsal extensor tendon tension 0..1 (visibly raises & tightens 3D dorsal tendon cord) */
  tendonTension: number;
  /** Fingertip-to-palm elastic contact pressure 0..1 */
  palmContact: number;
  /** Soft distal & volar finger-pulp elastic pad squash 0..1 */
  pulpCompression: number;
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
  /** Thumb MCP radial/ulnar lateral compliance under firm clamp (radians) */
  mcpAbd: number;
  /** Thumb IP flexion (+) / hyperextension (-) when pressing firmly over fist or extending Paper */
  ipFlex: number;
  /** Extensor Pollicis Longus (EPL) dorsal snuffbox tendon elevation tension 0..1 */
  eplTendonTension: number;
  /** Contact pressure against index/middle or ring finger 0..1 */
  fingerContact: number;
  /** Distal thumb pad elastic squash 0..1 */
  pulpCompression: number;
}

export interface PalmArchState {
  /** 2nd metacarpal subtle radial compliance under grip load (radians) */
  cmc2Flex: number;
  /** 3rd metacarpal subtle keystone compliance (radians) */
  cmc3Flex: number;
  /** 4th metacarpal (ring base) palmar cupping flexion (radians, 0..0.24) */
  cmc4Flex: number;
  /** 5th metacarpal (pinky base) palmar cupping flexion (radians, 0..0.38) */
  cmc5Flex: number;
  /** 5th metacarpal axial opposition supination rotating pinky pad toward thumb (radians) */
  cmc5Supination: number;
  /** Transverse metacarpal arch depth 0..1 */
  archCup: number;
  /** Thenar eminence (thumb-base muscle) visible bulge/shift 0..1 */
  thenarBulge: number;
  /** Hypothenar eminence (pinky-side ulnar heel muscle) visible bulge 0..1 */
  hypothenarBulge: number;
  /** First Dorsal Interosseous (FDI — thumb-index dorsal web muscle) bulge 0..1 */
  fdiBulge: number;
  /** 3 Interdigital Commissural Webbing stretches [index-mid, mid-ring, ring-pinky] 0..1 */
  webbingStretch: [number, number, number];
  /** 2 Juncturae Tendinum diagonal bridge tensions [mid-ring, ring-pinky] 0..1 */
  juncturaeTension: [number, number];
}

export interface WristForearmState {
  /** Forearm pronation/supination twist distributed proximal to wrist (radians) */
  forearmPronation: number;
  /** Distal Radioulnar Joint (DRUJ) dorsal ulnar-styloid head prominence 0..1 */
  ulnarStyloidProminence: number;
  /** Proximal carpal row (Radiocarpal) pitch (radians) */
  rcPitch: number;
  /** Distal carpal row (Midcarpal) pitch with Dart-Thrower's Motion coupling (radians) */
  mcPitch: number;
  /** Combined wrist pitch (= rcPitch + mcPitch) for backward compatibility */
  wristPitch: number;
  /** Radial/ulnar deviation (radians) */
  wristYaw: number;
  /** Distal carpal roll residual (radians) */
  wristRoll: number;
  /** Volar wrist flexor tendon (FCR / Palmaris Longus) subcutaneous tension 0..1 */
  flexorTendonTension: number;
}

export type HandFoleyType =
  | 'knuckle_snap'
  | 'palm_clench'
  | 'thumb_lock'
  | 'finger_whip'
  | 'scissors_shear'
  | 'tendon_creak'
  | 'nail_click'
  | 'sleeve_rustle'
  | 'wrist_crack';

export interface HandFoleyEvent {
  type: HandFoleyType;
  /** Normalized physical kinetic intensity 0..1 */
  intensity: number;
  /** Which digit or anatomical landmark emitted the micro-event */
  finger?: FingerName | 'thumb' | 'palm' | 'wrist' | 'sleeve';
}

export interface JHandSolvedFrame {
  wrist: WristForearmState;
  palm: PalmArchState;
  thumb: ThumbJointState;
  fingers: Record<FingerName, FingerJointState>;
  /** 4-channel dorsal extensor tendon tension [index, middle, ring, pinky] */
  dorsalTendons: [number, number, number, number];
  /** Intrinsic-plus vs extrinsic neuromotor balance (-1 extrinsic curl .. +1 intrinsic bloom) */
  intrinsicTone: number;
  /** Total neuromuscular effort / clench tension 0..1 */
  muscleEffort: number;
  /** Instantaneous wrist linear+angular speed metric (for JSound Engin 1.1 aero/sleeve) */
  kineticSpeed: number;
  /** Active micro-Foley events emitted during this simulation step */
  foleyEvents: HandFoleyEvent[];
}

export interface JHandTelemetry {
  engineName: string;
  activeDof: number;
  mode: JHandQualityMode;
  orlCouplingRatio: number;
  palmCupDeg: number;
  forearmPronationDeg: number;
  midcarpalSplitPct: number;
  icrGlideMm: number;
  fdiBulgePct: number;
  muscleEffort: number;
  whipLagDeg: number;
  synergyPhaseJp: string;
}

/**
 * Physiological Human Hand Range-of-Motion (ROM) Constants (radians).
 * Based on Kapandji "The Physiology of the Joints, Vol. 1: Upper Limb" &
 * Brand & Hollister "Clinical Mechanics of the Hand".
 */
export const ANATOMICAL_ROM = {
  finger: {
    mcpFlex: { min: -0.34, max: 1.68, softMargin: 0.14 } as JointLimit,
    mcpAbd: { min: -0.38, max: 0.38, softMargin: 0.06 } as JointLimit,
    mcpAxialTwist: { min: -0.18, max: 0.2, softMargin: 0.03 } as JointLimit,
    pipFlex: { min: 0.0, max: 1.84, softMargin: 0.14 } as JointLimit,
    dipFlex: { min: -0.06, max: 1.32, softMargin: 0.12 } as JointLimit,
  },
  thumb: {
    cmcFlex: { min: -0.2, max: 1.05, softMargin: 0.1 } as JointLimit,
    cmcAbd: { min: -1.16, max: 0.44, softMargin: 0.1 } as JointLimit,
    cmcPronation: { min: -0.45, max: 0.98, softMargin: 0.08 } as JointLimit,
    mcpFlex: { min: -0.1, max: 1.02, softMargin: 0.09 } as JointLimit,
    mcpAbd: { min: -0.18, max: 0.22, softMargin: 0.04 } as JointLimit,
    ipFlex: { min: -0.32, max: 1.24, softMargin: 0.1 } as JointLimit,
  },
  palm: {
    cmc2Flex: { min: -0.02, max: 0.065, softMargin: 0.015 } as JointLimit,
    cmc3Flex: { min: -0.015, max: 0.045, softMargin: 0.01 } as JointLimit,
    cmc4Flex: { min: -0.03, max: 0.24, softMargin: 0.03 } as JointLimit,
    cmc5Flex: { min: -0.04, max: 0.38, softMargin: 0.04 } as JointLimit,
    cmc5Supination: { min: -0.06, max: 0.34, softMargin: 0.04 } as JointLimit,
  },
  wrist: {
    forearmPronation: { min: -0.95, max: 1.15, softMargin: 0.12 } as JointLimit,
    rcPitch: { min: -0.42, max: 0.46, softMargin: 0.06 } as JointLimit,
    mcPitch: { min: -0.46, max: 0.44, softMargin: 0.06 } as JointLimit,
    pitch: { min: -0.82, max: 0.86, softMargin: 0.1 } as JointLimit,
    yaw: { min: -0.38, max: 0.48, softMargin: 0.06 } as JointLimit,
    roll: { min: -0.65, max: 0.65, softMargin: 0.08 } as JointLimit,
  },
} as const;
