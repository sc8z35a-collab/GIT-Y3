/**
 * ★ Master Three.js WebGL2 3D Engine & AAA Choreography Orchestrator — JANKEN · 極 ★
 *
 * Unifies:
 *  - Shadow Flame 1.0 Flash / Pro (patched before shader compilation)
 *  - KHDR (Kinetic Dual-Lobe Spectral HDR) 16-bit HalfFloat pipeline + SF-SSCS
 *  - True selectable internal resolutions (HD / FHD / 1.5K / 2K) + 60 / 120 / Unlimited FPS
 *  - JHand Kinesis 1.1 (38-DOF, 18 Anatomical Poses, 9 Rotating Signature Clash Variants)
 *  - JSound Engin 1.2 (192kHz 4×OS, 18 Instruments, 32 Materials, 128-Ray 3D Spatial + Doppler)
 *  - Camera Director 2.0 (5 Camera Styles, 14 Moods, Bullet-Time 180° Orbit, Catmull-Rom Splines)
 *  - Built-In Cinema PV Director (3 Automated Trailers + Real-Time WebM Video/Audio Recorder + PNG Snapshot)
 */

import * as THREE from 'three';
import { AcousticProbeEngine, SoundEngine } from '../audio/SoundEngine';
import { AeroVortexEngine } from '../engine/aero/AeroVortexEngine';
import { BioPulseEngine, BioPulseMatchContext } from '../engine/biopulse/BioPulseEngine';
import { HandPoseKey } from '../engine/jhand/types';
import { Move, PAPER, PlayerOutcome, ROCK, SCISSORS } from '../engine/jnv1/types';
import {
  CameraStyleId,
  DEFAULT_GRAPHICS_SETTINGS,
  FpsLimitMode,
  GraphicsSettings,
  HandMaterialPreset,
  JHandModeSetting,
  JSoundModeSetting,
  JSoundSpatialMode,
  PVModeId,
  RenderMetrics,
  ResolutionPresetId,
  SHADOW_FLAME_SPECS,
  ShadowFlameMode,
  StageId,
  computeRenderDimensions,
} from '../graphics/GraphicsConfig';
import { HDRIEnvironmentBuilder } from '../graphics/HDRIEnvironment';
import { KHDRPipeline } from '../graphics/KHDRPipeline';
import { Photo5KResult, captureCurrentAngle5KPhoto } from '../graphics/PhotoCapture5K';
import { applyShadowFlameToLights, installShadowFlameEngine } from '../graphics/ShadowFlame';
import { TextureAtlasLoader } from '../graphics/TextureAtlasLoader';
import { AtmosphereEffects } from './AtmosphereEffects';
import { CameraDirector, CameraMood } from './CameraDirector';
import { SculptedHandRig } from './HandRig';
import { PVDirector, PVOverlayState } from './PVDirector';
import { STAGE_DEFINITIONS, StageBuilder } from './StageBuilder';

export interface ClashAnimationCallbacks {
  onBeat?: (label: string, beatIndex: 1 | 2 | 3) => void;
  onReveal?: () => void;
  onVerdict?: () => void;
  onFinished?: () => void;
  onCinemaBars?: (active: boolean) => void;
}

export interface ClashSequenceOptions {
  overdriveActive?: boolean;
  streakCount?: number;
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
  public readonly pvDirector: PVDirector;

  // ★ Project KIWAMI-NEXT Breakthrough Original Subsystems ★
  private readonly bioPulse = new BioPulseEngine(1);
  private readonly aeroVortex = new AeroVortexEngine();
  private readonly acousticProbe = new AcousticProbeEngine(DEFAULT_GRAPHICS_SETTINGS.stage);
  private bioMatchContext: BioPulseMatchContext = {
    playerScore: 0,
    npcScore: 0,
    targetWins: 3,
    aikoStreak: 0,
    overdriveActive: false,
    clenchLoad: 0.1,
    exertionPulse: 0,
  };
  private lastProbeEvalMs = 0;
  private lastWakeSpawnSec = 0;
  private isCapturing5K = false;

  // Primary & Architectural Lighting Rig
  private readonly sunLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunWorldDir = new THREE.Vector3(0.6, 0.7, -0.4).normalize();
  private baseSunIntensity = 3.25;
  private baseExposure = 0.92;
  private lightImpactPulse = 0;
  private overdriveSunBoost = 0;

  // Dual 38-DOF JHand Kinesis 1.1 Sculptural Hands
  private readonly playerHand: SculptedHandRig;
  private readonly npcHand: SculptedHandRig;
  private readonly tmpLeftPalm = new THREE.Vector3();
  private readonly tmpRightPalm = new THREE.Vector3();
  private readonly tmpVelLeft = new THREE.Vector3();
  private readonly tmpVelRight = new THREE.Vector3();
  private readonly tmpCamForward = new THREE.Vector3();

