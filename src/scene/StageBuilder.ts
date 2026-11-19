/**
 * ★ 5 Photorealistic 3D Architectural Stages + Diegetic Tabletop Props ★
 *
 * Built exclusively from cleanly cropped PBR textures (albedo + tangent normal +
 * calibrated roughness) extracted from the user's 22 provided material atlases.
 * STRICTLY ZERO NEON — pure physical sunlight, warm architectural bounce, wood,
 * stone, tatami, marble, lacquer, moss, water, and forged bronze!
 *
 * Stages:
 *  1. zashiki — 和室・陽だまりの座敷 (Sunlit Tatami Zashiki, Shoji, Tansu, Koi Pond veranda, Zabuton)
 *  2. salon   — 貴賓室・大理石と真鍮の間 (Marble & Brass Inlay, Walnut Herringbone, Emerald Velvet, Library)
 *  3. shrine  — 社殿・苔庭の拝殿 (Shinto Shrine Facade, Stepping Stones, Moss, Vermilion Timber, Blue Sky)
 *  4. onsen   — 湯けむり・石庭の離れ (Limestone Waterfall, Turquoise Caustics Water, Bamboo, Mossy Boulders)
 *  5. atelier — 工房・赤煉瓦と鉄のアトリエ (Glazed Amber Brick, Terracotta Louvers, Corten Iron, Chalkboard)
 *
 * Also builds persistent diegetic tabletop props:
 *  - Mechanical JNV1.0 Brass Clockwork Escapement Core (pure watchmaker brass + walnut, zero neon)
 *  - 3D Physical Scoreboard Tray with sculpted Obsidian & Ivory Victory Stones
 *  - Shadow Flame Analytic Tabletop Contact-AO Shader Plane driven live by both 3D hands
 */

import * as THREE from 'three';
import { ShadowFlameMode, StageId } from '../graphics/GraphicsConfig';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';

export interface StageDefinition {
  id: StageId;
  nameJp: string;
  subtitleJp: string;
  previewTexture: string;
  sunDirection: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  fillColor: number;
  fillIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  backgroundColor: number;
  exposure: number;
}

export const STAGE_DEFINITIONS: Record<StageId, StageDefinition> = {
  zashiki: {
    id: 'zashiki',
    nameJp: '和室・座敷',
    subtitleJp: '畳 · 障子 · 時代箪笥',
    previewTexture: './textures/tansu_chest_albedo.jpg',
    sunDirection: [2.8, 3.8, 1.9],
    sunColor: 0xffdfad,
    sunIntensity: 3.25,
    fillColor: 0xaac8ee,
    fillIntensity: 0.45,
    hemiSky: 0xd4e4f7,
    hemiGround: 0x5c4630,
    hemiIntensity: 0.44,
    fogColor: 0xdccdb8,
    fogDensity: 0.02,
    backgroundColor: 0xcabaa3,
    exposure: 0.92,
  },
  salon: {
    id: 'salon',
    nameJp: '貴賓室・真鍮の間',
    subtitleJp: '大理石 · 寄木 · 書庫',
    previewTexture: './textures/marble_brass_floor_albedo.jpg',
    sunDirection: [2.6, 4.3, 1.8],
    sunColor: 0xffe6c2,
    sunIntensity: 3.4,
    fillColor: 0xb0c8e8,
    fillIntensity: 0.42,
    hemiSky: 0xcdd8e6,
    hemiGround: 0x453526,
    hemiIntensity: 0.42,
    fogColor: 0x26221d,
    fogDensity: 0.02,
    backgroundColor: 0x1e1a16,
    exposure: 1.0,
  },
  shrine: {
    id: 'shrine',
    nameJp: '社殿・苔庭',
    subtitleJp: '拝殿 · 苔飛び石 · 朱柱',
    previewTexture: './textures/shrine_facade_albedo.jpg',
    sunDirection: [3.0, 4.8, 1.8],
    sunColor: 0xffebc9,
    sunIntensity: 3.6,
    fillColor: 0x9ac4f2,
    fillIntensity: 0.52,
    hemiSky: 0x9ac8f6,
    hemiGround: 0x445037,
    hemiIntensity: 0.52,
    fogColor: 0xc4d9eb,
    fogDensity: 0.015,
    backgroundColor: 0x7eb3e2,
    exposure: 0.9,
  },
  onsen: {
    id: 'onsen',
    nameJp: '湯けむり・離れ',
    subtitleJp: '石灰華の滝 · 碧水 · 青竹',
    previewTexture: './textures/onsen_waterfall_albedo.jpg',
    sunDirection: [2.6, 4.5, 2.0],
    sunColor: 0xffeed2,
    sunIntensity: 3.35,
    fillColor: 0x86cfc8,
    fillIntensity: 0.55,
    hemiSky: 0xb8dae8,
    hemiGround: 0x2c524b,
    hemiIntensity: 0.48,
    fogColor: 0xb8cdcc,
    fogDensity: 0.022,
    backgroundColor: 0x8eaeb3,
    exposure: 0.92,
  },
  atelier: {
    id: 'atelier',
    nameJp: '赤煉瓦アトリエ',
    subtitleJp: '施釉煉瓦 · 錆鉄 · 黒板',
    previewTexture: './textures/glazed_amber_brick_albedo.jpg',
    sunDirection: [3.2, 3.7, 1.7],
    sunColor: 0xffcfa0,
    sunIntensity: 3.45,
    fillColor: 0xa4bedc,
    fillIntensity: 0.46,
    hemiSky: 0xc4d2e4,
    hemiGround: 0x4f3829,
    hemiIntensity: 0.42,
    fogColor: 0x302720,
    fogDensity: 0.022,
    backgroundColor: 0x241e19,
    exposure: 0.98,
  },
};

export const STAGE_LIST: readonly StageDefinition[] = [
  STAGE_DEFINITIONS.zashiki,
  STAGE_DEFINITIONS.salon,
  STAGE_DEFINITIONS.shrine,
  STAGE_DEFINITIONS.onsen,
  STAGE_DEFINITIONS.atelier,
];

const CONTACT_AO_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CONTACT_AO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uLeftHand;
uniform vec3 uRightHand;
uniform float uStrength;
varying vec3 vWorldPos;
varying vec2 vUv;

float handContactShadow(vec3 worldPos, vec3 handCenter) {
  // Project downward slightly along warm sun angle for realistic directional contact grounding
  vec2 delta = worldPos.xz - (handCenter.xz - vec2(0.05, -0.03) * max(0.0, handCenter.y));
  float height = max(0.02, handCenter.y);
  float radius = 0.24 + height * 0.42;
  float d = length(delta) / radius;
  float radial = exp(-d * d * 2.2);
  float heightAtten = 1.0 / (1.0 + height * 2.1);
  return radial * heightAtten;
}

