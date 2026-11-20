/**
 * ★ Ultra-High-Detail 38-DOF Anatomical 3D Hand Rig — JHand Kinesis 1.1 × FINGER S1.0 ★
 *
 * Driven directly by our proprietary 8-layer 38-DOF biomechanical solver (`JHandKinesisEngine`)
 * and rendered with our hyper-real **FINGER S1.0** anatomical sculpting & dermal-SSS engine:
 *  - **FINGER S1.0 Mode** (toggleable live with 0ms stutter):
 *      · Asymmetric 32×24 anatomically sculpted phalanges (flat dorsal ridge, plump volar pulp pads,
 *        bicondylar flares, recessed concave nail bed framed by lateral paronychium nail folds)
 *      · Seamless skin-wrapped anatomical joint capsules + 3-layer dynamic dorsal knuckle wrinkle stacks
 *        (compress/bunch on extension, stretch sleekly flat on flexion!)
 *      · Dual-curvature anatomical nail plates with ivory lunula, rosy nail bed, free edge & striations
 *      · Continuous sculpted 3D palm body + subcutaneous dorsal extensor tendons & subtle venous arch
 *      · Custom GLSL Hemoglobin Wrap-SSS + Backlit Translucency + Real-Time Knuckle Blanching (`uEffort`)
 *        + Vellus Peach-Fuzz Sheen — 100% compatible with Shadow Flame 1.0 & KHDR!
 *  - **Framerate-Invariant `AnalyticSpring`**: exact closed-form damped harmonic arm/wrist kinematics
 *    for identical C² silky ("ぬるぬる") fluidity at 60 / 120 / 240 / Unlimited FPS!
 *  - **5 Hand Craft / Living Presets**: `living_skin` (生体・極写実肌), `hinoki_ivory`,
 *    `karakuri_bronze`, `bisque_porcelain`, `obsidian_gold`.
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
import {
  DermaTensorState,
  SculptedPalmSubcutaneousField,
  evaluateDermaTensorState,
} from '../engine/handdetail/DermaTensorEngine';
import {
  KeratinNailUniforms,
  NailPressureRefillSolver,
  VellusHairUniforms,
  createFingerDorsalVellusField,
  createVellusHairInstancedField,
  enhanceNailWithKeratinOptics,
} from '../engine/handdetail/ChromaDermOptics';
import {
  AnalyticSpring,
  FingerS1ShaderUniforms,
  createFingerS1CuticleArchGeo,
  createFingerS1ForearmWristGeo,
  createFingerS1JointCapsuleGeo,
  createFingerS1KnuckleWrinkleStackGeo,
  createFingerS1NailPlateGeo,
  createFingerS1PhalanxGeo,
  createFingerS1SculptedPalmGeo,
  enhanceMaterialWithFingerS1Shader,
  getFingerS1TextureSet,
} from '../graphics/FingerS1Engine';
import { HandMaterialPreset } from '../graphics/GraphicsConfig';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';

export type { HandPoseKey } from '../engine/jhand/types';

export interface HandDetailTelemetry {
  dermaTendonLiftMm: number;
  dermaWrinklePct: number;
  dermaVolarCreasePct: number;
  dermaStatusJp: string;
  nailBlanchPct: number;
  vellusHairCount: number;
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
  mcpWrinkleStack: THREE.Mesh;
  pipWrinkleStack: THREE.Mesh;
  distalPulp: THREE.Mesh;
  s1Nail: THREE.Mesh;
}

interface ThumbJoints {
  cmc: THREE.Group;
  mcp: THREE.Group;
  ip: THREE.Group;
  tipAnchor: THREE.Object3D;
  mcpWrinkleStack: THREE.Mesh;
  ipWrinkleStack: THREE.Mesh;
  distalPulp: THREE.Mesh;
}

/**
 * Classic Artisan Lathe phalanx (preserved for instant FINGER S1.0 ON/OFF A/B comparison!).
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
  /** Public alias for midcarpalPivot */
  public readonly wristPivot: THREE.Group;

  public readonly palmCenterAnchor = new THREE.Object3D();
  public readonly strikeTipAnchor = new THREE.Object3D();
  private readonly sleeveAnchor = new THREE.Object3D();

  /** Proprietary 38-DOF 8-Layer Biomechanical Articulation Solver */
  public readonly kinesis: JHandKinesisEngine;

  /** Real-time 9-channel landmark-accurate kinetic micro-Foley stream to JSound Engin 1.3 */
  public onFoley?: (event: HandFoleyEvent, worldPos: THREE.Vector3) => void;

  private readonly mirrorSign: number; // +1 right hand (player), -1 mirrored (NPC)
  private readonly textures: TextureAtlasLoader;
  private currentPreset: HandMaterialPreset;
  private fingerS1Enabled: boolean;
  private dermaTensorEnabled = true;
  private chromaDermEnabled = true;

  // FINGER S1.0 + DERMA-TENSOR 1.0 + CHROMA-DERM 1.0 shared optical dermal uniforms
  private readonly s1Uniforms: FingerS1ShaderUniforms = {
    uS1Enabled: { value: 1.0 },
    uS1SkinMode: { value: 1.0 },
    uS1Effort: { value: 0.2 },
    uS1SunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
    uS1DermaEnabled: { value: 1.0 },
    uS1ChromaEnabled: { value: 1.0 },
    uS1DorsalStrain: { value: 0.25 },
    uS1VolarCompress: { value: 0.42 },
    uS1Sweat: { value: 0.14 },
    uS1VascularPulse: { value: 0.35 },
  };

  // CHROMA-DERM & KERATIN OPTICS 1.0 nail-bed anisotropic optics & capillary refill uniforms
  private readonly nailUniforms: KeratinNailUniforms = {
    uKeratinEnabled: { value: 1.0 },
    uNailSkinMode: { value: 1.0 },
    uNailPressure: { value: 0.0 },
    uNailPulse: { value: 0.35 },
    uNailSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
  };
  private readonly nailRefillSolver = new NailPressureRefillSolver();
  private palmSubcutaneousField?: SculptedPalmSubcutaneousField;
  private readonly vellusHairMeshes: THREE.InstancedMesh[] = [];
  private vellusUniforms?: VellusHairUniforms;
  private vellusMaterial?: THREE.ShaderMaterial;
  private lastDermaState?: DermaTensorState;
  private lastPulseWave = 0.35;
  private lastSweatSheen = 0.14;
  private lastFrameDt = 1 / 60;

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

  // Materials
  private primaryMat!: THREE.MeshPhysicalMaterial;
  private fingerMat!: THREE.MeshPhysicalMaterial;
  private jointMat!: THREE.MeshPhysicalMaterial;
  private s1JointCapsuleMat!: THREE.MeshPhysicalMaterial;
  private nailMat!: THREE.MeshPhysicalMaterial;
  private sleeveMat!: THREE.MeshPhysicalMaterial;
  private trimMat!: THREE.MeshPhysicalMaterial;

  // Registered mesh groups for zero-stutter live material & FINGER S1.0 toggling
  private readonly primaryMeshes: THREE.Mesh[] = [];
  private readonly seamlessSkinMeshes: THREE.Mesh[] = [];
  private readonly fingerMeshes: THREE.Mesh[] = [];
  private readonly jointMeshes: THREE.Mesh[] = [];
  private readonly s1JointMeshes: THREE.Mesh[] = [];
  private readonly tendonMeshes: THREE.Mesh[] = [];
  private readonly nailMeshes: THREE.Mesh[] = [];
  private readonly sleeveMeshes: THREE.Mesh[] = [];
  private readonly trimMeshes: THREE.Mesh[] = [];

  private readonly s1OnlyMeshes: THREE.Object3D[] = [];
  private readonly classicOnlyMeshes: THREE.Object3D[] = [];
  private readonly artisanDetailMeshes: THREE.Object3D[] = [];

  // Exact Closed-Form Framerate-Invariant Analytical Springs for silky arm translation & posture!
  public targetOffset = new THREE.Vector3();
  private readonly offX = new AnalyticSpring(0);
  private readonly offY = new AnalyticSpring(0);
  private readonly offZ = new AnalyticSpring(0);
  public targetExtraPitch = 0;
  public targetExtraYaw = 0;
  public targetExtraRoll = 0;
  private readonly extraPitchS = new AnalyticSpring(0);
  private readonly extraYawS = new AnalyticSpring(0);
  private readonly extraRollS = new AnalyticSpring(0);

  private motionStiffness = 195;
  private motionDamping = 21.5;

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
    isRightHand = true,
    fingerS1Enabled = true
  ) {
    this.textures = textures;
    this.currentPreset = materialPreset;
    this.fingerS1Enabled = fingerS1Enabled;
    this.s1Uniforms.uS1Enabled.value = fingerS1Enabled ? 1.0 : 0.0;
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
    const indexJ = this.buildFinger(this.cmc2Pivot, 0.024 * this.mirrorSign, 0.006, 0.174, [0.105, 0.068, 0.056], 0.0245);
    const middleJ = this.buildFinger(this.cmc3Pivot, 0.008 * this.mirrorSign, 0.008, 0.184, [0.118, 0.076, 0.06], 0.0252);
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
      if (obj instanceof THREE.Mesh && !this.vellusHairMeshes.includes(obj as THREE.InstancedMesh)) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.syncVisibilityForMode();

    // Apply initial 38-DOF biomechanical frame cleanly
    const initial = this.kinesis.step(1 / 120);
    this.applySolvedFrameToRig(initial, 0);
  }

  private createMaterials(preset: HandMaterialPreset): void {
    this.primaryMat?.dispose();
    this.fingerMat?.dispose();
    this.jointMat?.dispose();
    this.s1JointCapsuleMat?.dispose();
    this.nailMat?.dispose();
    this.sleeveMat?.dispose();
    this.trimMat?.dispose();

    const s1Tex = getFingerS1TextureSet();
    const bronzePbr = this.textures.loadPBR('brushed_bronze', 2, 2);
    const steelPbr = this.textures.loadPBR('champagne_steel', 2, 2);
    const oakPbr = this.textures.loadPBR('oak_floor', 2, 2);
    const marblePbr = this.textures.loadPBR('grey_marble_slab', 2, 2);
    const slatePbr = this.textures.loadPBR('dark_slate_tile', 2, 2);
    const sakuraPbr = this.textures.loadPBR('sakura_cloth', 2, 2);
    const velvetPbr = this.textures.loadPBR('emerald_velvet_wall', 2, 2);
    const zabutonPbr = this.textures.loadPBR('zabuton_red', 1, 1);
    const vermilionPbr = this.textures.loadPBR('vermilion_wood', 2, 2);

    if (preset === 'living_skin') {
      // ★ FINGER S1.0 Flagship Living Human Skin — Rete Cutis pores, dermal SSS, fingerprints & lunula nails! ★
      this.primaryMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xffffff),
        map: s1Tex.palmAlbedoMap,
        normalMap: s1Tex.palmNormalMap,
        normalScale: new THREE.Vector2(0.92, 0.92),
        roughnessMap: s1Tex.palmRoughnessMap,
        roughness: 0.94,
        metalness: 0.0,
        clearcoat: 0.14,
        clearcoatRoughness: 0.36,
        sheen: 0.14,
        sheenRoughness: 0.72,
        sheenColor: new THREE.Color(0xdca888),
        envMapIntensity: 0.58,
      });
      this.fingerMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xffffff),
        map: s1Tex.fingerAlbedoMap,
        normalMap: s1Tex.fingerNormalMap,
        normalScale: new THREE.Vector2(1.16, 1.16),
        roughnessMap: s1Tex.fingerRoughnessMap,
        roughness: 0.92,
        metalness: 0.0,
        clearcoat: 0.16,
        clearcoatRoughness: 0.34,
        sheen: 0.15,
        sheenRoughness: 0.68,
        sheenColor: new THREE.Color(0xdeaa8a),
        envMapIntensity: 0.6,
      });
      // Seamless flesh-matched uniform Worley micro-skin (zero doll joint seam & zero stretched palm stripes!)
      this.s1JointCapsuleMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xffffff),
        map: s1Tex.microSkinAlbedoMap,
        normalMap: s1Tex.microSkinNormalMap,
        normalScale: new THREE.Vector2(1.12, 1.12),
        roughnessMap: s1Tex.microSkinRoughnessMap,
        roughness: 0.92,
        metalness: 0.0,
        clearcoat: 0.15,
        clearcoatRoughness: 0.35,
        sheen: 0.15,
        sheenRoughness: 0.68,
        sheenColor: new THREE.Color(0xdeaa8a),
        envMapIntensity: 0.6,
      });
      // Subtle warm rose-taupe joint tone if user toggles FINGER S1.0 OFF while on living_skin
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xb88164),
        normalMap: s1Tex.palmNormalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 0.58,
        metalness: 0.0,
        sheen: 0.16,
        sheenColor: new THREE.Color(0xe0b092),
        envMapIntensity: 0.75,
      });
      // Dual-curvature translucent keratin nail plate (lunula + rosy bed + ivory free edge + striations!)
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xffffff),
        map: s1Tex.nailAlbedoMap,
        normalMap: s1Tex.nailNormalMap,
        normalScale: new THREE.Vector2(0.48, 0.48),
        roughness: 0.17,
        metalness: 0.0,
        ior: 1.53,
        clearcoat: 0.92,
        clearcoatRoughness: 0.09,
        sheen: 0.08,
        sheenColor: new THREE.Color(0xf6dfd0),
        envMapIntensity: 1.15,
      });
      this.sleeveMat = new THREE.MeshPhysicalMaterial({
        map: sakuraPbr.map,
        normalMap: sakuraPbr.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: sakuraPbr.roughnessMap,
        roughness: 0.88,
        metalness: 0.0,
        sheen: 0.48,
        sheenColor: new THREE.Color(0xb8c5d9),
        envMapIntensity: 0.85,
      });
      this.trimMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xc8a364),
        roughness: 0.28,
        metalness: 0.86,
        envMapIntensity: 1.35,
      });
    } else if (preset === 'hinoki_ivory') {
      this.primaryMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xf2e4cf),
        map: oakPbr.map,
        normalMap: this.fingerS1Enabled ? s1Tex.craftMicroNormalMap : oakPbr.normalMap,
        normalScale: new THREE.Vector2(0.28, 0.28),
        roughnessMap: oakPbr.roughnessMap,
        roughness: 0.42,
        metalness: 0.02,
        clearcoat: 0.44,
        clearcoatRoughness: 0.22,
        sheen: 0.24,
        sheenColor: new THREE.Color(0xfff1dc),
        envMapIntensity: 1.15,
      });
      this.fingerMat = this.primaryMat.clone();
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xd5b178),
        map: bronzePbr.map,
        normalMap: bronzePbr.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.28,
        metalness: 0.86,
        envMapIntensity: 1.4,
      });
      this.s1JointCapsuleMat = this.jointMat.clone();
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xfbf2e6),
        normalMap: s1Tex.nailNormalMap,
        normalScale: new THREE.Vector2(0.28, 0.28),
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
        normalScale: new THREE.Vector2(0.58, 0.58),
        roughnessMap: bronzePbr.roughnessMap,
        roughness: 0.33,
        metalness: 0.88,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.55,
      });
      this.fingerMat = this.primaryMat.clone();
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xdad4c8),
        map: steelPbr.map,
        normalMap: steelPbr.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.22,
        metalness: 0.94,
        envMapIntensity: 1.65,
      });
      this.s1JointCapsuleMat = this.jointMat.clone();
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xebd49c),
        normalMap: s1Tex.nailNormalMap,
        normalScale: new THREE.Vector2(0.24, 0.24),
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
        normalScale: new THREE.Vector2(0.16, 0.16),
        roughness: 0.22,
        metalness: 0.02,
        clearcoat: 0.88,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.45,
      });
      this.fingerMat = this.primaryMat.clone();
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xdfb766),
        roughness: 0.18,
        metalness: 0.94,
        envMapIntensity: 1.6,
      });
      this.s1JointCapsuleMat = this.jointMat.clone();
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xfffaf4),
        normalMap: s1Tex.nailNormalMap,
        normalScale: new THREE.Vector2(0.2, 0.2),
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
      this.fingerMat = this.primaryMat.clone();
      this.jointMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xe0b968),
        roughness: 0.2,
        metalness: 0.95,
        envMapIntensity: 1.65,
      });
      this.s1JointCapsuleMat = this.jointMat.clone();
      this.nailMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xcda65c),
        normalMap: s1Tex.nailNormalMap,
        normalScale: new THREE.Vector2(0.22, 0.22),
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

    // Inject FINGER S1.0 + DERMA-TENSOR 1.0 + CHROMA-DERM 1.0 Optical Dermal & Keratin Shaders cleanly!
    enhanceMaterialWithFingerS1Shader(this.primaryMat, preset, this.s1Uniforms);
    enhanceMaterialWithFingerS1Shader(this.fingerMat, preset, this.s1Uniforms);
    enhanceMaterialWithFingerS1Shader(this.s1JointCapsuleMat, preset, this.s1Uniforms);
    enhanceNailWithKeratinOptics(this.nailMat, preset, this.nailUniforms);
  }

  private applyMaterialsToMeshes(): void {
    const useOrganicSkin = this.currentPreset === 'living_skin';
    this.primaryMeshes.forEach((m) => (m.material = this.primaryMat));
    this.seamlessSkinMeshes.forEach(
      (m) => (m.material = useOrganicSkin ? this.s1JointCapsuleMat : this.primaryMat)
    );
    this.fingerMeshes.forEach((m) => (m.material = this.fingerMat));
    this.jointMeshes.forEach((m) => (m.material = this.jointMat));
    this.s1JointMeshes.forEach((m) => (m.material = this.s1JointCapsuleMat));
    this.tendonMeshes.forEach((m) => (m.material = useOrganicSkin ? this.s1JointCapsuleMat : this.jointMat));
    this.nailMeshes.forEach((m) => (m.material = this.nailMat));
    this.sleeveMeshes.forEach((m) => (m.material = this.sleeveMat));
    this.trimMeshes.forEach((m) => (m.material = this.trimMat));
  }

  private syncVisibilityForMode(): void {
    const s1 = this.fingerS1Enabled;
    const isOrganicLiving = s1 && this.currentPreset === 'living_skin';
    const dermaActive = s1 && this.dermaTensorEnabled;
    const chromaActive = s1 && this.chromaDermEnabled;

    this.s1Uniforms.uS1Enabled.value = s1 ? 1.0 : 0.0;
    this.s1Uniforms.uS1DermaEnabled.value = dermaActive ? 1.0 : 0.0;
    this.s1Uniforms.uS1ChromaEnabled.value = chromaActive ? 1.0 : 0.0;
    this.nailUniforms.uKeratinEnabled.value = chromaActive ? 1.0 : 0.0;

    const showVellus = isOrganicLiving && chromaActive;
    for (const vm of this.vellusHairMeshes) {
      vm.visible = showVellus;
    }
    if (this.palmSubcutaneousField && this.lastDermaState) {
      this.palmSubcutaneousField.applyState(this.lastDermaState, dermaActive);
    }

    for (const obj of this.s1OnlyMeshes) obj.visible = s1;
    for (const obj of this.classicOnlyMeshes) obj.visible = !s1;
    // Hide mechanical horological medallions, metal pins & gimbal rings on living human skin!
    for (const obj of this.artisanDetailMeshes) obj.visible = !isOrganicLiving;
  }

  public setFingerS1Enabled(enabled: boolean): void {
    if (this.fingerS1Enabled === enabled) return;
    this.fingerS1Enabled = enabled;
    this.s1Uniforms.uS1Enabled.value = enabled ? 1.0 : 0.0;
    this.syncVisibilityForMode();
  }

  public isFingerS1Enabled(): boolean {
    return this.fingerS1Enabled;
  }

  public setDermaTensorEnabled(enabled: boolean): void {
    if (this.dermaTensorEnabled === enabled) return;
    this.dermaTensorEnabled = enabled;
    this.syncVisibilityForMode();
  }

  public setChromaDermEnabled(enabled: boolean): void {
    if (this.chromaDermEnabled === enabled) return;
    this.chromaDermEnabled = enabled;
    this.syncVisibilityForMode();
  }

  public setSunDirection(dir: THREE.Vector3): void {
    this.s1Uniforms.uS1SunDir.value.copy(dir).normalize();
    this.nailUniforms.uNailSunDir.value.copy(dir).normalize();
    if (this.vellusUniforms) {
      this.vellusUniforms.uSunDir.value.copy(dir).normalize();
    }
  }

  public getHandDetailTelemetry(): HandDetailTelemetry {
    const activeDerma = this.fingerS1Enabled && this.dermaTensorEnabled;
    const activeChroma = this.fingerS1Enabled && this.chromaDermEnabled;
    const d = this.lastDermaState;
    let totalHairs = 0;
    if (activeChroma && this.currentPreset === 'living_skin') {
      for (const vm of this.vellusHairMeshes) totalHairs += vm.count;
    }
    return {
      dermaTendonLiftMm: activeDerma && d ? d.peakTendonLiftMm : 0,
      dermaWrinklePct: activeDerma && d ? Math.round(d.dorsalWrinkleDepth * 100) : 0,
      dermaVolarCreasePct: activeDerma && d ? Math.round(d.volarCreaseDepth * 100) : 0,
      dermaStatusJp: activeDerma && d ? d.statusJp : '停止中',
      nailBlanchPct: activeChroma ? Math.round(this.nailRefillSolver.pressureBlanch * 100) : 0,
      vellusHairCount: totalHairs,
    };
  }

  public setMaterialPreset(preset: HandMaterialPreset): void {
    this.currentPreset = preset;
    this.createMaterials(preset);
    this.applyMaterialsToMeshes();
    this.syncVisibilityForMode();
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

  private regSeamlessSkin(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(
      geo,
      this.currentPreset === 'living_skin' ? this.s1JointCapsuleMat : this.primaryMat
    );
    this.seamlessSkinMeshes.push(m);
    return m;
  }

  private regFinger(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.fingerMat);
    this.fingerMeshes.push(m);
    return m;
  }

  private regJoint(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.jointMat);
    this.jointMeshes.push(m);
    return m;
  }

  private regS1Joint(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.s1JointCapsuleMat);
    this.s1JointMeshes.push(m);
    return m;
  }

  private regTendon(geo: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(
      geo,
      this.currentPreset === 'living_skin' ? this.s1JointCapsuleMat : this.jointMat
    );
    this.tendonMeshes.push(m);
    return m;
  }

  /**
   * Build Forearm DRUJ, Ulnar Styloid Head, Volar FCR/PL Flexor Tendons,
   * and Two-Row Carpal Wrist (Radiocarpal + Midcarpal)!
   */
  private buildForearmAndTwoRowWrist(): void {
    const s = this.mirrorSign;

    // FINGER S1.0 Seamless Organic Forearm & Wrist Sculpt (zero harsh cylinder caps!)
    const s1WristMesh = this.regSeamlessSkin(createFingerS1ForearmWristGeo());
    this.forearmPivot.add(s1WristMesh);
    this.s1OnlyMeshes.push(s1WristMesh);

    // Classic Cylindrical Wrist (toggled when FINGER S1.0 is OFF)
    const wristGeo = new THREE.CylinderGeometry(0.09, 0.105, 0.12, 28);
    wristGeo.rotateX(Math.PI / 2);
    wristGeo.scale(1.16, 0.76, 1.0);
    const wristMesh = this.regPrimary(wristGeo);
    wristMesh.position.set(0, -0.004, -0.044);
    this.forearmPivot.add(wristMesh);
    this.classicOnlyMeshes.push(wristMesh);

    // Visible Dorsal Ulnar Styloid Bone Prominence (anatomical wrist contour on pinky side!)
    this.ulnarStyloidMesh = this.regSeamlessSkin(new THREE.SphereGeometry(0.019, 18, 14));
    this.ulnarStyloidMesh.scale.set(0.88, 0.68, 1.35);
    this.ulnarStyloidMesh.position.set(-0.075 * s, 0.02, -0.016);
    this.forearmPivot.add(this.ulnarStyloidMesh);

    // Visible Volar Wrist Flexor Tendon Cords (Flexor Carpi Radialis & Palmaris Longus)
    this.volarFlexorTendons = [];
    for (const xOff of [0.018 * s, -0.014 * s]) {
      const fGeo = new THREE.CapsuleGeometry(0.0065, 0.072, 6, 10);
      fGeo.rotateX(Math.PI / 2);
      const fCord = this.regSeamlessSkin(fGeo);
      fCord.position.set(xOff, -0.068, -0.036);
      this.forearmPivot.add(fCord);
      this.volarFlexorTendons.push(fCord);
    }

    // Seamless FINGER S1.0 Organic Carpal Skin Bridge (replaces exposed ball/ring on living_skin!)
    const s1WristBridge = this.regS1Joint(new THREE.SphereGeometry(0.074, 24, 18));
    s1WristBridge.scale.set(1.24, 0.72, 0.78);
    s1WristBridge.position.set(0, -0.003, 0.012);
    this.radiocarpalPivot.add(s1WristBridge);
    this.s1OnlyMeshes.push(s1WristBridge);

    // Classic Proximal Carpal Row (Radiocarpal articular gimbal bridge)
    const rcCarpal = this.regJoint(new THREE.SphereGeometry(0.068, 22, 16));
    rcCarpal.scale.set(1.22, 0.74, 0.56);
    rcCarpal.position.set(0, -0.002, 0.004);
    this.radiocarpalPivot.add(rcCarpal);
    this.classicOnlyMeshes.push(rcCarpal);

    // Distal Carpal Row (Midcarpal horological ring bridge — artisan crafts only!)
    const mcRing = this.regJoint(new THREE.TorusGeometry(0.066, 0.0075, 10, 26));
    mcRing.scale.set(1.25, 0.76, 1.0);
    mcRing.position.set(0, -0.002, 0.004);
    this.midcarpalPivot.add(mcRing);
    this.artisanDetailMeshes.push(mcRing);

    const collarGeo = new THREE.TorusGeometry(0.096, 0.011, 14, 32);
    collarGeo.scale(1.18, 0.82, 1.0);
    const collar = this.regJoint(collarGeo);
    collar.position.set(0, -0.004, -0.088);
    this.forearmPivot.add(collar);
    this.artisanDetailMeshes.push(collar);

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
   * Sculpted 5-Metacarpal Anatomical Palm with FINGER S1.0 sculpted palm body,
   * dynamic Thenar/Hypothenar/FDI musculature, 3 Interdigital Webbing Folds,
   * and 4 EDC + 2 Juncturae + Thumb EPL Tendons!
   */
  private buildSculpted5MetacarpalPalm(): void {
    const s = this.mirrorSign;

    // 1A. FINGER S1.0 Continuous Sculpted Anatomical Palm Body (concave hollow + dorsal arch!)
    const s1PalmCore = this.regPrimary(createFingerS1SculptedPalmGeo(s));
    s1PalmCore.position.set(0.014 * s, 0.001, 0.108);
    this.midcarpalPivot.add(s1PalmCore);
    this.s1OnlyMeshes.push(s1PalmCore);

    // ★ DERMA-TENSOR 1.0: Real-Time Subcutaneous Dorsal Tendon & Venous-Arch 3D Vertex Field! ★
    this.palmSubcutaneousField = new SculptedPalmSubcutaneousField(s1PalmCore.geometry, s);

    // ★ CHROMA-DERM 1.0: 520-Fiber Curved 3D Backlit Dorsal Vellus Micro-Hair Instanced Field (1 draw call!) ★
    const vellus = createVellusHairInstancedField(
      s1PalmCore.geometry,
      s,
      this.s1Uniforms.uS1SunDir.value,
      520
    );
    this.vellusHairMeshes.push(vellus.mesh);
    this.vellusUniforms = vellus.uniforms;
    this.vellusMaterial = vellus.material;
    s1PalmCore.add(vellus.mesh);

    // 1B. Classic Palm Core (toggled when FINGER S1.0 is OFF)
    const palmCore = this.regPrimary(new THREE.SphereGeometry(0.124, 32, 24));
    palmCore.scale.set(0.84, 0.44, 1.1);
    palmCore.position.set(0.016 * s, 0.0, 0.106);
    this.midcarpalPivot.add(palmCore);
    this.classicOnlyMeshes.push(palmCore);

    // 2. Articulated CMC2 (2nd Metacarpal - Index ray)
    this.cmc2Pivot.position.set(0.064 * s, 0.002, 0.062);
    this.midcarpalPivot.add(this.cmc2Pivot);
    const meta2Geo = new THREE.CapsuleGeometry(0.029, 0.136, 10, 18);
    meta2Geo.rotateX(Math.PI / 2);
    meta2Geo.scale(1.14, 0.92, 1.0);
    const meta2 = this.regSeamlessSkin(meta2Geo);
    meta2.position.set(0.014 * s, 0.004, 0.088);
    meta2.rotation.y = 0.07 * s;
    this.cmc2Pivot.add(meta2);

    // 3. Articulated CMC3 (3rd Metacarpal - Middle keystone ray)
    this.cmc3Pivot.position.set(0.02 * s, 0.004, 0.062);
    this.midcarpalPivot.add(this.cmc3Pivot);
    const meta3Geo = new THREE.CapsuleGeometry(0.03, 0.144, 10, 18);
    meta3Geo.rotateX(Math.PI / 2);
    meta3Geo.scale(1.15, 0.92, 1.0);
    const meta3 = this.regSeamlessSkin(meta3Geo);
    meta3.position.set(0.004 * s, 0.006, 0.094);
    this.cmc3Pivot.add(meta3);

    // Radial knuckle saddle cushion bridging 2nd & 3rd metacarpal heads
    const radialPadGeo = new THREE.CapsuleGeometry(0.031, 0.066, 10, 18);
    radialPadGeo.rotateZ(Math.PI / 2);
    radialPadGeo.scale(1.0, 0.88, 1.0);
    const radialPad = this.regSeamlessSkin(radialPadGeo);
    radialPad.position.set(0.056 * s, 0.004, 0.214);
    this.midcarpalPivot.add(radialPad);

    // 4. Articulated CMC4 (4th Metacarpal - Ring ray)
    this.cmc4Pivot.position.set(-0.024 * s, 0.002, 0.056);
    this.midcarpalPivot.add(this.cmc4Pivot);
    const meta4Geo = new THREE.CapsuleGeometry(0.028, 0.138, 10, 18);
    meta4Geo.rotateX(Math.PI / 2);
    meta4Geo.scale(1.15, 0.92, 1.0);
    const meta4 = this.regSeamlessSkin(meta4Geo);
    meta4.position.set(-0.008 * s, 0.004, 0.094);
    this.cmc4Pivot.add(meta4);

    // 5. Articulated CMC5 (5th Metacarpal + Dynamic Hypothenar Eminence - Pinky ray)
    this.cmc5Pivot.position.set(-0.062 * s, -0.006, 0.056);
    this.midcarpalPivot.add(this.cmc5Pivot);
    const meta5Geo = new THREE.CapsuleGeometry(0.026, 0.122, 10, 18);
    meta5Geo.rotateX(Math.PI / 2);
    meta5Geo.scale(1.12, 0.95, 1.0);
    const meta5 = this.regSeamlessSkin(meta5Geo);
    meta5.position.set(-0.018 * s, 0.0, 0.082);
    this.cmc5Pivot.add(meta5);

    this.hypothenarMesh = this.regSeamlessSkin(new THREE.SphereGeometry(0.052, 24, 18));
    this.hypothenarMesh.scale.set(0.6, 0.64, 1.3);
    this.hypothenarMesh.position.set(-0.006 * s, -0.015, 0.048);
    this.cmc5Pivot.add(this.hypothenarMesh);

    // 6. Dynamic Thenar Eminence (Thumb-base palm musculature)
    this.thenarMesh = this.regSeamlessSkin(new THREE.SphereGeometry(0.068, 26, 20));
    this.thenarMesh.scale.set(0.84, 0.68, 1.2);
    this.thenarMesh.position.set(0.068 * s, -0.022, 0.074);
    this.thenarMesh.rotation.y = 0.24 * s;
    this.midcarpalPivot.add(this.thenarMesh);

    // 7. Dynamic First Dorsal Interosseous (FDI — thumb-index dorsal web muscle!)
    this.fdiMesh = this.regSeamlessSkin(new THREE.SphereGeometry(0.035, 22, 16));
    this.fdiMesh.scale.set(0.82, 0.44, 1.22);
    this.fdiMesh.position.set(0.078 * s, -0.001, 0.126);
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
      const wGeo = new THREE.SphereGeometry(wd.w, 18, 14);
      wGeo.scale(0.88, 0.36, 0.72);
      const web = this.regSeamlessSkin(wGeo);
      web.position.set(wd.x, wd.y, wd.z);
      wd.parent.add(web);
      this.webbingMeshes.push(web);
    }

    // 9. Four Dynamic Dorsal Extensor Tendon Cords (EDC) — sculpted subcutaneously in FINGER S1.0 palm on living_skin,
    //    and rendered as proud articulated mechanical rods on craft/classic hands!
    const tendonDefs: Array<{ parent: THREE.Group; x: number; y: number; z: number; len: number; yaw: number }> = [
      { parent: this.cmc2Pivot, x: 0.012 * s, y: 0.036, z: 0.08, len: 0.138, yaw: 0.09 * s },
      { parent: this.cmc3Pivot, x: 0.004 * s, y: 0.04, z: 0.084, len: 0.144, yaw: 0.02 * s },
      { parent: this.cmc4Pivot, x: -0.008 * s, y: 0.036, z: 0.08, len: 0.132, yaw: -0.04 * s },
      { parent: this.cmc5Pivot, x: -0.016 * s, y: 0.031, z: 0.072, len: 0.118, yaw: -0.1 * s },
    ];
    this.dorsalTendonMeshes = [];
    this.dorsalTendonBaseY = [];

    for (const td of tendonDefs) {
      const ridgeGeo = new THREE.CapsuleGeometry(0.012, td.len, 8, 14);
      ridgeGeo.rotateX(Math.PI / 2);
      const ridge = this.regPrimary(ridgeGeo);
      ridge.position.set(td.x, td.y - 0.005, td.z);
      ridge.rotation.y = td.yaw;
      td.parent.add(ridge);
      this.artisanDetailMeshes.push(ridge);

      const cordGeo = new THREE.CapsuleGeometry(0.0046, td.len * 0.92, 6, 12);
      cordGeo.rotateX(Math.PI / 2);
      const cord = this.regTendon(cordGeo);
      cord.position.set(td.x, td.y + 0.004, td.z);
      cord.rotation.y = td.yaw;
      td.parent.add(cord);
      this.artisanDetailMeshes.push(cord);

      this.dorsalTendonMeshes.push(cord);
      this.dorsalTendonBaseY.push(td.y + 0.004);
    }

    // 10. Two Visible Diagonal Juncturae Tendinum Collagen Bridge Bands (artisan/classic external detail!)
    const juncDefs = [
      { x: -0.004 * s, y: 0.039, z: 0.17, len: 0.044, yaw: -0.76 * s },
      { x: -0.048 * s, y: 0.034, z: 0.16, len: 0.04, yaw: -0.82 * s },
    ];
    this.juncturaeMeshes = [];
    this.juncturaeBaseY = [];
    for (const jd of juncDefs) {
      const jGeo = new THREE.CapsuleGeometry(0.0024, jd.len, 6, 10);
      jGeo.rotateX(Math.PI / 2);
      const jMesh = this.regTendon(jGeo);
      jMesh.position.set(jd.x, jd.y, jd.z);
      jMesh.rotation.y = jd.yaw;
      this.midcarpalPivot.add(jMesh);
      this.artisanDetailMeshes.push(jMesh);
      this.juncturaeMeshes.push(jMesh);
      this.juncturaeBaseY.push(jd.y);
    }

    // 11. Visible Radial Thumb EPL ("Anatomical Snuffbox") Dorsal Tendon Cord!
    const eplGeo = new THREE.CapsuleGeometry(0.0042, 0.095, 6, 10);
    eplGeo.rotateX(Math.PI / 2);
    this.eplTendonMesh = this.regTendon(eplGeo);
    this.eplTendonMesh.position.set(0.072 * s, 0.024, 0.048);
    this.eplTendonMesh.rotation.set(0.18, 0.56 * s, 0);
    this.midcarpalPivot.add(this.eplTendonMesh);
    this.artisanDetailMeshes.push(this.eplTendonMesh);

    // 12. Precision Horological Dorsal Medallion Crest (artisan materials only; hidden on living_skin!)
    const crest = this.regJoint(new THREE.CylinderGeometry(0.03, 0.034, 0.011, 24));
    crest.position.set(0.008 * s, 0.05, 0.096);
    this.midcarpalPivot.add(crest);
    const crestRing = this.regJoint(new THREE.TorusGeometry(0.04, 0.0042, 10, 28));
    crestRing.rotateX(Math.PI / 2);
    crestRing.position.set(0.008 * s, 0.052, 0.096);
    this.midcarpalPivot.add(crestRing);
    this.artisanDetailMeshes.push(crest, crestRing);
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

    // ---- MCP JOINT: FINGER S1.0 Seamless Capsule + 3-Layer Dynamic Wrinkle Stack vs Classic Ball ----
    const s1McpCap = this.regS1Joint(createFingerS1JointCapsuleGeo(baseRadius * 1.04));
    mcp.add(s1McpCap);
    const mcpWrinkleStack = this.regS1Joint(createFingerS1KnuckleWrinkleStackGeo(baseRadius * 1.03));
    mcpWrinkleStack.position.set(0, 0.0008, 0.0015);
    mcp.add(mcpWrinkleStack);
    const s1Phal1 = this.regFinger(createFingerS1PhalanxGeo(l1, baseRadius * 1.03, baseRadius * 0.9, false));
    mcp.add(s1Phal1);
    if (this.vellusMaterial) {
      const fVellus = createFingerDorsalVellusField(s1Phal1.geometry, this.vellusMaterial, 34);
      s1Phal1.add(fVellus);
      this.vellusHairMeshes.push(fVellus);
    }
    this.s1OnlyMeshes.push(s1McpCap, mcpWrinkleStack, s1Phal1);

    // Classic MCP pieces
    const mcpKnuckle = this.regJoint(new THREE.SphereGeometry(baseRadius * 1.12, 22, 16));
    mcpKnuckle.scale.set(1.08, 0.96, 1.0);
    mcp.add(mcpKnuckle);
    for (const side of [-1, 1]) {
      const condyle = this.regJoint(new THREE.SphereGeometry(baseRadius * 0.52, 12, 10));
      condyle.position.set(side * baseRadius * 0.68, 0.001, 0.002);
      mcp.add(condyle);
      this.classicOnlyMeshes.push(condyle);
    }
    const mcpPin = this.regJoint(
      new THREE.CylinderGeometry(baseRadius * 0.34, baseRadius * 0.34, baseRadius * 2.38, 14)
    );
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);
    const mcpHoodCollar = this.regJoint(new THREE.TorusGeometry(baseRadius * 0.98, baseRadius * 0.11, 8, 22));
    mcpHoodCollar.position.set(0, 0.001, baseRadius * 0.58);
    mcp.add(mcpHoodCollar);
    const classicPhal1 = this.regPrimary(createOrganicPhalanxGeo(l1, baseRadius, baseRadius * 0.87, false));
    mcp.add(classicPhal1);
    this.classicOnlyMeshes.push(mcpKnuckle, mcpPin, mcpHoodCollar, classicPhal1);

    // ---- PIP JOINT ----
    const pip = new THREE.Group();
    pip.position.set(0, 0, l1);
    mcp.add(pip);

    const s1PipCap = this.regS1Joint(createFingerS1JointCapsuleGeo(baseRadius * 0.9));
    pip.add(s1PipCap);
    const pipWrinkleStack = this.regS1Joint(createFingerS1KnuckleWrinkleStackGeo(baseRadius * 0.89));
    pipWrinkleStack.position.set(0, 0.0008, 0.001);
    pip.add(pipWrinkleStack);
    const s1Phal2 = this.regFinger(createFingerS1PhalanxGeo(l2, baseRadius * 0.88, baseRadius * 0.79, false));
    pip.add(s1Phal2);
    this.s1OnlyMeshes.push(s1PipCap, pipWrinkleStack, s1Phal2);

    // Classic PIP pieces
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
    const classicPhal2 = this.regPrimary(createOrganicPhalanxGeo(l2, baseRadius * 0.86, baseRadius * 0.77, false));
    pip.add(classicPhal2);
    this.classicOnlyMeshes.push(pipBall, pipPin, pipHoodCollar, classicPhal2);

    // ---- DIP JOINT & DISTAL PHALANX ----
    const dip = new THREE.Group();
    dip.position.set(0, 0, l2);
    pip.add(dip);

    const s1DipCap = this.regS1Joint(createFingerS1JointCapsuleGeo(baseRadius * 0.78));
    dip.add(s1DipCap);
    const s1Phal3 = this.regFinger(createFingerS1PhalanxGeo(l3, baseRadius * 0.78, baseRadius * 0.68, true));
    dip.add(s1Phal3);
    // Solid 3D dual-curvature anatomical lunula nail slab + raised 3D eponychium cuticle arch!
    const s1Nail = new THREE.Mesh(
      createFingerS1NailPlateGeo(baseRadius * 1.18, l3 * 0.64),
      this.nailMat
    );
    s1Nail.position.set(0, baseRadius * 0.46, l3 * 0.56);
    s1Nail.rotation.x = 0.09;
    this.nailMeshes.push(s1Nail);
    dip.add(s1Nail);

    const s1Cuticle = this.regSeamlessSkin(createFingerS1CuticleArchGeo(baseRadius * 1.18, l3 * 0.64));
    s1Cuticle.position.copy(s1Nail.position);
    s1Cuticle.rotation.copy(s1Nail.rotation);
    dip.add(s1Cuticle);
    this.s1OnlyMeshes.push(s1DipCap, s1Phal3, s1Nail, s1Cuticle);

    // Classic DIP pieces
    const classicDipBall = this.regJoint(new THREE.SphereGeometry(baseRadius * 0.82, 18, 12));
    dip.add(classicDipBall);
    const classicPhal3 = this.regPrimary(createOrganicPhalanxGeo(l3, baseRadius * 0.76, baseRadius * 0.66, true));
    dip.add(classicPhal3);
    const nailGeo = new THREE.SphereGeometry(baseRadius * 0.62, 14, 10);
    nailGeo.scale(0.95, 0.26, 1.35);
    const classicNail = new THREE.Mesh(nailGeo, this.nailMat);
    classicNail.position.set(0, baseRadius * 0.53, l3 * 0.58);
    classicNail.rotation.x = 0.08;
    this.nailMeshes.push(classicNail);
    dip.add(classicNail);
    this.classicOnlyMeshes.push(classicDipBall, classicPhal3, classicNail);

    // Soft Elastic Volar Distal Pulp Cushion (squashes subtly upon palm/object contact!)
    const pulpGeo = new THREE.SphereGeometry(baseRadius * 0.67, 16, 12);
    pulpGeo.scale(0.96, 0.62, 1.38);
    const distalPulp = this.regFinger(pulpGeo);
    distalPulp.position.set(0, -baseRadius * 0.28, l3 * 0.56);
    dip.add(distalPulp);

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
      mcpWrinkleStack,
      pipWrinkleStack,
      distalPulp,
      s1Nail,
    };
  }

  private buildThumb(): ThumbJoints {
    const baseR = 0.0285;
    const cmc = new THREE.Group();
    cmc.position.set(0.102 * this.mirrorSign, -0.016, 0.068);
    this.midcarpalPivot.add(cmc);

    const lMeta = 0.095;
    // FINGER S1.0 Thumb CMC + Metacarpal
    const s1CmcCap = this.regS1Joint(createFingerS1JointCapsuleGeo(baseR * 1.1));
    cmc.add(s1CmcCap);
    const s1ThumbMeta = this.regFinger(createFingerS1PhalanxGeo(lMeta, baseR * 1.12, baseR * 0.96, false, true));
    cmc.add(s1ThumbMeta);
    this.s1OnlyMeshes.push(s1CmcCap, s1ThumbMeta);

    // Classic Thumb CMC
    const classicCmcBall = this.regJoint(new THREE.SphereGeometry(baseR * 1.16, 18, 14));
    cmc.add(classicCmcBall);
    const classicThumbMeta = this.regPrimary(createOrganicPhalanxGeo(lMeta, baseR * 1.08, baseR * 0.94, false));
    cmc.add(classicThumbMeta);
    this.classicOnlyMeshes.push(classicCmcBall, classicThumbMeta);

    // ---- THUMB MCP ----
    const mcp = new THREE.Group();
    mcp.position.set(0, 0, lMeta);
    cmc.add(mcp);
    const lProx = 0.074;

    const s1TMcpCap = this.regS1Joint(createFingerS1JointCapsuleGeo(baseR * 0.94));
    mcp.add(s1TMcpCap);
    const mcpWrinkleStack = this.regS1Joint(createFingerS1KnuckleWrinkleStackGeo(baseR * 0.93));
    mcpWrinkleStack.position.set(0, 0.0008, 0.001);
    mcp.add(mcpWrinkleStack);
    const s1ThumbProx = this.regFinger(createFingerS1PhalanxGeo(lProx, baseR * 0.96, baseR * 0.86, false, true));
    mcp.add(s1ThumbProx);
    if (this.vellusMaterial) {
      const tVellus = createFingerDorsalVellusField(s1ThumbProx.geometry, this.vellusMaterial, 24);
      s1ThumbProx.add(tVellus);
      this.vellusHairMeshes.push(tVellus);
    }
    this.s1OnlyMeshes.push(s1TMcpCap, mcpWrinkleStack, s1ThumbProx);

    const classicTMcpBall = this.regJoint(new THREE.SphereGeometry(baseR * 0.99, 18, 12));
    mcp.add(classicTMcpBall);
    const mcpPin = this.regJoint(
      new THREE.CylinderGeometry(baseR * 0.3, baseR * 0.3, baseR * 2.12, 12)
    );
    mcpPin.rotateZ(Math.PI / 2);
    mcp.add(mcpPin);
    const classicThumbProx = this.regPrimary(createOrganicPhalanxGeo(lProx, baseR * 0.94, baseR * 0.84, false));
    mcp.add(classicThumbProx);
    this.classicOnlyMeshes.push(classicTMcpBall, mcpPin, classicThumbProx);

    // ---- THUMB IP & DISTAL ----
    const ip = new THREE.Group();
    ip.position.set(0, 0, lProx);
    mcp.add(ip);
    const lDist = 0.064;

    const s1TIpCap = this.regS1Joint(createFingerS1JointCapsuleGeo(baseR * 0.83));
    ip.add(s1TIpCap);
    const ipWrinkleStack = this.regS1Joint(createFingerS1KnuckleWrinkleStackGeo(baseR * 0.82));
    ipWrinkleStack.position.set(0, 0.0008, 0.001);
    ip.add(ipWrinkleStack);
    const s1ThumbDist = this.regFinger(createFingerS1PhalanxGeo(lDist, baseR * 0.86, baseR * 0.74, true, true));
    ip.add(s1ThumbDist);
    const s1ThumbNail = new THREE.Mesh(
      createFingerS1NailPlateGeo(baseR * 1.32, lDist * 0.64),
      this.nailMat
    );
    s1ThumbNail.position.set(0, baseR * 0.49, lDist * 0.54);
    s1ThumbNail.rotation.x = 0.08;
    this.nailMeshes.push(s1ThumbNail);
    ip.add(s1ThumbNail);
    const s1ThumbCuticle = this.regSeamlessSkin(createFingerS1CuticleArchGeo(baseR * 1.32, lDist * 0.64));
    s1ThumbCuticle.position.copy(s1ThumbNail.position);
    s1ThumbCuticle.rotation.copy(s1ThumbNail.rotation);
    ip.add(s1ThumbCuticle);
    this.s1OnlyMeshes.push(s1TIpCap, ipWrinkleStack, s1ThumbDist, s1ThumbNail, s1ThumbCuticle);

    const classicTIpBall = this.regJoint(new THREE.SphereGeometry(baseR * 0.87, 16, 12));
    ip.add(classicTIpBall);
    const classicThumbDist = this.regPrimary(createOrganicPhalanxGeo(lDist, baseR * 0.84, baseR * 0.72, true));
    ip.add(classicThumbDist);
    const nailGeo = new THREE.SphereGeometry(baseR * 0.68, 14, 10);
    nailGeo.scale(1.0, 0.25, 1.32);
    const classicThumbNail = new THREE.Mesh(nailGeo, this.nailMat);
    classicThumbNail.position.set(0, baseR * 0.56, lDist * 0.56);
    this.nailMeshes.push(classicThumbNail);
    ip.add(classicThumbNail);
    this.classicOnlyMeshes.push(classicTIpBall, classicThumbDist, classicThumbNail);

    // Elastic Volar Thumb Pulp Cushion
    const tPulpGeo = new THREE.SphereGeometry(baseR * 0.74, 16, 12);
    tPulpGeo.scale(1.0, 0.65, 1.32);
    const distalPulp = this.regFinger(tPulpGeo);
    distalPulp.position.set(0, -baseR * 0.3, lDist * 0.54);
    ip.add(distalPulp);

    const tipAnchor = new THREE.Object3D();
    tipAnchor.position.set(0, 0, lDist);
    ip.add(tipAnchor);

    return { cmc, mcp, ip, tipAnchor, mcpWrinkleStack, ipWrinkleStack, distalPulp };
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
    this.setMotionDynamics(112, 18.2);
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

  public triggerFeintFlick(): void {
    this.kinesis.triggerFeintFlick();
    this.offX.impulse(0.45 * this.mirrorSign);
    this.extraYawS.impulse(1.35 * this.mirrorSign);
    this.extraRollS.impulse(-1.45 * this.mirrorSign);
  }

  public triggerKnuckleFlex(): void {
    this.kinesis.triggerKnuckleFlex();
    this.extraPitchS.impulse(0.95);
    this.extraRollS.impulse(0.55 * this.mirrorSign);
  }

  public triggerVictoryRoll(): void {
    this.kinesis.triggerVictoryRoll();
    this.offY.impulse(0.55);
    this.extraPitchS.impulse(-1.1);
    this.extraRollS.impulse(-0.85 * this.mirrorSign);
  }

  public triggerFingerSnap(): void {
    this.kinesis.triggerFingerSnap();
    this.offY.impulse(0.32);
    this.extraRollS.impulse(-1.35 * this.mirrorSign);
    this.extraYawS.impulse(0.75 * this.mirrorSign);
  }

  public triggerWaveFlourish(): void {
    this.kinesis.triggerWaveFlourish();
    this.offY.impulse(0.42);
    this.extraPitchS.impulse(-0.95);
    this.extraRollS.impulse(-0.9 * this.mirrorSign);
  }

  public triggerSwordSealPulse(): void {
    this.kinesis.triggerSwordSealPulse();
    this.offX.impulse(0.55 * this.mirrorSign);
    this.extraRollS.impulse(0.85 * this.mirrorSign);
  }

  public triggerZenBreath(): void {
    this.kinesis.triggerZenBreath();
    this.offY.impulse(0.24);
    this.extraPitchS.impulse(-0.45);
  }

  public triggerNpcTell(stanceCue: 'tight' | 'poised' | 'open'): void {
    this.kinesis.triggerNpcTell(stanceCue);
    const dir = stanceCue === 'tight' ? 0.55 : stanceCue === 'poised' ? -0.45 : 0.25;
    this.extraRollS.impulse(dir * this.mirrorSign);
    this.extraPitchS.impulse(stanceCue === 'open' ? -0.5 : 0.4);
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

    // Feed live neuromuscular effort into FINGER S1.0 GLSL shader for real-time knuckle tension blanching!
    this.s1Uniforms.uS1Effort.value = solved.muscleEffort;

    // ★ DERMA-TENSOR 1.0: Real-Time Subcutaneous Dorsal Tendon & Venous-Arch 3D Vertex Deformation
    //   + Langer-Line Counter-Phase Dorsal/Volar Epidermal Strain Tensor! ★
    const fKeys: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
    let clenchSum = 0;
    let pulpSum = solved.thumb.pulpCompression;
    for (let i = 0; i < fKeys.length; i++) {
      const f = solved.fingers[fKeys[i]];
      clenchSum += Math.max(0, f.mcpFlex) / 1.55 + Math.max(0, f.pipFlex) / 1.65;
      pulpSum += f.pulpCompression;
    }
    const rawClench = Math.max(0, Math.min(1, clenchSum / 7.2));
    const meanPulp = Math.max(0, Math.min(1, pulpSum / 5));

    const derma = evaluateDermaTensorState(solved, this.lastPulseWave, rawClench);
    this.lastDermaState = derma;
    this.palmSubcutaneousField?.applyState(derma, this.fingerS1Enabled && this.dermaTensorEnabled);

    this.s1Uniforms.uS1DorsalStrain.value = derma.dorsalFlexStrain;
    this.s1Uniforms.uS1VolarCompress.value = derma.volarCreaseDepth;
    this.s1Uniforms.uS1Sweat.value = this.lastSweatSheen;
    this.s1Uniforms.uS1VascularPulse.value = this.lastPulseWave;

    if (this.currentPreset === 'living_skin') {
      const rShift = this.fingerS1Enabled && this.dermaTensorEnabled ? derma.skinRoughnessShift * 0.45 : 0;
      this.primaryMat.roughness = 0.94 + rShift;
      this.fingerMat.roughness = 0.92 + rShift;
    }

    // ★ CHROMA-DERM & KERATIN OPTICS 1.0: Asymmetric Hydraulic Nail-Bed Capillary Refill (τ=0.08s/0.38s)! ★
    const nailPressure = this.nailRefillSolver.step(
      Math.max(meanPulp, rawClench * 0.72),
      this.lastFrameDt
    );
    this.nailUniforms.uNailPressure.value = nailPressure;
    this.nailUniforms.uNailPulse.value = this.lastPulseWave;

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

    // 3. 5-Metacarpal 3-Arch Palmar Skeleton
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

    // 5. Three Interdigital Commissural Webbing Folds
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
    this.eplTendonMesh.position.y = 0.023 + epl * 0.0055;
    this.eplTendonMesh.scale.set(0.85 + epl * 0.42, 0.85 + epl * 0.48, 1.0);

    // 7. 6-DOF Saddle-Joint Thumb + Dynamic FINGER S1.0 Dorsal Skin Wrinkles
    this.thumb.cmc.rotation.set(
      solved.thumb.cmcFlex,
      (0.68 + solved.thumb.cmcAbd) * s,
      (-0.62 - solved.thumb.cmcPronation) * s
    );
    this.thumb.mcp.rotation.set(solved.thumb.mcpFlex, solved.thumb.mcpAbd * s, 0);
    this.thumb.ip.rotation.set(solved.thumb.ipFlex, 0, 0);

    const tMcpStretch = Math.max(0, Math.min(1, solved.thumb.mcpFlex / 0.95));
    const tIpStretch = Math.max(0, Math.min(1, solved.thumb.ipFlex / 1.1));
    this.thumb.mcpWrinkleStack.scale.set(1.0 + tMcpStretch * 0.04, 1.04 - tMcpStretch * 0.09, 0.88 + tMcpStretch * 0.24);
    this.thumb.ipWrinkleStack.scale.set(1.0 + tIpStretch * 0.04, 1.04 - tIpStretch * 0.09, 0.88 + tIpStretch * 0.24);

    const tp = solved.thumb.pulpCompression;
    this.thumb.distalPulp.scale.set(1.0 + tp * 0.16, 0.65 - tp * 0.16, 1.32 + tp * 0.06);

    // 8. All 4 Fingers + FINGER S1.0 Dynamic Dorsal Knuckle Wrinkle Stacks!
    const fNames: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
    for (const fn of fNames) {
      const j = this.fingers[fn];
      const st = solved.fingers[fn];

      // Eccentric Cam-Axis Volar ICR Glide
      j.mcp.position.set(j.mcpBasePos.x, j.mcpBasePos.y - st.mcpVolarGlide, j.mcpBasePos.z);
      j.pip.position.set(0, -st.pipVolarGlide, j.pipBaseZ);
      j.dip.position.set(0, -st.dipVolarGlide, j.dipBaseZ);

      j.mcp.rotation.set(st.mcpFlex, st.mcpAbd * s, st.mcpAxialTwist * s);
      j.pip.rotation.set(st.pipFlex, 0, 0);
      j.dip.rotation.set(st.dipFlex, st.dipCant * s, 0);

      // Classic knuckle collars
      const ks = st.knuckleCreaseStretch;
      j.mcpHoodCollar.scale.set(1.0 + ks * 0.09, 1.0 - ks * 0.14, 1.0 + ks * 0.18);
      j.pipHoodCollar.scale.set(1.0 + ks * 0.07, 1.0 - ks * 0.12, 1.0 + ks * 0.14);

      // ★ FINGER S1.0 Dynamic Dorsal Knuckle Wrinkle Stacks: bunch in extension, pull sleek & taut in flexion! ★
      const mcpStretch = Math.max(0, Math.min(1, st.mcpFlex / 1.55));
      const pipStretch = Math.max(0, Math.min(1, st.pipFlex / 1.68));
      j.mcpWrinkleStack.scale.set(1.0 + mcpStretch * 0.04, 1.05 - mcpStretch * 0.1, 0.86 + mcpStretch * 0.28);
      j.pipWrinkleStack.scale.set(1.0 + pipStretch * 0.04, 1.05 - pipStretch * 0.1, 0.86 + pipStretch * 0.28);

      // Soft fingertip volar pulp pad compresses realistically against palm bed
      const pc = st.pulpCompression;
      j.distalPulp.scale.set(0.96 + pc * 0.18, 0.62 - pc * 0.18, 1.38 + pc * 0.06);
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
    this.lastFrameDt = safeDt;
    this.idlePhase += safeDt * 1.85;
    this.recoilPulse = Math.max(0, this.recoilPulse - safeDt * 4.4);

    // Step Exact Closed-Form AnalyticSprings (framerate-invariant C² butter-smooth motion!)
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

    // Step 38-DOF JHand Kinesis 1.1 (6× sub-stepped + C² Quintic target blending!)
    const solved = this.kinesis.step(
      safeDt,
      { x: this.offX.velocity, y: this.offY.velocity, z: this.offZ.velocity },
      this.extraPitchS.value,
      this.extraRollS.value * this.mirrorSign
    );

    this.applySolvedFrameToRig(solved, breath);

    // Stream landmark-accurate 3D micro-Foley articulation events directly to JSound Engin 1.3!
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

  /** World-space center of Index fingernail & cuticle arch for Infinite-Zoom Microscope Focus! */
  public getIndexNailWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.fingers.index.s1Nail.updateWorldMatrix(true, false);
    out.set(0, 0.0025, 0.001).applyMatrix4(this.fingers.index.s1Nail.matrixWorld);
    return out;
  }

  /** World-space center of dorsal hand tendons & 520-fiber backlit vellus hair field! */
  public getDorsalTendonWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.midcarpalPivot.updateWorldMatrix(true, false);
    out.set(0.015 * this.mirrorSign, 0.047, 0.125).applyMatrix4(this.midcarpalPivot.matrixWorld);
    return out;
  }

  /** World-space center of Index volar fingertip fingerprint & eccrine sweat-pore pad! */
  public getIndexPulpWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.fingers.index.distalPulp.updateWorldMatrix(true, false);
    out.set(0, -0.004, 0.002).applyMatrix4(this.fingers.index.distalPulp.matrixWorld);
    return out;
  }

  /** Instantaneous linear velocity vector of palm motion spring (m/s) for AERO-KINETIC VORTEX 1.0 */
  public getPalmVelocity(out: THREE.Vector3): THREE.Vector3 {
    out.set(this.offX.velocity, this.offY.velocity, this.offZ.velocity);
    return out;
  }

  /** Normalized mechanical grip clench load [0..1] driving J-BIOPULSE 1.0 capillary blanching */
  public getClenchLoad(): number {
    const fNames: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
    let sum = 0;
    for (let i = 0; i < fNames.length; i++) {
      const f = this.fingers[fNames[i]];
      sum += Math.max(0, f.mcp.rotation.x) / 1.55 + Math.max(0, f.pip.rotation.x) / 1.65;
    }
    return Math.max(0, Math.min(1, sum / 7.2));
  }

  /**
   * ★ J-BIOPULSE 1.0 Real-Time Living Physiology Optical & Neuromuscular Micro-Tremor Coupling ★
   * Modulates arterial hemoglobin perfusion warmth, knuckle capillary blanching under Rock clench,
   * subtle dermal micro-perspiration sheen, and authentic 8–12 Hz physiological tremor!
   */
  public applyBioPulse(
    sample: {
      pulseWave: number;
      hemoglobinPerfusion: number;
      capillaryBlanching: number;
      sweatSheen: number;
      tremorPitchRad: number;
      tremorYawRad: number;
      tremorFingerRad: number;
    },
    enabled: boolean
  ): void {
    this.lastPulseWave = enabled ? sample.pulseWave : 0.35;
    this.lastSweatSheen = enabled ? sample.sweatSheen : 0.14;

    // 1. Subtle 8–12 Hz physiological neuromuscular micro-tremor on fingertips & radiocarpal wrist
    if (enabled && this.currentPreset === 'living_skin') {
      this.radiocarpalPivot.rotation.x += sample.tremorPitchRad;
      this.radiocarpalPivot.rotation.y += sample.tremorYawRad;
      this.fingers.index.dip.rotation.x += sample.tremorFingerRad;
      this.fingers.middle.dip.rotation.x += sample.tremorFingerRad * 0.9;
    }

    // 2. Real-time optical PPG hemoglobin perfusion & mechanical capillary blanching (living_skin only; zero neon!)
    if (this.currentPreset === 'living_skin') {
      if (enabled) {
        // Arterial hemoglobin subsurface warmth breathes subtly with systolic + dicrotic wave
        const flush = (sample.hemoglobinPerfusion - 0.65) * 0.048;
        const rFlush = Math.max(0.012, 0.042 + flush);
        const gFlush = Math.max(0.004, 0.011 + flush * 0.25);
        const bFlush = Math.max(0.003, 0.008 + flush * 0.16);
        this.fingerMat.emissive.setRGB(rFlush, gFlush, bFlush);
        this.primaryMat.emissive.setRGB(rFlush * 0.72, gFlush * 0.72, bFlush * 0.72);

        // Knuckle capillary blanching: taut clenched knuckles pale subtly toward warm ivory, refill rosy on open!
        const bl = sample.capillaryBlanching;
        this.s1JointCapsuleMat.color.setRGB(
          0.955 + bl * 0.04,
          0.92 + bl * 0.055,
          0.90 + bl * 0.062
        );
        // Subtle sympathetic micro-perspiration specular sheen
        this.primaryMat.clearcoat = 0.055 + sample.sweatSheen * 0.085;
        this.fingerMat.clearcoat = 0.065 + sample.sweatSheen * 0.095;
      } else {
        this.fingerMat.emissive.setRGB(0.036, 0.01, 0.007);
        this.primaryMat.emissive.setRGB(0.028, 0.008, 0.006);
        this.s1JointCapsuleMat.color.setRGB(0.96, 0.925, 0.905);
        this.primaryMat.clearcoat = 0.06;
        this.fingerMat.clearcoat = 0.07;
      }
    }
  }

  public dispose(): void {
    this.primaryMat?.dispose();
    this.fingerMat?.dispose();
    this.jointMat?.dispose();
    this.s1JointCapsuleMat?.dispose();
    this.nailMat?.dispose();
    this.sleeveMat?.dispose();
    this.trimMat?.dispose();
    for (const vm of this.vellusHairMeshes) {
      vm.geometry.dispose();
    }
    this.vellusMaterial?.dispose();
  }
}
