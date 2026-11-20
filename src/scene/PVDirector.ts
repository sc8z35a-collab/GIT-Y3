/**
 * ★ Built-In Cinema PV Director & Real-Time WebM Exporter for JANKEN · 極 ★
 *
 * Orchestrates automated multi-act cinema trailers synced across:
 *   - 3D Catmull-Rom Spline Crane Camera Tracks & Bullet-Time 180° Orbits
 *   - All 5 Architectural Stages & 4 Craft Hand Materials
 *   - 38-DOF JHand Kinesis 1.1 Expressive Poses & Signature Clash Choreography
 *   - Live KHDR Split-Screen A/B Wipes & Shadow Flame 1.0 Pro Shadows
 *   - JSound Engin 1.2 192kHz 4×OS Multi-Instrument Orchestral Score
 *   - Real-Time WebM Video + Mastered 3D Stereo Audio Recording (`MediaRecorder` + Offscreen 2D Composite)
 *   - 1-Click 2.35:1 Cinema PNG Snapshot Export (strictly zero neon, urushi + gold-leaf + Hanko!)
 */

import * as THREE from 'three';
import { HandPoseKey } from '../engine/jhand/types';
import { Move, PAPER, PlayerOutcome, ROCK, SCISSORS } from '../engine/jnv1/types';
import { HandMaterialPreset, PVModeId, StageId } from '../graphics/GraphicsConfig';
import { SplineShotConfig } from './CameraDirector';

export interface PVOverlayState {
  active: boolean;
  mode: PVModeId;
  recording: boolean;
  progress: number; // 0..1
  actIndex: number;
  actTotal: number;
  badge: string;
  title: string;
  subtitle: string;
  showHanko: boolean;
  recordedUrl: string | null;
  recordedFilename: string;
  recordingSupported: boolean;
}

export interface PVSceneBridge {
  setStageQuiet: (stage: StageId) => void;
  setMaterialsQuiet: (player: HandMaterialPreset, npc: HandMaterialPreset) => void;
  poseHands: (
    playerPose: HandPoseKey,
    npcPose: HandPoseKey,
    opts?: {
      pOffset?: [number, number, number];
      nOffset?: [number, number, number];
      pPitch?: number;
      nPitch?: number;
      pRoll?: number;
      nRoll?: number;
      snappy?: boolean;
      routine?: 'feint' | 'knuckle' | 'victory' | 'snip';
    }
  ) => void;
  playSpline: (cfg: SplineShotConfig) => void;
  stopSpline: () => void;
  setKhdrSplitCompare: (enabled: boolean, splitX?: number) => void;
  triggerClash: (
    playerMove: Move,
    npcMove: Move,
    outcome: PlayerOutcome,
    overdrive: boolean
  ) => void;
  triggerVictoryShower: () => void;
  playPvAudioCue: (actIndex: number, stage: StageId) => void;
  getAudioStream: () => MediaStream | null;
  restoreAfterPV: () => void;
}

interface PVCue {
  atSec: number;
  fired: boolean;
  run: () => void;
}

interface PVCard {
  badge: string;
  title: string;
  subtitle: string;
  showHanko: boolean;
  actIndex: number;
  actTotal: number;
}

export class PVDirector {
  private readonly bridge: PVSceneBridge;
  private readonly onState: (st: PVOverlayState) => void;

  private active = false;
  private mode: PVModeId = 'grand_trailer';
  private elapsed = 0;
  private totalDuration = 26;
  private cues: PVCue[] = [];
  private khdrSweepActive = false;
  private khdrSweepStart = 0;
  private khdrSweepDur = 3.2;

  private card: PVCard = {
    badge: '',
    title: '',
    subtitle: '',
    showHanko: false,
    actIndex: 0,
    actTotal: 6,
  };

  // Real-Time WebM Cinema Recorder (Offscreen 1280×720 2D composite + MediaRecorder)
  private compositeCanvas: HTMLCanvasElement | null = null;
  private compositeCtx: CanvasRenderingContext2D | null = null;
  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recording = false;
  private recordedUrl: string | null = null;
  private recordedFilename = 'janken-kiwami-pv.webm';
  private pendingSnapshot = false;
  private lastUiEmit = 0;

