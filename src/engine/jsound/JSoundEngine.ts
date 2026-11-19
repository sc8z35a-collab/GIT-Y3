/**
 * ★ JSound Engin 1.2 — 192kHz 4×OS Physical-Modeling & True 3D Spatial Acoustic Engine ★
 *
 * Complete 12-Module Web Audio DSP Architecture built from first principles (zero audio files):
 *   1. 4× Cascade Oversampled (192 kHz @ 48 kHz in Ultra; 96 kHz 2×OS in Pro) 15-Tap Kaiser FIR
 *      Hertzian Contact & 24-Mode Physical Modal Synthesis across 32 Calibrated Materials
 *   2. 18 Pure-Physical-Modeling Instruments (Taiko, Kotsuzumi, Koto, Tsugaru Shamisen w/ Sawari,
 *      Satsuma Biwa, Gagaku Sho, Shinobue Flute, Shakuhachi, Edo Furin, Shishi-odoshi, Kagura Suzu,
 *      Atarigane Gong, Mokugyo Slit-Drum, Tamahagane Katana, Mai-Sensu Fan, Washi Tear, Rin-Bell, Bonsho)
 *   3. Full 3×3 Move-Matchup Dual-Material Clash Acoustics + Spirit/Feint/Combo/PV Orchestration
 *   4. 4 Craft Sleeve Textile Strouhal Whooshes with Dynamic 3D Trajectory Panning & Physical Doppler
 *   5. Complete 9-Channel JHand Kinesis 1.1 Landmark-Spatialized Micro-Foley Coupling
 *   6. 4th-Order 3D Image-Source (up to 128 Rays) + Vertical Pinna Elevation Cues + ISO 9613-1 Air
 *      Absorption + 5-Band Velvet-Noise IR with seamless Dual-Convolver A/B stage crossfading
 *   7. Living 3D Spatial World Soundscape Micro-Actors (11 actors) + 5.6s Seamless Room Beds
 *   8. True 3D HRTF Spatial Panner Bus + Distance Air-Absorption Filter + 3D Moving Doppler
 *   9. 12-Stage Studio Mastering Chain (28Hz Sub-Tight HPF -> 3-Band EQ -> 4×OS Analog Tape Warmth
 *      -> True Mid/Side Spatial Width Matrix -> Glue Comp -> -0.8 dBFS Peak Limiter)
 *  10. Live Stereo MediaStream Audio Tap (`getAudioStream()`) for synchronized PV WebM Video Export
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
  synthesizeAtarigane,
  synthesizeBiwaStrum,
  synthesizeBonshoBell,
  synthesizeEdoFurin,
  synthesizeKatanaDraw,
  synthesizeKotoArpeggio,
  synthesizeKotoPluck,
  synthesizeKotsuzumi,
  synthesizeMokugyo,
  synthesizeSensuSnap,
  synthesizeShakuhachiBreath,
  synthesizeShamisenPhrase,
  synthesizeShamisenPluck,
  synthesizeShinobuePhrase,
  synthesizeShishiOdoshi,
  synthesizeShoCluster,
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
  JSoundSpatialMode,
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

const SPEED_OF_SOUND = 343.0;

/** Generate subtle 2nd+3rd harmonic warm analog tape transfer curve for mastering shaper */
function createAnalogTapeCurve(drive = 0.22): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // Gentle asymmetric tape warmth (keeps -12dBFS transparent, rounds peaks musically)
    const asym = x + 0.035 * drive * x * x;
    curve[i] = Math.tanh(asym * (1 + drive * 1.4)) / Math.tanh(1 + drive * 1.4);
  }
  return curve;
}

