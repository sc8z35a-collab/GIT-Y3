/**
 * ★ Ultra-Rich, Zero-Clutter Museum-Lacquer & Gold-Leaf UI Controller — JANKEN · 極 ★
 *
 * Strictly ZERO NEON & ZERO visual clutter on the 3D battle canvas:
 *  - Top-Left: Sculpted Vermilion Hanko (`極`) + Gold-Etched Serif Title (optional micro telemetry pill)
 *  - Top-Center: Urushi-Lacquer & Brass Match Crest with animated Ivory/Bronze Go-Stone Victory Pips
 *  - Top-Right: 4 Iconic Brushed-Brass Medallion Buttons (Graphics, JNV1.0, Sound, Reset)
 *  - Center Stage: Borderless Calligraphic Ink-Brush Theatre (`じゃーん / けーん / ぽん！`)
 *    + Slamming Vermilion Hanko Stamp (`勝` / `敗` / `分`) with zero debug box clutter
 *  - Bottom Dock: 3 Interactive 3D-Tilt & Gold-Sheen Urushi Hand Cards (`グー / チョキ / パー`)
 *    with bespoke woodblock/gold-inlay SVG artwork + expanding gold-ink press ripples
 *  - Slide-out Drawers: Visual PBR-Thumbnail Graphics Studio + Clean JNV1.0 Cognitive Inspector
 */

import { runJNV1Benchmark, BenchmarkBotResult } from '../engine/jnv1/benchmark';
import { JNV_PERSONA_LIST } from '../engine/jnv1/personas';
import {
  CommitSeal,
  JNVPersonaId,
  JNVRoundTelemetry,
  MOVE_META,
  Move,
  PAPER,
  ROCK,
  SCISSORS,
} from '../engine/jnv1/types';
import {
  FpsLimitMode,
  GraphicsSettings,
  HandMaterialPreset,
  JHandModeSetting,
  JSoundModeSetting,
  RESOLUTION_LIST,
  RenderMetrics,
  ResolutionPresetId,
  SHADOW_FLAME_SPECS,
  ShadowFlameMode,
  StageId,
} from '../graphics/GraphicsConfig';
import { STAGE_LIST } from '../scene/StageBuilder';

export type MatchFormat = 'bo5' | 'bo9' | 'endless';

export interface GameUIHandlers {
  onSelectMove: (move: Move) => void;
  onHoverMove: (move: Move | null) => void;
  onResetMatch: () => void;
  onChangeMatchFormat: (fmt: MatchFormat) => void;
  onChangeResolution: (res: ResolutionPresetId) => void;
  onChangeFpsLimit: (fps: FpsLimitMode) => void;
  onToggleKHDR: (enabled: boolean) => void;
  onToggleKHDRSplit: (enabled: boolean) => void;
  onChangeKHDRSplitX: (normX: number) => void;
  onChangeShadowFlame: (mode: ShadowFlameMode) => void;
  onChangeStage: (stage: StageId) => void;
  onChangeHandMaterials: (playerMat: HandMaterialPreset, npcMat: HandMaterialPreset) => void;
  onChangeJHandMode: (mode: JHandModeSetting) => void;
  onChangeJSoundQuality: (quality: JSoundModeSetting) => void;
  onToggleJSoundAmbience: (enabled: boolean) => void;
  onChangePersona: (persona: JNVPersonaId) => void;
  onToggleSound: () => boolean;
}

const HAND_MATERIAL_OPTIONS: Array<{ id: HandMaterialPreset; label: string; swatch: string }> = [
  { id: 'hinoki_ivory', label: '檜象牙', swatch: 'linear-gradient(135deg, #f5e6ce 0%, #d4b282 100%)' },
  { id: 'karakuri_bronze', label: '真鍮銅', swatch: 'linear-gradient(135deg, #cfa16b 0%, #6d4c2b 100%)' },
  { id: 'bisque_porcelain', label: '京白磁', swatch: 'linear-gradient(135deg, #fcfaf6 0%, #d8d2c7 100%)' },
  { id: 'obsidian_gold', label: '黒曜金', swatch: 'linear-gradient(135deg, #43464c 0%, #1b1c1f 65%, #d6b268 100%)' },
];

/** Bespoke Gold-Inlay Fine-Craft Hand Medallion Artwork (Zero Cliché Emojis) */
const ARTISAN_HAND_SVG: Record<Move, string> = {
  [ROCK]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <circle cx="32" cy="32" r="23.5" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="2 3" stroke-width="1"/>
    <path d="M18 33V25.5C18 23.0 20.0 21 22.5 21C24.4 21 26 22.2 26.7 23.8V21.8C26.7 19.3 28.7 17.3 31.2 17.3C33.4 17.3 35.2 18.8 35.6 20.8C36.4 19.5 37.8 18.6 39.5 18.6C42.0 18.6 44 20.6 44 23.1V25.4C45.8 25.7 47.2 27.3 47.2 29.2V36.8C47.2 44.6 40.9 50.8 33.1 50.8H29.4C22.4 50.8 16.8 45.2 16.8 38.2V34.5C16.8 33.6 17.3 33 18 33Z" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M26.7 23.8V31.5M35.6 20.8V31.5M44 25.4V32.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M18 33.2H31.8C34.2 33.2 36 35.0 36 37.3C36 39.4 34.4 41.0 32.3 41.2L26.2 41.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="32" cy="45.2" r="1.5" fill="currentColor" fill-opacity="0.6"/>
  </svg>`,
  [SCISSORS]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <circle cx="32" cy="32" r="23.5" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="2 3" stroke-width="1"/>
    <path d="M26.2 32.5L21.6 14.2C21.1 12.1 22.4 10 24.5 9.5C26.6 9.0 28.7 10.3 29.2 12.4L33.0 28.2L37.4 12.6C38.0 10.5 40.1 9.3 42.2 9.9C44.3 10.5 45.5 12.6 44.9 14.7L39.6 32.6" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M39.6 32.6C42.2 32.6 44.5 34.4 44.8 37.1L45.1 39.6C45.7 46.1 40.6 51.8 34.0 51.8H28.8C22.4 51.8 17.5 46.6 17.8 40.2L18.1 35.8C18.3 33.4 20.3 31.6 22.7 31.6C24.2 31.6 25.5 32.2 26.2 32.5" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M24.2 36.2H34.4C36.4 36.2 38.0 37.8 38.0 39.8C38.0 41.8 36.4 43.3 34.4 43.3H28.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M26.2 20.5L27.6 20.1M39.8 20.3L41.2 20.7" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`,
  [PAPER]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <circle cx="32" cy="32" r="23.5" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="2 3" stroke-width="1"/>
    <path d="M20.5 35.8L14.5 29.8C13.0 28.3 13.0 25.9 14.5 24.4C16.0 22.9 18.4 22.9 19.9 24.4L23.2 27.7V16.4C23.2 14.3 24.9 12.6 27.0 12.6C29.1 12.6 30.8 14.3 30.8 16.4V26.2V12.8C30.8 10.7 32.5 9.0 34.6 9.0C36.7 9.0 38.4 10.7 38.4 12.8V26.4V15.4C38.4 13.4 40.0 11.8 42.0 11.8C44.0 11.8 45.6 13.4 45.6 15.4V28.2V21.2C45.6 19.4 47.0 18.0 48.8 18.0C50.6 18.0 52.0 19.4 52.0 21.2V37.6C52.0 45.8 45.3 52.4 37.1 52.4H32.2C25.5 52.4 20.5 47.5 20.5 40.8V35.8Z" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M27.6 39.2C30.4 36.8 35.0 36.2 39.8 37.8" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
};

