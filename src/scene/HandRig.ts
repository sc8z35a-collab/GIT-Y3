/**
 * ★ Ultra-High-Detail 38-DOF Anatomical 3D Hand Rig — Powered by JHand Kinesis 1.1 ★
 *
 * Driven directly by our proprietary 8-layer 38-DOF biomechanical solver (`JHandKinesisEngine`):
 *  - Distal Radioulnar Joint (`forearmPivot`) with visible Dorsal Ulnar Styloid Head + Volar FCR/PL Flexor Tendons
 *  - Two-Row Carpal Wrist (`radiocarpalPivot` -> `midcarpalPivot`) implementing Dart-Thrower's Motion
 *  - 5-Metacarpal 3-Arch Sculpted Palm (`cmc2Pivot`, `cmc3Pivot`, `cmc4Pivot`, `cmc5Pivot` + CMC5 axial supination)
 *  - Dynamic Intrinsic Musculature: Thenar Eminence, Hypothenar Eminence, First Dorsal Interosseous (FDI) web muscle,
 *    and 3 Interdigital Commissural Webbing Folds that stretch smoothly during Paper & Scissors V-spread
 *  - Complete Dorsal Extensor Mechanism: 4 EDC Tendon Cords + 2 Diagonal Juncturae Tendinum Collagen Bridges
 *    + Radial Thumb EPL ("Anatomical Snuffbox") Tendon Cord
 *  - Eccentric Cam-Axis Volar ICR Glide on every MCP / PIP / DIP joint + Dual-Condyle Knuckles
 *    + Dynamic Dorsal Knuckle-Hood Crease Rings + Squashing Volar Distal Pulp Cushions
 *  - Exact Landmark-Accurate 3D World Coordinates streamed per Foley event to JSound Engin 1.1!
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
  mcpBasePos: THREE.Vector3;
  pipBaseZ: number;
  dipBaseZ: number;
  mcpHoodCollar: THREE.Mesh;
  pipHoodCollar: THREE.Mesh;
  distalPulp: THREE.Mesh;
}

interface ThumbJoints {
  cmc: THREE.Group;
  mcp: THREE.Group;
  ip: THREE.Group;
  tipAnchor: THREE.Object3D;
  distalPulp: THREE.Mesh;
}

/**
 * Create an anatomically contoured phalanx segment using high-resolution LatheGeometry
 * with condylar end flares, subtle dorsal flattening, and authentic distal fingertip taper.
 */
function createOrganicPhalanxGeo(
  length: number,
  baseRadius: number,
  tipRadius: number,
  isDistal: boolean
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r = THREE.MathUtils.lerp(baseRadius, tipRadius, t);
    if (!isDistal) {
      // Anatomical diaphysis waist narrowing + subtle bicondylar flare at proximal/distal heads
      r *= 1.0 - 0.092 * Math.sin(t * Math.PI);
      if (t < 0.16) r *= 0.9 + (t / 0.16) * 0.12;
      if (t > 0.84) r *= 0.9 + ((1 - t) / 0.16) * 0.12;
    } else {
      if (t > 0.6) {
        const dt = (t - 0.6) / 0.4;
        r *= Math.sqrt(Math.max(0.0, 1.0 - dt * dt));
      } else {
        r *= 1.0 + 0.05 * Math.sin(t * Math.PI);
      }
    }
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * length));
  }
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.rotateX(Math.PI / 2);
  // Subtle natural anatomical oval cross-section (slightly wider medio-laterally than dorso-palmarly)
  geo.scale(1.04, 0.92, 1.0);
  geo.computeVertexNormals();
  return geo;
}

export class SculptedHandRig {
  public readonly root = new THREE.Group();
  public readonly motionGroup = new THREE.Group();
  /** Distal Radioulnar Joint (DRUJ) forearm pronation/supination pivot */
  public readonly forearmPivot = new THREE.Group();
  /** Proximal Carpal Row (Radiocarpal joint) */
  public readonly radiocarpalPivot = new THREE.Group();
  /** Distal Carpal Row (Midcarpal joint — carries sculpted palm & digits!) */
  public readonly midcarpalPivot = new THREE.Group();
  /** Public alias for midcarpalPivot (backward compatible with scene anchors) */
  public readonly wristPivot: THREE.Group;

  public readonly palmCenterAnchor = new THREE.Object3D();
  public readonly strikeTipAnchor = new THREE.Object3D();
  private readonly sleeveAnchor = new THREE.Object3D();

  /** Proprietary 38-DOF 8-Layer Biomechanical Articulation Solver */
  public readonly kinesis: JHandKinesisEngine;

