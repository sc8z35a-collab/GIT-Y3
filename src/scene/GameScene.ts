/**
 * Master Three.js WebGL2 3D Engine Orchestrator for JANKEN KIWAMI 3D.
 *
 * Unifies:
 *  - Shadow Flame 1.0 Flash / Pro (patched before shader compilation)
 *  - KHDR (Kinetic Dual-Lobe Spectral HDR) 16-bit HalfFloat pipeline + SF-SSCS
 *  - True selectable internal resolutions (HD / FHD / 1.5K / 2K)
 *  - Real precision FPS pacing (60 / 120 / Unlimited) + live FPS & 1% Low telemetry
 *  - Dual 21-Bone Sculpted Anatomical Hands with fluid Jan-Ken-Pon choreography
 *  - 5 Switchable Photorealistic Architectural Stages built from extracted user atlases
 */

import * as THREE from 'three';
import { SoundEngine } from '../audio/SoundEngine';
import { Move, PlayerOutcome } from '../engine/jnv1/types';
import {
  DEFAULT_GRAPHICS_SETTINGS,
  FpsLimitMode,
  GraphicsSettings,
  HandMaterialPreset,
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
  onBeat?: (label: string) => void;
  onReveal?: () => void;
  onFinished?: () => void;
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

  // Dual 21-Bone Articulated Sculptural Hands
  private readonly playerHand: SculptedHandRig;
  private readonly npcHand: SculptedHandRig;
  private readonly tmpLeftPalm = new THREE.Vector3();
  private readonly tmpRightPalm = new THREE.Vector3();

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

  // Duel choreography timers
  private animTimers: number[] = [];
  private isAnimatingRound = false;
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
      antialias: false, // Supersampled 1.5K/2K HalfFloat target handles AA crisply
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // Handled directly by KHDRPipeline!
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
    this.sunLight = new THREE.DirectionalLight(0xffe4bc, 3.15);
    this.sunLight.castShadow = true;
    // Tight orthographic shadow frustum focused right around the duel arena for razor-sharp texel density!
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

    // Stage Builder + Persistent Diegetic Props
    this.stageBuilder = new StageBuilder(this.textures);
    this.scene.add(this.stageBuilder.stageGroup);
    this.scene.add(this.stageBuilder.propsGroup);

    // Atmosphere & Physical Clash Flakes
    this.atmosphere = new AtmosphereEffects();
    this.scene.add(this.atmosphere.group);

    // Dual 21-Bone Sculpted Hands positioned cleanly over the central brass medallion
    this.playerHand = new SculptedHandRig(this.textures, this.settings.playerHandMaterial, true);
    this.playerHand.root.position.set(-0.66, 0.25, 0.22);
    this.playerHand.root.rotation.set(0.08, Math.PI * 0.45, 0.0);
    this.scene.add(this.playerHand.root);

    this.npcHand = new SculptedHandRig(this.textures, this.settings.npcHandMaterial, false);
    this.npcHand.root.position.set(0.66, 0.25, 0.08);
    this.npcHand.root.rotation.set(0.08, -Math.PI * 0.45, 0.0);
    this.scene.add(this.npcHand.root);

    // Apply initial stage, KHDR, and Shadow Flame settings
    this.applyStage(this.settings.stage);
    this.applyShadowFlame(this.settings.shadowFlame);
    this.applyKHDR(this.settings.khdrEnabled, this.settings.khdrSplitCompare);

    // Observe container resize
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

  public applyStage(stageId: StageId): void {
    this.settings.stage = stageId;
    const def = this.stageBuilder.buildStage(stageId);

    this.scene.environment = this.hdriBuilder.getEnvironment(stageId);
    this.scene.background = new THREE.Color(def.backgroundColor);
    this.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);

    this.sunLight.position.set(...def.sunDirection);
    this.sunLight.color.setHex(def.sunColor);
    this.sunLight.intensity = def.sunIntensity;
    this.sunLight.target.position.set(0, 0.1, 0);
    this.sunWorldDir.copy(this.sunLight.position).normalize();

    this.rimLight.color.setHex(def.fillColor);
    this.rimLight.intensity = def.fillIntensity;

    this.hemiLight.color.setHex(def.hemiSky);
    this.hemiLight.groundColor.setHex(def.hemiGround);
    this.hemiLight.intensity = def.hemiIntensity;

    this.khdr.exposure = def.exposure;
    this.atmosphere.setStageMood(stageId);
  }

  public setHandMaterials(playerMat: HandMaterialPreset, npcMat: HandMaterialPreset): void {
    this.settings.playerHandMaterial = playerMat;
    this.settings.npcHandMaterial = npcMat;
    this.playerHand.setMaterialPreset(playerMat);
    this.npcHand.setMaterialPreset(npcMat);
  }

  public setTableScores(playerWins: number, npcWins: number): void {
    this.stageBuilder.setScores(playerWins, npcWins);
  }

  public syncJNVClockwork(confidence: number, volatility: number, pulse = false): void {
    this.stageBuilder.syncJNVClockwork(confidence, volatility, pulse);
  }

  public resetHandsToReady(): void {
    this.clearAnimTimers();
    this.isAnimatingRound = false;
    this.playerHand.setTargetPose('ready', 11.0);
    this.npcHand.setTargetPose('ready', 11.0);
    this.playerHand.targetOffset.set(0, 0, 0);
    this.npcHand.targetOffset.set(0, 0, 0);
    this.playerHand.targetExtraPitch = 0;
    this.npcHand.targetExtraPitch = 0;
    this.cameraDirector.setMood('idle');
  }

  /**
   * Subtle tactile hover anticipation on the Player's 3D hand when hovering Rock/Scissors/Paper!
   */
  public previewHoverMove(move: Move | null): void {
    if (this.isAnimatingRound) return;
    if (move === null) {
      this.playerHand.setTargetPose('ready', 10.0);
      this.playerHand.targetOffset.set(0, 0, 0);
    } else {
      this.playerHand.setTargetPose(move, 12.0);
      this.playerHand.targetOffset.set(0.03, 0.025, 0);
    }
  }

  /**
   * Execute crisp, rhythmic 3D "Jan-Ken-Pon!" choreography!
   */
  public playClashSequence(
    playerMove: Move,
    npcMove: Move,
    outcome: PlayerOutcome,
    isAikoFollowup: boolean,
    callbacks: ClashAnimationCallbacks = {}
  ): void {
    this.clearAnimTimers();
    this.isAnimatingRound = true;

    const beat1Label = isAikoFollowup ? 'あいこで…' : 'じゃーん…';
    const beat2Label = isAikoFollowup ? 'しょっ!!' : 'けーん…';
    const beat3Label = isAikoFollowup ? 'しょっ!!' : 'ぽん!!';

    // Beat 1: Both hands close into poised fists & pump upward
    this.cameraDirector.setMood('windup');
    this.playerHand.setTargetPose('windup', 18.0);
    this.npcHand.setTargetPose('windup', 18.0);
    this.playerHand.targetOffset.set(-0.08, 0.2, 0);
    this.npcHand.targetOffset.set(0.08, 0.2, 0);
    this.playerHand.targetExtraPitch = -0.26;
    this.npcHand.targetExtraPitch = -0.26;
    this.sound.playBeat(1);
    callbacks.onBeat?.(beat1Label);

    const schedule = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      this.animTimers.push(id);
    };

    if (!isAikoFollowup) {
      // Mid dip
      schedule(140, () => {
        this.playerHand.targetOffset.set(-0.04, -0.02, 0);
        this.npcHand.targetOffset.set(0.04, -0.02, 0);
        this.playerHand.targetExtraPitch = 0.14;
        this.npcHand.targetExtraPitch = 0.14;
      });

      // Beat 2: Higher crisp anticipation lift
      schedule(250, () => {
        this.playerHand.targetOffset.set(-0.11, 0.25, 0);
        this.npcHand.targetOffset.set(0.11, 0.25, 0);
        this.playerHand.targetExtraPitch = -0.32;
        this.npcHand.targetExtraPitch = -0.32;
        this.sound.playBeat(2);
        callbacks.onBeat?.(beat2Label);
      });
    }

    const revealDelay = isAikoFollowup ? 260 : 470;

    // Beat 3: PON!! Dramatic snap forward + full 21-bone articulation + physical clash burst!
    schedule(revealDelay, () => {
      this.cameraDirector.setMood('clash');
      this.cameraDirector.triggerImpactImpulse(outcome === 'DRAW' ? 0.02 : 0.036);

      this.playerHand.setTargetPose(playerMove, 26.0);
      this.npcHand.setTargetPose(npcMove, 26.0);

      const winnerMove = outcome === 'LOSS' ? npcMove : playerMove;
      this.sound.playClashImpact(outcome, winnerMove);
      this.atmosphere.emitClashBurst(outcome, new THREE.Vector3(0, 0.32, 0.04));

      if (outcome === 'WIN') {
        this.playerHand.targetOffset.set(0.18, 0.02, 0.02);
        this.npcHand.targetOffset.set(0.02, -0.02, -0.04);
        this.playerHand.targetExtraPitch = 0.04;
        this.npcHand.targetExtraPitch = -0.18;
        this.npcHand.triggerRecoil(1.0);
      } else if (outcome === 'LOSS') {
        this.playerHand.targetOffset.set(-0.02, -0.02, 0.04);
        this.npcHand.targetOffset.set(-0.18, 0.02, -0.02);
        this.playerHand.targetExtraPitch = -0.18;
        this.npcHand.targetExtraPitch = 0.04;
        this.playerHand.triggerRecoil(1.0);
      } else {
        // DRAW: Perfectly mirrored dead-center standoff!
        this.playerHand.targetOffset.set(0.11, 0.01, 0.01);
        this.npcHand.targetOffset.set(-0.11, 0.01, -0.01);
        this.playerHand.targetExtraPitch = 0.02;
        this.npcHand.targetExtraPitch = 0.02;
        this.playerHand.triggerRecoil(0.55);
        this.npcHand.triggerRecoil(0.55);
      }

      callbacks.onBeat?.(beat3Label);
      callbacks.onReveal?.();
    });

    // Follow-through dramatic framing
    schedule(revealDelay + 340, () => {
      if (outcome === 'WIN') {
        this.cameraDirector.setMood('victory');
        this.playerHand.targetOffset.set(0.16, 0.08, 0.02);
      } else if (outcome === 'LOSS') {
        this.cameraDirector.setMood('defeat');
        this.npcHand.targetOffset.set(-0.16, 0.08, -0.02);
      }
      this.isAnimatingRound = false;
      callbacks.onFinished?.();
    });
  }

  private clearAnimTimers(): void {
    for (const id of this.animTimers) window.clearTimeout(id);
    this.animTimers.length = 0;
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
        // 0.7ms tolerance prevents double-skipping on 60Hz/120Hz VSync boundaries
        if (nowMs - this.lastRenderTimestamp < minInterval - 0.7) {
          return;
        }
      }

      const frameMs = Math.max(0.1, nowMs - this.lastRenderTimestamp);
      this.lastRenderTimestamp = nowMs;

      const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastLogicTimestamp) / 1000));
      this.lastLogicTimestamp = nowMs;
      this.elapsedSec += dt;

      // Update 3D animation, physics, atmosphere, and diegetic props
      this.playerHand.update(dt);
      this.npcHand.update(dt);
      this.playerHand.getPalmWorldPosition(this.tmpLeftPalm);
      this.npcHand.getPalmWorldPosition(this.tmpRightPalm);

      this.stageBuilder.update(dt, this.tmpLeftPalm, this.tmpRightPalm, this.settings.shadowFlame);
      this.atmosphere.update(dt, this.settings.stage);
      this.cameraDirector.update(dt);

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
        });
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.clearAnimTimers();
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
