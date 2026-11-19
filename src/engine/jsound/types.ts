/**
 * ★ JSound Engin 1.3 — 384kHz 8×OS Ultra-Clarity Zero-Jitter Physical-Modeling & 3D Spatial Engine ★
 *
 * Upgraded v1.3 acoustic architecture (zero external audio files):
 *  - 3 High-Speed Ultra-Clarity Quality Tiers:
 *      · `ultra`: 384 kHz 8× Cascade 23-Tap Kaiser(8.2) FIR (-86.5 dB) + 24 modes + 5th-Order 230-Ray 3D IR + 6-Band Velvet-Noise + HRTF/Doppler
 *      · `pro`  : 192 kHz 4× Cascade 23-Tap Kaiser FIR + 16 modes + 4th-Order 128-Ray 3D IR + HRTF/Doppler
 *      · `lite` : 96 kHz 2× Kaiser FIR + 10 modes + 2nd-Order 24-Ray IR + fast stereo
 *  - 42 Physically Calibrated Acoustic Materials (+10 new Gagaku, Noh, Zen garden & craft materials)
 *  - 26 Pure-Physical-Modeling Instruments & World Soundscape Actors (24 interactive in Studio Deck!)
 *  - Multi-Variant Round-Robin LRU Acoustic Buffer Cache for sub-millisecond zero-stutter playback
 *  - 3 Selectable 3D Spatial Imaging Modes (`binaural_3d`, `studio_wide`, `focused`) + 14-Stage Crystal Air Mastering
 */

import { HandMaterialPreset, StageId } from '../../graphics/GraphicsConfig';

export type JSoundQualityMode = 'ultra' | 'pro' | 'lite';
export type JSoundSpatialMode = 'binaural_3d' | 'studio_wide' | 'focused';

export type AuditionInstrumentId =
  | 'taiko'
  | 'otsuzumi'
  | 'kotsuzumi'
  | 'kakko'
  | 'koto'
  | 'shamisen'
  | 'biwa'
  | 'ichigenkin'
  | 'shakuhachi'
  | 'shinobue'
  | 'ryuteki'
  | 'hichiriki'
  | 'sho'
  | 'horagai'
  | 'rin_bell'
  | 'bonsho'
  | 'dora'
  | 'atarigane'
  | 'mokugyo'
  | 'hyoshigi'
  | 'furin'
  | 'sensu'
  | 'shishi_odoshi'
  | 'suikinkutsu';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface JSoundSettings {
  enabled: boolean;
  quality: JSoundQualityMode;
  spatialMode: JSoundSpatialMode;
  ambienceEnabled: boolean;
  masterVolume: number; // 0..1
}

export interface JSoundTelemetry {
  engineName: string;
  enabled: boolean;
  quality: JSoundQualityMode;
  spatialMode: JSoundSpatialMode;
  ambienceEnabled: boolean;
  stageId: StageId;
  stageRt60Sec: number;
  earlyRayCount: number;
  internalDspRateHz: number;
  oversamplingFactor: number;
  soundCatalogCount: number;
  instrumentCount: number;
  materialCount: number;
  cacheHitRatePct: number;
  activeVoices: number;
  sampleRate: number;
  peakDb: number;
  rmsDb: number;
  materialPairJp: string;
  lastAcousticEventJp: string;
}

export interface ModalSpec {
  /** Base fundamental frequency in Hz */
  fundamentalHz: number;
  /** Inharmonic eigenmode frequency ratios relative to fundamental */
  ratios: number[];
  /** Relative amplitude per mode */
  amps: number[];
  /** Base decay time constant tau (seconds) per mode */
  decays: number[];
  /** Hertzian contact pulse duration at moderate velocity (ms): smaller = harder contact */
  contactMs: number;
  /** High-frequency micro-asperity surface grain 0..1 */
  surfaceGrain: number;
  /** Optional beating doublet split in Hz (for hand-hammered bronze, glass & porcelain) */
  doubletSplitHz?: number;
  /** Sub-body air/cavity Helmholtz resonance frequency in Hz */
  bodyHz?: number;
  /** Nonlinear impact tension pitch-glide fraction (e.g. 0.015 = +1.5% initial strike pitch lift) */
  pitchGlideAmt?: number;
  /** Nonlinear pitch-glide relaxation time constant in ms */
  pitchGlideMs?: number;
  /** True stereo dipole radiation width 0..1 (odd/even modal panning) */
  stereoParity?: number;
  /** Japanese craft display label */
  labelJp: string;
}

export interface SleeveFabricProfile {
  id: 'silk_kimono' | 'emerald_velvet' | 'brocade_crimson' | 'lacquer_armband';
  labelJp: string;
  roughness: number;
  silkFreqMult: number;
  airBodyGain: number;
  rustleQ: number;
}