  /** Real-time 9-channel landmark-accurate kinetic micro-Foley stream to JSound Engin 1.1 */
  public onFoley?: (event: HandFoleyEvent, worldPos: THREE.Vector3) => void;

  private readonly mirrorSign: number; // +1 right hand (player), -1 mirrored (NPC)
  private readonly textures: TextureAtlasLoader;

  // Articulated 5-Metacarpal Palm Sub-Pivots
  private readonly cmc2Pivot = new THREE.Group();
  private readonly cmc3Pivot = new THREE.Group();
  private readonly cmc4Pivot = new THREE.Group();
  private readonly cmc5Pivot = new THREE.Group();

  // Dynamic Anatomical Soft-Tissue & Tendon Meshes
  private ulnarStyloidMesh!: THREE.Mesh;
  private volarFlexorTendons: THREE.Mesh[] = [];
  private thenarMesh!: THREE.Mesh;
  private hypothenarMesh!: THREE.Mesh;
  private fdiMesh!: THREE.Mesh;
  private eplTendonMesh!: THREE.Mesh;
  private dorsalTendonMeshes: THREE.Mesh[] = [];
  private dorsalTendonBaseY: number[] = [];
  private juncturaeMeshes: THREE.Mesh[] = [];
  private juncturaeBaseY: number[] = [];
  private webbingMeshes: THREE.Mesh[] = [];

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

    this.wristPivot = this.midcarpalPivot;

    this.root.add(this.motionGroup);
    this.motionGroup.add(this.forearmPivot);
    // Two-Row Carpal Wrist Hierarchy: Forearm DRUJ -> Radiocarpal -> Midcarpal (+2.2cm distal)
    this.forearmPivot.add(this.radiocarpalPivot);
    this.midcarpalPivot.position.set(0, 0, 0.022);
    this.radiocarpalPivot.add(this.midcarpalPivot);

    this.createMaterials(materialPreset);
    this.buildForearmAndTwoRowWrist();
    this.buildSculpted5MetacarpalPalm();

    this.thumb = this.buildThumb();

    // Mount all 4 fingers onto their anatomically accurate metacarpal CMC pivots!
    // CMC2 pivot at (0.064*s, 0.002, 0.062); CMC3 pivot at (0.020*s, 0.004, 0.062)
    const indexJ = this.buildFinger(this.cmc2Pivot, 0.024 * this.mirrorSign, 0.006, 0.174, [0.105, 0.068, 0.056], 0.0245);
    const middleJ = this.buildFinger(this.cmc3Pivot, 0.008 * this.mirrorSign, 0.008, 0.184, [0.118, 0.076, 0.06], 0.0252);
    // CMC4 pivot at (-0.024*s, 0.002, 0.056); CMC5 pivot at (-0.062*s, -0.006, 0.056)
    const ringJ = this.buildFinger(this.cmc4Pivot, -0.008 * this.mirrorSign, 0.006, 0.178, [0.108, 0.07, 0.056], 0.024);
    const pinkyJ = this.buildFinger(this.cmc5Pivot, -0.024 * this.mirrorSign, 0.002, 0.156, [0.086, 0.054, 0.048], 0.021);

    this.fingers = {
      index: indexJ,
      middle: middleJ,
      ring: ringJ,
      pinky: pinkyJ,
    };

