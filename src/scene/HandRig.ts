/**
 * ★ Ultra-High-Detail 21-Bone Articulated Anatomical 3D Hand Rig (AAA Spring Kinematics) ★
 *
 * Sculpted using custom organic LatheGeometry phalanx profiles, rounded knuckle
 * joints, watchmaker brass hinge pins, curved clearcoat fingernails, anatomical palm
 * musculature (thenar & hypothenar mounds + dorsal metacarpal ridges), articulated
 * wrist, forearm, and tailored fabric sleeve cuff using extracted user-atlas PBR textures.
 *
 * Motion & Kinematics Architecture:
 *  - True 2nd-Order Critically/Under-Damped Harmonic Springs (`Spring1D`) on all 21 bones,
 *    wrist attitude, and 3D world translation — delivers authentic mass, whip-crack snap,
 *    elastic overshoot, and silky organic settle!
 *  - Per-Finger Staggered Cascade Wave (e.g., Paper fans out sequentially thumb→pinky,
 *    Rock snaps fingers closed before the thumb locks across the knuckles!)
 *  - Living Idle Choreography (counter-phased breathing + contemplative finger-drumming
 *    wave + JNV1.0 clockwork-seal micro-tells)
 *  - Signature Move Flourishes:
 *      · SCISSORS double-snip blade articulation
 *      · ROCK heavy downward pronation crush
 *      · PAPER sweeping enveloping crown arc
 *      · Ceremonial Match Victory salute & respectful defeat bow
 */

import * as THREE from 'three';
import { Move, PAPER, ROCK, SCISSORS } from '../engine/jnv1/types';
import { HandMaterialPreset } from '../graphics/GraphicsConfig';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';

/** Second-order damped harmonic spring for organic overshoot & physical weight */
class Spring1D {
  public value: number;
  public velocity = 0;

  constructor(initial = 0) {
    this.value = initial;
  }

  public snap(v: number): void {
    this.value = v;
    this.velocity = 0;
  }

  public impulse(v: number): void {
    this.velocity += v;
  }

  public step(target: number, stiffness: number, damping: number, dt: number): number {
    // Semi-implicit Euler sub-stepped twice for unconditional stability even at high stiffness
    const subDt = dt * 0.5;
    for (let i = 0; i < 2; i++) {
      const force = (target - this.value) * stiffness;
      const accel = force - this.velocity * damping;
      this.velocity += accel * subDt;
      this.value += this.velocity * subDt;
    }
    return this.value;
  }
}

interface FingerJoints {
  mcp: THREE.Group;
  pip: THREE.Group;
  dip: THREE.Group;
  tipAnchor: THREE.Object3D;
}

interface ThumbJoints {
  cmc: THREE.Group;
  mcp: THREE.Group;
  ip: THREE.Group;
  tipAnchor: THREE.Object3D;
}

interface FingerPose {
  mcpX: number;
  mcpY: number;
  pipX: number;
  dipX: number;
}

interface ThumbPose {
  cmcX: number;
  cmcY: number;
  cmcZ: number;
  mcpX: number;
  ipX: number;
}

interface FullHandPose {
  thumb: ThumbPose;
  index: FingerPose;
  middle: FingerPose;
  ring: FingerPose;
  pinky: FingerPose;
  wristPitch: number;
  wristYaw: number;
  wristRoll: number;
}

interface FingerSprings {
  mcpX: Spring1D;
  mcpY: Spring1D;
  pipX: Spring1D;
  dipX: Spring1D;
}

interface ThumbSprings {
  cmcX: Spring1D;
  cmcY: Spring1D;
  cmcZ: Spring1D;
  mcpX: Spring1D;
  ipX: Spring1D;
}

export type HandPoseKey = 'ready' | 'windup' | 'envelop' | 'bow' | 'salute' | Move;

