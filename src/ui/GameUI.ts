/**
 * ★ Ultra-Sleek, Compact Museum-Lacquer & Gold-Leaf UI Controller — JANKEN · 極 v1.3 ★
 *
 * Strictly ZERO NEON · Compact Ergonomics · Mobile Fullscreen · Built-In PV Cinema Studio:
 *  - Compact Single-Row Mobile Header + Native Fullscreen API & iOS Safari Immersive Fallback
 *  - Much Smaller Sculpted Urushi Hand Cards (94×76 desktop / 72×58 mobile / 64×50 landscape)
 *  - Slim Tactical Strip: Spirit Gauge (気迫) + Overdrive (極一撃 2pt) + Feint (牽制) + Blitz Timer
 *  - Cinema 2.35:1 Letterbox + PV Mode Overlay (Official 26s / Battle 16s / Craft 18s + WebM Export + PNG)
 *  - Left Studio Drawer: FINGER S1.0 Hyper-Real Hand Mode · Game Modes · PV Studio
 *    · Camera Director 2.1 (C² Silky) · JSound Engin 1.3 (384kHz 8×OS · 24-Inst Deck · 230-Ray)
 *    · JHand Kinesis 1.1 (38-DOF · 36-Pose Showcase Gallery) · KHDR · Shadow Flame 1.0
 *  - Right Drawer: JNV1.0 36-Expert Cognitive Inspector & SHA-256 Pre-Commit Proof
 */

import { AuditionInstrumentId } from '../audio/SoundEngine';
import { HAND_POSE_CATALOG, HandPoseKey } from '../engine/jhand/types';
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
  PhotoProofVerificationResult,
  verify5KPhotoProofPng,
} from '../engine/proof/PhotoProofEngine';
import { PsychoNetTelemetry } from '../engine/psycho/PsychoNetEngine';
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
import { Photo5KResult } from '../graphics/PhotoCapture5K';
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
  onCapture5KPhoto: (onProgress?: (pct: number, statusJp: string) => void) => Promise<Photo5KResult | null>;
  onToggleCompactUi: (compact: boolean) => void;
  onChangeResolution: (res: ResolutionPresetId) => void;
  onChangeFpsLimit: (fps: FpsLimitMode) => void;
  onToggleKHDR: (enabled: boolean) => void;
  onToggleKHDRSplit: (enabled: boolean) => void;
  onChangeKHDRSplitX: (normX: number) => void;
  onChangeShadowFlame: (mode: ShadowFlameMode) => void;
  onToggleFingerS1: (enabled: boolean) => void;
  onPreviewPose: (pose: HandPoseKey) => void;
  onChangeStage: (stage: StageId) => void;
  onChangeHandMaterials: (playerMat: HandMaterialPreset, npcMat: HandMaterialPreset) => void;
  onChangeJHandMode: (mode: JHandModeSetting) => void;
  onChangeJSoundQuality: (quality: JSoundModeSetting) => void;
  onChangeJSoundSpatialMode: (spatial: JSoundSpatialMode) => void;
  onToggleJSoundAmbience: (enabled: boolean) => void;
  onToggleJSoundSympathetic: (enabled: boolean) => void;
  onAuditionSound: (instrument: AuditionInstrumentId) => void;
  onToggleBioPulse: (enabled: boolean) => void;
  onToggleAeroVortex: (enabled: boolean) => void;
  onToggleAcousticProbe: (enabled: boolean) => void;
  onChangePersona: (persona: JNVPersonaId) => void;
  onToggleSound: () => boolean;
}