    this.palmCenterAnchor.position.set(0, -0.01, 0.145);
    this.midcarpalPivot.add(this.palmCenterAnchor);
    this.strikeTipAnchor.position.set(0, 0.02, 0.34);
    this.midcarpalPivot.add(this.strikeTipAnchor);
    this.sleeveAnchor.position.set(0, 0, -0.14);
    this.forearmPivot.add(this.sleeveAnchor);

    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    // Apply initial 38-DOF biomechanical frame cleanly
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
   * Build Forearm DRUJ, Ulnar Styloid Head, Volar FCR/PL Flexor Tendons,
   * and Two-Row Carpal Wrist (Radiocarpal + Midcarpal)!
   */
  private buildForearmAndTwoRowWrist(): void {
    const s = this.mirrorSign;

    const wristGeo = new THREE.CylinderGeometry(0.092, 0.106, 0.11, 24);
    wristGeo.rotateX(Math.PI / 2);
    wristGeo.scale(1.16, 0.77, 1.0);
    const wristMesh = this.regPrimary(wristGeo);
    wristMesh.position.set(0, -0.004, -0.044);
    this.forearmPivot.add(wristMesh);

    // Visible Dorsal Ulnar Styloid Bone Prominence (anatomical wrist contour on pinky side!)
    this.ulnarStyloidMesh = this.regPrimary(new THREE.SphereGeometry(0.019, 16, 12));
    this.ulnarStyloidMesh.scale.set(0.88, 0.68, 1.35);
    this.ulnarStyloidMesh.position.set(-0.075 * s, 0.02, -0.016);
    this.forearmPivot.add(this.ulnarStyloidMesh);

    // Visible Volar Wrist Flexor Tendon Cords (Flexor Carpi Radialis & Palmaris Longus)
    this.volarFlexorTendons = [];
    for (const xOff of [0.018 * s, -0.014 * s]) {
      const fGeo = new THREE.CapsuleGeometry(0.0065, 0.072, 6, 10);
      fGeo.rotateX(Math.PI / 2);
      const fCord = this.regPrimary(fGeo);
      fCord.position.set(xOff, -0.068, -0.036);
      this.forearmPivot.add(fCord);
      this.volarFlexorTendons.push(fCord);
    }

    // Proximal Carpal Row (Radiocarpal articular gimbal bridge)
    const rcCarpal = this.regJoint(new THREE.SphereGeometry(0.068, 22, 16));
    rcCarpal.scale.set(1.22, 0.74, 0.56);
    rcCarpal.position.set(0, -0.002, 0.004);
    this.radiocarpalPivot.add(rcCarpal);

    // Distal Carpal Row (Midcarpal horological ring bridge)
    const mcRing = this.regJoint(new THREE.TorusGeometry(0.066, 0.0075, 10, 26));
    mcRing.scale.set(1.25, 0.76, 1.0);
    mcRing.position.set(0, -0.002, 0.004);
    this.midcarpalPivot.add(mcRing);

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
   * Sculpted 5-Metacarpal Anatomical Palm with:
   *  - Articulated CMC2, CMC3, CMC4, CMC5 metacarpal rays
   *  - Dynamic Thenar, Hypothenar & First Dorsal Interosseous (FDI) intrinsic muscles
   *  - 3 Dynamic Interdigital Commissural Webbing Folds
   *  - 4 Dorsal EDC Tendon Cords + 2 Diagonal Juncturae Tendinum Bridges + Thumb EPL Snuffbox Cord!
   */
  private buildSculpted5MetacarpalPalm(): void {
    const s = this.mirrorSign;

    // 1. Central Carpal / Deep Transverse Palm Core
    const palmCore = this.regPrimary(new THREE.SphereGeometry(0.124, 32, 24));
    palmCore.scale.set(0.84, 0.44, 1.1);
    palmCore.position.set(0.016 * s, 0.0, 0.106);
    this.midcarpalPivot.add(palmCore);

    // 2. Articulated CMC2 (2nd Metacarpal - Index ray)
    this.cmc2Pivot.position.set(0.064 * s, 0.002, 0.062);
    this.midcarpalPivot.add(this.cmc2Pivot);
    const meta2Geo = new THREE.CapsuleGeometry(0.029, 0.136, 10, 16);
    meta2Geo.rotateX(Math.PI / 2);
    meta2Geo.scale(1.14, 0.92, 1.0);
    const meta2 = this.regPrimary(meta2Geo);
    meta2.position.set(0.014 * s, 0.004, 0.088);
    meta2.rotation.y = 0.07 * s;
    this.cmc2Pivot.add(meta2);

    // 3. Articulated CMC3 (3rd Metacarpal - Middle keystone ray)
    this.cmc3Pivot.position.set(0.02 * s, 0.004, 0.062);
    this.midcarpalPivot.add(this.cmc3Pivot);
    const meta3Geo = new THREE.CapsuleGeometry(0.03, 0.144, 10, 16);
    meta3Geo.rotateX(Math.PI / 2);
    meta3Geo.scale(1.15, 0.92, 1.0);
    const meta3 = this.regPrimary(meta3Geo);
    meta3.position.set(0.004 * s, 0.006, 0.094);
    this.cmc3Pivot.add(meta3);

    // Radial knuckle saddle cushion bridging 2nd & 3rd metacarpal heads
    const radialPadGeo = new THREE.CapsuleGeometry(0.031, 0.066, 10, 18);
    radialPadGeo.rotateZ(Math.PI / 2);
    radialPadGeo.scale(1.0, 0.88, 1.0);
    const radialPad = this.regPrimary(radialPadGeo);
    radialPad.position.set(0.056 * s, 0.004, 0.214);
    this.midcarpalPivot.add(radialPad);

    // 4. Articulated CMC4 (4th Metacarpal - Ring ray)
    this.cmc4Pivot.position.set(-0.024 * s, 0.002, 0.056);
    this.midcarpalPivot.add(this.cmc4Pivot);
    const meta4Geo = new THREE.CapsuleGeometry(0.028, 0.138, 10, 16);
    meta4Geo.rotateX(Math.PI / 2);
    meta4Geo.scale(1.15, 0.92, 1.0);
    const meta4 = this.regPrimary(meta4Geo);
    meta4.position.set(-0.008 * s, 0.004, 0.094);
    this.cmc4Pivot.add(meta4);

    // 5. Articulated CMC5 (5th Metacarpal + Dynamic Hypothenar Eminence - Pinky ray)
    this.cmc5Pivot.position.set(-0.062 * s, -0.006, 0.056);
    this.midcarpalPivot.add(this.cmc5Pivot);
    const meta5Geo = new THREE.CapsuleGeometry(0.026, 0.122, 10, 16);
    meta5Geo.rotateX(Math.PI / 2);
    meta5Geo.scale(1.12, 0.95, 1.0);
    const meta5 = this.regPrimary(meta5Geo);
    meta5.position.set(-0.018 * s, 0.0, 0.082);
    this.cmc5Pivot.add(meta5);

    this.hypothenarMesh = this.regPrimary(new THREE.SphereGeometry(0.054, 22, 16));
    this.hypothenarMesh.scale.set(0.76, 0.72, 1.38);
    this.hypothenarMesh.position.set(-0.022 * s, -0.016, 0.042);
    this.cmc5Pivot.add(this.hypothenarMesh);

    // 6. Dynamic Thenar Eminence (Thumb-base palm musculature)
    this.thenarMesh = this.regPrimary(new THREE.SphereGeometry(0.072, 24, 18));
    this.thenarMesh.scale.set(0.88, 0.72, 1.24);
    this.thenarMesh.position.set(0.074 * s, -0.022, 0.074);
    this.thenarMesh.rotation.y = 0.24 * s;
    this.midcarpalPivot.add(this.thenarMesh);

    // 7. Dynamic First Dorsal Interosseous (FDI — thumb-index dorsal web muscle!)
    this.fdiMesh = this.regPrimary(new THREE.SphereGeometry(0.036, 20, 14));
    this.fdiMesh.scale.set(0.84, 0.46, 1.24);
    this.fdiMesh.position.set(0.082 * s, 0.002, 0.126);
    this.fdiMesh.rotation.y = 0.34 * s;
    this.midcarpalPivot.add(this.fdiMesh);

    // 8. Three Dynamic Interdigital Commissural Webbing Folds (Index-Mid, Mid-Ring, Ring-Pinky)
    const webDefs = [
      { parent: this.midcarpalPivot, x: 0.057 * s, y: -0.004, z: 0.238, w: 0.032 },
      { parent: this.midcarpalPivot, x: -0.003 * s, y: -0.003, z: 0.241, w: 0.031 },
      { parent: this.cmc4Pivot, x: -0.032 * s, y: -0.005, z: 0.168, w: 0.028 },
    ];
    this.webbingMeshes = [];
    for (const wd of webDefs) {
      const wGeo = new THREE.SphereGeometry(wd.w, 16, 12);
      wGeo.scale(0.88, 0.36, 0.72);
      const web = this.regPrimary(wGeo);
      web.position.set(wd.x, wd.y, wd.z);
      wd.parent.add(web);
      this.webbingMeshes.push(web);
    }

    // 9. Four Dynamic Dorsal Extensor Tendon Cords (EDC) mounted directly to their 4 metacarpals!
    const tendonDefs: Array<{ parent: THREE.Group; x: number; y: number; z: number; len: number; yaw: number }> = [
      { parent: this.cmc2Pivot, x: 0.012 * s, y: 0.036, z: 0.08, len: 0.138, yaw: 0.09 * s },
      { parent: this.cmc3Pivot, x: 0.004 * s, y: 0.04, z: 0.084, len: 0.144, yaw: 0.02 * s },
      { parent: this.cmc4Pivot, x: -0.008 * s, y: 0.036, z: 0.08, len: 0.132, yaw: -0.04 * s },
      { parent: this.cmc5Pivot, x: -0.016 * s, y: 0.031, z: 0.072, len: 0.118, yaw: -0.1 * s },
    ];
    this.dorsalTendonMeshes = [];
    this.dorsalTendonBaseY = [];

    for (const td of tendonDefs) {
      const ridgeGeo = new THREE.CapsuleGeometry(0.012, td.len, 8, 12);
      ridgeGeo.rotateX(Math.PI / 2);
      const ridge = this.regPrimary(ridgeGeo);
      ridge.position.set(td.x, td.y - 0.005, td.z);
      ridge.rotation.y = td.yaw;
      td.parent.add(ridge);

      const cordGeo = new THREE.CapsuleGeometry(0.0046, td.len * 0.92, 6, 12);
      cordGeo.rotateX(Math.PI / 2);
      const cord = this.regJoint(cordGeo);
      cord.position.set(td.x, td.y + 0.005, td.z);
      cord.rotation.y = td.yaw;
      td.parent.add(cord);

      this.dorsalTendonMeshes.push(cord);
      this.dorsalTendonBaseY.push(td.y + 0.005);
    }

    // 10. Two Visible Diagonal Juncturae Tendinum Collagen Bridge Bands (Mid↔Ring & Ring↔Pinky)!
    const juncDefs = [
      { x: -0.004 * s, y: 0.04, z: 0.17, len: 0.044, yaw: -0.76 * s },
      { x: -0.048 * s, y: 0.035, z: 0.16, len: 0.04, yaw: -0.82 * s },
    ];
    this.juncturaeMeshes = [];
    this.juncturaeBaseY = [];
    for (const jd of juncDefs) {
      const jGeo = new THREE.CapsuleGeometry(0.0022, jd.len, 6, 10);
      jGeo.rotateX(Math.PI / 2);
      const jMesh = this.regJoint(jGeo);
      jMesh.position.set(jd.x, jd.y, jd.z);
      jMesh.rotation.y = jd.yaw;
      this.midcarpalPivot.add(jMesh);
      this.juncturaeMeshes.push(jMesh);
      this.juncturaeBaseY.push(jd.y);
    }

    // 11. Visible Radial Thumb EPL ("Anatomical Snuffbox") Dorsal Tendon Cord!
    const eplGeo = new THREE.CapsuleGeometry(0.004, 0.095, 6, 10);
    eplGeo.rotateX(Math.PI / 2);
    this.eplTendonMesh = this.regJoint(eplGeo);
    this.eplTendonMesh.position.set(0.072 * s, 0.025, 0.048);
    this.eplTendonMesh.rotation.set(0.18, 0.56 * s, 0);
    this.midcarpalPivot.add(this.eplTendonMesh);

    // 12. Precision Horological Dorsal Medallion Crest
    const crest = this.regJoint(new THREE.CylinderGeometry(0.03, 0.034, 0.011, 24));
    crest.position.set(0.008 * s, 0.05, 0.096);
    this.midcarpalPivot.add(crest);
    const crestRing = this.regJoint(new THREE.TorusGeometry(0.04, 0.0042, 10, 28));
    crestRing.rotateX(Math.PI / 2);
    crestRing.position.set(0.008 * s, 0.052, 0.096);
    this.midcarpalPivot.add(crestRing);
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

    // Dual-Condyle Anatomical MCP Knuckle + Precision Micro-Pin + Dynamic Dorsal Extensor Hood Collar
    const mcpKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 1.12, 22, 16));
    mcpKnuckle.scale.set(1.08, 0.96, 1.0);
    mcp.add(mcpKnuckle);

