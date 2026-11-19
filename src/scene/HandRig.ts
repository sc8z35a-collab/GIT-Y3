/**
 * ★ Ultra-High-Detail 27-DOF Anatomical 3D Hand Rig — Powered by JHand Kinesis 1.0 ★
 *
 * Driven directly by our proprietary 6-layer biomechanical solver (`JHandKinesisEngine`):
 *  - Independent Forearm Pronation/Supination Pivot (`forearmPivot`) twisting the sleeve
 *    cuff & radioulnar wrist organically before the Radiocarpal Wrist Pivot (`wristPivot`)
 *  - Articulated Ulnar Palmar Arch (`cmc4Pivot`, `cmc5Pivot`) physically cupping the 4th
 *    and 5th metacarpals + hypothenar mound during Rock/Scissors and flattening on Paper
 *  - Dynamic Sculpted Thenar Eminence (`thenarMesh`) swelling & shifting with Thumb Kapandji
 *    opposition (`thenarBulge`)
 *  - 4 Dynamic Dorsal Extensor Tendon Cords (`dorsalTendonMeshes`) that visibly elevate,
 *    tighten, and catch KHDR warm highlights proportionally to real-time finger extensor tension
 *  - Anatomical Scaphoid Convergence Roll on every finger + precision condyle joint collars
 *  - Real-time kinetic micro-Foley stream (`onFoley`) routed directly to JSound Engin 1.0!
 */

import * as THREE from 'three';
import { JHandKinesisEngine } from '../engine/jhand/BiomechanicsSolver';
import {
  FingerName,
  HandFoleyEvent,
  HandPoseKey,
  JHandQualityMode,
  JHandSolvedFrame,
  JHandTelemetry,
} from '../engine/jhand/types';
import { HandMaterialPreset } from '../graphics/GraphicsConfig';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';

export type { HandPoseKey } from '../engine/jhand/types';

/** Second-order damped harmonic spring for world-space arm translation & external choreography */
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

/**
 * Create a smooth organically tapered phalanx segment using LatheGeometry
 * rotated so it extends from z=0 to z=length along +Z.
 */
