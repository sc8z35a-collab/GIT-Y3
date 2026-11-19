/**
 * Graphics Configuration & Telemetry Types for JANKEN KIWAMI 3D.
 * Supports true internal render target scaling (HD / FHD / 1.5K / 2K),
 * Frame Rate pacing (60 / 120 / Unlimited), KHDR toggle, and Shadow Flame 1.0 Flash / Pro.
 */

export type ResolutionPresetId = 'hd' | 'fhd' | '1.5k' | '2k';
export type FpsLimitMode = 60 | 120 | 0; // 0 = Unlimited (無制限)
export type ShadowFlameMode = 'standard' | 'flash' | 'pro';
export type StageId = 'zashiki' | 'salon' | 'shrine' | 'onsen' | 'atelier';
export type HandMaterialPreset = 'hinoki_ivory' | 'bisque_porcelain' | 'obsidian_gold' | 'karakuri_bronze';

export interface ResolutionSpec {
  id: ResolutionPresetId;
  label: string;
  nominalWidth: number;
  nominalHeight: number;
  tagline: string;
}

export const RESOLUTION_PRESETS: Record<ResolutionPresetId, ResolutionSpec> = {
  hd: {
    id: 'hd',
    label: 'HD',
    nominalWidth: 1280,
    nominalHeight: 720,
    tagline: '1280×720 · 高速軽量',
  },
  fhd: {
    id: 'fhd',
    label: 'FHD',
    nominalWidth: 1920,
    nominalHeight: 1080,
    tagline: '1920×1080 · 標準高精細',
  },
  '1.5k': {
    id: '1.5k',
    label: '1.5K',
    nominalWidth: 2240,
    nominalHeight: 1260,
    tagline: '2240×1260 · 超高密度',
  },
  '2k': {
    id: '2k',
    label: '2K',
    nominalWidth: 2560,
    nominalHeight: 1440,
    tagline: '2560×1440 · 極致QHD',
  },
};

export const RESOLUTION_LIST: readonly ResolutionSpec[] = [
  RESOLUTION_PRESETS.hd,
  RESOLUTION_PRESETS.fhd,
  RESOLUTION_PRESETS['1.5k'],
  RESOLUTION_PRESETS['2k'],
];

export interface ShadowFlameSpec {
  id: ShadowFlameMode;
  label: string;
  shortLabel: string;
  mapSize: number;
  descriptionJp: string;
  /** Internal GLSL dispatch radius code read by ShadowFlame shader chunk */
  shaderRadiusCode: number;
  enableSSCS: boolean;
}

export const SHADOW_FLAME_SPECS: Record<ShadowFlameMode, ShadowFlameSpec> = {
  standard: {
    id: 'standard',
    label: 'Standard PCF',
    shortLabel: 'STD',
    mapSize: 1024,
    descriptionJp: '標準9タップPCF影（比較用ベースライン）',
    shaderRadiusCode: 1.0,
    enableSSCS: false,
  },
  flash: {
    id: 'flash',
    label: 'Shadow Flame 1.0 Flash',
    shortLabel: 'SF 1.0 Flash',
    mapSize: 1024,
    descriptionJp:
      '軽量・高リアリズム独自技術：IGN回転6タップVogel螺旋PCF + 深度勾配コンタクト硬化 + 解析接触陰影',
    shaderRadiusCode: 3.2,
    enableSSCS: false,
  },
  pro: {
    id: 'pro',
    label: 'Shadow Flame 1.0 Pro',
    shortLabel: 'SF 1.0 Pro',
    mapSize: 2048,
    descriptionJp:
      '最上位物理影技術：10タップPCSSブロッカー探索可変半影 + 16タップVogel PCF + 深度レイマーチ極微影(SF-SSCS)',
    shaderRadiusCode: 7.5,
    enableSSCS: true,
  },
};

export type JHandModeSetting = 'biomech_ultra' | 'biomech_pro' | 'standard';
export type JSoundModeSetting = 'ultra' | 'pro' | 'lite';

export interface GraphicsSettings {
  resolution: ResolutionPresetId;
  fpsLimit: FpsLimitMode;
  khdrEnabled: boolean;
  khdrSplitCompare: boolean;
  shadowFlame: ShadowFlameMode;
  stage: StageId;
  playerHandMaterial: HandMaterialPreset;
  npcHandMaterial: HandMaterialPreset;
  jhandMode: JHandModeSetting;
  jsoundQuality: JSoundModeSetting;
  jsoundAmbience: boolean;
}

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  resolution: 'fhd',
  fpsLimit: 0,
  khdrEnabled: true,
  khdrSplitCompare: false,
  shadowFlame: 'pro',
  stage: 'zashiki',
  playerHandMaterial: 'hinoki_ivory',
  npcHandMaterial: 'karakuri_bronze',
  jhandMode: 'biomech_ultra',
  jsoundQuality: 'ultra',
  jsoundAmbience: true,
};

export interface RenderMetrics {
  fps: number;
  frameTimeMs: number;
  onePercentLowFps: number;
  renderWidth: number;
  renderHeight: number;
  drawCalls: number;
  triangles: number;
  shadowMapSize: number;
  khdrActive: boolean;
  shadowFlameMode: ShadowFlameMode;
  jhandDof: number;
  jhandPalmCupDeg: number;
  jhandOrlRatio: number;
  jhandIcrGlideMm: number;
  jhandFdiPct: number;
  jhandSynergyJp: string;
  jsoundRt60Sec: number;
  jsoundEarlyRays: number;
  jsoundDspRateKhz: number;
  jsoundVoices: number;
  jsoundPeakDb: number;
  jsoundMaterialPair: string;
  jsoundLastEventJp: string;
}

/**
 * Compute exact aspect-matched internal framebuffer dimensions for a chosen
 * resolution preset, clamped safely to the GPU's maximum supported texture size.
 */
export function computeRenderDimensions(
  preset: ResolutionPresetId,
  viewportWidth: number,
  viewportHeight: number,
  maxTextureSize = 4096
): { width: number; height: number } {
  const spec = RESOLUTION_PRESETS[preset];
  const aspect = Math.max(0.5, Math.min(3.0, viewportWidth / Math.max(1, viewportHeight)));

  let height = spec.nominalHeight;
  let width = Math.round(height * aspect);

  // If ultra-wide, cap width proportionally to preserve nominal pixel budget
  const maxW = Math.min(maxTextureSize, Math.round(spec.nominalWidth * 1.35));
  if (width > maxW) {
    width = maxW;
    height = Math.round(width / aspect);
  }

  // Ensure even dimensions for crisp half-res KHDR luminance passes
  width = Math.max(320, Math.min(maxTextureSize, width - (width % 2)));
  height = Math.max(240, Math.min(maxTextureSize, height - (height % 2)));

  return { width, height };
}