    // Twin lateral condyle bosses (authentic anatomical metacarpal head silhouette!)
    for (const side of [-1, 1]) {
      const condyle = this.regJoint(new THREE.SphereGeometry(baseRadius * 0.52, 12, 10));
      condyle.position.set(side * baseRadius * 0.68, 0.001, 0.002);
      mcp.add(condyle);
    }

    const mcpPin = this.regJoint(
      new THREE.CylinderGeometry(baseRadius * 0.34, baseRadius * 0.34, baseRadius * 2.38, 14)
    );
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    const mcpHoodCollar = this.regJoint(new THREE.TorusGeometry(baseRadius * 0.98, baseRadius * 0.11, 8, 22));
    mcpHoodCollar.position.set(0, 0.001, baseRadius * 0.58);
    mcp.add(mcpHoodCollar);

    mcp.add(this.regPrimary(createOrganicPhalanxGeo(l1, baseRadius, baseRadius * 0.87, false)));

    // PIP Joint with Bicondylar Collar & Dynamic Crease Ring
    const pip = new THREE.Group();
    pip.position.set(0, 0, l1);
    mcp.add(pip);

    const pipBall = this.regJoint(new THREE.SphereGeometry(baseRadius * 0.95, 20, 14));
    pipBall.scale.set(1.05, 0.94, 1.0);
    pip.add(pipBall);

