/**
 * ★ Ultra-Sleek, Compact Museum-Lacquer & Gold-Leaf UI Controller — JANKEN · 極 v1.2 ★
 *
 * Strictly ZERO NEON · Compact Ergonomics · Mobile Fullscreen · Built-In PV Cinema Studio:
 *  - Compact Single-Row Mobile Header + Native Fullscreen API & iOS Safari Immersive Fallback
 *  - Much Smaller Sculpted Urushi Hand Cards (94×76 desktop / 72×58 mobile / 64×50 landscape)
 *  - Slim Tactical Strip: Spirit Gauge (気迫) + Overdrive (極一撃 2pt) + Feint (牽制) + Blitz Timer
 *  - Cinema 2.35:1 Letterbox + PV Mode Overlay (Official 26s / Battle 16s / Craft 18s + WebM Export + PNG)
 *  - Left Studio Drawer: Game Modes · PV Studio · Camera Director 2.0 · JSound Engin 1.2 (15-Inst)
 *    · JHand Kinesis 1.1 (18 Poses) · KHDR · Shadow Flame 1.0 · Compact UI Toggle
 *  - Right Drawer: JNV1.0 36-Expert Cognitive Inspector & SHA-256 Pre-Commit Proof
 */

import { AuditionInstrumentId } from '../audio/SoundEngine';
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
  CAMERA_STYLE_LIST,
  CAMERA_STYLE_SPECS,
  CameraStyleId,
  FpsLimitMode,
  GameModeId,
  GraphicsSettings,
  HandMaterialPreset,
  JHandModeSetting,
  JSoundModeSetting,
  JSoundSpatialMode,
  PVModeId,
  RESOLUTION_LIST,
  RenderMetrics,
  ResolutionPresetId,
  SHADOW_FLAME_SPECS,
  ShadowFlameMode,
  StageId,
} from '../graphics/GraphicsConfig';
import { PVOverlayState } from '../scene/PVDirector';
import { STAGE_LIST } from '../scene/StageBuilder';

export type MatchFormat = 'bo5' | 'bo9' | 'endless';

export interface TacticalState {
  gameMode: GameModeId;
  spiritPct: number; // 0..100
  overdriveArmed: boolean;
  feintReady: boolean;
  feintCooldown: number;
  ruledOutNpcMove: Move | null;
  winStreak: number;
  bestSurvivalStreak: number;
  drawStreak: number;
  blitzRatio: number | null; // 0..1 when Blitz countdown active
}

export interface GameUIHandlers {
  onSelectMove: (move: Move) => void;
  onHoverMove: (move: Move | null) => void;
  onTriggerFeint: () => void;
  onToggleOverdrive: () => void;
  onResetMatch: () => void;
  onChangeGameMode: (mode: GameModeId) => void;
  onChangeMatchFormat: (fmt: MatchFormat) => void;
  onChangeCameraStyle: (style: CameraStyleId) => void;
  onCycleCameraStyle: () => void;
  onStartPV: (mode: PVModeId, recordVideo: boolean) => void;
  onStopPV: () => void;
  onCaptureSnapshot: () => void;
  onToggleCompactUi: (compact: boolean) => void;
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
  onChangeJSoundSpatialMode: (spatial: JSoundSpatialMode) => void;
  onToggleJSoundAmbience: (enabled: boolean) => void;
  onAuditionSound: (instrument: AuditionInstrumentId) => void;
  onChangePersona: (persona: JNVPersonaId) => void;
  onToggleSound: () => boolean;
}

const AUDITION_INSTRUMENTS: Array<{ id: AuditionInstrumentId; label: string }> = [
  { id: 'taiko', label: '大太鼓' },
  { id: 'kotsuzumi', label: '小鼓' },
  { id: 'koto', label: '十三絃箏' },
  { id: 'shamisen', label: '三味線' },
  { id: 'biwa', label: '薩摩琵琶' },
  { id: 'shakuhachi', label: '尺八' },
  { id: 'shinobue', label: '篠笛' },
  { id: 'sho', label: '雅楽笙' },
  { id: 'rin_bell', label: 'おりん' },
  { id: 'atarigane', label: '祭摺鉦' },
  { id: 'mokugyo', label: '楠木魚' },
  { id: 'hyoshigi', label: '拍子木' },
  { id: 'furin', label: '江戸風鈴' },
  { id: 'sensu', label: '舞扇' },
  { id: 'shishi_odoshi', label: '鹿威し' },
];

const HAND_MATERIAL_OPTIONS: Array<{ id: HandMaterialPreset; label: string; swatch: string }> = [
  { id: 'hinoki_ivory', label: '檜象牙', swatch: 'linear-gradient(135deg, #f5e6ce 0%, #d4b282 100%)' },
  { id: 'karakuri_bronze', label: '真鍮銅', swatch: 'linear-gradient(135deg, #cfa16b 0%, #6d4c2b 100%)' },
  { id: 'bisque_porcelain', label: '京白磁', swatch: 'linear-gradient(135deg, #fcfaf6 0%, #d8d2c7 100%)' },
  { id: 'obsidian_gold', label: '黒曜金', swatch: 'linear-gradient(135deg, #43464c 0%, #1b1c1f 65%, #d6b268 100%)' },
];

const GAME_MODE_OPTIONS: Array<{ id: GameModeId; label: string; sub: string }> = [
  { id: 'classic', label: '真剣勝負', sub: '3先/5先' },
  { id: 'survival', label: '連勝道場', sub: '舞台巡回' },
  { id: 'blitz', label: '刹那3秒', sub: '秒読み戦' },
  { id: 'endless', label: '無制限', sub: '自由稽古' },
];

