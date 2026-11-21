/**
 * ★ JANKEN · 極 v1.6 — Mobile-First Lacquer & Gold-Leaf UI Controller ★
 *
 * Designed thumb-first for smartphones, still elegant on desktop (strictly zero neon):
 *  - Phone header = ≡ menu · readable score crest (あなた / 相手) · sound · ? guide (44 px targets)
 *  - Full-width グー / チョキ / パー buttons with "what it beats" hints, keyboard 1/2/3 on desktop
 *  - 極一撃 button doubles as the spirit gauge; 牽制 explains itself; one live status line says what
 *    to do next (選んでください / 極一撃 装填中 / 読み：相手は〇〇を出さない / 3.5秒以内に！)
 *  - Settings live in a tabbed studio (かんたん · 対局 · 音 · 手・顕微鏡 · 映像 · 撮影 · 計測):
 *    a side drawer on desktop, a swipe-down bottom sheet on phones
 *  - かんたん tab: one-tap quality presets and the JSound 1.6 playback device (イヤホン / スマホ本体 /
 *    スピーカー) with plain-language explanations
 *  - First-run 遊び方 guide (re-openable from ?), vertical zoom HUD with the FINGER S1.1 detail tier
 *  - PV cinema overlay, 5K photo + JNV-PROOF verifier, KHDR A/B split, JNV1.0 inspector (unchanged features)
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
  JSoundDeviceProfileSetting,
  JSoundModeSetting,
  JSoundSpatialMode,
  MicroscopeFocusPreset,
  PVModeId,
  QUALITY_PRESETS,
  QualityPresetId,
  RESOLUTION_LIST,
  RenderMetrics,
  ResolutionPresetId,
  SHADOW_FLAME_SPECS,
  ShadowFlameMode,
  StageId,
  detectQualityPreset,
} from '../graphics/GraphicsConfig';
import { Photo5KResult } from '../graphics/PhotoCapture5K';
import type { DeviceDecision } from '../engine/mobile/KiwamiMobileCore';
import { hapticsSupported, vibrate } from '../engine/mobile/HapticSync';
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
  onZoomSteps: (steps: number) => void;
  onFocusMicroscope: (preset: MicroscopeFocusPreset) => void;
  onResetZoom: () => void;
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
  onToggleFingerS11: (enabled: boolean) => void;
  onToggleDermaTensor: (enabled: boolean) => void;
  onToggleChromaDerm: (enabled: boolean) => void;
  onPreviewPose: (pose: HandPoseKey) => void;
  onChangeStage: (stage: StageId) => void;
  onChangeHandMaterials: (playerMat: HandMaterialPreset, npcMat: HandMaterialPreset) => void;
  onChangeJHandMode: (mode: JHandModeSetting) => void;
  onChangeJSoundQuality: (quality: JSoundModeSetting) => void;
  onChangeJSoundSpatialMode: (spatial: JSoundSpatialMode) => void;
  onChangeJSoundDeviceProfile: (profile: JSoundDeviceProfileSetting) => void;
  onToggleJSoundAmbience: (enabled: boolean) => void;
  onToggleJSoundSympathetic: (enabled: boolean) => void;
  onAuditionSound: (instrument: AuditionInstrumentId) => void;
  onApplyQualityPreset: (preset: QualityPresetId | 'device') => void;
  onToggleHaptics: (enabled: boolean) => void;
  onToggleAdaptivePerformance: (enabled: boolean) => void;
  onToggleBioPulse: (enabled: boolean) => void;
  onToggleAeroVortex: (enabled: boolean) => void;
  onToggleAcousticProbe: (enabled: boolean) => void;
  onChangePersona: (persona: JNVPersonaId) => void;
  onToggleSound: () => boolean;
}

type StudioTab = 'quick' | 'match' | 'sound' | 'hands' | 'visual' | 'capture' | 'stats';

const STUDIO_TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'quick', label: 'かんたん' },
  { id: 'match', label: '対局' },
  { id: 'sound', label: '音' },
  { id: 'hands', label: '手・顕微鏡' },
  { id: 'visual', label: '映像' },
  { id: 'capture', label: '撮影' },
  { id: 'stats', label: '計測' },
];

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
  { id: 'living_skin', label: '極写実肌 (FINGER S1.1)', swatch: 'linear-gradient(135deg, #f2ccb0 0%, #c99272 100%)', hero: true },
  { id: 'hinoki_ivory', label: '檜象牙', swatch: 'linear-gradient(135deg, #f5e6ce 0%, #d4b282 100%)' },
  { id: 'karakuri_bronze', label: '真鍮銅', swatch: 'linear-gradient(135deg, #cfa16b 0%, #6d4c2b 100%)' },
  { id: 'bisque_porcelain', label: '京白磁', swatch: 'linear-gradient(135deg, #fcfaf6 0%, #d8d2c7 100%)' },
  { id: 'obsidian_gold', label: '黒曜金', swatch: 'linear-gradient(135deg, #43464c 0%, #1b1c1f 65%, #d6b268 100%)' },
];

const GAME_MODE_OPTIONS: Array<{ id: GameModeId; label: string; sub: string }> = [
  { id: 'classic', label: '真剣勝負', sub: '先に3勝（または5勝）で勝ち' },
  { id: 'survival', label: '連勝道場', sub: '負けたら終了・2連勝ごとに舞台が変わる' },
  { id: 'blitz', label: '刹那3秒', sub: '3.5秒以内に選ばないと自動で出る' },
  { id: 'endless', label: '無制限', sub: '勝敗を気にせず自由に練習' },
];

const DEVICE_OPTIONS: Array<{ id: JSoundDeviceProfileSetting; label: string; sub: string }> = [
  { id: 'auto', label: '自動', sub: '端末から判定' },
  { id: 'headphones', label: 'イヤホン', sub: '立体音響＋重低音' },
  { id: 'phone_speaker', label: 'スマホ本体', sub: '仮想低音で迫力' },
  { id: 'pc_speakers', label: 'スピーカー', sub: 'PC・外部' },
];

const DEVICE_LABEL: Record<string, string> = {
  headphones: 'イヤホン・ヘッドホン',
  phone_speaker: 'スマホ本体スピーカー',
  pc_speakers: 'PC・外部スピーカー',
};

/** What each move beats (shown on the hand buttons for beginners). */
const BEATS_HINT: Record<Move, string> = {
  [ROCK]: 'チョキに勝つ',
  [SCISSORS]: 'パーに勝つ',
  [PAPER]: 'グーに勝つ',
};

/** Bespoke Gold-Inlay Fine-Craft Hand Medallion Artwork (Zero Cliché Emojis) */
const ARTISAN_HAND_SVG: Record<Move, string> = {
  [ROCK]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M18 33V25.5C18 23.0 20.0 21 22.5 21C24.4 21 26 22.2 26.7 23.8V21.8C26.7 19.3 28.7 17.3 31.2 17.3C33.4 17.3 35.2 18.8 35.6 20.8C36.4 19.5 37.8 18.6 39.5 18.6C42.0 18.6 44 20.6 44 23.1V25.4C45.8 25.7 47.2 27.3 47.2 29.2V36.8C47.2 44.6 40.9 50.8 33.1 50.8H29.4C22.4 50.8 16.8 45.2 16.8 38.2V34.5C16.8 33.6 17.3 33 18 33Z" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M26.7 23.8V31.5M35.6 20.8V31.5M44 25.4V32.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M18 33.2H31.8C34.2 33.2 36 35.0 36 37.3C36 39.4 34.4 41.0 32.3 41.2L26.2 41.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  [SCISSORS]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M26.2 32.5L21.6 14.2C21.1 12.1 22.4 10 24.5 9.5C26.6 9.0 28.7 10.3 29.2 12.4L33.0 28.2L37.4 12.6C38.0 10.5 40.1 9.3 42.2 9.9C44.3 10.5 45.5 12.6 44.9 14.7L39.6 32.6" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M39.6 32.6C42.2 32.6 44.5 34.4 44.8 37.1L45.1 39.6C45.7 46.1 40.6 51.8 34.0 51.8H28.8C22.4 51.8 17.5 46.6 17.8 40.2L18.1 35.8C18.3 33.4 20.3 31.6 22.7 31.6C24.2 31.6 25.5 32.2 26.2 32.5" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M24.2 36.2H34.4C36.4 36.2 38.0 37.8 38.0 39.8C38.0 41.8 36.4 43.3 34.4 43.3H28.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  [PAPER]: `<svg class="hand-emblem" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M20.5 35.8L14.5 29.8C13.0 28.3 13.0 25.9 14.5 24.4C16.0 22.9 18.4 22.9 19.9 24.4L23.2 27.7V16.4C23.2 14.3 24.9 12.6 27.0 12.6C29.1 12.6 30.8 14.3 30.8 16.4V26.2V12.8C30.8 10.7 32.5 9.0 34.6 9.0C36.7 9.0 38.4 10.7 38.4 12.8V26.4V15.4C38.4 13.4 40.0 11.8 42.0 11.8C44.0 11.8 45.6 13.4 45.6 15.4V28.2V21.2C45.6 19.4 47.0 18.0 48.8 18.0C50.6 18.0 52.0 19.4 52.0 21.2V37.6C52.0 45.8 45.3 52.4 37.1 52.4H32.2C25.5 52.4 20.5 47.5 20.5 40.8V35.8Z" fill="currentColor" fill-opacity="0.11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

const ICON = {
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  help: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor"/></svg>`,
  photo5k: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  pv: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>`,
  camera: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  inspector: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/></svg>`,
  soundOn: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  soundOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  fullscreenEnter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  fullscreenExit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`,
  reset: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  lock: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  bolt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>`,
  eye: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

const CORNER_FILIGREE = `<svg class="corner-orn tl" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 13V3C1 1.9 1.9 1 3 1H13" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn tr" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M13 13V3C13 1.9 12.1 1 11 1H1" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn bl" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1V11C1 12.1 1.9 13 3 13H13" stroke="currentColor" stroke-width="1.1"/></svg><svg class="corner-orn br" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M13 1V11C13 12.1 12.1 13 11 13H1" stroke="currentColor" stroke-width="1.1"/></svg>`;

const ONBOARDING_KEY = 'janken_kiwami_onboarded_v16';
const STUDIO_TAB_KEY = 'janken_kiwami_studio_tab_v16';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode / blocked) — the UI still works
  }
}

export class GameUI {
  private readonly root: HTMLElement;
  private readonly handlers: GameUIHandlers;

  private graphicsOpen = false;
  private inspectorOpen = false;
  private studioTab: StudioTab = 'quick';
  private studioDirty = true;
  private showHudTelemetry = false;
  private soundOn = true;
  private isImmersiveFs = false;
  private isCapturing5K = false;
  private roundBusy = false;
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
  private readonly isTouchFirst: boolean;
  private deviceDecision: DeviceDecision | null = null;
  private activePreset: QualityPresetId | 'device' | null = null;
  private hapticsOn = true;
  private suppressClickUntil = 0;

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
  private statusLineEl!: HTMLElement;

  private theatreEl!: HTMLElement;
  private theatreBrushEl!: HTMLElement;
  private theatreTextEl!: HTMLElement;
  private theatreStampEl!: HTMLElement;
  private theatreHideTimer = 0;

  private spiritFillEl!: HTMLElement;
  private btnOverdriveEl!: HTMLButtonElement;
  private overdriveLabelEl!: HTMLElement;
  private overdriveSubEl!: HTMLElement;
  private btnFeintEl!: HTMLButtonElement;
  private feintSubEl!: HTMLElement;
  private blitzBarEl!: HTMLElement;
  private blitzFillEl!: HTMLElement;

  private sealPillEl!: HTMLElement;
  private handButtons: HTMLButtonElement[] = [];

  private zoomHudBarEl!: HTMLElement;
  private zoomHudReadoutEl!: HTMLElement;
  private zoomHudDetailEl!: HTMLElement;
  private zoomHudResetBtn!: HTMLButtonElement;