    const pipPin = this.regJoint(
      new THREE.CylinderGeometry(baseRadius * 0.27, baseRadius * 0.27, baseRadius * 2.02, 12)
    );
    pipPin.rotateZ(Math.PI / 2);
    pip.add(pipPin);

    const pipHoodCollar = this.regJoint(new THREE.TorusGeometry(baseRadius * 0.85, baseRadius * 0.09, 8, 20));
    pipHoodCollar.position.set(0, 0.001, baseRadius * 0.45);
    pip.add(pipHoodCollar);

    pip.add(this.regPrimary(createOrganicPhalanxGeo(l2, baseRadius * 0.86, baseRadius * 0.77, false)));

    // DIP Joint + Sculpted Distal Phalanx + Volar Pulp Cushion + Curved Clearcoat Nail
    const dip = new THREE.Group();
    dip.position.set(0, 0, l2);
    pip.add(dip);

    dip.add(this.regJoint(new THREE.SphereGeometry(baseRadius * 0.82, 18, 12)));
    dip.add(this.regPrimary(createOrganicPhalanxGeo(l3, baseRadius * 0.76, baseRadius * 0.66, true)));

    // Soft Elastic Volar Distal Pulp Cushion (squashes subtly upon palm/object contact!)
    const pulpGeo = new THREE.SphereGeometry(baseRadius * 0.68, 14, 10);
    pulpGeo.scale(0.95, 0.62, 1.38);
    const distalPulp = this.regPrimary(pulpGeo);
    distalPulp.position.set(0, -baseRadius * 0.26, l3 * 0.56);
    dip.add(distalPulp);

