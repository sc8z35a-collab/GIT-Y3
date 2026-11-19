/**
 * Application Bootstrap for JANKEN · 極 v1.2 (3D Photorealistic Rock-Scissors-Paper).
 * Connects:
 *  - JNV1.0 Cognitive NPC Core (100% SHA-256 Pre-Commit + Non-Cheating Feint Tell)
 *  - Tactical Gameplay Loop: 4 Modes (Classic / Survival / Blitz 3.5s / Endless),
 *    Spirit Gauge (気迫) + Overdrive (極一撃 2-Point Strike), Feint (牽制), Win Streaks
 *  - GameScene (KHDR + Shadow Flame 1.0 + JHand 1.1 18-Pose + Camera Director 2.0 + PV Director)
 *  - JSound Engin 1.2 (192kHz 4×OS, 18 Instruments, 128-Ray 3D Binaural Acoustics)
 *  - Compact Luxury Mobile-Fullscreen GameUI
 */

import './style.css';
import { SoundEngine } from './audio/SoundEngine';
import { JNV1Core } from './engine/jnv1/JNVCore';
import { JNVPersonaId, Move, PAPER, ROCK, SCISSORS } from './engine/jnv1/types';
import {
  CAMERA_STYLE_LIST,
  CameraStyleId,
  DEFAULT_GRAPHICS_SETTINGS,
  GameModeId,
  PVModeId,
  StageId,
} from './graphics/GraphicsConfig';
import { GameScene } from './scene/GameScene';
import { GameUI, MatchFormat } from './ui/GameUI';

const SURVIVAL_STAGES: StageId[] = ['zashiki', 'shrine', 'salon', 'onsen', 'atelier'];
const SURVIVAL_PERSONAS: JNVPersonaId[] = ['zero', 'mirror', 'stochastic', 'apex'];
const BEST_STREAK_STORAGE_KEY = 'janken_kiwami_best_survival_streak_v1';
const BLITZ_DURATION_MS = 3500;

class JankenKiwamiApp {
  private readonly sound = new SoundEngine();
  private readonly jnv = new JNV1Core('apex');
  private readonly scene: GameScene;
  private readonly ui: GameUI;

  private gameMode: GameModeId = 'classic';
  private matchFormat: MatchFormat = 'bo5';
  private playerWins = 0;
  private npcWins = 0;
  private draws = 0;
  private roundNumber = 1;
  private lastWasDraw = false;
  private roundBusy = false;
  private turnPromptedAt = performance.now();

  // Enhanced Gameplay State (100% Fair with SHA-256 Pre-Commit!)
  private spiritPct = 35; // Starts charged at 35% so player hits first 極一撃 in ~2 rounds
  private overdriveArmed = false;
  private feintCooldown = 0; // Starts ready (0)
  private feintUsedThisRound = false;
  private ruledOutNpcMove: Move | null = null;
  private winStreak = 0;
  private drawStreak = 0;
  private bestSurvivalStreak = 0;

  // Blitz 3.5s Countdown Timer
  private blitzRafId = 0;
  private blitzDeadlineMs = 0;
  private blitzLastSecondTick = 4;