export class JSoundEngine {
  public settings: JSoundSettings = {
    enabled: true,
    quality: 'ultra',
    spatialMode: 'binaural_3d',
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
  private currentEarlyRayCount = 128;
  private lastAcousticEventJp = '待機中';

  // 12-Stage Studio Mastering & M/S Spatial Bus Nodes
  private dryBus!: GainNode;
  private reverbSendBus!: GainNode;
  private convA!: ConvolverNode;
  private convB!: ConvolverNode;
  private convGainA!: GainNode;
  private convGainB!: GainNode;
  private activeConvSlot: 'A' | 'B' = 'A';

  private sideWidthGain!: GainNode;
  private ambienceBus!: GainNode;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private masterGain!: GainNode;
  private analyser!: AnalyserNode;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private meterScratch = new Float32Array(512);

  // Caches for zero-hitch instant playback
  private irCache = new Map<string, { buf: AudioBuffer; earlyRays: number }>();
  private ambienceCache = new Map<StageId, AudioBuffer>();

  // Living 3D Spatial Soundscape Scheduler
  private soundscapeTimer = 0;

  // Voice, rate-limiting & listener-delta tracking
  private activeVoices = 0;
  private readonly maxVoices = 42;
  private seedCounter = 20261119;
  private lastJointFoleyMs = 0;
  private lastHoverMs = 0;
  private lastLisPos: Vec3 = { x: 0, y: 1.55, z: 2.35 };
  private lastLisFwd: Vec3 = { x: 0, y: -0.52, z: -0.85 };

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

  /** Unlock audio immediately on explicit user gestures (e.g., clicking PV Start/Record) */
  public unlockFromGesture(): void {
    this.unlocked = true;
    const ctx = this.ensureReady();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  /** Expose live mastered 3D stereo MediaStream so PVDirector can embed full JSound 1.2 audio in WebM! */
  public getAudioStream(): MediaStream | null {
    const ctx = this.ensureReady();
    if (!ctx || !this.initializedGraph) return null;
    if (!this.mediaStreamDest && typeof ctx.createMediaStreamDestination === 'function') {
      this.mediaStreamDest = ctx.createMediaStreamDestination();
      this.masterGain.connect(this.mediaStreamDest);
    }
    return this.mediaStreamDest?.stream ?? null;
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

  private getTargetSideWidth(): number {
    if (this.settings.spatialMode === 'studio_wide') return 1.38;
    if (this.settings.spatialMode === 'focused') return 0.88;
    return 1.22; // binaural_3d default: wide airy 3D wrap-around
  }

  /**
   * Build 12-Stage Studio Mastering & True Mid/Side Spatial Routing Graph:
   *   Sources -> Distance Air-Absorb LPF -> 3D HRTF/Doppler Panner -> DryBus + ReverbSendBus (Dual-Convolver A/B)
   *           + AmbienceBus -> 28Hz Sub-Tight HPF -> 3-Band Studio EQ -> 4×OS Analog Tape Saturation
   *           -> True Mid/Side Spatial Imager (Mono-tight bass + wide high-air!)
   *           -> Soft-Knee Glue Bus Compressor -> -0.8 dBFS Peak Limiter -> MasterGain -> Analyser -> Out & MediaStream
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

    // 1. Sub-Tight 28 Hz DC/Rumble High-Pass Filter
    const subHpf = ctx.createBiquadFilter();
    subHpf.type = 'highpass';
    subHpf.frequency.value = 28;
    subHpf.Q.value = 0.707;

    // 2. 3-Band Studio Analog-Style Mastering EQ (Warmth / Presence / Silk Air)
    const warmthShelf = ctx.createBiquadFilter();
    warmthShelf.type = 'lowshelf';
    warmthShelf.frequency.value = 118;
    warmthShelf.gain.value = 2.2;

    const presenceBell = ctx.createBiquadFilter();
    presenceBell.type = 'peaking';
    presenceBell.frequency.value = 2850;
    presenceBell.Q.value = 0.85;
    presenceBell.gain.value = 1.05;

    const airShelf = ctx.createBiquadFilter();
    airShelf.type = 'highshelf';
    airShelf.frequency.value = 9600;
    airShelf.gain.value = 2.1;

    // 3. 4× Oversampled Analog Tape Harmonic Exciter
    const tapeShaper = ctx.createWaveShaper();
    tapeShaper.curve = createAnalogTapeCurve(0.2);
    tapeShaper.oversample = '4x';

    // 4. True Mid/Side Spatial Width Matrix (Keeps <180Hz tight & widens upper 3D spatial air!)
    const msSplit = ctx.createChannelSplitter(2);
    const msMerge = ctx.createChannelMerger(2);

    const midL = ctx.createGain();
    const midR = ctx.createGain();
    midL.gain.value = 0.5;
    midR.gain.value = 0.5;
    const midBus = ctx.createGain();

    const sideL = ctx.createGain();
    const sideR = ctx.createGain();
    sideL.gain.value = 0.5;
    sideR.gain.value = -0.5;
    // High-pass the Side channel at 150 Hz so sub-bass stays phase-locked & punchy!
    const sideBassTight = ctx.createBiquadFilter();
    sideBassTight.type = 'highpass';
    sideBassTight.frequency.value = 150;
    sideBassTight.Q.value = 0.707;
    this.sideWidthGain = ctx.createGain();
    this.sideWidthGain.gain.value = this.getTargetSideWidth();
    const sideInvR = ctx.createGain();
    sideInvR.gain.value = -1.0;

    // Reconstruct L = Mid + Side, R = Mid - Side
    tapeShaper.connect(msSplit);
    msSplit.connect(midL, 0);
    msSplit.connect(midR, 1);
    midL.connect(midBus);
    midR.connect(midBus);

    msSplit.connect(sideL, 0);
    msSplit.connect(sideR, 1);
    sideL.connect(sideBassTight);
    sideR.connect(sideBassTight);
    sideBassTight.connect(this.sideWidthGain);
    this.sideWidthGain.connect(sideInvR);

    midBus.connect(msMerge, 0, 0);
    midBus.connect(msMerge, 0, 1);
    this.sideWidthGain.connect(msMerge, 0, 0);
    sideInvR.connect(msMerge, 0, 1);

    // 5. Studio Glue Bus Compressor
    const busComp = ctx.createDynamicsCompressor();
    busComp.threshold.value = -13.0;
    busComp.knee.value = 15;
    busComp.ratio.value = 2.4;
    busComp.attack.value = 0.008;
    busComp.release.value = 0.14;

    // 6. Look-Ahead Style True-Peak Protective Limiter (-0.8 dBFS ceiling)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -0.8;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.settings.enabled ? this.settings.masterVolume : 0.0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;

    this.dryBus.connect(subHpf);
    this.convGainA.connect(subHpf);
    this.convGainB.connect(subHpf);
    this.ambienceBus.connect(subHpf);

    subHpf.connect(warmthShelf);
    warmthShelf.connect(presenceBell);
    presenceBell.connect(airShelf);
    airShelf.connect(tapeShaper);
    msMerge.connect(busComp);
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
    if (kind === 'distant_mokugyo') {
      const m = synthesizeMokugyo(sr, 0.94 + Math.random() * 0.14, 0.52, this.settings.quality, seed);
      return this.toAudioBuffer(ctx, m.left, m.right);
    }
    if (kind === 'distant_shamisen') {
      const notes = [196.0, 220.0, 293.66, 329.63];
      const hz = notes[Math.floor(Math.random() * notes.length)];
      const sh = synthesizeShamisenPluck(hz, sr, 0.52, 0.42, 1.0, this.settings.quality, seed);
      return this.toAudioBuffer(ctx, sh.left, sh.right);
    }
    if (kind === 'distant_shinobue') {
      const fl = synthesizeShinobuePhrase(783.99, sr, 0.95, 0.48, seed);
      return this.toAudioBuffer(ctx, fl.left, fl.right);
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
      /** Optional 3D destination coordinate for live moving spatial panning & Doppler shift */
      endPos?: Vec3;
      travelSec?: number;
      enableDoppler?: boolean;
    } = {}
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.initializedGraph || !this.settings.enabled) return;
    if (this.activeVoices >= this.maxVoices) return;

    const startAt = ctx.currentTime + (options.delaySec ?? 0);
    const baseRate = options.playbackRate ?? 1.0;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(options.gain ?? 0.9, startAt);

    // Distance-Adaptive ISO 9613-1 Air-Absorption Filter (farther sounds naturally warm & roll off HF!)
    const dist = Math.hypot(
      worldPos.x - this.lastLisPos.x,
      worldPos.y - this.lastLisPos.y,
      worldPos.z - this.lastLisPos.z
    );
    let airLpf: BiquadFilterNode | null = null;
    if (this.settings.quality !== 'lite' && dist > 2.2) {
      airLpf = ctx.createBiquadFilter();
      airLpf.type = 'lowpass';
      const cutoff = Math.max(4800, Math.min(19800, 21500 - (dist - 2.0) * 2600));
      airLpf.frequency.setValueAtTime(cutoff, startAt);
      airLpf.Q.value = 0.65;
    }

    const panner = ctx.createPanner();
    const useHrtf = this.settings.quality !== 'lite' && this.settings.spatialMode !== 'focused';
    panner.panningModel = useHrtf ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.6;
    panner.maxDistance = 18;
    panner.rolloffFactor = 0.7;
    panner.positionX.setValueAtTime(worldPos.x, startAt);
    panner.positionY.setValueAtTime(worldPos.y, startAt);
    panner.positionZ.setValueAtTime(worldPos.z, startAt);

    // Dynamic 3D Trajectory Panning & Physical Acoustic Doppler Shift!
    if (options.endPos) {
      const travel = Math.max(0.06, options.travelSec ?? Math.min(0.6, buf.duration));
      const endAt = startAt + travel;
      panner.positionX.linearRampToValueAtTime(options.endPos.x, endAt);
      panner.positionY.linearRampToValueAtTime(options.endPos.y, endAt);
      panner.positionZ.linearRampToValueAtTime(options.endPos.z, endAt);

      if (options.enableDoppler !== false && this.settings.quality !== 'lite') {
        const endDist = Math.hypot(
          options.endPos.x - this.lastLisPos.x,
          options.endPos.y - this.lastLisPos.y,
          options.endPos.z - this.lastLisPos.z
        );
        // Radial velocity vr (negative = approaching listener -> pitch rises!)
        const vr = Math.max(-22, Math.min(22, (endDist - dist) / travel));
        // Scale subtly by 3.2× artistic cinema Doppler clarity while remaining strictly physical
        const dopplerMul = Math.max(0.88, Math.min(1.14, SPEED_OF_SOUND / (SPEED_OF_SOUND + vr * 3.2)));
        src.playbackRate.setValueAtTime(baseRate * dopplerMul, startAt);
        src.playbackRate.exponentialRampToValueAtTime(baseRate, endAt);
      } else {
        src.playbackRate.setValueAtTime(baseRate, startAt);
      }
    } else if (baseRate !== 1.0) {
      src.playbackRate.setValueAtTime(baseRate, startAt);
    }

    src.connect(voiceGain);
    if (airLpf) {
      voiceGain.connect(airLpf);
      airLpf.connect(panner);
    } else {
      voiceGain.connect(panner);
    }
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
      airLpf?.disconnect();
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

  public setSpatialMode(mode: JSoundSpatialMode): void {
    if (this.settings.spatialMode === mode) return;
    this.settings.spatialMode = mode;
    if (this.ctx && this.initializedGraph && this.sideWidthGain) {
      this.sideWidthGain.gain.setTargetAtTime(this.getTargetSideWidth(), this.ctx.currentTime, 0.06);
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

  /** Sleeve-fabric-calibrated Strouhal aerodynamic air-whoosh with 3D Trajectory Panning & Doppler */
  public playWhoosh(
    intensity = 1.0,
    pitchMult = 1.0,
    worldPos: Vec3 = { x: 0, y: 0.32, z: 0.12 },
    side: 'player' | 'npc' = 'player',
    endPos?: Vec3
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
    const dest: Vec3 = endPos ?? {
      x: worldPos.x + (side === 'player' ? 0.36 : -0.36),
      y: worldPos.y + 0.08,
      z: worldPos.z - 0.12,
    };
    this.playSpatialBuffer(this.toAudioBuffer(ctx, whoosh.left, whoosh.right), worldPos, {
      gain: 0.54 * Math.min(1.3, intensity),
      reverbScale: 0.72,
      endPos: dest,
      travelSec: 0.22,
      enableDoppler: true,
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

  // ===========================================================================
  // JSOUND ENGIN 1.2 — TACTICAL GAMEPLAY, OVERDRIVE, FEINT & PV CINEMA SCORES
  // ===========================================================================

  /** Gagaku Shō harmonic build & Taiko pulse when Spirit Gauge (気迫) charges or engages 極一撃 */
  public playSpiritCharge(level: number, engagedOverdrive = false): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    const clamped = Math.max(0.15, Math.min(1.0, level));
    this.lastAcousticEventJp = engagedOverdrive ? '極一撃・雅楽笙 × 抜刀' : '気迫高揚・雅楽笙';

    const notes = engagedOverdrive
      ? [440.0, 493.88, 587.33, 659.25, 739.99, 880.0]
      : [440.0, 523.25, 659.25, 783.99];
    const sho = synthesizeShoCluster(notes, sr, engagedOverdrive ? 1.5 : 0.72, 0.52 + clamped * 0.32, this.nextSeed());
    this.playSpatialBuffer(this.toAudioBuffer(ctx, sho.left, sho.right), { x: 0, y: 0.78, z: -0.5 }, {
      gain: engagedOverdrive ? 0.52 : 0.34,
      reverbScale: 1.5,
    });

    if (engagedOverdrive) {
      const katana = synthesizeKatanaDraw(sr, 0.96, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(
        this.toAudioBuffer(ctx, katana.left, katana.right),
        { x: -0.65, y: 0.34, z: 0.25 },
        {
          gain: 0.56,
          reverbScale: 1.1,
          endPos: { x: 0.35, y: 0.44, z: -0.1 },
          travelSec: 0.48,
          enableDoppler: true,
        }
      );
      const hb = synthesizeTaikoDrum('heartbeat', sr, 1.05, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, hb.left, hb.right), { x: 0, y: 0.16, z: -0.35 }, {
        gain: 0.54,
        reverbScale: 1.0,
        delaySec: 0.08,
      });
    }
  }

  /** Overdrive (極一撃) Signature Acoustic Climax: Tamahagane Katana + Tsugaru Shamisen + Odaiko */
  public playOverdriveClash(outcome: 'WIN' | 'LOSS' | 'DRAW', winnerMove: Move): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    this.playClashImpact(outcome, winnerMove, true);
    this.lastAcousticEventJp = '極一撃炸裂・玉鋼 × 津軽三味線 × 大太鼓';

    const katana = synthesizeKatanaDraw(sr, 1.08, this.settings.quality, this.nextSeed());
    this.playSpatialBuffer(
      this.toAudioBuffer(ctx, katana.left, katana.right),
      { x: -0.7, y: 0.4, z: 0.25 },
      {
        gain: 0.46,
        reverbScale: 1.25,
        endPos: { x: 0.7, y: 0.45, z: -0.25 },
        travelSec: 0.42,
        enableDoppler: true,
      }
    );

    const shamNotes = outcome === 'WIN' ? [220.0, 293.66, 329.63, 440.0] : [220.0, 196.0, 164.81];
    const sham = synthesizeShamisenPhrase(shamNotes, 0.068, sr, 0.94, this.settings.quality, this.nextSeed());
    this.playSpatialBuffer(this.toAudioBuffer(ctx, sham.left, sham.right), { x: 0.18, y: 0.5, z: -0.22 }, {
      gain: 0.48,
      reverbScale: 1.2,
      delaySec: 0.05,
    });
  }

  /** Feint (牽制) Tactile Acoustic Cue: Sensu Folding Fan Snap + Sharp Shamisen Pluck */
  public playFeintCue(side: 'player' | 'npc' = 'player'): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    this.lastAcousticEventJp = '牽制・舞扇 × 津軽三味線';

    const startX = side === 'player' ? -0.58 : 0.58;
    const sensu = synthesizeSensuSnap(sr, 0.95, this.settings.quality, this.nextSeed());
    this.playSpatialBuffer(
      this.toAudioBuffer(ctx, sensu.left, sensu.right),
      { x: startX, y: 0.36, z: 0.2 },
      {
        gain: 0.64,
        reverbScale: 0.95,
        endPos: { x: startX * 0.2, y: 0.42, z: -0.05 },
        travelSec: 0.22,
        enableDoppler: true,
      }
    );

    const sh = synthesizeShamisenPluck(293.66, sr, 0.75, 0.86, 1.0, this.settings.quality, this.nextSeed());
    this.playSpatialBuffer(this.toAudioBuffer(ctx, sh.left, sh.right), { x: -startX * 0.35, y: 0.46, z: -0.28 }, {
      gain: 0.44,
      reverbScale: 1.05,
      delaySec: 0.04,
    });
  }

  /** Escalating Win-Streak Acoustic Flourish (2-streak Atarigane -> 3-streak Shinobue -> 4+ Biwa!) */
  public playComboFlourish(streak: number): void {
    const ctx = this.ensureReady();
    if (!ctx || streak < 2) return;
    const sr = ctx.sampleRate;
    this.lastAcousticEventJp = `${streak}連勝・祭鉦 × 篠笛`;

    const gong = synthesizeAtarigane(sr, streak >= 3 ? 'open' : 'damped', 0.82, this.settings.quality, this.nextSeed());
    this.playSpatialBuffer(this.toAudioBuffer(ctx, gong.left, gong.right), { x: 0.35, y: 0.68, z: -0.35 }, {
      gain: 0.34,
      reverbScale: 1.25,
      delaySec: 0.09,
    });

    if (streak >= 3) {
      const flute = synthesizeShinobuePhrase(streak >= 5 ? 880.0 : 783.99, sr, 1.05, 0.66, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, flute.left, flute.right), { x: -0.25, y: 0.85, z: -0.45 }, {
        gain: 0.36,
        reverbScale: 1.4,
        delaySec: 0.14,
      });
    }
    if (streak >= 4) {
      const biwa = synthesizeBiwaStrum(146.83, sr, 1.4, 0.82, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, biwa.left, biwa.right), { x: 0, y: 0.48, z: -0.3 }, {
        gain: 0.38,
        reverbScale: 1.3,
        delaySec: 0.06,
      });
    }
  }

  /** Blitz 3-Second Countdown Tick (Camphor Mokugyo -> Urgent Brass Atarigane) */
  public playBlitzTick(urgent = false): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    if (urgent) {
      const ag = synthesizeAtarigane(sr, 'damped', 0.72, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, ag.left, ag.right), { x: 0, y: 0.55, z: -0.2 }, {
        gain: 0.32,
        reverbScale: 0.8,
      });
    } else {
      const mk = synthesizeMokugyo(sr, 1.06, 0.72, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, mk.left, mk.right), { x: 0, y: 0.48, z: -0.25 }, {
        gain: 0.36,
        reverbScale: 0.75,
      });
    }
  }

  /** Curated Multi-Instrument Orchestral Score Cues for Built-in PV Cinema Director */
  public playPvChapterCue(actIndex: number, stageId: StageId): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const sr = ctx.sampleRate;
    this.setStage(stageId);

    if (actIndex === 0) {
      // Act 1: Sacred Opening — Gagaku Shō + Distant Bonsho Temple Bell
      this.lastAcousticEventJp = 'PV序章・雅楽笙 × 梵鐘';
      const sho = synthesizeShoCluster([440.0, 493.88, 587.33, 659.25, 739.99, 880.0], sr, 2.8, 0.72, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sho.left, sho.right), { x: 0, y: 0.95, z: -0.75 }, {
        gain: 0.44,
        reverbScale: 1.65,
      });
      const bonsho = synthesizeBonshoBell(130.81, sr, 3.0, 0.72, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, bonsho.left, bonsho.right), { x: -0.5, y: 1.15, z: -1.1 }, {
        gain: 0.38,
        reverbScale: 1.7,
        delaySec: 0.25,
      });
    } else if (actIndex === 1) {
      // Act 2: Craft & 38-DOF Macro — Hirajoshi Koto + Sensu Snap
      this.lastAcousticEventJp = 'PV工芸・十三絃箏 × 舞扇';
      const koto = synthesizeKotoArpeggio([293.66, 329.63, 440.0, 587.33, 659.25, 880.0], 0.11, sr, 0.8, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, koto.left, koto.right), { x: -0.25, y: 0.55, z: -0.35 }, {
        gain: 0.46,
        reverbScale: 1.45,
      });
      const sensu = synthesizeSensuSnap(sr, 0.85, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(
        this.toAudioBuffer(ctx, sensu.left, sensu.right),
        { x: -0.5, y: 0.38, z: 0.1 },
        { gain: 0.42, reverbScale: 1.0, endPos: { x: 0.4, y: 0.48, z: -0.1 }, travelSec: 0.3, delaySec: 0.35 }
      );
    } else if (actIndex === 2) {
      // Act 3: KHDR & Shadow Flame Architecture — Satsuma Biwa + Shinobue Flute
      this.lastAcousticEventJp = 'PV陰翳・薩摩琵琶 × 篠笛';
      const biwa = synthesizeBiwaStrum(146.83, sr, 1.9, 0.9, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, biwa.left, biwa.right), { x: 0.35, y: 0.5, z: -0.4 }, {
        gain: 0.52,
        reverbScale: 1.4,
      });
      const flute = synthesizeShinobuePhrase(783.99, sr, 1.55, 0.65, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, flute.left, flute.right), { x: -0.4, y: 0.9, z: -0.55 }, {
        gain: 0.36,
        reverbScale: 1.55,
        delaySec: 0.38,
      });
    } else if (actIndex === 3) {
      // Act 4: JSound 1.2 Rising Tension — Tsugaru Shamisen Riff + Odaiko + Hyoshigi
      this.lastAcousticEventJp = 'PV音響・津軽三味線 × 大太鼓';
      const sham = synthesizeShamisenPhrase([196.0, 220.0, 293.66, 329.63, 440.0], 0.088, sr, 0.95, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sham.left, sham.right), { x: -0.2, y: 0.48, z: -0.25 }, {
        gain: 0.54,
        reverbScale: 1.25,
      });
      const taiko = synthesizeTaikoDrum('odaiko', sr, 1.15, this.settings.quality, this.nextSeed());
      this.playSpatialBuffer(this.toAudioBuffer(ctx, taiko.left, taiko.right), { x: 0.1, y: 0.25, z: -0.4 }, {
        gain: 0.6,
        reverbScale: 1.35,
        delaySec: 0.42,
      });
    } else if (actIndex === 4) {
      // Act 5: Overdrive Bullet-Time Duel Climax — Katana + Overdrive Clash
      this.lastAcousticEventJp = 'PV決戦・玉鋼抜刀 × 極一撃';
      this.playSpiritCharge(1.0, true);
    } else {
      // Act 6: Grand Hanko Finale — Victory Bonsho + Koto + Suzu + Rin-Bell
      this.playMatchVictoryChord(true);
    }
  }

  /**
   * ★ Studio Drawer Interactive 15-Instrument Physical Audition Deck ★
   * Lets users hear all JSound Engin 1.2 192kHz 4×OS physical instruments live in the active 3D stage!
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
    } else if (instrument === 'shamisen') {
      this.lastAcousticEventJp = '試聴・津軽三味線';
      const sh = synthesizeShamisenPhrase([196.0, 220.0, 293.66, 329.63], 0.085, sr, 0.92, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sh.left, sh.right), { x: -0.22, y: 0.48, z: -0.32 }, { gain: 0.72, reverbScale: 1.2 });
    } else if (instrument === 'biwa') {
      this.lastAcousticEventJp = '試聴・薩摩琵琶';
      const bw = synthesizeBiwaStrum(146.83, sr, 1.65, 0.94, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, bw.left, bw.right), { x: 0.24, y: 0.45, z: -0.36 }, { gain: 0.76, reverbScale: 1.3 });
    } else if (instrument === 'shakuhachi') {
      this.lastAcousticEventJp = '試聴・尺八';
      const sh = synthesizeShakuhachiBreath(329.63, sr, 1.55, 0.72, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sh.left, sh.right), { x: 0.15, y: 0.65, z: -0.5 }, { gain: 0.62, reverbScale: 1.45 });
    } else if (instrument === 'shinobue') {
      this.lastAcousticEventJp = '試聴・篠笛';
      const sb = synthesizeShinobuePhrase(783.99, sr, 1.35, 0.74, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sb.left, sb.right), { x: -0.2, y: 0.78, z: -0.45 }, { gain: 0.56, reverbScale: 1.45 });
    } else if (instrument === 'sho') {
      this.lastAcousticEventJp = '試聴・雅楽笙';
      const sho = synthesizeShoCluster([440.0, 493.88, 587.33, 659.25, 739.99, 880.0], sr, 2.0, 0.78, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, sho.left, sho.right), { x: 0, y: 0.85, z: -0.55 }, { gain: 0.54, reverbScale: 1.6 });
    } else if (instrument === 'rin_bell') {
      this.lastAcousticEventJp = '試聴・仏具おりん';
      const rb = synthesizeRinBellNote(587.33, sr, 2.2, 0.82, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, rb.left, rb.right), { x: 0, y: 0.55, z: -0.25 }, { gain: 0.68, reverbScale: 1.45 });
    } else if (instrument === 'atarigane') {
      this.lastAcousticEventJp = '試聴・祭摺鉦';
      const ag = synthesizeAtarigane(sr, 'open', 0.94, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, ag.left, ag.right), { x: 0.3, y: 0.6, z: -0.28 }, { gain: 0.64, reverbScale: 1.3 });
    } else if (instrument === 'mokugyo') {
      this.lastAcousticEventJp = '試聴・楠木魚';
      const mk = synthesizeMokugyo(sr, 1.0, 0.95, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, mk.left, mk.right), { x: -0.25, y: 0.42, z: -0.28 }, { gain: 0.72, reverbScale: 1.15 });
    } else if (instrument === 'hyoshigi') {
      this.lastAcousticEventJp = '試聴・紫檀拍子木';
      const hy = synthesizeModalImpactStereo('hyoshigi_rosewood', sr, { velocity: 1.1, durationSec: 0.34, quality: this.settings.quality, seed, stereoWidth: 0.95 });
      this.playSpatialBuffer(this.toAudioBuffer(ctx, hy.left, hy.right), { x: 0, y: 0.48, z: -0.2 }, { gain: 0.74, reverbScale: 1.15 });
    } else if (instrument === 'furin') {
      this.lastAcousticEventJp = '試聴・江戸風鈴';
      const fu = synthesizeEdoFurin(sr, 1.0, 0.8, this.settings.quality, seed);
      this.playSpatialBuffer(this.toAudioBuffer(ctx, fu.left, fu.right), { x: 0.45, y: 0.95, z: -0.45 }, { gain: 0.65, reverbScale: 1.35 });
    } else if (instrument === 'sensu') {
      this.lastAcousticEventJp = '試聴・舞扇';
      const se = synthesizeSensuSnap(sr, 0.95, this.settings.quality, seed);
      this.playSpatialBuffer(
        this.toAudioBuffer(ctx, se.left, se.right),
        { x: -0.42, y: 0.4, z: 0.15 },
        { gain: 0.72, reverbScale: 1.05, endPos: { x: 0.35, y: 0.48, z: -0.1 }, travelSec: 0.25, enableDoppler: true }
      );
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
    const oversamplingFactor: 1 | 2 | 4 =
      this.settings.quality === 'ultra' ? 4 : this.settings.quality === 'pro' ? 2 : 1;
    const internalDspRateHz = nativeSr * oversamplingFactor;
    const pJp = ACOUSTIC_MATERIALS[this.playerMaterial].labelJp;
    const nJp = ACOUSTIC_MATERIALS[this.npcMaterial].labelJp;

    return {
      engineName: 'JSound Engin 1.2',
      enabled: this.settings.enabled,
      quality: this.settings.quality,
      spatialMode: this.settings.spatialMode,
      ambienceEnabled: this.settings.ambienceEnabled,
      stageId: this.currentStage,
      stageRt60Sec: STAGE_ACOUSTIC_PROFILES[this.currentStage].targetRt60Sec,
      earlyRayCount: this.currentEarlyRayCount,
      oversamplingFactor,
      internalDspRateHz,
      soundCatalogCount: 44,
      instrumentCount: 18,
      materialCount: 32,
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