const AUDITION_INSTRUMENTS: Array<{ id: AuditionInstrumentId; label: string }> = [
  { id: 'taiko', label: '大太鼓' },
  { id: 'shime_daiko', label: '締太鼓' },
  { id: 'daibyoshi', label: '大拍子' },
  { id: 'tsuridaiko', label: '釣太鼓' },
  { id: 'otsuzumi', label: '大鼓' },
  { id: 'kotsuzumi', label: '小鼓' },
  { id: 'kakko', label: '鞨鼓' },
  { id: 'koto', label: '十三絃箏' },
  { id: 'taisho_koto', label: '大正琴' },
  { id: 'wagon', label: '和琴六絃' },
  { id: 'shamisen', label: '三味線' },
  { id: 'sanshin', label: '三線' },
  { id: 'biwa', label: '薩摩琵琶' },
  { id: 'ichigenkin', label: '一絃琴' },
  { id: 'kokyu', label: '胡弓' },
  { id: 'shakuhachi', label: '尺八' },
  { id: 'shinobue', label: '篠笛' },
  { id: 'ryuteki', label: '龍笛' },
  { id: 'nokan', label: '能管' },
  { id: 'komabue', label: '高麗笛' },
  { id: 'kagurabue', label: '神楽笛' },
  { id: 'hichiriki', label: '篳篥' },
  { id: 'sho', label: '雅楽笙' },
  { id: 'horagai', label: '法螺貝' },
  { id: 'rin_bell', label: 'おりん' },
  { id: 'bonsho', label: '梵鐘' },
  { id: 'kane_chime', label: '銅鐸風鐸' },
  { id: 'dora', label: '銅鑼' },
  { id: 'atarigane', label: '祭摺鉦' },
  { id: 'shakujo', label: '錫杖' },
  { id: 'mokugyo', label: '楠木魚' },
  { id: 'hyoshigi', label: '拍子木' },
  { id: 'binzasara', label: '編木' },
  { id: 'furin', label: '江戸風鈴' },
  { id: 'nanbu_furin', label: '南部風鈴' },
  { id: 'edo_kiriko_chime', label: '江戸切子' },
  { id: 'orugoru', label: 'オルゴール' },
  { id: 'sensu', label: '舞扇' },
  { id: 'yumi_bow', label: '弓道和弓' },
  { id: 'suikinkutsu', label: '水琴窟' },
];