const POSES: Record<HandPoseKey, FullHandPose> = {
  ready: {
    thumb: { cmcX: 0.42, cmcY: -0.42, cmcZ: 0.35, mcpX: 0.32, ipX: 0.28 },
    index: { mcpX: 0.44, mcpY: 0.09, pipX: 0.52, dipX: 0.3 },
    middle: { mcpX: 0.52, mcpY: 0.01, pipX: 0.6, dipX: 0.34 },
    ring: { mcpX: 0.62, mcpY: -0.05, pipX: 0.7, dipX: 0.4 },
    pinky: { mcpX: 0.72, mcpY: -0.11, pipX: 0.76, dipX: 0.44 },
    wristPitch: 0.14,
    wristYaw: 0.0,
    wristRoll: 0.34,
  },
  windup: {
    thumb: { cmcX: 0.74, cmcY: -0.78, cmcZ: 0.62, mcpX: 0.7, ipX: 0.62 },
    index: { mcpX: 1.52, mcpY: 0.02, pipX: 1.62, dipX: 0.96 },
    middle: { mcpX: 1.56, mcpY: 0.0, pipX: 1.65, dipX: 0.98 },
    ring: { mcpX: 1.6, mcpY: -0.02, pipX: 1.66, dipX: 0.98 },
    pinky: { mcpX: 1.62, mcpY: -0.04, pipX: 1.66, dipX: 0.96 },
    wristPitch: 0.2,
    wristYaw: 0.0,
    wristRoll: 0.6,
  },
  [ROCK]: {
    thumb: { cmcX: 0.82, cmcY: -0.86, cmcZ: 0.72, mcpX: 0.76, ipX: 0.68 },
    index: { mcpX: 1.58, mcpY: 0.01, pipX: 1.68, dipX: 1.02 },
    middle: { mcpX: 1.62, mcpY: 0.0, pipX: 1.7, dipX: 1.04 },
    ring: { mcpX: 1.64, mcpY: -0.02, pipX: 1.72, dipX: 1.04 },
    pinky: { mcpX: 1.66, mcpY: -0.04, pipX: 1.7, dipX: 1.02 },
    wristPitch: 0.05,
    wristYaw: 0.0,
    wristRoll: 0.44,
  },
  [SCISSORS]: {
    thumb: { cmcX: 0.86, cmcY: -0.94, cmcZ: 0.64, mcpX: 0.76, ipX: 0.7 },
    index: { mcpX: -0.09, mcpY: 0.3, pipX: 0.04, dipX: 0.03 },
    middle: { mcpX: -0.06, mcpY: -0.26, pipX: 0.05, dipX: 0.04 },
    ring: { mcpX: 1.58, mcpY: -0.06, pipX: 1.7, dipX: 1.02 },
    pinky: { mcpX: 1.62, mcpY: -0.1, pipX: 1.7, dipX: 1.0 },
    wristPitch: 0.1,
    wristYaw: 0.1,
    wristRoll: 0.76, // Sculpted angled V-blade presentation toward camera!
  },
  [PAPER]: {
    thumb: { cmcX: 0.08, cmcY: 0.18, cmcZ: -0.22, mcpX: 0.04, ipX: 0.02 },
    index: { mcpX: -0.14, mcpY: 0.28, pipX: 0.03, dipX: 0.02 },
    middle: { mcpX: -0.14, mcpY: 0.06, pipX: 0.02, dipX: 0.02 },
    ring: { mcpX: -0.12, mcpY: -0.14, pipX: 0.04, dipX: 0.03 },
    pinky: { mcpX: -0.08, mcpY: -0.32, pipX: 0.06, dipX: 0.04 },
    wristPitch: 0.06,
    wristYaw: 0.0,
    wristRoll: 0.24,
  },
  envelop: {
    // Paper victory enveloping crown posture curving gracefully over Rock
    thumb: { cmcX: 0.24, cmcY: -0.1, cmcZ: 0.08, mcpX: 0.22, ipX: 0.18 },
    index: { mcpX: 0.28, mcpY: 0.22, pipX: 0.34, dipX: 0.26 },
    middle: { mcpX: 0.26, mcpY: 0.04, pipX: 0.32, dipX: 0.24 },
    ring: { mcpX: 0.3, mcpY: -0.12, pipX: 0.36, dipX: 0.28 },
    pinky: { mcpX: 0.34, mcpY: -0.26, pipX: 0.38, dipX: 0.3 },
    wristPitch: 0.22,
    wristYaw: 0.0,
    wristRoll: 0.08,
  },
  bow: {
    // Respectful defeated hand resting lightly downward
    thumb: { cmcX: 0.56, cmcY: -0.5, cmcZ: 0.42, mcpX: 0.46, ipX: 0.38 },
    index: { mcpX: 0.78, mcpY: 0.05, pipX: 0.82, dipX: 0.52 },
    middle: { mcpX: 0.84, mcpY: 0.0, pipX: 0.86, dipX: 0.54 },
    ring: { mcpX: 0.9, mcpY: -0.04, pipX: 0.9, dipX: 0.56 },
    pinky: { mcpX: 0.96, mcpY: -0.08, pipX: 0.92, dipX: 0.58 },
    wristPitch: 0.34,
    wristYaw: 0.0,
    wristRoll: 0.2,
  },
  salute: {
    // Ceremonial open-palm Match Victory presentation
    thumb: { cmcX: 0.16, cmcY: 0.12, cmcZ: -0.14, mcpX: 0.08, ipX: 0.05 },
    index: { mcpX: -0.06, mcpY: 0.18, pipX: 0.08, dipX: 0.06 },
    middle: { mcpX: -0.04, mcpY: 0.03, pipX: 0.1, dipX: 0.08 },
    ring: { mcpX: 0.02, mcpY: -0.08, pipX: 0.16, dipX: 0.12 },
    pinky: { mcpX: 0.1, mcpY: -0.2, pipX: 0.22, dipX: 0.16 },
    wristPitch: -0.22,
    wristYaw: 0.16,
    wristRoll: -0.26, // Turned gently palm-upward toward sunlight!
  },
};

/**
 * Create a smooth organically tapered phalanx segment using LatheGeometry
 * rotated so it extends from y=0 to y=length along +Z.
 */
function createOrganicPhalanxGeo(
  length: number,
  baseRadius: number,
  tipRadius: number,
  isDistal: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = THREE.MathUtils.lerp(baseRadius, tipRadius, t);
    if (!isDistal) {
      r *= 1.0 - 0.08 * Math.sin(t * Math.PI);
      if (t < 0.12) r *= 0.85 + (t / 0.12) * 0.15;
      if (t > 0.88) r *= 0.85 + ((1 - t) / 0.12) * 0.15;
    } else {
      if (t > 0.65) {
        const dt = (t - 0.65) / 0.35;
        r *= Math.sqrt(Math.max(0.0, 1.0 - dt * dt));
      } else {
        r *= 1.0 + 0.04 * Math.sin(t * Math.PI);
      }
    }
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * length));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createFingerSprings(p: FingerPose): FingerSprings {
  return {
    mcpX: new Spring1D(p.mcpX),
    mcpY: new Spring1D(p.mcpY),
    pipX: new Spring1D(p.pipX),
    dipX: new Spring1D(p.dipX),
  };
}