  private graphicsDrawerEl!: HTMLElement;
  private inspectorDrawerEl!: HTMLElement;
  private sheetScrimEl!: HTMLElement;
  private studioTabsEl!: HTMLElement;
  private menuNavBtn!: HTMLButtonElement;
  private photo5kNavBtn!: HTMLButtonElement;
  private pvNavBtn!: HTMLButtonElement;
  private cameraNavBtn!: HTMLButtonElement;
  private inspectorNavBtn!: HTMLButtonElement;
  private soundNavBtn!: HTMLButtonElement;
  private fsNavBtn!: HTMLButtonElement;
  private helpNavBtn!: HTMLButtonElement;
  private shutterFlashEl!: HTMLElement;
  private photoToastEl!: HTMLElement;

  private graphicsBodyEl!: HTMLElement;
  private inspectorBodyEl!: HTMLElement;

  private splitOverlayEl!: HTMLElement;
  private splitHandleEl!: HTMLElement;

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
  private guideEl!: HTMLElement;

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
    this.isTouchFirst =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const savedTab = safeGet(STUDIO_TAB_KEY) as StudioTab | null;
    if (savedTab && STUDIO_TABS.some((t) => t.id === savedTab)) this.studioTab = savedTab;

    this.buildShell();
    this.renderInspectorDrawer();
    this.updateTacticalState(this.tacticalState);
    this.bindKeyboardShortcuts();
    this.bindSplitDrag();
    this.bindFullscreenListeners();
    this.bindSheetSwipe(this.graphicsDrawerEl, () => this.closeDrawers());
    this.bindSheetSwipe(this.inspectorDrawerEl, () => this.closeDrawers());

