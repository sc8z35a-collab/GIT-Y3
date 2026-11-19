/**
 * ★ Master Three.js WebGL2 3D Engine & AAA Choreography Orchestrator — JANKEN · 極 ★
 *
 * Unifies:
 *  - Shadow Flame 1.0 Flash / Pro (patched before shader compilation)
 *  - KHDR (Kinetic Dual-Lobe Spectral HDR) 16-bit HalfFloat pipeline + SF-SSCS
 *  - True selectable internal resolutions (HD / FHD / 1.5K / 2K)
 *  - Real precision FPS pacing (60 / 120 / Unlimited) + live FPS & 1% Low telemetry
 *  - Dual 21-Bone Spring-Physics Sculpted Hands with Deterministic Timeline Choreography:
 *      · Opening & stage-switch crane-in entrance ceremony
 *      · Multi-beat rhythmic Jan-Ken-Pon anticipation (`じゃん` → `けん` → apex suspend → `ぽん！`)
 *      · Fighting-game / Cinema Hit-Stop Time Dilation (`0.12×` slow-mo freeze-frame at clash!)
 *      · Move-specific victory signatures:
 *          - ROCK beats SCISSORS: Heavy downward pronation hammer-crush & recoil knockback
 *          - SCISSORS beats PAPER: Crisp forward lunge + animated twin-blade double-snip
 *          - PAPER beats ROCK: Majestic sweeping enveloping crown arc pressing Rock downward
 *          - DRAW: Mirrored center standoff rebound + heightened tension coil
 *          - MATCH VICTORY: Ceremonial hand salute + hammered gold-leaf rain shower + hero orbit!
 *      · Dynamic physical warm-sunlight glint pulse on clash impact (strictly zero neon!)
 */

import * as THREE from 'three';
import { SoundEngine } from '../audio/SoundEngine';
import { Move, PAPER, PlayerOutcome, ROCK, SCISSORS } from '../engine/jnv1/types';
import {
  DEFAULT_GRAPHICS_SETTINGS,
  FpsLimitMode,
  GraphicsSettings,
  HandMaterialPreset,
  JHandModeSetting,
  JSoundModeSetting,
  RenderMetrics,
  ResolutionPresetId,
  SHADOW_FLAME_SPECS,
  ShadowFlameMode,
  StageId,
  computeRenderDimensions,
} from '../graphics/GraphicsConfig';
import { HDRIEnvironmentBuilder } from '../graphics/HDRIEnvironment';
import { KHDRPipeline } from '../graphics/KHDRPipeline';
import { applyShadowFlameToLights, installShadowFlameEngine } from '../graphics/ShadowFlame';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';
import { AtmosphereEffects } from './AtmosphereEffects';
import { CameraDirector } from './CameraDirector';
import { SculptedHandRig } from './HandRig';
import { StageBuilder } from './StageBuilder';

export interface ClashAnimationCallbacks {
  onBeat?: (label: string, beatIndex: 1 | 2 | 3) => void;
  onReveal?: () => void;
  onVerdict?: () => void;
  onFinished?: () => void;
}

interface TimelineCue {
  atSec: number;
  fired: boolean;
  action: () => void;
}

export class GameScene {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();

  private readonly textures: TextureAtlasLoader;
  private readonly hdriBuilder: HDRIEnvironmentBuilder;
  private readonly khdr: KHDRPipeline;
  private readonly cameraDirector: CameraDirector;
  private readonly stageBuilder: StageBuilder;
  private readonly atmosphere: AtmosphereEffects;
  private readonly sound: SoundEngine;

  // Primary & Architectural Lighting Rig
  private readonly sunLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunWorldDir = new THREE.Vector3(0.6, 0.7, -0.4).normalize();
  private baseSunIntensity = 3.25;
  private baseExposure = 0.92;
  private lightImpactPulse = 0;

  // Dual 27-DOF JHand Kinesis 1.0 Sculptural Hands
  private readonly playerHand: SculptedHandRig;
  private readonly npcHand: SculptedHandRig;
  private readonly tmpLeftPalm = new THREE.Vector3();
  private readonly tmpRightPalm = new THREE.Vector3();
  private readonly tmpCamForward = new THREE.Vector3();

