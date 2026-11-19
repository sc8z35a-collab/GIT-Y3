/**
 * ★ JSound Engin 1.1 — High-Resolution Physical-Modeling & 3D Spatial Acoustic Engine ★
 *
 * Complete 10-Module Web Audio DSP Architecture built from first principles (zero audio files):
 *   1. 2× Oversampled (96 kHz equivalent) Hertzian Contact & 24-Mode Physical Modal Synthesis
 *      with Kaiser half-band FIR decimation, nonlinear tension pitch-glide & stereo dipole radiation
 *   2. 10 Physical Traditional & Artisan Acoustic Instruments (Taiko, Kotsuzumi, Karplus-Strong Koto,
 *      Shakuhachi, Edo Furin, Shishi-odoshi, Kagura Suzu, Washi Tear, Temple Rin-Bell, Bonsho Bell)
 *   3. Full 3×3 Move-Matchup Dual-Material Clash Acoustics (Player Hand × NPC Hand × Stage Table)
 *   4. 4 Craft Sleeve Textile Strouhal Whooshes (Silk Kimono / Velvet / Brocade / Lacquer)
 *   5. Complete 9-Channel JHand Kinesis 1.1 Landmark-Spatialized Micro-Foley Coupling
 *   6. 3rd-Order 3D Image-Source (up to 62 Rays) + ISO 9613-1 Air Absorption + 4-Band Velvet-Noise IR
 *      with seamless Dual-Convolver A/B stage crossfading
 *   7. Living 3D Spatial World Soundscape Micro-Actors (Garden Shishi-odoshi, Edo Furin, Grand Clock,
 *      Shrine Suzu, Cave Water Droplets, Hearth Charcoal, Chronometer) + 5.6s Seamless Room Beds
 *   8. True 3D HRTF Spatial Panner Bus synced to Three.js camera & exact finger/hand coordinates
 *   9. 3-Band Studio Mastering Chain (Warmth + Presence + Air -> Glue Comp -> -1.2 dBFS Limiter)
 *  10. Real-Time Acoustic Telemetry (Internal DSP Rate, Ray Count, RT60, Voices, Peak dBFS, Last Event)
 */

import { HandFoleyEvent, HandFoleyType } from '../jhand/types';
import { Move, PAPER, ROCK, SCISSORS } from '../jnv1/types';
import { HandMaterialPreset, StageId } from '../../graphics/GraphicsConfig';
import {
  synthesizeAeroWhoosh,
  synthesizeJointFoley,
  synthesizeScissorsShear,
} from './AeroAndFrictionSynth';
import {
  synthesizeBonshoBell,
  synthesizeEdoFurin,
  synthesizeKotoArpeggio,
  synthesizeKotoPluck,
  synthesizeKotsuzumi,
  synthesizeShakuhachiBreath,
  synthesizeShishiOdoshi,
  synthesizeSuzuShimmer,
  synthesizeTaikoDrum,
  synthesizeWashiTear,
  synthesizeWaterDroplet,
} from './InstrumentSynthesizer';
import {
  synthesizeDualMaterialClash,
  synthesizeModalImpact,
  synthesizeModalImpactStereo,
  synthesizeRinBellNote,
} from './ModalSynthesizer';
import { generateStageImpulseResponse } from './StageAcoustics';
import {
  STAGE_SOUNDSCAPE_SPECS,
  SoundscapeActorKind,
  generateStageAmbienceBuffer,
} from './StageAmbience';
import {
  ACOUSTIC_MATERIALS,
  AuditionInstrumentId,
  JSoundQualityMode,
  JSoundSettings,
  JSoundTelemetry,
  STAGE_ACOUSTIC_PROFILES,
  Vec3,
} from './types';

const FOLEY_LABEL_JP: Record<HandFoleyType, string> = {
  knuckle_snap: '関節マイクロ打音',
  palm_clench: '掌床クレンチ圧縮',
  thumb_lock: '母指ロック密着',
  finger_whip: '指先空気斬り',
  scissors_shear: '鍛造刃スティックスリップ',
  tendon_creak: '伸筋腱テンション軋み',
  nail_click: '爪先マイクロクリック',
  sleeve_rustle: '袖布擦過音',
  wrist_crack: '手根関節マイクロ音',
};

export class JSoundEngine {
  public settings: JSoundSettings = {
    enabled: true,
    quality: 'ultra',
    ambienceEnabled: true,
    masterVolume: 0.92,
  };

  private ctx: AudioContext | null = null;
  private unlocked = false;
  private initializedGraph = false;

  // Live scene context
  private currentStage: StageId = 'zashiki';
  private playerMaterial: HandMaterialPreset = 'hinoki_ivory';
  private npcMaterial: HandMaterialPreset = 'karakuri_bronze';
  private currentEarlyRayCount = 62;
  private lastAcousticEventJp = '待機中';

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