/** Bespoke Gold-Inlay Fine-Craft Hand Medallion Artwork (Zero Cliché Emojis) */
const ARTISAN_HAND_SVG: Record<Move, string> = {
  [ROCK]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M18 33V25.5C18 23.0 20.0 21 22.5 21C24.4 21 26 22.2 26.7 23.8V21.8C26.7 19.3 28.7 17.3 31.2 17.3C33.4 17.3 35.2 18.8 35.6 20.8C36.4 19.5 37.8 18.6 39.5 18.6C42.0 18.6 44 20.6 44 23.1V25.4C45.8 25.7 47.2 27.3 47.2 29.2V36.8C47.2 44.6 40.9 50.8 33.1 50.8H29.4C22.4 50.8 16.8 45.2 16.8 38.2V34.5C16.8 33.6 17.3 33 18 33Z" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M26.7 23.8V31.5M35.6 20.8V31.5M44 25.4V32.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M18 33.2H31.8C34.2 33.2 36 35.0 36 37.3C36 39.4 34.4 41.0 32.3 41.2L26.2 41.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  [SCISSORS]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M26.2 32.5L21.6 14.2C21.1 12.1 22.4 10 24.5 9.5C26.6 9.0 28.7 10.3 29.2 12.4L33.0 28.2L37.4 12.6C38.0 10.5 40.1 9.3 42.2 9.9C44.3 10.5 45.5 12.6 44.9 14.7L39.6 32.6" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M39.6 32.6C42.2 32.6 44.5 34.4 44.8 37.1L45.1 39.6C45.7 46.1 40.6 51.8 34.0 51.8H28.8C22.4 51.8 17.5 46.6 17.8 40.2L18.1 35.8C18.3 33.4 20.3 31.6 22.7 31.6C24.2 31.6 25.5 32.2 26.2 32.5" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M24.2 36.2H34.4C36.4 36.2 38.0 37.8 38.0 39.8C38.0 41.8 36.4 43.3 34.4 43.3H28.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  [PAPER]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M20.5 35.8L14.5 29.8C13.0 28.3 13.0 25.9 14.5 24.4C16.0 22.9 18.4 22.9 19.9 24.4L23.2 27.7V16.4C23.2 14.3 24.9 12.6 27.0 12.6C29.1 12.6 30.8 14.3 30.8 16.4V26.2V12.8C30.8 10.7 32.5 9.0 34.6 9.0C36.7 9.0 38.4 10.7 38.4 12.8V26.4V15.4C38.4 13.4 40.0 11.8 42.0 11.8C44.0 11.8 45.6 13.4 45.6 15.4V28.2V21.2C45.6 19.4 47.0 18.0 48.8 18.0C50.6 18.0 52.0 19.4 52.0 21.2V37.6C52.0 45.8 45.3 52.4 37.1 52.4H32.2C25.5 52.4 20.5 47.5 20.5 40.8V35.8Z" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

const NAV_ICONS = {
  pv: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>`,
  camera: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  graphics: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>`,
  inspector: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg>`,
  soundOn: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  soundOff: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  fullscreenEnter: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  fullscreenExit: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`,
  reset: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  lock: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
};

const CORNER_FILIGREE = `<svg class="corner-orn tl" viewBox="0 0 14 14" fill="none"><path d="M1 13V3C1 1.9 1.9 1 3 1H13" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn tr" viewBox="0 0 14 14" fill="none"><path d="M13 13V3C13 1.9 12.1 1 11 1H1" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn bl" viewBox="0 0 14 14" fill="none"><path d="M1 1V11C1 12.1 1.9 13 3 13H13" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn br" viewBox="0 0 14 14" fill="none"><path d="M13 1V11C13 12.1 12.1 13 11 13H1" stroke="currentColor" stroke-width="1.1"/></svg>`;

export class GameUI {
  private readonly root: HTMLElement;
  private readonly handlers: GameUIHandlers;

  private graphicsOpen = false;
  private inspectorOpen = false;
  private showHudTelemetry = false;
  private soundOn = true;
  private isImmersiveFs = false;
  private currentSettings: GraphicsSettings;
  private currentPersona: JNVPersonaId = 'apex';
  private matchFormat: MatchFormat = 'bo5';
  private gameMode: GameModeId = 'classic';
  private benchmarkCache: BenchmarkBotResult[] | null = null;
  private lastMetrics: RenderMetrics | null = null;

  private playerWinsCache = 0;
  private npcWinsCache = 0;
  private tacticalState: TacticalState = {
    gameMode: 'classic',
    spiritPct: 30,
    overdriveArmed: false,
    feintReady: true,
    feintCooldown: 0,
    ruledOutNpcMove: null,
    winStreak: 0,
    bestSurvivalStreak: 0,
    drawStreak: 0,
    blitzRatio: null,
  };
  private pvState: PVOverlayState = {
    active: false,
    mode: 'grand_trailer',
    recording: false,
    progress: 0,
    actIndex: 0,
    actTotal: 6,
    badge: '',
    title: '',
    subtitle: '',
    showHanko: false,
    recordedUrl: null,
    recordedFilename: 'janken-kiwami-pv.webm',
    recordingSupported: true,
  };

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

  // Tactical strip refs
  private spiritFillEl!: HTMLElement;
  private btnOverdriveEl!: HTMLButtonElement;
  private btnFeintEl!: HTMLButtonElement;
  private tacticalInfoEl!: HTMLElement;
  private blitzBarEl!: HTMLElement;
  private blitzFillEl!: HTMLElement;

  private sealPillEl!: HTMLElement;
  private handButtons: HTMLButtonElement[] = [];

  private graphicsDrawerEl!: HTMLElement;
  private inspectorDrawerEl!: HTMLElement;
  private pvNavBtn!: HTMLButtonElement;
  private cameraNavBtn!: HTMLButtonElement;
  private graphicsNavBtn!: HTMLButtonElement;
  private inspectorNavBtn!: HTMLButtonElement;
  private soundNavBtn!: HTMLButtonElement;
  private fsNavBtn!: HTMLButtonElement;

  private graphicsBodyEl!: HTMLElement;
  private inspectorBodyEl!: HTMLElement;

  private splitOverlayEl!: HTMLElement;
  private splitHandleEl!: HTMLElement;

  // Cinema Letterbox & PV Mode Overlay refs
  private cinemaBarsEl!: HTMLElement;
  private pvOverlayEl!: HTMLElement;
  private pvBadgeEl!: HTMLElement;
  private pvTitleEl!: HTMLElement;
  private pvSubtitleEl!: HTMLElement;
  private pvHankoEl!: HTMLElement;
  private pvProgressFillEl!: HTMLElement;
  private pvRecStatusEl!: HTMLElement;
  private pvDownloadLinkEl!: HTMLAnchorElement;
  private pvModeBtns: HTMLButtonElement[] = [];

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
    this.updateTacticalState(this.tacticalState);
    this.bindKeyboardShortcuts();
    this.bindSplitDrag();
    this.bindFullscreenListeners();
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <!-- Dramatic Cinema 2.35:1 Letterbox Bars (Overdrive / Match Point / PV Mode) -->
      <div class="cinema-letterbox" id="cinema-letterbox" aria-hidden="true">
        <div class="cinema-bar top"></div>
        <div class="cinema-bar bottom"></div>
      </div>

      <!-- Built-In PV Cinema Overlay (Calligraphy Cards + WebM Recorder Controls) -->
      <div class="pv-overlay" id="pv-overlay" aria-live="polite">
        <div class="pv-top-strip">
          <div class="pv-rec-pill" id="pv-rec-status">PV CINEMA</div>
          <div class="pv-progress-track"><div class="pv-progress-fill" id="pv-progress-fill"></div></div>
        </div>
        <div class="pv-card-stage">
          <div class="pv-card-copy">
            <div class="pv-badge" id="pv-badge"></div>
            <h2 class="pv-title" id="pv-title"></h2>
            <p class="pv-subtitle" id="pv-subtitle"></p>
          </div>
          <div class="pv-hanko" id="pv-hanko">極</div>
        </div>
        <div class="pv-controls">
          <div class="pv-mode-group">
            <button class="pv-ctrl-btn" data-pv-mode="grand_trailer">公式PV 26s</button>
            <button class="pv-ctrl-btn" data-pv-mode="battle_reel">激闘 16s</button>
            <button class="pv-ctrl-btn" data-pv-mode="craft_showcase">工芸 18s</button>
          </div>
          <div class="pv-action-group">
            <button class="pv-ctrl-btn accent" id="pv-btn-record">● WebM録画</button>
            <button class="pv-ctrl-btn" id="pv-btn-snap">静止画PNG</button>
            <a class="pv-ctrl-btn download" id="pv-download-link" download="janken-kiwami-pv.webm" style="display:none">↓ WebM保存</a>
            <button class="pv-ctrl-btn close" id="pv-btn-stop">終了</button>
          </div>
        </div>
      </div>

      <!-- KHDR vs Standard SDR Live A/B Split Overlay -->
      <div class="khdr-split-overlay" id="khdr-split-overlay">
        <div class="khdr-split-label left">標準 SDR</div>
        <div class="khdr-split-label right">KHDR ON</div>
        <div class="khdr-split-handle" id="khdr-split-handle" title="ドラッグしてKHDR比較位置を移動">
          <div class="khdr-split-knob">⇄</div>
        </div>
      </div>

      <!-- Ultra-Compact Luxury Header (Single-Row on Mobile!) -->
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

        <!-- Compact Sculpted Brass & Lacquer Icon Medallions -->
        <nav class="top-actions" aria-label="コントロール">
          <button class="icon-medallion" id="btn-pv" data-tip="PVシネマ再生・録画 (P)" aria-label="PVシネマ">
            ${NAV_ICONS.pv}
          </button>
          <button class="icon-medallion desktop-only" id="btn-camera" data-tip="カメラ切替 (C)" aria-label="カメラ視点切替">
            ${NAV_ICONS.camera}
          </button>
          <button class="icon-medallion" id="btn-graphics" data-tip="映像・音響1.2・設定 (G)" aria-label="スタジオ設定">
            ${NAV_ICONS.graphics}
          </button>
          <button class="icon-medallion" id="btn-inspector" data-tip="JNV1.0 解析 (J)" aria-label="JNV1.0解析">
            ${NAV_ICONS.inspector}
            <span class="medallion-seal-dot"></span>
          </button>
          <button class="icon-medallion" id="btn-sound" data-tip="JSound 1.2 ON/OFF" aria-label="音響切替">
            ${NAV_ICONS.soundOn}
          </button>
          <button class="icon-medallion" id="btn-fullscreen" data-tip="全画面表示 (F)" aria-label="全画面切替">
            ${NAV_ICONS.fullscreenEnter}
          </button>
          <button class="icon-medallion desktop-only" id="btn-reset-match" data-tip="最初から" aria-label="試合をリセット">
            ${NAV_ICONS.reset}
          </button>
        </nav>
      </header>

      <!-- Borderless Calligraphic Battle Theatre -->
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

      <!-- Compact Bottom Artisan Dock (Slim Tactical Strip + Small Refined Hand Cards) -->
      <footer class="bottom-dock">
        <!-- Blitz 3.5s Countdown Hairline (visible only in Blitz mode) -->
        <div class="blitz-bar" id="blitz-bar" style="display:none">
          <div class="blitz-fill" id="blitz-fill"></div>
        </div>

        <!-- Ultra-Slim Tactical Strip: Spirit Overdrive + Feint + Streak/Hint -->
        <div class="tactical-strip" id="tactical-strip">
          <div class="spirit-meter" title="勝敗・あいこで気迫が上昇。100%で極一撃（勝利時2点）が発動可能">
            <span class="spirit-lbl">気迫</span>
            <div class="spirit-track"><div class="spirit-fill" id="spirit-fill"></div></div>
          </div>
          <button class="tact-pill overdrive" id="btn-overdrive" disabled title="気迫100%で発動：勝利時2点＆極演出 (Q)">
            極一撃
          </button>
          <button class="tact-pill feint" id="btn-feint" title="牽制：SHA-256封印済みの手から相手が出さない1手を読破 (E)">
            牽制
          </button>
          <span class="tact-info" id="tact-info" style="display:none"></span>
          <button class="seal-chip" id="seal-chip" title="クリックでJNV1.0事前封印SHA-256ハッシュを確認">
            ${NAV_ICONS.lock}
            <span id="seal-chip-label">SHA ✓</span>
          </button>
        </div>

        <div class="hand-cards" id="hand-dock">
          ${([ROCK, SCISSORS, PAPER] as Move[])
            .map(
              (m, idx) => `
              <button class="artisan-card" id="btn-move-${MOVE_META[m].id}" data-move="${m}">
                ${CORNER_FILIGREE}
                <div class="card-sheen"></div>
                <div class="card-ripple"></div>
                <span class="card-ruled-tag" style="display:none">敵×</span>
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
      </footer>

      <!-- Left Slide-Out Drawer: Graphics · Camera 2.0 · JHand 1.1 · JSound 1.2 · PV Studio -->
      <aside class="drawer left" id="drawer-graphics" aria-label="スタジオ設定">
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>映像 · 音響 · 演出</h2>
            <span class="drawer-badge">v1.2 極</span>
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

    this.spiritFillEl = this.root.querySelector('#spirit-fill')!;
    this.btnOverdriveEl = this.root.querySelector('#btn-overdrive')!;
    this.btnFeintEl = this.root.querySelector('#btn-feint')!;
    this.tacticalInfoEl = this.root.querySelector('#tact-info')!;
    this.blitzBarEl = this.root.querySelector('#blitz-bar')!;
    this.blitzFillEl = this.root.querySelector('#blitz-fill')!;
    this.sealPillEl = this.root.querySelector('#seal-chip')!;

    this.graphicsDrawerEl = this.root.querySelector('#drawer-graphics')!;
    this.inspectorDrawerEl = this.root.querySelector('#drawer-inspector')!;
    this.pvNavBtn = this.root.querySelector('#btn-pv')!;
    this.cameraNavBtn = this.root.querySelector('#btn-camera')!;
    this.graphicsNavBtn = this.root.querySelector('#btn-graphics')!;
    this.inspectorNavBtn = this.root.querySelector('#btn-inspector')!;
    this.soundNavBtn = this.root.querySelector('#btn-sound')!;
    this.fsNavBtn = this.root.querySelector('#btn-fullscreen')!;

    this.graphicsBodyEl = this.root.querySelector('#graphics-body')!;
    this.inspectorBodyEl = this.root.querySelector('#inspector-body')!;

    this.splitOverlayEl = this.root.querySelector('#khdr-split-overlay')!;
    this.splitHandleEl = this.root.querySelector('#khdr-split-handle')!;

    this.cinemaBarsEl = this.root.querySelector('#cinema-letterbox')!;
    this.pvOverlayEl = this.root.querySelector('#pv-overlay')!;
    this.pvBadgeEl = this.root.querySelector('#pv-badge')!;
    this.pvTitleEl = this.root.querySelector('#pv-title')!;
    this.pvSubtitleEl = this.root.querySelector('#pv-subtitle')!;
    this.pvHankoEl = this.root.querySelector('#pv-hanko')!;
    this.pvProgressFillEl = this.root.querySelector('#pv-progress-fill')!;
    this.pvRecStatusEl = this.root.querySelector('#pv-rec-status')!;
    this.pvDownloadLinkEl = this.root.querySelector('#pv-download-link')!;
    this.pvModeBtns = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-pv-mode]'));

    this.modalBackdropEl = this.root.querySelector('#match-modal')!;
    this.modalCrestEl = this.root.querySelector('#modal-crest')!;
    this.modalTitleEl = this.root.querySelector('#modal-title')!;
    this.modalStatsEl = this.root.querySelector('#modal-stats')!;

    // Bind 3D-tilt & spring click ripples on the 3 Compact Artisan Hand Cards
    this.handButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.artisan-card'));
    for (const btn of this.handButtons) {
      const move = Number(btn.dataset.move) as Move;
      btn.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') this.handlers.onHoverMove(move);
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.removeProperty('--rx');
        btn.style.removeProperty('--ry');
        this.handlers.onHoverMove(null);
      });
      btn.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const rect = btn.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
        const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
        btn.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
        btn.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
        btn.style.setProperty('--rx', `${((0.5 - ny) * 9).toFixed(2)}deg`);
        btn.style.setProperty('--ry', `${((nx - 0.5) * 11).toFixed(2)}deg`);
      });
      btn.addEventListener('click', () => {
        this.triggerCardRipple(btn);
        this.handlers.onSelectMove(move);
      });
    }

    // Tactical Strip actions
    this.btnOverdriveEl.addEventListener('click', () => this.handlers.onToggleOverdrive());
    this.btnFeintEl.addEventListener('click', () => this.handlers.onTriggerFeint());

    // Top-right medallion controls
    this.pvNavBtn.addEventListener('click', () => {
      if (this.pvState.active) {
        this.handlers.onStopPV();
      } else {
        this.graphicsOpen = false;
        this.inspectorOpen = false;
        this.syncDrawers();
        this.handlers.onStartPV('grand_trailer', false);
      }
    });

    this.cameraNavBtn.addEventListener('click', () => {
      this.handlers.onCycleCameraStyle();
    });

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

    this.fsNavBtn.addEventListener('click', () => {
      void this.toggleFullscreen();
    });

    this.root.querySelector('#btn-reset-match')!.addEventListener('click', () => {
      this.closeMatchModal();
      this.handlers.onResetMatch();
    });

    // PV Cinema Overlay Controls
    for (const b of this.pvModeBtns) {
      b.addEventListener('click', () => {
        const mode = b.dataset.pvMode as PVModeId;
        this.handlers.onStartPV(mode, false);
      });
    }
    this.root.querySelector('#pv-btn-record')!.addEventListener('click', () => {
      this.handlers.onStartPV(this.pvState.mode, true);
    });
    this.root.querySelector('#pv-btn-snap')!.addEventListener('click', () => {
      this.handlers.onCaptureSnapshot();
    });
    this.root.querySelector('#pv-btn-stop')!.addEventListener('click', () => {
      this.handlers.onStopPV();
    });
  }

  public async toggleFullscreen(): Promise<void> {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    const nativeFsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (nativeFsEl) {
      try {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } catch {
        // fallback below
      }
      this.setImmersiveFullscreen(false);
      return;
    }

    if (this.isImmersiveFs) {
      this.setImmersiveFullscreen(false);
      return;
    }

    let enteredNative = false;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        enteredNative = true;
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        enteredNative = true;
      }
    } catch {
      enteredNative = false;
    }

    // Graceful fallback for iOS Safari / restricted mobile webviews: enter zero-chrome 100dvh immersive fullscreen!
    this.setImmersiveFullscreen(true);
    if (!enteredNative) {
      window.scrollTo(0, 1);
    }
  }

  private setImmersiveFullscreen(active: boolean): void {
    this.isImmersiveFs = active;
    document.documentElement.classList.toggle('immersive-fullscreen', active);
    this.fsNavBtn.innerHTML = active ? NAV_ICONS.fullscreenExit : NAV_ICONS.fullscreenEnter;
    this.fsNavBtn.classList.toggle('active', active);
    this.fsNavBtn.dataset.tip = active ? '全画面解除 (F)' : '全画面表示 (F)';
  }

  private bindFullscreenListeners(): void {
    const syncFs = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (!isFs && this.isImmersiveFs && document.fullscreenEnabled) {
        this.setImmersiveFullscreen(false);
      } else if (isFs) {
        this.setImmersiveFullscreen(true);
      }
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
  }

  private triggerCardRipple(btn: HTMLButtonElement): void {
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
      const k = e.key.toLowerCase();

      if (k === 'escape') {
        if (this.pvState.active) {
          this.handlers.onStopPV();
          return;
        }
        this.graphicsOpen = false;
        this.inspectorOpen = false;
        this.syncDrawers();
        return;
      }

      if (this.pvState.active || this.modalBackdropEl.classList.contains('open')) return;

      if (k === '1' || k === 'a') {
        this.triggerCardRipple(this.handButtons[0]);
        this.handlers.onSelectMove(ROCK);
      } else if (k === '2' || k === 's') {
        this.triggerCardRipple(this.handButtons[1]);
        this.handlers.onSelectMove(SCISSORS);
      } else if (k === '3' || k === 'd') {
        this.triggerCardRipple(this.handButtons[2]);
        this.handlers.onSelectMove(PAPER);
      } else if (k === 'q') {
        this.handlers.onToggleOverdrive();
      } else if (k === 'e') {
        this.handlers.onTriggerFeint();
      } else if (k === 'c') {
        this.handlers.onCycleCameraStyle();
      } else if (k === 'p') {
        this.graphicsOpen = false;
        this.inspectorOpen = false;
        this.syncDrawers();
        this.handlers.onStartPV('grand_trailer', false);
      } else if (k === 'f') {
        void this.toggleFullscreen();
      } else if (k === 'g') {
        this.graphicsOpen = !this.graphicsOpen;
        if (this.graphicsOpen) this.inspectorOpen = false;
        this.syncDrawers();
      } else if (k === 'j') {
        this.inspectorOpen = !this.inspectorOpen;
        if (this.inspectorOpen) this.graphicsOpen = false;
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

  public setCinemaBars(active: boolean): void {
    this.cinemaBarsEl.classList.toggle('active', active || this.pvState.active);
  }

  public updatePVState(st: PVOverlayState): void {
    const prevActive = this.pvState.active;
    const prevUrl = this.pvState.recordedUrl;
    this.pvState = { ...st };
    this.root.classList.toggle('pv-active', st.active);
    this.pvOverlayEl.classList.toggle('active', st.active);
    this.cinemaBarsEl.classList.toggle('active', st.active);
    this.pvNavBtn.classList.toggle('active', st.active);

    if (st.active) {
      this.pvBadgeEl.textContent = st.badge;
      this.pvTitleEl.textContent = st.title;
      this.pvSubtitleEl.textContent = st.subtitle;
      this.pvHankoEl.classList.toggle('visible', st.showHanko);
      this.pvProgressFillEl.style.width = `${Math.round(st.progress * 100)}%`;
      this.pvRecStatusEl.textContent = st.recording
        ? `● REC WebM · ACT ${st.actIndex}/${st.actTotal}`
        : `PV CINEMA · ACT ${st.actIndex}/${st.actTotal}`;
      this.pvRecStatusEl.classList.toggle('recording', st.recording);

      for (const b of this.pvModeBtns) {
        b.classList.toggle('active', b.dataset.pvMode === st.mode);
      }
    }

    if (st.recordedUrl) {
      this.pvDownloadLinkEl.href = st.recordedUrl;
      this.pvDownloadLinkEl.download = st.recordedFilename;
      this.pvDownloadLinkEl.style.display = 'inline-flex';
    } else {
      this.pvDownloadLinkEl.style.display = 'none';
    }
    if (prevActive !== st.active || prevUrl !== st.recordedUrl) {
      this.renderGraphicsDrawer();
    }
  }

  public updateTacticalState(st: TacticalState): void {
    this.tacticalState = { ...st };
    this.gameMode = st.gameMode;

    // Spirit Gauge & Overdrive button
    const pct = Math.max(0, Math.min(100, Math.round(st.spiritPct)));
    this.spiritFillEl.style.width = `${pct}%`;
    this.spiritFillEl.classList.toggle('full', pct >= 100);

    const canOverdrive = pct >= 100;
    this.btnOverdriveEl.disabled = !canOverdrive;
    this.btnOverdriveEl.classList.toggle('ready', canOverdrive && !st.overdriveArmed);
    this.btnOverdriveEl.classList.toggle('armed', st.overdriveArmed);
    this.btnOverdriveEl.textContent = st.overdriveArmed ? '極一撃 装填中' : canOverdrive ? '極一撃 発動' : `極一撃 ${pct}%`;

    // Feint button
    this.btnFeintEl.disabled = !st.feintReady;
    this.btnFeintEl.classList.toggle('ready', st.feintReady);
    this.btnFeintEl.textContent = st.feintReady ? '牽制' : `牽制(${st.feintCooldown})`;

    // Tactical info chip (Ruled-out Feint intel, Streak, or Survival Best)
    if (st.ruledOutNpcMove !== null) {
      this.tacticalInfoEl.style.display = 'inline-flex';
      this.tacticalInfoEl.className = 'tact-info intel';
      this.tacticalInfoEl.textContent = `読破：敵は「${MOVE_META[st.ruledOutNpcMove].jp}」以外`;
    } else if (st.winStreak >= 2) {
      this.tacticalInfoEl.style.display = 'inline-flex';
      this.tacticalInfoEl.className = 'tact-info streak';
      this.tacticalInfoEl.textContent = `${this.toKanjiNum(st.winStreak)}連勝`;
    } else if (st.gameMode === 'survival' && st.bestSurvivalStreak > 0) {
      this.tacticalInfoEl.style.display = 'inline-flex';
      this.tacticalInfoEl.className = 'tact-info';
      this.tacticalInfoEl.textContent = `最高${st.bestSurvivalStreak}連勝`;
    } else if (st.drawStreak >= 2) {
      this.tacticalInfoEl.style.display = 'inline-flex';
      this.tacticalInfoEl.className = 'tact-info';
      this.tacticalInfoEl.textContent = `白熱あいこ ×${st.drawStreak}`;
    } else {
      this.tacticalInfoEl.style.display = 'none';
    }

    // Mark ruled-out move subtly on hand cards
    for (const btn of this.handButtons) {
      const m = Number(btn.dataset.move) as Move;
      const tag = btn.querySelector<HTMLElement>('.card-ruled-tag');
      if (tag) {
        tag.style.display = st.ruledOutNpcMove === m ? 'inline-flex' : 'none';
      }
    }

    // Blitz 3.5s countdown hairline
    if (st.blitzRatio !== null) {
      this.blitzBarEl.style.display = 'block';
      const clamped = Math.max(0, Math.min(1, st.blitzRatio));
      this.blitzFillEl.style.width = `${(clamped * 100).toFixed(1)}%`;
      this.blitzFillEl.classList.toggle('urgent', clamped < 0.34);
    } else {
      this.blitzBarEl.style.display = 'none';
    }
  }

  public setButtonsDisabled(disabled: boolean): void {
    for (const b of this.handButtons) {
      b.disabled = disabled;
      if (!disabled) {
        b.classList.remove('selected');
      }
    }
    if (disabled) {
      this.btnFeintEl.disabled = true;
      this.btnOverdriveEl.disabled = true;
    } else {
      this.updateTacticalState(this.tacticalState);
    }
  }

  private toKanjiNum(n: number): string {
    const map = ['零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾'];
    return n >= 0 && n < map.length ? map[n] : String(n);
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

    const pipTotal =
      this.gameMode === 'classic' || this.gameMode === 'blitz'
        ? this.matchFormat === 'bo5'
          ? 3
          : this.matchFormat === 'bo9'
          ? 5
          : 0
        : 0;
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
      const tag = this.gameMode === 'survival' ? '連勝' : '∞';
      this.playerPipsEl.innerHTML = `<span class="endless-tag">${tag}</span>`;
      this.npcPipsEl.innerHTML = `<span class="endless-tag">${tag}</span>`;
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
      label.textContent = `SHA ✓`;
    }
    this.sealPillEl.title = `R${seal.round} 事前封印済 SHA-256: ${seal.shortHash}（クリックで検証）`;
    this.pulseEl(this.sealPillEl, 'sealed-pulse');
    this.renderInspectorDrawer();
  }

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

  public showVerdictStamp(outcome: 'WIN' | 'LOSS' | 'DRAW', extraBadge?: string): void {
    window.clearTimeout(this.theatreHideTimer);

    const text =
      extraBadge ?? (outcome === 'WIN' ? '勝 利' : outcome === 'LOSS' ? '敗 北' : 'あいこ');
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

    this.theatreHideTimer = window.setTimeout(() => {
      this.theatreEl.classList.add('fading');
    }, 2000);
  }

  public hideCallout(): void {
    window.clearTimeout(this.theatreHideTimer);
    this.theatreEl.className = 'theatre-stage';
  }

  public updateRenderMetrics(m: RenderMetrics): void {
    this.lastMetrics = m;
    const sfShort = SHADOW_FLAME_SPECS[m.shadowFlameMode].shortLabel;
    const camShort = CAMERA_STYLE_SPECS[m.cameraStyle].shortJp;

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
        <span class="sep">·</span>
        <span>${camShort}</span>
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
        <div class="metric-box"><div class="k">自由度 / 掌形数</div><div class="v gold">${m.jhandDof}DOF · ${m.jhandPoseCount}種</div></div>
        <div class="metric-box"><div class="k">ICRカム / FDI筋</div><div class="v">${m.jhandIcrGlideMm.toFixed(2)}mm · ${m.jhandFdiPct}%</div></div>
        <div class="metric-box"><div class="k">手掌アーチ / ORL</div><div class="v">${m.jhandPalmCupDeg.toFixed(1)}° · ${Math.round(m.jhandOrlRatio * 100)}%</div></div>
        <div class="metric-box"><div class="k">協調相</div><div class="v">${m.jhandSynergyJp}</div></div>
      `;
    }

    const jsoundEl = this.graphicsBodyEl.querySelector('#live-jsound-stats');
    if (jsoundEl) {
      const peakStr = m.jsoundPeakDb <= -72 ? '待機' : `${m.jsoundPeakDb} dBFS`;
      jsoundEl.innerHTML = `
        <div class="metric-box"><div class="k">内部DSP / 立体反射</div><div class="v gold">${m.jsoundDspRateKhz}kHz(${m.jsoundOversampling}×) · ${m.jsoundEarlyRays}Ray</div></div>
        <div class="metric-box"><div class="k">残響 RT60 / Peak</div><div class="v">${m.jsoundRt60Sec.toFixed(2)}s · ${peakStr}</div></div>
        <div class="metric-box"><div class="k">衝突素材ペア</div><div class="v">${m.jsoundMaterialPair}</div></div>
        <div class="metric-box"><div class="k">直近発音 (${m.jsoundVoices}ch)</div><div class="v">${m.jsoundLastEventJp}</div></div>
      `;
    }
  }

  public syncSettings(settings: GraphicsSettings): void {
    this.currentSettings = { ...settings };
    this.splitOverlayEl.classList.toggle('active', settings.khdrSplitCompare);
    this.root.classList.toggle('ui-compact', settings.compactUi);
    this.cameraNavBtn.dataset.tip = `カメラ: ${CAMERA_STYLE_SPECS[settings.cameraStyle].labelJp} (C)`;
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
    onRematchFresh: () => void,
    customTitle?: string
  ): void {
    this.modalCrestEl.textContent = winner === 'player' ? '勝' : '敗';
    this.modalCrestEl.className = `modal-crest ${winner === 'player' ? 'win' : 'loss'}`;
    this.modalTitleEl.textContent = customTitle ?? (winner === 'player' ? '見 事 、 勝 利' : 'JNV1.0 の 勝 利');
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
  // LEFT DRAWER: STUDIO (GAMEPLAY · PV · CAMERA 2.0 · JSOUND 1.2 · JHAND · GPU)
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
    const spatialOptions: Array<{ v: JSoundSpatialMode; label: string; sub: string }> = [
      { v: 'binaural_3d', label: '立体3D', sub: 'HRTF+ITD' },
      { v: 'studio_wide', label: '広域音場', sub: 'M/S拡張' },
      { v: 'focused', label: '集中定位', sub: '明瞭定位' },
    ];

    this.graphicsBodyEl.innerHTML = `
      <section class="panel-section">
        <div class="section-head"><span class="section-title">対局モード</span><span class="section-meta">${GAME_MODE_OPTIONS.find((g) => g.id === this.gameMode)?.label ?? '真剣勝負'}</span></div>
        <div class="pill-grid cols-2">
          ${GAME_MODE_OPTIONS.map(
            (gm) => `
            <button class="pill-btn ${this.gameMode === gm.id ? 'active' : ''}" data-gmode="${gm.id}">
              <span>${gm.label}</span>
              <span class="sub">${gm.sub}</span>
            </button>
          `
          ).join('')}
        </div>
        ${
          this.gameMode === 'classic' || this.gameMode === 'blitz'
            ? `<div class="pill-grid cols-3" style="margin-top:5px">
                ${fmtOptions
                  .map(
                    (f) => `
                  <button class="pill-btn ${this.matchFormat === f.v ? 'active' : ''}" data-fmt="${f.v}">
                    <span>${f.label}</span>
                  </button>`
                  )
                  .join('')}
              </div>`
            : ''
        }
        <button class="pill-btn full-pill" id="btn-drawer-reset"><span>↺ 対局をリセット</span></button>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">PVシネマ制作・録画</span><span class="section-meta">2.35:1 WebM</span></div>
        <div class="pill-grid cols-2">
          <button class="pill-btn active" data-start-pv="grand_trailer" data-rec="0">
            <span>▶ 公式PV再生</span>
            <span class="sub">全6幕 · 26秒</span>
          </button>
          <button class="pill-btn" data-start-pv="grand_trailer" data-rec="1">
            <span>● PV録画 (WebM)</span>
            <span class="sub">映像+3D音響</span>
          </button>
          <button class="pill-btn" data-start-pv="battle_reel" data-rec="0">
            <span>激闘リール</span>
            <span class="sub">3連戦 · 16秒</span>
          </button>
          <button class="pill-btn" data-start-pv="craft_showcase" data-rec="0">
            <span>工芸・音響鑑賞</span>
            <span class="sub">マクロ · 18秒</span>
          </button>
        </div>
        <button class="pill-btn full-pill" id="btn-drawer-snap"><span>静止画シネマ保存 (1920×1080 PNG)</span></button>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">Camera Director 2.0</span><span class="section-meta">${CAMERA_STYLE_SPECS[s.cameraStyle].labelJp}</span></div>
        <div class="pill-grid cols-3">
          ${CAMERA_STYLE_LIST.map(
            (c) => `
            <button class="pill-btn ${s.cameraStyle === c.id ? 'active' : ''}" data-cam="${c.id}">
              <span>${c.shortJp}</span>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">JSound Engin 1.2</span><span class="section-meta">${s.jsoundQuality === 'ultra' ? '192kHz 4×OS · 128Ray' : s.jsoundQuality === 'pro' ? '96kHz 2×OS · 62Ray' : '軽量物理合成'}</span></div>
        <div class="pill-grid cols-3">
          <button class="pill-btn ${s.jsoundQuality === 'ultra' ? 'active' : ''}" data-jsound="ultra">
            <span>1.2 Ultra</span>
            <span class="sub">192kHz·128Ray</span>
          </button>
          <button class="pill-btn ${s.jsoundQuality === 'pro' ? 'active' : ''}" data-jsound="pro">
            <span>1.2 Pro</span>
            <span class="sub">96kHz·62Ray</span>
          </button>
          <button class="pill-btn ${s.jsoundQuality === 'lite' ? 'active' : ''}" data-jsound="lite">
            <span>1.2 Lite</span>
            <span class="sub">軽量合成</span>
          </button>
        </div>
        <div class="pill-grid cols-3" style="margin-top:5px">
          ${spatialOptions
            .map(
              (sp) => `
            <button class="pill-btn ${s.jsoundSpatialMode === sp.v ? 'active' : ''}" data-spatial="${sp.v}">
              <span>${sp.label}</span>
              <span class="sub">${sp.sub}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <button class="pill-btn full-pill ${s.jsoundAmbience ? 'active' : ''}" id="btn-jsound-ambience">
          <span>${s.jsoundAmbience ? '✓ 空間環境音 ON（11種・鹿威し/三味線/篠笛/風鈴）' : '空間環境音 OFF'}</span>
        </button>
        <div class="swatch-row-label">15和楽器 物理試聴デッキ（現舞台の128本立体残響）</div>
        <div class="audition-grid cols-3">
          ${AUDITION_INSTRUMENTS.map(
            (inst) => `
            <button class="audition-btn" data-audition="${inst.id}">${inst.label}</button>
          `
          ).join('')}
        </div>
        <div class="metric-grid" id="live-jsound-stats">
          <div class="metric-box"><div class="k">内部DSP / 立体反射</div><div class="v gold">${m ? `${m.jsoundDspRateKhz}kHz(${m.jsoundOversampling}×) · ${m.jsoundEarlyRays}Ray` : '—'}</div></div>
          <div class="metric-box"><div class="k">残響 RT60 / Peak</div><div class="v">${m ? `${m.jsoundRt60Sec.toFixed(2)}s · ${m.jsoundPeakDb <= -72 ? '待機' : `${m.jsoundPeakDb} dBFS`}` : '—'}</div></div>
          <div class="metric-box"><div class="k">衝突素材ペア</div><div class="v">${m ? m.jsoundMaterialPair : '—'}</div></div>
          <div class="metric-box"><div class="k">直近発音 (${m ? m.jsoundVoices : 0}ch)</div><div class="v">${m ? m.jsoundLastEventJp : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">JHand Kinesis 1.1</span><span class="section-meta">38-DOF · 18掌形</span></div>
        <div class="pill-grid cols-3">
          <button class="pill-btn ${s.jhandMode === 'biomech_ultra' ? 'active' : ''}" data-jhand="biomech_ultra">
            <span>極 38-DOF</span>
            <span class="sub">18掌形+ICR</span>
          </button>
          <button class="pill-btn ${s.jhandMode === 'biomech_pro' ? 'active' : ''}" data-jhand="biomech_pro">
            <span>27-DOF</span>
            <span class="sub">ORL+手掌</span>
          </button>
          <button class="pill-btn ${s.jhandMode === 'standard' ? 'active' : ''}" data-jhand="standard">
            <span>21-DOF</span>
            <span class="sub">標準バネ</span>
          </button>
        </div>
        <div class="metric-grid" id="live-jhand-stats">
          <div class="metric-box"><div class="k">自由度 / 掌形数</div><div class="v gold">${m ? `${m.jhandDof}DOF · ${m.jhandPoseCount}種` : '38DOF · 18種'}</div></div>
          <div class="metric-box"><div class="k">ICRカム / FDI筋</div><div class="v">${m ? `${m.jhandIcrGlideMm.toFixed(2)}mm · ${m.jhandFdiPct}%` : '—'}</div></div>
          <div class="metric-box"><div class="k">手掌アーチ / ORL</div><div class="v">${m ? `${m.jhandPalmCupDeg.toFixed(1)}° · ${Math.round(m.jhandOrlRatio * 100)}%` : '—'}</div></div>
          <div class="metric-box"><div class="k">協調相</div><div class="v">${m ? m.jhandSynergyJp : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">解像度 · FPS · KHDR · 影</span></div>
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
        <div class="pill-grid cols-3" style="margin-top:5px">
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
        <div class="pill-grid cols-2" style="margin-top:5px">
          <button class="pill-btn ${s.khdrEnabled ? 'active' : ''}" data-khdr="on"><span>KHDR ON</span></button>
          <button class="pill-btn ${!s.khdrEnabled ? 'active' : ''}" data-khdr="off"><span>KHDR OFF</span></button>
        </div>
        <button class="pill-btn full-pill ${s.khdrSplitCompare ? 'active' : ''}" id="btn-khdr-split">
          <span>${s.khdrSplitCompare ? '✓ KHDR A/B 分割比較中' : 'KHDR A/B 分割比較'}</span>
        </button>
        <div class="pill-grid cols-3" style="margin-top:5px">
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
        <div class="section-head"><span class="section-title">UIサイズ · 表示</span></div>
        <div class="pill-grid cols-2">
          <button class="pill-btn ${!s.compactUi ? 'active' : ''}" data-uicom="0"><span>標準小型</span></button>
          <button class="pill-btn ${s.compactUi ? 'active' : ''}" data-uicom="1"><span>極小ミニ</span></button>
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
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-gmode]').forEach((b) => {
      b.addEventListener('click', () => {
        this.gameMode = b.dataset.gmode as GameModeId;
        this.handlers.onChangeGameMode(this.gameMode);
        this.renderGraphicsDrawer();
      });
    });
    this.graphicsBodyEl.querySelector('#btn-drawer-reset')!.addEventListener('click', () => {
      this.closeMatchModal();
      this.handlers.onResetMatch();
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-start-pv]').forEach((b) => {
      b.addEventListener('click', () => {
        const mode = b.dataset.startPv as PVModeId;
        const rec = b.dataset.rec === '1';
        this.graphicsOpen = false;
        this.inspectorOpen = false;
        this.syncDrawers();
        this.handlers.onStartPV(mode, rec);
      });
    });
    this.graphicsBodyEl.querySelector('#btn-drawer-snap')!.addEventListener('click', () => {
      this.handlers.onCaptureSnapshot();
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeCameraStyle(b.dataset.cam as CameraStyleId));
    });
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
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-spatial]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeJSoundSpatialMode(b.dataset.spatial as JSoundSpatialMode));
    });
    this.graphicsBodyEl.querySelector('#btn-jsound-ambience')!.addEventListener('click', () => {
      this.handlers.onToggleJSoundAmbience(!this.currentSettings.jsoundAmbience);
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-audition]').forEach((b) => {
      b.addEventListener('click', () => {
        this.pulseEl(b, 'struck');
        this.handlers.onAuditionSound(b.dataset.audition as AuditionInstrumentId);
      });
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
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-uicom]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onToggleCompactUi(b.dataset.uicom === '1'));
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