  constructor() {
    this.bestSurvivalStreak = this.loadBestStreak();
    const viewportHost = document.getElementById('viewport-host')!;
    const uiLayer = document.getElementById('ui-layer')!;

    this.ui = new GameUI(uiLayer, DEFAULT_GRAPHICS_SETTINGS, 'apex', {
      onSelectMove: (move) => this.handlePlayerMove(move),
      onHoverMove: (move) => {
        if (!this.roundBusy && !this.scene.pvDirector.isActive()) {
          this.scene.previewHoverMove(move);
        }
      },
      onTriggerFeint: () => this.handleFeint(),
      onToggleOverdrive: () => this.handleToggleOverdrive(),
      onResetMatch: () => this.resetMatch(false),
      onChangeGameMode: (mode) => {
        this.sound.playWoodTap(800);
        this.gameMode = mode;
        this.resetMatch(false);
      },
      onChangeMatchFormat: (fmt) => {
        this.matchFormat = fmt;
        this.resetMatch(false);
      },
      onChangeCameraStyle: (style: CameraStyleId) => {
        this.sound.playWoodTap(760);
        this.scene.setCameraStyle(style);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onCycleCameraStyle: () => {
        const cur = this.scene.getSettings().cameraStyle;
        const idx = CAMERA_STYLE_LIST.findIndex((c) => c.id === cur);
        const next = CAMERA_STYLE_LIST[(idx + 1) % CAMERA_STYLE_LIST.length].id;
        this.sound.playWoodTap(780);
        this.scene.setCameraStyle(next);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onStartPV: (mode: PVModeId, recordVideo: boolean) => {
        this.stopBlitzTimer();
        this.scene.startPV(mode, recordVideo);
      },
      onStopPV: () => {
        this.scene.stopPV();
        this.syncTacticalUI();
        if (this.gameMode === 'blitz' && !this.roundBusy) {
          this.startBlitzTimer();
        }
      },
      onCaptureSnapshot: () => {
        this.sound.playWoodTap(920);
        this.scene.captureCinemaSnapshot();
      },
      onToggleCompactUi: (compact: boolean) => {
        this.sound.playWoodTap(720);
        this.scene.setCompactUi(compact);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeResolution: (res) => {
        this.sound.playWoodTap(720);
        this.scene.setResolution(res);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeFpsLimit: (fps) => {
        this.sound.playWoodTap(760);
        this.scene.setFpsLimit(fps);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onToggleKHDR: (enabled) => {
        this.sound.playWoodTap(enabled ? 860 : 540);
        this.scene.applyKHDR(enabled, this.scene.getSettings().khdrSplitCompare);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onToggleKHDRSplit: (enabled) => {
        this.sound.playWoodTap(740);
        this.scene.applyKHDR(this.scene.getSettings().khdrEnabled, enabled);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeKHDRSplitX: (normX) => {
        this.scene.setKhdrSplitX(normX);
      },
      onChangeShadowFlame: (mode) => {
        this.sound.playWoodTap(mode === 'pro' ? 920 : mode === 'flash' ? 780 : 580);
        this.scene.applyShadowFlame(mode);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeStage: (stage) => {
        this.scene.applyStage(stage, true);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeHandMaterials: (playerMat, npcMat) => {
        this.scene.setHandMaterials(playerMat, npcMat);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeJHandMode: (mode) => {
        this.sound.playWoodTap(mode === 'biomech_ultra' ? 940 : mode === 'biomech_pro' ? 780 : 600);
        this.scene.setJHandMode(mode);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeJSoundQuality: (quality) => {
        this.scene.setJSoundQuality(quality);
        this.sound.playWoodTap(quality === 'ultra' ? 960 : quality === 'pro' ? 800 : 600);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeJSoundSpatialMode: (spatial) => {
        this.scene.setJSoundSpatialMode(spatial);
        this.sound.playWoodTap(860);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onToggleJSoundAmbience: (enabled) => {
        this.scene.setJSoundAmbience(enabled);
        this.sound.playWoodTap(enabled ? 820 : 520);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onAuditionSound: (instrument) => {
        this.sound.playAuditionSound(instrument);
      },
      onChangePersona: (personaId: JNVPersonaId) => {
        this.sound.playClockworkLock();
        this.jnv.setPersona(personaId);
        this.ruledOutNpcMove = null;
        this.feintUsedThisRound = false;
        this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
        this.ui.updateJNVTelemetry(this.jnv.getLastTelemetry(), personaId);
        this.syncTacticalUI();
      },
      onToggleSound: () => {
        this.sound.enabled = !this.sound.enabled;
        if (this.sound.enabled) this.sound.playWoodTap(780);
        return this.sound.enabled;
      },
    });

    this.scene = new GameScene(
      viewportHost,
      this.sound,
      (metrics) => this.ui.updateRenderMetrics(metrics),
      (pvState) => this.ui.updatePVState(pvState)
    );

    this.ui.syncSettings(this.scene.getSettings());
    this.ui.updateScoreboard(0, 0, 0, 1, false);
    this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
    this.syncTacticalUI();
    this.scene.start();
  }

  private loadBestStreak(): number {
    try {
      const raw = window.localStorage.getItem(BEST_STREAK_STORAGE_KEY);
      return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
    } catch {
      return 0;
    }
  }

  private saveBestStreak(streak: number): void {
    this.bestSurvivalStreak = Math.max(this.bestSurvivalStreak, streak);
    try {
      window.localStorage.setItem(BEST_STREAK_STORAGE_KEY, String(this.bestSurvivalStreak));
    } catch {
      // ignore storage errors
    }
  }

  private getTargetWins(): number | null {
    if (this.gameMode === 'survival' || this.gameMode === 'endless') return null;
    if (this.matchFormat === 'bo5') return 3;
    if (this.matchFormat === 'bo9') return 5;
    return null;
  }

  private syncTacticalUI(blitzRatio: number | null = null): void {
    this.ui.updateTacticalState({
      gameMode: this.gameMode,
      spiritPct: this.spiritPct,
      overdriveArmed: this.overdriveArmed,
      feintReady: this.feintCooldown === 0 && !this.feintUsedThisRound && !this.roundBusy,
      feintCooldown: this.feintCooldown,
      ruledOutNpcMove: this.ruledOutNpcMove,
      winStreak: this.winStreak,
      bestSurvivalStreak: this.bestSurvivalStreak,
      drawStreak: this.drawStreak,
      blitzRatio,
    });
  }

  private handleToggleOverdrive(): void {
    if (this.roundBusy || this.scene.pvDirector.isActive() || this.spiritPct < 100) return;
    this.overdriveArmed = !this.overdriveArmed;
    this.scene.setOverdriveArmed(this.overdriveArmed);
    this.syncTacticalUI(this.getCurrentBlitzRatio());
  }

  private handleFeint(): void {
    if (this.roundBusy || this.scene.pvDirector.isActive()) return;
    if (this.feintCooldown > 0 || this.feintUsedThisRound) return;

    // 100% Fair Read-Only Feint against JNV1.0's ALREADY SHA-256-sealed next move!
    const hint = this.jnv.getFeintTellHint();
    this.feintUsedThisRound = true;
    this.feintCooldown = 3;
    this.ruledOutNpcMove = hint.ruledOutMove;
    this.scene.triggerFeintSequence(hint.stanceCue);
    this.syncTacticalUI(this.getCurrentBlitzRatio());
  }

  private getCurrentBlitzRatio(): number | null {
    if (this.gameMode !== 'blitz' || this.roundBusy || this.blitzDeadlineMs <= 0) return null;
    return Math.max(0, (this.blitzDeadlineMs - performance.now()) / BLITZ_DURATION_MS);
  }

  private startBlitzTimer(): void {
    this.stopBlitzTimer();
    if (this.gameMode !== 'blitz' || this.roundBusy || this.scene.pvDirector.isActive()) return;

    this.blitzDeadlineMs = performance.now() + BLITZ_DURATION_MS;
    this.blitzLastSecondTick = 4;

    const loop = () => {
      if (this.gameMode !== 'blitz' || this.roundBusy || this.scene.pvDirector.isActive()) {
        this.stopBlitzTimer();
        return;
      }
      const remaining = this.blitzDeadlineMs - performance.now();
      const ratio = Math.max(0, remaining / BLITZ_DURATION_MS);
      const secBucket = Math.ceil(remaining / 1000);
      if (secBucket < this.blitzLastSecondTick && secBucket >= 1 && secBucket <= 3) {
        this.blitzLastSecondTick = secBucket;
        this.sound.playBlitzTick(secBucket === 1);
      }
      this.syncTacticalUI(ratio);

      if (remaining <= 0) {
        this.stopBlitzTimer();
        // Auto-throw a random move on Blitz timeout to keep intense tempo!
        const moves: Move[] = [ROCK, SCISSORS, PAPER];
        this.handlePlayerMove(moves[Math.floor(Math.random() * 3)]);
        return;
      }
      this.blitzRafId = requestAnimationFrame(loop);
    };
    this.blitzRafId = requestAnimationFrame(loop);
  }

  private stopBlitzTimer(): void {
    if (this.blitzRafId) {
      cancelAnimationFrame(this.blitzRafId);
      this.blitzRafId = 0;
    }
    this.blitzDeadlineMs = 0;
  }

  private handlePlayerMove(playerMove: Move): void {
    if (this.roundBusy || this.scene.pvDirector.isActive()) return;
    this.stopBlitzTimer();
    this.roundBusy = true;
    this.ui.setButtonsDisabled(true);

    const decisionLatencyMs = Math.max(120, Math.round(performance.now() - this.turnPromptedAt));
    const usingOverdrive = this.overdriveArmed && this.spiritPct >= 100;
    if (usingOverdrive) {
      this.overdriveArmed = false;
      this.spiritPct = 0;
    }

    // Reveal JNV1.0's ALREADY-SEALED SHA-256 move and update all 36 experts!
    const telemetry = this.jnv.revealAndObserve(playerMove, decisionLatencyMs);
    const npcMove = telemetry.chosenNpcMove;
    const outcome = telemetry.playerOutcome;
    const isAikoFollowup = this.lastWasDraw;

    // Points awarded (Overdrive 極一撃 awards 2 points on WIN!)
    const winPoints = outcome === 'WIN' ? (usingOverdrive ? 2 : 1) : 0;
    const target = this.getTargetWins();
    const nextPlayerWins = this.playerWins + winPoints;
    const nextNpcWins = this.npcWins + (outcome === 'LOSS' ? 1 : 0);
    const isSurvivalDefeat = this.gameMode === 'survival' && outcome === 'LOSS';
    const isMatchDecidingPoint =
      isSurvivalDefeat || (target !== null && (nextPlayerWins >= target || nextNpcWins >= target));
    const projectedStreak = outcome === 'WIN' ? this.winStreak + 1 : 0;

    const topConf = telemetry.topExperts[0]?.confidence ?? 0.5;
    this.scene.syncJNVClockwork(topConf, telemetry.volatilityIndex, true);

    this.scene.playClashSequence(
      playerMove,
      npcMove,
      outcome,
      isAikoFollowup,
      isMatchDecidingPoint,
      {
        onBeat: (label, beatIndex) => {
          this.ui.showBeatCallout(label, beatIndex);
        },
        onCinemaBars: (active) => {
          this.ui.setCinemaBars(active);
        },
        onReveal: () => {
          // Clear round feint state & decrement cooldown
          this.ruledOutNpcMove = null;
          this.feintUsedThisRound = false;
          if (this.feintCooldown > 0) this.feintCooldown--;

          if (outcome === 'WIN') {
            this.playerWins += winPoints;
            this.lastWasDraw = false;
            this.drawStreak = 0;
            this.winStreak++;
            if (this.gameMode === 'survival') {
              this.saveBestStreak(this.winStreak);
            }
            if (!usingOverdrive) {
              const fastBonus = decisionLatencyMs < 1300 ? 8 : 0;
              const prevFull = this.spiritPct >= 100;
              this.spiritPct = Math.min(100, this.spiritPct + 36 + fastBonus);
              if (!prevFull && this.spiritPct >= 100) {
                this.sound.playSpiritCharge(1.0, false);
              }
            }
          } else if (outcome === 'LOSS') {
            this.npcWins++;
            this.lastWasDraw = false;
            this.drawStreak = 0;
            this.winStreak = 0;
            if (!usingOverdrive) {
              this.spiritPct = Math.min(100, this.spiritPct + 22);
            }
          } else {
            this.draws++;
            this.lastWasDraw = true;
            this.drawStreak++;
            if (!usingOverdrive) {
              this.spiritPct = Math.min(100, this.spiritPct + 26);
            }
          }

          this.roundNumber++;
          this.scene.setTableScores(this.playerWins, this.npcWins);
          this.ui.updateScoreboard(
            this.playerWins,
            this.npcWins,
            this.draws,
            this.roundNumber,
            this.lastWasDraw
          );

          // Survival Dojo: auto-rotate architectural stage & escalate persona every 2 wins!
          if (this.gameMode === 'survival' && outcome === 'WIN' && this.winStreak > 0 && this.winStreak % 2 === 0) {
            const nextStage = SURVIVAL_STAGES[(this.winStreak / 2) % SURVIVAL_STAGES.length];
            const nextPersona = SURVIVAL_PERSONAS[Math.min(SURVIVAL_PERSONAS.length - 1, Math.floor(this.winStreak / 2))];
            this.scene.applyStage(nextStage, false);
            this.jnv.setPersona(nextPersona);
            this.ui.syncSettings(this.scene.getSettings());
          }

          this.sound.playClockworkLock();
          this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
          this.ui.updateJNVTelemetry(telemetry, this.jnv.getPersona().id);
          this.syncTacticalUI();
        },
        onVerdict: () => {
          const badge =
            outcome === 'WIN' && usingOverdrive
              ? '極・二点奪取'
              : outcome === 'WIN' && this.winStreak >= 3
              ? `${this.winStreak}連勝`
              : undefined;
          this.ui.showVerdictStamp(outcome, badge);
        },
        onFinished: () => {
          if (isSurvivalDefeat) {
            this.scene.triggerMatchFinale(false);
            window.setTimeout(() => {
              this.ui.showMatchModal(
                'npc',
                this.playerWins,
                this.npcWins,
                this.draws,
                () => this.resetMatch(false),
                () => this.resetMatch(true),
                `連勝記録：${this.playerWins}勝（最高${this.bestSurvivalStreak}）`
              );
            }, 960);
          } else if (isMatchDecidingPoint && target !== null) {
            const playerWon = this.playerWins >= target;
            this.scene.triggerMatchFinale(playerWon);
            window.setTimeout(() => {
              this.ui.showMatchModal(
                playerWon ? 'player' : 'npc',
                this.playerWins,
                this.npcWins,
                this.draws,
                () => this.resetMatch(false),
                () => this.resetMatch(true)
              );
            }, 980);
          } else {
            this.roundBusy = false;
            this.ui.setButtonsDisabled(false);
            this.turnPromptedAt = performance.now();
            this.syncTacticalUI();
            if (this.gameMode === 'blitz') {
              this.startBlitzTimer();
            }
          }
        },
      },
      {
        overdriveActive: usingOverdrive,
        streakCount: projectedStreak,
      }
    );
  }

  private resetMatch(wipeJnvMemory: boolean): void {
    this.stopBlitzTimer();
    this.playerWins = 0;
    this.npcWins = 0;
    this.draws = 0;
    this.roundNumber = 1;
    this.lastWasDraw = false;
    this.roundBusy = false;
    this.spiritPct = 35;
    this.overdriveArmed = false;
    this.feintCooldown = 0;
    this.feintUsedThisRound = false;
    this.ruledOutNpcMove = null;
    this.winStreak = 0;
    this.drawStreak = 0;
    this.turnPromptedAt = performance.now();

    if (wipeJnvMemory) {
      this.jnv.reset(this.jnv.getPersona().id);
      this.ui.updateJNVTelemetry(null, this.jnv.getPersona().id);
    }

    this.scene.setTableScores(0, 0);
    this.scene.resetHandsToReady();
    this.ui.setCinemaBars(false);
    this.ui.hideCallout();
    this.ui.setButtonsDisabled(false);
    this.ui.updateScoreboard(0, 0, 0, 1, false);
    this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
    this.syncTacticalUI();

    if (this.gameMode === 'blitz') {
      this.startBlitzTimer();
    }
  }
}

try {
  new JankenKiwamiApp();
} catch (error) {
  console.error('[JANKEN · 極] Initialization failed:', error);
  const uiLayer = document.getElementById('ui-layer');
  if (uiLayer) {
    const message = error instanceof Error ? error.message : String(error);
    uiLayer.innerHTML = `
      <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#14110e;color:#f4ebd9;font-family:'Noto Sans JP',sans-serif;">
        <div style="max-width:520px;padding:24px 28px;border:1px solid rgba(201,164,98,0.45);border-radius:12px;background:rgba(28,23,19,0.96);box-shadow:0 20px 60px rgba(0,0,0,0.6);">
          <h1 style="margin:0 0 10px;font-family:'Shippori Mincho',serif;font-size:22px;color:#e5c27b;">JANKEN · 極 — 起動エラー</h1>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#d8cbb8;">
            3D描画エンジン（WebGL2）の初期化に失敗しました。ハードウェアアクセラレーションが有効なブラウザで再読み込みしてください。
          </p>
          <pre style="margin:0;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,0.4);color:#e69b86;font-size:12px;white-space:pre-wrap;word-break:break-word;">${message.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)}</pre>
        </div>
      </div>
    `;
  }
}
