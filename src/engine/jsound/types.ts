/**
 * ★ JSound Engin 1.0 — Physical-Modeling & Spatial Acoustic Engine Types ★
 *
 * Physically derived eigenmode catalogs for every craft material, architectural
 * stage room geometry (for 3D Image-Source early reflections + Eyring late tail),
 * and live mastering telemetry.
 */

import { HandMaterialPreset, StageId } from '../../graphics/GraphicsConfig';

export type JSoundQualityMode = 'pro' | 'lite';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface JSoundSettings {
  enabled: boolean;
  quality: JSoundQualityMode;
  ambienceEnabled: boolean;
  masterVolume: number; // 0..1
}

export interface JSoundTelemetry {
  engineName: string;
  enabled: boolean;
  quality: JSoundQualityMode;
  ambienceEnabled: boolean;
  stageId: StageId;
  stageRt60Sec: number;
  activeVoices: number;
  sampleRate: number;
  peakDb: number;
  rmsDb: number;
  materialPairJp: string;
}

export interface ModalSpec {
  /** Base fundamental frequency in Hz */
  fundamentalHz: number;
  /** Inharmonic mode frequency ratios relative to fundamental (Euler-Bernoulli / plate physics) */
  ratios: number[];
  /** Relative amplitude per mode */
  amps: number[];
  /** Base decay time constant tau (seconds) per mode (higher modes decay faster) */
  decays: number[];
  /** Hertzian contact pulse duration at moderate velocity (ms): smaller = harder contact! */
  contactMs: number;
  /** High-frequency micro-asperity surface grain 0..1 */
  surfaceGrain: number;
  /** Optional beating doublet split in Hz (for hand-hammered bronze bells & porcelain) */
  doubletSplitHz?: number;
  /** Sub-body air/cavity resonance frequency in Hz */
  bodyHz?: number;
  /** Japanese craft display label */
  labelJp: string;
}

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
  | 'clockwork_escapement';

/**
 * Physically calibrated modal spectra for every material in JANKEN · 極.
 * Mode ratios are modeled after real orthotropic tonewood bars, circular bronze plates,
 * vitreous porcelain shells, obsidian glass bars, and rosewood hyoshigi clappers.
 */