  private settings: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };
  private currentShadowMapSize = 2048;

  // Frame loop, FPS limiter & performance telemetry
  private rafId = 0;
  private running = false;
  private lastRenderTimestamp = 0;
  private lastLogicTimestamp = 0;
  private elapsedSec = 0;
  private frameTimesMs: number[] = [];
  private lastMetricsEmit = 0;
  private onMetrics?: (m: RenderMetrics) => void;

  // Deterministic Delta-Time Choreography Timeline + Cinema Hit-Stop Time Dilation
  private timelineCues: TimelineCue[] = [];
  private timelineClock = 0;
  private timelineActive = false;
  private isAnimatingRound = false;
  private hitStopRemaining = 0;
  private hitStopScale = 0.14;

  private unbindCameraEvents: () => void;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    sound: SoundEngine,
    onMetrics?: (m: RenderMetrics) => void
  ) {
    this.container = container;
    this.sound = sound;
    this.onMetrics = onMetrics;

    // ★ Install Shadow Flame 1.0 GLSL engine BEFORE creating renderer or any PBR material ★
    installShadowFlameEngine();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'webgl-viewport';
    this.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    const rect = this.container.getBoundingClientRect();
    const initW = Math.max(320, rect.width || window.innerWidth);
    const initH = Math.max(240, rect.height || window.innerHeight);

    const maxTex = this.renderer.capabilities.maxTextureSize || 4096;
    const renderDim = computeRenderDimensions(this.settings.resolution, initW, initH, maxTex);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(renderDim.width, renderDim.height, false);

    this.textures = new TextureAtlasLoader(this.renderer);
    this.hdriBuilder = new HDRIEnvironmentBuilder(this.renderer);
    this.khdr = new KHDRPipeline(this.renderer, renderDim.width, renderDim.height);
    this.cameraDirector = new CameraDirector(initW / initH);
    this.unbindCameraEvents = this.cameraDirector.bindCanvasEvents(this.canvas);

    // Physical Architectural Sunlight + Sky Bounce + Secondary Rim Shadow Rig
    this.sunLight = new THREE.DirectionalLight(0xffe4bc, 3.25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.near = 0.8;
    this.sunLight.shadow.camera.far = 16.5;
    const frustum = 3.2;
    this.sunLight.shadow.camera.left = -frustum;
    this.sunLight.shadow.camera.right = frustum;
    this.sunLight.shadow.camera.top = frustum;
    this.sunLight.shadow.camera.bottom = -frustum;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0xbcd4f2, 0.72);
    this.rimLight.position.set(-4.2, 3.4, 2.8);
    this.rimLight.shadow.camera.near = 1.0;
    this.rimLight.shadow.camera.far = 14.0;
    this.rimLight.shadow.camera.left = -2.8;
    this.rimLight.shadow.camera.right = 2.8;
    this.rimLight.shadow.camera.top = 2.8;
    this.rimLight.shadow.camera.bottom = -2.8;
    this.scene.add(this.rimLight);

    this.hemiLight = new THREE.HemisphereLight(0xdbe8f8, 0x73593f, 0.82);
    this.scene.add(this.hemiLight);

    // Stage Builder + Persistent Diegetic Props + Real-Time Go-Stone Acoustic Bounce!
    this.stageBuilder = new StageBuilder(this.textures);
    this.stageBuilder.onStoneBounce = (side, velocity, pos) => {
      this.sound.playGoStoneImpact(side, velocity, pos);
    };
    this.scene.add(this.stageBuilder.stageGroup);
    this.scene.add(this.stageBuilder.propsGroup);

    // Atmosphere & Physical Shockwave + Move-Signature Flakes
    this.atmosphere = new AtmosphereEffects();
    this.scene.add(this.atmosphere.group);

    // Dual 27-DOF JHand Kinesis 1.0 Sculpted Hands positioned cleanly over the central brass medallion
    this.playerHand = new SculptedHandRig(this.textures, this.settings.playerHandMaterial, true);
    this.playerHand.root.position.set(-0.66, 0.25, 0.22);
    this.playerHand.root.rotation.set(0.08, Math.PI * 0.45, 0.0);
    this.playerHand.onFoley = (ev, wp) => {
      this.sound.playHandFoley(ev, 'player', { x: wp.x, y: wp.y, z: wp.z });
    };
    this.scene.add(this.playerHand.root);

    this.npcHand = new SculptedHandRig(this.textures, this.settings.npcHandMaterial, false);
    this.npcHand.root.position.set(0.66, 0.25, 0.08);
    this.npcHand.root.rotation.set(0.08, -Math.PI * 0.45, 0.0);
    this.npcHand.onFoley = (ev, wp) => {
      this.sound.playHandFoley(ev, 'npc', { x: wp.x, y: wp.y, z: wp.z });
    };
    this.scene.add(this.npcHand.root);

    // Apply initial stage, KHDR, Shadow Flame, JHand Kinesis, and JSound Engin 1.0 settings!
    this.sound.setHandMaterials(this.settings.playerHandMaterial, this.settings.npcHandMaterial);
    this.sound.setQualityMode(this.settings.jsoundQuality);
    this.sound.setAmbienceEnabled(this.settings.jsoundAmbience);
    this.playerHand.setKinesisMode(this.settings.jhandMode);
    this.npcHand.setKinesisMode(this.settings.jhandMode);

    this.applyStage(this.settings.stage, false);
    this.applyShadowFlame(this.settings.shadowFlame);
    this.applyKHDR(this.settings.khdrEnabled, this.settings.khdrSplitCompare);
    this.triggerOpeningEntrance();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  public getSettings(): GraphicsSettings {
    return { ...this.settings };
  }

  public setResolution(preset: ResolutionPresetId): void {
    this.settings.resolution = preset;
    this.handleResize();
  }

  public setFpsLimit(fps: FpsLimitMode): void {
    this.settings.fpsLimit = fps;
  }

  public applyKHDR(enabled: boolean, splitCompare = this.settings.khdrSplitCompare): void {
    this.settings.khdrEnabled = enabled;
    this.settings.khdrSplitCompare = splitCompare;
    this.khdr.khdrEnabled = enabled;
    this.khdr.splitCompare = splitCompare;
  }

  public setKhdrSplitX(normX: number): void {
    this.khdr.splitX = THREE.MathUtils.clamp(normX, 0.05, 0.95);
  }

  public applyShadowFlame(mode: ShadowFlameMode): void {
    this.settings.shadowFlame = mode;
    this.currentShadowMapSize = applyShadowFlameToLights(mode, this.sunLight, this.rimLight);
    this.khdr.enableSSCS = SHADOW_FLAME_SPECS[mode].enableSSCS;
  }

  public setJHandMode(mode: JHandModeSetting): void {
    this.settings.jhandMode = mode;
    this.playerHand.setKinesisMode(mode);
    this.npcHand.setKinesisMode(mode);
  }

  public setJSoundQuality(quality: JSoundModeSetting): void {
    this.settings.jsoundQuality = quality;
    this.sound.setQualityMode(quality);
  }

  public setJSoundAmbience(enabled: boolean): void {
    this.settings.jsoundAmbience = enabled;
    this.sound.setAmbienceEnabled(enabled);
  }

  public applyStage(stageId: StageId, withRevealSweep = true): void {
    this.settings.stage = stageId;
    const def = this.stageBuilder.buildStage(stageId);
    // Morph JSound Engin 1.0 architectural Convolution IR + living stage ambience!
    this.sound.setStage(stageId);

    this.scene.environment = this.hdriBuilder.getEnvironment(stageId);
    this.scene.background = new THREE.Color(def.backgroundColor);
    this.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);

    this.sunLight.position.set(...def.sunDirection);
    this.sunLight.color.setHex(def.sunColor);
    this.baseSunIntensity = def.sunIntensity;
    this.sunLight.intensity = def.sunIntensity;
    this.sunLight.target.position.set(0, 0.1, 0);
    this.sunWorldDir.copy(this.sunLight.position).normalize();

    this.rimLight.color.setHex(def.fillColor);
    this.rimLight.intensity = def.fillIntensity;

    this.hemiLight.color.setHex(def.hemiSky);
    this.hemiLight.groundColor.setHex(def.hemiGround);
    this.hemiLight.intensity = def.hemiIntensity;

    this.baseExposure = def.exposure;
    this.khdr.exposure = def.exposure;
    this.atmosphere.setStageMood(stageId);

    if (withRevealSweep) {
      this.cameraDirector.triggerStageReveal();
      this.triggerOpeningEntrance();
      this.sound.playStageTransition(stageId);
    }
  }

  private triggerOpeningEntrance(): void {
    this.playerHand.setTargetPose('ready', false, true);
    this.npcHand.setTargetPose('ready', false, true);
    this.playerHand.triggerEntranceSlide(-0.55);
    this.npcHand.triggerEntranceSlide(0.55);
  }

  public setHandMaterials(playerMat: HandMaterialPreset, npcMat: HandMaterialPreset): void {
    const playerChanged = playerMat !== this.settings.playerHandMaterial;
    const npcChanged = npcMat !== this.settings.npcHandMaterial;
    this.settings.playerHandMaterial = playerMat;
    this.settings.npcHandMaterial = npcMat;
    this.playerHand.setMaterialPreset(playerMat);
    this.npcHand.setMaterialPreset(npcMat);
    // Sync JSound Engin 1.1 coupled material & sleeve-textile acoustics immediately!
    this.sound.setHandMaterials(playerMat, npcMat);
    if (playerChanged) {
      this.sound.playMaterialPreview(playerMat, 'player');
    } else if (npcChanged) {
      this.sound.playMaterialPreview(npcMat, 'npc');
    }
    // Subtle flourish turn to showcase freshly swapped craft material!
    this.playerHand.addMotionImpulse(0, 0.45, 0, -0.8, 1.4);
    this.npcHand.addMotionImpulse(0, 0.45, 0, -0.8, -1.4);
  }

  public setTableScores(playerWins: number, npcWins: number): void {
    // StageBuilder ballistic Go-stones automatically stream every physical bounce into JSound Engin 1.1!
    this.stageBuilder.setScores(playerWins, npcWins);
  }

  public syncJNVClockwork(confidence: number, volatility: number, pulse = false): void {
    this.stageBuilder.syncJNVClockwork(confidence, volatility, pulse);
    if (pulse) {
      this.npcHand.triggerThoughtTell();
    }
  }

  public resetHandsToReady(): void {
    this.clearTimeline();
    this.isAnimatingRound = false;
    this.hitStopRemaining = 0;

    this.playerHand.setMotionDynamics(145, 18);
    this.npcHand.setMotionDynamics(145, 18);
    this.playerHand.setTargetPose('ready', false, true);
    this.npcHand.setTargetPose('ready', false, true);
    this.playerHand.targetOffset.set(0, 0, 0);
    this.npcHand.targetOffset.set(0, 0, 0);
    this.playerHand.targetExtraPitch = 0;
    this.npcHand.targetExtraPitch = 0;
    this.playerHand.targetExtraYaw = 0;
    this.npcHand.targetExtraYaw = 0;
    this.playerHand.targetExtraRoll = 0;
    this.npcHand.targetExtraRoll = 0;
    this.cameraDirector.setMood('idle');
  }

  /**
   * Rich tactile hover anticipation on the Player's 3D hand + JSound 1.1 preview cue!
   */
  public previewHoverMove(move: Move | null): void {
    if (this.isAnimatingRound) return;
    if (move === null) {
      this.playerHand.setMotionDynamics(155, 18);
      this.playerHand.setTargetPose('ready', false, true, false);
      this.playerHand.targetOffset.set(0, 0, 0);
      this.playerHand.targetExtraPitch = 0;
      this.playerHand.targetExtraRoll = 0;
    } else {
      this.playerHand.setMotionDynamics(220, 20);
      this.playerHand.setTargetPose(move, false, true, true);
      this.playerHand.targetOffset.set(0.055, 0.048, 0.015);
      this.playerHand.targetExtraPitch = -0.09;
      this.playerHand.targetExtraRoll = move === SCISSORS ? 0.12 : move === PAPER ? -0.1 : 0.04;
      this.sound.playHoverPreview(move);
    }
  }

  /**
   * Ceremonial Match Victory / Defeat Finale Animation!
   */
  public triggerMatchFinale(playerWon: boolean): void {
    this.sound.playMatchVictoryChord(playerWon);
    if (playerWon) {
      this.cameraDirector.setMood('match_victory');
      this.atmosphere.triggerVictoryShower(3.4);
      this.playerHand.setMotionDynamics(130, 16);
      this.playerHand.setTargetPose('salute', false, true);
      this.playerHand.targetOffset.set(0.24, 0.22, 0.04);
      this.playerHand.targetExtraPitch = -0.18;
      this.playerHand.targetExtraRoll = -0.18;

      this.npcHand.setMotionDynamics(110, 17);
      this.npcHand.setTargetPose('bow', false, true);
      this.npcHand.targetOffset.set(0.14, -0.09, -0.05);
      this.npcHand.targetExtraPitch = 0.28;
    } else {
      this.cameraDirector.setMood('match_defeat');
      this.npcHand.setMotionDynamics(130, 16);
      this.npcHand.setTargetPose('salute', false, true);
      this.npcHand.targetOffset.set(-0.24, 0.22, -0.04);
      this.npcHand.targetExtraPitch = -0.18;
      this.npcHand.targetExtraRoll = 0.18;

      this.playerHand.setMotionDynamics(110, 17);
      this.playerHand.setTargetPose('bow', false, true);
      this.playerHand.targetOffset.set(-0.14, -0.09, 0.05);
      this.playerHand.targetExtraPitch = 0.28;
    }
  }

  /**
   * Execute AAA Deterministic-Timeline 3D "Jan-Ken-Pon!" Choreography with:
   *  - Multi-beat windup & apex hang-time
   *  - Cinema Hit-Stop Time Dilation (`0.13×`) at clash reveal
   *  - Move-Specific Victory Signatures (Rock Crush / Scissors Double-Snip / Paper Envelop)
   *  - Dynamic physical sunlight glint pulse & tabletop air-shockwave
   */
  public playClashSequence(
    playerMove: Move,
    npcMove: Move,
    outcome: PlayerOutcome,
    isAikoFollowup: boolean,
    isMatchDecidingPoint: boolean,
    callbacks: ClashAnimationCallbacks = {}
  ): void {
    this.clearTimeline();
    this.isAnimatingRound = true;
    this.timelineActive = true;
    this.timelineClock = 0;

    const addCue = (atSec: number, action: () => void) => {
      this.timelineCues.push({ atSec, fired: false, action });
    };

    const beat1Label = isAikoFollowup ? 'あいこで' : 'じゃーん';
    const beat2Label = 'けーん';
    const beat3Label = isAikoFollowup ? 'しょっ！' : 'ぽん！';

    // === BEAT 1 (t = 0.00s): Explosive Windup Coil & First Pump ===
    addCue(0.0, () => {
      this.cameraDirector.setMood('windup');
      this.playerHand.setMotionDynamics(280, 21);
      this.npcHand.setMotionDynamics(280, 21);
      this.playerHand.setTargetPose('windup', true, true);
      this.npcHand.setTargetPose('windup', true, true);

      this.playerHand.targetOffset.set(-0.11, 0.24, 0.02);
      this.npcHand.targetOffset.set(0.11, 0.24, -0.02);
      this.playerHand.targetExtraPitch = -0.32;
      this.npcHand.targetExtraPitch = -0.32;
      this.playerHand.targetExtraRoll = -0.14;
      this.npcHand.targetExtraRoll = 0.14;
      this.playerHand.addMotionImpulse(-0.35, 1.35, 0, -1.5, 0);
      this.npcHand.addMotionImpulse(0.35, 1.35, 0, -1.5, 0);

      this.stageBuilder.syncJNVClockwork(0.85, 0.9, true);
      this.sound.playBeat(1, isMatchDecidingPoint, isAikoFollowup);
      callbacks.onBeat?.(beat1Label, 1);
    });

    if (!isAikoFollowup) {
      // === MID DIP (t = 0.18s): Heavy kinetic trough downward ===
      addCue(0.18, () => {
        this.playerHand.targetOffset.set(-0.04, -0.03, 0.01);
        this.npcHand.targetOffset.set(0.04, -0.03, -0.01);
        this.playerHand.targetExtraPitch = 0.18;
        this.npcHand.targetExtraPitch = 0.18;
        this.playerHand.addMotionImpulse(0.15, -1.45, 0, 1.8, 0);
        this.npcHand.addMotionImpulse(-0.15, -1.45, 0, 1.8, 0);
      });

      // === BEAT 2 (t = 0.33s): Higher Coiled Apex + Breath-Hold Tension ===
      addCue(0.33, () => {
        this.cameraDirector.setMood('apex');
        this.playerHand.targetOffset.set(-0.15, 0.32, 0.02);
        this.npcHand.targetOffset.set(0.15, 0.32, -0.02);
        this.playerHand.targetExtraPitch = -0.4;
        this.npcHand.targetExtraPitch = -0.4;
        this.playerHand.targetExtraRoll = -0.22;
        this.npcHand.targetExtraRoll = 0.22;
        this.playerHand.addMotionImpulse(-0.55, 1.75, 0, -2.0, 0);
        this.npcHand.addMotionImpulse(0.55, 1.75, 0, -2.0, 0);

        this.sound.playBeat(2, isMatchDecidingPoint, isAikoFollowup);
        callbacks.onBeat?.(beat2Label, 2);
      });

      // === PRE-STRIKE WHIP RELEASE (t = 0.54s): Dual Craft-Sleeve Strouhal Whoosh right before impact ===
      addCue(0.54, () => {
        this.sound.playWhoosh(1.25, 1.24, { x: -0.24, y: 0.34, z: 0.12 }, 'player');
        this.sound.playWhoosh(1.18, 1.2, { x: 0.24, y: 0.34, z: 0.12 }, 'npc');
      });
    } else {
      addCue(0.22, () => {
        this.cameraDirector.setMood('apex');
        this.sound.playWhoosh(1.22, 1.34, { x: -0.22, y: 0.34, z: 0.12 }, 'player');
        this.sound.playWhoosh(1.16, 1.3, { x: 0.22, y: 0.34, z: 0.12 }, 'npc');
      });
    }

    const revealAt = isAikoFollowup ? 0.32 : 0.61;
    const winnerMove = outcome === 'LOSS' ? npcMove : playerMove;

    // === BEAT 3 (PON!!): Explosive Forward Lunge + 38-DOF Articulation + Hit-Stop + VFX ===
    addCue(revealAt, () => {
      this.cameraDirector.setMood('clash');
      const dirX = outcome === 'WIN' ? 1 : outcome === 'LOSS' ? -1 : 0;
      this.cameraDirector.triggerImpactImpulse(
        isMatchDecidingPoint ? 0.052 : outcome === 'DRAW' ? 0.026 : 0.04,
        dirX,
        -0.75
      );

      // Subtle warm sunlight specular glint pulse (purely physical, zero neon!)
      this.lightImpactPulse = isMatchDecidingPoint ? 1.0 : 0.72;

      // High-stiffness whip-crack springs for explosive impact!
      this.playerHand.setMotionDynamics(420, 23);
      this.npcHand.setMotionDynamics(420, 23);
      this.playerHand.setTargetPose(playerMove, true, true);
      this.npcHand.setTargetPose(npcMove, true, true);

      this.sound.playClashImpact(outcome, winnerMove, isMatchDecidingPoint);
      this.atmosphere.emitClashBurst(outcome, winnerMove, new THREE.Vector3(0, 0.3, 0.08));

      // Trigger Cinema Hit-Stop Time Dilation (brief dramatic slow-mo freeze-frame right on impact!)
      this.hitStopRemaining = isMatchDecidingPoint ? 0.21 : outcome === 'DRAW' ? 0.075 : 0.115;
      this.hitStopScale = isMatchDecidingPoint ? 0.14 : 0.16;

      // Apply Move-Specific Clash Collision Geometry!
      if (outcome === 'WIN') {
        this.applyWinClashPose(this.playerHand, this.npcHand, playerMove, 1);
      } else if (outcome === 'LOSS') {
        this.applyWinClashPose(this.npcHand, this.playerHand, npcMove, -1);
      } else {
        // DRAW: Perfectly mirrored dead-center clash rebound!
        this.playerHand.targetOffset.set(0.14, 0.02, 0.02);
        this.npcHand.targetOffset.set(-0.14, 0.02, -0.02);
        this.playerHand.targetExtraPitch = 0.04;
        this.npcHand.targetExtraPitch = 0.04;
        this.playerHand.targetExtraRoll = 0.0;
        this.npcHand.targetExtraRoll = 0.0;
        this.playerHand.triggerRecoil(0.68, 1);
        this.npcHand.triggerRecoil(0.68, -1);
      }

      callbacks.onBeat?.(beat3Label, 3);
      callbacks.onReveal?.();
    });

    // === MOVE-SPECIFIC SIGNATURE FOLLOW-THROUGH (t = revealAt + 0.26s) ===
    addCue(revealAt + 0.26, () => {
      if (outcome === 'WIN') {
        this.cameraDirector.setMood('victory');
        this.applyVictoryFlourish(this.playerHand, this.npcHand, playerMove, 1);
      } else if (outcome === 'LOSS') {
        this.cameraDirector.setMood('defeat');
        this.applyVictoryFlourish(this.npcHand, this.playerHand, npcMove, -1);
      } else {
        // DRAW tension coil ready for immediate "あいこで…しょ！"
        this.playerHand.setMotionDynamics(200, 19);
        this.npcHand.setMotionDynamics(200, 19);
        this.playerHand.targetOffset.set(0.06, 0.06, 0.01);
        this.npcHand.targetOffset.set(-0.06, 0.06, -0.01);
      }
      callbacks.onVerdict?.();
    });

    // === UNLOCK NEXT ROUND (t = revealAt + 0.62s) ===
    addCue(revealAt + 0.62, () => {
      this.isAnimatingRound = false;
      this.timelineActive = false;
      callbacks.onFinished?.();
    });
  }

  /**
   * Move-specific instant collision posture at exact PON!! moment.
   * `dir = +1` when Player (left) wins rightward; `dir = -1` when NPC (right) wins leftward.
   */
  private applyWinClashPose(
    winner: SculptedHandRig,
    loser: SculptedHandRig,
    winMove: Move,
    dir: 1 | -1
  ): void {
    if (winMove === ROCK) {
      // ROCK CRUSH: Heavy downward pronation hammer-slam!
      winner.targetOffset.set(0.24 * dir, -0.01, 0.02 * dir);
      winner.targetExtraPitch = 0.14;
      winner.targetExtraRoll = 0.22 * dir;
      winner.addMotionImpulse(2.1 * dir, -1.65, 0, 2.2, 1.8 * dir);

      loser.targetOffset.set(0.08 * dir, -0.04, -0.05 * dir);
      loser.targetExtraPitch = -0.26;
      loser.triggerRecoil(1.25, -dir);
    } else if (winMove === SCISSORS) {
      // SCISSORS SLASH: Razor-crisp forward lunge & diagonal blade slice!
      winner.targetOffset.set(0.25 * dir, 0.04, 0.03 * dir);
      winner.targetExtraPitch = 0.04;
      winner.targetExtraYaw = 0.14 * dir;
      winner.targetExtraRoll = -0.1 * dir;
      winner.addMotionImpulse(2.35 * dir, 0.35, 0.25 * dir, 0.8, -2.4 * dir);

      loser.targetOffset.set(0.1 * dir, -0.03, -0.04 * dir);
      loser.targetExtraPitch = -0.22;
      loser.triggerRecoil(1.1, -dir);
    } else {
      // PAPER ENVELOP: Majestic sweeping rise arcing over the opponent's Rock fist!
      winner.targetOffset.set(0.23 * dir, 0.14, 0.02 * dir);
      winner.targetExtraPitch = 0.1;
      winner.targetExtraRoll = -0.12 * dir;
      winner.addMotionImpulse(1.9 * dir, 1.15, 0, -0.9, -1.2 * dir);

      loser.targetOffset.set(0.04 * dir, -0.07, -0.03 * dir);
      loser.targetExtraPitch = 0.16;
      loser.triggerRecoil(0.95, -dir);
    }
  }

  /**
   * Signature post-hit-stop triumph flourish for Rock, Scissors, and Paper!
   */
  private applyVictoryFlourish(
    winner: SculptedHandRig,
    loser: SculptedHandRig,
    winMove: Move,
    dir: 1 | -1
  ): void {
    winner.setMotionDynamics(185, 19);
    loser.setMotionDynamics(145, 18);

    if (winMove === SCISSORS) {
      // Twin-blade double-snip flourish!!
      winner.targetOffset.set(0.22 * dir, 0.1, 0.02 * dir);
      winner.targetExtraPitch = -0.08;
      winner.targetExtraYaw = 0.12 * dir;
      winner.triggerScissorsSnip();
      // Synchronized physical blade shear is streamed directly from JHand Kinesis 1.0 -> JSound Engin 1.0
    } else if (winMove === PAPER) {
      // Regal enveloping crown descent over the defeated fist!
      winner.setTargetPose('envelop', false, true);
      winner.targetOffset.set(0.26 * dir, 0.08, 0.01 * dir);
      winner.targetExtraPitch = 0.16;
      loser.targetOffset.set(0.02 * dir, -0.08, -0.02 * dir);
    } else {
      // ROCK triumphant rise with authoritative poise
      winner.targetOffset.set(0.2 * dir, 0.11, 0.02 * dir);
      winner.targetExtraPitch = -0.14;
      winner.targetExtraRoll = 0.06 * dir;
    }
  }

  private clearTimeline(): void {
    this.timelineCues.length = 0;
    this.timelineActive = false;
    this.timelineClock = 0;
  }

  public handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const viewW = Math.max(320, rect.width || window.innerWidth);
    const viewH = Math.max(240, rect.height || window.innerHeight);

    const maxTex = this.renderer.capabilities.maxTextureSize || 4096;
    const dim = computeRenderDimensions(this.settings.resolution, viewW, viewH, maxTex);

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(dim.width, dim.height, false);
    this.khdr.resize(dim.width, dim.height);
    this.cameraDirector.resize(viewW / viewH);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    this.lastRenderTimestamp = now;
    this.lastLogicTimestamp = now;
    this.lastMetricsEmit = now;

    const tick = (nowMs: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);

      // Precision FPS pacing for 60 FPS / 120 FPS (0 = Unlimited!)
      if (this.settings.fpsLimit > 0) {
        const minInterval = 1000 / this.settings.fpsLimit;
        if (nowMs - this.lastRenderTimestamp < minInterval - 0.7) {
          return;
        }
      }

      const frameMs = Math.max(0.1, nowMs - this.lastRenderTimestamp);
      this.lastRenderTimestamp = nowMs;

      const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastLogicTimestamp) / 1000));
      this.lastLogicTimestamp = nowMs;

      // Advance deterministic choreography timeline in real-time (not dilated so cues stay crisp)
      if (this.timelineActive) {
        this.timelineClock += rawDt;
        for (const cue of this.timelineCues) {
          if (!cue.fired && this.timelineClock >= cue.atSec) {
            cue.fired = true;
            cue.action();
          }
        }
      }

      // Compute cinema Hit-Stop time scale for 3D motion & particles!
      let simDt = rawDt;
      if (this.hitStopRemaining > 0) {
        this.hitStopRemaining = Math.max(0, this.hitStopRemaining - rawDt);
        simDt = rawDt * this.hitStopScale;
      }

      this.elapsedSec += simDt;

      // Smoothly decay physical warm-sunlight impact glint pulse (strictly zero neon!)
      if (this.lightImpactPulse > 0.001) {
        this.lightImpactPulse *= Math.exp(-5.5 * rawDt);
        this.sunLight.intensity = this.baseSunIntensity + this.lightImpactPulse * 0.65;
        this.khdr.exposure = this.baseExposure + this.lightImpactPulse * 0.075;
      } else if (this.sunLight.intensity !== this.baseSunIntensity) {
        this.sunLight.intensity = this.baseSunIntensity;
        this.khdr.exposure = this.baseExposure;
      }

      // Update 3D spring rigs, tabletop props, physical VFX, and cinema camera
      this.playerHand.update(simDt);
      this.npcHand.update(simDt);
      this.playerHand.getPalmWorldPosition(this.tmpLeftPalm);
      this.npcHand.getPalmWorldPosition(this.tmpRightPalm);

      this.stageBuilder.update(simDt, this.tmpLeftPalm, this.tmpRightPalm, this.settings.shadowFlame);
      this.atmosphere.update(simDt, this.settings.stage);
      this.cameraDirector.update(rawDt); // Camera glides smoothly even through hit-stop!

      // Sync 3D HRTF AudioListener pose in JSound Engin 1.0 with live Cinema Camera!
      this.cameraDirector.camera.getWorldDirection(this.tmpCamForward);
      const camPos = this.cameraDirector.camera.position;
      this.sound.setListenerPose(
        { x: camPos.x, y: camPos.y, z: camPos.z },
        { x: this.tmpCamForward.x, y: this.tmpCamForward.y, z: this.tmpCamForward.z }
      );

      // Reset WebGL draw stats & execute KHDR + Shadow Flame multi-pass render!
      this.renderer.info.reset();
      this.khdr.render(this.scene, this.cameraDirector.camera, this.sunWorldDir, this.elapsedSec);

      // Collect rolling performance telemetry
      this.frameTimesMs.push(frameMs);
      if (this.frameTimesMs.length > 120) this.frameTimesMs.shift();

      if (this.onMetrics && nowMs - this.lastMetricsEmit >= 240) {
        this.lastMetricsEmit = nowMs;
        const avgMs =
          this.frameTimesMs.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimesMs.length);
        const sorted = [...this.frameTimesMs].sort((a, b) => b - a);
        const p99Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.02))] || avgMs;
        const dim = this.khdr.getDimensions();
        const jhandT = this.playerHand.getKinesisTelemetry();
        const jsoundT = this.sound.getTelemetry();

        this.onMetrics({
          fps: Math.round(1000 / Math.max(0.5, avgMs)),
          frameTimeMs: Number(avgMs.toFixed(1)),
          onePercentLowFps: Math.round(1000 / Math.max(0.5, p99Ms)),
          renderWidth: dim.width,
          renderHeight: dim.height,
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          shadowMapSize: this.currentShadowMapSize,
          khdrActive: this.settings.khdrEnabled,
          shadowFlameMode: this.settings.shadowFlame,
          jhandDof: jhandT.activeDof,
          jhandPalmCupDeg: jhandT.palmCupDeg,
          jhandOrlRatio: jhandT.orlCouplingRatio,
          jhandIcrGlideMm: jhandT.icrGlideMm,
          jhandFdiPct: jhandT.fdiBulgePct,
          jhandSynergyJp: jhandT.synergyPhaseJp,
          jsoundRt60Sec: jsoundT.stageRt60Sec,
          jsoundEarlyRays: jsoundT.earlyRayCount,
          jsoundDspRateKhz: Math.round(jsoundT.internalDspRateHz / 1000),
          jsoundVoices: jsoundT.activeVoices,
          jsoundPeakDb: jsoundT.peakDb,
          jsoundMaterialPair: jsoundT.materialPairJp,
          jsoundLastEventJp: jsoundT.lastAcousticEventJp,
        });
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.clearTimeline();
    this.unbindCameraEvents();
    this.resizeObserver.disconnect();
    this.playerHand.dispose();
    this.npcHand.dispose();
    this.stageBuilder.dispose();
    this.atmosphere.dispose();
    this.khdr.dispose();
    this.hdriBuilder.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
