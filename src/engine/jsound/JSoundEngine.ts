/**
 * ★ JSound Engin 1.0 — Proprietary Physical-Modeling & 3D Spatial Acoustic Engine ★
 *
 * Complete 8-Module Web Audio DSP Engine built from first principles (zero external audio files):
 *   1. Physical Modal & Hertzian Contact Synthesis (material-aware up to 16 modes + beating doublets)
 *   2. Dual-Material Coupled Clash Acoustics (Player Hand × NPC Hand × Stage Tabletop)
 *   3. Strouhal Aerodynamic Vortex-Shedding Whoosh & Stick-Slip Scissors Shear
 *   4. JHand Kinesis 1.0 Real-Time Micro-Joint Foley Coupling
 *   5. 3D Image-Source Early Reflections + Dual-Band Velvet-Noise Convolution Reverb
 *      with seamless Dual-Convolver A/B stage crossfading
 *   6. Living Procedural Stage Ambience (Onsen limestone waterfall, Shrine breeze, etc.)
 *   7. True 3D HRTF Spatial Panner Bus synced to Three.js camera & hand coordinates
 *   8. Studio Mastering Chain (Analog Tilt EQ -> Soft-Knee Compressor -> True-Peak Limiter -> Metering)
 */

import { HandFoleyEvent } from '../jhand/types';
import { Move, PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { HandMaterialPreset, StageId } from '../../graphics/GraphicsConfig';
import {
  synthesizeAeroWhoosh,
  synthesizeJointFoley,
  synthesizeScissorsShear,
} from './AeroAndFrictionSynth';
import {
  synthesizeDualMaterialClash,
  synthesizeModalImpact,
  synthesizeRinBellNote,
} from './ModalSynthesizer';
import { generateStageImpulseResponse } from './StageAcoustics';
import { generateStageAmbienceBuffer } from './StageAmbience';
import {
  ACOUSTIC_MATERIALS,
  JSoundQualityMode,
  JSoundSettings,
  JSoundTelemetry,
  STAGE_ACOUSTIC_PROFILES,
  Vec3,
} from './types';

export class JSoundEngine {
  public settings: JSoundSettings = {
    enabled: true,
    quality: 'pro',
    ambienceEnabled: true,
    masterVolume: 0.92,
  };

  private ctx: AudioContext | null = null;
  private unlocked = false;
  private initializedGraph = false;

  // Live scene context (materials + architectural stage)
  private currentStage: StageId = 'zashiki';
  private playerMaterial: HandMaterialPreset = 'hinoki_ivory';
  private npcMaterial: HandMaterialPreset = 'karakuri_bronze';

  // Studio Mastering Bus Nodes
  private dryBus!: GainNode;
  private reverbSendBus!: GainNode;
  private convA!: ConvolverNode;
  private convB!: ConvolverNode;
  private convGainA!: GainNode;
  private convGainB!: GainNode;
  private activeConvSlot: 'A' | 'B' = 'A';

  private ambienceBus!: GainNode;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private masterGain!: GainNode;
  private analyser!: AnalyserNode;
  private meterScratch = new Float32Array(512);

  // Caches for instant zero-hitch playback
  private irCache = new Map<string, AudioBuffer>();
  private ambienceCache = new Map<StageId, AudioBuffer>();

  // Voice, metering & listener-delta tracking
  private activeVoices = 0;
  private readonly maxVoices = 26;
  private seedCounter = 20261119;
  private lastJointFoleyMs = 0;
  private lastLisPos: Vec3 = { x: NaN, y: NaN, z: NaN };
  private lastLisFwd: Vec3 = { x: NaN, y: NaN, z: NaN };

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = (): void => {
        this.unlocked = true;
        const wasInit = this.initializedGraph;
        const ctx = this.ensureReady();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume();
        }
        // Start subtle living stage ambience gently once user interacts (if not already started in ensureReady)
        if (wasInit && ctx && this.settings.enabled && this.settings.ambienceEnabled && !this.ambienceSource) {
          this.startOrCrossfadeAmbience();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true, once: true });
      window.addEventListener('keydown', unlock, { passive: true, once: true });
    }
  }

  public get enabled(): boolean {
    return this.settings.enabled;
  }

  public set enabled(v: boolean) {
    this.setEnabled(v);
  }

  private nextSeed(): number {
    this.seedCounter = (this.seedCounter + 7919) >>> 0;
    return this.seedCounter;
  }

  private ensureReady(): AudioContext | null {
    if (!this.settings.enabled) return null;
    if (typeof window === 'undefined') return null;

    const navAct = (navigator as unknown as { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    const canStart = this.unlocked || Boolean(navAct?.hasBeenActive);
    if (!canStart) return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    }

    if (!this.initializedGraph && this.ctx) {
      this.buildMasteringGraph(this.ctx);
      this.initializedGraph = true;
      this.applyStageAcoustics(this.currentStage, true);
      if (this.settings.ambienceEnabled) {
        this.startOrCrossfadeAmbience();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Build 8-Stage Studio Mastering & Spatial Routing Graph:
   *   Sources -> 3D HRTF Panner -> DryBus + ReverbSendBus (Dual-Convolver A/B)
   *           + AmbienceBus -> Analog Tilt EQ -> Bus Compressor -> Peak Limiter -> MasterGain -> Analyser -> Out
   */
  private buildMasteringGraph(ctx: AudioContext): void {
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;

    this.reverbSendBus = ctx.createGain();
    this.reverbSendBus.gain.value = STAGE_ACOUSTIC_PROFILES[this.currentStage].reverbSend;

    // Dual-Convolver A/B for click-free architectural stage switching!
    this.convA = ctx.createConvolver();
    this.convB = ctx.createConvolver();
    this.convGainA = ctx.createGain();
    this.convGainB = ctx.createGain();
    this.convGainA.gain.value = 1.0;
    this.convGainB.gain.value = 0.0;

    this.reverbSendBus.connect(this.convA);
    this.reverbSendBus.connect(this.convB);
    this.convA.connect(this.convGainA);
    this.convB.connect(this.convGainB);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this.settings.ambienceEnabled
      ? STAGE_ACOUSTIC_PROFILES[this.currentStage].ambienceGain
      : 0.0;

    // Warm Analog-Modeled Mastering Tilt EQ (subtle wooden low-body warmth + silk air sheen)
    const warmthShelf = ctx.createBiquadFilter();
    warmthShelf.type = 'lowshelf';
    warmthShelf.frequency.value = 135;
    warmthShelf.gain.value = 1.8;

    const airShelf = ctx.createBiquadFilter();
    airShelf.type = 'highshelf';
    airShelf.frequency.value = 7200;
    airShelf.gain.value = 1.4;

    // Studio Glue Bus Compressor (soft-knee cohesion)
    const busComp = ctx.createDynamicsCompressor();
    busComp.threshold.value = -14;
    busComp.knee.value = 14;
    busComp.ratio.value = 2.8;
    busComp.attack.value = 0.008;
    busComp.release.value = 0.14;

    // Look-Ahead Style True-Peak Protective Limiter (-1.2 dBFS ceiling, zero digital clipping)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.055;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.settings.enabled ? this.settings.masterVolume : 0.0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;

    // Wire buses into mastering chain
    this.dryBus.connect(warmthShelf);
    this.convGainA.connect(warmthShelf);
    this.convGainB.connect(warmthShelf);
    this.ambienceBus.connect(warmthShelf);

    warmthShelf.connect(airShelf);
    airShelf.connect(busComp);
    busComp.connect(limiter);
    limiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Default listener orientation matching main duel camera
    this.setListenerPose({ x: 0, y: 1.55, z: 2.35 }, { x: 0, y: -0.52, z: -0.85 });
  }

  private toAudioBuffer(ctx: AudioContext, left: Float32Array, right?: Float32Array): AudioBuffer {
    const ch = right ? 2 : 1;
    const buf = ctx.createBuffer(ch, left.length, ctx.sampleRate);
    buf.getChannelData(0).set(left);
    if (right) {
      buf.getChannelData(1).set(right);
    }
    return buf;
  }

  private getStageIRBuffer(ctx: AudioContext, stageId: StageId): AudioBuffer {
    const key = `${stageId}:${this.settings.quality}`;
    const cached = this.irCache.get(key);
    if (cached) return cached;

    const ir = generateStageImpulseResponse(stageId, ctx.sampleRate, this.settings.quality);
    const buf = this.toAudioBuffer(ctx, ir.left, ir.right);
    this.irCache.set(key, buf);
    return buf;
  }

  private applyStageAcoustics(stageId: StageId, immediate = false): void {
    if (!this.ctx || !this.initializedGraph) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const profile = STAGE_ACOUSTIC_PROFILES[stageId];
    const irBuf = this.getStageIRBuffer(ctx, stageId);

    this.reverbSendBus.gain.cancelScheduledValues(now);
    this.reverbSendBus.gain.setTargetAtTime(profile.reverbSend, now, immediate ? 0.01 : 0.16);

    if (immediate) {
      this.convA.buffer = irBuf;
      this.convGainA.gain.setValueAtTime(1.0, now);
      this.convGainB.gain.setValueAtTime(0.0, now);
      this.activeConvSlot = 'A';
      return;
    }

    // Seamless Dual-Convolver A/B crossfade (zero clicks when changing architectural stages!)
    const nextSlot = this.activeConvSlot === 'A' ? 'B' : 'A';
    const nextConv = nextSlot === 'A' ? this.convA : this.convB;
    const nextGain = nextSlot === 'A' ? this.convGainA : this.convGainB;
    const prevGain = nextSlot === 'A' ? this.convGainB : this.convGainA;

    nextConv.buffer = irBuf;
    nextGain.gain.cancelScheduledValues(now);
    prevGain.gain.cancelScheduledValues(now);
    nextGain.gain.setValueAtTime(nextGain.gain.value, now);
    prevGain.gain.setValueAtTime(prevGain.gain.value, now);
    nextGain.gain.linearRampToValueAtTime(1.0, now + 0.42);
    prevGain.gain.linearRampToValueAtTime(0.0, now + 0.42);
    this.activeConvSlot = nextSlot;
  }

  private startOrCrossfadeAmbience(): void {
    if (!this.ctx || !this.initializedGraph) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop(now + 0.05);
      } catch {
        // already stopped
      }
      this.ambienceSource.disconnect();
      this.ambienceSource = null;
    }

    if (!this.settings.enabled || !this.settings.ambienceEnabled) {
      this.ambienceBus.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }

    let ambBuf = this.ambienceCache.get(this.currentStage);
    if (!ambBuf) {
      const raw = generateStageAmbienceBuffer(this.currentStage, ctx.sampleRate, 4.2);
      ambBuf = this.toAudioBuffer(ctx, raw.left, raw.right);
      this.ambienceCache.set(this.currentStage, ambBuf);
    }

    const src = ctx.createBufferSource();
    src.buffer = ambBuf;
    src.loop = true;
    src.connect(this.ambienceBus);
    src.start(now);
    this.ambienceSource = src;

    const targetGain = STAGE_ACOUSTIC_PROFILES[this.currentStage].ambienceGain;
    this.ambienceBus.gain.cancelScheduledValues(now);
    this.ambienceBus.gain.setValueAtTime(0.0001, now);
    this.ambienceBus.gain.linearRampToValueAtTime(targetGain, now + 0.65);
  }

  /**
   * Play a synthesized buffer through a 3D HRTF Spatial Panner into both Dry & Stage Reverb buses!
   */
  private playSpatialBuffer(
    buf: AudioBuffer,
    worldPos: Vec3,
    options: {
      gain?: number;
      reverbScale?: number;
      delaySec?: number;
      playbackRate?: number;
    } = {}
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.initializedGraph || !this.settings.enabled) return;
    if (this.activeVoices >= this.maxVoices) return;

    const startAt = ctx.currentTime + (options.delaySec ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (options.playbackRate) {
      src.playbackRate.setValueAtTime(options.playbackRate, startAt);
    }

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(options.gain ?? 0.9, startAt);

    // 3D Spatial Panner (True HRTF binaural in Pro; equalpower in Lite)
    const panner = ctx.createPanner();
    panner.panningModel = this.settings.quality === 'pro' ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.6;
    panner.maxDistance = 14;
    panner.rolloffFactor = 0.72;
    panner.positionX.setValueAtTime(worldPos.x, startAt);
    panner.positionY.setValueAtTime(worldPos.y, startAt);
    panner.positionZ.setValueAtTime(worldPos.z, startAt);

    src.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(this.dryBus);

    const revScale = options.reverbScale ?? 1.0;
    let wetTap: GainNode | null = null;
    if (revScale > 0.01) {
      wetTap = ctx.createGain();
      wetTap.gain.setValueAtTime(revScale, startAt);
      panner.connect(wetTap);
      wetTap.connect(this.reverbSendBus);
    }

    this.activeVoices++;
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      src.disconnect();
      voiceGain.disconnect();
      panner.disconnect();
      wetTap?.disconnect();
    };

    src.start(startAt);
  }

  // ===========================================================================
  // PUBLIC SCENE CONFIGURATION & SPATIAL SYNC API
  // ===========================================================================

  public setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    if (this.ctx && this.initializedGraph) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(enabled ? this.settings.masterVolume : 0.0, now, 0.03);
      if (enabled && this.settings.ambienceEnabled) {
        this.startOrCrossfadeAmbience();
      } else if (!enabled && this.ambienceSource) {
        this.ambienceBus.gain.setTargetAtTime(0.0, now, 0.05);
      }
    }
  }

  public setQualityMode(mode: JSoundQualityMode): void {
    if (this.settings.quality === mode) return;
    this.settings.quality = mode;
    if (this.ctx && this.initializedGraph) {
      this.applyStageAcoustics(this.currentStage, false);
    }
  }

  public setAmbienceEnabled(enabled: boolean): void {
    this.settings.ambienceEnabled = enabled;
    if (this.ctx && this.initializedGraph) {
      this.startOrCrossfadeAmbience();
    }
  }

  public setStage(stageId: StageId): void {
    if (this.currentStage === stageId) return;
    this.currentStage = stageId;
    if (this.ctx && this.initializedGraph) {
      this.applyStageAcoustics(stageId, false);
      if (this.settings.ambienceEnabled) {
        this.startOrCrossfadeAmbience();
      }
    }
  }

  public setHandMaterials(playerMat: HandMaterialPreset, npcMat: HandMaterialPreset): void {
    this.playerMaterial = playerMat;
    this.npcMaterial = npcMat;
  }

  /** Sync 3D HRTF Listener pose directly with Three.js Cinema Camera */
  public setListenerPose(pos: Vec3, forward: Vec3): void {
    if (!this.ctx || !this.initializedGraph) return;
    const dp =
      Math.abs(pos.x - this.lastLisPos.x) +
      Math.abs(pos.y - this.lastLisPos.y) +
      Math.abs(pos.z - this.lastLisPos.z);
    const df =
      Math.abs(forward.x - this.lastLisFwd.x) +
      Math.abs(forward.y - this.lastLisFwd.y) +
      Math.abs(forward.z - this.lastLisFwd.z);
    if (dp < 1e-4 && df < 1e-4) return;

    this.lastLisPos = { x: pos.x, y: pos.y, z: pos.z };
    this.lastLisFwd = { x: forward.x, y: forward.y, z: forward.z };

    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  // ===========================================================================
  // PUBLIC PHYSICAL SOUND EFFECTS & FOLEY TRIGGERS
  // ===========================================================================

  /** Tactile lacquered-hinoki UI tap / hover click */
  public playWoodTap(pitch = 680): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const pitchScale = Math.max(0.65, Math.min(2.2, pitch / 520));
    const pcm = synthesizeModalImpact('hinoki_ivory', ctx.sampleRate, {
      velocity: 0.42,
      pitchScale,
      durationSec: 0.14,
      quality: this.settings.quality,
      seed: this.nextSeed(),
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), { x: 0, y: 0.25, z: 0.85 }, {
      gain: 0.34,
      reverbScale: 0.35,
    });
  }

  /** Strouhal aerodynamic kimono/sleeve air-whoosh */
  public playWhoosh(intensity = 1.0, pitchMult = 1.0, worldPos: Vec3 = { x: 0, y: 0.32, z: 0.12 }): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const whoosh = synthesizeAeroWhoosh(ctx.sampleRate, {
      speed: Math.max(0.5, Math.min(2.0, intensity * pitchMult)),
      durationSec: 0.24,
      fabricRoughness: 0.78,
      seed: this.nextSeed(),
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, whoosh.left, whoosh.right), worldPos, {
      gain: 0.56 * Math.min(1.3, intensity),
      reverbScale: 0.7,
    });
  }

  /** Real-Time JHand Kinesis 1.0 Joint-Articulation Micro-Foley Stream! */
  public playHandFoley(
    ev: HandFoleyEvent,
    side: 'player' | 'npc',
    worldPos: Vec3
  ): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    // Gentle rate-limiter (max 1 micro-joint click every 42ms) so chords of fingers sound organic, not cluttered
    const nowMs = performance.now();
    if (ev.type !== 'scissors_shear' && nowMs - this.lastJointFoleyMs < 42) return;
    this.lastJointFoleyMs = nowMs;

    const mat = side === 'player' ? this.playerMaterial : this.npcMaterial;
    if (ev.type === 'scissors_shear') {
      const shear = synthesizeScissorsShear(
        mat,
        ctx.sampleRate,
        0.75 + ev.intensity * 0.4,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(this.toAudioBuffer(ctx, shear), worldPos, {
        gain: 0.52,
        reverbScale: 0.85,
      });
      return;
    }

    const pcm = synthesizeJointFoley(
      ev.type,
      mat,
      ev.intensity,
      ctx.sampleRate,
      this.settings.quality,
      this.nextSeed()
    );
    this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), worldPos, {
      gain: ev.type === 'palm_clench' ? 0.36 : 0.24,
      reverbScale: 0.55,
    });
  }

  /** Precision watchmaker brass lever-escapement double-tick on JNV1.0 SHA-256 commit seal! */
  public playClockworkLock(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const pos: Vec3 = { x: 0.55, y: 0.08, z: -0.35 }; // Exact 3D JNV1.0 clockwork medallion coords!
    for (let i = 0; i < 2; i++) {
      const pcm = synthesizeModalImpact('clockwork_escapement', ctx.sampleRate, {
        velocity: i === 0 ? 0.58 : 0.72,
        pitchScale: i === 0 ? 0.94 : 1.18,
        durationSec: 0.085,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), pos, {
        gain: 0.28,
        reverbScale: 0.65,
        delaySec: i * 0.044,
      });
    }
  }

  /** Authentic Rosewood Hyoshigi (拍子木) percussion beat + synced sleeve whoosh */
  public playBeat(step: 1 | 2): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const pcm = synthesizeModalImpact('hyoshigi_rosewood', ctx.sampleRate, {
      velocity: step === 1 ? 0.92 : 1.12,
      pitchScale: step === 1 ? 0.94 : 1.14,
      durationSec: 0.28,
      quality: this.settings.quality,
      seed: this.nextSeed(),
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), { x: 0, y: 0.55, z: -0.2 }, {
      gain: 0.64,
      reverbScale: 1.05,
    });
    this.playWhoosh(step === 1 ? 0.68 : 0.98, step === 1 ? 0.92 : 1.18, { x: 0, y: 0.35, z: 0.1 });
  }

  /** Twin forged-blade scissors shear snips positioned at winning hand */
  public playScissorsDoubleSnip(side: 'player' | 'npc' = 'player'): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const mat = side === 'player' ? this.playerMaterial : this.npcMaterial;
    const pos: Vec3 = { x: side === 'player' ? -0.18 : 0.18, y: 0.32, z: 0.12 };
    for (let i = 0; i < 2; i++) {
      const pcm = synthesizeScissorsShear(
        mat,
        ctx.sampleRate,
        1.05 - i * 0.14,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), pos, {
        gain: 0.58,
        reverbScale: 0.9,
        delaySec: i * 0.148,
      });
    }
  }

  /**
   * Real-time ballistic Go-stone impact synced to exact 3D stone bounce velocity & scoreboard side!
   */
  public playGoStoneImpact(
    side: 'player' | 'npc',
    velocity = 1.0,
    worldPos?: Vec3
  ): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const stoneMat = side === 'player' ? 'go_stone_ivory' : 'go_stone_bronze';
    const pos: Vec3 = worldPos ?? { x: side === 'player' ? -0.45 : 0.45, y: 0.04, z: -0.32 };
    const v = Math.max(0.12, Math.min(1.3, velocity));

    const stonePcm = synthesizeModalImpact(stoneMat, ctx.sampleRate, {
      velocity: v,
      pitchScale: 0.96 + (1 - Math.min(1, v)) * 0.08,
      durationSec: 0.18,
      quality: this.settings.quality,
      seed: this.nextSeed(),
    });
    const trayPcm = synthesizeModalImpact('chabudai_oak', ctx.sampleRate, {
      velocity: v * 0.55,
      pitchScale: 1.5,
      durationSec: 0.14,
      quality: this.settings.quality,
      seed: this.nextSeed(),
    });

    // Mix crisp stone click + warm walnut scoreboard tray resonance
    const mix = new Float32Array(stonePcm.length);
    for (let i = 0; i < mix.length; i++) {
      mix[i] = Math.tanh(stonePcm[i] * 0.78 + (i < trayPcm.length ? trayPcm[i] * 0.35 : 0));
    }

    this.playSpatialBuffer(this.toAudioBuffer(ctx, mix), pos, {
      gain: 0.56 * Math.min(1.0, 0.25 + v * 0.75),
      reverbScale: 0.85,
    });
  }

  /** Legacy convenience wrapper when triggered as a triple-bounce burst */
  public playGoStoneBounce(side: 'player' | 'npc' = 'player'): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const taps = [
      { dt: 0.0, v: 1.0 },
      { dt: 0.125, v: 0.46 },
      { dt: 0.195, v: 0.22 },
    ];
    const stoneMat = side === 'player' ? 'go_stone_ivory' : 'go_stone_bronze';
    const pos: Vec3 = { x: side === 'player' ? -0.45 : 0.45, y: 0.04, z: -0.32 };
    for (const tap of taps) {
      const pcm = synthesizeModalImpact(stoneMat, ctx.sampleRate, {
        velocity: tap.v,
        durationSec: 0.16,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), pos, {
        gain: 0.54 * tap.v,
        reverbScale: 0.8,
        delaySec: tap.dt,
      });
    }
  }

  /**
   * ★ Signature Dual-Material 3D Clash Impact + Physical Rin-Bell Verdict Resonance ★
   */
  public playClashImpact(outcome: 'WIN' | 'LOSS' | 'DRAW', winnerMove: Move): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const tableMat = STAGE_ACOUSTIC_PROFILES[this.currentStage].tableMaterial;
    const clash = synthesizeDualMaterialClash(
      this.playerMaterial,
      this.npcMaterial,
      tableMat,
      winnerMove,
      outcome,
      ctx.sampleRate,
      this.settings.quality,
      this.nextSeed()
    );

    // 1. Physical Dual-Material Contact Impact dead-center on the duel table!
    this.playSpatialBuffer(
      this.toAudioBuffer(ctx, clash.left, clash.right),
      { x: 0, y: 0.26, z: 0.08 },
      { gain: 0.88, reverbScale: 1.15 }
    );

    // 2. Physical Hand-Hammered Japanese Rin-Bell (おりん) Outcome Harmony
    const notes =
      outcome === 'WIN'
        ? [523.25, 659.25, 783.99] // Warm gold C5 major resonance
        : outcome === 'LOSS'
        ? [392.0, 311.13] // Deep muted bronze minor interval
        : [440.0, 587.33]; // Crisp neutral bamboo fourth

    notes.forEach((hz, idx) => {
      const bell = synthesizeRinBellNote(
        hz,
        ctx.sampleRate,
        outcome === 'WIN' ? 1.45 : 1.05,
        outcome === 'WIN' ? 0.58 : 0.42,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(
        this.toAudioBuffer(ctx, bell),
        { x: (idx - 1) * 0.42, y: 0.72, z: -0.35 },
        {
          gain: outcome === 'WIN' ? 0.34 : 0.26,
          reverbScale: 1.35,
          delaySec: 0.04 + idx * 0.055,
        }
      );
    });
  }

  /** Ceremonial Japanese Temple Rin-Bell Harmonic Triad for Match Victory / Defeat */
  public playMatchVictoryChord(playerWon: boolean): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const freqs = playerWon ? [523.25, 659.25, 783.99, 1046.5] : [329.63, 293.66, 220.0];
    freqs.forEach((hz, idx) => {
      const bell = synthesizeRinBellNote(
        hz,
        ctx.sampleRate,
        2.35,
        playerWon ? 0.72 : 0.52,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(
        this.toAudioBuffer(ctx, bell),
        { x: (idx - 1.5) * 0.55, y: 0.88, z: -0.45 },
        {
          gain: playerWon ? 0.42 : 0.32,
          reverbScale: 1.55,
          delaySec: idx * 0.095,
        }
      );
    });
  }

  /** Live Real-Time Acoustic Metering & Engine Telemetry */
  public getTelemetry(): JSoundTelemetry {
    let rmsDb = -96;
    let peakDb = -96;

    if (this.ctx && this.initializedGraph && this.settings.enabled) {
      this.analyser.getFloatTimeDomainData(this.meterScratch);
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < this.meterScratch.length; i++) {
        const v = Math.abs(this.meterScratch[i]);
        sumSq += v * v;
        if (v > peak) peak = v;
      }
      const rms = Math.sqrt(sumSq / this.meterScratch.length);
      rmsDb = rms > 1e-5 ? Math.max(-72, Math.round(20 * Math.log10(rms))) : -72;
      peakDb = peak > 1e-5 ? Math.max(-72, Math.round(20 * Math.log10(peak))) : -72;
    }

    const pJp = ACOUSTIC_MATERIALS[this.playerMaterial].labelJp;
    const nJp = ACOUSTIC_MATERIALS[this.npcMaterial].labelJp;

    return {
      engineName: 'JSound Engin 1.0',
      enabled: this.settings.enabled,
      quality: this.settings.quality,
      ambienceEnabled: this.settings.ambienceEnabled,
      stageId: this.currentStage,
      stageRt60Sec: STAGE_ACOUSTIC_PROFILES[this.currentStage].targetRt60Sec,
      activeVoices: this.activeVoices,
      sampleRate: this.ctx?.sampleRate ?? 48000,
      peakDb,
      rmsDb,
      materialPairJp: `${pJp} × ${nJp}`,
    };
  }

  public dispose(): void {
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
      } catch {
        // ignore
      }
      this.ambienceSource.disconnect();
      this.ambienceSource = null;
    }
    this.irCache.clear();
    this.ambienceCache.clear();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initializedGraph = false;
  }
}