export const HAND_SLEEVE_PROFILES: Record<HandMaterialPreset, SleeveFabricProfile> = {
  living_skin: {
    id: 'silk_kimono',
    labelJp: '正絹羽織袖',
    roughness: 0.88,
    silkFreqMult: 1.28,
    airBodyGain: 0.5,
    rustleQ: 3.0,
  },
  hinoki_ivory: {
    id: 'silk_kimono',
    labelJp: '正絹着物',
    roughness: 0.86,
    silkFreqMult: 1.24,
    airBodyGain: 0.48,
    rustleQ: 2.9,
  },
  karakuri_bronze: {
    id: 'emerald_velvet',
    labelJp: '天鵞絨袖',
    roughness: 0.56,
    silkFreqMult: 0.72,
    airBodyGain: 0.74,
    rustleQ: 1.75,
  },
  bisque_porcelain: {
    id: 'brocade_crimson',
    labelJp: '金襴緞子',
    roughness: 0.94,
    silkFreqMult: 1.08,
    airBodyGain: 0.62,
    rustleQ: 2.4,
  },
  obsidian_gold: {
    id: 'lacquer_armband',
    labelJp: '漆塗袖',
    roughness: 0.42,
    silkFreqMult: 1.38,
    airBodyGain: 0.44,
    rustleQ: 3.4,
  },
};

export type AcousticMaterialId =
  | HandMaterialPreset
  | 'chabudai_oak'
  | 'marble_brass'
  | 'cedar_vermilion'
  | 'limestone_travertine'
  | 'brick_iron'
  | 'go_stone_ivory'
  | 'go_stone_bronze'
  | 'hyoshigi_rosewood'
  | 'rin_temple_bell'
  | 'bonsho_bronze_bell'
  | 'clockwork_escapement'
  | 'bamboo_shishi_odoshi'
  | 'furin_edo_glass'
  | 'suzu_brass_bell'
  | 'ivory_nail'
  | 'porcelain_nail'
  | 'bronze_nail'
  | 'pendulum_clock_tick'
  | 'hearth_charcoal_pop'
  | 'cedar_eave_creak'
  | 'tsugaru_shamisen_body'
  | 'biwa_mulberry_body'
  | 'sho_bamboo_reed'
  | 'mokugyo_camphor'
  | 'katana_tamahagane'
  | 'kane_chanchiki'
  | 'sensu_bamboo_paper'
  | 'stone_lantern_granite'
  | 'ryuteki_lacquered_bamboo'
  | 'hichiriki_reed_bore'
  | 'otsuzumi_baked_hide'
  | 'dora_hammered_bronze'
  | 'horagai_conch_shell'
  | 'ichigenkin_paulownia'
  | 'kakko_deerskin'
  | 'suikinkutsu_earthen_jar'
  | 'kintsugi_gold_seam'
  | 'silk_brocade_snap';

/**
 * 42 Physically Calibrated Multi-Mode Material Spectra (up to 20–24 modes in Ultra).
 * Derived from Euler-Bernoulli orthotropic wood bars, Kirchhoff bronze/glass/steel shells,
 * vitreous porcelain bells, volcanic obsidian, and traditional Japanese craft materials.
 */