function createThumbSprings(p: ThumbPose): ThumbSprings {
  return {
    cmcX: new Spring1D(p.cmcX),
    cmcY: new Spring1D(p.cmcY),
    cmcZ: new Spring1D(p.cmcZ),
    mcpX: new Spring1D(p.mcpX),
    ipX: new Spring1D(p.ipX),
  };
}

export class SculptedHandRig {
  public readonly root = new THREE.Group();
  public readonly motionGroup = new THREE.Group();
  public readonly wristPivot = new THREE.Group();
  public readonly palmCenterAnchor = new THREE.Object3D();
  public readonly strikeTipAnchor = new THREE.Object3D();

  private readonly mirrorSign: number; // +1 right hand (player), -1 mirrored (NPC)
  private readonly textures: TextureAtlasLoader;

  private readonly thumb: ThumbJoints;
  private readonly fingers: {
    index: FingerJoints;
    middle: FingerJoints;
    ring: FingerJoints;
    pinky: FingerJoints;
  };

  private primaryMat!: THREE.MeshPhysicalMaterial;
  private jointMat!: THREE.MeshPhysicalMaterial;
  private nailMat!: THREE.MeshPhysicalMaterial;
  private sleeveMat!: THREE.MeshPhysicalMaterial;
  private trimMat!: THREE.MeshPhysicalMaterial;

  private readonly primaryMeshes: THREE.Mesh[] = [];
  private readonly jointMeshes: THREE.Mesh[] = [];
  private readonly nailMeshes: THREE.Mesh[] = [];
  private readonly sleeveMeshes: THREE.Mesh[] = [];
  private readonly trimMeshes: THREE.Mesh[] = [];

  // Second-order spring bank for every articulated joint
  private targetPose: FullHandPose = structuredClone(POSES.ready);
  private currentPoseKey: HandPoseKey = 'ready';
  private readonly thumbS: ThumbSprings;
  private readonly fingerS: {
    index: FingerSprings;
    middle: FingerSprings;
    ring: FingerSprings;
    pinky: FingerSprings;
  };
  private readonly wristPitchS: Spring1D;
  private readonly wristYawS: Spring1D;
  private readonly wristRollS: Spring1D;

  // Per-finger staggered cascade timers for sequential unfurl/lock
  private fingerCascadeDelays = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  private poseElapsed = 1.0;

  // World-space second-order springs for arm motion & follow-through
  public targetOffset = new THREE.Vector3();
  private readonly offX = new Spring1D(0);
  private readonly offY = new Spring1D(0);
  private readonly offZ = new Spring1D(0);
  public targetExtraPitch = 0;
  public targetExtraYaw = 0;
  public targetExtraRoll = 0;
  private readonly extraPitchS = new Spring1D(0);
  private readonly extraYawS = new Spring1D(0);
  private readonly extraRollS = new Spring1D(0);

  private jointStiffness = 220;
  private jointDamping = 21;
  private motionStiffness = 195;
  private motionDamping = 19;

  // Alive idle & dramatic kinetic overlays
  private idlePhase = 0;
  private idleDrummingWeight = 1.0;
  private recoilPulse = 0;
  private recoilAxis = 1;
  private scissorSnipTimer = 0;
  private thoughtPulse = 0;
  private isHoverPreviewing = false;

  constructor(
    textures: TextureAtlasLoader,
    materialPreset: HandMaterialPreset,
    isRightHand = true
  ) {
    this.textures = textures;
    this.mirrorSign = isRightHand ? 1 : -1;
    this.idlePhase = isRightHand ? 0.0 : 1.7; // Counter-phase natural breathing

    this.root.add(this.motionGroup);
    this.motionGroup.add(this.wristPivot);

    this.createMaterials(materialPreset);
    this.buildForearmAndCuff();
    this.buildSculptedPalm();

    this.thumb = this.buildThumb();
    this.fingers = {
      index: this.buildFinger(0.088 * this.mirrorSign, 0.008, 0.258, [0.105, 0.068, 0.056], 0.0245),
      middle: this.buildFinger(0.028 * this.mirrorSign, 0.012, 0.268, [0.118, 0.076, 0.06], 0.0252),
      ring: this.buildFinger(-0.032 * this.mirrorSign, 0.008, 0.255, [0.108, 0.07, 0.056], 0.024),
      pinky: this.buildFinger(-0.086 * this.mirrorSign, -0.004, 0.232, [0.086, 0.054, 0.048], 0.021),
    };

    this.palmCenterAnchor.position.set(0, -0.01, 0.16);
    this.wristPivot.add(this.palmCenterAnchor);
    this.strikeTipAnchor.position.set(0, 0.02, 0.36);
    this.wristPivot.add(this.strikeTipAnchor);

    // Initialize springs from ready pose
    const p = POSES.ready;
    this.thumbS = createThumbSprings(p.thumb);
    this.fingerS = {
      index: createFingerSprings(p.index),
      middle: createFingerSprings(p.middle),
      ring: createFingerSprings(p.ring),
      pinky: createFingerSprings(p.pinky),
    };
    this.wristPitchS = new Spring1D(p.wristPitch);
    this.wristYawS = new Spring1D(p.wristYaw);
    this.wristRollS = new Spring1D(p.wristRoll);

    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.writeCurrentSpringsToRig(0, 0);
  }