const NAV_ICONS = {
  graphics: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>`,
  inspector: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.34 6.34l1.42 1.42M16.24 16.24l1.42 1.42M17.66 6.34l-1.42 1.42M7.76 16.24l-1.42 1.42"/></svg>`,
  soundOn: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  soundOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  reset: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  lock: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
};

const CORNER_FILIGREE = `<svg class="corner-orn tl" viewBox="0 0 14 14" fill="none"><path d="M1 13V3C1 1.9 1.9 1 3 1H13" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn tr" viewBox="0 0 14 14" fill="none"><path d="M13 13V3C13 1.9 12.1 1 11 1H1" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn bl" viewBox="0 0 14 14" fill="none"><path d="M1 1V11C1 12.1 1.9 13 3 13H13" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn br" viewBox="0 0 14 14" fill="none"><path d="M13 1V11C13 12.1 12.1 13 11 13H1" stroke="currentColor" stroke-width="1.1"/></svg>`;

export class GameUI {
  private readonly root: HTMLElement;
  private readonly handlers: GameUIHandlers;

  private graphicsOpen = false;
  private inspectorOpen = false;
  private showHudTelemetry = false;
  private soundOn = true;
  private currentSettings: GraphicsSettings;
  private currentPersona: JNVPersonaId = 'apex';
  private matchFormat: MatchFormat = 'bo5';
  private benchmarkCache: BenchmarkBotResult[] | null = null;
  private lastMetrics: RenderMetrics | null = null;

  private playerWinsCache = 0;
  private npcWinsCache = 0;
  private activeMoveSelection: Move | null = null;

  // DOM refs
  private microTelemetryEl!: HTMLElement;
  private scorePlayerEl!: HTMLElement;
  private scoreNpcEl!: HTMLElement;
  private playerPipsEl!: HTMLElement;
  private npcPipsEl!: HTMLElement;
  private roundCrestEl!: HTMLElement;
  private drawDotEl!: HTMLElement;

  private theatreEl!: HTMLElement;
  private theatreBrushEl!: HTMLElement;
  private theatreTextEl!: HTMLElement;
  private theatreStampEl!: HTMLElement;
  private theatreHideTimer = 0;

  private sealPillEl!: HTMLElement;
  private handButtons: HTMLButtonElement[] = [];

  private graphicsDrawerEl!: HTMLElement;
  private inspectorDrawerEl!: HTMLElement;
  private graphicsNavBtn!: HTMLButtonElement;
  private inspectorNavBtn!: HTMLButtonElement;
  private soundNavBtn!: HTMLButtonElement;

  private graphicsBodyEl!: HTMLElement;
  private inspectorBodyEl!: HTMLElement;

  private splitOverlayEl!: HTMLElement;
  private splitHandleEl!: HTMLElement;

  private modalBackdropEl!: HTMLElement;
  private modalCrestEl!: HTMLElement;
  private modalTitleEl!: HTMLElement;
  private modalStatsEl!: HTMLElement;

  private lastTelemetry: JNVRoundTelemetry | null = null;
  private currentSeal: CommitSeal | null = null;