export const ACOUSTIC_MATERIALS: Record<AcousticMaterialId, ModalSpec> = {
  hinoki_ivory: {
    fundamentalHz: 390,
    ratios: [
      1.0, 1.76, 2.71, 3.84, 5.18, 6.72, 8.45, 10.6, 13.1, 15.8, 18.7, 21.9, 25.4, 29.1, 33.0, 37.2,
    ],
    amps: [
      0.95, 0.72, 0.56, 0.42, 0.31, 0.22, 0.16, 0.11, 0.08, 0.055, 0.038, 0.026, 0.018, 0.012, 0.008, 0.005,
    ],
    decays: [
      0.1, 0.076, 0.058, 0.042, 0.03, 0.022, 0.016, 0.012, 0.009, 0.007, 0.0055, 0.0045, 0.0038, 0.0032, 0.0028,
      0.0024,
    ],
    contactMs: 0.72,
    surfaceGrain: 0.38,
    bodyHz: 155,
    pitchGlideAmt: 0.012,
    pitchGlideMs: 9,
    stereoParity: 0.26,
    labelJp: '檜象牙',
  },
  karakuri_bronze: {
    fundamentalHz: 540,
    ratios: [
      1.0, 2.02, 2.98, 4.18, 5.65, 7.31, 9.14, 11.4, 13.9, 16.7, 19.8, 23.1, 26.6, 30.4, 34.5, 38.8, 43.2, 47.9,
    ],
    amps: [
      0.88, 0.78, 0.64, 0.54, 0.44, 0.36, 0.28, 0.22, 0.17, 0.13, 0.095, 0.072, 0.052, 0.038, 0.027, 0.019, 0.013,
      0.009,
    ],
    decays: [
      0.36, 0.29, 0.23, 0.18, 0.135, 0.1, 0.076, 0.056, 0.042, 0.031, 0.023, 0.017, 0.013, 0.01, 0.0075, 0.0058,
      0.0045, 0.0035,
    ],
    contactMs: 0.26,
    surfaceGrain: 0.22,
    doubletSplitHz: 2.35,
    bodyHz: 215,
    pitchGlideAmt: 0.009,
    pitchGlideMs: 11,
    stereoParity: 0.38,
    labelJp: '真鍮銅',
  },
  bisque_porcelain: {
    fundamentalHz: 920,
    ratios: [
      1.0, 1.59, 2.14, 2.92, 3.6, 4.48, 5.52, 6.74, 8.12, 9.65, 11.3, 13.1, 15.0, 17.1, 19.3, 21.6,
    ],
    amps: [
      0.92, 0.75, 0.62, 0.49, 0.39, 0.31, 0.23, 0.17, 0.12, 0.085, 0.06, 0.042, 0.03, 0.021, 0.014, 0.009,
    ],
    decays: [
      0.26, 0.2, 0.155, 0.118, 0.088, 0.064, 0.047, 0.034, 0.025, 0.018, 0.013, 0.0095, 0.0072, 0.0054, 0.0042,
      0.0032,
    ],
    contactMs: 0.19,
    surfaceGrain: 0.18,
    doubletSplitHz: 3.15,
    bodyHz: 340,
    pitchGlideAmt: 0.007,
    pitchGlideMs: 7,
    stereoParity: 0.42,
    labelJp: '京白磁',
  },
  obsidian_gold: {
    fundamentalHz: 690,
    ratios: [
      1.0, 1.88, 2.81, 4.04, 5.42, 6.95, 8.88, 11.1, 13.5, 16.2, 19.1, 22.3, 25.8, 29.4, 33.2, 37.3,
    ],
    amps: [
      0.9, 0.71, 0.58, 0.46, 0.36, 0.27, 0.21, 0.15, 0.105, 0.072, 0.05, 0.035, 0.024, 0.016, 0.011, 0.007,
    ],
    decays: [
      0.21, 0.16, 0.118, 0.088, 0.064, 0.047, 0.034, 0.025, 0.018, 0.013, 0.0095, 0.007, 0.0052, 0.004, 0.0031,
      0.0025,
    ],
    contactMs: 0.22,
    surfaceGrain: 0.26,
    doubletSplitHz: 1.75,
    bodyHz: 180,
    pitchGlideAmt: 0.011,
    pitchGlideMs: 8,
    stereoParity: 0.34,
    labelJp: '黒曜金',
  },
  chabudai_oak: {
    fundamentalHz: 148,
    ratios: [1.0, 1.68, 2.54, 3.62, 4.91, 6.45, 8.2, 10.3, 12.7, 15.4],
    amps: [1.0, 0.68, 0.46, 0.31, 0.2, 0.13, 0.08, 0.048, 0.028, 0.016],
    decays: [0.17, 0.115, 0.078, 0.05, 0.034, 0.022, 0.014, 0.0095, 0.0068, 0.0048],
    contactMs: 1.12,
    surfaceGrain: 0.42,
    bodyHz: 84,
    pitchGlideAmt: 0.018,
    pitchGlideMs: 14,
    stereoParity: 0.22,
    labelJp: '欅卓',
  },
  marble_brass: {
    fundamentalHz: 260,
    ratios: [1.0, 1.92, 2.86, 4.12, 5.58, 7.2, 9.15, 11.4, 13.9, 16.8],
    amps: [0.95, 0.72, 0.54, 0.38, 0.26, 0.18, 0.115, 0.075, 0.048, 0.03],
    decays: [0.23, 0.165, 0.12, 0.084, 0.058, 0.04, 0.027, 0.018, 0.012, 0.0085],
    contactMs: 0.34,
    surfaceGrain: 0.24,
    bodyHz: 112,
    stereoParity: 0.3,
    labelJp: '大理石',
  },
  cedar_vermilion: {
    fundamentalHz: 175,
    ratios: [1.0, 1.74, 2.66, 3.78, 5.1, 6.7, 8.55, 10.7, 13.1],
    amps: [1.0, 0.7, 0.48, 0.32, 0.21, 0.13, 0.08, 0.048, 0.028],
    decays: [0.16, 0.105, 0.072, 0.048, 0.031, 0.02, 0.013, 0.0088, 0.006],
    contactMs: 0.92,
    surfaceGrain: 0.4,
    bodyHz: 92,
    pitchGlideAmt: 0.016,
    pitchGlideMs: 12,
    stereoParity: 0.24,
    labelJp: '朱塗杉',
  },
  limestone_travertine: {
    fundamentalHz: 235,
    ratios: [1.0, 1.82, 2.75, 3.92, 5.25, 6.84, 8.65, 10.8, 13.2],
    amps: [0.95, 0.66, 0.46, 0.31, 0.21, 0.135, 0.085, 0.052, 0.032],
    decays: [0.18, 0.125, 0.086, 0.058, 0.04, 0.026, 0.017, 0.011, 0.0075],
    contactMs: 0.46,
    surfaceGrain: 0.48,
    bodyHz: 105,
    stereoParity: 0.26,
    labelJp: '石灰華',
  },
  brick_iron: {
    fundamentalHz: 295,
    ratios: [1.0, 1.96, 2.94, 4.25, 5.72, 7.45, 9.4, 11.7, 14.3],
    amps: [0.92, 0.74, 0.56, 0.4, 0.28, 0.19, 0.125, 0.08, 0.05],
    decays: [0.22, 0.155, 0.115, 0.082, 0.056, 0.038, 0.026, 0.017, 0.011],
    contactMs: 0.33,
    surfaceGrain: 0.35,
    bodyHz: 118,
    stereoParity: 0.32,
    labelJp: '煉瓦鉄',
  },
  go_stone_ivory: {
    fundamentalHz: 1580,
    ratios: [1.0, 1.54, 2.38, 3.31, 4.46, 5.82, 7.35, 9.1, 11.0, 13.1],
    amps: [0.95, 0.76, 0.58, 0.42, 0.3, 0.2, 0.13, 0.082, 0.05, 0.03],
    decays: [0.054, 0.04, 0.028, 0.02, 0.014, 0.01, 0.007, 0.005, 0.0036, 0.0026],
    contactMs: 0.16,
    surfaceGrain: 0.24,
    bodyHz: 320,
    stereoParity: 0.28,
    labelJp: '蛤碁石',
  },
  go_stone_bronze: {
    fundamentalHz: 1320,
    ratios: [1.0, 1.84, 2.74, 3.92, 5.26, 6.84, 8.6, 10.6, 12.8, 15.2],
    amps: [0.92, 0.74, 0.56, 0.42, 0.31, 0.22, 0.15, 0.095, 0.06, 0.038],
    decays: [0.092, 0.066, 0.048, 0.033, 0.024, 0.016, 0.011, 0.0078, 0.0055, 0.0038],
    contactMs: 0.2,
    surfaceGrain: 0.22,
    doubletSplitHz: 3.4,
    bodyHz: 265,
    stereoParity: 0.35,
    labelJp: '青銅碁石',
  },
  hyoshigi_rosewood: {
    fundamentalHz: 685,
    ratios: [1.0, 2.18, 3.64, 5.38, 7.25, 9.42, 11.9, 14.6, 17.6, 20.8],
    amps: [1.0, 0.82, 0.62, 0.44, 0.31, 0.2, 0.125, 0.078, 0.048, 0.028],
    decays: [0.12, 0.086, 0.058, 0.04, 0.027, 0.018, 0.012, 0.0085, 0.006, 0.0042],
    contactMs: 0.34,
    surfaceGrain: 0.32,
    bodyHz: 260,
    pitchGlideAmt: 0.015,
    pitchGlideMs: 7,
    stereoParity: 0.36,
    labelJp: '紫檀拍子木',
  },
  rin_temple_bell: {
    fundamentalHz: 523.25,
    ratios: [1.0, 2.756, 5.404, 8.933, 13.34, 18.62, 24.75, 31.8],
    amps: [1.0, 0.56, 0.3, 0.16, 0.085, 0.045, 0.022, 0.011],
    decays: [2.15, 1.25, 0.68, 0.36, 0.19, 0.105, 0.058, 0.032],
    contactMs: 1.45,
    surfaceGrain: 0.07,
    doubletSplitHz: 1.85,
    bodyHz: 261.6,
    stereoParity: 0.48,
    labelJp: '仏具おりん',
  },
  bonsho_bronze_bell: {
    // Deep Japanese Sacred Temple Bronze Bell (梵鐘) with iconic slow beating shimmer (うなり)!
    fundamentalHz: 130.81,
    ratios: [1.0, 2.003, 2.992, 4.18, 5.42, 6.84, 8.38, 10.12, 12.05, 14.2, 16.5, 19.1],
    amps: [1.0, 0.72, 0.54, 0.38, 0.28, 0.2, 0.14, 0.095, 0.065, 0.042, 0.026, 0.016],
    decays: [3.2, 2.35, 1.65, 1.15, 0.78, 0.52, 0.35, 0.23, 0.15, 0.098, 0.064, 0.042],
    contactMs: 3.4, // Heavy suspended wooden beam (shumoku) contact!
    surfaceGrain: 0.14,
    doubletSplitHz: 1.32,
    bodyHz: 65.4,
    pitchGlideAmt: 0.018,
    pitchGlideMs: 28,
    stereoParity: 0.52,
    labelJp: '梵鐘',
  },
  clockwork_escapement: {
    fundamentalHz: 2380,
    ratios: [1.0, 1.62, 2.48, 3.56, 4.92, 6.45, 8.2, 10.1],
    amps: [0.95, 0.72, 0.52, 0.35, 0.22, 0.13, 0.075, 0.042],
    decays: [0.028, 0.02, 0.014, 0.01, 0.007, 0.0045, 0.003, 0.002],
    contactMs: 0.13,
    surfaceGrain: 0.18,
    stereoParity: 0.25,
    labelJp: '真鍮脱進機',
  },
  bamboo_shishi_odoshi: {
    // Hollow green Moso bamboo tube knocking onto wet garden river stone!
    fundamentalHz: 465,
    ratios: [1.0, 1.94, 2.86, 4.12, 5.64, 7.38, 9.25, 11.4],
    amps: [1.0, 0.78, 0.54, 0.35, 0.22, 0.13, 0.075, 0.042],
    decays: [0.145, 0.098, 0.064, 0.042, 0.028, 0.018, 0.012, 0.008],
    contactMs: 0.55,
    surfaceGrain: 0.36,
    bodyHz: 218,
    pitchGlideAmt: 0.022,
    pitchGlideMs: 10,
    stereoParity: 0.34,
    labelJp: '鹿威し竹',
  },
  furin_edo_glass: {
    // Hand-blown Edo Glass Wind Chime (江戸風鈴): crystalline high-Q borosilicate ring!
    fundamentalHz: 2140,
    ratios: [1.0, 1.72, 2.68, 3.84, 5.15, 6.72, 8.45],
    amps: [1.0, 0.64, 0.42, 0.26, 0.15, 0.085, 0.045],
    decays: [0.95, 0.62, 0.38, 0.22, 0.13, 0.075, 0.042],
    contactMs: 0.15,
    surfaceGrain: 0.1,
    doubletSplitHz: 3.8,
    stereoParity: 0.46,
    labelJp: '江戸風鈴',
  },
  suzu_brass_bell: {
    // Shinto Kagura-Suzu micro brass jingle bell!
    fundamentalHz: 3420,
    ratios: [1.0, 1.56, 2.34, 3.28, 4.42, 5.65],
    amps: [0.95, 0.72, 0.48, 0.3, 0.18, 0.095],
    decays: [0.28, 0.19, 0.125, 0.08, 0.05, 0.032],
    contactMs: 0.12,
    surfaceGrain: 0.14,
    doubletSplitHz: 5.2,
    stereoParity: 0.5,
    labelJp: '神楽鈴',
  },
  ivory_nail: {
    fundamentalHz: 2860,
    ratios: [1.0, 1.68, 2.55, 3.65, 4.95, 6.4],
    amps: [0.95, 0.7, 0.48, 0.31, 0.18, 0.1],
    decays: [0.022, 0.015, 0.01, 0.007, 0.0045, 0.003],
    contactMs: 0.11,
    surfaceGrain: 0.22,
    labelJp: '象牙爪',
  },
  porcelain_nail: {
    fundamentalHz: 3640,
    ratios: [1.0, 1.58, 2.32, 3.24, 4.35, 5.6],
    amps: [0.95, 0.72, 0.5, 0.32, 0.19, 0.11],
    decays: [0.034, 0.023, 0.015, 0.01, 0.0068, 0.0044],
    contactMs: 0.1,
    surfaceGrain: 0.16,
    doubletSplitHz: 4.5,
    labelJp: '白磁爪',
  },
  bronze_nail: {
    fundamentalHz: 3180,
    ratios: [1.0, 1.86, 2.78, 3.92, 5.25, 6.75],
    amps: [0.92, 0.74, 0.52, 0.35, 0.22, 0.13],
    decays: [0.048, 0.034, 0.023, 0.015, 0.01, 0.0065],
    contactMs: 0.11,
    surfaceGrain: 0.18,
    doubletSplitHz: 3.9,
    labelJp: '金銅爪',
  },
  pendulum_clock_tick: {
    fundamentalHz: 1120,
    ratios: [1.0, 1.85, 2.94, 4.2, 5.75],
    amps: [0.95, 0.65, 0.4, 0.24, 0.13],
    decays: [0.042, 0.028, 0.018, 0.011, 0.007],
    contactMs: 0.24,
    surfaceGrain: 0.28,
    bodyHz: 245,
    labelJp: '振子時計',
  },
  hearth_charcoal_pop: {
    fundamentalHz: 1840,
    ratios: [1.0, 1.48, 2.24, 3.35, 4.72],
    amps: [0.9, 0.72, 0.52, 0.34, 0.2],
    decays: [0.014, 0.01, 0.007, 0.0045, 0.003],
    contactMs: 0.14,
    surfaceGrain: 0.62,
    labelJp: '備長炭爆ぜ',
  },
  cedar_eave_creak: {
    fundamentalHz: 310,
    ratios: [1.0, 1.62, 2.42, 3.48, 4.82, 6.35],
    amps: [0.95, 0.68, 0.44, 0.28, 0.17, 0.095],
    decays: [0.085, 0.058, 0.038, 0.025, 0.016, 0.01],
    contactMs: 0.9,
    surfaceGrain: 0.52,
    bodyHz: 122,
    labelJp: '檜軋み',
  },
  tsugaru_shamisen_body: {
    // Stretched taut leather soundbox struck by ivory bachi plectrum!
    fundamentalHz: 285,
    ratios: [1.0, 1.58, 2.19, 2.94, 3.85, 4.92, 6.24, 7.82, 9.6, 11.7],
    amps: [1.0, 0.84, 0.68, 0.52, 0.39, 0.28, 0.19, 0.13, 0.085, 0.052],
    decays: [0.068, 0.05, 0.036, 0.026, 0.019, 0.013, 0.0095, 0.0068, 0.0048, 0.0034],
    contactMs: 0.24,
    surfaceGrain: 0.46,
    bodyHz: 165,
    pitchGlideAmt: 0.024,
    pitchGlideMs: 8,
    stereoParity: 0.36,
    labelJp: '津軽三味線胴',
  },
  biwa_mulberry_body: {
    // Deep carved mulberry-wood pear soundbox with resonant warm chest!
    fundamentalHz: 196,
    ratios: [1.0, 1.72, 2.58, 3.64, 4.88, 6.32, 8.05, 10.1, 12.4],
    amps: [1.0, 0.78, 0.56, 0.4, 0.28, 0.19, 0.125, 0.08, 0.048],
    decays: [0.16, 0.115, 0.082, 0.056, 0.038, 0.025, 0.017, 0.011, 0.0075],
    contactMs: 0.42,
    surfaceGrain: 0.4,
    bodyHz: 112,
    pitchGlideAmt: 0.016,
    pitchGlideMs: 11,
    stereoParity: 0.34,
    labelJp: '薩摩琵琶胴',
  },
  sho_bamboo_reed: {
    // Smoked susudake bamboo pipe + brass free-reed chime body
    fundamentalHz: 660,
    ratios: [1.0, 2.0, 3.0, 4.01, 5.02, 6.04, 7.08, 8.15],
    amps: [1.0, 0.62, 0.48, 0.3, 0.22, 0.14, 0.085, 0.048],
    decays: [0.45, 0.36, 0.28, 0.21, 0.15, 0.1, 0.068, 0.042],
    contactMs: 1.8,
    surfaceGrain: 0.16,
    doubletSplitHz: 1.15,
    stereoParity: 0.42,
    labelJp: '雅楽笙竹管',
  },
  mokugyo_camphor: {
    // Hollow carved camphor-wood temple slit drum (木魚) — iconic woody Helmholtz knock!
    fundamentalHz: 428,
    ratios: [1.0, 1.44, 2.32, 3.48, 4.95, 6.62, 8.5, 10.7],
    amps: [1.0, 0.88, 0.52, 0.32, 0.19, 0.11, 0.062, 0.034],
    decays: [0.115, 0.082, 0.048, 0.03, 0.019, 0.012, 0.008, 0.0052],
    contactMs: 0.78,
    surfaceGrain: 0.3,
    bodyHz: 292,
    pitchGlideAmt: 0.02,
    pitchGlideMs: 9,
    stereoParity: 0.32,
    labelJp: '楠木魚',
  },
  katana_tamahagane: {
    // Folded Japanese Tamahagane steel blade — crystalline singing upper harmonics!
    fundamentalHz: 1180,
    ratios: [1.0, 2.12, 3.42, 4.96, 6.72, 8.68, 10.85, 13.2, 15.8, 18.6, 21.7, 25.0],
    amps: [0.86, 0.78, 0.66, 0.56, 0.46, 0.38, 0.3, 0.23, 0.17, 0.12, 0.082, 0.055],
    decays: [0.64, 0.52, 0.41, 0.31, 0.23, 0.17, 0.125, 0.09, 0.064, 0.046, 0.032, 0.022],
    contactMs: 0.11,
    surfaceGrain: 0.2,
    doubletSplitHz: 3.6,
    stereoParity: 0.52,
    labelJp: '玉鋼刀身',
  },
  kane_chanchiki: {
    // Hand-held brass festival gong (摺鉦 / 当り鉦) struck with deer-horn shumoku!
    fundamentalHz: 845,
    ratios: [1.0, 1.66, 2.48, 3.52, 4.74, 6.18, 7.82, 9.65, 11.7, 13.9, 16.4, 19.1],
    amps: [0.94, 0.84, 0.72, 0.58, 0.46, 0.35, 0.26, 0.19, 0.135, 0.092, 0.062, 0.04],
    decays: [0.58, 0.44, 0.32, 0.23, 0.165, 0.115, 0.08, 0.055, 0.038, 0.026, 0.018, 0.012],
    contactMs: 0.16,
    surfaceGrain: 0.24,
    doubletSplitHz: 4.8,
    bodyHz: 422,
    pitchGlideAmt: 0.014,
    pitchGlideMs: 8,
    stereoParity: 0.5,
    labelJp: '摺鉦真鍮',
  },
  sensu_bamboo_paper: {
    // Split Moso bamboo ribs snapping laminated gilded washi pleats open!
    fundamentalHz: 740,
    ratios: [1.0, 1.82, 2.86, 4.15, 5.68, 7.45, 9.5, 11.8],
    amps: [0.92, 0.76, 0.58, 0.42, 0.3, 0.2, 0.13, 0.08],
    decays: [0.042, 0.03, 0.022, 0.015, 0.011, 0.0075, 0.0052, 0.0036],
    contactMs: 0.28,
    surfaceGrain: 0.68,
    bodyHz: 310,
    stereoParity: 0.44,
    labelJp: '舞扇竹和紙',
  },
  stone_lantern_granite: {
    // Weathered garden granite lantern & wet river cobblestone resonance
    fundamentalHz: 510,
    ratios: [1.0, 1.78, 2.72, 3.88, 5.26, 6.84, 8.62, 10.6],
    amps: [0.95, 0.72, 0.5, 0.34, 0.22, 0.14, 0.085, 0.05],
    decays: [0.09, 0.062, 0.042, 0.028, 0.019, 0.013, 0.0085, 0.0058],
    contactMs: 0.29,
    surfaceGrain: 0.54,
    bodyHz: 188,
    stereoParity: 0.3,
    labelJp: '御影石灯籠',
  },
  living_skin: {
    // Organic human hand impact: warm cushioned palmar tissue thump + subtle bone/nail click!
    fundamentalHz: 192,
    ratios: [1.0, 1.64, 2.48, 3.55, 4.92, 6.6, 8.5, 10.8, 13.4, 16.2],
    amps: [1.0, 0.76, 0.54, 0.36, 0.24, 0.15, 0.095, 0.058, 0.032, 0.018],
    decays: [0.046, 0.034, 0.024, 0.017, 0.012, 0.0085, 0.006, 0.0044, 0.0032, 0.0024],
    contactMs: 1.15,
    surfaceGrain: 0.42,
    bodyHz: 118,
    pitchGlideAmt: 0.018,
    pitchGlideMs: 11,
    stereoParity: 0.22,
    labelJp: '生体掌肌',
  },
  ryuteki_lacquered_bamboo: {
    // Smoked susudake bamboo & urushi lacquer bore for Imperial Gagaku Ryuteki flute
    fundamentalHz: 620,
    ratios: [1.0, 2.01, 3.03, 4.1, 5.25, 6.5, 7.9, 9.4],
    amps: [0.95, 0.68, 0.44, 0.28, 0.18, 0.11, 0.065, 0.038],
    decays: [0.14, 0.095, 0.065, 0.045, 0.03, 0.02, 0.014, 0.009],
    contactMs: 0.38,
    surfaceGrain: 0.22,
    bodyHz: 294,
    stereoParity: 0.34,
    labelJp: '龍笛煤竹',
  },
  hichiriki_reed_bore: {
    // Double-reed rozetsu & lacquered bamboo pipe for Gagaku Hichiriki
    fundamentalHz: 440,
    ratios: [1.0, 2.0, 3.01, 4.02, 5.05, 6.08, 7.12, 8.18, 9.25],
    amps: [0.9, 0.84, 0.72, 0.58, 0.42, 0.3, 0.21, 0.14, 0.09],
    decays: [0.16, 0.12, 0.088, 0.064, 0.046, 0.033, 0.024, 0.017, 0.012],
    contactMs: 0.44,
    surfaceGrain: 0.36,
    bodyHz: 220,
    stereoParity: 0.36,
    labelJp: '篳篥蘆舌',
  },
  otsuzumi_baked_hide: {
    // Kiln-dried high-tension cowhide Noh Otsuzumi ("Kaan!" crisp piercing slap)
    fundamentalHz: 525,
    ratios: [1.0, 1.593, 2.136, 2.653, 3.156, 3.65, 4.28, 5.12, 6.18, 7.45],
    amps: [1.0, 0.86, 0.68, 0.52, 0.38, 0.26, 0.18, 0.12, 0.075, 0.044],
    decays: [0.16, 0.115, 0.082, 0.056, 0.038, 0.026, 0.018, 0.012, 0.0085, 0.0058],
    contactMs: 0.14,
    surfaceGrain: 0.48,
    bodyHz: 265,
    pitchGlideAmt: 0.068,
    pitchGlideMs: 14,
    stereoParity: 0.44,
    labelJp: '大鼓焙皮',
  },
  dora_hammered_bronze: {
    // Hand-forged Noh/Tea-room bronze gong with dramatic nonlinear shimmer modes
    fundamentalHz: 118,
    ratios: [1.0, 1.48, 2.04, 2.71, 3.42, 4.26, 5.18, 6.24, 7.42, 8.75, 10.2, 11.9, 13.8, 16.0],
    amps: [1.0, 0.85, 0.74, 0.62, 0.52, 0.44, 0.36, 0.29, 0.23, 0.18, 0.14, 0.1, 0.072, 0.05],
    decays: [2.4, 2.1, 1.75, 1.4, 1.15, 0.92, 0.72, 0.56, 0.42, 0.32, 0.24, 0.18, 0.13, 0.095],
    contactMs: 1.85,
    surfaceGrain: 0.14,
    doubletSplitHz: 2.35,
    bodyHz: 78,
    pitchGlideAmt: -0.022,
    pitchGlideMs: 28,
    stereoParity: 0.64,
    labelJp: '鍛造青銅鑼',
  },
  horagai_conch_shell: {
    // Calcite spiral shell cavity resonance for Yamabushi Horagai war-horn
    fundamentalHz: 262,
    ratios: [1.0, 1.98, 2.95, 3.96, 5.04, 6.18, 7.4, 8.7],
    amps: [1.0, 0.78, 0.58, 0.4, 0.26, 0.16, 0.095, 0.055],
    decays: [0.22, 0.17, 0.125, 0.09, 0.062, 0.044, 0.03, 0.02],
    contactMs: 0.62,
    surfaceGrain: 0.24,
    bodyHz: 131,
    stereoParity: 0.38,
    labelJp: '法螺巻貝',
  },
  ichigenkin_paulownia: {
    // Single-string Suma-goto aged paulownia soundboard resonance
    fundamentalHz: 294,
    ratios: [1.0, 1.99, 3.01, 4.04, 5.1, 6.22, 7.4, 8.68, 10.1],
    amps: [0.98, 0.74, 0.52, 0.36, 0.24, 0.15, 0.095, 0.058, 0.034],
    decays: [0.34, 0.25, 0.18, 0.13, 0.09, 0.062, 0.042, 0.028, 0.019],
    contactMs: 0.34,
    surfaceGrain: 0.2,
    bodyHz: 147,
    stereoParity: 0.42,
    labelJp: '一絃琴桐胴',
  },
  kakko_deerskin: {
    // Gagaku double-headed deerskin roll drum struck with twin cypress bachi
    fundamentalHz: 335,
    ratios: [1.0, 1.59, 2.14, 2.66, 3.16, 3.72, 4.35, 5.1],
    amps: [1.0, 0.74, 0.54, 0.38, 0.25, 0.16, 0.1, 0.062],
    decays: [0.11, 0.08, 0.056, 0.038, 0.026, 0.018, 0.012, 0.0085],
    contactMs: 0.26,
    surfaceGrain: 0.38,
    bodyHz: 185,
    pitchGlideAmt: 0.042,
    pitchGlideMs: 9,
    stereoParity: 0.48,
    labelJp: '鞨鼓鹿皮',
  },
  suikinkutsu_earthen_jar: {
    // Buried Kyoto stoneware jar resonator for crystalline Suikinkutsu water-harp drops!
    fundamentalHz: 784,
    ratios: [1.0, 1.502, 2.005, 2.51, 3.012, 3.76, 4.52, 5.42, 6.38, 7.5],
    amps: [1.0, 0.76, 0.62, 0.44, 0.34, 0.24, 0.16, 0.11, 0.072, 0.046],
    decays: [1.25, 1.05, 0.86, 0.68, 0.54, 0.42, 0.32, 0.24, 0.17, 0.12],
    contactMs: 0.15,
    surfaceGrain: 0.06,
    doubletSplitHz: 1.45,
    bodyHz: 392,
    stereoParity: 0.66,
    labelJp: '水琴窟陶甕',
  },
  kintsugi_gold_seam: {
    // Urushi + pure gold-dusted ceramic fracture seam chime
    fundamentalHz: 1240,
    ratios: [1.0, 1.72, 2.64, 3.78, 5.14, 6.72, 8.5, 10.4],
    amps: [0.95, 0.74, 0.54, 0.38, 0.25, 0.16, 0.1, 0.06],
    decays: [0.32, 0.24, 0.17, 0.12, 0.082, 0.056, 0.038, 0.025],
    contactMs: 0.12,
    surfaceGrain: 0.18,
    doubletSplitHz: 2.8,
    stereoParity: 0.52,
    labelJp: '金継ぎ漆金',
  },
  silk_brocade_snap: {
    // Crisp Nishijin silk brocade sleeve & palm whip crack
    fundamentalHz: 680,
    ratios: [1.0, 1.88, 3.02, 4.45, 6.1, 8.05, 10.3],
    amps: [0.85, 0.72, 0.56, 0.4, 0.26, 0.16, 0.09],
    decays: [0.028, 0.021, 0.015, 0.011, 0.0075, 0.0052, 0.0036],
    contactMs: 0.32,
    surfaceGrain: 0.78,
    bodyHz: 240,
    stereoParity: 0.46,
    labelJp: '西陣織絹擦',
  },
};

