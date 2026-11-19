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
        this.sound.playWoodTap(640);
        this.scene.applyStage(stage, true);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeHandMaterials: (playerMat, npcMat) => {
        this.sound.playWoodTap(700);
        this.scene.setHandMaterials(playerMat, npcMat);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeJHandMode: (mode) => {
        this.sound.playWoodTap(mode === 'biomech_pro' ? 880 : 620);
        this.scene.setJHandMode(mode);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onChangeJSoundQuality: (quality) => {
        this.scene.setJSoundQuality(quality);
        this.sound.playWoodTap(quality === 'pro' ? 900 : 600);
        this.ui.syncSettings(this.scene.getSettings());
      },
      onToggleJSoundAmbience: (enabled) => {
        this.scene.setJSoundAmbience(enabled);
        this.sound.playWoodTap(enabled ? 820 : 520);
        this.ui.syncSettings(this.scene.getSettings());
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

new JankenKiwamiApp();