    if (!safeGet(ONBOARDING_KEY)) {
      window.setTimeout(() => this.openGuide(), 650);
    }
  }

  // ===========================================================================
  // SHELL
  // ===========================================================================

  private buildShell(): void {
    this.root.innerHTML = `
      <div class="shutter-flash" id="shutter-flash" aria-hidden="true"></div>
      <div class="photo-toast" id="photo-toast" role="status" aria-live="polite"></div>

      <div class="cinema-letterbox" id="cinema-letterbox" aria-hidden="true">
        <div class="cinema-bar top"></div>
        <div class="cinema-bar bottom"></div>
      </div>

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

      <div class="khdr-split-overlay" id="khdr-split-overlay">
        <div class="khdr-split-label left">標準 SDR</div>
        <div class="khdr-split-label right">KHDR 1.1 ON</div>
        <div class="khdr-split-handle" id="khdr-split-handle" title="ドラッグして比較位置を移動">
          <div class="khdr-split-knob">⇄</div>
        </div>
      </div>

      <header class="top-bar">
        <div class="top-left">
          <button class="icon-medallion menu-medallion" id="btn-menu" data-tip="設定・メニュー (G)" aria-label="設定・メニューを開く" aria-expanded="false" aria-controls="drawer-graphics">
            ${ICON.menu}<span class="medallion-label">メニュー</span>
          </button>
          <div class="brand-crest desktop-only" aria-hidden="true">
            <div class="hanko-seal">極</div>
            <div class="brand-wordmark"><h1>JANKEN</h1><span class="brand-dot">·</span><span class="brand-jp">極</span></div>
          </div>
          <div class="micro-telemetry" id="micro-telemetry" style="display:none"></div>
        </div>

        <div class="match-crest" id="match-crest" role="group" aria-label="スコア">
          ${CORNER_FILIGREE}
          <div class="crest-side player">
            <div class="crest-who">あなた</div>
            <div class="crest-row">
              <div class="crest-pips" id="player-pips"></div>
              <div class="crest-num" id="score-player" aria-label="あなたの得点">0</div>
            </div>
          </div>
          <div class="crest-center">
            <div class="round-medallion" id="round-crest" aria-label="局数">壱</div>
            <div class="draw-indicator" id="draw-dot" title="あいこ中"></div>
          </div>
          <div class="crest-side npc">
            <div class="crest-who">相手</div>
            <div class="crest-row">
              <div class="crest-num" id="score-npc" aria-label="相手の得点">0</div>
              <div class="crest-pips" id="npc-pips"></div>
            </div>
          </div>
        </div>

        <nav class="top-actions" aria-label="クイック操作">
          <button class="icon-medallion photo-accent desktop-only" id="btn-photo-5k" data-tip="今の視点を5K写真で保存 (K)" aria-label="5K写真を保存">${ICON.photo5k}</button>
          <button class="icon-medallion desktop-only" id="btn-pv" data-tip="PV（紹介映像）再生・録画 (P)" aria-label="PVシネマ">${ICON.pv}</button>
          <button class="icon-medallion desktop-only" id="btn-camera" data-tip="カメラ切替 (C)" aria-label="カメラ視点を切り替える">${ICON.camera}</button>
          <button class="icon-medallion desktop-only" id="btn-inspector" data-tip="AIの読み・公正性の証明 (J)" aria-label="AI解析を開く">${ICON.inspector}<span class="medallion-seal-dot"></span></button>
          <button class="icon-medallion" id="btn-sound" data-tip="音 ON/OFF" aria-label="音を消す" aria-pressed="true">${ICON.soundOn}</button>
          <button class="icon-medallion desktop-only" id="btn-fullscreen" data-tip="全画面 (F)" aria-label="全画面表示">${ICON.fullscreenEnter}</button>
          <button class="icon-medallion" id="btn-help" data-tip="遊び方 (H)" aria-label="遊び方を見る">${ICON.help}</button>
          <button class="icon-medallion desktop-only" id="btn-reset-match" data-tip="最初から" aria-label="試合をリセット">${ICON.reset}</button>
        </nav>
      </header>

      <div class="status-line" id="status-line" role="status" aria-live="polite">手を選んでください</div>

      <div class="battle-theatre" aria-live="polite">
        <div class="theatre-stage" id="theatre-stage">
          <svg class="ink-brush-sweep" id="theatre-brush" viewBox="0 0 420 90" fill="none" preserveAspectRatio="none" aria-hidden="true">
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

      <footer class="bottom-dock">
        <div class="blitz-bar" id="blitz-bar" style="display:none" aria-label="残り時間">
          <div class="blitz-fill" id="blitz-fill"></div>
        </div>

        <div class="tactical-strip" id="tactical-strip">
          <button class="tact-btn overdrive" id="btn-overdrive" disabled aria-describedby="overdrive-sub">
            <span class="tact-fill" id="spirit-fill" aria-hidden="true"></span>
            <span class="tact-icon">${ICON.bolt}</span>
            <span class="tact-text">
              <span class="tact-label" id="overdrive-label">極一撃 35%</span>
              <span class="tact-sub" id="overdrive-sub">勝てば2点</span>
            </span>
          </button>
          <button class="tact-btn feint" id="btn-feint" aria-describedby="feint-sub">
            <span class="tact-icon">${ICON.eye}</span>
            <span class="tact-text">
              <span class="tact-label">牽制</span>
              <span class="tact-sub" id="feint-sub">相手の出さない手が1つ分かる</span>
            </span>
          </button>
          <button class="seal-chip" id="seal-chip" title="相手の手は勝負前に暗号で封印済み（後出しなし）">
            ${ICON.lock}<span id="seal-chip-label">後出しなし</span>
          </button>
        </div>

        <div class="hand-cards" id="hand-dock" role="group" aria-label="出す手を選ぶ">
          ${([ROCK, SCISSORS, PAPER] as Move[])
            .map(
              (m, idx) => `
              <button class="artisan-card" id="btn-move-${MOVE_META[m].id}" data-move="${m}" aria-label="${MOVE_META[m].jp}を出す（${BEATS_HINT[m]}）">
                ${CORNER_FILIGREE}
                <div class="card-sheen"></div>
                <div class="card-ripple"></div>
                <span class="card-ruled-tag" style="display:none">相手は出さない</span>
                <div class="card-art">${ARTISAN_HAND_SVG[m]}</div>
                <div class="card-footer">
                  <span class="card-jp">${MOVE_META[m].jp}</span>
                  <span class="card-key" aria-hidden="true">${idx + 1}</span>
                </div>
                <span class="card-hint">${BEATS_HINT[m]}</span>
              </button>
            `
            )
            .join('')}
        </div>
      </footer>

      <div class="zoom-hud-bar" id="zoom-hud-bar" role="group" aria-label="拡大鏡">
        <button class="zoom-hud-btn" id="btn-zoom-in" aria-label="拡大">＋</button>
        <div class="zoom-hud-readout-wrap">
          <span class="zoom-hud-readout" id="zoom-hud-readout">1.0×</span>
          <span class="zoom-hud-detail" id="zoom-hud-detail">標準</span>
        </div>
        <button class="zoom-hud-btn" id="btn-zoom-out" aria-label="縮小">−</button>
        <button class="zoom-hud-btn zoom-hud-reset" id="btn-zoom-reset" style="display:none" aria-label="視点を戻す">戻す</button>
      </div>

      <div class="sheet-scrim" id="sheet-scrim" aria-hidden="true"></div>

      <aside class="drawer left" id="drawer-graphics" aria-label="設定" role="dialog" aria-modal="false">
        <div class="sheet-grabber" aria-hidden="true"></div>
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>設定・メニュー</h2>
            <span class="drawer-badge">v1.6 極</span>
          </div>
          <button class="drawer-close" id="close-graphics" aria-label="閉じる">✕</button>
        </div>
        <div class="studio-tabs" id="studio-tabs" role="tablist" aria-label="設定の種類">
          ${STUDIO_TABS.map(
            (t) => `<button class="studio-tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === this.studioTab}">${t.label}</button>`
          ).join('')}
        </div>
        <div class="drawer-body" id="graphics-body" role="tabpanel"></div>
      </aside>

      <aside class="drawer right" id="drawer-inspector" aria-label="AI解析" role="dialog" aria-modal="false">
        <div class="sheet-grabber" aria-hidden="true"></div>
        <div class="drawer-header">
          <div class="drawer-title">
            <h2>JNV1.0 · 読心解析</h2>
            <span class="drawer-badge">36 EXP</span>
          </div>
          <button class="drawer-close" id="close-inspector" aria-label="閉じる">✕</button>
        </div>
        <div class="drawer-body" id="inspector-body"></div>
      </aside>

      <div class="guide-backdrop" id="guide" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div class="guide-card">
          ${CORNER_FILIGREE}
          <div class="guide-hanko" aria-hidden="true">極</div>
          <h2 id="guide-title">遊び方</h2>
          <ol class="guide-steps">
            <li><span class="gs-num">1</span><div><strong>下のボタンで手を選ぶ</strong><span>グー・チョキ・パーをタップ（PCは 1 / 2 / 3 キー）。ボタンに「何に勝つか」が書いてあります。</span></div></li>
            <li><span class="gs-num">2</span><div><strong>気迫がたまったら「極一撃」</strong><span>勝ち・あいこで気迫がたまり、100%で極一撃を構えられます。次に勝てば<b>2点</b>！</span></div></li>
            <li><span class="gs-num">3</span><div><strong>迷ったら「牽制」</strong><span>相手が<b>出さない手</b>が1つ分かります（使うと3局お休み）。</span></div></li>
            <li><span class="gs-num">4</span><div><strong>手を拡大して観察</strong><span>2本指で広げる・ホイールで最大5000倍。拡大するほど指紋・汗孔・角質細胞まで細かく表示されます。</span></div></li>
          </ol>
          <p class="guide-note">${ICON.lock} 相手の手は勝負の前に暗号（SHA-256）で封印済み。後出しは一切ありません。</p>
          <button class="modal-btn primary guide-start" id="guide-start">はじめる</button>
        </div>
      </div>

      <div class="modal-backdrop" id="match-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-card">
          ${CORNER_FILIGREE}
          <div class="modal-crest" id="modal-crest">勝</div>
          <h2 id="modal-title">勝 利</h2>
          <div class="modal-stats" id="modal-stats"></div>
          <div class="modal-actions">
            <button class="modal-btn primary" id="modal-rematch-keep">もう一度</button>
            <button class="modal-btn secondary" id="modal-rematch-fresh">AIの記憶を消して再戦</button>
          </div>
        </div>
      </div>
    `;

    const q = <T extends HTMLElement = HTMLElement>(sel: string): T => this.root.querySelector<T>(sel)!;

    this.shutterFlashEl = q('#shutter-flash');
    this.photoToastEl = q('#photo-toast');
    this.microTelemetryEl = q('#micro-telemetry');
    this.scorePlayerEl = q('#score-player');
    this.scoreNpcEl = q('#score-npc');
    this.playerPipsEl = q('#player-pips');
    this.npcPipsEl = q('#npc-pips');
    this.roundCrestEl = q('#round-crest');
    this.drawDotEl = q('#draw-dot');
    this.statusLineEl = q('#status-line');

    this.theatreEl = q('#theatre-stage');
    this.theatreBrushEl = q('#theatre-brush');
    this.theatreTextEl = q('#theatre-text');
    this.theatreStampEl = q('#theatre-stamp');

    this.spiritFillEl = q('#spirit-fill');
    this.btnOverdriveEl = q<HTMLButtonElement>('#btn-overdrive');
    this.overdriveLabelEl = q('#overdrive-label');
    this.overdriveSubEl = q('#overdrive-sub');
    this.btnFeintEl = q<HTMLButtonElement>('#btn-feint');
    this.feintSubEl = q('#feint-sub');
    this.blitzBarEl = q('#blitz-bar');
    this.blitzFillEl = q('#blitz-fill');
    this.sealPillEl = q('#seal-chip');

    this.zoomHudBarEl = q('#zoom-hud-bar');
    this.zoomHudReadoutEl = q('#zoom-hud-readout');
    this.zoomHudDetailEl = q('#zoom-hud-detail');
    this.zoomHudResetBtn = q<HTMLButtonElement>('#btn-zoom-reset');
    q('#btn-zoom-in').addEventListener('click', () => this.handlers.onZoomSteps(2.2));
    q('#btn-zoom-out').addEventListener('click', () => this.handlers.onZoomSteps(-2.2));
    this.zoomHudResetBtn.addEventListener('click', () => this.handlers.onResetZoom());

    this.graphicsDrawerEl = q('#drawer-graphics');
    this.inspectorDrawerEl = q('#drawer-inspector');
    this.sheetScrimEl = q('#sheet-scrim');
    this.studioTabsEl = q('#studio-tabs');
    this.menuNavBtn = q<HTMLButtonElement>('#btn-menu');
    this.photo5kNavBtn = q<HTMLButtonElement>('#btn-photo-5k');
    this.pvNavBtn = q<HTMLButtonElement>('#btn-pv');
    this.cameraNavBtn = q<HTMLButtonElement>('#btn-camera');
    this.inspectorNavBtn = q<HTMLButtonElement>('#btn-inspector');
    this.soundNavBtn = q<HTMLButtonElement>('#btn-sound');
    this.fsNavBtn = q<HTMLButtonElement>('#btn-fullscreen');
    this.helpNavBtn = q<HTMLButtonElement>('#btn-help');

    this.graphicsBodyEl = q('#graphics-body');
    this.inspectorBodyEl = q('#inspector-body');
    this.splitOverlayEl = q('#khdr-split-overlay');
    this.splitHandleEl = q('#khdr-split-handle');

    this.cinemaBarsEl = q('#cinema-letterbox');
    this.pvOverlayEl = q('#pv-overlay');
    this.pvBadgeEl = q('#pv-badge');
    this.pvTitleEl = q('#pv-title');
    this.pvSubtitleEl = q('#pv-subtitle');
    this.pvHankoEl = q('#pv-hanko');
    this.pvProgressFillEl = q('#pv-progress-fill');
    this.pvRecStatusEl = q('#pv-rec-status');
    this.pvDownloadLinkEl = q<HTMLAnchorElement>('#pv-download-link');
    this.pvModeBtns = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-pv-mode]'));

    this.modalBackdropEl = q('#match-modal');
    this.modalCrestEl = q('#modal-crest');
    this.modalTitleEl = q('#modal-title');
    this.modalStatsEl = q('#modal-stats');
    this.guideEl = q('#guide');

    // Hand buttons (tilt on desktop hover, instant tap on touch)
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
        btn.style.setProperty('--rx', `${((0.5 - ny) * 7).toFixed(2)}deg`);
        btn.style.setProperty('--ry', `${((nx - 0.5) * 9).toFixed(2)}deg`);
      });
      // Touch: commit on pointerdown (saves the ~60–120 ms click delay of pointerup + synthesis on a
      // 120 Hz panel) with an 8 ms haptic tick; mouse/keyboard keep the normal click.
      btn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || btn.disabled) return;
        this.suppressClickUntil = performance.now() + 600;
        if (this.hapticsOn) vibrate(8);
        this.triggerCardRipple(btn);
        this.handlers.onSelectMove(move);
      });
      btn.addEventListener('click', () => {
        if (performance.now() < this.suppressClickUntil) return;
        this.triggerCardRipple(btn);
        this.handlers.onSelectMove(move);
      });
    }

    this.btnOverdriveEl.addEventListener('click', () => this.handlers.onToggleOverdrive());
    this.btnFeintEl.addEventListener('click', () => this.handlers.onTriggerFeint());

    this.menuNavBtn.addEventListener('click', () => {
      this.graphicsOpen = !this.graphicsOpen;
      if (this.graphicsOpen) this.inspectorOpen = false;
      this.syncDrawers();
    });
    this.photo5kNavBtn.addEventListener('click', () => void this.trigger5KPhotoCapture());
    this.pvNavBtn.addEventListener('click', () => this.togglePV());
    this.cameraNavBtn.addEventListener('click', () => this.handlers.onCycleCameraStyle());
    this.inspectorNavBtn.addEventListener('click', () => this.openInspector(!this.inspectorOpen));
    this.helpNavBtn.addEventListener('click', () => this.openGuide());
    q('#close-graphics').addEventListener('click', () => this.closeDrawers());
    q('#close-inspector').addEventListener('click', () => this.closeDrawers());
    this.sheetScrimEl.addEventListener('click', () => this.closeDrawers());
    this.sealPillEl.addEventListener('click', () => this.openInspector(true));
    this.soundNavBtn.addEventListener('click', () => this.toggleSound());
    this.fsNavBtn.addEventListener('click', () => void this.toggleFullscreen());
    q('#btn-reset-match').addEventListener('click', () => {
      this.closeMatchModal();
      this.handlers.onResetMatch();
    });
    q('#guide-start').addEventListener('click', () => this.closeGuide());
    this.guideEl.addEventListener('click', (e) => {
      if (e.target === this.guideEl) this.closeGuide();
    });

    this.studioTabsEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => this.setStudioTab(b.dataset.tab as StudioTab));
    });

    for (const b of this.pvModeBtns) {
      b.addEventListener('click', () => this.handlers.onStartPV(b.dataset.pvMode as PVModeId, false));
    }
    q('#pv-btn-record').addEventListener('click', () => this.handlers.onStartPV(this.pvState.mode, true));
    q('#pv-btn-snap').addEventListener('click', () => this.handlers.onCaptureSnapshot());
    q('#pv-btn-stop').addEventListener('click', () => this.handlers.onStopPV());
  }

  // ===========================================================================
  // GUIDE / DRAWERS / SHEETS
  // ===========================================================================

  private openGuide(): void {
    this.closeDrawers();
    this.guideEl.classList.add('open');
    window.setTimeout(() => this.root.querySelector<HTMLButtonElement>('#guide-start')?.focus(), 60);
  }

  private closeGuide(): void {
    this.guideEl.classList.remove('open');
    safeSet(ONBOARDING_KEY, '1');
    this.handButtons[0]?.focus({ preventScroll: true });
  }

  private togglePV(): void {
    if (this.pvState.active) {
      this.handlers.onStopPV();
    } else {
      this.closeDrawers();
      this.handlers.onStartPV('grand_trailer', false);
    }
  }

  private toggleSound(): void {
    this.soundOn = this.handlers.onToggleSound();
    this.soundNavBtn.innerHTML = this.soundOn ? ICON.soundOn : ICON.soundOff;
    this.soundNavBtn.classList.toggle('muted', !this.soundOn);
    this.soundNavBtn.setAttribute('aria-pressed', String(this.soundOn));
    this.soundNavBtn.setAttribute('aria-label', this.soundOn ? '音を消す' : '音を出す');
    this.showPhotoToast(this.soundOn ? '音：ON' : '音：OFF（ミュート）');
  }

  private openInspector(open: boolean): void {
    this.inspectorOpen = open;
    if (open) this.graphicsOpen = false;
    this.syncDrawers();
  }

  private closeDrawers(): void {
    this.graphicsOpen = false;
    this.inspectorOpen = false;
    this.syncDrawers();
  }

  private setStudioTab(tab: StudioTab): void {
    if (this.studioTab === tab && !this.studioDirty) return;
    this.studioTab = tab;
    safeSet(STUDIO_TAB_KEY, tab);
    this.studioTabsEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      const sel = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(sel));
      if (sel) b.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    this.graphicsBodyEl.scrollTop = 0;
    this.renderGraphicsDrawer(true);
  }

  private syncDrawers(): void {
    if (this.graphicsOpen && this.studioDirty) this.renderGraphicsDrawer(true);
    this.graphicsDrawerEl.classList.toggle('open', this.graphicsOpen);
    this.inspectorDrawerEl.classList.toggle('open', this.inspectorOpen);
    this.sheetScrimEl.classList.toggle('open', this.graphicsOpen || this.inspectorOpen);
    this.menuNavBtn.classList.toggle('active', this.graphicsOpen);
    this.menuNavBtn.setAttribute('aria-expanded', String(this.graphicsOpen));
    this.inspectorNavBtn.classList.toggle('active', this.inspectorOpen);
    this.root.classList.toggle('sheet-open', this.graphicsOpen || this.inspectorOpen);
    if (this.inspectorOpen) this.renderInspectorDrawer();
  }

  /** Swipe a bottom sheet down by its header/grabber to close it (phones). */
  private bindSheetSwipe(sheet: HTMLElement, onClose: () => void): void {
    let startY = 0;
    let dy = 0;
    let tracking = false;
    const header = sheet.querySelector<HTMLElement>('.drawer-header');
    const grab = sheet.querySelector<HTMLElement>('.sheet-grabber');
    const start = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      tracking = true;
      startY = e.clientY;
      dy = 0;
      sheet.style.transition = 'none';
    };
    const move = (e: PointerEvent) => {
      if (!tracking) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) onClose();
    };
    for (const el of [header, grab]) {
      if (!el) continue;
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }
  }

  // ===========================================================================
  // TOASTS / PHOTO / FULLSCREEN
  // ===========================================================================

  private showPhotoToast(msg: string, sticky = false): void {
    window.clearTimeout(this.photoToastTimer);
    this.photoToastEl.textContent = msg;
    this.photoToastEl.classList.add('visible');
    if (!sticky) {
      this.photoToastTimer = window.setTimeout(() => {
        this.photoToastEl.classList.remove('visible');
      }, 3600);
    }
  }

  public async trigger5KPhotoCapture(): Promise<Photo5KResult | null> {
    if (this.isCapturing5K) return null;
    this.isCapturing5K = true;
    this.photo5kNavBtn.classList.add('active');
    this.shutterFlashEl.classList.remove('flash');
    void this.shutterFlashEl.offsetWidth;
    this.shutterFlashEl.classList.add('flash');
    this.showPhotoToast('5K写真を撮影中…', true);
    this.markStudioDirty();
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
        this.showPhotoToast(`✓ 保存しました ${res.width}×${res.height}（${mb} MB・改ざん防止の証明付き）`);
      } else {
        this.showPhotoToast('撮影をキャンセルしました');
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showPhotoToast(`撮影エラー: ${msg}`);
      return null;
    } finally {
      this.isCapturing5K = false;
      this.photo5kNavBtn.classList.remove('active');
      this.markStudioDirty();
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
    this.setImmersiveFullscreen(true);
    if (!enteredNative) window.scrollTo(0, 1);
  }

  private setImmersiveFullscreen(active: boolean): void {
    this.isImmersiveFs = active;
    document.documentElement.classList.toggle('immersive-fullscreen', active);
    this.fsNavBtn.innerHTML = active ? ICON.fullscreenExit : ICON.fullscreenEnter;
    this.fsNavBtn.classList.toggle('active', active);
    this.fsNavBtn.dataset.tip = active ? '全画面を解除 (F)' : '全画面 (F)';
    this.markStudioDirty();
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
    for (const b of this.handButtons) b.classList.toggle('selected', b === btn);
    btn.classList.remove('rippling');
    void btn.offsetWidth;
    btn.classList.add('rippling');
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (k === 'escape') {
        if (this.guideEl.classList.contains('open')) {
          this.closeGuide();
          return;
        }
        if (this.pvState.active) {
          this.handlers.onStopPV();
          return;
        }
        this.closeDrawers();
        return;
      }
      if (this.pvState.active || this.modalBackdropEl.classList.contains('open') || this.guideEl.classList.contains('open')) return;

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
        this.closeDrawers();
        this.handlers.onStartPV('grand_trailer', false);
      } else if (k === 'f') {
        void this.toggleFullscreen();
      } else if (k === 'g') {
        this.graphicsOpen = !this.graphicsOpen;
        if (this.graphicsOpen) this.inspectorOpen = false;
        this.syncDrawers();
      } else if (k === 'j') {
        this.openInspector(!this.inspectorOpen);
      } else if (k === 'h' || k === '?') {
        this.openGuide();
      } else if (k === '+' || k === '=' || k === ';') {
        this.handlers.onZoomSteps(2.2);
      } else if (k === '-' || k === '_') {
        this.handlers.onZoomSteps(-2.2);
      } else if (k === '0') {
        this.handlers.onResetZoom();
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

  // ===========================================================================
  // GAME STATE → HUD
  // ===========================================================================

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
        ? `● 録画中 · ACT ${st.actIndex}/${st.actTotal}`
        : `PV CINEMA · ACT ${st.actIndex}/${st.actTotal}`;
      this.pvRecStatusEl.classList.toggle('recording', st.recording);
      for (const b of this.pvModeBtns) b.classList.toggle('active', b.dataset.pvMode === st.mode);
    }
    if (st.recordedUrl) {
      this.pvDownloadLinkEl.href = st.recordedUrl;
      this.pvDownloadLinkEl.download = st.recordedFilename;
      this.pvDownloadLinkEl.style.display = 'inline-flex';
    } else {
      this.pvDownloadLinkEl.style.display = 'none';
    }
    if (prevActive !== st.active || prevUrl !== st.recordedUrl) this.markStudioDirty();
  }

  public updateTacticalState(st: TacticalState): void {
    this.tacticalState = { ...st };
    this.gameMode = st.gameMode;

    const pct = Math.max(0, Math.min(100, Math.round(st.spiritPct)));
    this.spiritFillEl.style.width = `${pct}%`;
    const canOverdrive = pct >= 100;
    this.btnOverdriveEl.disabled = !canOverdrive || this.roundBusy;
    this.btnOverdriveEl.classList.toggle('ready', canOverdrive && !st.overdriveArmed);
    this.btnOverdriveEl.classList.toggle('armed', st.overdriveArmed);
    this.btnOverdriveEl.classList.toggle('full', canOverdrive);
    this.overdriveLabelEl.textContent = st.overdriveArmed ? '極一撃 装填中' : canOverdrive ? '極一撃 発動OK' : `極一撃 ${pct}%`;
    this.overdriveSubEl.textContent = st.overdriveArmed
      ? 'もう一度押すと解除'
      : canOverdrive
      ? 'タップで構える・勝てば2点'
      : '勝ち・あいこで気迫がたまる';
    this.btnOverdriveEl.setAttribute('aria-pressed', String(st.overdriveArmed));

    this.btnFeintEl.disabled = !st.feintReady || this.roundBusy;
    this.btnFeintEl.classList.toggle('ready', st.feintReady);
    this.feintSubEl.textContent = st.feintReady
      ? '相手の出さない手が1つ分かる'
      : st.feintCooldown > 0
      ? `あと${st.feintCooldown}局で再使用`
      : 'この局は使用済み';

    for (const btn of this.handButtons) {
      const m = Number(btn.dataset.move) as Move;
      const tag = btn.querySelector<HTMLElement>('.card-ruled-tag');
      if (tag) tag.style.display = st.ruledOutNpcMove === m ? 'inline-flex' : 'none';
    }

    if (st.blitzRatio !== null) {
      this.blitzBarEl.style.display = 'block';
      const clamped = Math.max(0, Math.min(1, st.blitzRatio));
      this.blitzFillEl.style.width = `${(clamped * 100).toFixed(1)}%`;
      this.blitzFillEl.classList.toggle('urgent', clamped < 0.34);
    } else {
      this.blitzBarEl.style.display = 'none';
    }
    this.updateStatusLine();
  }

  /** One plain-language line telling the player what is going on / what to do next. */
  private updateStatusLine(): void {
    const st = this.tacticalState;
    let text: string;
    let tone = '';
    if (this.roundBusy) {
      text = '';
    } else if (st.overdriveArmed) {
      text = '極一撃 装填中 — この局に勝てば2点！';
      tone = 'armed';
    } else if (st.ruledOutNpcMove !== null) {
      text = `読み：相手は「${MOVE_META[st.ruledOutNpcMove].jp}」を出さない`;
      tone = 'intel';
    } else if (st.blitzRatio !== null) {
      text = '3.5秒以内に選ぼう！';
      tone = 'urgent';
    } else if (st.winStreak >= 2) {
      text = `${this.toKanjiNum(st.winStreak)}連勝中！ 手を選んでください`;
      tone = 'streak';
    } else if (st.drawStreak >= 1) {
      text = st.drawStreak >= 2 ? `あいこ${st.drawStreak}回 — 次の手は？` : 'あいこ — もう一度！';
    } else if (st.gameMode === 'survival' && st.bestSurvivalStreak > 0) {
      text = `手を選んでください（最高 ${st.bestSurvivalStreak}連勝）`;
    } else if (st.spiritPct >= 100) {
      text = '気迫満タン！「極一撃」で2点を狙える';
      tone = 'armed';
    } else {
      text = '手を選んでください';
    }
    this.statusLineEl.textContent = text;
    this.statusLineEl.className = `status-line ${tone} ${text ? 'visible' : ''}`;
  }

  public setButtonsDisabled(disabled: boolean): void {
    this.roundBusy = disabled;
    for (const b of this.handButtons) {
      b.disabled = disabled;
      if (!disabled) b.classList.remove('selected');
    }
    this.root.classList.toggle('round-busy', disabled);
    if (disabled) {
      this.btnFeintEl.disabled = true;
      this.btnOverdriveEl.disabled = true;
    }
    this.updateTacticalState(this.tacticalState);
  }

  private toKanjiNum(n: number): string {
    const map = ['零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾'];
    return n >= 0 && n < map.length ? map[n] : String(n);
  }

  private toKanjiRound(n: number): string {
    const map = ['', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾'];
    return n >= 1 && n < map.length ? map[n] : `${n}`;
  }

  public updateScoreboard(playerWins: number, npcWins: number, _draws: number, roundNumber: number, isAikoStreak = false): void {
    const pScored = playerWins > this.playerWinsCache;
    const nScored = npcWins > this.npcWinsCache;
    this.playerWinsCache = playerWins;
    this.npcWinsCache = npcWins;
    this.scorePlayerEl.textContent = String(playerWins);
    this.scoreNpcEl.textContent = String(npcWins);
    if (pScored) this.pulseEl(this.scorePlayerEl, 'pop');
    if (nScored) this.pulseEl(this.scoreNpcEl, 'pop');
    this.roundCrestEl.textContent = this.toKanjiRound(roundNumber);
    this.roundCrestEl.setAttribute('aria-label', `第${roundNumber}局`);
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
    this.sealPillEl.title = `第${seal.round}局の相手の手は封印済み（SHA-256: ${seal.shortHash}）— タップで確認`;
    this.pulseEl(this.sealPillEl, 'sealed-pulse');
    if (this.inspectorOpen) this.renderInspectorDrawer();
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
    const text = extraBadge ?? (outcome === 'WIN' ? '勝 利' : outcome === 'LOSS' ? '敗 北' : 'あいこ');
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
    this.theatreHideTimer = window.setTimeout(() => this.theatreEl.classList.add('fading'), 2000);
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
    if (el) el.textContent = `あなたの傾向：${psycho.playerTendencyJp}（情報量 ${psycho.shannonEntropyBits.toFixed(2)} bit）`;
    if (this.inspectorOpen) this.renderInspectorDrawer();
  }

  public updateRenderMetrics(m: RenderMetrics): void {
    this.lastMetrics = m;
    const sfShort = SHADOW_FLAME_SPECS[m.shadowFlameMode].shortLabel;
    const camShort = CAMERA_STYLE_SPECS[m.cameraStyle].shortJp;
    const spTag = this.formatSpatialTag(m.jsoundSpatialMode);

    // Zoom HUD + FINGER S1.1 detail tier chip
    const mag = m.cameraMagnification || 1;
    this.zoomHudReadoutEl.textContent = mag >= 100 ? `${Math.round(mag)}×` : `${mag.toFixed(1)}×`;
    this.zoomHudDetailEl.textContent = m.fingerS1Active ? m.fingerDetailLabelJp : '標準';
    this.zoomHudBarEl.classList.toggle('inspecting', m.cameraIsInspecting);
    this.zoomHudBarEl.classList.toggle('hd', m.fingerDetailTier > 0);
    this.zoomHudResetBtn.style.display = m.cameraIsInspecting ? 'inline-flex' : 'none';

    if (this.showHudTelemetry) {
      this.microTelemetryEl.style.display = 'inline-flex';
      this.microTelemetryEl.innerHTML = `
        <span><strong>${m.fps}</strong> FPS</span><span class="sep">·</span>
        <span>${this.currentSettings.resolution.toUpperCase()}</span><span class="sep">·</span>
        <span class="accent">${m.khdrActive ? 'KHDR' : 'SDR'}</span><span class="sep">·</span>
        <span class="accent">${sfShort}</span><span class="sep">·</span>
        <span class="accent">${spTag}</span><span class="sep">·</span>
        <span>${camShort}</span>`;
    } else {
      this.microTelemetryEl.style.display = 'none';
    }

    if (!this.graphicsOpen) return;
    const set = (id: string, html: string): void => {
      const el = this.graphicsBodyEl.querySelector(`#${id}`);
      if (el) el.innerHTML = html;
    };
    set('live-gpu-stats', this.gpuStatsHtml(m));
    set('live-jhand-stats', this.jhandStatsHtml(m));
    set('live-handdetail-stats', this.handDetailStatsHtml(m));
    set('live-jsound-stats', this.jsoundStatsHtml(m));
    set('live-jsound16-card', this.jsound16CardHtml(m));
    set('live-nexttech-stats', this.nextTechStatsHtml(m));
    set('live-s11-card', this.s11CardHtml(m));
    set('live-perf-card', this.perfCardHtml(m));
  }

  private metric(k: string, v: string, cls = ''): string {
    return `<div class="metric-box"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
  }

  private gpuStatsHtml(m: RenderMetrics | null): string {
    return (
      this.metric('実解像度', m ? `${m.renderWidth}×${m.renderHeight}` : '—') +
      this.metric('実測FPS', m ? `${m.fps} FPS (${m.frameTimeMs}ms)` : '—', 'good') +
      this.metric('影の解像度', m ? `${m.shadowMapSize}px` : '—') +
      this.metric('描画数 / 三角形', m ? `${m.drawCalls} / ${(m.triangles / 1000).toFixed(1)}k` : '—')
    );
  }

  private jhandStatsHtml(m: RenderMetrics | null): string {
    return (
      this.metric('自由度 / 掌形数', m ? `${m.jhandDof}DOF · ${m.jhandPoseCount}種` : '38DOF · 36種', 'gold') +
      this.metric('ICRカム / FDI筋', m ? `${m.jhandIcrGlideMm.toFixed(2)}mm · ${m.jhandFdiPct}%` : '—') +
      this.metric('手掌アーチ / ORL', m ? `${m.jhandPalmCupDeg.toFixed(1)}° · ${Math.round(m.jhandOrlRatio * 100)}%` : '—') +
      this.metric('協調相', m ? m.jhandSynergyJp : '—')
    );
  }

  private handDetailStatsHtml(m: RenderMetrics | null): string {
    return (
      this.metric('皮下腱の隆起', m ? `${m.dermaTendonLiftMm.toFixed(2)} mm` : '—', 'gold') +
      this.metric('手の甲 / 手のひらのしわ', m ? `${m.dermaWrinklePct}% / ${m.dermaVolarCreasePct}%` : '—') +
      this.metric('爪の白化 / 産毛', m ? `${m.nailBlanchPct}% · ${m.vellusHairCount}本` : '—') +
      this.metric('皮膚の状態', m ? m.dermaStatusJp : '—')
    );
  }

  private s11CardHtml(m: RenderMetrics | null): string {
    const tier = m ? m.fingerDetailTier : 0;
    const steps = ['標準', 'HD 2×', '超精細', '顕微'];
    return `
      <div class="tier-ladder" aria-label="ディテール段階">
        ${steps.map((s, i) => `<span class="tier-step ${i <= tier ? 'on' : ''} ${i === tier ? 'current' : ''}">${s}</span>`).join('')}
      </div>
      <div class="metric-grid">
        ${this.metric('現在の段階', m ? m.fingerDetailLabelJp : '標準ディテール', 'gold')}
        ${this.metric('テクスチャ解像度', m ? `${m.fingerTexRes}×${m.fingerTexRes}` : '1024×1024')}
        ${this.metric('メッシュ精細度', m ? `${m.fingerGeoScale}× (${m.fingerGeoScale > 1 ? '4倍の面数' : '標準'})` : '1×')}
        ${this.metric('微細凹凸オクターブ', m ? `${m.fingerShaderOctaves} / 8 (3.8mm→17µm)` : '4 / 8')}
      </div>`;
  }

  private perfCardHtml(m: RenderMetrics | null): string {
    if (!m) return this.metric('状態', '計測中…');
    const scalePct = Math.round(m.perfRenderScale * 100);
    return (
      this.metric('フレームレート', `${m.fps} / ${m.perfFpsCap || m.perfRefreshHz} FPS`, m.fps >= (m.perfFpsCap || 60) * 0.9 ? 'good' : '') +
      this.metric('描画解像度', `${scalePct}% (${m.renderWidth}×${m.renderHeight})`) +
      this.metric('最適化の状態', m.perfThermal ? '冷却中' : m.perfIdle ? '省電力（静止中）' : '最高の滑らかさ', m.perfThermal ? 'warn' : 'gold') +
      this.metric('音と映像のズレ補正', m.avSyncScheduledLayers > 0 ? `${m.avSyncLeadMs >= 0 ? '+' : ''}${m.avSyncLeadMs} ms先行` : '待機中')
    );
  }

  private jsoundStatsHtml(m: RenderMetrics | null): string {
    const spTag = m ? this.formatSpatialTag(m.jsoundSpatialMode) : '4D X·3OA';
    const lufsStr = m && m.jsoundLufsMomentary > -68 ? `${m.jsoundLufsMomentary} LUFS` : '待機';
    return (
      this.metric('空間モード / 内部DSP', m ? `${spTag} · ${m.jsoundDspRateKhz}kHz` : spTag, 'gold') +
      this.metric('残響音線 / 2D-FDTD', m ? `${m.jsoundEarlyRays}本 · ${m.jsoundFdtdNodes}節点 · ${m.jsoundRt60Sec.toFixed(2)}s` : '—') +
      this.metric(`音量 (${m?.jsoundWorkletActive ? 'Worklet' : 'DSP'})`, m ? `${lufsStr} · 位相${m.jsoundPhaseCorr.toFixed(2)}` : '待機') +
      this.metric(`発音 (${m ? m.jsoundVoices : 0}音)`, m ? m.jsoundLastEventJp : '—')
    );
  }

  private jsound16CardHtml(m: RenderMetrics | null): string {
    const dev = m ? DEVICE_LABEL[m.jsoundDeviceProfile] ?? m.jsoundDeviceProfile : '—';
    const integ = m && m.jsoundLufsIntegrated > -69 ? `${m.jsoundLufsIntegrated} LUFS` : '計測中';
    const reveal = m ? (m.jsoundRenderWorkers > 0 ? `${m.jsoundRevealMainMs} ms` : `${m.jsoundRevealMainMs} ms (Worker無)`) : '—';
    return (
      this.metric('出力先', dev, 'gold') +
      this.metric('事前合成 (Worker)', m ? `${m.jsoundRenderWorkers}並列 · 的中${m.jsoundRenderHitPct}% · ${m.jsoundRenderQuality}` : '—') +
      this.metric('決着の瞬間の負荷', reveal, m && m.jsoundRevealMainMs < 8 ? 'good' : '') +
      this.metric('統合ラウドネス / リミッタ', m ? `${integ} · ${m.jsoundLimiterGrDb} dB` : '—')
    );
  }

  private nextTechStatsHtml(m: RenderMetrics | null): string {
    return (
      this.metric('心拍 / 白化', m ? `${m.bioPulseBpm} BPM · ${m.bioCapillaryBlanchPct}%` : '—', 'gold') +
      this.metric('生体状態', m ? m.bioStateJp : '—') +
      this.metric('空気の渦', m ? `${m.aeroActiveVortices}渦 · ${m.aeroPeakSpeedMs.toFixed(1)}m/s` : '—') +
      this.metric('音響プローブ', m ? `${m.probeDistanceM.toFixed(2)}m · LPF ${m.probeAirCutoffKhz}kHz` : '—')
    );
  }

  public setDeviceDecision(d: DeviceDecision): void {
    this.deviceDecision = d;
    this.markStudioDirty();
  }

  public setActivePreset(p: QualityPresetId | 'device'): void {
    this.activePreset = p;
    this.markStudioDirty();
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsOn = enabled;
    this.markStudioDirty();
  }

  /**
   * Viewport CSS px covered by the persistent HUD: bottom edge of the top bar and the height of the
   * hand dock. Transient layers (sheets, toasts, status pill) are deliberately ignored.
   */
  public measureHudOcclusion(): { topPx: number; bottomPx: number } {
    const vh = window.innerHeight || 1;
    let topPx = 0;
    let bottomPx = 0;
    const top = this.root.querySelector<HTMLElement>('.top-bar');
    if (top) {
      const r = top.getBoundingClientRect();
      if (r.height > 0 && r.bottom < vh * 0.45) topPx = Math.max(0, r.bottom);
    }
    const dock = this.root.querySelector<HTMLElement>('.bottom-dock');
    if (dock) {
      const r = dock.getBoundingClientRect();
      if (r.height > 0 && r.top > vh * 0.35) bottomPx = Math.max(0, vh - r.top);
    }
    return { topPx, bottomPx };
  }

  /** Call `cb` (rAF-coalesced) whenever the HUD geometry or the viewport changes. */
  public observeHudOcclusion(cb: (o: { topPx: number; bottomPx: number }) => void): void {
    let queued = false;
    const flush = () => {
      queued = false;
      cb(this.measureHudOcclusion());
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(flush);
    };
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(schedule);
      for (const sel of ['.top-bar', '.bottom-dock']) {
        const el = this.root.querySelector<HTMLElement>(sel);
        if (el) ro.observe(el);
      }
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
  }

  public syncSettings(settings: GraphicsSettings): void {
    this.currentSettings = { ...settings };
    this.splitOverlayEl.classList.toggle('active', settings.khdrSplitCompare);
    this.root.classList.toggle('ui-compact', settings.compactUi);
    this.cameraNavBtn.dataset.tip = `カメラ: ${CAMERA_STYLE_SPECS[settings.cameraStyle].labelJp} (C)`;
    this.markStudioDirty();
  }

  /** Re-render the studio now if it is visible, otherwise lazily on next open (cheap on phones). */
  private markStudioDirty(): void {
    this.studioDirty = true;
    if (this.graphicsOpen) this.renderGraphicsDrawer(true);
  }

  public updateJNVTelemetry(telemetry: JNVRoundTelemetry | null, personaId: JNVPersonaId): void {
    this.lastTelemetry = telemetry;
    this.currentPersona = personaId;
    if (this.inspectorOpen) this.renderInspectorDrawer();
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
    this.closeDrawers();
    this.modalCrestEl.textContent = winner === 'player' ? '勝' : '敗';
    this.modalCrestEl.className = `modal-crest ${winner === 'player' ? 'win' : 'loss'}`;
    this.modalTitleEl.textContent = customTitle ?? (winner === 'player' ? '見 事 、 勝 利' : 'JNV1.0 の 勝 利');
    this.modalStatsEl.innerHTML = `
      <div class="stat-pill"><div class="n">${playerWins}</div><div class="l">あなた</div></div>
      <div class="stat-pill"><div class="n">${draws}</div><div class="l">あいこ</div></div>
      <div class="stat-pill"><div class="n">${npcWins}</div><div class="l">相手</div></div>
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
    window.setTimeout(() => keepBtn.focus(), 60);
  }

  public closeMatchModal(): void {
    this.modalBackdropEl.classList.remove('open');
  }

  // ===========================================================================
  // STUDIO (tabbed settings)
  // ===========================================================================

  private renderGraphicsDrawer(force = false): void {
    if (!force && !this.graphicsOpen) {
      this.studioDirty = true;
      return;
    }
    this.studioDirty = false;
    const prevScroll = this.graphicsBodyEl.scrollTop;
    let html = '';
    switch (this.studioTab) {
      case 'quick':
        html = this.tabQuick();
        break;
      case 'match':
        html = this.tabMatch();
        break;
      case 'sound':
        html = this.tabSound();
        break;
      case 'hands':
        html = this.tabHands();
        break;
      case 'visual':
        html = this.tabVisual();
        break;
      case 'capture':
        html = this.tabCapture();
        break;
      default:
        html = this.tabStats();
    }
    this.graphicsBodyEl.innerHTML = html;
    this.bindStudioEvents();
    this.graphicsBodyEl.scrollTop = prevScroll;
  }

  private section(title: string, meta: string, body: string, extraClass = ''): string {
    return `<section class="panel-section ${extraClass}">
      <div class="section-head"><span class="section-title">${title}</span>${meta ? `<span class="section-meta">${meta}</span>` : ''}</div>
      ${body}
    </section>`;
  }

  private pill(attrs: string, label: string, sub: string, active: boolean): string {
    return `<button class="pill-btn ${active ? 'active' : ''}" ${attrs} aria-pressed="${active}"><span>${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
  }

  private tabQuick(): string {
    const s = this.currentSettings;
    const detected = detectQualityPreset(s);
    const preset = this.activePreset === 'device' ? 'device' : detected;
    const m = this.lastMetrics;
    const devNow = m ? DEVICE_LABEL[m.jsoundDeviceProfile] ?? '' : '';
    const d = this.deviceDecision;
    const presetLabel =
      preset === 'device' ? '端末に最適化' : preset ? QUALITY_PRESETS[preset].labelJp : 'カスタム';
    return (
      this.section(
        'この端末',
        d?.isPocoF7Class ? 'POCO F7 最適化' : '',
        `<div class="device-card ${d?.isPocoF7Class ? 'poco' : ''}">
          <div class="device-name">${d ? d.labelJp : '端末を判定中…'}</div>
          <div class="metric-grid" id="live-perf-card">${this.perfCardHtml(m)}</div>
        </div>`,
        'hero-section'
      ) +
      this.section(
        '画質',
        presetLabel,
        `<div class="pill-grid cols-2">
          ${this.pill('data-qpreset="device"', '端末に最適化', d ? `${d.targetFps}Hz目標・自動調整` : 'おすすめ', preset === 'device')}
          ${(['eco', 'balanced', 'max'] as QualityPresetId[])
            .map((id) => this.pill(`data-qpreset="${id}"`, QUALITY_PRESETS[id].labelJp, id === 'balanced' ? '60Hz・高品質' : id === 'eco' ? '電池長持ち' : 'PC向け', preset === id))
            .join('')}
        </div>
        <p class="hint-text">${
          preset === 'device'
            ? '端末の性能と画面のリフレッシュレートに合わせて、解像度とフレームレートを自動で調整し続けます。'
            : preset
            ? QUALITY_PRESETS[preset].descriptionJp
            : '個別に調整された設定です（「映像」タブで変更できます）'
        }</p>
        <div class="pill-grid cols-2" style="margin-top:6px">
          ${this.pill('id="btn-toggle-adaptive"', s.adaptivePerformance ? '✓ 自動最適化 ON' : '自動最適化 OFF', '動的解像度・省電力', s.adaptivePerformance)}
          ${this.pill('id="btn-toggle-haptics"', this.hapticsOn ? '✓ 振動 ON' : '振動 OFF', hapticsSupported() ? '音に合わせて振動' : 'この端末は非対応', this.hapticsOn && hapticsSupported())}
        </div>`
      ) +
      this.section(
        '音の出力先',
        devNow ? `いま：${devNow}` : '',
        `<div class="pill-grid cols-4">
          ${DEVICE_OPTIONS.map((d) => this.pill(`data-device="${d.id}"`, d.label, d.sub, s.jsoundDeviceProfile === d.id)).join('')}
        </div>
        <p class="hint-text">イヤホンなら立体音響、スマホ本体なら「仮想低音」で小さなスピーカーでも太鼓の迫力が出ます（JSound Engin 1.6）。</p>`
      ) +
      this.section(
        'すぐに使う',
        '',
        `<div class="quick-grid">
          <button class="quick-tile" id="qa-photo">${ICON.photo5k}<span>5K写真を保存</span></button>
          <button class="quick-tile" id="qa-pv">${ICON.pv}<span>${this.pvState.active ? 'PVを止める' : 'PVを見る'}</span></button>
          <button class="quick-tile" id="qa-camera">${ICON.camera}<span>カメラ切替<small>${CAMERA_STYLE_SPECS[s.cameraStyle].shortJp}</small></span></button>
          <button class="quick-tile" id="qa-fullscreen">${this.isImmersiveFs ? ICON.fullscreenExit : ICON.fullscreenEnter}<span>${this.isImmersiveFs ? '全画面を解除' : '全画面にする'}</span></button>
          <button class="quick-tile" id="qa-inspector">${ICON.inspector}<span>AIの読み・公正性</span></button>
          <button class="quick-tile" id="qa-help">${ICON.help}<span>遊び方</span></button>
        </div>`
      ) +
      this.section(
        '手を拡大して観察',
        'FINGER S1.1',
        `<div class="pill-grid cols-3">
          ${this.pill('data-micro-focus="player_nail"', '爪・甘皮', '42×', false)}
          ${this.pill('data-micro-focus="player_fingerprint"', '指紋・汗孔', '75×', false)}
          ${this.pill('data-micro-focus="ultra_cell"', '角質細胞', '320×', false)}
        </div>
        <p class="hint-text">拡大するほど細部が増えます：2.5×でHDテクスチャ＋2倍メッシュ、12×で角質細胞、90×で17µmの微細構造。</p>`
      ) +
      this.section(
        '舞台',
        `${STAGE_LIST.length}つの建築`,
        `<div class="stage-visual-grid">
          ${STAGE_LIST.map(
            (st) => `<button class="stage-thumb-card ${s.stage === st.id ? 'active' : ''}" data-stage="${st.id}" aria-pressed="${s.stage === st.id}">
              <div class="stage-thumb-img" style="background-image:url('${st.previewTexture}')"></div>
              <div class="stage-thumb-overlay"><div class="st-name">${st.nameJp}</div><div class="st-sub">${st.subtitleJp}</div></div>
            </button>`
          ).join('')}
        </div>`
      )
    );
  }

  private tabMatch(): string {
    const fmtOptions: Array<{ v: MatchFormat; label: string }> = [
      { v: 'bo5', label: '3本先取' },
      { v: 'bo9', label: '5本先取' },
      { v: 'endless', label: '無制限' },
    ];
    const psycho = this.lastPsychoTelemetry;
    return (
      this.section(
        '対局モード',
        GAME_MODE_OPTIONS.find((g) => g.id === this.gameMode)?.label ?? '',
        `<div class="mode-list">
          ${GAME_MODE_OPTIONS.map(
            (gm) => `<button class="mode-row ${this.gameMode === gm.id ? 'active' : ''}" data-gmode="${gm.id}" aria-pressed="${this.gameMode === gm.id}">
              <span class="mode-name">${gm.label}</span><span class="mode-sub">${gm.sub}</span></button>`
          ).join('')}
        </div>
        ${
          this.gameMode === 'classic' || this.gameMode === 'blitz'
            ? `<div class="pill-grid cols-3" style="margin-top:8px">${fmtOptions
                .map((f) => this.pill(`data-fmt="${f.v}"`, f.label, '', this.matchFormat === f.v))
                .join('')}</div>`
            : ''
        }
        <button class="pill-btn full-pill" id="btn-drawer-reset"><span>↺ 最初からやり直す</span></button>`
      ) +
      this.section(
        '相手AIの性格',
        'JNV1.0',
        `<div class="persona-grid">
          ${JNV_PERSONA_LIST.map(
            (p) => `<button class="persona-card ${this.currentPersona === p.id ? 'active' : ''}" data-persona="${p.id}" aria-pressed="${this.currentPersona === p.id}">
              <div class="p-code">${p.code}</div><div class="p-name">${p.nameJp}</div></button>`
          ).join('')}
        </div>
        <div class="finger-s1-caption" id="live-psycho-chip">${psycho ? `あなたの傾向：${psycho.playerTendencyJp}（情報量 ${psycho.shannonEntropyBits.toFixed(2)} bit）` : '対局するとAIがあなたのクセを分析します'}</div>
        <button class="pill-btn full-pill" id="btn-open-inspector"><span>AIの読み・公正性の証明を見る</span></button>`
      )
    );
  }

  private tabSound(): string {
    const s = this.currentSettings;
    const m = this.lastMetrics;
    const spatial: Array<{ v: JSoundSpatialMode; label: string; sub: string }> = [
      { v: '4d_audio_x', label: '4D X', sub: '最も立体的' },
      { v: '4d_audio_max', label: '4D MAX', sub: '頭上・重低音' },
      { v: '4d_audio', label: '4D', sub: '包まれる' },
      { v: 'binaural_3d', label: '立体3D', sub: '自然な立体' },
      { v: 'studio_wide', label: '広域', sub: '広がり重視' },
      { v: 'focused', label: '集中', sub: '定位くっきり' },
    ];
    return (
      this.section(
        'JSound Engin 1.6',
        '新技術',
        `<div class="metric-grid" id="live-jsound16-card">${this.jsound16CardHtml(m)}</div>
        <p class="hint-text">決着の瞬間に鳴る太鼓・鈴・衝突音を別スレッドで先に作っておくため、画面が止まらず音もぴったり鳴ります。音割れを防ぐ真のピーク・リミッター、3バンド処理、仮想低音を搭載。</p>`,
        'hero-section'
      ) +
      this.section(
        '音の出力先',
        '',
        `<div class="pill-grid cols-4">${DEVICE_OPTIONS.map((d) => this.pill(`data-device="${d.id}"`, d.label, d.sub, s.jsoundDeviceProfile === d.id)).join('')}</div>`
      ) +
      this.section(
        '立体音響モード',
        this.formatSpatialTag(s.jsoundSpatialMode),
        `<div class="pill-grid cols-3">${spatial.map((sp) => this.pill(`data-spatial="${sp.v}"`, sp.label, sp.sub, s.jsoundSpatialMode === sp.v)).join('')}</div>`
      ) +
      this.section(
        '音質',
        s.jsoundQuality === 'ultra' ? '最高' : s.jsoundQuality === 'pro' ? '高' : '軽量',
        `<div class="pill-grid cols-3">
          ${this.pill('data-jsound="ultra"', '最高', '768kHz処理', s.jsoundQuality === 'ultra')}
          ${this.pill('data-jsound="pro"', '高', '192kHz処理', s.jsoundQuality === 'pro')}
          ${this.pill('data-jsound="lite"', '軽量', '省電力', s.jsoundQuality === 'lite')}
        </div>
        <div class="pill-grid cols-2" style="margin-top:6px">
          ${this.pill('id="btn-jsound-ambience"', s.jsoundAmbience ? '✓ 環境音 ON' : '環境音 OFF', '風鈴・水琴窟など', s.jsoundAmbience)}
          ${this.pill('id="btn-jsound-sympathetic"', s.jsoundSympathetic ? '✓ 共鳴 ON' : '共鳴 OFF', '13弦の響き', s.jsoundSympathetic)}
        </div>`
      ) +
      this.section(
        '和楽器を試聴',
        `${AUDITION_INSTRUMENTS.length}種`,
        `<div class="audition-grid cols-4">${AUDITION_INSTRUMENTS.map((inst) => `<button class="audition-btn" data-audition="${inst.id}">${inst.label}</button>`).join('')}</div>`
      ) +
      this.section('リアルタイム計測', '', `<div class="metric-grid" id="live-jsound-stats">${this.jsoundStatsHtml(m)}</div>`)
    );
  }

  private tabHands(): string {
    const s = this.currentSettings;
    const m = this.lastMetrics;
    return (
      this.section(
        'FINGER S1.1 ズーム連動ディテール',
        s.fingerS1Enabled && s.fingerS11Enabled ? 'ON' : 'OFF',
        `<div id="live-s11-card">${this.s11CardHtml(m)}</div>
        <div class="pill-grid cols-2" style="margin-top:6px">
          ${this.pill('id="btn-toggle-s11"', s.fingerS11Enabled ? '✓ S1.1 ズーム連動HD' : 'S1.1 OFF', '2倍テクスチャ・2倍メッシュ', s.fingerS1Enabled && s.fingerS11Enabled)}
          ${this.pill(`data-fingers1="${s.fingerS1Enabled ? 'off' : 'on'}"`, s.fingerS1Enabled ? '✓ 極写実造形 ON' : '極写実造形 OFF', s.fingerS1Enabled ? 'タップでクラシック' : 'タップでFINGER S1', s.fingerS1Enabled)}
          ${this.pill('id="btn-toggle-derma"', s.dermaTensorEnabled ? '✓ 皮膚の動き ON' : '皮膚の動き OFF', '腱・しわ (Derma-Tensor)', s.fingerS1Enabled && s.dermaTensorEnabled)}
          ${this.pill('id="btn-toggle-chroma"', s.chromaDermEnabled ? '✓ 肌の光学 ON' : '肌の光学 OFF', '血色・産毛・爪 (Chroma-Derm)', s.fingerS1Enabled && s.chromaDermEnabled)}
        </div>`,
        'hero-section'
      ) +
      this.section(
        '顕微鏡で観察',
        '0.2×〜5000×',
        `<div class="pill-grid cols-3">
          ${this.pill('data-micro-focus="player_nail"', '爪・甘皮', '42×', false)}
          ${this.pill('data-micro-focus="player_tendon"', '皮下腱・産毛', '18×', false)}
          ${this.pill('data-micro-focus="player_fingerprint"', '指紋・汗孔', '75×', false)}
          ${this.pill('data-micro-focus="npc_joint"', '真鍮関節', '26×', false)}
          ${this.pill('data-micro-focus="ultra_cell"', '角質細胞', '320×', false)}
          ${this.pill('data-micro-focus="reset"', '↺ 戻す', '1.0×', false)}
        </div>
        <p class="hint-text">スマホは2本指で広げて拡大・1本指で回転・2本指で移動。PCはホイールで拡大、右ドラッグで移動。</p>`
      ) +
      this.section('皮膚の計測', '', `<div class="metric-grid" id="live-handdetail-stats">${this.handDetailStatsHtml(m)}</div>`) +
      this.section(
        '手の素材',
        '',
        `<div class="swatch-row-label">あなた</div>
        <div class="swatch-grid">${HAND_MATERIAL_OPTIONS.map(
          (opt) => `<button class="swatch-btn ${opt.hero ? 'hero-swatch' : ''} ${s.playerHandMaterial === opt.id ? 'active' : ''}" data-pmat="${opt.id}" aria-pressed="${s.playerHandMaterial === opt.id}"><span class="swatch-dot" style="background:${opt.swatch}"></span><span>${opt.label}</span></button>`
        ).join('')}</div>
        <div class="swatch-row-label">相手 (JNV1.0)</div>
        <div class="swatch-grid">${HAND_MATERIAL_OPTIONS.map(
          (opt) => `<button class="swatch-btn ${opt.hero ? 'hero-swatch' : ''} ${s.npcHandMaterial === opt.id ? 'active' : ''}" data-nmat="${opt.id}" aria-pressed="${s.npcHandMaterial === opt.id}"><span class="swatch-dot" style="background:${opt.swatch}"></span><span>${opt.label}</span></button>`
        ).join('')}</div>`
      ) +
      this.section(
        '手の動き (JHand Kinesis 1.1)',
        '38-DOF',
        `<div class="pill-grid cols-3">
          ${this.pill('data-jhand="biomech_ultra"', '極 38-DOF', '最も滑らか', s.jhandMode === 'biomech_ultra')}
          ${this.pill('data-jhand="biomech_pro"', '27-DOF', '軽量', s.jhandMode === 'biomech_pro')}
          ${this.pill('data-jhand="standard"', '21-DOF', '最軽量', s.jhandMode === 'standard')}
        </div>
        <div class="swatch-row-label">ポーズを試す（${HAND_POSE_CATALOG.length}種）</div>
        <div class="pose-gallery-grid">${HAND_POSE_CATALOG.map((pose, idx) => `<button class="pose-chip-btn" data-pose-idx="${idx}" title="${pose.labelJp}">${pose.labelJp}</button>`).join('')}</div>
        <div class="metric-grid" id="live-jhand-stats">${this.jhandStatsHtml(m)}</div>`
      )
    );
  }

  private tabVisual(): string {
    const s = this.currentSettings;
    const fpsOptions: Array<{ v: FpsLimitMode; label: string }> = [
      { v: 60, label: '60 FPS' },
      { v: 120, label: '120 FPS' },
      { v: 0, label: '無制限' },
    ];
    const sfOptions: Array<{ v: ShadowFlameMode; label: string; sub: string }> = [
      { v: 'standard', label: '標準', sub: '最軽量' },
      { v: 'flash', label: '高品質', sub: 'Flash' },
      { v: 'pro', label: '最高', sub: 'Pro' },
    ];
    return (
      this.section(
        '解像度',
        s.resolution.toUpperCase(),
        `<div class="pill-grid cols-4">${RESOLUTION_LIST.map((r) => this.pill(`data-res="${r.id}"`, r.label, `${r.nominalHeight}p`, s.resolution === r.id)).join('')}</div>`
      ) +
      this.section(
        'フレームレート',
        '',
        `<div class="pill-grid cols-3">${fpsOptions.map((f) => this.pill(`data-fps="${f.v}"`, f.label, '', s.fpsLimit === f.v)).join('')}</div>`
      ) +
      this.section(
        '影 (Shadow Flame 1.0)',
        SHADOW_FLAME_SPECS[s.shadowFlame].shortLabel,
        `<div class="pill-grid cols-3">${sfOptions.map((sf) => this.pill(`data-sf="${sf.v}"`, sf.label, sf.sub, s.shadowFlame === sf.v)).join('')}</div>`
      ) +
      this.section(
        '色と明るさ (KHDR 1.1)',
        s.khdrEnabled ? 'ON' : 'OFF',
        `<div class="pill-grid cols-3">
          ${this.pill('data-khdr="on"', 'ON', 'おすすめ', s.khdrEnabled)}
          ${this.pill('data-khdr="off"', 'OFF', '標準SDR', !s.khdrEnabled)}
          ${this.pill('id="btn-khdr-split"', '比較', '左右で見比べ', s.khdrSplitCompare)}
        </div>`
      ) +
      this.section(
        'カメラ',
        CAMERA_STYLE_SPECS[s.cameraStyle].labelJp,
        `<div class="pill-grid cols-3">${CAMERA_STYLE_LIST.map((c) => this.pill(`data-cam="${c.id}"`, c.shortJp, '', s.cameraStyle === c.id)).join('')}</div>
        <p class="hint-text">${CAMERA_STYLE_SPECS[s.cameraStyle].descriptionJp}</p>`
      ) +
      this.section(
        '画面の表示',
        '',
        `<div class="pill-grid cols-2">
          ${this.pill('data-uicom="0"', '標準サイズ', '', !s.compactUi)}
          ${this.pill('data-uicom="1"', 'コンパクト', '3Dを広く見る', s.compactUi)}
        </div>
        <button class="pill-btn full-pill ${this.showHudTelemetry ? 'active' : ''}" id="btn-toggle-telemetry"><span>${this.showHudTelemetry ? '✓ FPS表示中' : 'FPSを画面に表示'}</span></button>`
      )
    );
  }

  private tabCapture(): string {
    const p5k = this.lastPhoto5K;
    const pv = this.photoVerifyResult;
    const verifyHtml = pv
      ? `<div class="proof-verify-card ${pv.valid ? 'valid' : 'invalid'}">
           <div class="pv-status">${pv.reasonJp}</div>
           ${
             pv.record
               ? `<div class="pv-meta">${pv.width}×${pv.height} · ${pv.bitDepth * 3}bit · ${pv.record.khdrVersion}<br/>
                  舞台: ${pv.record.stageNameJp} · BPM ${pv.record.bioPulseBpm}<br/>
                  JNV-SEAL: <code>${pv.record.sealSha256.slice(0, 22)}…</code></div>`
               : ''
           }
         </div>`
      : '';
    return (
      this.section(
        '5K写真',
        '5120×2880 · 48bit PNG',
        `<button class="pill-btn full-pill active hero-photo-btn" id="btn-drawer-photo-5k" ${this.isCapturing5K ? 'disabled' : ''}>
          <span>${this.isCapturing5K ? '撮影中…' : '◎ 今の視点を5K写真で保存 (K)'}</span>
        </button>
        <p class="hint-text">UIを消して、今のカメラ視点をそのまま高画質PNGで保存します。改ざんを検出できる暗号の証明付き。</p>
        ${
          p5k
            ? `<div class="proof-last-chip">直近: ${p5k.width}×${p5k.height} · ${(p5k.byteLength / (1024 * 1024)).toFixed(1)}MB${
                p5k.downloadUrl ? ` · <a href="${p5k.downloadUrl}" download="${p5k.filename}">↓ もう一度保存</a>` : ''
              }</div>`
            : ''
        }
        <label class="pill-btn full-pill verify-upload-btn" for="input-verify-5k-png"><span>✓ 保存した写真の改ざんチェック</span></label>
        <input type="file" id="input-verify-5k-png" accept="image/png" hidden />
        ${verifyHtml}`,
        'hero-section'
      ) +
      this.section(
        'PV（紹介映像）',
        '2.35:1 WebM',
        `<div class="pill-grid cols-2">
          ${this.pill('data-start-pv="grand_trailer" data-rec="0"', '▶ 公式PVを見る', '全6幕 · 26秒', false)}
          ${this.pill('data-start-pv="grand_trailer" data-rec="1"', '● PVを録画', '映像＋音を保存', false)}
          ${this.pill('data-start-pv="battle_reel" data-rec="0"', '激闘リール', '16秒', false)}
          ${this.pill('data-start-pv="craft_showcase" data-rec="0"', '工芸・音響', '18秒', false)}
        </div>
        <button class="pill-btn full-pill" id="btn-drawer-snap"><span>高速スクリーンショット (1920×1080)</span></button>`
      )
    );
  }

  private tabStats(): string {
    const s = this.currentSettings;
    const m = this.lastMetrics;
    return (
      this.section(
        'KIWAMI MOBILE CORE',
        this.deviceDecision?.isPocoF7Class ? 'POCO F7' : '',
        `<div class="metric-grid" id="live-perf-card">${this.perfCardHtml(m)}</div>
        <p class="hint-text">${m ? m.perfReasonJp : ''}${m && m.perfShaderPrewarmMs ? ` · シェーダー事前コンパイル ${m.perfShaderPrewarmMs}ms` : ''}</p>`
      ) +
      this.section('描画', '', `<div class="metric-grid" id="live-gpu-stats">${this.gpuStatsHtml(m)}</div>`) +
      this.section('音響 (JSound 1.6)', '', `<div class="metric-grid" id="live-jsound16-card">${this.jsound16CardHtml(m)}</div><div class="metric-grid" id="live-jsound-stats" style="margin-top:6px">${this.jsoundStatsHtml(m)}</div>`) +
      this.section(
        'KIWAMI-NEXT 実験機能',
        '',
        `<div class="pill-grid cols-3">
          ${this.pill('id="btn-toggle-biopulse"', '心拍', '脈・白化', s.bioPulseEnabled)}
          ${this.pill('id="btn-toggle-aerovortex"', '空気の渦', '花びらが舞う', s.aeroVortexEnabled)}
          ${this.pill('id="btn-toggle-acousticprobe"', '音の距離感', 'カメラ連動', s.acousticProbeEnabled)}
        </div>
        <div class="metric-grid" id="live-nexttech-stats" style="margin-top:6px">${this.nextTechStatsHtml(m)}</div>`
      )
    );
  }

  private bindStudioEvents(): void {
    const body = this.graphicsBodyEl;
    const on = (sel: string, fn: (b: HTMLButtonElement) => void): void => {
      body.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    };
    const one = (sel: string, fn: () => void): void => {
      body.querySelector(sel)?.addEventListener('click', fn);
    };

    on('[data-qpreset]', (b) => this.handlers.onApplyQualityPreset(b.dataset.qpreset as QualityPresetId | 'device'));
    one('#btn-toggle-adaptive', () => this.handlers.onToggleAdaptivePerformance(!this.currentSettings.adaptivePerformance));
    one('#btn-toggle-haptics', () => {
      const next = !this.hapticsOn;
      if (next) vibrate(12);
      this.handlers.onToggleHaptics(next);
    });
    on('[data-device]', (b) => this.handlers.onChangeJSoundDeviceProfile(b.dataset.device as JSoundDeviceProfileSetting));
    one('#qa-photo', () => {
      this.closeDrawers();
      void this.trigger5KPhotoCapture();
    });
    one('#qa-pv', () => this.togglePV());
    one('#qa-camera', () => this.handlers.onCycleCameraStyle());
    one('#qa-fullscreen', () => void this.toggleFullscreen());
    one('#qa-inspector', () => this.openInspector(true));
    one('#qa-help', () => this.openGuide());
    one('#btn-open-inspector', () => this.openInspector(true));

    on('[data-micro-focus]', (b) => {
      const preset = b.dataset.microFocus as MicroscopeFocusPreset;
      this.handlers.onFocusMicroscope(preset);
      if (preset !== 'reset') this.closeDrawers();
    });
    on('[data-stage]', (b) => this.handlers.onChangeStage(b.dataset.stage as StageId));
    on('[data-gmode]', (b) => {
      this.gameMode = b.dataset.gmode as GameModeId;
      this.handlers.onChangeGameMode(this.gameMode);
      this.markStudioDirty();
    });
    on('[data-fmt]', (b) => {
      this.matchFormat = b.dataset.fmt as MatchFormat;
      this.handlers.onChangeMatchFormat(this.matchFormat);
      this.markStudioDirty();
    });
    one('#btn-drawer-reset', () => {
      this.closeMatchModal();
      this.handlers.onResetMatch();
      this.closeDrawers();
    });
    on('[data-persona]', (b) => {
      this.handlers.onChangePersona(b.dataset.persona as JNVPersonaId);
      this.markStudioDirty();
    });

    on('[data-spatial]', (b) => this.handlers.onChangeJSoundSpatialMode(b.dataset.spatial as JSoundSpatialMode));
    on('[data-jsound]', (b) => this.handlers.onChangeJSoundQuality(b.dataset.jsound as JSoundModeSetting));
    one('#btn-jsound-ambience', () => this.handlers.onToggleJSoundAmbience(!this.currentSettings.jsoundAmbience));
    one('#btn-jsound-sympathetic', () => this.handlers.onToggleJSoundSympathetic(!this.currentSettings.jsoundSympathetic));
    on('[data-audition]', (b) => {
      this.pulseEl(b, 'struck');
      this.handlers.onAuditionSound(b.dataset.audition as AuditionInstrumentId);
    });

    one('#btn-toggle-s11', () => this.handlers.onToggleFingerS11(!this.currentSettings.fingerS11Enabled));
    on('[data-fingers1]', (b) => this.handlers.onToggleFingerS1(b.dataset.fingers1 === 'on'));
    one('#btn-toggle-derma', () => this.handlers.onToggleDermaTensor(!this.currentSettings.dermaTensorEnabled));
    one('#btn-toggle-chroma', () => this.handlers.onToggleChromaDerm(!this.currentSettings.chromaDermEnabled));
    on('[data-pmat]', (b) => this.handlers.onChangeHandMaterials(b.dataset.pmat as HandMaterialPreset, this.currentSettings.npcHandMaterial));
    on('[data-nmat]', (b) => this.handlers.onChangeHandMaterials(this.currentSettings.playerHandMaterial, b.dataset.nmat as HandMaterialPreset));
    on('[data-jhand]', (b) => this.handlers.onChangeJHandMode(b.dataset.jhand as JHandModeSetting));
    on('[data-pose-idx]', (b) => {
      const item = HAND_POSE_CATALOG[Number(b.dataset.poseIdx)];
      if (!item) return;
      this.pulseEl(b, 'struck');
      this.handlers.onPreviewPose(item.key);
    });

    on('[data-res]', (b) => {
      this.activePreset = null;
      this.handlers.onChangeResolution(b.dataset.res as ResolutionPresetId);
    });
    on('[data-fps]', (b) => this.handlers.onChangeFpsLimit(Number(b.dataset.fps) as FpsLimitMode));
    on('[data-sf]', (b) => this.handlers.onChangeShadowFlame(b.dataset.sf as ShadowFlameMode));
    on('[data-khdr]', (b) => this.handlers.onToggleKHDR(b.dataset.khdr === 'on'));
    one('#btn-khdr-split', () => this.handlers.onToggleKHDRSplit(!this.currentSettings.khdrSplitCompare));
    on('[data-cam]', (b) => this.handlers.onChangeCameraStyle(b.dataset.cam as CameraStyleId));
    on('[data-uicom]', (b) => this.handlers.onToggleCompactUi(b.dataset.uicom === '1'));
    one('#btn-toggle-telemetry', () => {
      this.showHudTelemetry = !this.showHudTelemetry;
      if (this.lastMetrics) this.updateRenderMetrics(this.lastMetrics);
      this.markStudioDirty();
    });

    one('#btn-drawer-photo-5k', () => {
      this.closeDrawers();
      void this.trigger5KPhotoCapture();
    });
    const verifyInput = body.querySelector<HTMLInputElement>('#input-verify-5k-png');
    verifyInput?.addEventListener('change', async () => {
      const file = verifyInput.files?.[0];
      if (!file) return;
      this.showPhotoToast('写真を検証中…', true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        this.photoVerifyResult = await verify5KPhotoProofPng(bytes);
        this.showPhotoToast(this.photoVerifyResult.reasonJp);
      } catch {
        this.photoVerifyResult = null;
        this.showPhotoToast('PNGの読み込みに失敗しました');
      }
      this.markStudioDirty();
    });
    on('[data-start-pv]', (b) => {
      this.closeDrawers();
      this.handlers.onStartPV(b.dataset.startPv as PVModeId, b.dataset.rec === '1');
    });
    one('#btn-drawer-snap', () => this.handlers.onCaptureSnapshot());

    one('#btn-toggle-biopulse', () => this.handlers.onToggleBioPulse(!this.currentSettings.bioPulseEnabled));
    one('#btn-toggle-aerovortex', () => this.handlers.onToggleAeroVortex(!this.currentSettings.aeroVortexEnabled));
    one('#btn-toggle-acousticprobe', () => this.handlers.onToggleAcousticProbe(!this.currentSettings.acousticProbeEnabled));
  }

  // ===========================================================================
  // RIGHT DRAWER: JNV1.0 + J-PSYCHO-NET 1.0 INSPECTOR
  // ===========================================================================
  private renderInspectorDrawer(): void {
    const t = this.lastTelemetry;
    const seal = this.currentSeal;
    const psycho = this.lastPsychoTelemetry;

    const personaHtml = JNV_PERSONA_LIST.map(
      (p) => `<button class="persona-card ${this.currentPersona === p.id ? 'active' : ''}" data-persona="${p.id}" aria-pressed="${this.currentPersona === p.id}">
        <div class="p-code">${p.code}</div><div class="p-name">${p.nameJp}</div></button>`
    ).join('');

    const predEntropy = t ? -t.predictedPlayerDist.reduce((acc, p) => (p > 1e-6 ? acc + p * Math.log2(p) : acc), 0) : 0;

    const psychoHtml = psycho
      ? this.section(
          'あなたの傾向（情報理論）',
          psycho.dominantExpertJp,
          `<div class="jnv-verdict-chip">${psycho.playerTendencyJp}</div>
          <div class="metric-grid" style="margin-top:6px">
            ${this.metric('シャノン情報量 H(X)', `${psycho.shannonEntropyBits.toFixed(3)} bit`, 'gold')}
            ${this.metric('KLダイバージェンス', `${psycho.klDivergenceBits.toFixed(3)} bit`)}
            ${this.metric('読まれやすさ', `${psycho.predictabilityPct}%`)}
            ${this.metric('解析した局数', `${psycho.roundsAnalyzed}局`)}
          </div>`
        )
      : '';

    const telemetryHtml = t
      ? this.section(
          `直前の第${t.round}局の読み`,
          `${t.activeExpertCount}専門家`,
          `<div class="jnv-verdict-chip">${t.insightJp}</div>
          <div class="prob-bar-list">
            ${([ROCK, SCISSORS, PAPER] as Move[])
              .map((m) => {
                const pct = Math.round(t.predictedPlayerDist[m] * 100);
                const isActual = t.actualPlayerMove === m;
                return `<div class="prob-row"><span class="prob-lbl">${MOVE_META[m].jp}${isActual ? '★' : ''}</span>
                  <div class="prob-track"><div class="prob-fill ${isActual ? 'actual' : ''}" style="width:${pct}%"></div></div>
                  <span class="prob-val">${pct}%</span></div>`;
              })
              .join('')}
          </div>
          <div class="metric-grid" style="margin-top:8px">
            ${this.metric('ナッシュ混合 β', `${Math.round(t.nashBlendBeta * 100)}%`)}
            ${this.metric('変化の激しさ', `${Math.round(t.volatilityIndex * 100)}%`, t.driftDetected ? 'warn' : '')}
            ${this.metric('予測エントロピー', predEntropy.toFixed(2))}
            ${this.metric('AIの隙', `${Math.round(t.selfExploitability * 100)}%`, t.selfExploitability > 0.45 ? 'warn' : 'good')}
          </div>`
        ) +
        this.section(
          '上位の専門家',
          'Fixed-Share',
          `<div class="expert-list">${t.topExperts
            .slice(0, 5)
            .map(
              (ex) => `<div class="expert-row"><div class="ex-top"><span class="ex-name">${ex.labelJp}</span><span class="ex-meta">M${ex.metaLevel} · ${(ex.weight * 100).toFixed(1)}%</span></div>
              <div class="ex-bar"><div class="ex-bar-fill" style="width:${Math.min(100, ex.weight * 320)}%"></div></div></div>`
            )
            .join('')}</div>`
        ) +
        this.section(
          'あなたの行動',
          t.profile.dominantHabitJp,
          `<div class="metric-grid">
            ${this.metric('勝った後に同じ手', `${Math.round(t.profile.winStayRate * 100)}%`)}
            ${this.metric('負けた後に変える', `${Math.round(t.profile.loseShiftRate * 100)}%`)}
            ${this.metric('あいこ後に変える', `${Math.round(t.profile.drawChangeRate * 100)}%`)}
            ${this.metric('考える時間', `${Math.round(t.profile.avgLatencyMs)}ms`)}
          </div>`
        )
      : '';

    const benchHtml = this.benchmarkCache
      ? `<table class="bench-table"><thead><tr><th>対戦AI</th><th>勝率</th><th>純点/100</th><th>封印</th></tr></thead><tbody>
          ${this.benchmarkCache
            .map(
              (r) => `<tr><td>${r.botNameJp.split('（')[0]}</td><td class="num ${r.decisiveWinRate >= 0.65 ? 'strong' : ''}">${(r.decisiveWinRate * 100).toFixed(1)}%</td>
              <td class="num">${r.netEdgePer100 >= 0 ? '+' : ''}${r.netEdgePer100.toFixed(1)}</td><td class="num strong">${r.allSealsVerified ? '✓' : '✗'}</td></tr>`
            )
            .join('')}
        </tbody></table>`
      : '';

    this.inspectorBodyEl.innerHTML = `
      ${this.section('公正性の証明（後出しなし）', 'SHA-256', `
        <div class="seal-box">
          <div class="seal-row">第${seal?.round ?? 1}局：相手の手の封印（暗号ハッシュ）</div>
          <div class="seal-hash">${seal?.hashHex ?? '生成中…'}</div>
          ${t?.seal ? `<div class="seal-verified">✓ 第${t.round}局：開示した手（${MOVE_META[t.chosenNpcMove].jp}）が封印と一致</div>` : ''}
        </div>
        <p class="hint-text">相手AIはあなたが選ぶ前に手を決め、その答えを暗号で封印しています。勝負後に封印を開けて一致を確認できます。</p>`)}
      ${this.section('相手AIの性格', '7層推論', `<div class="persona-grid">${personaHtml}</div>`)}
      ${psychoHtml}
      ${telemetryHtml}
      ${this.section('数学ベンチマーク', '1,600局', `<button class="pill-btn full-pill" id="btn-run-bench"><span>${this.benchmarkCache ? '再実行 (8種×200局)' : 'ベンチマーク実行 (8種×200局)'}</span></button>${benchHtml}`)}
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
