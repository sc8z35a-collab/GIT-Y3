/**
 * ★ Ultra-High-Detail 21-Bone Articulated Anatomical 3D Hand Rig ★
 *
 * Sculpted using custom organic LatheGeometry phalanx profiles, rounded knuckle
 * joints, curved clearcoat fingernails, anatomical palm musculature (thenar &
 * hypothenar mounds + dorsal metacarpal ridges), articulated wrist, forearm, and
 * tailored fabric sleeve cuff using the extracted user-atlas PBR textures.
 *
 * Supports 4 museum-grade physical materials (Zero-Neon) and smooth spring-damped
 * animation choreography for ROCK / SCISSORS / PAPER / READY / WINDUP / CLASH / WIN / LOSS.
 */

import * as THREE from 'three';
import { Move, PAPER, ROCK, SCISSORS } from '../engine/jnv1/types';
import { HandMaterialPreset } from '../graphics/GraphicsConfig';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';

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

const POSES: Record<'ready' | 'windup' | Move, FullHandPose> = {
  ready: {
    thumb: { cmcX: 0.42, cmcY: -0.42, cmcZ: 0.35, mcpX: 0.32, ipX: 0.28 },
    index: { mcpX: 0.48, mcpY: 0.08, pipX: 0.56, dipX: 0.32 },
    middle: { mcpX: 0.54, mcpY: 0.01, pipX: 0.62, dipX: 0.36 },
    ring: { mcpX: 0.64, mcpY: -0.05, pipX: 0.72, dipX: 0.42 },
    pinky: { mcpX: 0.74, mcpY: -0.11, pipX: 0.78, dipX: 0.45 },
    wristPitch: 0.14,
    wristYaw: 0.0,
    wristRoll: 0.35,
  },
  windup: {
    thumb: { cmcX: 0.68, cmcY: -0.74, cmcZ: 0.58, mcpX: 0.65, ipX: 0.58 },
    index: { mcpX: 1.46, mcpY: 0.02, pipX: 1.56, dipX: 0.92 },
    middle: { mcpX: 1.52, mcpY: 0.0, pipX: 1.6, dipX: 0.95 },
    ring: { mcpX: 1.56, mcpY: -0.02, pipX: 1.62, dipX: 0.96 },
    pinky: { mcpX: 1.58, mcpY: -0.04, pipX: 1.62, dipX: 0.95 },
    wristPitch: 0.18,
    wristYaw: 0.0,
    wristRoll: 0.58,
  },
  [ROCK]: {
    thumb: { cmcX: 0.78, cmcY: -0.82, cmcZ: 0.68, mcpX: 0.72, ipX: 0.65 },
    index: { mcpX: 1.54, mcpY: 0.01, pipX: 1.64, dipX: 0.98 },
    middle: { mcpX: 1.58, mcpY: 0.0, pipX: 1.66, dipX: 1.0 },
    ring: { mcpX: 1.6, mcpY: -0.02, pipX: 1.68, dipX: 1.0 },
    pinky: { mcpX: 1.62, mcpY: -0.04, pipX: 1.66, dipX: 0.98 },
    wristPitch: 0.06,
    wristYaw: 0.0,
    wristRoll: 0.46,
  },
  [SCISSORS]: {
    thumb: { cmcX: 0.85, cmcY: -0.92, cmcZ: 0.62, mcpX: 0.74, ipX: 0.68 },
    index: { mcpX: -0.06, mcpY: 0.27, pipX: 0.06, dipX: 0.04 },
    middle: { mcpX: -0.04, mcpY: -0.23, pipX: 0.07, dipX: 0.05 },
    ring: { mcpX: 1.56, mcpY: -0.06, pipX: 1.68, dipX: 1.0 },
    pinky: { mcpX: 1.6, mcpY: -0.1, pipX: 1.68, dipX: 0.98 },
    wristPitch: 0.12,
    wristYaw: 0.08,
    wristRoll: 0.72, // Turn slightly so the crisp V-silhouette faces the viewer unmistakably!
  },
  [PAPER]: {
    thumb: { cmcX: 0.12, cmcY: 0.12, cmcZ: -0.18, mcpX: 0.06, ipX: 0.04 },
    index: { mcpX: -0.1, mcpY: 0.24, pipX: 0.05, dipX: 0.03 },
    middle: { mcpX: -0.1, mcpY: 0.05, pipX: 0.04, dipX: 0.03 },
    ring: { mcpX: -0.08, mcpY: -0.12, pipX: 0.06, dipX: 0.04 },
    pinky: { mcpX: -0.06, mcpY: -0.28, pipX: 0.08, dipX: 0.05 },
    wristPitch: 0.08,
    wristYaw: 0.0,
    wristRoll: 0.28, // Wide open sculptural palm spanning across the tabletop!
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
    // Subtle anatomical hourglass contour between joints
    if (!isDistal) {
      r *= 1.0 - 0.08 * Math.sin(t * Math.PI);
      if (t < 0.12) r *= 0.85 + (t / 0.12) * 0.15;
      if (t > 0.88) r *= 0.85 + ((1 - t) / 0.12) * 0.15;
    } else {
      // Distal phalanx tapers smoothly into a fleshy rounded fingertip dome
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
  // Rotate Lathe (+Y) so finger grows along +Z
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export class SculptedHandRig {
  public readonly root = new THREE.Group();
  public readonly motionGroup = new THREE.Group();
  public readonly wristPivot = new THREE.Group();
  public readonly palmCenterAnchor = new THREE.Object3D();

  private readonly mirrorSign: number; // +1 right hand, -1 mirrored
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

  private currentPose: FullHandPose = structuredClone(POSES.ready);
  private targetPose: FullHandPose = structuredClone(POSES.ready);
  private poseStiffness = 14.0;

  // World-space animation offsets
  public basePosition = new THREE.Vector3();
  public baseRotation = new THREE.Euler();
  public targetOffset = new THREE.Vector3();
  public currentOffset = new THREE.Vector3();
  public extraPitch = 0;
  public targetExtraPitch = 0;
  public extraYaw = 0;
  public targetExtraYaw = 0;

  private idlePhase = 0;
  private recoilPulse = 0;

  constructor(
    textures: TextureAtlasLoader,
    materialPreset: HandMaterialPreset,
    isRightHand = true
  ) {
    this.textures = textures;
    this.mirrorSign = isRightHand ? 1 : -1;

    this.root.add(this.motionGroup);
    this.motionGroup.add(this.wristPivot);

    this.createMaterials(materialPreset);
    this.buildForearmAndCuff();
    this.buildSculptedPalm();

    // Build all 5 articulated fingers with anatomically faithful ratios
    this.thumb = this.buildThumb();
    this.fingers = {
      index: this.buildFinger(0.088 * this.mirrorSign, 0.008, 0.258, [0.105, 0.068, 0.056], 0.0245),
      middle: this.buildFinger(0.028 * this.mirrorSign, 0.012, 0.268, [0.118, 0.076, 0.06], 0.0252),
      ring: this.buildFinger(-0.032 * this.mirrorSign, 0.008, 0.255, [0.108, 0.07, 0.056], 0.024),
      pinky: this.buildFinger(-0.086 * this.mirrorSign, -0.004, 0.232, [0.086, 0.054, 0.048], 0.021),
    };

    this.palmCenterAnchor.position.set(0, -0.01, 0.16);
    this.wristPivot.add(this.palmCenterAnchor);

    // Enable crisp shadows on every sculptural sub-mesh
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.applyPoseImmediate(POSES.ready);
  }

  private createMaterials(preset: HandMaterialPreset): void {
    // Cleanly dispose previous materials if swapping live
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
      // Sculpted warm Japanese Hinoki-Ivory fine art wood/ivory finish
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
      // Precision Japanese Karakuri Automaton: Brushed Bronze & Watchmaker Brass + Deep Emerald Cuff
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
      // Kyoto Fine Glazed Porcelain with Gold Kintsugi Joint Accents & Crimson Silk Cuff
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
      // Obsidian & Forged Gold (Carved Dark Slate-Lacquer + Gold Pins + Vermilion Cuff)
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
    // Sculpted anatomical wrist carpus connecting forearm to palm
    const wristGeo = new THREE.CylinderGeometry(0.094, 0.106, 0.11, 24);
    wristGeo.rotateX(Math.PI / 2);
    wristGeo.scale(1.16, 0.78, 1.0);
    const wristMesh = this.regPrimary(wristGeo);
    wristMesh.position.set(0, -0.004, -0.04);
    this.wristPivot.add(wristMesh);

    // Engraved brass wrist articulation collar
    const collarGeo = new THREE.TorusGeometry(0.096, 0.011, 14, 32);
    collarGeo.scale(1.18, 0.82, 1.0);
    const collar = this.regJoint(collarGeo);
    collar.position.set(0, -0.004, -0.088);
    this.wristPivot.add(collar);

    // Forearm tailored Japanese kimono / craftsman sleeve extending smoothly back
    const sleevePts = [
      new THREE.Vector2(0.112, 0.0),
      new THREE.Vector2(0.126, 0.04),
      new THREE.Vector2(0.142, 0.16),
      new THREE.Vector2(0.158, 0.36),
      new THREE.Vector2(0.168, 0.62),
    ];
    const sleeveGeo = new THREE.LatheGeometry(sleevePts, 28);
    sleeveGeo.rotateX(-Math.PI / 2); // Extend toward -Z
    sleeveGeo.scale(1.14, 0.9, 1.0);
    const sleeve = new THREE.Mesh(sleeveGeo, this.sleeveMat);
    sleeve.position.set(0, -0.005, -0.092);
    this.sleeveMeshes.push(sleeve);
    this.wristPivot.add(sleeve);

    // Double brass cuff band rings
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
    // 1. Main beveled metacarpal palm arch (sculpted rounded capsule-slab)
    const palmCore = this.regPrimary(new THREE.SphereGeometry(0.135, 32, 24));
    palmCore.scale.set(0.96, 0.44, 1.12);
    palmCore.position.set(0, 0.0, 0.128);
    this.wristPivot.add(palmCore);

    // 2. Distal knuckle-bar bridge across all 4 MCP bases (gives strong realistic hand silhouette!)
    const knuckleBarGeo = new THREE.CapsuleGeometry(0.036, 0.168, 12, 20);
    knuckleBarGeo.rotateZ(Math.PI / 2);
    knuckleBarGeo.scale(1.0, 0.92, 1.05);
    const knuckleBar = this.regPrimary(knuckleBarGeo);
    knuckleBar.position.set(0.002 * this.mirrorSign, 0.006, 0.236);
    this.wristPivot.add(knuckleBar);

    // 3. Thenar eminence (fleshy thumb-base muscle pad on radial palm side)
    const thenar = this.regPrimary(new THREE.SphereGeometry(0.072, 24, 18));
    thenar.scale.set(0.88, 0.72, 1.24);
    thenar.position.set(0.074 * this.mirrorSign, -0.022, 0.094);
    thenar.rotation.y = 0.24 * this.mirrorSign;
    this.wristPivot.add(thenar);

    // 4. Hypothenar eminence (outer heel muscle pad on pinky palm side)
    const hypo = this.regPrimary(new THREE.SphereGeometry(0.058, 22, 16));
    hypo.scale.set(0.76, 0.68, 1.38);
    hypo.position.set(-0.078 * this.mirrorSign, -0.018, 0.115);
    this.wristPivot.add(hypo);

    // 5. Subtle sculptural dorsal metacarpal tendon ridges (catches raking afternoon sunlight!)
    const ridgeXs = [0.08, 0.026, -0.028, -0.078];
    for (const rx of ridgeXs) {
      const ridgeGeo = new THREE.CapsuleGeometry(0.014, 0.145, 8, 12);
      ridgeGeo.rotateX(Math.PI / 2);
      const ridge = this.regPrimary(ridgeGeo);
      ridge.position.set(rx * this.mirrorSign, 0.038, 0.148);
      this.wristPivot.add(ridge);
    }

    // 6. Subtle inlaid brass crest medallion on the back of the hand (hallmark detail!)
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

    // MCP Joint
    const mcp = new THREE.Group();
    mcp.position.set(x, y, z);
    this.wristPivot.add(mcp);

    const mcpKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 1.08, 18, 14));
    mcpKnuckle.scale.set(1.06, 0.96, 1.0);
    mcp.add(mcpKnuckle);

    // Decorative brass watchmaker hinge pin across knuckle
    const mcpPin = this.regJoint(new THREE.CylinderGeometry(baseRadius * 0.36, baseRadius * 0.36, baseRadius * 2.25, 14));
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    // Proximal Phalanx
    const seg1 = this.regPrimary(createOrganicPhalanxGeo(l1, baseRadius, baseRadius * 0.87, false));
    mcp.add(seg1);

    // PIP Joint
    const pip = new THREE.Group();
    pip.position.set(0, 0, l1);
    mcp.add(pip);

    const pipKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 0.92, 16, 12));
    pip.add(pipKnuckle);

    const pipPin = this.regJoint(new THREE.CylinderGeometry(baseRadius * 0.28, baseRadius * 0.28, baseRadius * 1.95, 12));
    pipPin.rotateZ(Math.PI / 2);
    pip.add(pipPin);

    // Middle Phalanx
    const seg2 = this.regPrimary(createOrganicPhalanxGeo(l2, baseRadius * 0.86, baseRadius * 0.77, false));
    pip.add(seg2);

    // DIP Joint
    const dip = new THREE.Group();
    dip.position.set(0, 0, l2);
    pip.add(dip);

    const dipKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 0.8, 16, 12));
    dip.add(dipKnuckle);

    // Distal Phalanx + Rounded Fingertip
    const seg3 = this.regPrimary(createOrganicPhalanxGeo(l3, baseRadius * 0.76, baseRadius * 0.66, true));
    dip.add(seg3);

    // Curved Glossy Sculpted Fingernail
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

    const cmcBall = this.regJoint(new THREE.SphereGeometry(baseR * 1.12, 18, 14));
    cmc.add(cmcBall);

    // Metacarpal thumb base extending outward & forward
    const lMeta = 0.095;
    const metaMesh = this.regPrimary(createOrganicPhalanxGeo(lMeta, baseR * 1.08, baseR * 0.94, false));
    cmc.add(metaMesh);

    const mcp = new THREE.Group();
    mcp.position.set(0, 0, lMeta);
    cmc.add(mcp);

    const mcpBall = this.regJoint(new THREE.SphereGeometry(baseR * 0.98, 16, 12));
    mcp.add(mcpBall);
    const mcpPin = this.regJoint(new THREE.CylinderGeometry(baseR * 0.3, baseR * 0.3, baseR * 2.1, 12));
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    const lProx = 0.074;
    const proxMesh = this.regPrimary(createOrganicPhalanxGeo(lProx, baseR * 0.94, baseR * 0.84, false));
    mcp.add(proxMesh);

    const ip = new THREE.Group();
    ip.position.set(0, 0, lProx);
    mcp.add(ip);

    const ipBall = this.regJoint(new THREE.SphereGeometry(baseR * 0.86, 14, 12));
    ip.add(ipBall);

    const lDist = 0.064;
    const distMesh = this.regPrimary(createOrganicPhalanxGeo(lDist, baseR * 0.84, baseR * 0.72, true));
    ip.add(distMesh);

    // Sculpted Thumbnail
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

  public setTargetPose(poseKey: 'ready' | 'windup' | Move, stiffness = 15.0): void {
    this.targetPose = structuredClone(POSES[poseKey]);
    this.poseStiffness = stiffness;
  }

  public triggerRecoil(intensity = 1.0): void {
    this.recoilPulse = Math.max(this.recoilPulse, intensity);
  }

  private applyPoseImmediate(p: FullHandPose): void {
    this.currentPose = structuredClone(p);
    this.writeJointRotations(p, 0);
  }

  private writeJointRotations(p: FullHandPose, breath: number): void {
    const s = this.mirrorSign;

    // Wrist sculptural attitude
    this.wristPivot.rotation.set(
      p.wristPitch + this.extraPitch + breath * 0.025,
      p.wristYaw * s + this.extraYaw,
      p.wristRoll * s
    );

    // Thumb orientation (naturally angled radially outward by ~0.55 rad in base stance)
    this.thumb.cmc.rotation.set(
      p.thumb.cmcX,
      (0.68 + p.thumb.cmcY) * s,
      (-0.62 - p.thumb.cmcZ) * s
    );
    this.thumb.mcp.rotation.set(p.thumb.mcpX, 0, 0);
    this.thumb.ip.rotation.set(p.thumb.ipX, 0, 0);

    // Four fingers
    const applyF = (j: FingerJoints, fp: FingerPose, micro: number) => {
      j.mcp.rotation.set(fp.mcpX + micro, fp.mcpY * s, 0);
      j.pip.rotation.set(fp.pipX + micro * 0.8, 0, 0);
      j.dip.rotation.set(fp.dipX + micro * 0.5, 0, 0);
    };

    applyF(this.fingers.index, p.index, breath * 0.015);
    applyF(this.fingers.middle, p.middle, breath * 0.02);
    applyF(this.fingers.ring, p.ring, breath * 0.025);
    applyF(this.fingers.pinky, p.pinky, breath * 0.03);
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.idlePhase += safeDt * 1.9;
    this.recoilPulse = Math.max(0, this.recoilPulse - safeDt * 5.2);

    const alpha = 1 - Math.exp(-this.poseStiffness * safeDt);
    const lerp = THREE.MathUtils.lerp;

    const lerpFinger = (cur: FingerPose, tgt: FingerPose) => {
      cur.mcpX = lerp(cur.mcpX, tgt.mcpX, alpha);
      cur.mcpY = lerp(cur.mcpY, tgt.mcpY, alpha);
      cur.pipX = lerp(cur.pipX, tgt.pipX, alpha);
      cur.dipX = lerp(cur.dipX, tgt.dipX, alpha);
    };

    lerpFinger(this.currentPose.index, this.targetPose.index);
    lerpFinger(this.currentPose.middle, this.targetPose.middle);
    lerpFinger(this.currentPose.ring, this.targetPose.ring);
    lerpFinger(this.currentPose.pinky, this.targetPose.pinky);

    this.currentPose.thumb.cmcX = lerp(this.currentPose.thumb.cmcX, this.targetPose.thumb.cmcX, alpha);
    this.currentPose.thumb.cmcY = lerp(this.currentPose.thumb.cmcY, this.targetPose.thumb.cmcY, alpha);
    this.currentPose.thumb.cmcZ = lerp(this.currentPose.thumb.cmcZ, this.targetPose.thumb.cmcZ, alpha);
    this.currentPose.thumb.mcpX = lerp(this.currentPose.thumb.mcpX, this.targetPose.thumb.mcpX, alpha);
    this.currentPose.thumb.ipX = lerp(this.currentPose.thumb.ipX, this.targetPose.thumb.ipX, alpha);

    this.currentPose.wristPitch = lerp(this.currentPose.wristPitch, this.targetPose.wristPitch, alpha);
    this.currentPose.wristYaw = lerp(this.currentPose.wristYaw, this.targetPose.wristYaw, alpha);
    this.currentPose.wristRoll = lerp(this.currentPose.wristRoll, this.targetPose.wristRoll, alpha);

    const posAlpha = 1 - Math.exp(-13.0 * safeDt);
    this.currentOffset.lerp(this.targetOffset, posAlpha);
    this.extraPitch = lerp(this.extraPitch, this.targetExtraPitch, posAlpha);
    this.extraYaw = lerp(this.extraYaw, this.targetExtraYaw, posAlpha);

    const breath = Math.sin(this.idlePhase);
    const recoilShake = Math.sin(this.idlePhase * 22.0) * this.recoilPulse * 0.018;

    this.motionGroup.position.set(
      this.currentOffset.x + recoilShake,
      this.currentOffset.y + breath * 0.012,
      this.currentOffset.z
    );

    this.writeJointRotations(this.currentPose, breath);
  }

  /** Return live world-space center of the palm for Shadow Flame Analytic Contact AO */
  public getPalmWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.palmCenterAnchor.getWorldPosition(out);
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