  constructor(
    root: HTMLElement,
    initialSettings: GraphicsSettings,
    initialPersona: JNVPersonaId,
    handlers: GameUIHandlers
  ) {
    this.root = root;
    this.currentSettings = { ...initialSettings };
    this.currentPersona = initialPersona;
    this.handlers = handlers;

    this.buildShell();
    this.renderGraphicsDrawer();
    this.renderInspectorDrawer();
    this.bindKeyboardShortcuts();
    this.bindSplitDrag();
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <!-- KHDR vs Standard SDR Live A/B Split Overlay -->
      <div class="khdr-split-overlay" id="khdr-split-overlay">
        <div class="khdr-split-label left">標準 SDR</div>
        <div class="khdr-split-label right">KHDR ON</div>
        <div class="khdr-split-handle" id="khdr-split-handle" title="ドラッグしてKHDR比較位置を移動">
          <div class="khdr-split-knob">⇄</div>
        </div>
      </div>

      <!-- Minimal Luxury Header -->
      <header class="top-bar">
        <div class="brand-cluster">
          <div class="brand-crest">
            <div class="hanko-seal">極</div>
            <div class="brand-wordmark">
              <h1>JANKEN</h1>
              <span class="brand-dot">·</span>
              <span class="brand-jp">極</span>
            </div>
          </div>
          <div class="micro-telemetry" id="micro-telemetry" style="display:none"></div>
        </div>

        <!-- Sculptural Urushi & Brass Match Crest -->
        <div class="match-crest" id="match-crest">
          ${CORNER_FILIGREE}
          <div class="crest-side player">
            <div class="crest-pips" id="player-pips"></div>
            <div class="crest-num" id="score-player">0</div>
          </div>
          <div class="crest-center">
            <div class="round-medallion" id="round-crest">壱</div>
            <div class="draw-indicator" id="draw-dot" title="あいこ中"></div>
          </div>
          <div class="crest-side npc">
            <div class="crest-num" id="score-npc">0</div>
            <div class="crest-pips" id="npc-pips"></div>
          </div>
        </div>

        <!-- Sculpted Brass & Lacquer Icon Medallions -->
        <nav class="top-actions" aria-label="設定">
          <button class="icon-medallion" id="btn-graphics" data-tip="映像・関節・音響 (G)" aria-label="映像・関節・音響設定">
            ${NAV_ICONS.graphics}
          </button>
          <button class="icon-medallion" id="btn-inspector" data-tip="JNV1.0 解析 (J)" aria-label="JNV1.0 解析">
            ${NAV_ICONS.inspector}
            <span class="medallion-seal-dot"></span>
          </button>
          <button class="icon-medallion" id="btn-sound" data-tip="JSound Engin 1.0 ON/OFF" aria-label="音響切替">
            ${NAV_ICONS.soundOn}
          </button>
          <button class="icon-medallion" id="btn-reset-match" data-tip="最初から" aria-label="試合をリセット">
            ${NAV_ICONS.reset}
          </button>
        </nav>
      </header>

      <!-- Borderless Calligraphic Battle Theatre (Zero Boxes!) -->
      <div class="battle-theatre" aria-live="polite">
        <div class="theatre-stage" id="theatre-stage">
          <svg class="ink-brush-sweep" id="theatre-brush" viewBox="0 0 420 90" fill="none" preserveAspectRatio="none">
            <path d="M18 52 C110 26, 290 22, 402 44 C320 58, 130 66, 26 58 Z" fill="url(#sumiGrad)"/>
            <path class="brush-gold-line" d="M36 62 C155 44, 280 42, 388 50" stroke="url(#goldHair)" stroke-width="1.6" stroke-linecap="round"/>
            <defs>
              <linearGradient id="sumiGrad" x1="0" y1="0" x2="420" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#14110e" stop-opacity="0"/>
                <stop offset="22%" stop-color="#14110e" stop-opacity="0.72"/>
                <stop offset="78%" stop-color="#14110e" stop-opacity="0.72"/>
                <stop offset="100%" stop-color="#14110e" stop-opacity="0"/>
              </linearGradient>
              <linearGradient id="goldHair" x1="36" y1="0" x2="388" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#d4b06a" stop-opacity="0"/>
                <stop offset="50%" stop-color="#e8c882" stop-opacity="0.85"/>
                <stop offset="100%" stop-color="#d4b06a" stop-opacity="0"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="theatre-lockup">
            <div class="theatre-text" id="theatre-text"></div>
            <div class="theatre-stamp" id="theatre-stamp"></div>
          </div>
        </div>
      </div>

      <!-- Bottom Tactile Urushi-Lacquer & Gold-Leaf Artisan Dock -->
      <footer class="bottom-dock">
        <div class="hand-cards" id="hand-dock">
          ${([ROCK, SCISSORS, PAPER] as Move[])
            .map(
              (m, idx) => `
              <button class="artisan-card" id="btn-move-${MOVE_META[m].id}" data-move="${m}">
                ${CORNER_FILIGREE}
                <div class="card-sheen"></div>
                <div class="card-ripple"></div>
                <div class="card-art">${ARTISAN_HAND_SVG[m]}</div>
                <div class="card-footer">
                  <span class="card-jp">${MOVE_META[m].jp}</span>
                  <span class="card-key">${idx + 1}</span>
                </div>
              </button>
            `
            )
            .join('')}
        </div>

        <!-- Subtle Clickable SHA-256 Proof Seal Chip (Opens Inspector) -->
        <button class="seal-chip" id="seal-chip" title="クリックでJNV1.0事前封印SHA-256ハッシュを確認">
          ${NAV_ICONS.lock}
          <span id="seal-chip-label">SHA-256</span>
        </button>
      </footer>

      <!-- Left Slide-Out Drawer: Graphics · JHand · JSound Studio -->
      <aside class="drawer left" id="drawer-graphics" aria-label="映像・関節・音響設定">
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>映像 · 関節 · 音響</h2>
            <span class="drawer-badge">JHand / JSound</span>
          </div>
          <button class="drawer-close" id="close-graphics" aria-label="閉じる">✕</button>
        </div>
        <div class="drawer-body" id="graphics-body"></div>
      </aside>

      <!-- Right Slide-Out Drawer: JNV1.0 Cognitive Core Inspector -->
      <aside class="drawer right" id="drawer-inspector" aria-label="JNV1.0解析">
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>JNV1.0 解析</h2>
            <span class="drawer-badge">36 EXP</span>
          </div>
          <button class="drawer-close" id="close-inspector" aria-label="閉じる">✕</button>
        </div>
        <div class="drawer-body" id="inspector-body"></div>
      </aside>

      <!-- Ceremonial Match-End Modal -->
      <div class="modal-backdrop" id="match-modal">
        <div class="modal-card">
          ${CORNER_FILIGREE}
          <div class="modal-crest" id="modal-crest">勝</div>
          <h2 id="modal-title">勝 利</h2>
          <div class="modal-stats" id="modal-stats"></div>
          <div class="modal-actions">
            <button class="modal-btn primary" id="modal-rematch-keep">もう一度</button>
            <button class="modal-btn secondary" id="modal-rematch-fresh">記憶を初期化して再戦</button>
          </div>
        </div>
      </div>
    `;

    this.microTelemetryEl = this.root.querySelector('#micro-telemetry')!;
    this.scorePlayerEl = this.root.querySelector('#score-player')!;
    this.scoreNpcEl = this.root.querySelector('#score-npc')!;
    this.playerPipsEl = this.root.querySelector('#player-pips')!;
    this.npcPipsEl = this.root.querySelector('#npc-pips')!;
    this.roundCrestEl = this.root.querySelector('#round-crest')!;
    this.drawDotEl = this.root.querySelector('#draw-dot')!;

    this.theatreEl = this.root.querySelector('#theatre-stage')!;
    this.theatreBrushEl = this.root.querySelector('#theatre-brush')!;
    this.theatreTextEl = this.root.querySelector('#theatre-text')!;
    this.theatreStampEl = this.root.querySelector('#theatre-stamp')!;
    this.sealPillEl = this.root.querySelector('#seal-chip')!;

    this.graphicsDrawerEl = this.root.querySelector('#drawer-graphics')!;
    this.inspectorDrawerEl = this.root.querySelector('#drawer-inspector')!;
    this.graphicsNavBtn = this.root.querySelector('#btn-graphics')!;
    this.inspectorNavBtn = this.root.querySelector('#btn-inspector')!;
    this.soundNavBtn = this.root.querySelector('#btn-sound')!;

    this.graphicsBodyEl = this.root.querySelector('#graphics-body')!;
    this.inspectorBodyEl = this.root.querySelector('#inspector-body')!;

    this.splitOverlayEl = this.root.querySelector('#khdr-split-overlay')!;
    this.splitHandleEl = this.root.querySelector('#khdr-split-handle')!;

    this.modalBackdropEl = this.root.querySelector('#match-modal')!;
    this.modalCrestEl = this.root.querySelector('#modal-crest')!;
    this.modalTitleEl = this.root.querySelector('#modal-title')!;
    this.modalStatsEl = this.root.querySelector('#modal-stats')!;

    // Bind 3D-tilt, pointer gold-sheen, and spring click ripples on the 3 Artisan Hand Cards!
    this.handButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.artisan-card'));
    for (const btn of this.handButtons) {
      const move = Number(btn.dataset.move) as Move;
      btn.addEventListener('pointerenter', () => this.handlers.onHoverMove(move));
      btn.addEventListener('pointerleave', () => {
        btn.style.removeProperty('--rx');
        btn.style.removeProperty('--ry');
        this.handlers.onHoverMove(null);
      });
      btn.addEventListener('pointermove', (e) => {
        const rect = btn.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
        const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
        btn.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
        btn.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
        btn.style.setProperty('--rx', `${((0.5 - ny) * 10).toFixed(2)}deg`);
        btn.style.setProperty('--ry', `${((nx - 0.5) * 12).toFixed(2)}deg`);
      });
      btn.addEventListener('click', () => {
        this.triggerCardRipple(btn, move);
        this.handlers.onSelectMove(move);
      });
    }

    // Top-right medallion toggles
    this.graphicsNavBtn.addEventListener('click', () => {
      this.graphicsOpen = !this.graphicsOpen;
      if (this.graphicsOpen) this.inspectorOpen = false;
      this.syncDrawers();
    });
    this.root.querySelector('#close-graphics')!.addEventListener('click', () => {
      this.graphicsOpen = false;
      this.syncDrawers();
    });

    this.inspectorNavBtn.addEventListener('click', () => {
      this.inspectorOpen = !this.inspectorOpen;
      if (this.inspectorOpen) this.graphicsOpen = false;
      this.syncDrawers();
    });
    this.root.querySelector('#close-inspector')!.addEventListener('click', () => {
      this.inspectorOpen = false;
      this.syncDrawers();
    });

    this.sealPillEl.addEventListener('click', () => {
      this.inspectorOpen = true;
      this.graphicsOpen = false;
      this.syncDrawers();
    });

    this.soundNavBtn.addEventListener('click', () => {
      this.soundOn = this.handlers.onToggleSound();
      this.soundNavBtn.innerHTML = this.soundOn ? NAV_ICONS.soundOn : NAV_ICONS.soundOff;
      this.soundNavBtn.classList.toggle('muted', !this.soundOn);
    });

    this.root.querySelector('#btn-reset-match')!.addEventListener('click', () => {
      this.closeMatchModal();
      this.handlers.onResetMatch();
    });
  }

  private triggerCardRipple(btn: HTMLButtonElement, move: Move): void {
    this.activeMoveSelection = move;
    for (const b of this.handButtons) {
      b.classList.toggle('selected', b === btn);
    }
    btn.classList.remove('rippling');
    void btn.offsetWidth;
    btn.classList.add('rippling');
  }

  private syncDrawers(): void {
    this.graphicsDrawerEl.classList.toggle('open', this.graphicsOpen);
    this.inspectorDrawerEl.classList.toggle('open', this.inspectorOpen);
    this.graphicsNavBtn.classList.toggle('active', this.graphicsOpen);
    this.inspectorNavBtn.classList.toggle('active', this.inspectorOpen);
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (this.modalBackdropEl.classList.contains('open')) return;
      const k = e.key.toLowerCase();
      if (k === '1' || k === 'a') {
        this.triggerCardRipple(this.handButtons[0], ROCK);
        this.handlers.onSelectMove(ROCK);
      } else if (k === '2' || k === 's') {
        this.triggerCardRipple(this.handButtons[1], SCISSORS);
        this.handlers.onSelectMove(SCISSORS);
      } else if (k === '3' || k === 'd') {
        this.triggerCardRipple(this.handButtons[2], PAPER);
        this.handlers.onSelectMove(PAPER);
      } else if (k === 'g') {
        this.graphicsOpen = !this.graphicsOpen;
        if (this.graphicsOpen) this.inspectorOpen = false;
        this.syncDrawers();
      } else if (k === 'j') {
        this.inspectorOpen = !this.inspectorOpen;
        if (this.inspectorOpen) this.graphicsOpen = false;
        this.syncDrawers();
      } else if (k === 'escape') {
        this.graphicsOpen = false;
        this.inspectorOpen = false;
        this.syncDrawers();
      }
    });
  }

  private bindSplitDrag(): void {
    let dragging = false;
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const norm = Math.max(0.06, Math.min(0.94, e.clientX / Math.max(1, window.innerWidth)));
      this.splitHandleEl.style.left = `${norm * 100}%`;
      this.handlers.onChangeKHDRSplitX(norm);
    };
    const onUp = () => {
      dragging = false;
    };
    this.splitHandleEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = true;
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  public setButtonsDisabled(disabled: boolean): void {
    for (const b of this.handButtons) {
      b.disabled = disabled;
      if (!disabled) {
        b.classList.remove('selected');
      }
    }
    if (!disabled) this.activeMoveSelection = null;
  }

  private toKanjiRound(n: number): string {
    const map = ['', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾'];
    return n >= 1 && n < map.length ? map[n] : `R${n}`;
  }

  public updateScoreboard(
    playerWins: number,
    npcWins: number,
    _draws: number,
    roundNumber: number,
    isAikoStreak = false
  ): void {
    const pScored = playerWins > this.playerWinsCache;
    const nScored = npcWins > this.npcWinsCache;
    this.playerWinsCache = playerWins;
    this.npcWinsCache = npcWins;

    this.scorePlayerEl.textContent = String(playerWins);
    this.scoreNpcEl.textContent = String(npcWins);
    if (pScored) this.pulseEl(this.scorePlayerEl, 'pop');
    if (nScored) this.pulseEl(this.scoreNpcEl, 'pop');

    this.roundCrestEl.textContent = this.toKanjiRound(roundNumber);
    this.pulseEl(this.roundCrestEl, 'spin-pop');
    this.drawDotEl.classList.toggle('active', isAikoStreak);

    // Render sculpted Ivory & Bronze Go-Stone victory pips (3 for bo5, 5 for bo9)
    const pipTotal = this.matchFormat === 'bo5' ? 3 : this.matchFormat === 'bo9' ? 5 : 0;
    if (pipTotal > 0) {
      this.playerPipsEl.innerHTML = Array.from({ length: pipTotal }, (_, idx) => {
        const filled = idx < playerWins;
        const fresh = pScored && idx === playerWins - 1;
        return `<span class="go-pip ivory ${filled ? 'filled' : ''} ${fresh ? 'fresh' : ''}"></span>`;
      }).join('');
      this.npcPipsEl.innerHTML = Array.from({ length: pipTotal }, (_, idx) => {
        const filled = idx < npcWins;
        const fresh = nScored && idx === npcWins - 1;
        return `<span class="go-pip bronze ${filled ? 'filled' : ''} ${fresh ? 'fresh' : ''}"></span>`;
      }).join('');
    } else {
      this.playerPipsEl.innerHTML = `<span class="endless-tag">∞</span>`;
      this.npcPipsEl.innerHTML = `<span class="endless-tag">∞</span>`;
    }
  }

  private pulseEl(el: Element, cls: string): void {
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  }

  public updatePreCommitSeal(seal: CommitSeal, _personaCode: string): void {
    this.currentSeal = seal;
    const label = this.sealPillEl.querySelector('#seal-chip-label');
    if (label) {
      label.textContent = `SHA-256 ✓`;
    }
    this.sealPillEl.title = `R${seal.round} 事前封印済 SHA-256: ${seal.shortHash}（クリックで検証）`;
    this.pulseEl(this.sealPillEl, 'sealed-pulse');
    this.renderInspectorDrawer();
  }

  /**
   * Show borderless cinematic Japanese calligraphy (`じゃーん / けーん / ぽん！`)
   */
  public showBeatCallout(label: string, beatIndex: 1 | 2 | 3): void {
    window.clearTimeout(this.theatreHideTimer);
    this.theatreStampEl.classList.remove('slammed');
    this.theatreStampEl.textContent = '';

    this.theatreTextEl.className = `theatre-text beat beat-${beatIndex}`;
    this.theatreTextEl.textContent = label;
    this.theatreEl.className = 'theatre-stage visible mode-beat';

    this.pulseEl(this.theatreTextEl, 'slam-in');
    this.pulseEl(this.theatreBrushEl, 'sweep-in');
  }

  /**
   * Show borderless iconic verdict calligraphy + slamming carved vermilion Hanko stamp!
   */
  public showVerdictStamp(outcome: 'WIN' | 'LOSS' | 'DRAW'): void {
    window.clearTimeout(this.theatreHideTimer);

    const text = outcome === 'WIN' ? '勝 利' : outcome === 'LOSS' ? '敗 北' : 'あいこ';
    const stamp = outcome === 'WIN' ? '勝' : outcome === 'LOSS' ? '敗' : '分';
    const tone = outcome === 'WIN' ? 'win' : outcome === 'LOSS' ? 'loss' : 'draw';

    this.theatreTextEl.className = `theatre-text verdict ${tone}`;
    this.theatreTextEl.textContent = text;
    this.theatreStampEl.className = `theatre-stamp ${tone}`;
    this.theatreStampEl.textContent = stamp;
    this.theatreEl.className = `theatre-stage visible mode-verdict ${tone}`;

    this.pulseEl(this.theatreTextEl, 'verdict-in');
    this.pulseEl(this.theatreBrushEl, 'sweep-in');
    this.pulseEl(this.theatreStampEl, 'slammed');

    // Auto-fade gently so the 3D sculptural arena breathes cleanly before next turn!
    this.theatreHideTimer = window.setTimeout(() => {
      this.theatreEl.classList.add('fading');
    }, 2200);
  }

  public hideCallout(): void {
    window.clearTimeout(this.theatreHideTimer);
    this.theatreEl.className = 'theatre-stage';
  }

  public updateRenderMetrics(m: RenderMetrics): void {
    this.lastMetrics = m;
    const sfShort = SHADOW_FLAME_SPECS[m.shadowFlameMode].shortLabel;

    if (this.showHudTelemetry) {
      this.microTelemetryEl.style.display = 'inline-flex';
      this.microTelemetryEl.innerHTML = `
        <span><strong>${m.fps}</strong> FPS</span>
        <span class="sep">·</span>
        <span>${this.currentSettings.resolution.toUpperCase()}</span>
        <span class="sep">·</span>
        <span class="accent">${m.khdrActive ? 'KHDR' : 'SDR'}</span>
        <span class="sep">·</span>
        <span class="accent">${sfShort}</span>
      `;
    } else {
      this.microTelemetryEl.style.display = 'none';
    }

    const liveEl = this.graphicsBodyEl.querySelector('#live-gpu-stats');
    if (liveEl) {
      liveEl.innerHTML = `
        <div class="metric-box"><div class="k">実解像度</div><div class="v">${m.renderWidth}×${m.renderHeight}</div></div>
        <div class="metric-box"><div class="k">実測FPS</div><div class="v good">${m.fps} FPS (${m.frameTimeMs}ms)</div></div>
        <div class="metric-box"><div class="k">ShadowMap</div><div class="v">${m.shadowMapSize}px</div></div>
        <div class="metric-box"><div class="k">Draw / Tri</div><div class="v">${m.drawCalls} / ${(m.triangles / 1000).toFixed(1)}k</div></div>
      `;
    }

    const jhandEl = this.graphicsBodyEl.querySelector('#live-jhand-stats');
    if (jhandEl) {
      jhandEl.innerHTML = `
        <div class="metric-box"><div class="k">手掌アーチ角 (CMC4/5)</div><div class="v gold">${m.jhandPalmCupDeg.toFixed(1)}°</div></div>
        <div class="metric-box"><div class="k">ORL 連成比</div><div class="v">${Math.round(m.jhandOrlRatio * 100)}% (${m.jhandDof}-DOF)</div></div>
      `;
    }

    const jsoundEl = this.graphicsBodyEl.querySelector('#live-jsound-stats');
    if (jsoundEl) {
      const peakStr = m.jsoundPeakDb <= -72 ? '待機' : `${m.jsoundPeakDb} dBFS`;
      jsoundEl.innerHTML = `
        <div class="metric-box"><div class="k">空間残響 RT60</div><div class="v gold">${m.jsoundRt60Sec.toFixed(2)}s</div></div>
        <div class="metric-box"><div class="k">Voices / Peak</div><div class="v">${m.jsoundVoices}ch · ${peakStr}</div></div>
        <div class="metric-box wide"><div class="k">物理衝突素材ペア</div><div class="v">${m.jsoundMaterialPair}</div></div>
      `;
    }
  }

  public syncSettings(settings: GraphicsSettings): void {
    this.currentSettings = { ...settings };
    this.splitOverlayEl.classList.toggle('active', settings.khdrSplitCompare);
    this.renderGraphicsDrawer();
  }

  public updateJNVTelemetry(telemetry: JNVRoundTelemetry | null, personaId: JNVPersonaId): void {
    this.lastTelemetry = telemetry;
    this.currentPersona = personaId;
    this.renderInspectorDrawer();
  }

  public showMatchModal(
    winner: 'player' | 'npc',
    playerWins: number,
    npcWins: number,
    draws: number,
    onRematchKeepMemory: () => void,
    onRematchFresh: () => void
  ): void {
    this.modalCrestEl.textContent = winner === 'player' ? '勝' : '敗';
    this.modalCrestEl.className = `modal-crest ${winner === 'player' ? 'win' : 'loss'}`;
    this.modalTitleEl.textContent = winner === 'player' ? '見 事 、 勝 利' : 'JNV1.0 の 勝 利';
    this.modalStatsEl.innerHTML = `
      <div class="stat-pill"><div class="n">${playerWins}</div><div class="l">あなた</div></div>
      <div class="stat-pill"><div class="n">${draws}</div><div class="l">あいこ</div></div>
      <div class="stat-pill"><div class="n">${npcWins}</div><div class="l">JNV1.0</div></div>
    `;
    this.modalBackdropEl.classList.add('open');

    const keepBtn = this.root.querySelector<HTMLButtonElement>('#modal-rematch-keep')!;
    const freshBtn = this.root.querySelector<HTMLButtonElement>('#modal-rematch-fresh')!;
    keepBtn.onclick = () => {
      this.closeMatchModal();
      onRematchKeepMemory();
    };
    freshBtn.onclick = () => {
      this.closeMatchModal();
      onRematchFresh();
    };
  }

  public closeMatchModal(): void {
    this.modalBackdropEl.classList.remove('open');
  }

  // ===========================================================================
  // LEFT DRAWER: ULTRA-CLEAN VISUAL GRAPHICS & STAGE STUDIO
  // ===========================================================================
  private renderGraphicsDrawer(): void {
    const prevScroll = this.graphicsBodyEl.scrollTop;
    const s = this.currentSettings;
    const m = this.lastMetrics;
    const fpsOptions: Array<{ v: FpsLimitMode; label: string }> = [
      { v: 60, label: '60 FPS' },
      { v: 120, label: '120 FPS' },
      { v: 0, label: '無制限' },
    ];
    const sfOptions: Array<{ v: ShadowFlameMode; label: string; sub: string }> = [
      { v: 'standard', label: '標準', sub: 'PCF' },
      { v: 'flash', label: '1.0 Flash', sub: '軽量Vogel' },
      { v: 'pro', label: '1.0 Pro', sub: 'PCSS+SSCS' },
    ];
    const fmtOptions: Array<{ v: MatchFormat; label: string }> = [
      { v: 'bo5', label: '3本先取' },
      { v: 'bo9', label: '5本先取' },
      { v: 'endless', label: '無制限' },
    ];

    this.graphicsBodyEl.innerHTML = `
      <section class="panel-section">
        <div class="section-head"><span class="section-title">解像度</span><span class="section-meta">HalfFloat</span></div>
        <div class="pill-grid cols-4">
          ${RESOLUTION_LIST.map(
            (r) => `
            <button class="pill-btn ${s.resolution === r.id ? 'active' : ''}" data-res="${r.id}">
              <span>${r.label}</span>
              <span class="sub">${r.nominalHeight}p</span>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">フレームレート</span></div>
        <div class="pill-grid cols-3">
          ${fpsOptions
            .map(
              (f) => `
            <button class="pill-btn ${s.fpsLimit === f.v ? 'active' : ''}" data-fps="${f.v}">
              <span>${f.label}</span>
            </button>
          `
            )
            .join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">KHDR</span><span class="section-meta">独自HDR</span></div>
        <div class="pill-grid cols-2">
          <button class="pill-btn ${s.khdrEnabled ? 'active' : ''}" data-khdr="on"><span>KHDR ON</span></button>
          <button class="pill-btn ${!s.khdrEnabled ? 'active' : ''}" data-khdr="off"><span>KHDR OFF</span></button>
        </div>
        <button class="pill-btn full-pill ${s.khdrSplitCompare ? 'active' : ''}" id="btn-khdr-split">
          <span>${s.khdrSplitCompare ? '✓ A/B 分割比較中' : 'A/B 分割比較'}</span>
        </button>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">Shadow Flame 1.0</span><span class="section-meta">${SHADOW_FLAME_SPECS[s.shadowFlame].shortLabel}</span></div>
        <div class="pill-grid cols-3">
          ${sfOptions
            .map(
              (sf) => `
            <button class="pill-btn ${s.shadowFlame === sf.v ? 'active' : ''}" data-sf="${sf.v}">
              <span>${sf.label}</span>
              <span class="sub">${sf.sub}</span>
            </button>
          `
            )
            .join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">JHand Kinesis 1.0</span><span class="section-meta">${s.jhandMode === 'biomech_pro' ? '27-DOF 生体関節' : '21-DOF 標準'}</span></div>
        <div class="pill-grid cols-2">
          <button class="pill-btn ${s.jhandMode === 'biomech_pro' ? 'active' : ''}" data-jhand="biomech_pro">
            <span>極 27-DOF</span>
            <span class="sub">ORL連成+手掌アーチ</span>
          </button>
          <button class="pill-btn ${s.jhandMode === 'standard' ? 'active' : ''}" data-jhand="standard">
            <span>標準 21-DOF</span>
            <span class="sub">基本バネ関節</span>
          </button>
        </div>
        <div class="metric-grid" id="live-jhand-stats">
          <div class="metric-box"><div class="k">手掌アーチ角 (CMC4/5)</div><div class="v gold">${m ? `${m.jhandPalmCupDeg.toFixed(1)}°` : '—'}</div></div>
          <div class="metric-box"><div class="k">ORL 連成比</div><div class="v">${m ? `${Math.round(m.jhandOrlRatio * 100)}% (${m.jhandDof}-DOF)` : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">JSound Engin 1.0</span><span class="section-meta">${s.jsoundQuality === 'pro' ? 'HRTF + 建築IR' : '軽量物理合成'}</span></div>
        <div class="pill-grid cols-2">
          <button class="pill-btn ${s.jsoundQuality === 'pro' ? 'active' : ''}" data-jsound="pro">
            <span>1.0 Pro</span>
            <span class="sub">HRTF + 畳み込みIR</span>
          </button>
          <button class="pill-btn ${s.jsoundQuality === 'lite' ? 'active' : ''}" data-jsound="lite">
            <span>1.0 Lite</span>
            <span class="sub">軽量モーダル合成</span>
          </button>
        </div>
        <button class="pill-btn full-pill ${s.jsoundAmbience ? 'active' : ''}" id="btn-jsound-ambience">
          <span>${s.jsoundAmbience ? '✓ 舞台環境音 ON（室鳴・風・湯滝）' : '舞台環境音 OFF'}</span>
        </button>
        <div class="metric-grid" id="live-jsound-stats">
          <div class="metric-box"><div class="k">空間残響 RT60</div><div class="v gold">${m ? `${m.jsoundRt60Sec.toFixed(2)}s` : '—'}</div></div>
          <div class="metric-box"><div class="k">Voices / Peak</div><div class="v">${m ? `${m.jsoundVoices}ch · ${m.jsoundPeakDb <= -72 ? '待機' : `${m.jsoundPeakDb} dBFS`}` : '—'}</div></div>
          <div class="metric-box wide"><div class="k">物理衝突素材ペア</div><div class="v">${m ? m.jsoundMaterialPair : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">建築ステージ</span><span class="section-meta">5舞台</span></div>
        <div class="stage-visual-grid">
          ${STAGE_LIST.map(
            (st) => `
            <button class="stage-thumb-card ${s.stage === st.id ? 'active' : ''}" data-stage="${st.id}">
              <div class="stage-thumb-img" style="background-image:url('${st.previewTexture}')"></div>
              <div class="stage-thumb-overlay">
                <div class="st-name">${st.nameJp}</div>
                <div class="st-sub">${st.subtitleJp}</div>
              </div>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">手の工芸素材</span></div>
        <div class="swatch-row-label">あなた</div>
        <div class="swatch-grid">
          ${HAND_MATERIAL_OPTIONS.map(
            (opt) => `
            <button class="swatch-btn ${s.playerHandMaterial === opt.id ? 'active' : ''}" data-pmat="${opt.id}">
              <span class="swatch-dot" style="background:${opt.swatch}"></span>
              <span>${opt.label}</span>
            </button>
          `
          ).join('')}
        </div>
        <div class="swatch-row-label">JNV1.0</div>
        <div class="swatch-grid">
          ${HAND_MATERIAL_OPTIONS.map(
            (opt) => `
            <button class="swatch-btn ${s.npcHandMaterial === opt.id ? 'active' : ''}" data-nmat="${opt.id}">
              <span class="swatch-dot" style="background:${opt.swatch}"></span>
              <span>${opt.label}</span>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">対局形式 · 表示</span></div>
        <div class="pill-grid cols-3">
          ${fmtOptions
            .map(
              (f) => `
            <button class="pill-btn ${this.matchFormat === f.v ? 'active' : ''}" data-fmt="${f.v}">
              <span>${f.label}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <button class="pill-btn full-pill ${this.showHudTelemetry ? 'active' : ''}" id="btn-toggle-telemetry">
          <span>${this.showHudTelemetry ? '✓ 画面FPSバッジ表示中' : '画面FPSバッジを表示'}</span>
        </button>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">リアルタイム描画計測</span></div>
        <div class="metric-grid" id="live-gpu-stats">
          <div class="metric-box"><div class="k">実解像度</div><div class="v">${m ? `${m.renderWidth}×${m.renderHeight}` : '—'}</div></div>
          <div class="metric-box"><div class="k">実測FPS</div><div class="v good">${m ? `${m.fps} FPS (${m.frameTimeMs}ms)` : '—'}</div></div>
          <div class="metric-box"><div class="k">ShadowMap</div><div class="v">${m ? `${m.shadowMapSize}px` : '—'}</div></div>
          <div class="metric-box"><div class="k">Draw / Tri</div><div class="v">${m ? `${m.drawCalls} / ${(m.triangles / 1000).toFixed(1)}k` : '—'}</div></div>
        </div>
      </section>
    `;

    // Bind listeners
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-res]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeResolution(b.dataset.res as ResolutionPresetId));
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-fps]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeFpsLimit(Number(b.dataset.fps) as FpsLimitMode));
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-khdr]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onToggleKHDR(b.dataset.khdr === 'on'));
    });
    this.graphicsBodyEl.querySelector('#btn-khdr-split')!.addEventListener('click', () => {
      this.handlers.onToggleKHDRSplit(!this.currentSettings.khdrSplitCompare);
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-sf]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeShadowFlame(b.dataset.sf as ShadowFlameMode));
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-jhand]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeJHandMode(b.dataset.jhand as JHandModeSetting));
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-jsound]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeJSoundQuality(b.dataset.jsound as JSoundModeSetting));
    });
    this.graphicsBodyEl.querySelector('#btn-jsound-ambience')!.addEventListener('click', () => {
      this.handlers.onToggleJSoundAmbience(!this.currentSettings.jsoundAmbience);
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeStage(b.dataset.stage as StageId));
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-pmat]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeHandMaterials(b.dataset.pmat as HandMaterialPreset, this.currentSettings.npcHandMaterial)
      );
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-nmat]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeHandMaterials(this.currentSettings.playerHandMaterial, b.dataset.nmat as HandMaterialPreset)
      );
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-fmt]').forEach((b) => {
      b.addEventListener('click', () => {
        this.matchFormat = b.dataset.fmt as MatchFormat;
        this.renderGraphicsDrawer();
        this.handlers.onChangeMatchFormat(this.matchFormat);
      });
    });
    this.graphicsBodyEl.querySelector('#btn-toggle-telemetry')!.addEventListener('click', () => {
      this.showHudTelemetry = !this.showHudTelemetry;
      if (this.lastMetrics) this.updateRenderMetrics(this.lastMetrics);
      this.renderGraphicsDrawer();
    });

    this.graphicsBodyEl.scrollTop = prevScroll;
  }

  // ===========================================================================
  // RIGHT DRAWER: JNV1.0 COGNITIVE CORE INSPECTOR
  // ===========================================================================
  private renderInspectorDrawer(): void {
    const t = this.lastTelemetry;
    const seal = this.currentSeal;

    const personaHtml = JNV_PERSONA_LIST.map(
      (p) => `
      <button class="persona-card ${this.currentPersona === p.id ? 'active' : ''}" data-persona="${p.id}">
        <div class="p-code">${p.code}</div>
        <div class="p-name">${p.nameJp}</div>
      </button>
    `
    ).join('');

    const predEntropy = t
      ? -t.predictedPlayerDist.reduce((acc, p) => (p > 1e-6 ? acc + p * Math.log2(p) : acc), 0)
      : 0;

    const telemetryHtml = t
      ? `
      <section class="panel-section">
        <div class="section-head">
          <span class="section-title">直前局 R${t.round} 読心解析</span>
          <span class="section-meta">${t.activeExpertCount}専門家</span>
        </div>
        <div class="jnv-verdict-chip">${t.insightJp}</div>
        <div class="prob-bar-list">
          ${([ROCK, SCISSORS, PAPER] as Move[])
            .map((m) => {
              const pct = Math.round(t.predictedPlayerDist[m] * 100);
              const isActual = t.actualPlayerMove === m;
              return `
              <div class="prob-row">
                <span class="prob-lbl">${MOVE_META[m].jp}${isActual ? '★' : ''}</span>
                <div class="prob-track"><div class="prob-fill ${isActual ? 'actual' : ''}" style="width:${pct}%"></div></div>
                <span class="prob-val">${pct}%</span>
              </div>`;
            })
            .join('')}
        </div>
        <div class="metric-grid" style="margin-top:8px">
          <div class="metric-box"><div class="k">ナッシュ混合 β</div><div class="v">${Math.round(t.nashBlendBeta * 100)}%</div></div>
          <div class="metric-box"><div class="k">ボラティリティ</div><div class="v ${t.driftDetected ? 'warn' : ''}">${Math.round(t.volatilityIndex * 100)}%</div></div>
          <div class="metric-box"><div class="k">予測エントロピー</div><div class="v">${predEntropy.toFixed(2)}</div></div>
          <div class="metric-box"><div class="k">被搾取リスク</div><div class="v ${t.selfExploitability > 0.45 ? 'warn' : 'good'}">${Math.round(t.selfExploitability * 100)}%</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">上位専門家</span><span class="section-meta">Fixed-Share</span></div>
        <div class="expert-list">
          ${t.topExperts
            .slice(0, 5)
            .map(
              (ex) => `
            <div class="expert-row">
              <div class="ex-top">
                <span class="ex-name">${ex.labelJp}</span>
                <span class="ex-meta">M${ex.metaLevel} · ${(ex.weight * 100).toFixed(1)}%</span>
              </div>
              <div class="ex-bar"><div class="ex-bar-fill" style="width:${Math.min(100, ex.weight * 320)}%"></div></div>
            </div>
          `
            )
            .join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">あなたの行動指標</span><span class="section-meta">${t.profile.dominantHabitJp}</span></div>
        <div class="metric-grid">
          <div class="metric-box"><div class="k">勝後継続</div><div class="v">${Math.round(t.profile.winStayRate * 100)}%</div></div>
          <div class="metric-box"><div class="k">敗後転換</div><div class="v">${Math.round(t.profile.loseShiftRate * 100)}%</div></div>
          <div class="metric-box"><div class="k">あいこ転換</div><div class="v">${Math.round(t.profile.drawChangeRate * 100)}%</div></div>
          <div class="metric-box"><div class="k">思考時間</div><div class="v">${Math.round(t.profile.avgLatencyMs)}ms</div></div>
        </div>
      </section>
    `
      : '';

    const benchHtml = this.benchmarkCache
      ? `
      <table class="bench-table">
        <thead><tr><th>対戦AI</th><th>決定勝率</th><th>純点/100</th><th>SHA</th></tr></thead>
        <tbody>
          ${this.benchmarkCache
            .map(
              (r) => `
            <tr>
              <td>${r.botNameJp.split('（')[0]}</td>
              <td class="num ${r.decisiveWinRate >= 0.65 ? 'strong' : ''}">${(r.decisiveWinRate * 100).toFixed(1)}%</td>
              <td class="num">${r.netEdgePer100 >= 0 ? '+' : ''}${r.netEdgePer100.toFixed(1)}</td>
              <td class="num strong">${r.allSealsVerified ? '✓' : '✗'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `
      : '';

    this.inspectorBodyEl.innerHTML = `
      <section class="panel-section">
        <div class="section-head"><span class="section-title">推論コア人格</span><span class="section-meta">7層推論</span></div>
        <div class="persona-grid">${personaHtml}</div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">SHA-256 事前封印証明</span><span class="section-meta">不正ゼロ</span></div>
        <div class="seal-box">
          <div class="seal-row">R${seal?.round ?? 1} 封印ダイジェスト</div>
          <div class="seal-hash">${seal?.hashHex ?? '生成中…'}</div>
          ${
            t?.seal
              ? `<div class="seal-verified">✓ R${t.round} 開示一致 (${MOVE_META[t.chosenNpcMove].jp} / ${t.seal.salt.slice(0, 8)})</div>`
              : ''
          }
        </div>
      </section>

      ${telemetryHtml}

      <section class="panel-section">
        <div class="section-head"><span class="section-title">数学ベンチマーク</span><span class="section-meta">1,600局</span></div>
        <button class="pill-btn full-pill" id="btn-run-bench">
          <span>${this.benchmarkCache ? '再実行 (8種×200局)' : 'ベンチマーク実行 (8種×200局)'}</span>
        </button>
        ${benchHtml}
      </section>
    `;

    this.inspectorBodyEl.querySelectorAll<HTMLButtonElement>('[data-persona]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangePersona(b.dataset.persona as JNVPersonaId));
    });

    this.inspectorBodyEl.querySelector('#btn-run-bench')!.addEventListener('click', () => {
      this.benchmarkCache = runJNV1Benchmark(this.currentPersona, 200);
      this.renderInspectorDrawer();
    });
  }
}