function createOrganicPhalanxGeo(
  length: number,
  baseRadius: number,
  tipRadius: number,
  isDistal: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = THREE.MathUtils.lerp(baseRadius, tipRadius, t);
    if (!isDistal) {
      // Subtle anatomical waist narrowing mid-shaft + condylar flare near joints
      r *= 1.0 - 0.085 * Math.sin(t * Math.PI);
      if (t < 0.14) r *= 0.88 + (t / 0.14) * 0.12;
      if (t > 0.86) r *= 0.88 + ((1 - t) / 0.14) * 0.12;
    } else {
      if (t > 0.62) {
        const dt = (t - 0.62) / 0.38;
        r *= Math.sqrt(Math.max(0.0, 1.0 - dt * dt));
      } else {
        r *= 1.0 + 0.045 * Math.sin(t * Math.PI);
      }
    }
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * length));
  }
  const geo = new THREE.LatheGeometry(pts, 22);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export class SculptedHandRig {
  public readonly root = new THREE.Group();
  public readonly motionGroup = new THREE.Group();
  /** Independent forearm pronation/supination pivot (radius/ulna twist!) */
  public readonly forearmPivot = new THREE.Group();
  /** Radiocarpal wrist pivot inside forearmPivot */
  public readonly wristPivot = new THREE.Group();
  public readonly palmCenterAnchor = new THREE.Object3D();
  public readonly strikeTipAnchor = new THREE.Object3D();

  /** Proprietary 27-DOF Biomechanical Articulation Solver */
  public readonly kinesis: JHandKinesisEngine;

  /** Real-time kinetic micro-Foley callback routed to JSound Engin 1.0 */
  public onFoley?: (event: HandFoleyEvent, worldPos: THREE.Vector3) => void;

  private readonly mirrorSign: number; // +1 right hand (player), -1 mirrored (NPC)
  private readonly textures: TextureAtlasLoader;

  // Articulated anatomical sub-segments driven by JHand Kinesis 1.0!
  private readonly cmc4Pivot = new THREE.Group();
  private readonly cmc5Pivot = new THREE.Group();
  private thenarMesh!: THREE.Mesh;
  private dorsalTendonMeshes: THREE.Mesh[] = [];
  private dorsalTendonBaseY: number[] = [];

  private readonly thumb: ThumbJoints;
  private readonly fingers: Record<FingerName, FingerJoints>;

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

  // World-space second-order springs for arm translation & choreography overlays
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

  private motionStiffness = 195;
  private motionDamping = 19;

  // Kinetic overlays
  private idlePhase = 0;
  private idleDrummingWeight = 1.0;
  private recoilPulse = 0;
  private recoilAxis = 1;
  private isHoverPreviewing = false;
  private readonly tmpWorldPos = new THREE.Vector3();

  constructor(
    textures: TextureAtlasLoader,
    materialPreset: HandMaterialPreset,
    isRightHand = true
  ) {
    this.textures = textures;
    this.mirrorSign = isRightHand ? 1 : -1;
    this.idlePhase = isRightHand ? 0.0 : 1.7;
    this.kinesis = new JHandKinesisEngine(this.idlePhase);

    this.root.add(this.motionGroup);
    this.motionGroup.add(this.forearmPivot);
    this.forearmPivot.add(this.wristPivot);

    this.createMaterials(materialPreset);
    this.buildForearmAndCuff();
    this.buildSculptedAnatomicalPalm();

    this.thumb = this.buildThumb();

    // Index & Middle mount to rigid radial metacarpal core; Ring & Pinky mount to flexing CMC4/CMC5 pivots!
    const indexJ = this.buildFinger(this.wristPivot, 0.088 * this.mirrorSign, 0.008, 0.258, [0.105, 0.068, 0.056], 0.0245);
    const middleJ = this.buildFinger(this.wristPivot, 0.028 * this.mirrorSign, 0.012, 0.268, [0.118, 0.076, 0.06], 0.0252);
    // CMC4 pivot rests at carpal base of 4th metacarpal (-0.024, 0.002, 0.075)
    const ringJ = this.buildFinger(this.cmc4Pivot, -0.008 * this.mirrorSign, 0.006, 0.18, [0.108, 0.07, 0.056], 0.024);
    // CMC5 pivot rests at carpal base of 5th metacarpal (-0.062, -0.006, 0.075)
    const pinkyJ = this.buildFinger(this.cmc5Pivot, -0.024 * this.mirrorSign, 0.002, 0.157, [0.086, 0.054, 0.048], 0.021);

    this.fingers = {
      index: indexJ,
      middle: middleJ,
      ring: ringJ,
      pinky: pinkyJ,
    };

    this.palmCenterAnchor.position.set(0, -0.01, 0.16);
    this.wristPivot.add(this.palmCenterAnchor);
    this.strikeTipAnchor.position.set(0, 0.02, 0.36);
    this.wristPivot.add(this.strikeTipAnchor);

    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Apply initial biomechanical frame cleanly
    const initial = this.kinesis.step(1 / 120);
    this.applySolvedFrameToRig(initial, 0);
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

  public setKinesisMode(mode: JHandQualityMode): void {
    this.kinesis.setQualityMode(mode);
  }

  public getKinesisTelemetry(): JHandTelemetry {
    return this.kinesis.getTelemetry();
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

  /**
   * Forearm & Kimono/Velvet Sleeve attach to `forearmPivot` so radius/ulna pronation
   * organically twists the forearm cuff & carpal joint collar!
   */
  private buildForearmAndCuff(): void {
    const wristGeo = new THREE.CylinderGeometry(0.094, 0.106, 0.11, 24);
    wristGeo.rotateX(Math.PI / 2);
    wristGeo.scale(1.16, 0.78, 1.0);
    const wristMesh = this.regPrimary(wristGeo);
    wristMesh.position.set(0, -0.004, -0.04);
    this.forearmPivot.add(wristMesh);

    // Radiocarpal articular gimbal ring bridging forearmPivot and wristPivot
    const carpalBall = this.regJoint(new THREE.SphereGeometry(0.072, 20, 14));
    carpalBall.scale.set(1.22, 0.74, 0.65);
    carpalBall.position.set(0, -0.002, 0.008);
    this.wristPivot.add(carpalBall);

    const collarGeo = new THREE.TorusGeometry(0.096, 0.011, 14, 32);
    collarGeo.scale(1.18, 0.82, 1.0);
    const collar = this.regJoint(collarGeo);
    collar.position.set(0, -0.004, -0.088);
    this.forearmPivot.add(collar);

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
    this.forearmPivot.add(sleeve);

    for (const zOff of [-0.115, -0.145]) {
      const bandGeo = new THREE.TorusGeometry(0.118, 0.0065, 12, 32);
      bandGeo.scale(1.14, 0.9, 1.0);
      const band = new THREE.Mesh(bandGeo, this.trimMat);
      band.position.set(0, -0.005, zOff);
      this.trimMeshes.push(band);
      this.forearmPivot.add(band);
    }
  }

  /**
   * Sculpted Anatomical Palm with:
   *  - Rigid Radial Metacarpal Core (Index & Middle base)
   *  - Articulated CMC4 & CMC5 Ulnar Palm Segments (physically cup inward on fists!)
   *  - Dynamic Thenar Eminence Musculature (bulges with thumb opposition!)
   *  - 4 Visible Dorsal Extensor Tendon Cords (elevate & tense dynamically with finger action!)
   */
  private buildSculptedAnatomicalPalm(): void {
    const s = this.mirrorSign;

    // 1. Radial/Central Palm Core
    const palmCore = this.regPrimary(new THREE.SphereGeometry(0.128, 32, 24));
    palmCore.scale.set(0.86, 0.44, 1.12);
    palmCore.position.set(0.018 * s, 0.0, 0.128);
    this.wristPivot.add(palmCore);

    // Radial knuckle bar spanning index & middle metacarpal heads
    const radialKnuckleGeo = new THREE.CapsuleGeometry(0.035, 0.095, 12, 20);
    radialKnuckleGeo.rotateZ(Math.PI / 2);
    radialKnuckleGeo.scale(1.0, 0.92, 1.04);
    const radialKnuckle = this.regPrimary(radialKnuckleGeo);
    radialKnuckle.position.set(0.056 * s, 0.008, 0.238);
    this.wristPivot.add(radialKnuckle);

    // 2. Articulated CMC4 Segment (4th Metacarpal - Ring Finger base)
    this.cmc4Pivot.position.set(-0.024 * s, 0.002, 0.075);
    this.wristPivot.add(this.cmc4Pivot);
    const meta4Geo = new THREE.CapsuleGeometry(0.028, 0.138, 10, 16);
    meta4Geo.rotateX(Math.PI / 2);
    meta4Geo.scale(1.15, 0.92, 1.0);
    const meta4 = this.regPrimary(meta4Geo);
    meta4.position.set(-0.008 * s, 0.004, 0.096);
    this.cmc4Pivot.add(meta4);

    // 3. Articulated CMC5 Segment (5th Metacarpal + Hypothenar Mound - Pinky base!)
    this.cmc5Pivot.position.set(-0.062 * s, -0.006, 0.075);
    this.wristPivot.add(this.cmc5Pivot);
    const meta5Geo = new THREE.CapsuleGeometry(0.026, 0.122, 10, 16);
    meta5Geo.rotateX(Math.PI / 2);
    meta5Geo.scale(1.12, 0.95, 1.0);
    const meta5 = this.regPrimary(meta5Geo);
    meta5.position.set(-0.018 * s, 0.0, 0.084);
    this.cmc5Pivot.add(meta5);

    const hypo = this.regPrimary(new THREE.SphereGeometry(0.054, 22, 16));
    hypo.scale.set(0.76, 0.72, 1.38);
    hypo.position.set(-0.022 * s, -0.016, 0.044);
    this.cmc5Pivot.add(hypo);

    // 4. Dynamic Thenar Eminence (visibly swells & rotates with thumb Kapandji opposition!)
    this.thenarMesh = this.regPrimary(new THREE.SphereGeometry(0.072, 24, 18));
    this.thenarMesh.scale.set(0.88, 0.72, 1.24);
    this.thenarMesh.position.set(0.074 * s, -0.022, 0.094);
    this.thenarMesh.rotation.y = 0.24 * s;
    this.wristPivot.add(this.thenarMesh);

    // 5. Four Dynamic Dorsal Extensor Tendon Cords (visibly tighten & lift in real time!)
    const tendonDefs: Array<{ parent: THREE.Group; x: number; y: number; z: number; len: number; yaw: number }> = [
      { parent: this.wristPivot, x: 0.068 * s, y: 0.041, z: 0.148, len: 0.142, yaw: 0.14 * s },
      { parent: this.wristPivot, x: 0.022 * s, y: 0.045, z: 0.152, len: 0.148, yaw: 0.04 * s },
      { parent: this.cmc4Pivot, x: -0.008 * s, y: 0.037, z: 0.082, len: 0.132, yaw: -0.04 * s },
      { parent: this.cmc5Pivot, x: -0.016 * s, y: 0.032, z: 0.074, len: 0.118, yaw: -0.11 * s },
    ];
    this.dorsalTendonMeshes = [];
    this.dorsalTendonBaseY = [];

    for (const td of tendonDefs) {
      // Sculpted dorsal metacarpal ridge
      const ridgeGeo = new THREE.CapsuleGeometry(0.0125, td.len, 8, 12);
      ridgeGeo.rotateX(Math.PI / 2);
      const ridge = this.regPrimary(ridgeGeo);
      ridge.position.set(td.x, td.y - 0.005, td.z);
      ridge.rotation.y = td.yaw;
      td.parent.add(ridge);

      // Gleaming inlaid extensor tendon cord riding right on top of the ridge!
      const cordGeo = new THREE.CapsuleGeometry(0.0046, td.len * 0.92, 6, 12);
      cordGeo.rotateX(Math.PI / 2);
      const cord = this.regJoint(cordGeo);
      cord.position.set(td.x, td.y + 0.005, td.z);
      cord.rotation.y = td.yaw;
      td.parent.add(cord);

      this.dorsalTendonMeshes.push(cord);
      this.dorsalTendonBaseY.push(td.y + 0.005);
    }

    // 6. Precision Horological Dorsal Medallion Crest
    const crest = this.regJoint(new THREE.CylinderGeometry(0.031, 0.035, 0.011, 24));
    crest.position.set(0.008 * s, 0.052, 0.118);
    this.wristPivot.add(crest);
    const crestRing = this.regJoint(new THREE.TorusGeometry(0.041, 0.0042, 10, 28));
    crestRing.rotateX(Math.PI / 2);
    crestRing.position.set(0.008 * s, 0.054, 0.118);
    this.wristPivot.add(crestRing);
  }

  private buildFinger(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    lengths: [number, number, number],
    baseRadius: number
  ): FingerJoints {
    const [l1, l2, l3] = lengths;

    const mcp = new THREE.Group();
    mcp.position.set(x, y, z);
    parent.add(mcp);

    // Anatomical MCP Condyle Knuckle + Dual-Side Horological Pivot Pin + Articular Collar
    const mcpKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 1.1, 20, 14));
    mcpKnuckle.scale.set(1.06, 0.96, 1.0);
    mcp.add(mcpKnuckle);

    const mcpPin = this.regJoint(new THREE.CylinderGeometry(baseRadius * 0.34, baseRadius * 0.34, baseRadius * 2.3, 14));
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    const mcpCollar = this.regJoint(new THREE.TorusGeometry(baseRadius * 0.96, baseRadius * 0.11, 8, 20));
    mcpCollar.position.set(0, 0, baseRadius * 0.55);
    mcp.add(mcpCollar);

    mcp.add(this.regPrimary(createOrganicPhalanxGeo(l1, baseRadius, baseRadius * 0.87, false)));

    const pip = new THREE.Group();
    pip.position.set(0, 0, l1);
    mcp.add(pip);

    pip.add(this.regJoint(new THREE.SphereGeometry(baseRadius * 0.93, 18, 12)));
    const pipPin = this.regJoint(new THREE.CylinderGeometry(baseRadius * 0.27, baseRadius * 0.27, baseRadius * 1.98, 12));
    pipPin.rotateZ(Math.PI / 2);
    pip.add(pipPin);

    pip.add(this.regPrimary(createOrganicPhalanxGeo(l2, baseRadius * 0.86, baseRadius * 0.77, false)));

    const dip = new THREE.Group();
    dip.position.set(0, 0, l2);
    pip.add(dip);

    dip.add(this.regJoint(new THREE.SphereGeometry(baseRadius * 0.81, 16, 12)));
    dip.add(this.regPrimary(createOrganicPhalanxGeo(l3, baseRadius * 0.76, baseRadius * 0.66, true)));

    // Sculpted Curved Clearcoat Fingernail
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

    cmc.add(this.regJoint(new THREE.SphereGeometry(baseR * 1.14, 18, 14)));
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

  public setMotionDynamics(stiffness: number, damping: number): void {
    this.motionStiffness = stiffness;
    this.motionDamping = damping;
  }

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

  public addMotionImpulse(vx: number, vy: number, vz: number, pitchV = 0, rollV = 0): void {
    this.offX.impulse(vx);
    this.offY.impulse(vy);
    this.offZ.impulse(vz);
    this.extraPitchS.impulse(pitchV);
    this.extraRollS.impulse(rollV);
  }

  public setTargetPose(
    poseKey: HandPoseKey,
    snappy = false,
    cascadeWave = true,
    hoverMode = false
  ): void {
    this.isHoverPreviewing = hoverMode;
    this.idleDrummingWeight = poseKey === 'ready' && !hoverMode ? 1.0 : 0.0;
    this.kinesis.setTargetPose(poseKey, snappy, cascadeWave, hoverMode);
  }

  public triggerScissorsSnip(): void {
    this.kinesis.triggerScissorsSnip();
  }

  public triggerThoughtTell(): void {
    this.kinesis.triggerThoughtTell();
    this.extraRollS.impulse(-0.6 * this.mirrorSign);
  }

  public triggerRecoil(intensity = 1.0, axisDir = 1): void {
    this.recoilPulse = Math.max(this.recoilPulse, intensity);
    this.recoilAxis = axisDir;
    this.offX.impulse(-axisDir * intensity * 1.15);
    this.offY.impulse(intensity * 0.45);
    this.extraPitchS.impulse(-intensity * 2.2);
    this.extraRollS.impulse(axisDir * intensity * 1.9);
    this.kinesis.injectClashShock(intensity);
  }

  private applySolvedFrameToRig(solved: JHandSolvedFrame, breath: number): void {
    const s = this.mirrorSign;

    // 1. Forearm Pronation/Supination Twist + Radiocarpal Wrist Attitude
    const wristThoughtRoll = Math.sin(this.idlePhase * 0.85) * 0.028 * this.idleDrummingWeight;
    this.forearmPivot.rotation.set(
      0,
      0,
      (solved.wrist.forearmPronation + wristThoughtRoll) * s + this.extraRollS.value * 0.55
    );
    this.wristPivot.rotation.set(
      solved.wrist.wristPitch + this.extraPitchS.value + breath * 0.026,
      solved.wrist.wristYaw * s + this.extraYawS.value,
      solved.wrist.wristRoll * s + this.extraRollS.value * 0.45
    );

    // 2. Dynamic Palmar Metacarpal Arch (CMC4 & CMC5 ulnar palm cupping!)
    // Positive cmc4/cmc5 curls ring & pinky palm segments inward around the transverse arch!
    this.cmc4Pivot.rotation.set(solved.palm.cmc4Flex * 0.72, 0, solved.palm.cmc4Flex * 0.55 * s);
    this.cmc5Pivot.rotation.set(solved.palm.cmc5Flex * 0.85, 0, solved.palm.cmc5Flex * 0.82 * s);

    // 3. Dynamic Sculpted Thenar Eminence Musculature Bulge
    const tb = solved.palm.thenarBulge;
    this.thenarMesh.scale.set(0.86 + tb * 0.16, 0.7 + tb * 0.22, 1.22 + tb * 0.06);
    this.thenarMesh.position.set(
      (0.074 - tb * 0.009) * s,
      -0.022 - tb * 0.008,
      0.094 + tb * 0.008
    );

    // 4. Four Visible Dorsal Extensor Tendon Cords (visibly rise & tauten with tension!)
    for (let i = 0; i < this.dorsalTendonMeshes.length; i++) {
      const tension = solved.dorsalTendons[i];
      const cord = this.dorsalTendonMeshes[i];
      cord.position.y = this.dorsalTendonBaseY[i] + tension * 0.0042;
      cord.scale.set(0.88 + tension * 0.34, 0.85 + tension * 0.45, 1.0);
    }

    // 5. 5-DOF Saddle-Joint Thumb with True Kapandji Opposition Pronation
    this.thumb.cmc.rotation.set(
      solved.thumb.cmcFlex,
      (0.68 + solved.thumb.cmcAbd) * s,
      (-0.62 - solved.thumb.cmcPronation) * s
    );
    this.thumb.mcp.rotation.set(solved.thumb.mcpFlex, 0, 0);
    this.thumb.ip.rotation.set(solved.thumb.ipFlex, 0, 0);

    // 6. All 4 Fingers with ORL DIP–PIP Coupling + Scaphoid Convergence Roll!
    const fNames: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
    for (const fn of fNames) {
      const j = this.fingers[fn];
      const st = solved.fingers[fn];
      j.mcp.rotation.set(st.mcpFlex, st.mcpAbd * s, st.convergenceRoll * s);
      j.pip.rotation.set(st.pipFlex, 0, 0);
      j.dip.rotation.set(st.dipFlex, 0, 0);
    }
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.idlePhase += safeDt * 1.85;
    this.recoilPulse = Math.max(0, this.recoilPulse - safeDt * 4.4);

    // Step world-space motion springs first so we feed real wrist linear velocity into JHand Kinesis 1.0!
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

    // Step 27-DOF JHand Kinesis 1.0 Biomechanics Engine!
    const solved = this.kinesis.step(
      safeDt,
      { x: this.offX.velocity, y: this.offY.velocity, z: this.offZ.velocity },
      this.extraPitchS.value,
      this.extraRollS.value * this.mirrorSign
    );

    this.applySolvedFrameToRig(solved, breath);

    // Stream live micro-Foley articulation events directly to JSound Engin 1.0!
    if (this.onFoley && solved.foleyEvents.length > 0) {
      this.palmCenterAnchor.getWorldPosition(this.tmpWorldPos);
      for (const ev of solved.foleyEvents) {
        this.onFoley(ev, this.tmpWorldPos);
      }
    }
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