export const ACOUSTIC_MATERIALS: Record<AcousticMaterialId, ModalSpec> = {
  hinoki_ivory: {
    // Japanese Hinoki Cypress + carved Ivory knuckles: warm resonant wood + crisp ivory click
    fundamentalHz: 390,
    ratios: [1.0, 1.76, 2.71, 3.84, 5.18, 6.72, 8.45, 10.6, 13.1, 15.8],
    amps: [0.95, 0.72, 0.56, 0.42, 0.31, 0.22, 0.16, 0.11, 0.07, 0.04],
    decays: [0.095, 0.072, 0.055, 0.04, 0.028, 0.021, 0.015, 0.011, 0.008, 0.006],
    contactMs: 0.75,
    surfaceGrain: 0.38,
    bodyHz: 155,
    labelJp: '檜象牙',
  },
  karakuri_bronze: {
    // Cast Karakuri Bronze & Brass clockwork joints: rich metallic shimmer + subtle beating!
    fundamentalHz: 540,
    ratios: [1.0, 2.02, 2.98, 4.18, 5.65, 7.31, 9.14, 11.4, 13.9, 16.7, 19.8, 23.1],
    amps: [0.88, 0.78, 0.64, 0.54, 0.44, 0.36, 0.28, 0.22, 0.16, 0.12, 0.08, 0.05],
    decays: [0.34, 0.28, 0.22, 0.17, 0.13, 0.095, 0.072, 0.052, 0.038, 0.028, 0.02, 0.014],
    contactMs: 0.28,
    surfaceGrain: 0.22,
    doubletSplitHz: 2.3,
    bodyHz: 215,
    labelJp: '真鍮銅',
  },
  bisque_porcelain: {
    // Kyoto glazed white porcelain: crystalline high-Q ceramic ring!
    fundamentalHz: 920,
    ratios: [1.0, 1.59, 2.14, 2.92, 3.6, 4.48, 5.52, 6.74, 8.12, 9.65],
    amps: [0.92, 0.74, 0.62, 0.48, 0.38, 0.3, 0.22, 0.16, 0.11, 0.07],
    decays: [0.24, 0.19, 0.145, 0.11, 0.082, 0.06, 0.044, 0.031, 0.022, 0.015],
    contactMs: 0.2,
    surfaceGrain: 0.18,
    doubletSplitHz: 3.1,
    bodyHz: 340,
    labelJp: '京白磁',
  },
  obsidian_gold: {
    // Volcanic black obsidian + hammered gold inlay: dense glassy mineral ping + dark body
    fundamentalHz: 690,
    ratios: [1.0, 1.88, 2.81, 4.04, 5.42, 6.95, 8.88, 11.1, 13.5, 16.2],
    amps: [0.9, 0.7, 0.58, 0.45, 0.35, 0.26, 0.2, 0.14, 0.09, 0.06],
    decays: [0.2, 0.15, 0.11, 0.082, 0.06, 0.044, 0.032, 0.023, 0.016, 0.011],
    contactMs: 0.24,
    surfaceGrain: 0.26,
    doubletSplitHz: 1.7,
    bodyHz: 180,
    labelJp: '黒曜金',
  },
  chabudai_oak: {
    fundamentalHz: 148,
    ratios: [1.0, 1.68, 2.54, 3.62, 4.91, 6.45, 8.2],
    amps: [1.0, 0.68, 0.45, 0.3, 0.19, 0.12, 0.07],
    decays: [0.16, 0.11, 0.075, 0.048, 0.032, 0.02, 0.013],
    contactMs: 1.15,
    surfaceGrain: 0.42,
    bodyHz: 84,
    labelJp: '欅卓',
  },
  marble_brass: {
    fundamentalHz: 260,
    ratios: [1.0, 1.92, 2.86, 4.12, 5.58, 7.2, 9.15],
    amps: [0.95, 0.72, 0.54, 0.38, 0.26, 0.18, 0.11],
    decays: [0.22, 0.16, 0.115, 0.08, 0.055, 0.038, 0.025],
    contactMs: 0.35,
    surfaceGrain: 0.24,
    bodyHz: 112,
    labelJp: '大理石',
  },
  cedar_vermilion: {
    fundamentalHz: 175,
    ratios: [1.0, 1.74, 2.66, 3.78, 5.1, 6.7],
    amps: [1.0, 0.7, 0.48, 0.32, 0.2, 0.12],
    decays: [0.15, 0.1, 0.068, 0.045, 0.028, 0.018],
    contactMs: 0.95,
    surfaceGrain: 0.4,
    bodyHz: 92,
    labelJp: '朱塗杉',
  },
  limestone_travertine: {
    fundamentalHz: 235,
    ratios: [1.0, 1.82, 2.75, 3.92, 5.25, 6.84],
    amps: [0.95, 0.66, 0.46, 0.31, 0.21, 0.13],
    decays: [0.17, 0.12, 0.082, 0.056, 0.038, 0.024],
    contactMs: 0.48,
    surfaceGrain: 0.48,
    bodyHz: 105,
    labelJp: '石灰華',
  },
  brick_iron: {
    fundamentalHz: 295,
    ratios: [1.0, 1.96, 2.94, 4.25, 5.72, 7.45, 9.4],
    amps: [0.92, 0.74, 0.56, 0.4, 0.28, 0.18, 0.12],
    decays: [0.21, 0.15, 0.11, 0.078, 0.054, 0.036, 0.024],
    contactMs: 0.34,
    surfaceGrain: 0.35,
    bodyHz: 118,
    labelJp: '煉瓦鉄',
  },
  go_stone_ivory: {
    // Real Clamshell (Hamaguri) Go stone clicking onto walnut/kaya board!
    fundamentalHz: 1580,
    ratios: [1.0, 1.54, 2.38, 3.31, 4.46, 5.82, 7.35],
    amps: [0.95, 0.76, 0.58, 0.42, 0.3, 0.2, 0.12],
    decays: [0.052, 0.038, 0.026, 0.019, 0.013, 0.009, 0.006],
    contactMs: 0.18,
    surfaceGrain: 0.25,
    bodyHz: 320,
    labelJp: '蛤碁石',
  },
  go_stone_bronze: {
    // Dense bronze/slate Go stone onto hardwood tray
    fundamentalHz: 1320,
    ratios: [1.0, 1.84, 2.74, 3.92, 5.26, 6.84, 8.6],
    amps: [0.92, 0.74, 0.56, 0.42, 0.3, 0.21, 0.14],
    decays: [0.088, 0.064, 0.045, 0.031, 0.022, 0.015, 0.01],
    contactMs: 0.22,
    surfaceGrain: 0.22,
    doubletSplitHz: 3.4,
    bodyHz: 265,
    labelJp: '青銅碁石',
  },
  hyoshigi_rosewood: {
    // Traditional Kabuki / Dojo hardwood Hyoshigi clappers (crisp cutting wooden bar modes!)
    fundamentalHz: 685,
    ratios: [1.0, 2.18, 3.64, 5.38, 7.25, 9.42, 11.9],
    amps: [1.0, 0.82, 0.62, 0.44, 0.3, 0.19, 0.11],
    decays: [0.115, 0.082, 0.056, 0.038, 0.026, 0.017, 0.011],
    contactMs: 0.36,
    surfaceGrain: 0.32,
    bodyHz: 260,
    labelJp: '紫檀拍子木',
  },
  rin_temple_bell: {
    // Hand-hammered Japanese copper-tin bronze Temple Rin-Bell (authentic kirchhoff shell ratios!)
    fundamentalHz: 523.25,
    ratios: [1.0, 2.756, 5.404, 8.933, 13.34],
    amps: [1.0, 0.56, 0.3, 0.15, 0.07],
    decays: [1.95, 1.15, 0.62, 0.32, 0.16],
    contactMs: 1.45, // Felt-tipped mallet contact!
    surfaceGrain: 0.08,
    doubletSplitHz: 1.85,
    bodyHz: 261.6,
    labelJp: '仏具おりん',
  },
  clockwork_escapement: {
    // Swiss/Karakuri brass lever escapement double-tick (pallet stone + brass tooth!)
    fundamentalHz: 2380,
    ratios: [1.0, 1.62, 2.48, 3.56, 4.92, 6.45],
    amps: [0.95, 0.72, 0.52, 0.35, 0.22, 0.12],
    decays: [0.028, 0.02, 0.014, 0.01, 0.007, 0.004],
    contactMs: 0.14,
    surfaceGrain: 0.18,
    labelJp: '真鍮脱進機',
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
  /** High-frequency air+surface damping ratio (>1 means warm dark decay; ~1 means bright marble) */
  hfDampingRatio: number;
  /** Reverb wet send scale for this architectural space */
  reverbSend: number;
  /** Living ambience level (linear gain) */
  ambienceGain: number;
  labelJp: string;
}

export const STAGE_ACOUSTIC_PROFILES: Record<StageId, StageAcousticProfile> = {
  zashiki: {
    stageId: 'zashiki',
    tableMaterial: 'chabudai_oak',
    roomDims: [5.4, 2.75, 4.8],
    absorption: [0.38, 0.34, 0.44], // Shoji paper + tatami absorbs highs gently
    targetRt60Sec: 0.46,
    hfDampingRatio: 2.85,
    reverbSend: 0.26,
    ambienceGain: 0.024,
    labelJp: '和室・畳吸音 (0.46s)',
  },
  salon: {
    stageId: 'salon',
    tableMaterial: 'marble_brass',
    roomDims: [10.8, 5.4, 9.2],
    absorption: [0.16, 0.19, 0.12], // Reflective marble floor & grand vault
    targetRt60Sec: 1.38,
    hfDampingRatio: 1.35,
    reverbSend: 0.42,
    ambienceGain: 0.022,
    labelJp: '大理石大広間 (1.38s)',
  },
  shrine: {
    stageId: 'shrine',
    tableMaterial: 'cedar_vermilion',
    roomDims: [12.5, 4.8, 11.0],
    absorption: [0.58, 0.24, 0.48], // Semi-open cedar eaves + courtyard moss
    targetRt60Sec: 0.92,
    hfDampingRatio: 2.1,
    reverbSend: 0.33,
    ambienceGain: 0.032,
    labelJp: '檜拝殿・外気 (0.92s)',
  },
  onsen: {
    stageId: 'onsen',
    tableMaterial: 'limestone_travertine',
    roomDims: [8.4, 4.2, 7.6],
    absorption: [0.18, 0.22, 0.14], // Wet limestone rock + water surface bounce
    targetRt60Sec: 1.52,
    hfDampingRatio: 1.6,
    reverbSend: 0.46,
    ambienceGain: 0.058, // Authentic living limestone waterfall bed!
    labelJp: '岩窟湯殿・滝 (1.52s)',
  },
  atelier: {
    stageId: 'atelier',
    tableMaterial: 'brick_iron',
    roomDims: [6.8, 3.8, 6.2],
    absorption: [0.24, 0.28, 0.22], // Glazed brick vault studio punch
    targetRt60Sec: 0.78,
    hfDampingRatio: 1.75,
    reverbSend: 0.34,
    ambienceGain: 0.022,
    labelJp: '煉瓦書斎残響 (0.78s)',
  },
};