  private createMaterials(preset: HandMaterialPreset): void {
    this.primaryMat?.dispose();
    this.jointMat?.dispose();
    this.nailMat?.dispose();
    this.sleeveMat?.dispose();
    this.trimMat?.dispose();

    const bronzePbr = this.textures.loadPBR('brushed_bronze', 2, 2);
    const steelPbr = this.textures.loadPBR('champagne_steel', 2, 2);
    const oakPbr = this.textures.loadPBR('oak_floor', 2, 2);
    const marblePbr = this.textures.loadPBR('grey_marble_slab', 2, 2);
    const slatePbr = this.textures.loadPBR('dark_slate_tile', 2, 2);
    const sakuraPbr = this.textures.loadPBR('sakura_cloth', 2, 2);
    const velvetPbr = this.textures.loadPBR('emerald_velvet_wall', 2, 2);
    const zabutonPbr = this.textures.loadPBR('zabuton_red', 1, 1);
    const vermilionPbr = this.textures.loadPBR('vermilion_wood', 2, 2);

    if (preset === 'hinoki_ivory') {
      this.primaryMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xf2e4cf),
        map: oakPbr.map,
        normalMap: oakPbr.normalMap,
        normalScale: new THREE.Vector2(0.18, 0.18),
        roughnessMap: oakPbr.roughnessMap,
        roughness: 0.42,
        metalness: 0.02,
        clearcoat: 0.42,
        clearcoatRoughness: 0.24,
        sheen: 0.22,
        sheenColor: new THREE.Color(0xfff1dc),
        envMapIntensity: 1.15,
      });
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xd5b178),
        map: bronzePbr.map,
        normalMap: bronzePbr.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.28,
        metalness: 0.86,
        envMapIntensity: 1.4,
      });
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xfbf2e6),
        roughness: 0.14,
        metalness: 0.04,
        clearcoat: 0.92,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.35,
      });
      this.sleeveMat = new THREE.MeshPhysicalMaterial({
        map: sakuraPbr.map,
        normalMap: sakuraPbr.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: sakuraPbr.roughnessMap,
        roughness: 0.88,
        metalness: 0.0,
        sheen: 0.45,
        sheenColor: new THREE.Color(0xb8c5d9),
        envMapIntensity: 0.85,
      });
      this.trimMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xc8a364),
        roughness: 0.26,
        metalness: 0.88,
        envMapIntensity: 1.4,
      });
    } else if (preset === 'karakuri_bronze') {
      this.primaryMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xc89d6c),
        map: bronzePbr.map,
        normalMap: bronzePbr.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: bronzePbr.roughnessMap,
        roughness: 0.34,
        metalness: 0.88,
        clearcoat: 0.28,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.55,
      });
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xdad4c8),
        map: steelPbr.map,
        normalMap: steelPbr.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.22,
        metalness: 0.94,
        envMapIntensity: 1.65,
      });
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xebd49c),
        roughness: 0.14,
        metalness: 0.96,
        clearcoat: 0.65,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.75,
      });
      this.sleeveMat = new THREE.MeshPhysicalMaterial({
        map: velvetPbr.map,
        normalMap: velvetPbr.normalMap,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: velvetPbr.roughnessMap,
        roughness: 0.86,
        metalness: 0.04,
        sheen: 0.65,
        sheenColor: new THREE.Color(0x527c62),
        envMapIntensity: 0.9,
      });
      this.trimMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xdab86e),
        roughness: 0.2,
        metalness: 0.92,
        envMapIntensity: 1.55,
      });
    } else if (preset === 'bisque_porcelain') {
      this.primaryMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xf6f3ee),
        map: marblePbr.map,
        normalMap: marblePbr.normalMap,
        normalScale: new THREE.Vector2(0.14, 0.14),
        roughness: 0.22,
        metalness: 0.02,
        clearcoat: 0.88,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.45,
      });
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xdfb766),
        roughness: 0.18,
        metalness: 0.94,
        envMapIntensity: 1.6,
      });
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xfffaf4),
        roughness: 0.08,
        metalness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.5,
      });
      this.sleeveMat = new THREE.MeshPhysicalMaterial({
        map: zabutonPbr.map,
        normalMap: zabutonPbr.normalMap,
        normalScale: new THREE.Vector2(0.95, 0.95),
        roughnessMap: zabutonPbr.roughnessMap,
        roughness: 0.84,
        metalness: 0.0,
        sheen: 0.55,
        sheenColor: new THREE.Color(0xc24848),
        envMapIntensity: 0.85,
      });
      this.trimMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xdab363),
        roughness: 0.2,
        metalness: 0.94,
        envMapIntensity: 1.55,
      });
    } else {
      this.primaryMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x3a3d42),
        map: slatePbr.map,
        normalMap: slatePbr.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.3,
        metalness: 0.28,
        clearcoat: 0.72,
        clearcoatRoughness: 0.16,
        envMapIntensity: 1.45,
      });
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xe0b968),
        roughness: 0.2,
        metalness: 0.95,
        envMapIntensity: 1.65,
      });
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xcda65c),
        roughness: 0.16,
        metalness: 0.92,
        clearcoat: 0.75,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.6,
      });
      this.sleeveMat = new THREE.MeshPhysicalMaterial({
        map: vermilionPbr.map,
        normalMap: vermilionPbr.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 0.52,
        metalness: 0.04,
        clearcoat: 0.3,
        envMapIntensity: 1.0,
      });
      this.trimMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xe0b968),
        roughness: 0.22,
        metalness: 0.95,
        envMapIntensity: 1.6,
      });
    }
  }

  public setMaterialPreset(preset: HandMaterialPreset): void {
    this.createMaterials(preset);
    this.primaryMeshes.forEach((m) => (m.material = this.primaryMat));
    this.jointMeshes.forEach((m) => (m.material = this.jointMat));
    this.nailMeshes.forEach((m) => (m.material = this.nailMat));
    this.sleeveMeshes.forEach((m) => (m.material = this.sleeveMat));
    this.trimMeshes.forEach((m) => (m.material = this.trimMat));
  }

  private regPrimary(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.primaryMat);
    this.primaryMeshes.push(m);
    return m;
  }

  private regJoint(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.jointMat);
    this.jointMeshes.push(m);
    return m;
  }

  private buildForearmAndCuff(): void {
    const wristGeo = new THREE.CylinderGeometry(0.094, 0.106, 0.11, 24);
    wristGeo.rotateX(Math.PI / 2);
    wristGeo.scale(1.16, 0.78, 1.0);
    const wristMesh = this.regPrimary(wristGeo);
    wristMesh.position.set(0, -0.004, -0.04);
    this.wristPivot.add(wristMesh);

    const collarGeo = new THREE.TorusGeometry(0.096, 0.011, 14, 32);
    collarGeo.scale(1.18, 0.82, 1.0);
    const collar = this.regJoint(collarGeo);
    collar.position.set(0, -0.004, -0.088);
    this.wristPivot.add(collar);

    const sleevePts = [
      new THREE.Vector2(0.112, 0.0),
      new THREE.Vector2(0.126, 0.04),
      new THREE.Vector2(0.142, 0.16),
      new THREE.Vector2(0.158, 0.36),
      new THREE.Vector2(0.168, 0.62),
    ];
    const sleeveGeo = new THREE.LatheGeometry(sleevePts, 28);
    sleeveGeo.rotateX(-Math.PI / 2);
    sleeveGeo.scale(1.14, 0.9, 1.0);
    const sleeve = new THREE.Mesh(sleeveGeo, this.sleeveMat);
    sleeve.position.set(0, -0.005, -0.092);
    this.sleeveMeshes.push(sleeve);
    this.wristPivot.add(sleeve);

    for (const zOff of [-0.115, -0.145]) {
      const bandGeo = new THREE.TorusGeometry(0.118, 0.0065, 12, 32);
      bandGeo.scale(1.14, 0.9, 1.0);
      const band = new THREE.Mesh(bandGeo, this.trimMat);
      band.position.set(0, -0.005, zOff);
      this.trimMeshes.push(band);
      this.wristPivot.add(band);
    }
  }

  private buildSculptedPalm(): void {
    const palmCore = this.regPrimary(new THREE.SphereGeometry(0.135, 32, 24));
    palmCore.scale.set(0.96, 0.44, 1.12);
    palmCore.position.set(0, 0.0, 0.128);
    this.wristPivot.add(palmCore);

    const knuckleBarGeo = new THREE.CapsuleGeometry(0.036, 0.168, 12, 20);
    knuckleBarGeo.rotateZ(Math.PI / 2);
    knuckleBarGeo.scale(1.0, 0.92, 1.05);
    const knuckleBar = this.regPrimary(knuckleBarGeo);
    knuckleBar.position.set(0.002 * this.mirrorSign, 0.006, 0.236);
    this.wristPivot.add(knuckleBar);

    const thenar = this.regPrimary(new THREE.SphereGeometry(0.072, 24, 18));
    thenar.scale.set(0.88, 0.72, 1.24);
    thenar.position.set(0.074 * this.mirrorSign, -0.022, 0.094);
    thenar.rotation.y = 0.24 * this.mirrorSign;
    this.wristPivot.add(thenar);

    const hypo = this.regPrimary(new THREE.SphereGeometry(0.058, 22, 16));
    hypo.scale.set(0.76, 0.68, 1.38);
    hypo.position.set(-0.078 * this.mirrorSign, -0.018, 0.115);
    this.wristPivot.add(hypo);

    const ridgeXs = [0.08, 0.026, -0.028, -0.078];
    for (const rx of ridgeXs) {
      const ridgeGeo = new THREE.CapsuleGeometry(0.014, 0.145, 8, 12);
      ridgeGeo.rotateX(Math.PI / 2);
      const ridge = this.regPrimary(ridgeGeo);
      ridge.position.set(rx * this.mirrorSign, 0.038, 0.148);
      this.wristPivot.add(ridge);
    }

    const crest = this.regJoint(new THREE.CylinderGeometry(0.032, 0.036, 0.012, 24));
    crest.position.set(0, 0.054, 0.125);
    this.wristPivot.add(crest);
    const crestRing = this.regJoint(new THREE.TorusGeometry(0.042, 0.0045, 10, 28));
    crestRing.rotateX(Math.PI / 2);
    crestRing.position.set(0, 0.056, 0.125);
    this.wristPivot.add(crestRing);
  }

  private buildFinger(
    x: number,
    y: number,
    z: number,
    lengths: [number, number, number],
    baseRadius: number
  ): FingerJoints {
    const [l1, l2, l3] = lengths;

    const mcp = new THREE.Group();
    mcp.position.set(x, y, z);
    this.wristPivot.add(mcp);

    const mcpKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 1.08, 18, 14));
    mcpKnuckle.scale.set(1.06, 0.96, 1.0);
    mcp.add(mcpKnuckle);

    const mcpPin = this.regJoint(new THREE.CylinderGeometry(baseRadius * 0.36, baseRadius * 0.36, baseRadius * 2.25, 14));
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    mcp.add(this.regPrimary(createOrganicPhalanxGeo(l1, baseRadius, baseRadius * 0.87, false)));

    const pip = new THREE.Group();
    pip.position.set(0, 0, l1);
    mcp.add(pip);

    pip.add(this.regJoint(new THREE.SphereGeometry(baseRadius * 0.92, 16, 12)));
    const pipPin = this.regJoint(new THREE.CylinderGeometry(baseRadius * 0.28, baseRadius * 0.28, baseRadius * 1.95, 12));
    pipPin.rotateZ(Math.PI / 2);
    pip.add(pipPin);

    pip.add(this.regPrimary(createOrganicPhalanxGeo(l2, baseRadius * 0.86, baseRadius * 0.77, false)));

    const dip = new THREE.Group();
    dip.position.set(0, 0, l2);
    pip.add(dip);

    dip.add(this.regJoint(new THREE.SphereGeometry(baseRadius * 0.8, 16, 12)));
    dip.add(this.regPrimary(createOrganicPhalanxGeo(l3, baseRadius * 0.76, baseRadius * 0.66, true)));

    const nailGeo = new THREE.SphereGeometry(baseRadius * 0.62, 14, 10);
    nailGeo.scale(0.95, 0.26, 1.35);
    const nail = new THREE.Mesh(nailGeo, this.nailMat);
    nail.position.set(0, baseRadius * 0.56, l3 * 0.58);
    nail.rotation.x = 0.08;
    this.nailMeshes.push(nail);
    dip.add(nail);

    const tipAnchor = new THREE.Object3D();
    tipAnchor.position.set(0, 0, l3);
    dip.add(tipAnchor);

    return { mcp, pip, dip, tipAnchor };
  }

  private buildThumb(): ThumbJoints {
    const baseR = 0.0285;
    const cmc = new THREE.Group();
    cmc.position.set(0.102 * this.mirrorSign, -0.016, 0.088);
    this.wristPivot.add(cmc);

    cmc.add(this.regJoint(new THREE.SphereGeometry(baseR * 1.12, 18, 14)));
    const lMeta = 0.095;
    cmc.add(this.regPrimary(createOrganicPhalanxGeo(lMeta, baseR * 1.08, baseR * 0.94, false)));

    const mcp = new THREE.Group();
    mcp.position.set(0, 0, lMeta);
    cmc.add(mcp);

    mcp.add(this.regJoint(new THREE.SphereGeometry(baseR * 0.98, 16, 12)));
    const mcpPin = this.regJoint(new THREE.CylinderGeometry(baseR * 0.3, baseR * 0.3, baseR * 2.1, 12));
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    const lProx = 0.074;
    mcp.add(this.regPrimary(createOrganicPhalanxGeo(lProx, baseR * 0.94, baseR * 0.84, false)));

    const ip = new THREE.Group();
    ip.position.set(0, 0, lProx);
    mcp.add(ip);

    ip.add(this.regJoint(new THREE.SphereGeometry(baseR * 0.86, 14, 12)));
    const lDist = 0.064;
    ip.add(this.regPrimary(createOrganicPhalanxGeo(lDist, baseR * 0.84, baseR * 0.72, true)));

    const nailGeo = new THREE.SphereGeometry(baseR * 0.68, 14, 10);
    nailGeo.scale(1.0, 0.25, 1.32);
    const nail = new THREE.Mesh(nailGeo, this.nailMat);
    nail.position.set(0, baseR * 0.6, lDist * 0.56);
    this.nailMeshes.push(nail);
    ip.add(nail);

    const tipAnchor = new THREE.Object3D();
    tipAnchor.position.set(0, 0, lDist);
    ip.add(tipAnchor);

    return { cmc, mcp, ip, tipAnchor };
  }

  /**
   * Set spring dynamics for snappy vs ceremonial arm travel.
   */
  public setMotionDynamics(stiffness: number, damping: number): void {
    this.motionStiffness = stiffness;
    this.motionDamping = damping;
  }

  /**
   * Immediately place hand offset off-stage so it glides in smoothly on opening / stage change!
   */
  public triggerEntranceSlide(sideOffsetX: number): void {
    this.offX.snap(sideOffsetX);
    this.offY.snap(0.24);
    this.offZ.snap(0.14);
    this.extraPitchS.snap(-0.22);
    this.extraRollS.snap(0.25 * this.mirrorSign);
    this.targetOffset.set(0, 0, 0);
    this.targetExtraPitch = 0;
    this.targetExtraYaw = 0;
    this.targetExtraRoll = 0;
    this.setMotionDynamics(105, 16.5);
  }

  /**
   * Inject kinetic velocity directly into hand position/wrist for snappy martial-arts whip-strike!
   */
  public addMotionImpulse(vx: number, vy: number, vz: number, pitchV = 0, rollV = 0): void {
    this.offX.impulse(vx);
    this.offY.impulse(vy);
    this.offZ.impulse(vz);
    this.extraPitchS.impulse(pitchV);
    this.extraRollS.impulse(rollV);
  }

  /**
   * Set target 21-bone posture with optional per-finger staggered wave cascade and spring snap!
   */
  public setTargetPose(
    poseKey: HandPoseKey,
    snappy = false,
    cascadeWave = true,
    hoverMode = false
  ): void {
    this.currentPoseKey = poseKey;
    this.targetPose = structuredClone(POSES[poseKey]);
    this.isHoverPreviewing = hoverMode;
    this.idleDrummingWeight = poseKey === 'ready' && !hoverMode ? 1.0 : 0.0;

    if (snappy) {
      // Crisp under-damped spring gives authentic whip-crack overshoot on clash reveal!
      this.jointStiffness = 520;
      this.jointDamping = 24;
    } else if (hoverMode) {
      this.jointStiffness = 260;
      this.jointDamping = 24;
    } else {
      this.jointStiffness = 190;
      this.jointDamping = 21;
    }

    this.poseElapsed = 0;
    if (cascadeWave) {
      if (poseKey === PAPER || poseKey === 'salute') {
        // Fan out gracefully from thumb -> pinky!
        this.fingerCascadeDelays = { thumb: 0.0, index: 0.018, middle: 0.038, ring: 0.058, pinky: 0.08 };
      } else if (poseKey === ROCK || poseKey === 'windup') {
        // Curl pinky -> index tightly first, then thumb snaps shut over knuckles!
        this.fingerCascadeDelays = { pinky: 0.0, ring: 0.012, middle: 0.024, index: 0.036, thumb: 0.068 };
      } else if (poseKey === SCISSORS) {
        // Ring/pinky lock immediately, V-blades flick open sharply!
        this.fingerCascadeDelays = { ring: 0.0, pinky: 0.0, thumb: 0.012, index: 0.015, middle: 0.032 };
      } else {
        this.fingerCascadeDelays = { thumb: 0, index: 0.015, middle: 0.03, ring: 0.045, pinky: 0.06 };
      }
    } else {
      this.fingerCascadeDelays = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
    }
  }

  /** Trigger signature Scissors double-snip blade motion on victory! */
  public triggerScissorsSnip(): void {
    this.scissorSnipTimer = 0.56;
  }

  /** Trigger subtle JNV1.0 cognitive seal micro-tell (wrist cock + thoughtful finger ripple) */
  public triggerThoughtTell(): void {
    this.thoughtPulse = 1.0;
    this.extraRollS.impulse(-0.65 * this.mirrorSign);
  }

  public triggerRecoil(intensity = 1.0, axisDir = 1): void {
    this.recoilPulse = Math.max(this.recoilPulse, intensity);
    this.recoilAxis = axisDir;
    this.offX.impulse(-axisDir * intensity * 1.15);
    this.offY.impulse(intensity * 0.45);
    this.extraPitchS.impulse(-intensity * 2.2);
    this.extraRollS.impulse(axisDir * intensity * 1.9);
  }

  private writeCurrentSpringsToRig(breath: number, drumPhase: number): void {
    const s = this.mirrorSign;

    // Scissors Victory Double-Snip angular modulation on index & middle blades!
    let snipSpread = 0;
    let snipPitch = 0;
    if (this.scissorSnipTimer > 0 && this.currentPoseKey === SCISSORS) {
      // Two razor-crisp scissor snips (close -> snap wide -> close -> snap wide)
      const p = (0.56 - this.scissorSnipTimer) / 0.56; // 0..1
      const snipWave = Math.sin(p * Math.PI * 4.0);
      const closeAmt = Math.max(0, snipWave) * Math.exp(-p * 0.9);
      snipSpread = -closeAmt * 0.24;
      snipPitch = closeAmt * 0.09;
    }

    // Subtle contemplative finger-drumming ripple in idle 'ready' stance
    const drumAmp = this.idleDrummingWeight * 0.065;
    const thoughtBoost = this.thoughtPulse * 0.09;

    const wristThoughtRoll = Math.sin(this.idlePhase * 0.85) * 0.03 * this.idleDrummingWeight;
    this.wristPivot.rotation.set(
      this.wristPitchS.value + this.extraPitchS.value + breath * 0.028,
      this.wristYawS.value * s + this.extraYawS.value,
      (this.wristRollS.value + wristThoughtRoll) * s + this.extraRollS.value
    );

    this.thumb.cmc.rotation.set(
      this.thumbS.cmcX.value,
      (0.68 + this.thumbS.cmcY.value) * s,
      (-0.62 - this.thumbS.cmcZ.value) * s
    );
    this.thumb.mcp.rotation.set(this.thumbS.mcpX.value, 0, 0);
    this.thumb.ip.rotation.set(this.thumbS.ipX.value, 0, 0);

    const applyF = (
      j: FingerJoints,
      fs: FingerSprings,
      waveIdx: number,
      extraSpread = 0,
      extraCurl = 0
    ) => {
      const wave =
        Math.pow(Math.max(0, Math.sin(drumPhase - waveIdx * 0.65)), 3) * (drumAmp + thoughtBoost);
      const micro = breath * (0.015 + waveIdx * 0.005) + wave + extraCurl;
      j.mcp.rotation.set(fs.mcpX.value + micro, (fs.mcpY.value + extraSpread) * s, 0);
      j.pip.rotation.set(fs.pipX.value + micro * 0.85, 0, 0);
      j.dip.rotation.set(fs.dipX.value + micro * 0.55, 0, 0);
    };

    applyF(this.fingers.index, this.fingerS.index, 0, snipSpread, snipPitch);
    applyF(this.fingers.middle, this.fingerS.middle, 1, -snipSpread, -snipPitch * 0.6);
    applyF(this.fingers.ring, this.fingerS.ring, 2);
    applyF(this.fingers.pinky, this.fingerS.pinky, 3);
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.idlePhase += safeDt * 1.85;
    this.poseElapsed += safeDt;
    this.recoilPulse = Math.max(0, this.recoilPulse - safeDt * 4.4);
    this.thoughtPulse = Math.max(0, this.thoughtPulse - safeDt * 1.6);
    if (this.scissorSnipTimer > 0) {
      this.scissorSnipTimer = Math.max(0, this.scissorSnipTimer - safeDt);
    }

    const kJ = this.jointStiffness;
    const dJ = this.jointDamping;

    const stepFinger = (fs: FingerSprings, tgt: FingerPose, delay: number) => {
      if (this.poseElapsed < delay) return;
      fs.mcpX.step(tgt.mcpX, kJ, dJ, safeDt);
      fs.mcpY.step(tgt.mcpY, kJ, dJ, safeDt);
      fs.pipX.step(tgt.pipX, kJ, dJ, safeDt);
      fs.dipX.step(tgt.dipX, kJ, dJ, safeDt);
    };

    stepFinger(this.fingerS.index, this.targetPose.index, this.fingerCascadeDelays.index);
    stepFinger(this.fingerS.middle, this.targetPose.middle, this.fingerCascadeDelays.middle);
    stepFinger(this.fingerS.ring, this.targetPose.ring, this.fingerCascadeDelays.ring);
    stepFinger(this.fingerS.pinky, this.targetPose.pinky, this.fingerCascadeDelays.pinky);

    if (this.poseElapsed >= this.fingerCascadeDelays.thumb) {
      this.thumbS.cmcX.step(this.targetPose.thumb.cmcX, kJ, dJ, safeDt);
      this.thumbS.cmcY.step(this.targetPose.thumb.cmcY, kJ, dJ, safeDt);
      this.thumbS.cmcZ.step(this.targetPose.thumb.cmcZ, kJ, dJ, safeDt);
      this.thumbS.mcpX.step(this.targetPose.thumb.mcpX, kJ, dJ, safeDt);
      this.thumbS.ipX.step(this.targetPose.thumb.ipX, kJ, dJ, safeDt);
    }

    this.wristPitchS.step(this.targetPose.wristPitch, kJ * 0.85, dJ * 0.92, safeDt);
    this.wristYawS.step(this.targetPose.wristYaw, kJ * 0.85, dJ * 0.92, safeDt);
    this.wristRollS.step(this.targetPose.wristRoll, kJ * 0.85, dJ * 0.92, safeDt);

    // Step world-space motion springs
    const kM = this.motionStiffness;
    const dM = this.motionDamping;
    this.offX.step(this.targetOffset.x, kM, dM, safeDt);
    this.offY.step(this.targetOffset.y, kM, dM, safeDt);
    this.offZ.step(this.targetOffset.z, kM, dM, safeDt);
    this.extraPitchS.step(this.targetExtraPitch, kM * 0.92, dM * 0.92, safeDt);
    this.extraYawS.step(this.targetExtraYaw, kM * 0.92, dM * 0.92, safeDt);
    this.extraRollS.step(this.targetExtraRoll, kM * 0.92, dM * 0.92, safeDt);

    const breath = Math.sin(this.idlePhase);
    const hoverFloat = this.isHoverPreviewing ? Math.sin(this.idlePhase * 3.1) * 0.008 : 0;
    const recoilVibration = Math.sin(this.idlePhase * 32.0) * this.recoilPulse * 0.016 * this.recoilAxis;

    this.motionGroup.position.set(
      this.offX.value + recoilVibration,
      this.offY.value + breath * 0.013 + hoverFloat,
      this.offZ.value + Math.cos(this.idlePhase * 0.7) * 0.006 * this.idleDrummingWeight
    );

    const drumPhase = this.idlePhase * 1.15;
    this.writeCurrentSpringsToRig(breath, drumPhase);
  }

  public getPalmWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.palmCenterAnchor.getWorldPosition(out);
    return out;
  }

  public getStrikeTipWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.strikeTipAnchor.getWorldPosition(out);
    return out;
  }

  public dispose(): void {
    this.primaryMat?.dispose();
    this.jointMat?.dispose();
    this.nailMat?.dispose();
    this.sleeveMat?.dispose();
    this.trimMat?.dispose();
  }
}