  private settings: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };
  private currentShadowMapSize = 2048;

  // Pre-PV restoration state
  private prePvStage: StageId = DEFAULT_GRAPHICS_SETTINGS.stage;
  private prePvPlayerMat: HandMaterialPreset = DEFAULT_GRAPHICS_SETTINGS.playerHandMaterial;
  private prePvNpcMat: HandMaterialPreset = DEFAULT_GRAPHICS_SETTINGS.npcHandMaterial;

  // Frame loop, FPS limiter & silky EMA delta-time jitter filter
  private rafId = 0;
  private running = false;
  private lastRenderTimestamp = 0;
  private lastLogicTimestamp = 0;
  private smoothedDt = 1 / 60;
  private elapsedSec = 0;
  private frameTimesMs: number[] = [];
  private lastMetricsEmit = 0;
  private onMetrics?: (m: RenderMetrics) => void;

  // Deterministic Delta-Time Choreography Timeline + Smooth Cinema Hit-Stop Time Dilation Ramp
  private timelineCues: TimelineCue[] = [];
  private timelineClock = 0;
  private timelineActive = false;
  private isAnimatingRound = false;
  private hitStopRemaining = 0;
  private hitStopDuration = 0.14;
  private hitStopScale = 0.14;
  private motionVariantCounter = 0;
  private idleGestureTimer = 5.5;
  private overdriveArmed = false;

  private unbindCameraEvents: () => void;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    sound: SoundEngine,
    onMetrics?: (m: RenderMetrics) => void,
    onPvState?: (st: PVOverlayState) => void
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

    // Dual 38-DOF JHand Kinesis 1.1 × FINGER S1.0 Sculpted Hands positioned cleanly over the central brass medallion
    this.playerHand = new SculptedHandRig(
      this.textures,
      this.settings.playerHandMaterial,
      true,
      this.settings.fingerS1Enabled
    );
    this.playerHand.root.position.set(-0.66, 0.25, 0.22);
    this.playerHand.root.rotation.set(0.08, Math.PI * 0.45, 0.0);
    this.playerHand.onFoley = (ev, wp) => {
      this.sound.playHandFoley(ev, 'player', { x: wp.x, y: wp.y, z: wp.z });
    };
    this.scene.add(this.playerHand.root);

    this.npcHand = new SculptedHandRig(
      this.textures,
      this.settings.npcHandMaterial,
      false,
      this.settings.fingerS1Enabled
    );
    this.npcHand.root.position.set(0.66, 0.25, 0.08);
    this.npcHand.root.rotation.set(0.08, -Math.PI * 0.45, 0.0);
    this.npcHand.onFoley = (ev, wp) => {
      this.sound.playHandFoley(ev, 'npc', { x: wp.x, y: wp.y, z: wp.z });
    };
    this.scene.add(this.npcHand.root);

    // Initialize Built-In PV Cinema Director & WebM Exporter!
    this.pvDirector = new PVDirector(
      {
        setStageQuiet: (st) => this.applyStage(st, false),
        setMaterialsQuiet: (p, n) => {
          this.playerHand.setMaterialPreset(p);
          this.npcHand.setMaterialPreset(n);
          this.sound.setHandMaterials(p, n);
        },
        poseHands: (pPose, nPose, opts) => {
          this.playerHand.setMotionDynamics(opts?.snappy ? 320 : 145, 19);
          this.npcHand.setMotionDynamics(opts?.snappy ? 320 : 145, 19);
          this.playerHand.setTargetPose(pPose, Boolean(opts?.snappy), true);
          this.npcHand.setTargetPose(nPose, Boolean(opts?.snappy), true);
          if (opts?.pOffset) this.playerHand.targetOffset.set(...opts.pOffset);
          else this.playerHand.targetOffset.set(0, 0, 0);
          if (opts?.nOffset) this.npcHand.targetOffset.set(...opts.nOffset);
          else this.npcHand.targetOffset.set(0, 0, 0);
          this.playerHand.targetExtraPitch = opts?.pPitch ?? 0;
          this.npcHand.targetExtraPitch = opts?.nPitch ?? 0;
          this.playerHand.targetExtraRoll = opts?.pRoll ?? 0;
          this.npcHand.targetExtraRoll = opts?.nRoll ?? 0;
          if (opts?.routine === 'knuckle') this.npcHand.triggerKnuckleFlex();
          if (opts?.routine === 'victory') this.playerHand.triggerVictoryRoll();
          if (opts?.routine === 'feint') this.playerHand.triggerFeintFlick();
          if (opts?.routine === 'snip') this.playerHand.triggerScissorsSnip();
        },
        playSpline: (cfg) => this.cameraDirector.playSplineShot(cfg),
        stopSpline: () => this.cameraDirector.stopSplineShot(),
        setKhdrSplitCompare: (en, sx) => {
          this.khdr.splitCompare = en;
          if (typeof sx === 'number') this.khdr.splitX = sx;
        },
        triggerClash: (pm, nm, out, od) => {
          this.playClashSequence(pm, nm, out, false, od, {}, { overdriveActive: od, streakCount: od ? 3 : 1 });
        },
        triggerVictoryShower: () => this.atmosphere.triggerVictoryShower(3.6),
        playPvAudioCue: (actIdx, stage) => this.sound.playPvChapterCue(actIdx, stage),
        getAudioStream: () => this.sound.getAudioStream(),
        restoreAfterPV: () => {
          this.applyStage(this.prePvStage, false);
          this.playerHand.setMaterialPreset(this.prePvPlayerMat);
          this.npcHand.setMaterialPreset(this.prePvNpcMat);
          this.sound.setHandMaterials(this.prePvPlayerMat, this.prePvNpcMat);
          this.applyKHDR(this.settings.khdrEnabled, this.settings.khdrSplitCompare);
          this.resetHandsToReady();
        },
      },
      (st) => onPvState?.(st)
    );

    // Apply initial stage, KHDR, Shadow Flame, FINGER S1.0, JHand Kinesis, Camera 2.1, and JSound Engin 1.3 settings!
    this.sound.setHandMaterials(this.settings.playerHandMaterial, this.settings.npcHandMaterial);
    this.sound.setQualityMode(this.settings.jsoundQuality);
    this.sound.setSpatialMode(this.settings.jsoundSpatialMode);
    this.sound.setAmbienceEnabled(this.settings.jsoundAmbience);
    this.playerHand.setKinesisMode(this.settings.jhandMode);
    this.npcHand.setKinesisMode(this.settings.jhandMode);
    this.cameraDirector.setStyle(this.settings.cameraStyle);

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

  public setCameraStyle(style: CameraStyleId): void {
    this.settings.cameraStyle = style;
    this.cameraDirector.setStyle(style);
  }

  public setCompactUi(compact: boolean): void {
    this.settings.compactUi = compact;
  }

  public setFingerS1Enabled(enabled: boolean): void {
    this.settings.fingerS1Enabled = enabled;
    this.playerHand.setFingerS1Enabled(enabled);
    this.npcHand.setFingerS1Enabled(enabled);
    // Subtle appreciative flex so user sees FINGER S1.0 sculpted joints & wrinkles come alive immediately!
    this.playerHand.addMotionImpulse(0, 0.35, 0, -0.5, 0.7);
    this.npcHand.addMotionImpulse(0, 0.35, 0, -0.5, -0.7);
  }

  public setDermaTensorEnabled(enabled: boolean): void {
    this.settings.dermaTensorEnabled = enabled;
    this.playerHand.setDermaTensorEnabled(enabled);
    this.npcHand.setDermaTensorEnabled(enabled);
  }

  public setChromaDermEnabled(enabled: boolean): void {
    this.settings.chromaDermEnabled = enabled;
    this.playerHand.setChromaDermEnabled(enabled);
    this.npcHand.setChromaDermEnabled(enabled);
  }

  /** Interactive 36-Pose Showcase Preview (triggered from Studio Drawer Pose Gallery!) */
  public previewPoseShowcase(poseKey: HandPoseKey): void {
    if (this.isAnimatingRound || this.pvDirector.isActive()) return;
    this.idleGestureTimer = 9.0;
    this.playerHand.setMotionDynamics(185, 21);
    this.npcHand.setMotionDynamics(175, 21);
    this.playerHand.setTargetPose(poseKey, false, true);
    this.npcHand.setTargetPose(poseKey, false, true);
    this.playerHand.targetOffset.set(0.1, 0.08, 0.04);
    this.npcHand.targetOffset.set(-0.06, 0.06, 0.0);
    this.playerHand.targetExtraPitch = -0.06;
    this.npcHand.targetExtraPitch = -0.04;
    this.playerHand.targetExtraRoll = -0.1;
    this.npcHand.targetExtraRoll = 0.08;

    if (poseKey === 'snap_release') this.playerHand.triggerFingerSnap();
    else if (poseKey === 'wave_flourish') this.playerHand.triggerWaveFlourish();
    else if (poseKey === 'sword_seal') this.playerHand.triggerSwordSealPulse();
    else if (poseKey === 'zen_circle' || poseKey === 'lotus_mudra') this.playerHand.triggerZenBreath();
    else if (poseKey === 'knuckle_crack') this.playerHand.triggerKnuckleFlex();
    else if (poseKey === SCISSORS) this.playerHand.triggerScissorsSnip();
    this.sound.playWoodTap(760);
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

  public setJSoundSpatialMode(mode: JSoundSpatialMode): void {
    this.settings.jsoundSpatialMode = mode;
    this.sound.setSpatialMode(mode);
  }

  public setJSoundAmbience(enabled: boolean): void {
    this.settings.jsoundAmbience = enabled;
    this.sound.setAmbienceEnabled(enabled);
  }

  public setJSoundSympathetic(enabled: boolean): void {
    this.settings.jsoundSympathetic = enabled;
    this.sound.setSympatheticResonance(enabled);
  }

  public startPV(mode: PVModeId = 'grand_trailer', recordVideo = false): void {
    if (!this.pvDirector.isActive()) {
      this.prePvStage = this.settings.stage;
      this.prePvPlayerMat = this.settings.playerHandMaterial;
      this.prePvNpcMat = this.settings.npcHandMaterial;
    }
    this.clearTimeline();
    this.isAnimatingRound = false;
    this.overdriveArmed = false;
    this.sound.unlockFromGesture();
    this.pvDirector.start(mode, recordVideo);
  }

  public stopPV(): void {
    this.pvDirector.stop(true);
  }

  public captureCinemaSnapshot(): void {
    this.pvDirector.requestSnapshot();
  }

  public setBioPulseEnabled(enabled: boolean): void {
    this.settings.bioPulseEnabled = enabled;
    if (!enabled) {
      const zero = this.bioPulse.getSample();
      this.playerHand.applyBioPulse(zero, false);
      this.npcHand.applyBioPulse(zero, false);
    }
  }

  public setAeroVortexEnabled(enabled: boolean): void {
    this.settings.aeroVortexEnabled = enabled;
    if (!enabled) {
      this.aeroVortex.clear();
    }
  }

  public setAcousticProbeEnabled(enabled: boolean): void {
    this.settings.acousticProbeEnabled = enabled;
    this.sound.applyAcousticProbe(this.acousticProbe.getSnapshot(), enabled);
  }

  public setMatchBioContext(ctx: Partial<BioPulseMatchContext>): void {
    this.bioMatchContext = { ...this.bioMatchContext, ...ctx };
  }

  /**
   * ★ True 5K (5120×2880) 48-Bit (16-Bit/Ch) KHDR 1.1 Current-Camera PNG Photograph ★
   * Captures the EXACT current live 3D camera viewpoint (including custom free_orbit & macro zoom!)
   * with zero UI clutter, mechanical twin-curtain shutter audio, and JNV-PROOF STEGO-SEAL 1.0!
   */
  public async captureCurrentView5KPng(
    options?: {
      jnvCommitHash?: string;
      jnvFairnessVerified?: boolean;
      matchScoreText?: string;
      psychoEntropyBits?: number;
      skipDownload?: boolean;
      returnBytes?: boolean;
      onProgress?: (pct: number, statusJp: string) => void;
    }
  ): Promise<Photo5KResult | null> {
    if (this.isCapturing5K) return null;
    this.isCapturing5K = true;
    this.sound.playCameraShutter();

    try {
      const rect = this.container.getBoundingClientRect();
      const viewW = Math.max(320, rect.width || window.innerWidth);
      const viewH = Math.max(240, rect.height || window.innerHeight);
      const stageDef = STAGE_DEFINITIONS[this.settings.stage];
      const cam = this.cameraDirector.camera;
      cam.getWorldDirection(this.tmpCamForward);
      const targetPos: [number, number, number] = [
        Number((cam.position.x + this.tmpCamForward.x * 2.0).toFixed(3)),
        Number((cam.position.y + this.tmpCamForward.y * 2.0).toFixed(3)),
        Number((cam.position.z + this.tmpCamForward.z * 2.0).toFixed(3)),
      ];

      const bio = this.bioPulse.getSample();
      const aero = this.aeroVortex.getTelemetry();
      const probe = this.acousticProbe.getSnapshot();

      return await captureCurrentAngle5KPhoto({
        renderer: this.renderer,
        scene: this.scene,
        camera: cam,
        khdr: this.khdr,
        sunWorldDir: this.sunWorldDir,
        elapsedSec: this.elapsedSec,
        viewportWidth: viewW,
        viewportHeight: viewH,
        stageLabel: stageDef.nameJp,
        fingerS1Enabled: this.settings.fingerS1Enabled,
        skipDownload: options?.skipDownload,
        returnBytes: options?.returnBytes,
        onProgress: options?.onProgress,
        proofContext: {
          stageId: this.settings.stage,
          stageNameJp: stageDef.nameJp,
          cameraStyle: this.settings.cameraStyle,
          cameraPos: [
            Number(cam.position.x.toFixed(3)),
            Number(cam.position.y.toFixed(3)),
            Number(cam.position.z.toFixed(3)),
          ],
          cameraTarget: targetPos,
          cameraFovDeg: Number(cam.fov.toFixed(1)),
          khdrVersion: 'KHDR 1.1',
          shadowMode: this.settings.shadowFlame,
          playerMaterial: this.settings.playerHandMaterial,
          npcMaterial: this.settings.npcHandMaterial,
          jsoundSpatialMode: this.settings.jsoundSpatialMode,
          jnvCommitHash: options?.jnvCommitHash ?? 'LIVE_SESSION',
          jnvFairnessVerified: options?.jnvFairnessVerified ?? true,
          matchScoreText: options?.matchScoreText ?? `${this.bioMatchContext.playerScore} - ${this.bioMatchContext.npcScore}`,
          bioPulseBpm: bio.bpm,
          bioCapillaryBlanching: bio.capillaryBlanching,
          aeroActiveVortices: aero.activeVortexCount,
          psychoEntropyBits: options?.psychoEntropyBits ?? 1.585,
          acousticProbeDrDb: probe.directToReverbDb,
        },
      });
    } finally {
      this.isCapturing5K = false;
    }
  }

  public applyStage(stageId: StageId, withRevealSweep = true): void {
    if (!this.pvDirector.isActive()) {
      this.settings.stage = stageId;
    }
    const def = this.stageBuilder.buildStage(stageId);
    this.sound.setStage(stageId);
    this.acousticProbe.setStage(stageId);

    this.scene.environment = this.hdriBuilder.getEnvironment(stageId);
    this.scene.background = new THREE.Color(def.backgroundColor);
    this.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);

    this.sunLight.position.set(...def.sunDirection);
    this.sunLight.color.setHex(def.sunColor);
    this.baseSunIntensity = def.sunIntensity;
    this.sunLight.intensity = def.sunIntensity;
    this.sunLight.target.position.set(0, 0.1, 0);
    this.sunWorldDir.copy(this.sunLight.position).normalize();

    // Sync FINGER S1.0 backlit dermal subsurface scattering to the active stage's sun vector!
    this.playerHand.setSunDirection(this.sunWorldDir);
    this.npcHand.setSunDirection(this.sunWorldDir);

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
    this.sound.setHandMaterials(playerMat, npcMat);
    if (playerChanged) {
      this.sound.playMaterialPreview(playerMat, 'player');
    } else if (npcChanged) {
      this.sound.playMaterialPreview(npcMat, 'npc');
    }
    this.playerHand.addMotionImpulse(0, 0.45, 0, -0.8, 1.4);
    this.npcHand.addMotionImpulse(0, 0.45, 0, -0.8, -1.4);
  }

  public setTableScores(playerWins: number, npcWins: number): void {
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
    this.overdriveArmed = false;

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
   * Tactical Spirit Overdrive (極一撃) armed visual/kinematic stance!
   */
  public setOverdriveArmed(armed: boolean): void {
    if (this.isAnimatingRound || this.pvDirector.isActive()) return;
    this.overdriveArmed = armed;
    if (armed) {
      this.playerHand.setMotionDynamics(240, 20);
      this.playerHand.setTargetPose('claw_charge', true, true);
      this.playerHand.targetOffset.set(-0.04, 0.09, 0.04);
      this.playerHand.targetExtraPitch = -0.16;
      this.playerHand.targetExtraRoll = -0.12;
      this.cameraDirector.setMood('spirit_charge');
      this.sound.playSpiritCharge(1.0, true);
      this.lightImpactPulse = 0.55;
    } else {
      this.playerHand.setMotionDynamics(155, 18);
      this.playerHand.setTargetPose('ready', false, true);
      this.playerHand.targetOffset.set(0, 0, 0);
      this.playerHand.targetExtraPitch = 0;
      this.playerHand.targetExtraRoll = 0;
      this.cameraDirector.setMood('idle');
    }
  }

  /**
   * Tactical Feint (牽制) 3D Choreography:
   * Player snaps a crisp `feint_flick` + Sensu/Shamisen cue, Camera peeks at JNV1.0,
   * and JNV1.0 exhibits a subtle non-cheating neuromuscular micro-tell!
   */
  public triggerFeintSequence(stanceCue: 'tight' | 'poised' | 'open'): void {
    if (this.isAnimatingRound || this.pvDirector.isActive()) return;
    this.idleGestureTimer = 6.5;

    this.playerHand.setMotionDynamics(320, 21);
    this.playerHand.setTargetPose('feint_flick', true, true);
    this.playerHand.targetOffset.set(0.14, 0.07, 0.04);
    this.playerHand.targetExtraRoll = -0.2;
    this.playerHand.triggerFeintFlick();

    this.sound.playFeintCue('player');
    this.cameraDirector.setMood('feint_peek');

    // Subtle non-cheating NPC reaction after 120ms
    window.setTimeout(() => {
      if (this.isAnimatingRound || this.pvDirector.isActive()) return;
      this.npcHand.setTargetPose(
        stanceCue === 'tight' ? 'knuckle_crack' : stanceCue === 'poised' ? 'guard' : 'palm_meditate',
        false,
        true
      );
      this.npcHand.triggerNpcTell(stanceCue);
    }, 120);

    // Gracefully return to poised combat stance after 720ms
    window.setTimeout(() => {
      if (this.isAnimatingRound || this.pvDirector.isActive()) return;
      this.playerHand.setTargetPose(this.overdriveArmed ? 'claw_charge' : 'guard', false, true);
      this.playerHand.targetOffset.set(0, 0, 0);
      this.playerHand.targetExtraRoll = 0;
      this.npcHand.setTargetPose('ready', false, true);
      this.cameraDirector.setMood(this.overdriveArmed ? 'spirit_charge' : 'idle');
    }, 760);
  }

  /**
   * Rich tactile hover anticipation on the Player's 3D hand + JSound 1.2 preview cue!
   */
  public previewHoverMove(move: Move | null): void {
    if (this.isAnimatingRound || this.pvDirector.isActive()) return;
    this.idleGestureTimer = 7.0;
    if (move === null) {
      this.playerHand.setMotionDynamics(155, 18);
      this.playerHand.setTargetPose(this.overdriveArmed ? 'claw_charge' : 'ready', false, true, false);
      this.playerHand.targetOffset.set(0, this.overdriveArmed ? 0.09 : 0, this.overdriveArmed ? 0.04 : 0);
      this.playerHand.targetExtraPitch = this.overdriveArmed ? -0.16 : 0;
      this.playerHand.targetExtraRoll = this.overdriveArmed ? -0.12 : 0;
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
    this.overdriveArmed = false;
    this.sound.playMatchVictoryChord(playerWon);
    const winPose: HandPoseKey = this.motionVariantCounter % 2 === 0 ? 'salute' : 'victory_fist';
    if (playerWon) {
      this.cameraDirector.setMood('match_victory');
      this.atmosphere.triggerVictoryShower(3.6);
      this.playerHand.setMotionDynamics(135, 16);
      this.playerHand.setTargetPose(winPose, false, true);
      this.playerHand.targetOffset.set(0.24, 0.22, 0.04);
      this.playerHand.targetExtraPitch = -0.18;
      this.playerHand.targetExtraRoll = -0.18;
      this.playerHand.triggerVictoryRoll();

      this.npcHand.setMotionDynamics(110, 17);
      this.npcHand.setTargetPose('bow', false, true);
      this.npcHand.targetOffset.set(0.14, -0.09, -0.05);
      this.npcHand.targetExtraPitch = 0.28;
    } else {
      this.cameraDirector.setMood('match_defeat');
      this.npcHand.setMotionDynamics(135, 16);
      this.npcHand.setTargetPose(winPose, false, true);
      this.npcHand.targetOffset.set(-0.24, 0.22, -0.04);
      this.npcHand.targetExtraPitch = -0.18;
      this.npcHand.targetExtraRoll = 0.18;
      this.npcHand.triggerVictoryRoll();

      this.playerHand.setMotionDynamics(110, 17);
      this.playerHand.setTargetPose('bow', false, true);
      this.playerHand.targetOffset.set(-0.14, -0.09, 0.05);
      this.playerHand.targetExtraPitch = 0.28;
    }
  }

  /**
   * Execute AAA Deterministic-Timeline 3D "Jan-Ken-Pon!" Choreography with:
   *  - 3 Rotating Signature Motion Variants per Move (9 Win Clash Variants + 3 Draw Variants!)
   *  - Dynamic Multi-Angle Camera Cuts (OTS Player/NPC -> Low Clash -> Bullet-Time 180° Orbit!)
   *  - Cinema Hit-Stop Time Dilation (`0.11×` on Overdrive / Match Point)
   *  - JSound Engin 1.2 Overdrive Katana × Shamisen × Odaiko Climax & Streak Flourishes!
   */
  public playClashSequence(
    playerMove: Move,
    npcMove: Move,
    outcome: PlayerOutcome,
    isAikoFollowup: boolean,
    isMatchDecidingPoint: boolean,
    callbacks: ClashAnimationCallbacks = {},
    options: ClashSequenceOptions = {}
  ): void {
    this.clearTimeline();
    this.isAnimatingRound = true;
    this.timelineActive = true;
    this.timelineClock = 0;
    this.idleGestureTimer = 7.0;

    const variant = this.motionVariantCounter++ % 5;
    const isOverdrive = Boolean(options.overdriveActive);
    const streakCount = options.streakCount ?? 0;
    const isDramatic = isOverdrive || isMatchDecidingPoint || streakCount >= 3;
    this.overdriveArmed = false;

    const addCue = (atSec: number, action: () => void) => {
      this.timelineCues.push({ atSec, fired: false, action });
    };

    const beat1Label = isOverdrive
      ? '極・一撃'
      : isAikoFollowup
      ? 'あいこで'
      : 'じゃーん';
    const beat2Label = isOverdrive ? '斬り結ぶ' : 'けーん';
    const beat3Label = isOverdrive ? '極閃！！' : isAikoFollowup ? 'しょっ！' : 'ぽん！';

    // === BEAT 1 (t = 0.00s): Explosive Windup Coil & Dynamic Camera Angle ===
    addCue(0.0, () => {
      if (isDramatic) {
        callbacks.onCinemaBars?.(true);
        this.cameraDirector.setMood(variant % 2 === 1 ? 'ots_npc' : 'ots_player');
      } else {
        this.cameraDirector.setMood(variant === 2 ? 'ots_player' : variant === 4 ? 'ots_npc' : 'windup');
      }
      this.playerHand.setMotionDynamics(280, 22.5);
      this.npcHand.setMotionDynamics(280, 22.5);
      this.playerHand.setTargetPose(isOverdrive ? 'claw_charge' : variant === 3 ? 'stealth_curl' : 'windup', true, true);
      this.npcHand.setTargetPose(variant === 4 ? 'stealth_curl' : 'windup', true, true);

      this.playerHand.targetOffset.set(-0.11, 0.24, 0.02);
      this.npcHand.targetOffset.set(0.11, 0.24, -0.02);
      this.playerHand.targetExtraPitch = -0.32;
      this.npcHand.targetExtraPitch = -0.32;
      this.playerHand.targetExtraRoll = -0.14;
      this.npcHand.targetExtraRoll = 0.14;
      this.playerHand.addMotionImpulse(-0.35, 1.35, 0, -1.5, 0);
      this.npcHand.addMotionImpulse(0.35, 1.35, 0, -1.5, 0);

      this.stageBuilder.syncJNVClockwork(0.85, 0.9, true);
      this.sound.playBeat(1, isMatchDecidingPoint || isOverdrive, isAikoFollowup);
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

        this.sound.playBeat(2, isMatchDecidingPoint || isOverdrive, isAikoFollowup);
        callbacks.onBeat?.(beat2Label, 2);
      });

      // === PRE-STRIKE WHIP RELEASE (t = 0.54s): Moving 3D Doppler Sleeve Whoosh ===
      addCue(0.54, () => {
        this.sound.playWhoosh(
          isOverdrive ? 1.55 : 1.25,
          1.24,
          { x: -0.42, y: 0.36, z: 0.16 },
          'player',
          { x: 0.08, y: 0.3, z: 0.06 }
        );
        this.sound.playWhoosh(
          isOverdrive ? 1.48 : 1.18,
          1.2,
          { x: 0.42, y: 0.36, z: 0.12 },
          'npc',
          { x: -0.08, y: 0.3, z: 0.06 }
        );
      });
    } else {
      addCue(0.22, () => {
        this.cameraDirector.setMood('apex');
        this.sound.playWhoosh(1.25, 1.34, { x: -0.35, y: 0.34, z: 0.14 }, 'player', { x: 0.04, y: 0.3, z: 0.08 });
        this.sound.playWhoosh(1.2, 1.3, { x: 0.35, y: 0.34, z: 0.1 }, 'npc', { x: -0.04, y: 0.3, z: 0.08 });
      });
    }

    const revealAt = isAikoFollowup ? 0.32 : 0.61;
    const winnerMove = outcome === 'LOSS' ? npcMove : playerMove;

    // === BEAT 3 (PON!!): Explosive Forward Lunge + 38-DOF + Bullet-Time Orbit + JSound 1.3 ===
    addCue(revealAt, () => {
      const clashMood: CameraMood = isDramatic || variant === 1 || variant === 4 ? 'low_clash' : 'clash';
      this.cameraDirector.setMood(clashMood);
      if (isDramatic) {
        this.cameraDirector.triggerBulletTimeOrbit(
          isOverdrive ? 0.92 : 0.72,
          outcome === 'LOSS' ? -1 : 1,
          isOverdrive ? 1.58 : 1.18
        );
      }

      const dirX = outcome === 'WIN' ? 1 : outcome === 'LOSS' ? -1 : 0;
      this.cameraDirector.triggerImpactImpulse(
        isOverdrive ? 0.064 : isMatchDecidingPoint ? 0.052 : outcome === 'DRAW' ? 0.026 : 0.042,
        dirX,
        -0.78
      );

      this.lightImpactPulse = isOverdrive ? 1.25 : isMatchDecidingPoint ? 1.0 : 0.74;

      this.playerHand.setMotionDynamics(440, 25);
      this.npcHand.setMotionDynamics(440, 25);
      this.playerHand.setTargetPose(playerMove, true, true);
      this.npcHand.setTargetPose(npcMove, true, true);

      if (isOverdrive) {
        this.sound.playOverdriveClash(outcome, winnerMove);
      } else {
        this.sound.playClashImpact(outcome, winnerMove, isMatchDecidingPoint);
      }
      if (outcome === 'WIN' && streakCount >= 2) {
        this.sound.playComboFlourish(streakCount);
      }

      this.atmosphere.emitClashBurst(outcome, winnerMove, new THREE.Vector3(0, 0.3, 0.08));
      if (this.settings.aeroVortexEnabled) {
        this.aeroVortex.spawnClashShockwave(winnerMove, isOverdrive ? 1.55 : isMatchDecidingPoint ? 1.25 : 1.0);
      }

      // Trigger Smooth Cinema Hit-Stop Time-Dilation Ramp!
      const hsDur = isOverdrive ? 0.3 : isMatchDecidingPoint ? 0.22 : outcome === 'DRAW' ? 0.09 : 0.14;
      this.hitStopDuration = hsDur;
      this.hitStopRemaining = hsDur;
      this.hitStopScale = isOverdrive ? 0.11 : isMatchDecidingPoint ? 0.14 : 0.17;

      if (outcome === 'WIN') {
        this.applyWinClashPose(this.playerHand, this.npcHand, playerMove, 1, variant);
      } else if (outcome === 'LOSS') {
        this.applyWinClashPose(this.npcHand, this.playerHand, npcMove, -1, variant);
      } else {
        // DRAW: 5 distinct mirrored standoff variations!
        const yOff = variant === 1 ? 0.08 : variant === 2 ? -0.02 : variant === 3 ? 0.11 : variant === 4 ? 0.04 : 0.02;
        this.playerHand.targetOffset.set(0.14, yOff, 0.02);
        this.npcHand.targetOffset.set(-0.14, yOff, -0.02);
        this.playerHand.targetExtraPitch = variant === 1 ? -0.09 : variant === 3 ? -0.14 : 0.04;
        this.npcHand.targetExtraPitch = variant === 1 ? -0.09 : variant === 3 ? -0.14 : 0.04;
        this.playerHand.targetExtraRoll = variant === 2 ? 0.16 : variant === 4 ? -0.18 : 0.0;
        this.npcHand.targetExtraRoll = variant === 2 ? -0.16 : variant === 4 ? 0.18 : 0.0;
        this.playerHand.triggerRecoil(0.72, 1);
        this.npcHand.triggerRecoil(0.72, -1);
      }

      callbacks.onBeat?.(beat3Label, 3);
      callbacks.onReveal?.();
    });

    // === MOVE-SPECIFIC SIGNATURE FOLLOW-THROUGH (t = revealAt + 0.28s) ===
    addCue(revealAt + (isOverdrive ? 0.34 : 0.26), () => {
      if (outcome === 'WIN') {
        this.cameraDirector.setMood('victory');
        this.applyVictoryFlourish(this.playerHand, this.npcHand, playerMove, 1, variant, isOverdrive);
      } else if (outcome === 'LOSS') {
        this.cameraDirector.setMood('defeat');
        this.applyVictoryFlourish(this.npcHand, this.playerHand, npcMove, -1, variant, isOverdrive);
      } else {
        // DRAW escalated stance ready for immediate "あいこで…しょ！" (5 variants!)
        this.playerHand.setMotionDynamics(200, 21);
        this.npcHand.setMotionDynamics(200, 21);
        if (variant === 1) {
          this.playerHand.setTargetPose('guard', false, true);
          this.npcHand.setTargetPose('guard', false, true);
        } else if (variant === 2) {
          this.playerHand.setTargetPose('beckon', false, true);
          this.npcHand.setTargetPose('stealth_curl', false, true);
        } else if (variant === 3) {
          this.playerHand.setTargetPose('counter_parry', false, true);
          this.npcHand.setTargetPose('counter_parry', false, true);
        } else if (variant === 4) {
          this.playerHand.setTargetPose('snap_ready', false, true);
          this.npcHand.setTargetPose('crane_poise', false, true);
        }
        this.playerHand.targetOffset.set(0.06, 0.06, 0.01);
        this.npcHand.targetOffset.set(-0.06, 0.06, -0.01);
      }
      callbacks.onVerdict?.();
    });

    // === UNLOCK NEXT ROUND (t = revealAt + 0.68s) ===
    addCue(revealAt + (isOverdrive ? 0.84 : 0.64), () => {
      callbacks.onCinemaBars?.(false);
      this.isAnimatingRound = false;
      this.timelineActive = false;
      callbacks.onFinished?.();
    });
  }

  /**
   * 15 Rotating Move-Specific Instant Collision Postures (5 per Move!) at exact PON!! moment.
   */
  private applyWinClashPose(
    winner: SculptedHandRig,
    loser: SculptedHandRig,
    winMove: Move,
    dir: 1 | -1,
    variant: number
  ): void {
    if (winMove === ROCK) {
      if (variant === 0) {
        // Variant 0: Heavy Downward Pronation Hammer-Slam
        winner.targetOffset.set(0.24 * dir, -0.01, 0.02 * dir);
        winner.targetExtraPitch = 0.16;
        winner.targetExtraRoll = 0.24 * dir;
        winner.addMotionImpulse(2.1 * dir, -1.75, 0, 2.2, 1.8 * dir);
      } else if (variant === 1) {
        // Variant 1: Rising Uppercut Counter-Smash
        winner.targetOffset.set(0.23 * dir, 0.11, 0.03 * dir);
        winner.targetExtraPitch = -0.26;
        winner.targetExtraRoll = -0.22 * dir;
        winner.addMotionImpulse(2.0 * dir, 1.65, 0.2 * dir, -2.4, -1.9 * dir);
      } else if (variant === 2) {
        // Variant 2: Horizontal Spinning Haymaker Hook
        winner.targetOffset.set(0.26 * dir, 0.03, 0.05 * dir);
        winner.targetExtraYaw = 0.28 * dir;
        winner.targetExtraRoll = 0.34 * dir;
        winner.addMotionImpulse(2.55 * dir, 0.2, 0.45 * dir, 0.8, 2.5 * dir);
      } else if (variant === 3) {
        // Variant 3: Phoenix-Eye Iron-Knuckle Precision Thrust!
        winner.setTargetPose('iron_knuckle', true, true);
        winner.targetOffset.set(0.27 * dir, 0.05, 0.02 * dir);
        winner.targetExtraPitch = 0.04;
        winner.targetExtraRoll = 0.12 * dir;
        winner.addMotionImpulse(2.7 * dir, 0.1, 0.15 * dir, 0.5, 1.4 * dir);
      } else {
        // Variant 4: Corkscrew Inverted Fist-Pump Impact!
        winner.setTargetPose('fist_pump', true, true);
        winner.targetOffset.set(0.24 * dir, 0.13, 0.03 * dir);
        winner.targetExtraPitch = -0.28;
        winner.targetExtraRoll = 0.38 * dir;
        winner.addMotionImpulse(2.2 * dir, 1.4, 0.2 * dir, -2.1, 2.6 * dir);
      }
      loser.targetOffset.set(0.09 * dir, -0.04, -0.05 * dir);
      loser.targetExtraPitch = -0.26;
      loser.triggerRecoil(1.28, -dir);
    } else if (winMove === SCISSORS) {
      if (variant === 0) {
        // Variant 0: Razor Forward Lunge & Diagonal Slice
        winner.targetOffset.set(0.25 * dir, 0.04, 0.03 * dir);
        winner.targetExtraPitch = 0.04;
        winner.targetExtraYaw = 0.14 * dir;
        winner.targetExtraRoll = -0.1 * dir;
        winner.addMotionImpulse(2.35 * dir, 0.35, 0.25 * dir, 0.8, -2.4 * dir);
      } else if (variant === 1) {
        // Variant 1: Sweeping Horizontal Cross-Cut
        winner.targetOffset.set(0.26 * dir, 0.06, -0.02 * dir);
        winner.targetExtraYaw = -0.22 * dir;
        winner.targetExtraRoll = 0.42 * dir;
        winner.addMotionImpulse(2.45 * dir, 0.15, -0.45 * dir, 0.4, 2.8 * dir);
      } else if (variant === 2) {
        // Variant 2: Overhead Vertical Scissor-Drop
        winner.targetOffset.set(0.22 * dir, 0.0, 0.03 * dir);
        winner.targetExtraPitch = 0.22;
        winner.targetExtraRoll = 0.06 * dir;
        winner.addMotionImpulse(2.1 * dir, -1.45, 0.15 * dir, 2.1, -1.4 * dir);
      } else if (variant === 3) {
        // Variant 3: Kuji-In Twin-Blade Sword Seal Piercing Thrust!
        winner.setTargetPose('sword_seal', true, true);
        winner.targetOffset.set(0.28 * dir, 0.07, 0.02 * dir);
        winner.targetExtraPitch = -0.08;
        winner.targetExtraRoll = 0.28 * dir;
        winner.triggerSwordSealPulse();
      } else {
        // Variant 4: Rising Supinated Twin-Blade Parry-Slice!
        winner.setTargetPose('peace_tilt', true, true);
        winner.targetOffset.set(0.24 * dir, 0.12, 0.03 * dir);
        winner.targetExtraPitch = -0.18;
        winner.targetExtraRoll = -0.34 * dir;
        winner.addMotionImpulse(2.25 * dir, 1.35, 0.18 * dir, -1.7, -2.4 * dir);
      }
      loser.targetOffset.set(0.1 * dir, -0.03, -0.04 * dir);
      loser.targetExtraPitch = -0.22;
      loser.triggerRecoil(1.12, -dir);
    } else {
      if (variant === 0) {
        // Variant 0: Majestic Rising Enveloping Crown Arc
        winner.targetOffset.set(0.23 * dir, 0.14, 0.02 * dir);
        winner.targetExtraPitch = 0.1;
        winner.targetExtraRoll = -0.12 * dir;
        winner.addMotionImpulse(1.9 * dir, 1.15, 0, -0.9, -1.2 * dir);
      } else if (variant === 1) {
        // Variant 1: Razor Shuto Vertical Blade-Edge Strike!
        winner.setTargetPose('blade_edge', true, true);
        winner.targetOffset.set(0.25 * dir, 0.05, 0.02 * dir);
        winner.targetExtraPitch = 0.14;
        winner.targetExtraRoll = 0.36 * dir;
        winner.addMotionImpulse(2.3 * dir, -1.1, 0.1 * dir, 1.6, 2.1 * dir);
      } else if (variant === 2) {
        // Variant 2: Grand Tiger-Palm Shockwave Thrust!
        winner.setTargetPose('tiger_palm', true, true);
        winner.targetOffset.set(0.27 * dir, 0.07, 0.03 * dir);
        winner.targetExtraPitch = -0.22;
        winner.targetExtraRoll = -0.08 * dir;
        winner.addMotionImpulse(2.55 * dir, 0.45, 0.25 * dir, -1.9, -1.0 * dir);
      } else if (variant === 3) {
        // Variant 3: Sweeping Martial Counter-Parry Deflection!
        winner.setTargetPose('counter_parry', true, true);
        winner.targetOffset.set(0.24 * dir, 0.09, -0.02 * dir);
        winner.targetExtraYaw = 0.24 * dir;
        winner.targetExtraRoll = 0.38 * dir;
        winner.addMotionImpulse(2.3 * dir, 0.65, -0.3 * dir, -0.8, 2.4 * dir);
      } else {
        // Variant 4: Kabuki Sweeping Wave Flourish Palm!
        winner.setTargetPose('wave_flourish', true, true);
        winner.targetOffset.set(0.25 * dir, 0.12, 0.03 * dir);
        winner.targetExtraPitch = -0.16;
        winner.targetExtraRoll = -0.26 * dir;
        winner.triggerWaveFlourish();
      }
      loser.targetOffset.set(0.04 * dir, -0.07, -0.03 * dir);
      loser.targetExtraPitch = 0.16;
      loser.triggerRecoil(0.98, -dir);
    }
  }

  /**
   * Expanded 36-Pose Signature Post-Hit-Stop Triumph Flourishes (5 per Move + Loser Defeat Slump)!
   */
  private applyVictoryFlourish(
    winner: SculptedHandRig,
    loser: SculptedHandRig,
    winMove: Move,
    dir: 1 | -1,
    variant: number,
    isOverdrive: boolean
  ): void {
    winner.setMotionDynamics(185, 21);
    loser.setMotionDynamics(145, 20);
    if (variant >= 3) {
      loser.setTargetPose('defeat_slump', false, true);
    }

    if (winMove === SCISSORS) {
      if (variant === 1 && !isOverdrive) {
        winner.setTargetPose('finger_gun', true, true);
        winner.targetOffset.set(0.21 * dir, 0.12, 0.03 * dir);
        winner.targetExtraPitch = -0.12;
        winner.triggerVictoryRoll();
      } else if (variant === 2) {
        winner.setTargetPose('crane_poise', false, true);
        winner.targetOffset.set(0.2 * dir, 0.13, 0.02 * dir);
        winner.targetExtraPitch = -0.1;
      } else if (variant === 3) {
        winner.setTargetPose('sword_seal', false, true);
        winner.targetOffset.set(0.22 * dir, 0.14, 0.02 * dir);
        winner.targetExtraPitch = -0.12;
      } else if (variant === 4) {
        winner.setTargetPose('peace_tilt', false, true);
        winner.targetOffset.set(0.21 * dir, 0.14, 0.03 * dir);
        winner.targetExtraPitch = -0.14;
        winner.triggerVictoryRoll();
      } else {
        winner.targetOffset.set(0.22 * dir, 0.1, 0.02 * dir);
        winner.targetExtraPitch = -0.08;
        winner.targetExtraYaw = 0.12 * dir;
        winner.triggerScissorsSnip();
      }
    } else if (winMove === PAPER) {
      if (variant === 1) {
        winner.setTargetPose('blade_edge', false, true);
        winner.targetOffset.set(0.24 * dir, 0.11, 0.02 * dir);
        winner.targetExtraPitch = -0.06;
      } else if (variant === 2) {
        winner.setTargetPose('lotus_mudra', false, true);
        winner.targetOffset.set(0.22 * dir, 0.13, 0.02 * dir);
        winner.targetExtraPitch = -0.08;
      } else if (variant === 3) {
        winner.setTargetPose('open_offer', false, true);
        winner.targetOffset.set(0.23 * dir, 0.12, 0.02 * dir);
        winner.targetExtraPitch = -0.1;
      } else if (variant === 4) {
        winner.setTargetPose('zen_circle', false, true);
        winner.targetOffset.set(0.21 * dir, 0.14, 0.02 * dir);
        winner.targetExtraPitch = -0.1;
        winner.triggerZenBreath();
      } else {
        winner.setTargetPose('envelop', false, true);
        winner.targetOffset.set(0.26 * dir, 0.08, 0.01 * dir);
        winner.targetExtraPitch = 0.16;
      }
      loser.targetOffset.set(0.02 * dir, -0.08, -0.02 * dir);
    } else {
      const rockFinishes: HandPoseKey[] = ['victory_fist', 'knuckle_crack', 'iron_knuckle', 'fist_pump', 'snap_release'];
      const chosen = isOverdrive ? 'victory_fist' : rockFinishes[variant % rockFinishes.length];
      winner.setTargetPose(chosen, false, true);
      winner.targetOffset.set(0.2 * dir, 0.14, 0.02 * dir);
      winner.targetExtraPitch = -0.16;
      winner.targetExtraRoll = -0.08 * dir;
      if (chosen === 'snap_release') winner.triggerFingerSnap();
      else if (isOverdrive || variant === 3) winner.triggerVictoryRoll();
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

      // Pause live frame rendering atomically while True 5K 48-Bit KHDR 1.1 tiled readback executes!
      if (this.isCapturing5K) {
        this.lastRenderTimestamp = nowMs;
        this.lastLogicTimestamp = nowMs;
        return;
      }

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

      // ★ Silky Frame-Delta EMA Spike-Smoothing Filter (eliminates micro-stutter on 60/120/Unlimited!) ★
      if (rawDt > this.smoothedDt * 2.2) {
        this.smoothedDt = Math.min(0.033, this.smoothedDt * 0.55 + rawDt * 0.45);
      } else {
        this.smoothedDt = this.smoothedDt * 0.68 + rawDt * 0.32;
      }
      const silkyDt = Math.min(0.045, Math.max(0.001, this.smoothedDt));

      // Advance Built-In PV Cinema Director timeline if active
      this.pvDirector.update(rawDt);

      // Advance deterministic round choreography timeline
      if (this.timelineActive) {
        this.timelineClock += rawDt;
        for (const cue of this.timelineCues) {
          if (!cue.fired && this.timelineClock >= cue.atSec) {
            cue.fired = true;
            cue.action();
          }
        }
      } else if (!this.isAnimatingRound && !this.pvDirector.isActive() && !this.overdriveArmed) {
        // 10 Lifelike Idle Personality Micro-Gestures across our 36-Pose library!
        this.idleGestureTimer -= rawDt;
        if (this.idleGestureTimer <= 0) {
          this.idleGestureTimer = 7.2 + Math.random() * 4.2;
          const pick = Math.floor(Math.random() * 10);
          const restoreLater = (hand: SculptedHandRig, delayMs = 1150) => {
            window.setTimeout(() => {
              if (!this.isAnimatingRound && !this.pvDirector.isActive() && !this.overdriveArmed) {
                hand.setTargetPose('ready', false, true);
              }
            }, delayMs);
          };
          if (pick === 0) {
            this.npcHand.triggerKnuckleFlex();
          } else if (pick === 1) {
            this.npcHand.setTargetPose('beckon', false, true);
            restoreLater(this.npcHand, 1050);
          } else if (pick === 2) {
            this.playerHand.triggerKnuckleFlex();
          } else if (pick === 3) {
            this.playerHand.setTargetPose('lotus_mudra', false, true);
            restoreLater(this.playerHand, 1300);
          } else if (pick === 4) {
            this.npcHand.setTargetPose('koto_pluck', false, true);
            restoreLater(this.npcHand, 1200);
          } else if (pick === 5) {
            this.playerHand.setTargetPose('zen_circle', false, true);
            restoreLater(this.playerHand, 1250);
          } else if (pick === 6) {
            this.npcHand.setTargetPose('fan_hold', false, true);
            restoreLater(this.npcHand, 1200);
          } else if (pick === 7) {
            this.playerHand.setTargetPose('tea_whisk', false, true);
            restoreLater(this.playerHand, 1150);
          } else if (pick === 8) {
            this.npcHand.setTargetPose('brush_grip', false, true);
            restoreLater(this.npcHand, 1200);
          } else {
            this.playerHand.triggerWaveFlourish();
            restoreLater(this.playerHand, 1100);
          }
        }
      }

      // ★ Smooth Cinema Hit-Stop Time-Dilation Ramp (silky decel in + easeOutExpo glide back to 1.0×!) ★
      let simDt = silkyDt;
      if (this.hitStopRemaining > 0) {
        this.hitStopRemaining = Math.max(0, this.hitStopRemaining - rawDt);
        const progress = 1.0 - this.hitStopRemaining / Math.max(0.01, this.hitStopDuration);
        let timeScale: number;
        if (progress < 0.14) {
          const u = progress / 0.14;
          const s = u * u * (3 - 2 * u);
          timeScale = THREE.MathUtils.lerp(1.0, this.hitStopScale, s);
        } else if (progress < 0.58) {
          timeScale = this.hitStopScale;
        } else {
          const u = (progress - 0.58) / 0.42;
          const easeOut = 1.0 - Math.pow(2, -7.5 * u);
          timeScale = THREE.MathUtils.lerp(this.hitStopScale, 1.0, easeOut);
        }
        simDt = silkyDt * timeScale;
      }

      this.elapsedSec += simDt;

      // Smooth warm-sunlight impact glint & Overdrive buildup (strictly zero neon!)
      const targetOdBoost = this.overdriveArmed ? 0.38 : 0;
      this.overdriveSunBoost = THREE.MathUtils.lerp(this.overdriveSunBoost, targetOdBoost, 1 - Math.exp(-4.5 * silkyDt));

      if (this.lightImpactPulse > 0.001 || this.overdriveSunBoost > 0.002) {
        this.lightImpactPulse *= Math.exp(-5.5 * silkyDt);
        this.sunLight.intensity =
          this.baseSunIntensity + this.lightImpactPulse * 0.65 + this.overdriveSunBoost;
        this.khdr.exposure =
          this.baseExposure + this.lightImpactPulse * 0.075 + this.overdriveSunBoost * 0.05;
      } else if (this.sunLight.intensity !== this.baseSunIntensity) {
        this.sunLight.intensity = this.baseSunIntensity;
        this.khdr.exposure = this.baseExposure;
      }

      // Update 3D spring rigs, tabletop props, physical VFX, and C² Steadicam cinema camera
      this.playerHand.update(simDt);
      this.npcHand.update(simDt);
      this.playerHand.getPalmWorldPosition(this.tmpLeftPalm);
      this.npcHand.getPalmWorldPosition(this.tmpRightPalm);

      // ★ 1. J-BIOPULSE 1.0: Real-Time Arterial PPG Pulse, Capillary Blanching & 8-12Hz Micro-Tremor ★
      const pClench = this.playerHand.getClenchLoad();
      this.bioMatchContext.clenchLoad = pClench;
      this.bioMatchContext.overdriveActive = this.overdriveArmed;
      this.bioMatchContext.exertionPulse = Math.min(1, this.lightImpactPulse);
      const bioSample = this.bioPulse.update(silkyDt, this.bioMatchContext);
      this.playerHand.applyBioPulse(bioSample, this.settings.bioPulseEnabled);
      this.npcHand.applyBioPulse(bioSample, this.settings.bioPulseEnabled);
      if (this.settings.bioPulseEnabled && bioSample.didBeatThisFrame && bioSample.tension >= 0.45 && !this.pvDirector.isActive()) {
        this.sound.playBioHeartbeat(bioSample.tension);
      }

      // ★ 2. AERO-KINETIC VORTEX 1.0: Real-Time 3D Biot-Savart Hand Wake & Vortex-Ring Advection ★
      if (this.settings.aeroVortexEnabled) {
        this.playerHand.getPalmVelocity(this.tmpVelLeft);
        this.npcHand.getPalmVelocity(this.tmpVelRight);
        const speedL = this.tmpVelLeft.length();
        const speedR = this.tmpVelRight.length();
        if (this.elapsedSec - this.lastWakeSpawnSec > 0.14) {
          if (speedL > 1.25) {
            this.lastWakeSpawnSec = this.elapsedSec;
            this.aeroVortex.spawnVortex({
              kind: 'sleeve_wake',
              pos: { x: this.tmpLeftPalm.x, y: this.tmpLeftPalm.y, z: this.tmpLeftPalm.z },
              axis: { x: this.tmpVelLeft.x, y: this.tmpVelLeft.y, z: this.tmpVelLeft.z },
              circulation: Math.min(2.6, speedL * 0.72),
              radius: 0.17,
              expandRate: 0.48,
              driftSpeed: Math.min(1.4, speedL * 0.45),
              maxAge: 1.25,
            });
          } else if (speedR > 1.25) {
            this.lastWakeSpawnSec = this.elapsedSec;
            this.aeroVortex.spawnVortex({
              kind: 'sleeve_wake',
              pos: { x: this.tmpRightPalm.x, y: this.tmpRightPalm.y, z: this.tmpRightPalm.z },
              axis: { x: this.tmpVelRight.x, y: this.tmpVelRight.y, z: this.tmpVelRight.z },
              circulation: Math.min(2.6, speedR * 0.72),
              radius: 0.17,
              expandRate: 0.48,
              driftSpeed: Math.min(1.4, speedR * 0.45),
              maxAge: 1.25,
            });
          }
        }
        this.aeroVortex.update(simDt);
      }

      this.stageBuilder.update(simDt, this.tmpLeftPalm, this.tmpRightPalm, this.settings.shadowFlame);
      this.atmosphere.update(
        simDt,
        this.settings.stage,
        this.settings.aeroVortexEnabled ? this.aeroVortex : undefined
      );
      this.cameraDirector.update(silkyDt);

      // Sync 3D/4D HRTF AudioListener pose in JSound Engin 1.4 with live Cinema Camera!
      this.cameraDirector.camera.getWorldDirection(this.tmpCamForward);
      const camPos = this.cameraDirector.camera.position;
      this.sound.setListenerPose(
        { x: camPos.x, y: camPos.y, z: camPos.z },
        { x: this.tmpCamForward.x, y: this.tmpCamForward.y, z: this.tmpCamForward.z }
      );

      // ★ 3. SPECTRAL-RAY ACOUSTIC PROBE 1.0 (30Hz Throttled Real-Time 12-Path Camera Acoustics!) ★
      if (nowMs - this.lastProbeEvalMs >= 33) {
        this.lastProbeEvalMs = nowMs;
        const focusX = (this.tmpLeftPalm.x + this.tmpRightPalm.x) * 0.5;
        const focusY = Math.max(0.18, (this.tmpLeftPalm.y + this.tmpRightPalm.y) * 0.5);
        const focusZ = (this.tmpLeftPalm.z + this.tmpRightPalm.z) * 0.5;
        const probe = this.acousticProbe.evaluate(
          { x: camPos.x, y: camPos.y, z: camPos.z },
          { x: focusX, y: focusY, z: focusZ },
          this.settings.stage
        );
        this.sound.applyAcousticProbe(probe, this.settings.acousticProbeEnabled);
      }

      // Reset WebGL draw stats & execute KHDR 1.1 + Shadow Flame multi-pass render!
      this.renderer.info.reset();
      this.khdr.render(this.scene, this.cameraDirector.camera, this.sunWorldDir, this.elapsedSec);

      // Immediately capture fresh backbuffer for PV WebM recording or 1-click Cinema PNG Snapshot!
      this.pvDirector.onPostRender(this.canvas);

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
        const handDetailT = this.playerHand.getHandDetailTelemetry();
        const jsoundT = this.sound.getTelemetry();
        const aeroT = this.aeroVortex.getTelemetry();
        const probeT = this.acousticProbe.getSnapshot();

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
          fingerS1Active: this.settings.fingerS1Enabled,
          cameraStyle: this.settings.cameraStyle,
          jhandDof: jhandT.activeDof,
          jhandPoseCount: this.playerHand.kinesis.getPoseCount(),
          jhandPalmCupDeg: jhandT.palmCupDeg,
          jhandOrlRatio: jhandT.orlCouplingRatio,
          jhandIcrGlideMm: jhandT.icrGlideMm,
          jhandFdiPct: jhandT.fdiBulgePct,
          jhandSynergyJp: jhandT.synergyPhaseJp,
          dermaTendonLiftMm: handDetailT.dermaTendonLiftMm,
          dermaWrinklePct: handDetailT.dermaWrinklePct,
          dermaVolarCreasePct: handDetailT.dermaVolarCreasePct,
          dermaStatusJp: handDetailT.dermaStatusJp,
          nailBlanchPct: handDetailT.nailBlanchPct,
          vellusHairCount: handDetailT.vellusHairCount,
          jsoundRt60Sec: jsoundT.stageRt60Sec,
          jsoundEarlyRays: jsoundT.earlyRayCount,
          jsoundAmbisonicsOrder: jsoundT.ambisonicsOrder,
          jsoundFdtdNodes: jsoundT.fdtdGridNodes,
          jsoundOversampling: jsoundT.oversamplingFactor,
          jsoundDspRateKhz: Math.round(jsoundT.internalDspRateHz / 1000),
          jsoundCacheHitPct: jsoundT.cacheHitRatePct,
          jsoundSpatialMode: jsoundT.spatialMode,
          jsoundVoices: jsoundT.activeVoices,
          jsoundPeakDb: jsoundT.peakDb,
          jsoundLufsMomentary: jsoundT.lufsMomentary,
          jsoundTruePeakDbTp: jsoundT.truePeakDbTp,
          jsoundPhaseCorr: jsoundT.phaseCorrelation,
          jsoundWorkletActive: jsoundT.workletActive,
          jsoundMaterialPair: jsoundT.materialPairJp,
          jsoundLastEventJp: jsoundT.lastAcousticEventJp,
          // ★ Project KIWAMI-NEXT Live Multi-Engine Telemetry ★
          bioPulseBpm: bioSample.bpm,
          bioPulseWave: bioSample.pulseWave,
          bioCapillaryBlanchPct: Math.round(bioSample.capillaryBlanching * 100),
          bioStateJp: bioSample.stateLabelJp,
          aeroActiveVortices: aeroT.activeVortexCount,
          aeroPeakCirculation: aeroT.peakCirculation,
          aeroPeakSpeedMs: aeroT.peakAirSpeedMs,
          aeroPhenomenonJp: aeroT.lastPhenomenonJp,
          probeDistanceM: probeT.cameraDistanceM,
          probeDrDb: probeT.directToReverbDb,
          probeProximityDb: probeT.proximityWarmthDb,
          probeAirCutoffKhz: Number((probeT.airCutoffHz / 1000).toFixed(1)),
          probeNearestJp: probeT.nearestBoundaryJp,
        });
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.pvDirector.dispose();
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