export interface StageAcousticProfile {
  stageId: StageId;
  tableMaterial: AcousticMaterialId;
  /** Physical room dimensions in meters [Lx, Ly, Lz] for 3D Image-Source early reflections */
  roomDims: [number, number, number];
  /** Mean Sabine absorption [walls, ceiling, floor] (0 = mirror, 1 = open sky) */
  absorption: [number, number, number];
  /** Target reverberation time RT60 in seconds */
  targetRt60Sec: number;
  /** High-frequency air+surface damping ratio (>1 warm dark decay; ~1 bright stone) */
  hfDampingRatio: number;
  /** Low-frequency room warmth boost factor */
  lfWarmthRatio: number;
  /** Reverb wet send scale for this architectural space */
  reverbSend: number;
  /** Living ambience level (linear gain) */
  ambienceGain: number;
  /** Acoustic pre-delay before diffuse tail blooms (ms) */
  preDelayMs: number;
  labelJp: string;
}

export const STAGE_ACOUSTIC_PROFILES: Record<StageId, StageAcousticProfile> = {
  zashiki: {
    stageId: 'zashiki',
    tableMaterial: 'chabudai_oak',
    roomDims: [5.4, 2.75, 4.8],
    absorption: [0.38, 0.34, 0.44],
    targetRt60Sec: 0.46,
    hfDampingRatio: 2.85,
    lfWarmthRatio: 1.12,
    reverbSend: 0.26,
    ambienceGain: 0.026,
    preDelayMs: 6,
    labelJp: '和室・畳吸音 (0.46s)',
  },
  salon: {
    stageId: 'salon',
    tableMaterial: 'marble_brass',
    roomDims: [10.8, 5.4, 9.2],
    absorption: [0.16, 0.19, 0.12],
    targetRt60Sec: 1.38,
    hfDampingRatio: 1.35,
    lfWarmthRatio: 1.05,
    reverbSend: 0.42,
    ambienceGain: 0.024,
    preDelayMs: 14,
    labelJp: '大理石大広間 (1.38s)',
  },
  shrine: {
    stageId: 'shrine',
    tableMaterial: 'cedar_vermilion',
    roomDims: [12.5, 4.8, 11.0],
    absorption: [0.58, 0.24, 0.48],
    targetRt60Sec: 0.92,
    hfDampingRatio: 2.1,
    lfWarmthRatio: 0.94,
    reverbSend: 0.34,
    ambienceGain: 0.034,
    preDelayMs: 11,
    labelJp: '檜拝殿・外気 (0.92s)',
  },
  onsen: {
    stageId: 'onsen',
    tableMaterial: 'limestone_travertine',
    roomDims: [8.4, 4.2, 7.6],
    absorption: [0.18, 0.22, 0.14],
    targetRt60Sec: 1.52,
    hfDampingRatio: 1.58,
    lfWarmthRatio: 1.18,
    reverbSend: 0.46,
    ambienceGain: 0.056,
    preDelayMs: 12,
    labelJp: '岩窟湯殿・滝 (1.52s)',
  },
  atelier: {
    stageId: 'atelier',
    tableMaterial: 'brick_iron',
    roomDims: [6.8, 3.8, 6.2],
    absorption: [0.24, 0.28, 0.22],
    targetRt60Sec: 0.78,
    hfDampingRatio: 1.75,
    lfWarmthRatio: 1.1,
    reverbSend: 0.34,
    ambienceGain: 0.024,
    preDelayMs: 8,
    labelJp: '煉瓦書斎残響 (0.78s)',
  },
};