const HAND_MATERIAL_OPTIONS: Array<{ id: HandMaterialPreset; label: string; swatch: string; hero?: boolean }> = [
  { id: 'living_skin', label: '極写実肌 (FINGER S1.0)', swatch: 'linear-gradient(135deg, #f2ccb0 0%, #c99272 100%)', hero: true },
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
  photo5k: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
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
  private isCapturing5K = false;
  private photoToastTimer = 0;
  private lastPhoto5K: Photo5KResult | null = null;
  private photoVerifyResult: PhotoProofVerificationResult | null = null;
  private lastPsychoTelemetry: PsychoNetTelemetry | null = null;
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
  private photo5kNavBtn!: HTMLButtonElement;
  private pvNavBtn!: HTMLButtonElement;
  private cameraNavBtn!: HTMLButtonElement;
  private graphicsNavBtn!: HTMLButtonElement;
  private inspectorNavBtn!: HTMLButtonElement;
  private soundNavBtn!: HTMLButtonElement;
  private fsNavBtn!: HTMLButtonElement;
  private shutterFlashEl!: HTMLElement;
  private photoToastEl!: HTMLElement;

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
      <!-- Subtle Ivory Mechanical Shutter Flash & Non-Intrusive 5K Photo Status Toast -->
      <div class="shutter-flash" id="shutter-flash" aria-hidden="true"></div>
      <div class="photo-toast" id="photo-toast" aria-live="polite"></div>

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

      <!-- KHDR 1.1 vs Standard SDR Live A/B Split Overlay -->
      <div class="khdr-split-overlay" id="khdr-split-overlay">
        <div class="khdr-split-label left">標準 SDR</div>
        <div class="khdr-split-label right">KHDR 1.1 ON</div>
        <div class="khdr-split-handle" id="khdr-split-handle" title="ドラッグしてKHDR 1.1比較位置を移動">
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
          <button class="icon-medallion photo-accent" id="btn-photo-5k" data-tip="現視点 5K KHDR1.1 PNG保存 (K)" aria-label="5K KHDR1.1撮影">
            ${NAV_ICONS.photo5k}
          </button>
          <button class="icon-medallion" id="btn-pv" data-tip="PVシネマ再生・録画 (P)" aria-label="PVシネマ">
            ${NAV_ICONS.pv}
          </button>
          <button class="icon-medallion desktop-only" id="btn-camera" data-tip="カメラ切替 (C)" aria-label="カメラ視点切替">
            ${NAV_ICONS.camera}
          </button>
          <button class="icon-medallion" id="btn-graphics" data-tip="5K撮影・JSound 1.5 (3OA/FDTD)・革新技術 (G)" aria-label="スタジオ設定">
            ${NAV_ICONS.graphics}
          </button>
          <button class="icon-medallion" id="btn-inspector" data-tip="JNV1.0 / Psycho-Net 解析 (J)" aria-label="JNV1.0解析">
            ${NAV_ICONS.inspector}
            <span class="medallion-seal-dot"></span>
          </button>
          <button class="icon-medallion" id="btn-sound" data-tip="JSound 1.5 3OA/4D ON/OFF" aria-label="音響切替">
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

      <!-- Left Slide-Out Drawer: 5K KHDR 1.1 · JSound 1.5 (3OA/FDTD/Worklet) · KIWAMI-NEXT · FINGER S1.0 -->
      <aside class="drawer left" id="drawer-graphics" aria-label="スタジオ設定">
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>映像 · 3OA音響 · 革新技術</h2>
            <span class="drawer-badge">v1.5 極</span>
          </div>
          <button class="drawer-close" id="close-graphics" aria-label="閉じる">✕</button>
        </div>
        <div class="drawer-body" id="graphics-body"></div>
      </aside>

      <!-- Right Slide-Out Drawer: JNV1.0 + J-PSYCHO-NET 1.0 Cognitive Inspector -->
      <aside class="drawer right" id="drawer-inspector" aria-label="JNV1.0解析">
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>JNV1.0 · 読心解析</h2>
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

    this.shutterFlashEl = this.root.querySelector('#shutter-flash')!;
    this.photoToastEl = this.root.querySelector('#photo-toast')!;
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
    this.photo5kNavBtn = this.root.querySelector('#btn-photo-5k')!;
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
    this.photo5kNavBtn.addEventListener('click', () => {
      void this.trigger5KPhotoCapture();
    });

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

  private showPhotoToast(msg: string, sticky = false): void {
    window.clearTimeout(this.photoToastTimer);
    this.photoToastEl.textContent = msg;
    this.photoToastEl.classList.add('visible');
    if (!sticky) {
      this.photoToastTimer = window.setTimeout(() => {
        this.photoToastEl.classList.remove('visible');
      }, 4200);
    }
  }

  public async trigger5KPhotoCapture(): Promise<Photo5KResult | null> {
    if (this.isCapturing5K) return null;
    this.isCapturing5K = true;
    this.photo5kNavBtn.classList.add('active');

    // Subtle warm ivory mechanical shutter blink (zero neon!)
    this.shutterFlashEl.classList.remove('flash');
    void this.shutterFlashEl.offsetWidth;
    this.shutterFlashEl.classList.add('flash');

    this.showPhotoToast('5K KHDR 1.1 (48-bit) 撮影開始...', true);
    this.renderGraphicsDrawer();

    try {
      const res = await this.handlers.onCapture5KPhoto((pct, statusJp) => {
        this.showPhotoToast(`${statusJp} (${pct}%)`, pct < 100);
      });
      if (res) {
        if (this.lastPhoto5K?.downloadUrl && this.lastPhoto5K.downloadUrl !== res.downloadUrl) {
          URL.revokeObjectURL(this.lastPhoto5K.downloadUrl);
        }
        this.lastPhoto5K = res;
        const mb = (res.byteLength / (1024 * 1024)).toFixed(1);
        this.showPhotoToast(
          `✓ ${res.width}×${res.height} · 48bit KHDR1.1 (${mb} MB) · JNV暗号証明刻印完了`
        );
      } else {
        this.showPhotoToast('5K撮影をキャンセルしました');
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showPhotoToast(`5K撮影エラー: ${msg}`);
      return null;
    } finally {
      this.isCapturing5K = false;
      this.photo5kNavBtn.classList.remove('active');
      this.renderGraphicsDrawer();
    }
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
      } else if (k === 'k') {
        void this.trigger5KPhotoCapture();
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

  private formatSpatialTag(mode: JSoundSpatialMode): string {
    if (mode === '4d_audio_x') return '4D X·3OA';
    if (mode === '4d_audio_max') return '4D MAX';
    if (mode === '4d_audio') return '4D音場';
    if (mode === 'binaural_3d') return '立体3D';
    if (mode === 'studio_wide') return '広域';
    return '集中';
  }

  public updatePsychoTelemetry(psycho: PsychoNetTelemetry): void {
    this.lastPsychoTelemetry = psycho;
    const el = this.graphicsBodyEl.querySelector('#live-psycho-chip');
    if (el) {
      el.textContent = `H=${psycho.shannonEntropyBits.toFixed(2)}bit · ${psycho.playerTendencyJp}`;
    }
    if (this.inspectorOpen) {
      this.renderInspectorDrawer();
    }
  }

  public updateRenderMetrics(m: RenderMetrics): void {
    this.lastMetrics = m;
    const sfShort = SHADOW_FLAME_SPECS[m.shadowFlameMode].shortLabel;
    const camShort = CAMERA_STYLE_SPECS[m.cameraStyle].shortJp;
    const spTag = this.formatSpatialTag(m.jsoundSpatialMode);

    if (this.showHudTelemetry) {
      this.microTelemetryEl.style.display = 'inline-flex';
      this.microTelemetryEl.innerHTML = `
        <span><strong>${m.fps}</strong> FPS</span>
        <span class="sep">·</span>
        <span>${this.currentSettings.resolution.toUpperCase()}</span>
        <span class="sep">·</span>
        <span class="accent">${m.khdrActive ? 'KHDR 1.1' : 'SDR'}</span>
        <span class="sep">·</span>
        <span class="accent">${sfShort}</span>
        <span class="sep">·</span>
        <span class="accent">${spTag}</span>
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
      const lufsStr = m.jsoundLufsMomentary <= -68 ? '待機' : `${m.jsoundLufsMomentary} LUFS`;
      const tpStr = m.jsoundTruePeakDbTp <= -68 ? '—' : `${m.jsoundTruePeakDbTp}dBTP`;
      const wkTag = m.jsoundWorkletActive ? 'Worklet' : 'DSP';
      jsoundEl.innerHTML = `
        <div class="metric-box"><div class="k">3OA空間 / 内部DSP</div><div class="v gold">${spTag} · ${m.jsoundDspRateKhz}kHz(${m.jsoundOversampling}×)</div></div>
        <div class="metric-box"><div class="k">3OA音線 / 2D-FDTD</div><div class="v">${m.jsoundEarlyRays}Ray · ${m.jsoundFdtdNodes}節点 · ${m.jsoundRt60Sec.toFixed(2)}s</div></div>
        <div class="metric-box"><div class="k">ITU-R計測 (${wkTag})</div><div class="v">${lufsStr} · ${tpStr} · ρ${m.jsoundPhaseCorr.toFixed(2)}</div></div>
        <div class="metric-box"><div class="k">発音 (${m.jsoundVoices}ch · D/R ${m.probeDrDb >= 0 ? '+' : ''}${m.probeDrDb.toFixed(1)}dB)</div><div class="v">${m.jsoundLastEventJp}</div></div>
      `;
    }

    const nextEl = this.graphicsBodyEl.querySelector('#live-nexttech-stats');
    if (nextEl) {
      nextEl.innerHTML = `
        <div class="metric-box"><div class="k">J-BioPulse 心拍/白化</div><div class="v gold">${m.bioPulseBpm} BPM · 白化${m.bioCapillaryBlanchPct}%</div></div>
        <div class="metric-box"><div class="k">生体状態</div><div class="v">${m.bioStateJp}</div></div>
        <div class="metric-box"><div class="k">AeroVortex 3D渦輪</div><div class="v">${m.aeroActiveVortices}渦 · Γ=${m.aeroPeakCirculation.toFixed(2)} (${m.aeroPeakSpeedMs.toFixed(1)}m/s)</div></div>
        <div class="metric-box"><div class="k">Acoustic Probe (${m.probeDistanceM.toFixed(2)}m)</div><div class="v">LPF ${m.probeAirCutoffKhz}kHz · ${m.probeNearestJp}近接</div></div>
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
  // LEFT DRAWER: STUDIO v1.4 (5K KHDR 1.1 · JSOUND 1.4 4D MAX · KIWAMI-NEXT · FINGER S1.0 · JHAND)
  // ===========================================================================
  private renderGraphicsDrawer(): void {
    const prevScroll = this.graphicsBodyEl.scrollTop;
    const s = this.currentSettings;
    const m = this.lastMetrics;
    const p5k = this.lastPhoto5K;
    const pv = this.photoVerifyResult;
    const psycho = this.lastPsychoTelemetry;

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
    const spatial3DOptions: Array<{ v: JSoundSpatialMode; label: string; sub: string }> = [
      { v: 'binaural_3d', label: '立体3D', sub: 'HRTF+ITD' },
      { v: 'studio_wide', label: '広域音場', sub: 'M/S拡張' },
      { v: 'focused', label: '集中定位', sub: '明瞭定位' },
    ];

    const verifyResultHtml = pv
      ? `<div class="proof-verify-card ${pv.valid ? 'valid' : 'invalid'}">
           <div class="pv-status">${pv.reasonJp}</div>
           ${
             pv.record
               ? `<div class="pv-meta">
                    ${pv.width}×${pv.height} · ${pv.bitDepth * 3}bit (${pv.bitDepth}bit/ch) · ${pv.record.khdrVersion}<br/>
                    舞台: ${pv.record.stageNameJp} · BPM ${pv.record.bioPulseBpm} · D/R ${pv.record.acousticProbeDrDb}dB<br/>
                    視点: (${pv.record.cameraPos.join(', ')}) FOV ${pv.record.cameraFovDeg}°<br/>
                    JNV-SEAL: <code>${pv.record.sealSha256.slice(0, 22)}…</code>
                  </div>`
               : ''
           }
         </div>`
      : '';

    this.graphicsBodyEl.innerHTML = `
      <section class="panel-section hero-section">
        <div class="section-head">
          <span class="section-title">5K KHDR 1.1 現視点撮影</span>
          <span class="section-meta">5120×2880 · 48bit PNG</span>
        </div>
        <button class="pill-btn full-pill active hero-photo-btn" id="btn-drawer-photo-5k" ${this.isCapturing5K ? 'disabled' : ''}>
          <span>${this.isCapturing5K ? '撮影中… KHDR 1.1 5K タイル生成中' : '◎ 現カメラアングルで 5K 48bit PNG 保存 (K)'}</span>
        </button>
        <div class="finger-s1-caption">
          32bit浮動小数KHDR 1.1スペクトル描画 → True 48-bit (16bit/ch) 高ビットレート無劣化PNG（自由視点・マクロ対応／UI非表示／JNV-PROOF暗号証明自動刻印）
        </div>
        ${
          p5k
            ? `<div class="proof-last-chip">
                 直近保存: ${p5k.width}×${p5k.height} · ${(p5k.byteLength / (1024 * 1024)).toFixed(1)}MB (${p5k.captureMs}ms)
                 ${p5k.proof ? ` · SEAL <code>${p5k.proof.sealSha256.slice(0, 12)}…</code>` : ''}
                 ${p5k.downloadUrl ? ` · <a href="${p5k.downloadUrl}" download="${p5k.filename}" style="color:var(--gold-hi);text-decoration:underline">↓ PNG再保存</a>` : ''}
               </div>`
            : ''
        }
        <label class="pill-btn full-pill verify-upload-btn" for="input-verify-5k-png">
          <span>✓ JNV-PROOF 5K PNG 改ざん検証</span>
        </label>
        <input type="file" id="input-verify-5k-png" accept="image/png" style="display:none" />
        ${verifyResultHtml}
      </section>

      <section class="panel-section">
        <div class="section-head">
          <span class="section-title">JSound Engin 1.5 · 3OA/4D</span>
          <span class="section-meta">${this.formatSpatialTag(s.jsoundSpatialMode)} · ${s.jsoundQuality === 'ultra' ? '768kHz·520Ray' : s.jsoundQuality === 'pro' ? '192kHz·230Ray' : '96kHz·高速'}</span>
        </div>
        <div class="pill-grid cols-3">
          <button class="pill-btn ${s.jsoundSpatialMode === '4d_audio_x' ? 'active' : ''}" data-spatial="4d_audio_x">
            <span>★ 4D X(3OA)</span>
            <span class="sub">16ch 3OA+FDN</span>
          </button>
          <button class="pill-btn ${s.jsoundSpatialMode === '4d_audio_max' ? 'active' : ''}" data-spatial="4d_audio_max">
            <span>4D MAX</span>
            <span class="sub">球面+頭上+重低</span>
          </button>
          <button class="pill-btn ${s.jsoundSpatialMode === '4d_audio' ? 'active' : ''}" data-spatial="4d_audio">
            <span>4D Audio</span>
            <span class="sub">4D気流+音場</span>
          </button>
        </div>
        <div class="pill-grid cols-3" style="margin-top:5px">
          ${spatial3DOptions
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
        <div class="pill-grid cols-3" style="margin-top:5px">
          <button class="pill-btn ${s.jsoundQuality === 'ultra' ? 'active' : ''}" data-jsound="ultra">
            <span>1.5 Ultra</span>
            <span class="sub">768kHz·520Ray</span>
          </button>
          <button class="pill-btn ${s.jsoundQuality === 'pro' ? 'active' : ''}" data-jsound="pro">
            <span>1.5 Pro</span>
            <span class="sub">192kHz·230Ray</span>
          </button>
          <button class="pill-btn ${s.jsoundQuality === 'lite' ? 'active' : ''}" data-jsound="lite">
            <span>1.5 Lite</span>
            <span class="sub">96kHz·高速</span>
          </button>
        </div>
        <div class="pill-grid cols-2" style="margin-top:5px">
          <button class="pill-btn ${s.jsoundAmbience ? 'active' : ''}" id="btn-jsound-ambience">
            <span>${s.jsoundAmbience ? '✓ 24種 3OA環境音 ON' : '3OA環境音 OFF'}</span>
            <span class="sub">南部風鈴/神楽笛/水琴窟</span>
          </button>
          <button class="pill-btn ${s.jsoundSympathetic ? 'active' : ''}" id="btn-jsound-sympathetic">
            <span>${s.jsoundSympathetic ? '✓ 13弦共鳴・8ch FDN' : '共鳴弦・FDN OFF'}</span>
            <span class="sub">AudioWorklet物理共鳴</span>
          </button>
        </div>
        <div class="swatch-row-label">40和楽器 3OA/2D-FDTD 試聴デッキ（768kHz 63-Tap -134dB · 70素材 · 520音線）</div>
        <div class="audition-grid cols-4">
          ${AUDITION_INSTRUMENTS.map(
            (inst) => `
            <button class="audition-btn" data-audition="${inst.id}">${inst.label}</button>
          `
          ).join('')}
        </div>
        <div class="metric-grid" id="live-jsound-stats">
          <div class="metric-box"><div class="k">3OA空間 / 内部DSP</div><div class="v gold">${m ? `${this.formatSpatialTag(m.jsoundSpatialMode)} · ${m.jsoundDspRateKhz}kHz(${m.jsoundOversampling}×)` : '4D X·3OA · 768kHz(16×)'}</div></div>
          <div class="metric-box"><div class="k">3OA音線 / 2D-FDTD</div><div class="v">${m ? `${m.jsoundEarlyRays}Ray · ${m.jsoundFdtdNodes}節点 · ${m.jsoundRt60Sec.toFixed(2)}s` : '524Ray · 256節点 · 0.46s'}</div></div>
          <div class="metric-box"><div class="k">ITU-R計測 (Worklet)</div><div class="v">${m && m.jsoundLufsMomentary > -68 ? `${m.jsoundLufsMomentary} LUFS · ρ${m.jsoundPhaseCorr.toFixed(2)}` : '待機 · 4×OS TruePeak'}</div></div>
          <div class="metric-box"><div class="k">発音 (${m ? m.jsoundVoices : 0}ch)</div><div class="v">${m ? m.jsoundLastEventJp : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head">
          <span class="section-title">KIWAMI-NEXT 5大革新技術</span>
          <span class="section-meta">世界初級独自実装</span>
        </div>
        <div class="pill-grid cols-3">
          <button class="pill-btn ${s.bioPulseEnabled ? 'active' : ''}" id="btn-toggle-biopulse">
            <span>BioPulse</span>
            <span class="sub">心拍脈波+白化</span>
          </button>
          <button class="pill-btn ${s.aeroVortexEnabled ? 'active' : ''}" id="btn-toggle-aerovortex">
            <span>AeroVortex</span>
            <span class="sub">3D渦輪流体</span>
          </button>
          <button class="pill-btn ${s.acousticProbeEnabled ? 'active' : ''}" id="btn-toggle-acousticprobe">
            <span>AcousticProbe</span>
            <span class="sub">12音線連動</span>
          </button>
        </div>
        <div class="finger-s1-caption" id="live-psycho-chip">
          ${psycho ? `J-PsychoNet: H=${psycho.shannonEntropyBits.toFixed(2)}bit · ${psycho.playerTendencyJp}` : 'J-PsychoNet 1.0: シャノン情報エントロピー & VLMC先読解析 待機中'}
        </div>
        <div class="metric-grid" id="live-nexttech-stats">
          <div class="metric-box"><div class="k">J-BioPulse 心拍/白化</div><div class="v gold">${m ? `${m.bioPulseBpm} BPM · 白化${m.bioCapillaryBlanchPct}%` : '68 BPM · 白化8%'}</div></div>
          <div class="metric-box"><div class="k">生体状態</div><div class="v">${m ? m.bioStateJp : '明鏡止水'}</div></div>
          <div class="metric-box"><div class="k">AeroVortex 3D渦輪</div><div class="v">${m ? `${m.aeroActiveVortices}渦 · Γ=${m.aeroPeakCirculation.toFixed(2)}` : '0渦 · 層流静穏'}</div></div>
          <div class="metric-box"><div class="k">Acoustic Probe</div><div class="v">${m ? `${m.probeDistanceM.toFixed(2)}m · LPF ${m.probeAirCutoffKhz}kHz` : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">FINGER S1.0 極写実ハンド</span><span class="section-meta">${s.fingerS1Enabled ? 'ON · 彫刻関節+SSS' : 'OFF · 従来造形'}</span></div>
        <div class="pill-grid cols-2">
          <button class="pill-btn ${s.fingerS1Enabled ? 'active' : ''}" data-fingers1="on">
            <span>FINGER S1.0 ON</span>
            <span class="sub">極写実彫刻+動的皺</span>
          </button>
          <button class="pill-btn ${!s.fingerS1Enabled ? 'active' : ''}" data-fingers1="off">
            <span>標準造形 OFF</span>
            <span class="sub">クラシック互換</span>
          </button>
        </div>
        <div class="finger-s1-caption">
          32×24 非対称解剖指節 · 3層動的関節皺 · 二重曲率爪半月 · J-BioPulse脈波&amp;毛細血管白化連動 · GLSL皮下散乱SSS
        </div>
        <button class="pill-btn full-pill ${s.cameraStyle === 'macro_artisan' ? 'active' : ''}" id="btn-s1-macro">
          <span>◎ 匠マクロカメラで指先・関節を極近接鑑賞</span>
        </button>
      </section>

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
            <span class="sub">映像+4D音響</span>
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
        <button class="pill-btn full-pill" id="btn-drawer-snap"><span>高速シネマ保存 (1920×1080 PNG)</span></button>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">Camera Director 2.1 (C²滑らか追従)</span><span class="section-meta">${CAMERA_STYLE_SPECS[s.cameraStyle].labelJp}</span></div>
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
        <div class="section-head"><span class="section-title">JHand Kinesis 1.1</span><span class="section-meta">38-DOF · 36掌形 · C²補間</span></div>
        <div class="pill-grid cols-3">
          <button class="pill-btn ${s.jhandMode === 'biomech_ultra' ? 'active' : ''}" data-jhand="biomech_ultra">
            <span>極 38-DOF</span>
            <span class="sub">36掌形+6×補間</span>
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
        <div class="swatch-row-label">36掌形モーション試演デッキ（クリックで即座に実演）</div>
        <div class="pose-gallery-grid">
          ${HAND_POSE_CATALOG.map(
            (pose, idx) => `
            <button class="pose-chip-btn" data-pose-idx="${idx}" title="${pose.labelJp}">${pose.labelJp}</button>
          `
          ).join('')}
        </div>
        <div class="metric-grid" id="live-jhand-stats">
          <div class="metric-box"><div class="k">自由度 / 掌形数</div><div class="v gold">${m ? `${m.jhandDof}DOF · ${m.jhandPoseCount}種` : '38DOF · 36種'}</div></div>
          <div class="metric-box"><div class="k">ICRカム / FDI筋</div><div class="v">${m ? `${m.jhandIcrGlideMm.toFixed(2)}mm · ${m.jhandFdiPct}%` : '—'}</div></div>
          <div class="metric-box"><div class="k">手掌アーチ / ORL</div><div class="v">${m ? `${m.jhandPalmCupDeg.toFixed(1)}° · ${Math.round(m.jhandOrlRatio * 100)}%` : '—'}</div></div>
          <div class="metric-box"><div class="k">協調相</div><div class="v">${m ? m.jhandSynergyJp : '—'}</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-head"><span class="section-title">解像度 · FPS · KHDR 1.1 · 影</span></div>
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
          <button class="pill-btn ${s.khdrEnabled ? 'active' : ''}" data-khdr="on"><span>KHDR 1.1 ON</span></button>
          <button class="pill-btn ${!s.khdrEnabled ? 'active' : ''}" data-khdr="off"><span>KHDR 1.1 OFF</span></button>
        </div>
        <button class="pill-btn full-pill ${s.khdrSplitCompare ? 'active' : ''}" id="btn-khdr-split">
          <span>${s.khdrSplitCompare ? '✓ KHDR 1.1 A/B 分割比較中' : 'KHDR 1.1 A/B 分割比較'}</span>
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
        <div class="section-head"><span class="section-title">手の造形・工芸素材</span><span class="section-meta">5素材</span></div>
        <div class="swatch-row-label">あなた</div>
        <div class="swatch-grid">
          ${HAND_MATERIAL_OPTIONS.map(
            (opt) => `
            <button class="swatch-btn ${opt.hero ? 'hero-swatch' : ''} ${s.playerHandMaterial === opt.id ? 'active' : ''}" data-pmat="${opt.id}">
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
            <button class="swatch-btn ${opt.hero ? 'hero-swatch' : ''} ${s.npcHandMaterial === opt.id ? 'active' : ''}" data-nmat="${opt.id}">
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

    // Bind 5K Photo Capture & JNV-PROOF Verifier
    this.graphicsBodyEl.querySelector('#btn-drawer-photo-5k')!.addEventListener('click', () => {
      void this.trigger5KPhotoCapture();
    });
    const verifyInput = this.graphicsBodyEl.querySelector<HTMLInputElement>('#input-verify-5k-png');
    if (verifyInput) {
      verifyInput.addEventListener('change', async () => {
        const file = verifyInput.files?.[0];
        if (!file) return;
        this.showPhotoToast('JNV-PROOF SHA-256 全ピクセル検証中...', true);
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          this.photoVerifyResult = await verify5KPhotoProofPng(bytes);
          this.showPhotoToast(this.photoVerifyResult.reasonJp);
        } catch {
          this.photoVerifyResult = null;
          this.showPhotoToast('PNGの読み込みに失敗しました');
        }
        this.renderGraphicsDrawer();
      });
    }

    // Bind Project KIWAMI-NEXT toggles
    this.graphicsBodyEl.querySelector('#btn-toggle-biopulse')!.addEventListener('click', () => {
      this.handlers.onToggleBioPulse(!this.currentSettings.bioPulseEnabled);
    });
    this.graphicsBodyEl.querySelector('#btn-toggle-aerovortex')!.addEventListener('click', () => {
      this.handlers.onToggleAeroVortex(!this.currentSettings.aeroVortexEnabled);
    });
    this.graphicsBodyEl.querySelector('#btn-toggle-acousticprobe')!.addEventListener('click', () => {
      this.handlers.onToggleAcousticProbe(!this.currentSettings.acousticProbeEnabled);
    });

    // Bind listeners
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-fingers1]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onToggleFingerS1(b.dataset.fingers1 === 'on'));
    });
    this.graphicsBodyEl.querySelector('#btn-s1-macro')!.addEventListener('click', () => {
      this.handlers.onChangeCameraStyle('macro_artisan');
    });
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
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-pose-idx]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.poseIdx);
        const item = HAND_POSE_CATALOG[idx];
        if (!item) return;
        this.pulseEl(b, 'struck');
        this.handlers.onPreviewPose(item.key);
      });
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
    this.graphicsBodyEl.querySelector('#btn-jsound-sympathetic')!.addEventListener('click', () => {
      this.handlers.onToggleJSoundSympathetic(!this.currentSettings.jsoundSympathetic);
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
  // RIGHT DRAWER: JNV1.0 + J-PSYCHO-NET 1.0 COGNITIVE CORE INSPECTOR
  // ===========================================================================
  private renderInspectorDrawer(): void {
    const t = this.lastTelemetry;
    const seal = this.currentSeal;
    const psycho = this.lastPsychoTelemetry;

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

    const psychoHtml = psycho
      ? `
      <section class="panel-section">
        <div class="section-head">
          <span class="section-title">J-PSYCHO-NET 1.0 情報理論解析</span>
          <span class="section-meta">${psycho.dominantExpertJp}</span>
        </div>
        <div class="jnv-verdict-chip">${psycho.playerTendencyJp}</div>
        <div class="metric-grid" style="margin-top:6px">
          <div class="metric-box"><div class="k">シャノン情報量 H(X)</div><div class="v gold">${psycho.shannonEntropyBits.toFixed(3)} bit</div></div>
          <div class="metric-box"><div class="k">KLダイバージェンス</div><div class="v">${psycho.klDivergenceBits.toFixed(3)} bit</div></div>
          <div class="metric-box"><div class="k">読破予測度</div><div class="v">${psycho.predictabilityPct}%</div></div>
          <div class="metric-box"><div class="k">解析局数</div><div class="v">${psycho.roundsAnalyzed}局</div></div>
        </div>
      </section>
    `
      : '';

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

      ${psychoHtml}
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