  // Caches for zero-hitch instant playback
  private irCache = new Map<string, { buf: AudioBuffer; earlyRays: number }>();
  private ambienceCache = new Map<StageId, AudioBuffer>();

  // Living 3D Spatial Soundscape Scheduler
  private soundscapeTimer = 0;

  // Voice, rate-limiting & listener-delta tracking
  private activeVoices = 0;
  private readonly maxVoices = 34;
  private seedCounter = 20261119;
  private lastJointFoleyMs = 0;
  private lastHoverMs = 0;
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
   * Build 10-Stage Studio Mastering & Spatial Routing Graph:
   *   Sources -> 3D HRTF Panner -> DryBus + ReverbSendBus (Dual-Convolver A/B)
   *           + AmbienceBus -> 3-Band Mastering EQ (Warmth / Presence / Air)
   *           -> Soft-Knee Glue Bus Compressor -> -1.2 dBFS Peak Limiter -> MasterGain -> Analyser -> Out
   */
  private buildMasteringGraph(ctx: AudioContext): void {
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;

    this.reverbSendBus = ctx.createGain();
    this.reverbSendBus.gain.value = STAGE_ACOUSTIC_PROFILES[this.currentStage].reverbSend;

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

    // 3-Band Studio Analog-Style Mastering EQ
    const warmthShelf = ctx.createBiquadFilter();
    warmthShelf.type = 'lowshelf';
    warmthShelf.frequency.value = 130;
    warmthShelf.gain.value = 2.0;

    const presenceBell = ctx.createBiquadFilter();
    presenceBell.type = 'peaking';
    presenceBell.frequency.value = 2850;
    presenceBell.Q.value = 0.9;
    presenceBell.gain.value = 0.9;

    const airShelf = ctx.createBiquadFilter();
    airShelf.type = 'highshelf';
    airShelf.frequency.value = 8400;
    airShelf.gain.value = 1.8;

    // Studio Glue Bus Compressor
    const busComp = ctx.createDynamicsCompressor();
    busComp.threshold.value = -13.5;
    busComp.knee.value = 14;
    busComp.ratio.value = 2.6;
    busComp.attack.value = 0.008;
    busComp.release.value = 0.14;

    // Look-Ahead Style True-Peak Protective Limiter (-1.2 dBFS ceiling)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.055;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.settings.enabled ? this.settings.masterVolume : 0.0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;

    this.dryBus.connect(warmthShelf);
    this.convGainA.connect(warmthShelf);
    this.convGainB.connect(warmthShelf);
    this.ambienceBus.connect(warmthShelf);

    warmthShelf.connect(presenceBell);
    presenceBell.connect(airShelf);
    airShelf.connect(busComp);
    busComp.connect(limiter);
    limiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

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

  private getStageIRBuffer(ctx: AudioContext, stageId: StageId): { buf: AudioBuffer; earlyRays: number } {
    const key = `${stageId}:${this.settings.quality}`;
    const cached = this.irCache.get(key);
    if (cached) return cached;

    const ir = generateStageImpulseResponse(stageId, ctx.sampleRate, this.settings.quality);
    const entry = {
      buf: this.toAudioBuffer(ctx, ir.left, ir.right),
      earlyRays: ir.earlyReflectionCount,
    };
    this.irCache.set(key, entry);
    return entry;
  }

  private applyStageAcoustics(stageId: StageId, immediate = false): void {
    if (!this.ctx || !this.initializedGraph) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const profile = STAGE_ACOUSTIC_PROFILES[stageId];
    const irEntry = this.getStageIRBuffer(ctx, stageId);
    this.currentEarlyRayCount = irEntry.earlyRays;

    this.reverbSendBus.gain.cancelScheduledValues(now);
    this.reverbSendBus.gain.setTargetAtTime(profile.reverbSend, now, immediate ? 0.01 : 0.16);

    if (immediate) {
      this.convA.buffer = irEntry.buf;
      this.convGainA.gain.setValueAtTime(1.0, now);
      this.convGainB.gain.setValueAtTime(0.0, now);
      this.activeConvSlot = 'A';
      return;
    }

    const nextSlot = this.activeConvSlot === 'A' ? 'B' : 'A';
    const nextConv = nextSlot === 'A' ? this.convA : this.convB;
    const nextGain = nextSlot === 'A' ? this.convGainA : this.convGainB;
    const prevGain = nextSlot === 'A' ? this.convGainB : this.convGainA;

    nextConv.buffer = irEntry.buf;
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

    this.stopSoundscapeScheduler();

    if (!this.settings.enabled || !this.settings.ambienceEnabled) {
      this.ambienceBus.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }

    let ambBuf = this.ambienceCache.get(this.currentStage);
    if (!ambBuf) {
      const raw = generateStageAmbienceBuffer(this.currentStage, ctx.sampleRate, 5.6);
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

    this.scheduleNextSoundscapeActor();
  }

  private stopSoundscapeScheduler(): void {
    if (this.soundscapeTimer) {
      window.clearTimeout(this.soundscapeTimer);
      this.soundscapeTimer = 0;
    }
  }

  /**
   * Living 3D Spatial World Soundscape Micro-Actor Scheduler!
   * Periodically triggers subtle, non-repeating 3D environmental acoustics around the arena
   * (Shishi-odoshi, Edo Furin, Grand Clock, Shrine Suzu, Cave Water Droplets, Hearth Charcoal).
   */
  private scheduleNextSoundscapeActor(): void {
    this.stopSoundscapeScheduler();
    if (typeof window === 'undefined' || !this.settings.enabled || !this.settings.ambienceEnabled) return;
    if (this.settings.quality === 'lite') return;

    const spec = STAGE_SOUNDSCAPE_SPECS[this.currentStage];
    const delayMs =
      (spec.minIntervalSec + Math.random() * (spec.maxIntervalSec - spec.minIntervalSec)) * 1000;

    this.soundscapeTimer = window.setTimeout(() => {
      if (this.ctx && this.initializedGraph && this.settings.enabled && this.settings.ambienceEnabled && !document.hidden) {
        this.spawnStageSoundscapeActor();
      }
      this.scheduleNextSoundscapeActor();
    }, delayMs);
  }

  private spawnStageSoundscapeActor(): void {
    const ctx = this.ctx;
    if (!ctx || this.activeVoices > this.maxVoices - 6) return;

    const spec = STAGE_SOUNDSCAPE_SPECS[this.currentStage];
    const r = Math.random();
    let acc = 0;
    let chosen = spec.actors[0];
    for (const a of spec.actors) {
      acc += a.weight;
      if (r <= acc) {
        chosen = a;
        break;
      }
    }

    const pos: Vec3 = {
      x: chosen.pos.x + (Math.random() * 2 - 1) * chosen.posJitter.x,
      y: chosen.pos.y + (Math.random() * 2 - 1) * chosen.posJitter.y,
      z: chosen.pos.z + (Math.random() * 2 - 1) * chosen.posJitter.z,
    };

    const buf = this.synthesizeActorBuffer(chosen.kind, ctx);
    if (!buf) return;
    this.playSpatialBuffer(buf, pos, {
      gain: chosen.gain,
      reverbScale: 1.25,
    });
  }

  private synthesizeActorBuffer(kind: SoundscapeActorKind, ctx: AudioContext): AudioBuffer | null {
    const sr = ctx.sampleRate;
    const seed = this.nextSeed();
    if (kind === 'shishi_odoshi') {
      const s = synthesizeShishiOdoshi(sr, 0.72, this.settings.quality, seed);
      return this.toAudioBuffer(ctx, s.left, s.right);
    }
    if (kind === 'furin') {
      const f = synthesizeEdoFurin(sr, 0.92 + Math.random() * 0.22, 0.55, this.settings.quality, seed);
      return this.toAudioBuffer(ctx, f.left, f.right);
    }
    if (kind === 'pendulum_clock') {
      const p = synthesizeModalImpact('pendulum_clock_tick', sr, {
        velocity: 0.45,
        pitchScale: Math.random() > 0.5 ? 1.04 : 0.94,
        durationSec: 0.14,
        quality: this.settings.quality,
        seed,
      });
      return this.toAudioBuffer(ctx, p);
    }
    if (kind === 'suzu_breeze') {
      const s = synthesizeSuzuShimmer(sr, 0.42, this.settings.quality, seed);
      return this.toAudioBuffer(ctx, s.left, s.right);
    }
    if (kind === 'cedar_creak') {
      const c = synthesizeModalImpact('cedar_eave_creak', sr, {
        velocity: 0.36,
        pitchScale: 0.85 + Math.random() * 0.3,
        durationSec: 0.22,
        quality: this.settings.quality,
        seed,
      });
      return this.toAudioBuffer(ctx, c);
    }
    if (kind === 'water_droplet') {
      return this.toAudioBuffer(ctx, synthesizeWaterDroplet(sr, seed));
    }
    if (kind === 'hearth_pop') {
      const h = synthesizeModalImpact('hearth_charcoal_pop', sr, {
        velocity: 0.35 + Math.random() * 0.4,
        pitchScale: 0.8 + Math.random() * 0.55,
        durationSec: 0.06,
        quality: this.settings.quality,
        seed,
      });
      return this.toAudioBuffer(ctx, h);
    }
    const ch = synthesizeModalImpact('clockwork_escapement', sr, {
      velocity: 0.32,
      pitchScale: 0.92 + Math.random() * 0.16,
      durationSec: 0.07,
      quality: this.settings.quality,
      seed,
    });
    return this.toAudioBuffer(ctx, ch);
  }

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

    const panner = ctx.createPanner();
    panner.panningModel = this.settings.quality === 'lite' ? 'equalpower' : 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.6;
    panner.maxDistance = 16;
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
      } else if (!enabled) {
        this.stopSoundscapeScheduler();
        if (this.ambienceSource) {
          this.ambienceBus.gain.setTargetAtTime(0.0, now, 0.05);
        }
      }
    }
  }

  public setQualityMode(mode: JSoundQualityMode): void {
    if (this.settings.quality === mode) return;
    this.settings.quality = mode;
    if (this.ctx && this.initializedGraph) {
      this.applyStageAcoustics(this.currentStage, false);
      if (this.settings.ambienceEnabled) {
        if (mode === 'lite') this.stopSoundscapeScheduler();
        else this.scheduleNextSoundscapeActor();
      }
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
  // PUBLIC HIGH-RESOLUTION PHYSICAL SOUND EFFECTS & INSTRUMENT TRIGGERS
  // ===========================================================================

  /** Tactile lacquered-hinoki UI tap */
  public playWoodTap(pitch = 680): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    this.lastAcousticEventJp = '漆木タップ';
    const pitchScale = Math.max(0.65, Math.min(2.2, pitch / 520));
    const st = synthesizeModalImpactStereo('hinoki_ivory', ctx.sampleRate, {
      velocity: 0.42,
      pitchScale,
      durationSec: 0.14,
      quality: this.settings.quality,
      seed: this.nextSeed(),
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, st.left, st.right), { x: 0, y: 0.25, z: 0.85 }, {
      gain: 0.34,
      reverbScale: 0.35,
    });
  }

  /** Delicate tactile material-matched hover preview on Rock / Scissors / Paper cards! */
  public playHoverPreview(move: Move): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const nowMs = performance.now();
    if (nowMs - this.lastHoverMs < 90) return;
    this.lastHoverMs = nowMs;

    const pos: Vec3 = { x: -0.42, y: 0.28, z: 0.35 };
    if (move === ROCK) {
      this.lastAcousticEventJp = '構え予兆・拳';
      const st = synthesizeModalImpactStereo(this.playerMaterial, ctx.sampleRate, {
        velocity: 0.24,
        pitchScale: 0.78,
        durationSec: 0.12,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, st.left, st.right), pos, { gain: 0.22, reverbScale: 0.45 });
    } else if (move === SCISSORS) {
      this.lastAcousticEventJp = '構え予兆・刃';
      const st = synthesizeModalImpactStereo(this.playerMaterial, ctx.sampleRate, {
        velocity: 0.22,
        pitchScale: 1.62,
        durationSec: 0.1,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, st.left, st.right), pos, { gain: 0.2, reverbScale: 0.55 });
    } else {
      this.lastAcousticEventJp = '構え予兆・絹風';
      const w = synthesizeAeroWhoosh(ctx.sampleRate, {
        speed: 0.65,
        durationSec: 0.12,
        handMaterial: this.playerMaterial,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, w.left, w.right), pos, { gain: 0.2, reverbScale: 0.5 });
    }
  }

  /** Tactile physical resonance preview whenever the player switches hand craft material! */
  public playMaterialPreview(material: HandMaterialPreset, side: 'player' | 'npc'): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const spec = ACOUSTIC_MATERIALS[material];
    this.lastAcousticEventJp = `素材試聴・${spec.labelJp}`;
    const pos: Vec3 = { x: side === 'player' ? -0.58 : 0.58, y: 0.28, z: 0.18 };
    const st = synthesizeModalImpactStereo(material, ctx.sampleRate, {
      velocity: 0.78,
      pitchScale: 1.0,
      durationSec: 0.42,
      quality: this.settings.quality,
      seed: this.nextSeed(),
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, st.left, st.right), pos, {
      gain: 0.55,
      reverbScale: 0.95,
    });
  }

  /** Serene ceremonial motif tailored to each architectural stage upon entering! */
  public playStageTransition(stageId: StageId): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    this.lastAcousticEventJp = `舞台遷移・${STAGE_ACOUSTIC_PROFILES[stageId].labelJp.split(' ')[0]}`;

    // Hirajoshi Japanese Koto 3-note architectural greeting!
    const motifs: Record<StageId, number[]> = {
      zashiki: [293.66, 329.63, 440.0], // D4 - E4 - A4
      salon: [329.63, 440.0, 523.25], // E4 - A4 - C5
      shrine: [293.66, 440.0, 587.33], // D4 - A4 - D5
      onsen: [261.63, 329.63, 392.0], // C4 - E4 - G4
      atelier: [246.94, 329.63, 493.88], // B3 - E4 - B4
    };
    const koto = synthesizeKotoArpeggio(motifs[stageId], 0.085, ctx.sampleRate, 0.55, this.nextSeed());
    this.playSpatialBuffer(this.toAudioBuffer(ctx, koto.left, koto.right), { x: 0, y: 0.75, z: -0.6 }, {
      gain: 0.36,
      reverbScale: 1.35,
    });

    if (stageId === 'shrine' || stageId === 'onsen') {
      const shaku = synthesizeShakuhachiBreath(motifs[stageId][0], ctx.sampleRate, 1.1, 0.35, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, shaku.left, shaku.right), { x: 0.25, y: 1.1, z: -1.1 }, {
        gain: 0.26,
        reverbScale: 1.4,
        delaySec: 0.06,
      });
    } else if (stageId === 'zashiki') {
      const shishi = synthesizeShishiOdoshi(ctx.sampleRate, 0.65, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, shishi.left, shishi.right), { x: -1.6, y: 0.45, z: -1.3 }, {
        gain: 0.28,
        reverbScale: 1.1,
        delaySec: 0.14,
      });
    }
  }

  /** Sleeve-fabric-calibrated Strouhal aerodynamic air-whoosh */
  public playWhoosh(
    intensity = 1.0,
    pitchMult = 1.0,
    worldPos: Vec3 = { x: 0, y: 0.32, z: 0.12 },
    side: 'player' | 'npc' = 'player'
  ): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const mat = side === 'player' ? this.playerMaterial : this.npcMaterial;
    const whoosh = synthesizeAeroWhoosh(ctx.sampleRate, {
      speed: Math.max(0.5, Math.min(2.0, intensity * pitchMult)),
      durationSec: 0.24,
      handMaterial: mat,
      seed: this.nextSeed(),
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, whoosh.left, whoosh.right), worldPos, {
      gain: 0.54 * Math.min(1.3, intensity),
      reverbScale: 0.7,
    });
  }

  /** Real-Time 9-Channel JHand Kinesis 1.1 Landmark-Spatialized Micro-Foley Stream! */
  public playHandFoley(ev: HandFoleyEvent, side: 'player' | 'npc', worldPos: Vec3): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    const nowMs = performance.now();
    if (ev.type !== 'scissors_shear' && ev.type !== 'thumb_lock' && nowMs - this.lastJointFoleyMs < 38) return;
    this.lastJointFoleyMs = nowMs;
    this.lastAcousticEventJp = FOLEY_LABEL_JP[ev.type];

    const mat = side === 'player' ? this.playerMaterial : this.npcMaterial;
    if (ev.type === 'scissors_shear') {
      const shear = synthesizeScissorsShear(
        mat,
        ctx.sampleRate,
        0.75 + ev.intensity * 0.42,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(this.toAudioBuffer(ctx, shear), worldPos, {
        gain: 0.54,
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
    const gainMap: Record<Exclude<HandFoleyType, 'scissors_shear'>, number> = {
      palm_clench: 0.36,
      thumb_lock: 0.34,
      knuckle_snap: 0.25,
      finger_whip: 0.26,
      nail_click: 0.26,
      tendon_creak: 0.22,
      sleeve_rustle: 0.28,
      wrist_crack: 0.24,
    };
    this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), worldPos, {
      gain: gainMap[ev.type],
      reverbScale: 0.55,
    });
  }

  /** Precision watchmaker brass lever-escapement double-tick on JNV1.0 SHA-256 seal! */
  public playClockworkLock(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const pos: Vec3 = { x: 0.55, y: 0.08, z: -0.35 };
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

  /**
   * Stereo Rosewood Hyoshigi (紫檀拍子木) + Sleeve Whoosh + Match-Point Taiko Heartbeat / Kotsuzumi!
   */
  public playBeat(step: 1 | 2, isMatchPoint = false, isAikoStreak = false): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    this.lastAcousticEventJp = isAikoStreak
      ? '小鼓・あいこ連打'
      : isMatchPoint
      ? '拍子木 × 大太鼓心鼓'
      : '紫檀拍子木';

    // Stereo two-bar Hyoshigi clapper
    const clapper = synthesizeModalImpactStereo('hyoshigi_rosewood', ctx.sampleRate, {
      velocity: step === 1 ? 0.92 : 1.14,
      pitchScale: step === 1 ? 0.94 : 1.15,
      durationSec: 0.3,
      quality: this.settings.quality,
      seed: this.nextSeed(),
      stereoWidth: 0.9,
    });
    this.playSpatialBuffer(this.toAudioBuffer(ctx, clapper.left, clapper.right), { x: 0, y: 0.55, z: -0.2 }, {
      gain: 0.64,
      reverbScale: 1.05,
    });

    // Synced dual-hand sleeve air-whoosh
    this.playWhoosh(step === 1 ? 0.68 : 0.98, step === 1 ? 0.92 : 1.18, { x: -0.28, y: 0.35, z: 0.1 }, 'player');
    this.playWhoosh(step === 1 ? 0.62 : 0.92, step === 1 ? 0.96 : 1.14, { x: 0.28, y: 0.35, z: 0.1 }, 'npc');

    // Dramatic Match-Point deep Taiko Heartbeat pulse!
    if (isMatchPoint) {
      const hb = synthesizeTaikoDrum('heartbeat', ctx.sampleRate, step === 2 ? 1.05 : 0.82, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, hb.left, hb.right), { x: 0, y: 0.15, z: -0.4 }, {
        gain: 0.52,
        reverbScale: 0.95,
      });
    }

    // Aiko streak heightened Kotsuzumi tension tap!
    if (isAikoStreak) {
      const kt = synthesizeKotsuzumi(ctx.sampleRate, {
        variant: 'ta_tight',
        velocity: 0.78,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, kt.left, kt.right), { x: 0.15, y: 0.45, z: -0.25 }, {
        gain: 0.44,
        reverbScale: 1.0,
      });
    }
  }

  /** Twin forged-blade scissors shear snips */
  public playScissorsDoubleSnip(side: 'player' | 'npc' = 'player'): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const mat = side === 'player' ? this.playerMaterial : this.npcMaterial;
    const pos: Vec3 = { x: side === 'player' ? -0.18 : 0.18, y: 0.32, z: 0.12 };
    for (let i = 0; i < 2; i++) {
      const pcm = synthesizeScissorsShear(mat, ctx.sampleRate, 1.05 - i * 0.14, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, pcm), pos, {
        gain: 0.58,
        reverbScale: 0.9,
        delaySec: i * 0.148,
      });
    }
  }

  /** 2× Oversampled Ballistic Go-Stone impact synced to exact 3D stone bounce velocity! */
  public playGoStoneImpact(side: 'player' | 'npc', velocity = 1.0, worldPos?: Vec3): void {
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

    const mix = new Float32Array(stonePcm.length);
    for (let i = 0; i < mix.length; i++) {
      mix[i] = Math.tanh(stonePcm[i] * 0.78 + (i < trayPcm.length ? trayPcm[i] * 0.35 : 0));
    }

    this.playSpatialBuffer(this.toAudioBuffer(ctx, mix), pos, {
      gain: 0.56 * Math.min(1.0, 0.25 + v * 0.75),
      reverbScale: 0.85,
    });
  }

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
   * ★ Signature 1.1 Dual-Material 3×3 Clash Impact + Taiko/Kotsuzumi/Washi + Rin-Bell/Bonsho ★
   */
  public playClashImpact(
    outcome: 'WIN' | 'LOSS' | 'DRAW',
    winnerMove: Move,
    isMatchDecidingPoint = false
  ): void {
    const ctx = this.ensureReady();
    if (!ctx) return;

    this.lastAcousticEventJp =
      outcome === 'DRAW'
        ? '互角衝突 × 小鼓反発'
        : winnerMove === ROCK
        ? '剛拳粉砕 × 大太鼓衝撃'
        : winnerMove === SCISSORS
        ? '双刃一閃 × 和紙裂断'
        : '包摂掌打 × 箏おりん';

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

    // 1. Primary Dual-Material Contact Impact dead-center on the arena tabletop
    this.playSpatialBuffer(
      this.toAudioBuffer(ctx, clash.left, clash.right),
      { x: 0, y: 0.26, z: 0.08 },
      { gain: 0.88, reverbScale: 1.15 }
    );

    // 2. Matchup-Specific Physical Acoustic Signature Layer!
    if (outcome === 'DRAW') {
      // Kotsuzumi bouncy upward "pon!" standoff rebound
      const kotsu = synthesizeKotsuzumi(ctx.sampleRate, {
        variant: 'pon_rise',
        velocity: 0.92,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, kotsu.left, kotsu.right), { x: 0, y: 0.42, z: -0.15 }, {
        gain: 0.56,
        reverbScale: 1.1,
      });
    } else if (winnerMove === ROCK) {
      // Heavy Odaiko membrane slam reinforcing Rock's crushing momentum!
      const taiko = synthesizeTaikoDrum(
        isMatchDecidingPoint ? 'odaiko' : 'shime',
        ctx.sampleRate,
        isMatchDecidingPoint ? 1.25 : 1.0,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(this.toAudioBuffer(ctx, taiko.left, taiko.right), { x: 0, y: 0.22, z: -0.2 }, {
        gain: isMatchDecidingPoint ? 0.68 : 0.54,
        reverbScale: 1.25,
      });
    } else if (winnerMove === SCISSORS) {
      // Crisp Washi Paper fiber slice/tear acoustic burst!
      const tear = synthesizeWashiTear(ctx.sampleRate, 1.0, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, tear.left, tear.right), { x: 0, y: 0.34, z: 0.1 }, {
        gain: 0.62,
        reverbScale: 0.9,
        delaySec: 0.014,
      });
    } else {
      // Paper envelops Rock: warm Kotsuzumi drop + graceful 2-note Koto shimmer!
      const kotsu = synthesizeKotsuzumi(ctx.sampleRate, {
        variant: 'pon_drop',
        velocity: 0.84,
        quality: this.settings.quality,
        seed: this.nextSeed(),
      });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, kotsu.left, kotsu.right), { x: 0, y: 0.36, z: -0.1 }, {
        gain: 0.48,
        reverbScale: 1.05,
      });
    }

    // 3. Gold-leaf Kagura-Suzu micro-sparkle on WIN or decisive clash!
    if (outcome === 'WIN' || isMatchDecidingPoint) {
      const suzu = synthesizeSuzuShimmer(ctx.sampleRate, isMatchDecidingPoint ? 0.85 : 0.52, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, suzu.left, suzu.right), { x: 0, y: 0.55, z: -0.1 }, {
        gain: 0.26,
        reverbScale: 1.25,
        delaySec: 0.035,
      });
    }

    // 4. Hand-Hammered Stereo Japanese Temple Rin-Bell Outcome Harmony
    const notes =
      outcome === 'WIN'
        ? [523.25, 659.25, 783.99]
        : outcome === 'LOSS'
        ? [392.0, 311.13]
        : [440.0, 587.33];

    notes.forEach((hz, idx) => {
      const bell = synthesizeRinBellNote(
        hz,
        ctx.sampleRate,
        outcome === 'WIN' ? 1.55 : 1.1,
        outcome === 'WIN' ? 0.58 : 0.42,
        this.settings.quality,
        this.nextSeed()
      );
      this.playSpatialBuffer(
        this.toAudioBuffer(ctx, bell.left, bell.right),
        { x: (idx - 1) * 0.44, y: 0.72, z: -0.35 },
        {
          gain: outcome === 'WIN' ? 0.34 : 0.26,
          reverbScale: 1.38,
          delaySec: 0.04 + idx * 0.055,
        }
      );
    });
  }

  /**
   * ★ Ceremonial Grand Match Finale (Bonsho Bell + Koto Hirajoshi Arpeggio + Rin-Bell + Suzu / Shakuhachi) ★
   */
  public playMatchVictoryChord(playerWon: boolean): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    this.lastAcousticEventJp = playerWon ? '大勝利・梵鐘×十三絃箏×神楽鈴' : '終局・尺八×梵鐘';

    // 1. Sacred Bonsho Temple Bronze Bell anchor!
    const bonsho = synthesizeBonshoBell(
      playerWon ? 130.81 : 110.0,
      ctx.sampleRate,
      2.8,
      playerWon ? 0.85 : 0.62,
      this.settings.quality,
      this.nextSeed()
    );
    this.playSpatialBuffer(this.toAudioBuffer(ctx, bonsho.left, bonsho.right), { x: 0, y: 1.1, z: -1.1 }, {
      gain: 0.44,
      reverbScale: 1.65,
    });

    if (playerWon) {
      // 2. Celebratory Japanese Hirajoshi Pentatonic Koto Glissando!
      const koto = synthesizeKotoArpeggio(
        [293.66, 329.63, 440.0, 523.25, 587.33, 659.25, 880.0],
        0.072,
        ctx.sampleRate,
        0.78,
        this.nextSeed()
      );
      this.playSpatialBuffer(this.toAudioBuffer(ctx, koto.left, koto.right), { x: 0, y: 0.65, z: -0.4 }, {
        gain: 0.48,
        reverbScale: 1.45,
        delaySec: 0.08,
      });

      // 3. Hammered Gold-Leaf Kagura-Suzu Cascade!
      const suzu = synthesizeSuzuShimmer(ctx.sampleRate, 0.9, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, suzu.left, suzu.right), { x: 0, y: 0.9, z: -0.2 }, {
        gain: 0.34,
        reverbScale: 1.5,
        delaySec: 0.16,
      });

      // 4. Radiant Rin-Bell Major Triad!
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, idx) => {
        const bell = synthesizeRinBellNote(hz, ctx.sampleRate, 2.35, 0.72, this.settings.quality, this.nextSeed());
        this.playSpatialBuffer(
          this.toAudioBuffer(ctx, bell.left, bell.right),
          { x: (idx - 1.5) * 0.55, y: 0.88, z: -0.45 },
          { gain: 0.38, reverbScale: 1.55, delaySec: 0.1 + idx * 0.095 }
        );
      });
    } else {
      // Dignified Shakuhachi Bamboo Breath + Deep Muted Rin-Bell Minor Descent
      const shaku = synthesizeShakuhachiBreath(293.66, ctx.sampleRate, 1.9, 0.62, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, shaku.left, shaku.right), { x: 0, y: 0.85, z: -0.6 }, {
        gain: 0.44,
        reverbScale: 1.5,
        delaySec: 0.12,
      });
      [329.63, 293.66, 220.0].forEach((hz, idx) => {
        const bell = synthesizeRinBellNote(hz, ctx.sampleRate, 2.1, 0.52, this.settings.quality, this.nextSeed());
        this.playSpatialBuffer(
          this.toAudioBuffer(ctx, bell.left, bell.right),
          { x: (idx - 1) * 0.5, y: 0.82, z: -0.45 },
          { gain: 0.3, reverbScale: 1.55, delaySec: idx * 0.11 }
        );
      });
    }
  }

  /**
   * ★ Studio Drawer Interactive Physical Instrument Audition Deck ★
   * Lets users hear JSound Engin 1.1's high-resolution physical instruments live in the active stage!
   */
  public playAuditionSound(instrument: AuditionInstrumentId): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    const seed = this.nextSeed();

    if (instrument === 'taiko') {
      this.lastAcousticEventJp = '試聴・大太鼓';
      const t = synthesizeTaikoDrum('odaiko', sr, 1.15, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, t.left, t.right), { x: 0, y: 0.35, z: -0.45 }, { gain: 0.82, reverbScale: 1.3 });
    } else if (instrument === 'kotsuzumi') {
      this.lastAcousticEventJp = '試聴・小鼓';
      const k = synthesizeKotsuzumi(sr, { variant: 'pon_rise', velocity: 1.05, quality: this.settings.quality, seed });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, k.left, k.right), { x: 0.2, y: 0.45, z: -0.3 }, { gain: 0.78, reverbScale: 1.2 });
    } else if (instrument === 'koto') {
      this.lastAcousticEventJp = '試聴・十三絃箏';
      const ko = synthesizeKotoArpeggio([293.66, 329.63, 440.0, 587.33, 659.25], 0.08, sr, 0.85, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, ko.left, ko.right), { x: -0.15, y: 0.45, z: -0.35 }, { gain: 0.65, reverbScale: 1.35 });
    } else if (instrument === 'shakuhachi') {
      this.lastAcousticEventJp = '試聴・尺八';
      const sh = synthesizeShakuhachiBreath(329.63, sr, 1.55, 0.72, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sh.left, sh.right), { x: 0.15, y: 0.65, z: -0.5 }, { gain: 0.62, reverbScale: 1.45 });
    } else if (instrument === 'rin_bell') {
      this.lastAcousticEventJp = '試聴・仏具おりん';
      const rb = synthesizeRinBellNote(587.33, sr, 2.2, 0.82, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, rb.left, rb.right), { x: 0, y: 0.55, z: -0.25 }, { gain: 0.68, reverbScale: 1.45 });
    } else if (instrument === 'hyoshigi') {
      this.lastAcousticEventJp = '試聴・紫檀拍子木';
      const hy = synthesizeModalImpactStereo('hyoshigi_rosewood', sr, { velocity: 1.1, durationSec: 0.34, quality: this.settings.quality, seed, stereoWidth: 0.95 });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, hy.left, hy.right), { x: 0, y: 0.48, z: -0.2 }, { gain: 0.74, reverbScale: 1.15 });
    } else if (instrument === 'furin') {
      this.lastAcousticEventJp = '試聴・江戸風鈴';
      const fu = synthesizeEdoFurin(sr, 1.0, 0.8, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, fu.left, fu.right), { x: 0.45, y: 0.95, z: -0.45 }, { gain: 0.65, reverbScale: 1.35 });
    } else if (instrument === 'shishi_odoshi') {
      this.lastAcousticEventJp = '試聴・鹿威し';
      const so = synthesizeShishiOdoshi(sr, 0.95, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, so.left, so.right), { x: -0.55, y: 0.35, z: -0.55 }, { gain: 0.72, reverbScale: 1.25 });
    }
  }

  /** Live Real-Time High-Resolution Acoustic Metering & Telemetry */
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

    const nativeSr = this.ctx?.sampleRate ?? 48000;
    const internalDspRateHz = this.settings.quality === 'ultra' ? nativeSr * 2 : nativeSr;
    const pJp = ACOUSTIC_MATERIALS[this.playerMaterial].labelJp;
    const nJp = ACOUSTIC_MATERIALS[this.npcMaterial].labelJp;

    return {
      engineName: 'JSound Engin 1.1',
      enabled: this.settings.enabled,
      quality: this.settings.quality,
      ambienceEnabled: this.settings.ambienceEnabled,
      stageId: this.currentStage,
      stageRt60Sec: STAGE_ACOUSTIC_PROFILES[this.currentStage].targetRt60Sec,
      earlyRayCount: this.currentEarlyRayCount,
      internalDspRateHz,
      soundCatalogCount: 28,
      activeVoices: this.activeVoices,
      sampleRate: nativeSr,
      peakDb,
      rmsDb,
      materialPairJp: `${pJp} × ${nJp}`,
      lastAcousticEventJp: this.lastAcousticEventJp,
    };
  }

  public dispose(): void {
    this.stopSoundscapeScheduler();
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
      } catch {
        // ignore
      }
      this.ambienceSource.disconnect();
      this.ambienceSource = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initializedGraph = false;
  }
}

export { synthesizeKotoPluck };