    // Sculpted Curved Clearcoat Fingernail
    const nailGeo = new THREE.SphereGeometry(baseRadius * 0.62, 14, 10);
    nailGeo.scale(0.95, 0.26, 1.35);
    const nail = new THREE.Mesh(nailGeo, this.nailMat);
    nail.position.set(0, baseRadius * 0.53, l3 * 0.58);
    nail.rotation.x = 0.08;
    this.nailMeshes.push(nail);
    dip.add(nail);

    const tipAnchor = new THREE.Object3D();
    tipAnchor.position.set(0, 0, l3);
    dip.add(tipAnchor);

    return {
      mcp,
      pip,
      dip,
      tipAnchor,
      mcpBasePos: new THREE.Vector3(x, y, z),
      pipBaseZ: l1,
      dipBaseZ: l2,
      mcpHoodCollar,
      pipHoodCollar,
      distalPulp,
    };
  }

  private buildThumb(): ThumbJoints {
    const baseR = 0.0285;
    const cmc = new THREE.Group();
    cmc.position.set(0.102 * this.mirrorSign, -0.016, 0.068);
    this.midcarpalPivot.add(cmc);

    cmc.add(this.regJoint(new THREE.SphereGeometry(baseR * 1.16, 18, 14)));
    const lMeta = 0.095;
    cmc.add(this.regPrimary(createOrganicPhalanxGeo(lMeta, baseR * 1.08, baseR * 0.94, false)));

    const mcp = new THREE.Group();
    mcp.position.set(0, 0, lMeta);
    cmc.add(mcp);

    mcp.add(this.regJoint(new THREE.SphereGeometry(baseR * 0.99, 18, 12)));
    const mcpPin = this.regJoint(
      new THREE.CylinderGeometry(baseR * 0.3, baseR * 0.3, baseR * 2.12, 12)
    );
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);

    const lProx = 0.074;
    mcp.add(this.regPrimary(createOrganicPhalanxGeo(lProx, baseR * 0.94, baseR * 0.84, false)));

    const ip = new THREE.Group();
    ip.position.set(0, 0, lProx);
    mcp.add(ip);

    ip.add(this.regJoint(new THREE.SphereGeometry(baseR * 0.87, 16, 12)));
    const lDist = 0.064;
    ip.add(this.regPrimary(createOrganicPhalanxGeo(lDist, baseR * 0.84, baseR * 0.72, true)));

    // Elastic Volar Thumb Pulp Cushion
    const tPulpGeo = new THREE.SphereGeometry(baseR * 0.74, 14, 10);
    tPulpGeo.scale(0.98, 0.65, 1.32);
    const distalPulp = this.regPrimary(tPulpGeo);
    distalPulp.position.set(0, -baseR * 0.28, lDist * 0.54);
    ip.add(distalPulp);

    const nailGeo = new THREE.SphereGeometry(baseR * 0.68, 14, 10);
    nailGeo.scale(1.0, 0.25, 1.32);
    const nail = new THREE.Mesh(nailGeo, this.nailMat);
    nail.position.set(0, baseR * 0.56, lDist * 0.56);
    this.nailMeshes.push(nail);
    ip.add(nail);

    const tipAnchor = new THREE.Object3D();
    tipAnchor.position.set(0, 0, lDist);
    ip.add(tipAnchor);

    return { cmc, mcp, ip, tipAnchor, distalPulp };
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

    // 1. Forearm DRUJ Pronation + Visible Ulnar Styloid Head + Volar FCR/PL Flexor Tendons
    const wristThoughtRoll = Math.sin(this.idlePhase * 0.85) * 0.026 * this.idleDrummingWeight;
    this.forearmPivot.rotation.set(
      0,
      0,
      (solved.wrist.forearmPronation + wristThoughtRoll) * s + this.extraRollS.value * 0.54
    );

    const usp = solved.wrist.ulnarStyloidProminence;
    this.ulnarStyloidMesh.position.y = 0.018 + usp * 0.005;
    this.ulnarStyloidMesh.scale.set(0.84 + usp * 0.12, 0.64 + usp * 0.16, 1.3 + usp * 0.12);

    const ft = solved.wrist.flexorTendonTension;
    for (const cord of this.volarFlexorTendons) {
      cord.position.y = -0.066 - ft * 0.0045;
      cord.scale.set(0.9 + ft * 0.25, 0.85 + ft * 0.35, 1.0);
    }

    // 2. Two-Row Carpal Wrist (Radiocarpal + Midcarpal Articulation!)
    const totalExtraPitch = this.extraPitchS.value + breath * 0.025;
    this.radiocarpalPivot.rotation.set(
      solved.wrist.rcPitch + totalExtraPitch * 0.46,
      solved.wrist.wristYaw * 0.45 * s + this.extraYawS.value * 0.45,
      solved.wrist.wristRoll * 0.45 * s + this.extraRollS.value * 0.22
    );
    this.midcarpalPivot.rotation.set(
      solved.wrist.mcPitch + totalExtraPitch * 0.54,
      solved.wrist.wristYaw * 0.55 * s + this.extraYawS.value * 0.55,
      solved.wrist.wristRoll * 0.55 * s + this.extraRollS.value * 0.24
    );

    // 3. 5-Metacarpal 3-Arch Palmar Skeleton (CMC2/3 compliance + CMC4/5 cupping + CMC5 supination!)
    this.cmc2Pivot.rotation.set(solved.palm.cmc2Flex, 0, -solved.palm.cmc2Flex * 0.35 * s);
    this.cmc3Pivot.rotation.set(solved.palm.cmc3Flex, 0, 0);
    this.cmc4Pivot.rotation.set(solved.palm.cmc4Flex * 0.72, 0, solved.palm.cmc4Flex * 0.56 * s);
    this.cmc5Pivot.rotation.set(
      solved.palm.cmc5Flex * 0.86,
      0,
      (solved.palm.cmc5Flex * 0.65 + solved.palm.cmc5Supination * 0.82) * s
    );

    // 4. Dynamic Intrinsic Musculature: Thenar, Hypothenar & First Dorsal Interosseous (FDI)
    const tb = solved.palm.thenarBulge;
    this.thenarMesh.scale.set(0.86 + tb * 0.17, 0.7 + tb * 0.24, 1.22 + tb * 0.06);
    this.thenarMesh.position.set(
      (0.074 - tb * 0.009) * s,
      -0.022 - tb * 0.0085,
      0.074 + tb * 0.008
    );

    const hb = solved.palm.hypothenarBulge;
    this.hypothenarMesh.scale.set(0.74 + hb * 0.16, 0.7 + hb * 0.22, 1.36 + hb * 0.06);

    const fdi = solved.palm.fdiBulge;
    this.fdiMesh.scale.set(0.82 + fdi * 0.16, 0.44 + fdi * 0.2, 1.22 + fdi * 0.08);
    this.fdiMesh.position.y = 0.002 + fdi * 0.004;

    // 5. Three Interdigital Commissural Webbing Folds (stretch sleekly on Paper/Scissors spread!)
    for (let i = 0; i < this.webbingMeshes.length; i++) {
      const ws = solved.palm.webbingStretch[i];
      const wMesh = this.webbingMeshes[i];
      wMesh.scale.set(0.75 + ws * 0.62, 0.4 - ws * 0.12, 0.65 + ws * 0.25);
    }

    // 6. Dorsal Extensor Mechanism: 4 EDC Cords + 2 Juncturae Tendinum Bridges + Thumb EPL Snuffbox!
    for (let i = 0; i < this.dorsalTendonMeshes.length; i++) {
      const tension = solved.dorsalTendons[i];
      const cord = this.dorsalTendonMeshes[i];
      cord.position.y = this.dorsalTendonBaseY[i] + tension * 0.0046;
      cord.scale.set(0.86 + tension * 0.38, 0.84 + tension * 0.48, 1.0);
    }

    for (let i = 0; i < this.juncturaeMeshes.length; i++) {
      const jt = solved.palm.juncturaeTension[i];
      const jm = this.juncturaeMeshes[i];
      jm.position.y = this.juncturaeBaseY[i] + jt * 0.0038;
      jm.scale.set(0.85 + jt * 0.34, 0.85 + jt * 0.42, 1.0);
    }

    const epl = solved.thumb.eplTendonTension;
    this.eplTendonMesh.position.y = 0.024 + epl * 0.0055;
    this.eplTendonMesh.scale.set(0.85 + epl * 0.42, 0.85 + epl * 0.48, 1.0);

    // 7. 6-DOF Saddle-Joint Thumb (with MCP Radial Yield + IP Hyperextension + Pulp Squash!)
    this.thumb.cmc.rotation.set(
      solved.thumb.cmcFlex,
      (0.68 + solved.thumb.cmcAbd) * s,
      (-0.62 - solved.thumb.cmcPronation) * s
    );
    this.thumb.mcp.rotation.set(solved.thumb.mcpFlex, solved.thumb.mcpAbd * s, 0);
    this.thumb.ip.rotation.set(solved.thumb.ipFlex, 0, 0);

    const tp = solved.thumb.pulpCompression;
    this.thumb.distalPulp.scale.set(0.98 + tp * 0.16, 0.65 - tp * 0.16, 1.32 + tp * 0.06);

    // 8. All 4 Fingers (5-DOF + Eccentric Cam Volar ICR Glide + Clinodactyly Cant + Pulp Squash!)
    const fNames: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
    for (const fn of fNames) {
      const j = this.fingers[fn];
      const st = solved.fingers[fn];

      // Eccentric Cam-Axis Volar ICR Glide shifts distal base slightly volarly on deep flexion!
      j.mcp.position.set(j.mcpBasePos.x, j.mcpBasePos.y - st.mcpVolarGlide, j.mcpBasePos.z);
      j.pip.position.set(0, -st.pipVolarGlide, j.pipBaseZ);
      j.dip.position.set(0, -st.dipVolarGlide, j.dipBaseZ);

      j.mcp.rotation.set(st.mcpFlex, st.mcpAbd * s, st.mcpAxialTwist * s);
      j.pip.rotation.set(st.pipFlex, 0, 0);
      j.dip.rotation.set(st.dipFlex, st.dipCant * s, 0);

      // Knuckle-hood dorsal skin-fold collars stretch cleanly during flexion
      const ks = st.knuckleCreaseStretch;
      j.mcpHoodCollar.scale.set(1.0 + ks * 0.09, 1.0 - ks * 0.14, 1.0 + ks * 0.18);
      j.pipHoodCollar.scale.set(1.0 + ks * 0.07, 1.0 - ks * 0.12, 1.0 + ks * 0.14);

      // Soft fingertip volar pulp pad compresses realistically against palm bed
      const pc = st.pulpCompression;
      j.distalPulp.scale.set(0.95 + pc * 0.18, 0.62 - pc * 0.18, 1.38 + pc * 0.06);
    }
  }

  private getLandmarkWorldPosition(
    landmark: HandFoleyEvent['finger'],
    out: THREE.Vector3
  ): THREE.Vector3 {
    if (landmark === 'index' || landmark === 'middle' || landmark === 'ring' || landmark === 'pinky') {
      return this.fingers[landmark].tipAnchor.getWorldPosition(out);
    }
    if (landmark === 'thumb') {
      return this.thumb.tipAnchor.getWorldPosition(out);
    }
    if (landmark === 'sleeve') {
      return this.sleeveAnchor.getWorldPosition(out);
    }
    if (landmark === 'wrist') {
      return this.radiocarpalPivot.getWorldPosition(out);
    }
    return this.palmCenterAnchor.getWorldPosition(out);
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.idlePhase += safeDt * 1.85;
    this.recoilPulse = Math.max(0, this.recoilPulse - safeDt * 4.4);

    // Step world-space motion springs first so we feed real wrist velocity into JHand Kinesis 1.1
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
    const recoilVibration =
      Math.sin(this.idlePhase * 32.0) * this.recoilPulse * 0.016 * this.recoilAxis;

    this.motionGroup.position.set(
      this.offX.value + recoilVibration,
      this.offY.value + breath * 0.013 + hoverFloat,
      this.offZ.value + Math.cos(this.idlePhase * 0.7) * 0.006 * this.idleDrummingWeight
    );

    // Step 38-DOF JHand Kinesis 1.1 Biomechanics Engine!
    const solved = this.kinesis.step(
      safeDt,
      { x: this.offX.velocity, y: this.offY.velocity, z: this.offZ.velocity },
      this.extraPitchS.value,
      this.extraRollS.value * this.mirrorSign
    );

    this.applySolvedFrameToRig(solved, breath);

    // Stream landmark-accurate 3D micro-Foley articulation events directly to JSound Engin 1.1!
    if (this.onFoley && solved.foleyEvents.length > 0) {
      for (const ev of solved.foleyEvents) {
        this.getLandmarkWorldPosition(ev.finger, this.tmpWorldPos);
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