void main() {
  float sL = handContactShadow(vWorldPos, uLeftHand);
  float sR = handContactShadow(vWorldPos, uRightHand);
  // Subtle edge vignette around inlaid battle mat perimeter
  vec2 edge = abs(vUv - 0.5) * 2.0;
  float borderMask = 1.0 - smoothstep(0.84, 1.0, max(edge.x, edge.y));
  float occ = clamp((sL + sR) * uStrength, 0.0, 0.62) * borderMask;
  // Warm deep umbra tone (never cold dead black)
  gl_FragColor = vec4(0.06, 0.045, 0.035, occ);
}
`;

export class StageBuilder {
  public readonly stageGroup = new THREE.Group();
  public readonly propsGroup = new THREE.Group();

  private readonly textures: TextureAtlasLoader;
  private readonly disposables: Array<{ dispose(): void }> = [];

  // Diegetic Tabletop Mechanical JNV1.0 Clockwork Indicator
  private clockworkGearOuter!: THREE.Mesh;
  private clockworkGearInner!: THREE.Mesh;
  private clockworkNeedle!: THREE.Group;
  private clockworkTargetAngle = 0;
  private clockworkSpinSpeed = 0.4;

  // Physical 3D Tabletop Victory Stones (up to 9 slots per side) with ballistic bounce physics
  private playerTokens: THREE.Mesh[] = [];
  private npcTokens: THREE.Mesh[] = [];
  private playerTokenYTargets: number[] = [];
  private npcTokenYTargets: number[] = [];
  private playerTokenVelY: number[] = [];
  private npcTokenVelY: number[] = [];

  // Shadow Flame Analytic Tabletop Contact-AO Shader
  private contactAoMat!: THREE.ShaderMaterial;

  // Animated water planes (Koi Pond / Onsen)
  private animatedWaterMaps: THREE.Texture[] = [];

  /** Real-time physics bounce callback routed directly into JSound Engin 1.0 */
  public onStoneBounce?: (
    side: 'player' | 'npc',
    velocity: number,
    pos: { x: number; y: number; z: number }
  ) => void;

  constructor(textures: TextureAtlasLoader) {
    this.textures = textures;
    this.buildPersistentTabletopProps();
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.disposables.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.disposables.push(m);
    return m;
  }

  /**
   * Persistent diegetic tabletop props (shared across all 5 stages on top of the duel table at y=0):
   * 1. Shadow Flame Analytic Contact-AO Grounding Layer
   * 2. JNV1.0 Mechanical Brass & Walnut Clockwork Escapement Core
   * 3. Carved Scoreboard Trays + Sculpted Ivory & Obsidian Go-Stone Tokens
   */
  private buildPersistentTabletopProps(): void {
    // 1. Shadow Flame Analytic Tabletop Contact-AO Plane
    this.contactAoMat = new THREE.ShaderMaterial({
      vertexShader: CONTACT_AO_VERT,
      fragmentShader: CONTACT_AO_FRAG,
      uniforms: {
        uLeftHand: { value: new THREE.Vector3(-0.5, 0.35, 0.15) },
        uRightHand: { value: new THREE.Vector3(0.5, 0.35, -0.1) },
        uStrength: { value: 0.85 },
      },
      transparent: true,
      depthWrite: false,
    });
    const aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.32), this.contactAoMat);
    aoPlane.rotation.x = -Math.PI / 2;
    aoPlane.position.set(0, 0.003, 0);
    aoPlane.renderOrder = 2;
    this.propsGroup.add(aoPlane);

    // 2. Mechanical JNV1.0 Brass Clockwork Escapement (positioned neatly at back-right of table)
    const bronzeMat = this.textures.createMaterial('brushed_bronze', {
      repeatX: 2,
      repeatY: 2,
      roughness: 0.3,
      metalness: 0.88,
      envMapIntensity: 1.45,
    });
    const walnutMat = this.textures.createMaterial('walnut_herringbone', {
      repeatX: 1,
      repeatY: 1,
      roughness: 0.42,
      metalness: 0.04,
      clearcoat: 0.45,
    });
    const ivoryDialMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4ecdc,
      roughness: 0.35,
      metalness: 0.05,
      clearcoat: 0.6,
    });
    const darkIronMat = new THREE.MeshPhysicalMaterial({
      color: 0x2c2a28,
      roughness: 0.36,
      metalness: 0.85,
    });

    const coreGroup = new THREE.Group();
    coreGroup.position.set(0.76, 0.0, -0.44);
    coreGroup.rotation.y = -0.35;

    // Carved Walnut Pedestal Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.045, 32), walnutMat);
    base.position.y = 0.0225;
    base.castShadow = true;
    base.receiveShadow = true;
    coreGroup.add(base);

    // Brass Bezel Rim
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.012, 16, 40), bronzeMat);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 0.048;
    bezel.castShadow = true;
    coreGroup.add(bezel);

    // Ivory Engraved Mechanical Dial Plate
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.124, 0.008, 32), ivoryDialMat);
    dial.position.y = 0.045;
    dial.receiveShadow = true;
    coreGroup.add(dial);

    // Outer Toothed Brass Gear (built from extruded/procedural gear ring)
    const outerGearShape = this.createGearShape(0.105, 0.088, 18);
    const outerGearGeo = new THREE.ExtrudeGeometry(outerGearShape, {
      depth: 0.009,
      bevelEnabled: true,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
      bevelSegments: 2,
    });
    outerGearGeo.rotateX(-Math.PI / 2);
    this.clockworkGearOuter = new THREE.Mesh(outerGearGeo, bronzeMat);
    this.clockworkGearOuter.position.y = 0.05;
    this.clockworkGearOuter.castShadow = true;
    coreGroup.add(this.clockworkGearOuter);

    // Inner Counter-Rotating Escapement Wheel
    const innerGearShape = this.createGearShape(0.064, 0.05, 12);
    const innerGearGeo = new THREE.ExtrudeGeometry(innerGearShape, {
      depth: 0.011,
      bevelEnabled: true,
      bevelSize: 0.0012,
      bevelThickness: 0.0012,
      bevelSegments: 2,
    });
    innerGearGeo.rotateX(-Math.PI / 2);
    this.clockworkGearInner = new THREE.Mesh(innerGearGeo, darkIronMat);
    this.clockworkGearInner.position.y = 0.055;
    this.clockworkGearInner.castShadow = true;
    coreGroup.add(this.clockworkGearInner);

    // Central Mechanical Needle showing JNV1.0 decision certainty
    this.clockworkNeedle = new THREE.Group();
    this.clockworkNeedle.position.y = 0.072;
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.105, 8), bronzeMat);
    pointer.rotation.x = Math.PI / 2;
    pointer.position.z = 0.04;
    pointer.castShadow = true;
    this.clockworkNeedle.add(pointer);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.018, 16), bronzeMat);
    this.clockworkNeedle.add(cap);
    coreGroup.add(this.clockworkNeedle);

    // 12 miniature brass tick-studs around the bezel
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.01, 8), bronzeMat);
      stud.position.set(Math.cos(ang) * 0.114, 0.052, Math.sin(ang) * 0.114);
      coreGroup.add(stud);
    }

    this.propsGroup.add(coreGroup);

    // 3. Physical Tabletop Go-Stone / Brass-and-Lacquer Score Trays (Left = Player, Right = JNV1.0)
    const trayGeo = new THREE.BoxGeometry(0.46, 0.022, 0.115);
    const trayLeft = new THREE.Mesh(trayGeo, walnutMat);
    trayLeft.position.set(-0.56, 0.011, -0.51);
    trayLeft.castShadow = true;
    trayLeft.receiveShadow = true;
    this.propsGroup.add(trayLeft);

    const trayRight = new THREE.Mesh(trayGeo, walnutMat);
    trayRight.position.set(0.32, 0.011, -0.51);
    trayRight.castShadow = true;
    trayRight.receiveShadow = true;
    this.propsGroup.add(trayRight);

    const playerStoneMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7f1e3,
      roughness: 0.16,
      metalness: 0.04,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
    });
    const npcStoneMat = new THREE.MeshPhysicalMaterial({
      color: 0xc2985c,
      roughness: 0.22,
      metalness: 0.88,
      clearcoat: 0.4,
    });

    const stoneGeo = new THREE.SphereGeometry(0.027, 20, 14);
    stoneGeo.scale(1.0, 0.44, 1.0);

    for (let i = 0; i < 5; i++) {
      const xOff = -0.17 + i * 0.085;
      const pStone = new THREE.Mesh(stoneGeo, playerStoneMat);
      pStone.position.set(-0.56 + xOff, -0.05, -0.51);
      pStone.visible = false;
      pStone.castShadow = true;
      pStone.receiveShadow = true;
      this.propsGroup.add(pStone);
      this.playerTokens.push(pStone);
      this.playerTokenYTargets.push(-0.05);
      this.playerTokenVelY.push(0);

      const nStone = new THREE.Mesh(stoneGeo, npcStoneMat);
      nStone.position.set(0.32 + xOff, -0.05, -0.51);
      nStone.visible = false;
      nStone.castShadow = true;
      nStone.receiveShadow = true;
      this.propsGroup.add(nStone);
      this.npcTokens.push(nStone);
      this.npcTokenYTargets.push(-0.05);
      this.npcTokenVelY.push(0);
    }
  }

  private createGearShape(outerR: number, innerR: number, teeth: number): THREE.Shape {
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const a1 = a0 + step * 0.24;
      const a2 = a0 + step * 0.46;
      const a3 = a0 + step * 0.72;
      const p0x = Math.cos(a0) * innerR;
      const p0y = Math.sin(a0) * innerR;
      if (i === 0) shape.moveTo(p0x, p0y);
      else shape.lineTo(p0x, p0y);
      shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      shape.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
    }
    shape.closePath();

    // Inner watchmaker cutout hole
    const hole = new THREE.Path();
    hole.absarc(0, 0, innerR * 0.42, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return shape;
  }

  public clearStage(): void {
    while (this.stageGroup.children.length > 0) {
      this.stageGroup.remove(this.stageGroup.children[0]);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.animatedWaterMaps.length = 0;
  }

  /**
   * Build the selected photorealistic architectural stage cleanly using extracted PBR textures.
   */
  public buildStage(stageId: StageId): StageDefinition {
    this.clearStage();
    const def = STAGE_DEFINITIONS[stageId];

    if (stageId === 'zashiki') this.buildZashikiStage();
    else if (stageId === 'salon') this.buildSalonStage();
    else if (stageId === 'shrine') this.buildShrineStage();
    else if (stageId === 'onsen') this.buildOnsenStage();
    else this.buildAtelierStage();

    // Enable full shadow casting and receiving across all architectural meshes
    this.stageGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.userData.noShadowCast !== true) obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return def;
  }

  /**
   * Helper: Sculpted Beveled Center Duel Table (top surface sits cleanly at y = 0.0).
   */
  private buildDuelTable(
    frameMat: THREE.Material,
    matSurface: THREE.Material,
    trimMat: THREE.Material,
    legHeight = 0.72
  ): void {
    // Heavy beveled tabletop slab (top face at y = 0.0)
    const topGeo = this.trackGeo(new THREE.BoxGeometry(2.38, 0.085, 1.48));
    const top = new THREE.Mesh(topGeo, frameMat);
    top.position.set(0, -0.0425, 0);
    this.stageGroup.add(top);

    // Molded stepped apron beneath tabletop
    const apronGeo = this.trackGeo(new THREE.BoxGeometry(2.14, 0.09, 1.24));
    const apron = new THREE.Mesh(apronGeo, frameMat);
    apron.position.set(0, -0.12, 0);
    this.stageGroup.add(apron);

    // Recessed tactile duel mat inlaid flush on top (y = 0.001)
    const inlayGeo = this.trackGeo(new THREE.BoxGeometry(1.94, 0.008, 1.12));
    const inlay = new THREE.Mesh(inlayGeo, matSurface);
    inlay.position.set(0, -0.001, 0);
    this.stageGroup.add(inlay);

    // Precision mitered brass/bronze inlay perimeter strips
    const barLongGeo = this.trackGeo(new THREE.BoxGeometry(1.98, 0.011, 0.02));
    const barShortGeo = this.trackGeo(new THREE.BoxGeometry(0.02, 0.011, 1.14));
    for (const sz of [-0.56, 0.56]) {
      const b = new THREE.Mesh(barLongGeo, trimMat);
      b.position.set(0, 0.0, sz);
      this.stageGroup.add(b);
    }
    for (const sx of [-0.98, 0.98]) {
      const b = new THREE.Mesh(barShortGeo, trimMat);
      b.position.set(sx, 0.0, 0);
      this.stageGroup.add(b);
    }

    // Center duel dividing hairline inlay
    const centerLineGeo = this.trackGeo(new THREE.BoxGeometry(0.012, 0.006, 0.96));
    const centerLine = new THREE.Mesh(centerLineGeo, trimMat);
    centerLine.position.set(0, 0.0015, 0);
    this.stageGroup.add(centerLine);

    // Subtle brass center clash medallion ring
    const medRingGeo = this.trackGeo(new THREE.TorusGeometry(0.18, 0.0055, 10, 48));
    medRingGeo.rotateX(Math.PI / 2);
    const medRing = new THREE.Mesh(medRingGeo, trimMat);
    medRing.position.set(0, 0.004, 0);
    this.stageGroup.add(medRing);

    // 4 Corner Protective Brass Brackets
    const cornerGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.092, 0.11));
    for (const cx of [-1.15, 1.15]) {
      for (const cz of [-0.7, 0.7]) {
        const corner = new THREE.Mesh(cornerGeo, trimMat);
        corner.position.set(cx, -0.042, cz);
        this.stageGroup.add(corner);
      }
    }

    // 4 Sturdy Sculpted Legs
    const legGeo = this.trackGeo(new THREE.BoxGeometry(0.12, legHeight, 0.12));
    for (const lx of [-0.98, 0.98]) {
      for (const lz of [-0.54, 0.54]) {
        const leg = new THREE.Mesh(legGeo, frameMat);
        leg.position.set(lx, -0.085 - legHeight / 2, lz);
        this.stageGroup.add(leg);
      }
    }
  }

  // ===========================================================================
  // STAGE 1: 和室・陽だまりの座敷 (Sunlit Japanese Tatami Zashiki)
  // ===========================================================================
  private buildZashikiStage(): void {
    const floorY = -0.62;

    const tatamiMat = this.trackMat(
      this.textures.createMaterial('tatami', { repeatX: 3, repeatY: 3, roughness: 0.92, normalScale: 1.1 })
    );
    const oakMat = this.trackMat(
      this.textures.createMaterial('oak_floor', { repeatX: 4, repeatY: 2, roughness: 0.52, clearcoat: 0.28 })
    );
    const shikkuiMat = this.trackMat(
      this.textures.createMaterial('shikkui_cream', { repeatX: 3, repeatY: 2, roughness: 0.88 })
    );
    const cedarMat = this.trackMat(
      this.textures.createMaterial('cedar_panel', { repeatX: 4, repeatY: 1, roughness: 0.62 })
    );
    const yakisugiMat = this.trackMat(
      this.textures.createMaterial('yakisugi_wood', { repeatX: 2, repeatY: 2, roughness: 0.72 })
    );
    const shojiMat = this.trackMat(
      this.textures.createMaterial('shoji_doors', { repeatX: 1, repeatY: 1, roughness: 0.58 })
    );
    const tansuMat = this.trackMat(
      this.textures.createMaterial('tansu_chest', { repeatX: 1, repeatY: 1, roughness: 0.36, clearcoat: 0.55 })
    );
    const norenMat = this.trackMat(
      this.textures.createMaterial('noren_indigo', { repeatX: 1, repeatY: 1, roughness: 0.9 })
    );
    const plaquesMat = this.trackMat(
      this.textures.createMaterial('wood_plaques', { repeatX: 1, repeatY: 1, roughness: 0.58 })
    );
    const windowMat = this.trackMat(
      this.textures.createMaterial('window_city_sky', { repeatX: 1, repeatY: 1, roughness: 0.25 })
    );
    windowMat.emissive = new THREE.Color(0xfff4df);
    windowMat.emissiveMap = windowMat.map;
    windowMat.emissiveIntensity = 0.52;

    const zabutonMat = this.trackMat(
      this.textures.createMaterial('zabuton_red', { repeatX: 1, repeatY: 1, roughness: 0.9 })
    );
    const sakuraMat = this.trackMat(
      this.textures.createMaterial('sakura_cloth', { repeatX: 2, repeatY: 1.2, roughness: 0.85, normalScale: 0.95 })
    );
    const timberMat = this.trackMat(
      this.textures.createMaterial('bolted_timber', { repeatX: 2, repeatY: 1.2, roughness: 0.45, clearcoat: 0.38 })
    );
    const bronzeMat = this.trackMat(
      this.textures.createMaterial('brushed_bronze', { repeatX: 2, repeatY: 2, roughness: 0.28, metalness: 0.88 })
    );
    const koiMat = this.trackMat(
      this.textures.createMaterial('koi_pond', { repeatX: 2, repeatY: 2, roughness: 0.1, clearcoat: 0.9 })
    );
    if (koiMat.map) this.animatedWaterMaps.push(koiMat.map);
    const kumikoMat = this.trackMat(
      this.textures.createMaterial('kumiko_lattice', { repeatX: 2, repeatY: 2, roughness: 0.62 })
    );

    // Center Chabudai Duel Table
    this.buildDuelTable(timberMat, sakuraMat, bronzeMat, 0.54);

    // Tatami Room Floor
    const tatamiFloor = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(5.6, 5.2)), tatamiMat);
    tatamiFloor.rotation.x = -Math.PI / 2;
    tatamiFloor.position.set(0.3, floorY, -0.3);
    tatamiFloor.userData.noShadowCast = true;
    this.stageGroup.add(tatamiFloor);

    // Engawa Wooden Veranda on Left + Koi Pond outside!
    const engawa = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.5, 0.08, 6.2)), oakMat);
    engawa.position.set(-3.2, floorY + 0.02, -0.3);
    this.stageGroup.add(engawa);

    const koiPond = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(3.4, 6.5)), koiMat);
    koiPond.rotation.x = -Math.PI / 2;
    koiPond.position.set(-5.4, floorY - 0.18, -0.4);
    koiPond.userData.noShadowCast = true;
    this.stageGroup.add(koiPond);

    // Two Plump Sculpted Crimson Zabuton Cushions flanking the Chabudai
    const zabGeo = this.trackGeo(new THREE.BoxGeometry(0.84, 0.11, 0.84, 8, 2, 8));
    // Gently puff pillow center & droop corners
    const pos = zabGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) / 0.42;
      const vy = pos.getY(i);
      const vz = pos.getZ(i) / 0.42;
      const r2 = Math.min(1, (vx * vx + vz * vz) * 0.55);
      const puff = Math.cos(r2 * Math.PI * 0.5) * 0.042;
      const dimple = Math.exp(-(vx * vx + vz * vz) * 14.0) * 0.024;
      if (vy > 0) pos.setY(i, vy + puff - dimple);
    }
    zabGeo.computeVertexNormals();

    for (const [zx, zz, ry] of [
      [-1.55, 0.16, 0.12],
      [1.55, -0.14, -0.14],
    ]) {
      const zab = new THREE.Mesh(zabGeo, zabutonMat);
      zab.position.set(zx, floorY + 0.055, zz);
      zab.rotation.y = ry;
      this.stageGroup.add(zab);
    }

    // Back Architecture Wall (Shikkui upper + Cedar wainscoting + Shoji Doors + Tansu Chest + Noren)
    const backWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(9.6, 4.4, 0.18)), shikkuiMat);
    backWall.position.set(0, floorY + 2.2, -3.15);
    this.stageGroup.add(backWall);

    const wainscot = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(9.5, 1.15, 0.22)), cedarMat);
    wainscot.position.set(0, floorY + 0.57, -3.12);
    this.stageGroup.add(wainscot);

    // Sunlit Shoji Sliding Lattice Doors (back-center-right, gently diffused warm afternoon glow)
    const shojiPanelMat = shojiMat.clone();
    this.trackMat(shojiPanelMat);
    shojiPanelMat.emissive = new THREE.Color(0xffe7bd);
    shojiPanelMat.emissiveIntensity = 0.28;
    const shoji = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.45, 2.35, 0.08)), shojiPanelMat);
    shoji.position.set(1.25, floorY + 1.32, -3.02);
    this.stageGroup.add(shoji);

    // Authentic 3D Lacquered Japanese Tansu Chest (back-left)
    const tansuBody = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.48, 1.38, 0.62)), yakisugiMat);
    tansuBody.position.set(-1.68, floorY + 0.69, -2.72);
    this.stageGroup.add(tansuBody);
    const tansuFront = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(1.44, 1.34)), tansuMat);
    tansuFront.position.set(-1.68, floorY + 0.69, -2.4);
    this.stageGroup.add(tansuFront);

    // Hanging Indigo Noren Curtain & Wooden Score Plaques (木札) above Tansu
    const plaques = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.25, 0.72, 0.05)), plaquesMat);
    plaques.position.set(-1.68, floorY + 2.02, -3.02);
    this.stageGroup.add(plaques);

    const noren = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.38, 1.05, 0.04)), norenMat);
    noren.position.set(-0.25, floorY + 2.15, -3.0);
    this.stageGroup.add(noren);

    // Right Side Wall with Sunlit City-Sky Sliding Window & Kumiko Lattice Screen
    const rightWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.18, 4.4, 7.6)), shikkuiMat);
    rightWall.position.set(3.45, floorY + 2.2, 0.2);
    this.stageGroup.add(rightWall);

    const sideWindow = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.08, 1.85, 2.3)), windowMat);
    sideWindow.position.set(3.35, floorY + 1.95, -0.85);
    this.stageGroup.add(sideWindow);

    const kumikoScreen = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.08, 2.6, 1.5)), kumikoMat);
    kumikoScreen.position.set(3.32, floorY + 1.3, 1.4);
    this.stageGroup.add(kumikoScreen);

    // Structural Hinoki Timber Pillars & Ceiling Beams (Hashira & Nageshi)
    const pillarGeo = this.trackGeo(new THREE.BoxGeometry(0.19, 4.4, 0.19));
    for (const [px, pz] of [
      [-2.85, -3.02],
      [-0.1, -3.02],
      [2.65, -3.02],
      [3.32, -2.2],
      [3.32, 0.45],
      [-2.85, 0.45],
    ]) {
      const p = new THREE.Mesh(pillarGeo, yakisugiMat);
      p.position.set(px, floorY + 2.2, pz);
      this.stageGroup.add(p);
    }

    const beam = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(9.6, 0.22, 0.24)), yakisugiMat);
    beam.position.set(0, floorY + 2.62, -3.0);
    this.stageGroup.add(beam);
  }

  // ===========================================================================
  // STAGE 2: 貴賓室・大理石と真鍮の間 (Grand Heritage Marble & Brass Salon)
  // ===========================================================================
  private buildSalonStage(): void {
    const floorY = -0.72;

    const marbleFloorMat = this.trackMat(
      this.textures.createMaterial('marble_brass_floor', { repeatX: 4, repeatY: 4, roughness: 0.24, clearcoat: 0.68 })
    );
    const walnutMat = this.trackMat(
      this.textures.createMaterial('walnut_herringbone', { repeatX: 3, repeatY: 2, roughness: 0.36, clearcoat: 0.48 })
    );
    const velvetMat = this.trackMat(
      this.textures.createMaterial('emerald_velvet_wall', { repeatX: 4, repeatY: 1.5, roughness: 0.88 })
    );
    const travertineMat = this.trackMat(
      this.textures.createMaterial('travertine_stone', { repeatX: 2, repeatY: 2, roughness: 0.62 })
    );
    const greyMarbleMat = this.trackMat(
      this.textures.createMaterial('grey_marble_slab', { repeatX: 2, repeatY: 1.2, roughness: 0.22, clearcoat: 0.72 })
    );
    const bronzeMat = this.trackMat(
      this.textures.createMaterial('brushed_bronze', { repeatX: 2, repeatY: 2, roughness: 0.24, metalness: 0.9 })
    );
    const champagneMat = this.trackMat(
      this.textures.createMaterial('champagne_steel', { repeatX: 2, repeatY: 2, roughness: 0.28, metalness: 0.85 })
    );
    const booksMat = this.trackMat(
      this.textures.createMaterial('library_books', { repeatX: 1, repeatY: 1, roughness: 0.72 })
    );

    // Sculpted Marble & Brushed Bronze Gallery Table
    this.buildDuelTable(walnutMat, greyMarbleMat, bronzeMat, 0.64);

    // Grand Diamond-Inlaid Marble Floor
    const floor = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(10.5, 9.5)), marbleFloorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, -0.5);
    floor.userData.noShadowCast = true;
    this.stageGroup.add(floor);

    // Walnut Herringbone Carpet Border under Table
    const parquetRug = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(4.2, 0.025, 3.0)), walnutMat);
    parquetRug.position.set(0, floorY + 0.012, 0);
    this.stageGroup.add(parquetRug);

    // Back Emerald Velvet & Gold Braid Architectural Wall
    const backWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(10.0, 4.8, 0.22)), velvetMat);
    backWall.position.set(0, floorY + 2.4, -3.35);
    this.stageGroup.add(backWall);

    // Side Walls
    const leftWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.22, 4.8, 8.2)), velvetMat);
    leftWall.position.set(-4.1, floorY + 2.4, 0.2);
    this.stageGroup.add(leftWall);

    const rightWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.22, 4.8, 8.2)), champagneMat);
    rightWall.position.set(4.1, floorY + 2.4, 0.2);
    this.stageGroup.add(rightWall);

    // Twin Antique Library Bookshelves flanking the center Travertine Niche
    for (const bx of [-2.25, 2.25]) {
      const shelfFrame = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.95, 2.65, 0.45)), walnutMat);
      shelfFrame.position.set(bx, floorY + 1.38, -3.1);
      this.stageGroup.add(shelfFrame);
      const booksFace = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(1.84, 2.52)), booksMat);
      booksFace.position.set(bx, floorY + 1.38, -2.87);
      this.stageGroup.add(booksFace);
    }

    // Central Monumental Travertine Stone Architectural Columns & Brass Architrave
    const colGeo = this.trackGeo(new THREE.BoxGeometry(0.42, 4.4, 0.42));
    for (const cx of [-1.05, 1.05, -3.55, 3.55]) {
      const col = new THREE.Mesh(colGeo, travertineMat);
      col.position.set(cx, floorY + 2.2, -3.05);
      this.stageGroup.add(col);
      const cap = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.52, 0.14, 0.52)), bronzeMat);
      cap.position.set(cx, floorY + 0.08, -3.05);
      this.stageGroup.add(cap);
    }

    // Center Champagne-Steel Inlaid Heritage Relief Panel
    const centerPanel = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.7, 2.5, 0.12)), champagneMat);
    centerPanel.position.set(0, floorY + 1.5, -3.18);
    this.stageGroup.add(centerPanel);

    const cornice = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(10.0, 0.24, 0.4)), bronzeMat);
    cornice.position.set(0, floorY + 3.25, -3.12);
    this.stageGroup.add(cornice);
  }

  // ===========================================================================
  // STAGE 3: 社殿・苔庭の拝殿 (Sacred Shinto Shrine & Moss Garden)
  // ===========================================================================
  private buildShrineStage(): void {
    const floorY = -0.68;

    const pebbleMat = this.trackMat(
      this.textures.createMaterial('pebble_aggregate', { repeatX: 5, repeatY: 5, roughness: 0.78, normalScale: 1.35 })
    );
    const steppingMat = this.trackMat(
      this.textures.createMaterial('stepping_stones', { repeatX: 3, repeatY: 3, roughness: 0.82, normalScale: 1.3 })
    );
    const mossMat = this.trackMat(
      this.textures.createMaterial('velvet_moss', { repeatX: 4, repeatY: 4, roughness: 0.95, normalScale: 1.4 })
    );
    const graniteMat = this.trackMat(
      this.textures.createMaterial('pale_granite', { repeatX: 2, repeatY: 2, roughness: 0.72 })
    );
    const slateMat = this.trackMat(
      this.textures.createMaterial('dark_slate_tile', { repeatX: 2, repeatY: 1.4, roughness: 0.62, normalScale: 1.2 })
    );
    const verdigrisMat = this.trackMat(
      this.textures.createMaterial('verdigris_copper', { repeatX: 2, repeatY: 2, roughness: 0.48, metalness: 0.62 })
    );
    const vermilionMat = this.trackMat(
      this.textures.createMaterial('vermilion_wood', { repeatX: 2, repeatY: 2, roughness: 0.42, clearcoat: 0.42 })
    );
    const shrineMat = this.trackMat(
      this.textures.createMaterial('shrine_facade', { repeatX: 1, repeatY: 1, roughness: 0.68 })
    );
    const bambooFenceMat = this.trackMat(
      this.textures.createMaterial('bamboo_fence', { repeatX: 3, repeatY: 1, roughness: 0.62 })
    );
    const skyMat = this.trackMat(
      this.textures.createMaterial('blue_sky', { repeatX: 1, repeatY: 1, roughness: 1.0 })
    );
    skyMat.emissive = new THREE.Color(0xdaf0ff);
    skyMat.emissiveMap = skyMat.map;
    skyMat.emissiveIntensity = 0.72;

    // Ceremonial Carved Pale Granite & Dark Slate Altar Table with Verdigris Copper Trim
    this.buildDuelTable(graniteMat, slateMat, verdigrisMat, 0.6);

    // Courtyard River-Pebble Aggregate Ground
    const ground = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(14, 14)), pebbleMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, floorY, -1.5);
    ground.userData.noShadowCast = true;
    this.stageGroup.add(ground);

    // Stepping Stones Path & Moss Garden Beds
    const path = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(4.4, 5.2)), steppingMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, floorY + 0.008, -0.4);
    path.userData.noShadowCast = true;
    this.stageGroup.add(path);

    for (const mx of [-3.4, 3.4]) {
      const mossBed = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.6, 0.14, 6.2)), mossMat);
      mossBed.position.set(mx, floorY + 0.05, -0.8);
      this.stageGroup.add(mossBed);
    }

    // Traditional Shinto Shrine Facade Monument in Backdrop
    const shrineBacking = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(5.6, 4.4, 0.5)), graniteMat);
    shrineBacking.position.set(0, floorY + 2.2, -4.45);
    this.stageGroup.add(shrineBacking);

    const shrineFace = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(5.5, 4.35)), shrineMat);
    shrineFace.position.set(0, floorY + 2.2, -4.18);
    this.stageGroup.add(shrineFace);

    // Sculpted Vermilion Torii-Inspired Flanking Pillars & Lintels
    const toriiPillarGeo = this.trackGeo(new THREE.CylinderGeometry(0.15, 0.17, 3.6, 20));
    for (const tx of [-2.75, 2.75]) {
      const pillar = new THREE.Mesh(toriiPillarGeo, vermilionMat);
      pillar.position.set(tx, floorY + 1.8, -2.55);
      this.stageGroup.add(pillar);
      const stoneBase = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.34, 16)), graniteMat);
      stoneBase.position.set(tx, floorY + 0.17, -2.55);
      this.stageGroup.add(stoneBase);
    }
    const kasagiBeam = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(6.6, 0.24, 0.34)), vermilionMat);
    kasagiBeam.position.set(0, floorY + 3.55, -2.55);
    this.stageGroup.add(kasagiBeam);
    const kasagiCap = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(6.8, 0.1, 0.42)), slateMat);
    kasagiCap.position.set(0, floorY + 3.7, -2.55);
    this.stageGroup.add(kasagiCap);

    // Traditional Bamboo Kenninji-gaki Fences on Left & Right
    for (const fx of [-4.4, 4.4]) {
      const fence = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.16, 2.1, 6.8)), bambooFenceMat);
      fence.position.set(fx, floorY + 1.05, -1.0);
      this.stageGroup.add(fence);
    }

    // Crisp Sunlit Sky Dome Wall behind Shrine
    const skyWall = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(24, 12)), skyMat);
    skyWall.position.set(0, 4.2, -6.8);
    skyWall.userData.noShadowCast = true;
    this.stageGroup.add(skyWall);
  }

  // ===========================================================================
  // STAGE 4: 湯けむり・石庭の離れ (Onsen Limestone Waterfall & Bamboo Sanctuary)
  // ===========================================================================
  private buildOnsenStage(): void {
    const floorY = -0.66;

    const waterMat = this.trackMat(
      this.textures.createMaterial('onsen_water', { repeatX: 3, repeatY: 3, roughness: 0.08, clearcoat: 0.95 })
    );
    if (waterMat.map) this.animatedWaterMaps.push(waterMat.map);
    const lilyMat = this.trackMat(
      this.textures.createMaterial('lily_pond', { repeatX: 2, repeatY: 2, roughness: 0.1, clearcoat: 0.9 })
    );
    const waterfallMat = this.trackMat(
      this.textures.createMaterial('onsen_waterfall', { repeatX: 1, repeatY: 1, roughness: 0.18, clearcoat: 0.85 })
    );
    const poolsMat = this.trackMat(
      this.textures.createMaterial('travertine_pools', { repeatX: 2, repeatY: 1, roughness: 0.36, clearcoat: 0.55 })
    );
    const boulderMat = this.trackMat(
      this.textures.createMaterial('mossy_boulder_wall', { repeatX: 3, repeatY: 1.5, roughness: 0.78, normalScale: 1.45 })
    );
    const bambooMat = this.trackMat(
      this.textures.createMaterial('green_bamboo', { repeatX: 2, repeatY: 2, roughness: 0.42, clearcoat: 0.35 })
    );
    const botanicalMat = this.trackMat(
      this.textures.createMaterial('botanical_wall', { repeatX: 2, repeatY: 2, roughness: 0.85 })
    );
    const cedarMat = this.trackMat(
      this.textures.createMaterial('cedar_siding', { repeatX: 2, repeatY: 1.4, roughness: 0.52 })
    );
    const stoneBasinMat = this.trackMat(
      this.textures.createMaterial('stone_basin', { repeatX: 1, repeatY: 1, roughness: 0.65 })
    );
    const logsMat = this.trackMat(
      this.textures.createMaterial('stacked_logs', { repeatX: 1.5, repeatY: 1.5, roughness: 0.82 })
    );
    const travertineMat = this.trackMat(
      this.textures.createMaterial('travertine_stone', { repeatX: 2, repeatY: 1.2, roughness: 0.52 })
    );
    const bronzeMat = this.trackMat(
      this.textures.createMaterial('brushed_bronze', { repeatX: 2, repeatY: 2, roughness: 0.32, metalness: 0.85 })
    );

    // Hinoki Cedar & Carved Travertine Sanctuary Table
    this.buildDuelTable(cedarMat, travertineMat, bronzeMat, 0.58);

    // Raised Wooden Island Deck floating over Crystal Turquoise Onsen Water
    const deck = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(3.8, 0.16, 2.7)), cedarMat);
    deck.position.set(0, floorY + 0.04, 0.1);
    this.stageGroup.add(deck);

    // Sparkling Turquoise Caustics Onsen Pool surrounding the deck!
    const poolPlane = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(14, 12)), waterMat);
    poolPlane.rotation.x = -Math.PI / 2;
    poolPlane.position.set(0, floorY - 0.06, -1.2);
    poolPlane.userData.noShadowCast = true;
    this.stageGroup.add(poolPlane);

    // Lily Pad side cove on left
    const lilyCove = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(3.8, 4.4)), lilyMat);
    lilyCove.rotation.x = -Math.PI / 2;
    lilyCove.position.set(-3.8, floorY - 0.045, -0.4);
    lilyCove.userData.noShadowCast = true;
    this.stageGroup.add(lilyCove);

    // Dramatic Limestone Waterfall & Travertine Terrace Cliff Backdrop
    const waterfallWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(3.6, 3.6, 0.6)), waterfallMat);
    waterfallWall.position.set(0, floorY + 1.8, -3.7);
    this.stageGroup.add(waterfallWall);

    const terraceStep = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(4.2, 0.55, 1.1)), poolsMat);
    terraceStep.position.set(0, floorY + 0.2, -3.1);
    this.stageGroup.add(terraceStep);

    // Mossy Boulder Walls & Living Botanical Wall flanking the waterfall
    for (const sx of [-3.3, 3.3]) {
      const rocks = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(3.2, 3.2, 0.8)), boulderMat);
      rocks.position.set(sx, floorY + 1.5, -3.4);
      this.stageGroup.add(rocks);
    }

    const greenWallLeft = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.3, 3.5, 5.2)), botanicalMat);
    greenWallLeft.position.set(-4.6, floorY + 1.7, -0.5);
    this.stageGroup.add(greenWallLeft);

    const bambooWallRight = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.24, 3.6, 5.8)), bambooMat);
    bambooWallRight.position.set(4.1, floorY + 1.8, -0.5);
    this.stageGroup.add(bambooWallRight);

    // Decorative Stone Water Basin (Tsukubai) & Stacked Cedar Firewood Props on Deck Corners
    const basin = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.34, 0.38, 0.42, 24)), stoneBasinMat);
    basin.position.set(-1.55, floorY + 0.32, -0.95);
    this.stageGroup.add(basin);

    const logPile = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.85, 0.65, 0.46)), logsMat);
    logPile.position.set(1.55, floorY + 0.44, -1.0);
    this.stageGroup.add(logPile);
  }

  // ===========================================================================
  // STAGE 5: 工房・赤煉瓦と鉄のアトリエ (Artisan Brick & Forged Iron Atelier)
  // ===========================================================================
  private buildAtelierStage(): void {
    const floorY = -0.7;

    const sandstoneMat = this.trackMat(
      this.textures.createMaterial('sandstone_ashlar', { repeatX: 4, repeatY: 4, roughness: 0.74 })
    );
    const brickMat = this.trackMat(
      this.textures.createMaterial('glazed_amber_brick', { repeatX: 3.5, repeatY: 2.2, roughness: 0.24, clearcoat: 0.72 })
    );
    const louverMat = this.trackMat(
      this.textures.createMaterial('terracotta_louvers', { repeatX: 2, repeatY: 2, roughness: 0.72, normalScale: 1.35 })
    );
    const cortenMat = this.trackMat(
      this.textures.createMaterial('corten_iron', { repeatX: 2, repeatY: 2, roughness: 0.64, metalness: 0.58 })
    );
    const hexMeshMat = this.trackMat(
      this.textures.createMaterial('hex_forged_mesh', { repeatX: 2, repeatY: 2, roughness: 0.42, metalness: 0.8 })
    );
    const timberMat = this.trackMat(
      this.textures.createMaterial('bolted_timber', { repeatX: 2, repeatY: 1.2, roughness: 0.48, clearcoat: 0.26 })
    );
    const steelPlateMat = this.trackMat(
      this.textures.createMaterial('brushed_steel_plate', { repeatX: 2, repeatY: 1.2, roughness: 0.28, metalness: 0.88 })
    );
    const pipesMat = this.trackMat(
      this.textures.createMaterial('industrial_pipes', { repeatX: 1, repeatY: 1, roughness: 0.52, metalness: 0.65 })
    );
    const chalkboardMat = this.trackMat(
      this.textures.createMaterial('chalkboard', { repeatX: 1, repeatY: 1, roughness: 0.86 })
    );
    const skyGlassMat = this.trackMat(
      this.textures.createMaterial('sky_glass_facade', { repeatX: 1.5, repeatY: 1, roughness: 0.16, clearcoat: 0.9 })
    );
    skyGlassMat.emissive = new THREE.Color(0xd2e6ff);
    skyGlassMat.emissiveMap = skyGlassMat.map;
    skyGlassMat.emissiveIntensity = 0.42;

    // Craftsman Bolted Timber & Brushed Steel Workbench Table
    this.buildDuelTable(timberMat, steelPlateMat, cortenMat, 0.62);

    // Warm Sandstone Ashlar Floor
    const floor = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(11, 10)), sandstoneMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, -0.5);
    floor.userData.noShadowCast = true;
    this.stageGroup.add(floor);

    // Glossy Amber Glazed Ceramic Brick Back Wall
    const backWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(10.2, 4.6, 0.22)), brickMat);
    backWall.position.set(0, floorY + 2.3, -3.25);
    this.stageGroup.add(backWall);

    // Classic School/Atelier Chalkboard Centered on Back Wall
    const board = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.55, 1.58, 0.08)), chalkboardMat);
    board.position.set(0, floorY + 2.05, -3.1);
    this.stageGroup.add(board);

    // Industrial Pressure-Gauge Pipe Rig Panel on Back-Left
    const pipeWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.75, 1.95, 0.14)), pipesMat);
    pipeWall.position.set(-2.55, floorY + 1.55, -3.08);
    this.stageGroup.add(pipeWall);

    // Hexagonal Forged Iron Mesh Partition on Back-Right
    const meshWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.85, 2.25, 0.12)), hexMeshMat);
    meshWall.position.set(2.55, floorY + 1.55, -3.08);
    this.stageGroup.add(meshWall);

    // Left Terracotta Louver Sun-Screen Wall + Right Daylight Sky Glass Skylight Wall
    const leftWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.22, 4.6, 8.0)), louverMat);
    leftWall.position.set(-4.0, floorY + 2.3, 0.2);
    this.stageGroup.add(leftWall);

    const rightWall = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.22, 4.6, 8.0)), skyGlassMat);
    rightWall.position.set(4.0, floorY + 2.3, 0.2);
    this.stageGroup.add(rightWall);

    // Structural Weathered Corten I-Beams
    for (const ix of [-1.5, 1.5, -3.7, 3.7]) {
      const col = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.24, 4.6, 0.26)), cortenMat);
      col.position.set(ix, floorY + 2.3, -3.05);
      this.stageGroup.add(col);
    }
  }

  /**
   * Update 3D physical victory stones placed in the tabletop scoreboard trays.
   * Returns true if a brand-new stone was dropped (used to trigger stone-bounce Foley!).
   */
  public setScores(playerWins: number, npcWins: number): boolean {
    const pCount = Math.min(this.playerTokens.length, playerWins);
    const nCount = Math.min(this.npcTokens.length, npcWins);
    let freshlyDropped = false;

    for (let i = 0; i < this.playerTokens.length; i++) {
      const active = i < pCount;
      if (active && !this.playerTokens[i].visible) {
        this.playerTokens[i].visible = true;
        this.playerTokens[i].position.y = 0.34;
        this.playerTokenVelY[i] = -0.35;
        freshlyDropped = true;
      }
      if (!active) {
        this.playerTokens[i].visible = false;
        this.playerTokenVelY[i] = 0;
      }
      this.playerTokenYTargets[i] = active ? 0.033 : -0.05;
    }

    for (let i = 0; i < this.npcTokens.length; i++) {
      const active = i < nCount;
      if (active && !this.npcTokens[i].visible) {
        this.npcTokens[i].visible = true;
        this.npcTokens[i].position.y = 0.34;
        this.npcTokenVelY[i] = -0.35;
        freshlyDropped = true;
      }
      if (!active) {
        this.npcTokens[i].visible = false;
        this.npcTokenVelY[i] = 0;
      }
      this.npcTokenYTargets[i] = active ? 0.033 : -0.05;
    }

    return freshlyDropped;
  }

  /**
   * Drive the mechanical JNV1.0 tabletop clockwork gears & pointer from real JNV telemetry.
   */
  public syncJNVClockwork(confidence: number, volatility: number, pulse = false): void {
    this.clockworkTargetAngle = (confidence - 0.5) * Math.PI * 1.4;
    this.clockworkSpinSpeed = 0.35 + volatility * 1.65 + (pulse ? 4.8 : 0);
  }

  /**
   * Update Shadow Flame Analytic Contact-AO plane, water ripples, clockwork gears, and ballistic bouncing stones.
   */
  public update(
    dt: number,
    leftHandWorld: THREE.Vector3,
    rightHandWorld: THREE.Vector3,
    shadowMode: ShadowFlameMode
  ): void {
    const safeDt = Math.min(dt, 0.05);

    // Update Shadow Flame analytic tabletop contact grounding shader
    this.contactAoMat.uniforms.uLeftHand.value.copy(leftHandWorld);
    this.contactAoMat.uniforms.uRightHand.value.copy(rightHandWorld);
    this.contactAoMat.uniforms.uStrength.value =
      shadowMode === 'pro' ? 0.92 : shadowMode === 'flash' ? 0.84 : 0.35;

    // Smooth mechanical brass clockwork escapement rotation
    this.clockworkSpinSpeed = THREE.MathUtils.lerp(this.clockworkSpinSpeed, 0.45, 1 - Math.exp(-3.0 * safeDt));
    this.clockworkGearOuter.rotation.y += this.clockworkSpinSpeed * safeDt;
    this.clockworkGearInner.rotation.y -= this.clockworkSpinSpeed * 1.65 * safeDt;
    this.clockworkNeedle.rotation.y = THREE.MathUtils.lerp(
      this.clockworkNeedle.rotation.y,
      this.clockworkTargetAngle,
      1 - Math.exp(-6.5 * safeDt)
    );

    // Ballistic gravity + elastic bounce for physical Go-stone victory counters!
    const stepStone = (
      mesh: THREE.Mesh,
      velArr: number[],
      targetY: number,
      idx: number,
      side: 'player' | 'npc'
    ) => {
      if (!mesh.visible) return;
      if (mesh.position.y > targetY + 0.0005 || Math.abs(velArr[idx]) > 0.01) {
        velArr[idx] -= 7.2 * safeDt;
        mesh.position.y += velArr[idx] * safeDt;
        if (mesh.position.y <= targetY) {
          mesh.position.y = targetY;
          const impactSpeed = Math.abs(velArr[idx]);
          if (impactSpeed > 0.16 && this.onStoneBounce) {
            const wp = new THREE.Vector3();
            mesh.getWorldPosition(wp);
            this.onStoneBounce(side, Math.min(1.25, impactSpeed / 2.2), { x: wp.x, y: wp.y, z: wp.z });
          }
          if (impactSpeed > 0.24) {
            velArr[idx] = impactSpeed * 0.42; // Crisp ceramic/bronze bounce!
          } else {
            velArr[idx] = 0;
          }
        }
      }
    };

    for (let i = 0; i < this.playerTokens.length; i++) {
      stepStone(this.playerTokens[i], this.playerTokenVelY, this.playerTokenYTargets[i], i, 'player');
      stepStone(this.npcTokens[i], this.npcTokenVelY, this.npcTokenYTargets[i], i, 'npc');
    }

    // Subtle organic water surface drift on Koi Pond / Onsen caustics
    for (const tex of this.animatedWaterMaps) {
      tex.offset.x = (tex.offset.x + safeDt * 0.014) % 1;
      tex.offset.y = (tex.offset.y + safeDt * 0.009) % 1;
    }
  }

  public dispose(): void {
    this.clearStage();
    this.contactAoMat.dispose();
  }
}
