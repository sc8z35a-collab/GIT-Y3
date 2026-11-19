/**
 * Application Bootstrap for JANKEN · 極 (3D Photorealistic Rock-Scissors-Paper).
 * Connects JNV1.0 Cognitive NPC Core, GameScene (KHDR + Shadow Flame 1.0 + AAA Spring Motion),
 * SoundEngine, and Remodeled Luxury Museum-Lacquer GameUI.
 */

import './style.css';
import { SoundEngine } from './audio/SoundEngine';
import { JNV1Core } from './engine/jnv1/JNVCore';
import { JNVPersonaId, Move } from './engine/jnv1/types';
import { DEFAULT_GRAPHICS_SETTINGS } from './graphics/GraphicsConfig';
import { GameScene } from './scene/GameScene';
import { GameUI, MatchFormat } from './ui/GameUI';

class JankenKiwamiApp {
  private readonly sound = new SoundEngine();
  private readonly jnv = new JNV1Core('apex');
  private readonly scene: GameScene;
  private readonly ui: GameUI;

  private matchFormat: MatchFormat = 'bo5';
  private playerWins = 0;
  private npcWins = 0;
  private draws = 0;
  private roundNumber = 1;
  private lastWasDraw = false;
  private roundBusy = false;
  private turnPromptedAt = performance.now();

  constructor() {
    const viewportHost = document.getElementById('viewport-host')!;
    const uiLayer = document.getElementById('ui-layer')!;

    this.ui = new GameUI(uiLayer, DEFAULT_GRAPHICS_SETTINGS, 'apex', {
      onSelectMove: (move) => this.handlePlayerMove(move),
      onHoverMove: (move) => {
        if (!this.roundBusy) this.scene.previewHoverMove(move);
      },
      onResetMatch: () => this.resetMatch(false),
      onChangeMatchFormat: (fmt) => {
        this.matchFormat = fmt;
        this.resetMatch(false);
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
        this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
        this.ui.updateJNVTelemetry(this.jnv.getLastTelemetry(), personaId);
      },
      onToggleSound: () => {
        this.sound.enabled = !this.sound.enabled;
        if (this.sound.enabled) this.sound.playWoodTap(780);
        return this.sound.enabled;
      },
    });

    this.scene = new GameScene(viewportHost, this.sound, (metrics) => {
      this.ui.updateRenderMetrics(metrics);
    });

    this.ui.updateScoreboard(0, 0, 0, 1, false);
    this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
    this.scene.start();
  }

  private getTargetWins(): number | null {
    if (this.matchFormat === 'bo5') return 3;
    if (this.matchFormat === 'bo9') return 5;
    return null;
  }

  private handlePlayerMove(playerMove: Move): void {
    if (this.roundBusy) return;
    this.roundBusy = true;
    this.ui.setButtonsDisabled(true);

    const decisionLatencyMs = Math.max(120, Math.round(performance.now() - this.turnPromptedAt));

    // Reveal JNV1.0's ALREADY-SEALED SHA-256 move and update all 36 experts!
    const telemetry = this.jnv.revealAndObserve(playerMove, decisionLatencyMs);
    const npcMove = telemetry.chosenNpcMove;
    const outcome = telemetry.playerOutcome;
    const isAikoFollowup = this.lastWasDraw;

    // Detect if this point decides the entire match for extra cinema Hit-Stop & gold-leaf finale!
    const target = this.getTargetWins();
    const nextPlayerWins = this.playerWins + (outcome === 'WIN' ? 1 : 0);
    const nextNpcWins = this.npcWins + (outcome === 'LOSS' ? 1 : 0);
    const isMatchDecidingPoint =
      target !== null && (nextPlayerWins >= target || nextNpcWins >= target);

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
        onReveal: () => {
          if (outcome === 'WIN') {
            this.playerWins++;
            this.lastWasDraw = false;
          } else if (outcome === 'LOSS') {
            this.npcWins++;
            this.lastWasDraw = false;
          } else {
            this.draws++;
            this.lastWasDraw = true;
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

          // Seal next round immediately & update Inspector silently in background
          this.sound.playClockworkLock();
          this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
          this.ui.updateJNVTelemetry(telemetry, this.jnv.getPersona().id);
        },
        onVerdict: () => {
          // Dramatic calligraphic verdict + slamming carved Hanko stamp synced to flourish!
          this.ui.showVerdictStamp(outcome);
        },
        onFinished: () => {
          if (isMatchDecidingPoint && target !== null) {
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
          }
        },
      }
    );
  }

  private resetMatch(wipeJnvMemory: boolean): void {
    this.playerWins = 0;
    this.npcWins = 0;
    this.draws = 0;
    this.roundNumber = 1;
    this.lastWasDraw = false;
    this.roundBusy = false;
    this.turnPromptedAt = performance.now();

    if (wipeJnvMemory) {
      this.jnv.reset(this.jnv.getPersona().id);
      this.ui.updateJNVTelemetry(null, this.jnv.getPersona().id);
    }

    this.scene.setTableScores(0, 0);
    this.scene.resetHandsToReady();
    this.ui.hideCallout();
    this.ui.setButtonsDisabled(false);
    this.ui.updateScoreboard(0, 0, 0, 1, false);
    this.ui.updatePreCommitSeal(this.jnv.getCurrentSeal(), this.jnv.getPersona().code);
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