  constructor(bridge: PVSceneBridge, onState: (st: PVOverlayState) => void) {
    this.bridge = bridge;
    this.onState = onState;
  }

  public isActive(): boolean {
    return this.active;
  }

  public isRecording(): boolean {
    return this.recording;
  }

  public isRecordingSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
  }

  public requestSnapshot(): void {
    this.pendingSnapshot = true;
  }

  public start(mode: PVModeId = 'grand_trailer', recordVideo = false): void {
    this.stop(false);
    this.active = true;
    this.mode = mode;
    this.elapsed = 0;
    this.cues = [];
    this.khdrSweepActive = false;

    if (this.recordedUrl) {
      URL.revokeObjectURL(this.recordedUrl);
      this.recordedUrl = null;
    }

    if (mode === 'grand_trailer') {
      this.buildGrandTrailer();
    } else if (mode === 'battle_reel') {
      this.buildBattleReel();
    } else {
      this.buildCraftShowcase();
    }

    if (recordVideo && this.isRecordingSupported()) {
      this.startRecorder();
    }

    // Fire Act 1 (t = 0.0s) immediately so title card, spline camera, and score begin on frame 0!
    for (const cue of this.cues) {
      if (!cue.fired && cue.atSec <= 0) {
        cue.fired = true;
        cue.run();
      }
    }

    this.emitState(true);
  }

  public stop(restoreScene = true): void {
    const wasActive = this.active;
    this.active = false;
    this.khdrSweepActive = false;
    this.cues = [];
    this.stopRecorder();
    this.bridge.stopSpline();
    this.bridge.setKhdrSplitCompare(false, 0.5);
    if (restoreScene && wasActive) {
      this.bridge.restoreAfterPV();
    }
    this.emitState(true);
  }

  private addCue(atSec: number, run: () => void): void {
    this.cues.push({ atSec, fired: false, run });
  }

  private setCard(badge: string, title: string, subtitle: string, actIndex: number, actTotal: number, showHanko = false): void {
    this.card = { badge, title, subtitle, actIndex, actTotal, showHanko };
    this.emitState(true);
  }

  // ===========================================================================
  // PV 1: GRAND OFFICIAL TRAILER (26s · 6 Theatrical Acts)
  // ===========================================================================
  private buildGrandTrailer(): void {
    this.totalDuration = 26.0;
    const totalActs = 6;

    // ACT 1 (0.0s): Sacred Opening — Zashiki Zen Crane Glide (FINGER S1.0 Living Skin vs Bronze!)
    this.addCue(0.0, () => {
      this.bridge.setStageQuiet('zashiki');
      this.bridge.setMaterialsQuiet('living_skin', 'karakuri_bronze');
      this.bridge.poseHands('lotus_mudra', 'palm_meditate', {
        pOffset: [-0.04, 0.05, 0.0],
        nOffset: [0.04, 0.04, 0.0],
        pPitch: -0.04,
        nPitch: -0.04,
      });
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(-1.35, 1.95, 2.95),
          new THREE.Vector3(-0.35, 1.38, 2.38),
          new THREE.Vector3(0.42, 1.18, 2.05),
        ],
        lookTargets: [
          new THREE.Vector3(0, 0.45, -0.4),
          new THREE.Vector3(0, 0.3, -0.05),
          new THREE.Vector3(0, 0.28, 0.02),
        ],
        durationSec: 4.3,
        fovStart: 42,
        fovEnd: 35,
        rollStart: -0.022,
        rollEnd: 0.008,
      });
      this.bridge.playPvAudioCue(0, 'zashiki');
      this.setCard('JANKEN · KIWAMI 3D', '一手に、魂を宿す。', 'FINGER S1.0 × 38自由度生体造形 × 384kHz物理音響', 1, totalActs, true);
    });

    // ACT 2 (4.4s): FINGER S1.0 × JHand Kinesis 1.1 — Hyper-Real Macro Anatomy Showcase
    this.addCue(4.4, () => {
      this.bridge.setMaterialsQuiet('living_skin', 'karakuri_bronze');
      this.bridge.poseHands('zen_circle', 'sword_seal', {
        pOffset: [0.08, 0.08, 0.04],
        nOffset: [-0.02, 0.02, 0],
        pRoll: -0.14,
        snappy: false,
      });
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(-0.84, 0.68, 1.24),
          new THREE.Vector3(-0.22, 0.62, 1.08),
          new THREE.Vector3(0.42, 0.72, 1.2),
        ],
        lookTargets: [
          new THREE.Vector3(-0.42, 0.31, 0.14),
          new THREE.Vector3(-0.18, 0.3, 0.12),
          new THREE.Vector3(0.28, 0.3, 0.08),
        ],
        durationSec: 4.3,
        fovStart: 31,
        fovEnd: 28,
        rollStart: -0.018,
        rollEnd: 0.018,
      });
      this.bridge.playPvAudioCue(1, 'zashiki');
      this.setCard('FINGER S1.0 × JHAND 1.1', '指紋・関節皺・皮下散乱の極致', '36種の掌形 × 38自由度C²滑らか関節演算', 2, totalActs);
    });

    this.addCue(6.4, () => {
      this.bridge.poseHands('wave_flourish', 'iron_knuckle', {
        pOffset: [0.1, 0.07, 0.03],
        nOffset: [-0.06, 0.05, -0.02],
        snappy: true,
        routine: 'knuckle',
      });
    });

    // ACT 3 (8.8s): KHDR + Shadow Flame 1.0 Pro Live A/B Sweep on Twilight Shrine
    this.addCue(8.8, () => {
      this.bridge.setStageQuiet('shrine');
      this.bridge.setMaterialsQuiet('living_skin', 'obsidian_gold');
      this.bridge.poseHands('tiger_palm', 'beckon', {
        pOffset: [0.02, 0.06, 0.02],
        nOffset: [-0.04, 0.08, -0.02],
      });
      this.khdrSweepActive = true;
      this.khdrSweepStart = this.elapsed;
      this.khdrSweepDur = 3.6;
      this.bridge.setKhdrSplitCompare(true, 0.12);
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(0.75, 1.12, 2.15),
          new THREE.Vector3(0.0, 1.26, 2.02),
          new THREE.Vector3(-0.68, 1.08, 1.98),
        ],
        lookTargets: [
          new THREE.Vector3(0, 0.28, 0),
          new THREE.Vector3(0, 0.26, 0),
          new THREE.Vector3(0, 0.28, 0),
        ],
        durationSec: 4.2,
        fovStart: 39,
        fovEnd: 35,
        rollStart: 0.016,
        rollEnd: -0.016,
      });
      this.bridge.playPvAudioCue(2, 'shrine');
      this.setCard('KHDR 1.1 × SHADOW FLAME 1.0 PRO', '陰翳と光彩、物理の再定義。', '16-bit浮動小数スペクトルHDR × PCSS可変半影', 3, totalActs);
    });

    // ACT 4 (13.2s): JSound Engin 1.4 4D Audio MAX 384kHz 8×OS Spatial Acoustics in Grand Salon
    this.addCue(13.2, () => {
      this.khdrSweepActive = false;
      this.bridge.setKhdrSplitCompare(false, 0.5);
      this.bridge.setStageQuiet('salon');
      this.bridge.poseHands('claw_charge', 'stealth_curl', {
        pOffset: [-0.08, 0.08, 0.02],
        nOffset: [0.08, 0.08, -0.02],
        pPitch: -0.14,
        nPitch: -0.14,
        snappy: true,
      });
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(-1.18, 0.88, 1.62),
          new THREE.Vector3(0.0, 0.72, 1.76),
          new THREE.Vector3(1.18, 0.92, 1.58),
        ],
        lookTargets: [
          new THREE.Vector3(0.1, 0.3, 0),
          new THREE.Vector3(0, 0.31, 0.04),
          new THREE.Vector3(-0.1, 0.3, 0),
        ],
        durationSec: 3.9,
        fovStart: 37,
        fovEnd: 33,
        rollStart: -0.024,
        rollEnd: 0.024,
      });
      this.bridge.playPvAudioCue(3, 'salon');
      this.setCard('JSOUND ENGIN 1.4 · 4D AUDIO MAX', '384kHz 8×OS・36和楽器・380音線4D音響', '31-Tap Kaiser FIR (-111dB) × 58物理素材リアルタイム合成', 4, totalActs);
    });

    // ACT 5 (17.2s): Golden Atelier Overdrive Bullet-Time Duel Climax!!
    this.addCue(17.2, () => {
      this.bridge.stopSpline();
      this.bridge.setStageQuiet('atelier');
      this.bridge.setMaterialsQuiet('living_skin', 'karakuri_bronze');
      this.bridge.playPvAudioCue(4, 'atelier');
      this.setCard('JNV1.0 × 極一撃 OVERDRIVE', '先読みを断つ、極致の一閃。', 'SHA-256完全公正コミットメント対戦', 5, totalActs);
    });

    this.addCue(17.8, () => {
      this.bridge.triggerClash(SCISSORS, PAPER, 'WIN', true);
    });

    // ACT 6 (21.6s): Grand Ceremonial Hanko Finale
    this.addCue(21.6, () => {
      this.bridge.poseHands('fist_pump', 'defeat_slump', {
        pOffset: [0.2, 0.2, 0.04],
        nOffset: [0.14, -0.09, -0.04],
        pPitch: -0.18,
        nPitch: 0.28,
        routine: 'victory',
      });
      this.bridge.triggerVictoryShower();
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(-0.55, 0.96, 1.78),
          new THREE.Vector3(0.0, 1.24, 2.28),
          new THREE.Vector3(0.45, 1.48, 2.75),
        ],
        lookTargets: [
          new THREE.Vector3(-0.08, 0.34, 0.04),
          new THREE.Vector3(0, 0.31, 0),
          new THREE.Vector3(0, 0.29, -0.08),
        ],
        durationSec: 4.2,
        fovStart: 33,
        fovEnd: 40,
        rollStart: -0.028,
        rollEnd: 0,
      });
      this.bridge.playPvAudioCue(5, 'atelier');
      this.setCard('JANKEN · KIWAMI 3D', '極 — KIWAMI', 'FINGER S1.0 · JSound 1.4 4D · KHDR 1.1 · J-BioPulse · AeroVortex', 6, totalActs, true);
    });

    // End cleanly
    this.addCue(25.9, () => {
      this.finishPlayback();
    });
  }

  // ===========================================================================
  // PV 2: BATTLE HIGHLIGHT REEL (16s · 3 Explosive Clashes)
  // ===========================================================================
  private buildBattleReel(): void {
    this.totalDuration = 16.0;
    const totalActs = 4;

    this.addCue(0.0, () => {
      this.bridge.setStageQuiet('zashiki');
      this.bridge.setMaterialsQuiet('living_skin', 'karakuri_bronze');
      this.bridge.playPvAudioCue(3, 'zashiki');
      this.setCard('BATTLE REEL · 第一合', '剛拳粉砕 — ROCK CRUSH', '大太鼓×青銅銅鑼 × FINGER S1.0生体剛拳', 1, totalActs);
      this.bridge.triggerClash(ROCK, SCISSORS, 'WIN', false);
    });

    this.addCue(4.0, () => {
      this.bridge.setStageQuiet('shrine');
      this.bridge.setMaterialsQuiet('bisque_porcelain', 'obsidian_gold');
      this.setCard('BATTLE REEL · 第二合', '双刃一閃 — SCISSORS SLASH', '和紙裂断 × 二連剪断フィニッシュ', 2, totalActs);
      this.bridge.triggerClash(SCISSORS, PAPER, 'WIN', true);
    });

    this.addCue(8.4, () => {
      this.bridge.setStageQuiet('onsen');
      this.bridge.setMaterialsQuiet('living_skin', 'karakuri_bronze');
      this.setCard('BATTLE REEL · 第三合', '包摂掌打 — PAPER ENVELOP', 'バレットタイム180°旋回 × 極一撃', 3, totalActs);
      this.bridge.triggerClash(PAPER, ROCK, 'WIN', true);
    });

    this.addCue(12.6, () => {
      this.bridge.triggerVictoryShower();
      this.bridge.poseHands('peace_tilt', 'bow', {
        pOffset: [0.2, 0.16, 0.04],
        nOffset: [0.12, -0.08, -0.04],
        routine: 'victory',
      });
      this.bridge.playPvAudioCue(5, 'onsen');
      this.setCard('JANKEN · KIWAMI 3D', '極 — 決着', 'FINGER S1.0 · JNV1.0 · JSound Engin 1.3', 4, totalActs, true);
    });

    this.addCue(15.9, () => {
      this.finishPlayback();
    });
  }

  // ===========================================================================
  // PV 3: FINGER S1.0 ANATOMY, CRAFT & ACOUSTICS SHOWCASE (18s · Museum Macro Tour)
  // ===========================================================================
  private buildCraftShowcase(): void {
    this.totalDuration = 18.0;
    const totalActs = 4;

    this.addCue(0.0, () => {
      this.bridge.setStageQuiet('zashiki');
      this.bridge.setMaterialsQuiet('living_skin', 'karakuri_bronze');
      this.bridge.poseHands('lotus_mudra', 'koto_pluck', { pOffset: [0.06, 0.08, 0.03] });
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(-0.9, 0.68, 1.26),
          new THREE.Vector3(-0.1, 0.62, 1.12),
          new THREE.Vector3(0.82, 0.74, 1.32),
        ],
        lookTargets: [
          new THREE.Vector3(-0.34, 0.3, 0.14),
          new THREE.Vector3(0, 0.29, 0.1),
          new THREE.Vector3(0.32, 0.3, 0.08),
        ],
        durationSec: 4.4,
        fovStart: 30,
        fovEnd: 29,
      });
      this.bridge.playPvAudioCue(0, 'zashiki');
      this.setCard('FINGER S1.0 · 極写実生体肌 × 絡繰銅', '指紋・爪半月・動的関節皺の極致', '皮下散乱SSS × リアルタイム関節白化シェーダー', 1, totalActs);
    });

    this.addCue(4.6, () => {
      this.bridge.setStageQuiet('onsen');
      this.bridge.setMaterialsQuiet('bisque_porcelain', 'obsidian_gold');
      this.bridge.poseHands('sword_seal', 'fan_hold', { pOffset: [0.08, 0.07, 0.03] });
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(0.92, 0.84, 1.44),
          new THREE.Vector3(0.05, 0.7, 1.24),
          new THREE.Vector3(-0.84, 0.76, 1.36),
        ],
        lookTargets: [
          new THREE.Vector3(0.28, 0.3, 0.08),
          new THREE.Vector3(0, 0.29, 0.1),
          new THREE.Vector3(-0.28, 0.3, 0.12),
        ],
        durationSec: 4.4,
        fovStart: 32,
        fovEnd: 29,
      });
      this.bridge.playPvAudioCue(1, 'onsen');
      this.setCard('CRAFT · 白磁ビスク × 黒曜金箔', '磁器釉薬と漆金継ぎの質感', 'KHDR 1.1物理グレア × SF-SSCS極微影', 2, totalActs);
    });

    this.addCue(9.2, () => {
      this.bridge.setStageQuiet('atelier');
      this.bridge.setMaterialsQuiet('living_skin', 'hinoki_ivory');
      this.bridge.poseHands('zen_circle', 'tea_whisk', { pOffset: [0.02, 0.1, 0.02], nOffset: [-0.02, 0.12, -0.02] });
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(-0.7, 1.15, 1.95),
          new THREE.Vector3(0, 0.85, 1.55),
          new THREE.Vector3(0.7, 1.15, 1.95),
        ],
        lookTargets: [
          new THREE.Vector3(0, 0.32, 0),
          new THREE.Vector3(0, 0.32, 0.04),
          new THREE.Vector3(0, 0.32, 0),
        ],
        durationSec: 4.4,
        fovStart: 36,
        fovEnd: 31,
      });
      this.bridge.playPvAudioCue(2, 'atelier');
      this.setCard('ACOUSTICS · JSOUND ENGIN 1.4 4D', '建築空間が奏でる380本4D立体残響', '6次4D音線追跡 × 384kHz 8×OS 31-Tap物理合成', 3, totalActs);
    });

    this.addCue(13.8, () => {
      this.bridge.poseHands('open_offer', 'salute', { pOffset: [0.1, 0.14, 0.02], nOffset: [-0.1, 0.14, -0.02] });
      this.bridge.triggerVictoryShower();
      this.bridge.playSpline({
        positions: [
          new THREE.Vector3(0, 1.05, 1.95),
          new THREE.Vector3(0, 1.4, 2.55),
        ],
        lookTargets: [
          new THREE.Vector3(0, 0.31, 0),
          new THREE.Vector3(0, 0.28, -0.05),
        ],
        durationSec: 4.0,
        fovStart: 34,
        fovEnd: 40,
      });
      this.bridge.playPvAudioCue(5, 'atelier');
      this.setCard('JANKEN · KIWAMI 3D', '極 — FINGER S1.0 × JSound 1.4 4D', 'KHDR 1.1 · 5K 48-Bit JNV-PROOF Edition', 4, totalActs, true);
    });

    this.addCue(17.9, () => {
      this.finishPlayback();
    });
  }

  private finishPlayback(): void {
    this.active = false;
    this.khdrSweepActive = false;
    this.stopRecorder();
    this.bridge.stopSpline();
    this.bridge.setKhdrSplitCompare(false, 0.5);
    this.bridge.restoreAfterPV();
    this.emitState(true);
  }

  public update(dt: number): void {
    if (!this.active) return;
    const safeDt = Math.min(0.05, dt);
    this.elapsed += safeDt;

    for (const cue of this.cues) {
      if (!cue.fired && this.elapsed >= cue.atSec) {
        cue.fired = true;
        cue.run();
      }
    }

    if (this.khdrSweepActive) {
      const u = Math.min(1, (this.elapsed - this.khdrSweepStart) / Math.max(0.1, this.khdrSweepDur));
      const splitX = 0.12 + 0.76 * (0.5 - 0.5 * Math.cos(u * Math.PI * 2));
      this.bridge.setKhdrSplitCompare(true, splitX);
    }

    const now = performance.now();
    if (now - this.lastUiEmit > 120) {
      this.lastUiEmit = now;
      this.emitState(false);
    }
  }

  /**
   * Called immediately after WebGL render inside requestAnimationFrame so the backbuffer is fresh!
   * Handles both 60fps WebM cinema compositing and 1-click PNG cinema snapshots.
   */
  public onPostRender(webglCanvas: HTMLCanvasElement): void {
    if (this.pendingSnapshot) {
      this.pendingSnapshot = false;
      this.exportCinemaPng(webglCanvas);
    }

    if (!this.recording || !this.compositeCtx || !this.compositeCanvas) return;
    this.drawCinemaFrame(this.compositeCtx, this.compositeCanvas.width, this.compositeCanvas.height, webglCanvas);
  }

  private drawCinemaFrame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    webglCanvas: HTMLCanvasElement
  ): void {
    ctx.fillStyle = '#0e0c0a';
    ctx.fillRect(0, 0, w, h);

    // Aspect-cover blit of live WebGL2 canvas
    const srcW = Math.max(1, webglCanvas.width);
    const srcH = Math.max(1, webglCanvas.height);
    const scale = Math.max(w / srcW, h / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.drawImage(webglCanvas, (w - dw) * 0.5, (h - dh) * 0.5, dw, dh);

    // 2.35:1 Matte Urushi Cinema Letterbox Bars (strictly zero neon!)
    const barH = Math.round(h * 0.115);
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);

    // Fine burnished gold-leaf hairline framing rules
    ctx.fillStyle = 'rgba(196, 154, 74, 0.52)';
    ctx.fillRect(0, barH - 1, w, 1);
    ctx.fillRect(0, h - barH, w, 1);

    // Editorial Japanese Calligraphy Title Card in bottom-left cinema safe zone
    if (this.card.title) {
      const padX = Math.round(w * 0.045);
      const baseY = h - barH - Math.round(h * 0.052);

      // Subtle warm dark vignette strip behind text for high readability
      const grad = ctx.createLinearGradient(0, baseY - 96, 0, h - barH);
      grad.addColorStop(0, 'rgba(12, 10, 8, 0)');
      grad.addColorStop(1, 'rgba(12, 10, 8, 0.72)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, baseY - 96, w, 96 + Math.round(h * 0.052));

      ctx.textAlign = 'left';
      ctx.fillStyle = '#d4af68';
      ctx.font = `600 ${Math.round(h * 0.019)}px "Noto Sans JP", sans-serif`;
      ctx.fillText(this.card.badge, padX, baseY - Math.round(h * 0.062));

      ctx.fillStyle = '#f6efe4';
      ctx.font = `700 ${Math.round(h * 0.044)}px "Noto Serif JP", "Yu Mincho", serif`;
      ctx.fillText(this.card.title, padX, baseY - Math.round(h * 0.014));

      ctx.fillStyle = 'rgba(232, 220, 200, 0.85)';
      ctx.font = `400 ${Math.round(h * 0.02)}px "Noto Sans JP", sans-serif`;
      ctx.fillText(this.card.subtitle, padX, baseY + Math.round(h * 0.022));
    }

    // Authentic Vermilion '極' Hanko Stamp in bottom-right corner
    if (this.card.showHanko || !this.active) {
      const size = Math.round(h * 0.072);
      const hx = w - Math.round(w * 0.045) - size;
      const hy = h - barH - Math.round(h * 0.036) - size;
      ctx.fillStyle = '#b43528';
      ctx.fillRect(hx, hy, size, size);
      ctx.strokeStyle = 'rgba(246, 239, 228, 0.85)';
      ctx.lineWidth = Math.max(1.5, size * 0.04);
      ctx.strokeRect(hx + 3, hy + 3, size - 6, size - 6);
      ctx.fillStyle = '#f6efe4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(size * 0.56)}px "Noto Serif JP", serif`;
      ctx.fillText('極', hx + size * 0.5, hy + size * 0.53);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private startRecorder(): void {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      this.compositeCanvas = canvas;
      this.compositeCtx = ctx;
      this.recordedChunks = [];

      const videoStream = canvas.captureStream(60);
      const audioStream = this.bridge.getAudioStream();
      const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      if (audioStream) {
        tracks.push(...audioStream.getAudioTracks());
      }
      const combined = new MediaStream(tracks);

      const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_500_000 })
        : new MediaRecorder(combined);

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.recordedChunks.push(ev.data);
        }
      };

      rec.onstop = () => {
        if (this.recordedChunks.length > 0) {
          const blob = new Blob(this.recordedChunks, { type: mimeType || 'video/webm' });
          if (this.recordedUrl) URL.revokeObjectURL(this.recordedUrl);
          this.recordedUrl = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
          this.recordedFilename = `janken-kiwami-${this.mode}-${stamp}.webm`;
          this.emitState(true);
        }
      };

      rec.start(250);
      this.recorder = rec;
      this.recording = true;
    } catch {
      this.recording = false;
      this.recorder = null;
    }
  }

  private stopRecorder(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // ignore
      }
    }
    this.recorder = null;
    this.recording = false;
  }

  private exportCinemaPng(webglCanvas: HTMLCanvasElement): void {
    try {
      const snap = document.createElement('canvas');
      snap.width = 1920;
      snap.height = 1080;
      const ctx = snap.getContext('2d');
      if (!ctx) return;

      const prevCard = this.card;
      if (!this.active) {
        this.card = {
          badge: 'JANKEN · KIWAMI 3D',
          title: '極 — KIWAMI',
          subtitle: 'FINGER S1.0 · JHand 1.1 · JSound 1.3 · KHDR · Shadow Flame 1.0',
          actIndex: 1,
          actTotal: 1,
          showHanko: true,
        };
      }
      this.drawCinemaFrame(ctx, snap.width, snap.height, webglCanvas);
      this.card = prevCard;

      const url = snap.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `janken-kiwami-still-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // ignore snapshot failure in restricted contexts
    }
  }

  private emitState(force: boolean): void {
    if (!force && !this.active) return;
    this.onState({
      active: this.active,
      mode: this.mode,
      recording: this.recording,
      progress: this.active ? Math.min(1, this.elapsed / Math.max(1, this.totalDuration)) : 0,
      actIndex: this.card.actIndex,
      actTotal: this.card.actTotal,
      badge: this.card.badge,
      title: this.card.title,
      subtitle: this.card.subtitle,
      showHanko: this.card.showHanko,
      recordedUrl: this.recordedUrl,
      recordedFilename: this.recordedFilename,
      recordingSupported: this.isRecordingSupported(),
    });
  }

  public dispose(): void {
    this.stop(false);
    if (this.recordedUrl) {
      URL.revokeObjectURL(this.recordedUrl);
      this.recordedUrl = null;
    }
  }
}
