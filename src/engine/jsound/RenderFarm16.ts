/**
 * ★ JSound Engin 1.6 — Zero-Jank Predictive Render Farm: pure job model ★
 *
 * Profiling 1.5 showed that a single Ultra-quality clash reveal synthesised ~450–650 ms of physical
 * models (2D-FDTD clash, taiko, rin bells, suzu…) synchronously on the main thread *at the exact
 * frame of the "PON!" reveal* — freezing the climax and delaying the sound. 1.6 turns every
 * timing-critical sound into a serialisable `RenderJob` that a Web Worker pool renders ahead of
 * time (predictive JIT at decision time + a background pool), so the reveal frame does zero DSP.
 *
 * This module is DOM-free so it runs in Node tests, in the worker, and on the main thread.
 */

import {
  synthesizeAtarigane,
  synthesizeBinzasara,
  synthesizeBiwaStrum,
  synthesizeBonshoBell,
  synthesizeDoraGong,
  synthesizeHoragai,
  synthesizeIchigenkin,
  synthesizeKakkoRoll,
  synthesizeKatanaDraw,
  synthesizeKokyu,
  synthesizeKotoArpeggio,
  synthesizeKotsuzumi,
  synthesizeNokan,
  synthesizeOtsuzumi,
  synthesizeRyutekiPhrase,
  synthesizeShakuhachiBreath,
  synthesizeShakujo,
  synthesizeShamisenPhrase,
  synthesizeShimeDaiko,
  synthesizeShinobuePhrase,
  synthesizeShoCluster,
  synthesizeSuzuShimmer,
  synthesizeTaikoDrum,
  synthesizeThunderTaiko,
  synthesizeWashiTear,
} from './InstrumentSynthesizer';
import { synthesizeDualMaterialClash, synthesizeRinBellNote } from './ModalSynthesizer';
import { AcousticMaterialId, JSoundQualityMode, Vec3 } from './types';
import type { Spatial4DTrajectoryKind } from './Spatial4DEngine';

export type RenderJobKind =
  | 'dual_clash'
  | 'taiko'
  | 'shime_daiko'
  | 'kotsuzumi'
  | 'otsuzumi'
  | 'dora'
  | 'washi_tear'
  | 'ichigenkin'
  | 'binzasara'
  | 'suzu'
  | 'shakujo'
  | 'rin'
  | 'katana'
  | 'shamisen_phrase'
  | 'atarigane'
  | 'nokan'
  | 'ryuteki'
  | 'shinobue'
  | 'biwa'
  | 'kakko'
  | 'bonsho'
  | 'koto_arp'
  | 'kokyu'
  | 'shakuhachi'
  | 'sho'
  | 'horagai'
  | 'thunder';

export const CLASH_LAYER_KINDS: readonly RenderJobKind[] = [
  'dual_clash',
  'taiko',
  'shime_daiko',
  'kotsuzumi',
  'otsuzumi',
  'dora',
  'washi_tear',
  'ichigenkin',
  'binzasara',
  'suzu',
  'shakujo',
  'rin',
  'katana',
  'shamisen_phrase',
  'atarigane',
  'nokan',
  'ryuteki',
  'shinobue',
  'biwa',
  'kakko',
  'bonsho',
  'koto_arp',
  'kokyu',
  'shakuhachi',
  'sho',
  'horagai',
  'thunder',
];

export interface RenderJob {
  kind: RenderJobKind;
  sampleRate: number;
  quality: JSoundQualityMode;
  seed: number;
  args: Array<number | string>;
}

export interface RenderedAudio {
  left: Float32Array;
  right: Float32Array | null;
}

/** Execute one render job (pure; identical in worker, main thread and Node). */
export function runRenderJob(job: RenderJob): RenderedAudio {
  const sr = job.sampleRate;
  const q = job.quality;
  const seed = job.seed >>> 0;
  const a = job.args;
  const num = (i: number, d: number): number => (typeof a[i] === 'number' ? (a[i] as number) : d);
  const str = <T extends string>(i: number, d: T): T => (typeof a[i] === 'string' ? (a[i] as T) : d);
  const rest = (from: number, d: number[]): number[] => {
    const out: number[] = [];
    for (let i = from; i < a.length; i++) if (typeof a[i] === 'number') out.push(a[i] as number);
    return out.length > 0 ? out : d;
  };
  let r: { left: Float32Array; right?: Float32Array };
  switch (job.kind) {
    case 'dual_clash': {
      const outcome = str<'WIN' | 'LOSS' | 'DRAW'>(4, 'DRAW');
      const winner = num(3, 0) as 0 | 1 | 2;
      r = synthesizeDualMaterialClash(
        str<AcousticMaterialId>(0, 'living_skin' as AcousticMaterialId),
        str<AcousticMaterialId>(1, 'karakuri_bronze' as AcousticMaterialId),
        str<AcousticMaterialId>(2, 'chabudai_oak' as AcousticMaterialId),
        winner,
        outcome,
        sr,
        q,
        seed,
        num(5, 0)
      );
      break;
    }
    case 'taiko':
      r = synthesizeTaikoDrum(str<'odaiko' | 'shime' | 'heartbeat'>(0, 'shime'), sr, num(1, 1.0), q, seed);
      break;
    case 'shime_daiko':
      r = synthesizeShimeDaiko(sr, num(0, 1.0), q, seed);
      break;
    case 'kotsuzumi':
      r = synthesizeKotsuzumi(sr, {
        variant: str<'pon_rise' | 'pon_drop' | 'ta_tight'>(0, 'pon_rise'),
        velocity: num(1, 0.9),
        quality: q,
        seed,
      });
      break;
    case 'otsuzumi':
      r = synthesizeOtsuzumi(sr, num(0, 0.9), q, seed);
      break;
    case 'dora':
      r = synthesizeDoraGong(sr, num(0, 0.7), q, seed);
      break;
    case 'washi_tear':
      r = synthesizeWashiTear(sr, num(0, 1.0), seed);
      break;
    case 'ichigenkin':
      r = synthesizeIchigenkin(num(0, 293.66), sr, num(1, 1.15), num(2, 0.65), q, seed);
      break;
    case 'binzasara':
      r = synthesizeBinzasara(sr, num(0, 0.78), q, seed);
      break;
    case 'suzu':
      r = synthesizeSuzuShimmer(sr, num(0, 0.52), q, seed);
      break;
    case 'shakujo':
      r = synthesizeShakujo(sr, num(0, 0.55), q, seed);
      break;
    case 'rin':
      r = synthesizeRinBellNote(num(0, 523.25), sr, num(1, 1.55), num(2, 0.58), q, seed);
      break;
    case 'katana':
      r = synthesizeKatanaDraw(sr, num(0, 1.0), q, seed);
      break;
    case 'shamisen_phrase':
      r = synthesizeShamisenPhrase(rest(2, [220.0, 293.66, 329.63]), sr, num(0, 0.072), num(1, 0.94), q, seed);
      break;
    case 'atarigane':
      r = synthesizeAtarigane(sr, str<'open' | 'damped' | 'double'>(0, 'damped'), num(1, 0.82), q, seed);
      break;
    case 'nokan':
      r = synthesizeNokan(num(0, 880.0), sr, num(1, 1.2), num(2, 0.66), seed);
      break;
    case 'ryuteki':
      r = synthesizeRyutekiPhrase(num(0, 587.33), sr, num(1, 1.15), num(2, 0.68), seed);
      break;
    case 'shinobue':
      r = synthesizeShinobuePhrase(num(0, 783.99), sr, num(1, 1.05), num(2, 0.66), seed);
      break;
    case 'biwa':
      r = synthesizeBiwaStrum(num(0, 146.83), sr, num(1, 0.88), num(2, 1.65), q, seed);
      break;
    case 'kakko':
      r = synthesizeKakkoRoll(sr, num(0, 0.78), q, seed);
      break;
    case 'bonsho':
      r = synthesizeBonshoBell(num(0, 130.81), sr, num(1, 2.8), num(2, 0.88), q, seed);
      break;
    case 'koto_arp':
      r = synthesizeKotoArpeggio(rest(2, [293.66, 329.63, 440.0]), num(0, 0.072), sr, num(1, 0.78), seed);
      break;
    case 'kokyu':
      r = synthesizeKokyu(num(0, 329.63), sr, num(1, 1.85), num(2, 0.62), seed);
      break;
    case 'shakuhachi':
      r = synthesizeShakuhachiBreath(num(0, 293.66), sr, num(1, 1.9), num(2, 0.58), seed);
      break;
    case 'sho':
      r = synthesizeShoCluster(rest(2, [440.0, 523.25, 659.25, 783.99]), sr, num(0, 0.72), num(1, 0.6), seed);
      break;
    case 'horagai':
      r = synthesizeHoragai(num(0, 220.0), sr, num(1, 1.45), num(2, 0.6), seed);
      break;
    case 'thunder':
      r = synthesizeThunderTaiko(sr, num(0, 0.82), seed);
      break;
    default:
      throw new Error(`Unknown render job kind: ${String((job as RenderJob).kind)}`);
  }
  return { left: r.left, right: r.right ?? null };
}

/** How a planned layer is spatialised when it is finally played. */
export interface PlannedLayer {
  /** Cache key WITHOUT the seed (all seeds of a key are interchangeable variations). */
  key: string;
  job: RenderJob;
  pos: Vec3;
  gain: number;
  reverbScale: number;
  delaySec?: number;
  endPos?: Vec3;
  trajectory4D?: Spatial4DTrajectoryKind;
  trajectoryRadius?: number;
  travelSec?: number;
  enableDoppler?: boolean;
  /** Core layers play even if they arrive late; ornamental layers are skipped when too late. */
  critical: boolean;
  /** Voice priority (0 ambient … 3 critical). */
  priority: number;
}

export interface ClashPlanParams {
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  winnerMove: number; // 0 Rock, 1 Scissors, 2 Paper
  isMatchPoint: boolean;
  variant: number;
  playerMat: string;
  npcMat: string;
  tableMat: string;
  quality: JSoundQualityMode;
  sampleRate: number;
  seedBase: number;
}

function job(
  kind: RenderJobKind,
  p: { quality: JSoundQualityMode; sampleRate: number },
  seed: number,
  args: Array<number | string>
): RenderJob {
  return { kind, sampleRate: p.sampleRate, quality: p.quality, seed: seed >>> 0, args };
}

/**
 * Plan the exact layer stack that 1.5's `playClashImpact` produced (same instruments, positions,
 * gains, 4D trajectories), but as serialisable jobs.
 */
export function planClashLayers(p: ClashPlanParams): PlannedLayer[] {
  const layers: PlannedLayer[] = [];
  const v = p.variant;
  const qk = `${p.quality}@${p.sampleRate}`;
  let s = p.seedBase >>> 0;
  const nextSeed = (): number => {
    s = (s + 7919) >>> 0;
    return s;
  };

  layers.push({
    key: `clash|${p.outcome}|${p.winnerMove}|v${v % 6}|${p.playerMat}|${p.npcMat}|${p.tableMat}|${qk}`,
    job: job('dual_clash', p, nextSeed(), [p.playerMat, p.npcMat, p.tableMat, p.winnerMove, p.outcome, v]),
    pos: { x: 0, y: 0.26, z: 0.08 },
    gain: 0.9,
    reverbScale: 1.18,
    critical: true,
    priority: 3,
  });

  if (p.outcome === 'DRAW') {
    const even = v % 2 === 0;
    layers.push({
      key: even ? `kotsuzumi|pon_rise|0.92|${qk}` : `otsuzumi|0.92|${qk}`,
      job: even ? job('kotsuzumi', p, nextSeed(), ['pon_rise', 0.92]) : job('otsuzumi', p, nextSeed(), [0.92]),
      pos: { x: 0, y: 0.42, z: -0.15 },
      gain: 0.56,
      reverbScale: 1.12,
      critical: true,
      priority: 3,
    });
  } else if (p.winnerMove === 0) {
    const taikoJob = p.isMatchPoint
      ? job('taiko', p, nextSeed(), ['odaiko', 1.25])
      : v % 2 === 0
      ? job('taiko', p, nextSeed(), ['shime', 1.02])
      : job('shime_daiko', p, nextSeed(), [1.05]);
    layers.push({
      key: `${taikoJob.kind}|${taikoJob.args.join(',')}|${qk}`,
      job: taikoJob,
      pos: { x: 0, y: 0.22, z: -0.2 },
      gain: p.isMatchPoint ? 0.7 : 0.56,
      reverbScale: 1.28,
      critical: true,
      priority: 3,
    });
    if (p.isMatchPoint || v % 3 === 0) {
      layers.push({
        key: `dora|0.65|${qk}`,
        job: job('dora', p, nextSeed(), [0.65]),
        pos: { x: -0.35, y: 0.65, z: -0.6 },
        gain: 0.3,
        reverbScale: 1.48,
        delaySec: 0.03,
        trajectory4D: 'orbit_360',
        trajectoryRadius: 1.5,
        travelSec: 1.45,
        critical: false,
        priority: 2,
      });
    }
  } else if (p.winnerMove === 1) {
    layers.push({
      key: `washi|1.0|${p.sampleRate}`,
      job: job('washi_tear', p, nextSeed(), [1.0]),
      pos: { x: 0, y: 0.34, z: 0.1 },
      gain: 0.62,
      reverbScale: 0.92,
      delaySec: 0.014,
      trajectory4D: 'stereo_sweep',
      trajectoryRadius: 1.1,
      travelSec: 0.26,
      critical: true,
      priority: 3,
    });
    if (v % 2 === 1) {
      layers.push({
        key: `shime_daiko|0.85|${qk}`,
        job: job('shime_daiko', p, nextSeed(), [0.85]),
        pos: { x: 0.2, y: 0.45, z: -0.18 },
        gain: 0.4,
        reverbScale: 1.05,
        critical: false,
        priority: 2,
      });
    }
  } else {
    layers.push({
      key: `kotsuzumi|pon_drop|0.84|${qk}`,
      job: job('kotsuzumi', p, nextSeed(), ['pon_drop', 0.84]),
      pos: { x: 0, y: 0.36, z: -0.1 },
      gain: 0.48,
      reverbScale: 1.08,
      critical: true,
      priority: 3,
    });
    if (v % 2 === 0) {
      const hz = p.outcome === 'WIN' ? 392.0 : 293.66;
      layers.push({
        key: `ichigenkin|${hz}|${qk}`,
        job: job('ichigenkin', p, nextSeed(), [hz, 1.15, 0.65]),
        pos: { x: 0.28, y: 0.56, z: -0.35 },
        gain: 0.28,
        reverbScale: 1.32,
        delaySec: 0.035,
        trajectory4D: 'overhead_arc',
        trajectoryRadius: 1.35,
        travelSec: 1.05,
        critical: false,
        priority: 2,
      });
    } else {
      layers.push({
        key: `binzasara|0.78|${qk}`,
        job: job('binzasara', p, nextSeed(), [0.78]),
        pos: { x: 0, y: 0.52, z: -0.22 },
        gain: 0.34,
        reverbScale: 1.18,
        delaySec: 0.025,
        trajectory4D: 'overhead_arc',
        trajectoryRadius: 1.45,
        travelSec: 0.62,
        critical: false,
        priority: 2,
      });
    }
  }

  if (p.outcome === 'WIN' || p.isMatchPoint) {
    const vel = p.isMatchPoint ? 0.85 : v % 3 === 2 ? 0.55 : 0.52;
    const kind: RenderJobKind = v % 3 === 2 ? 'shakujo' : 'suzu';
    layers.push({
      key: `${kind}|${vel}|${qk}`,
      job: job(kind, p, nextSeed(), [vel]),
      pos: { x: 0, y: 0.75, z: -0.1 },
      gain: 0.28,
      reverbScale: 1.3,
      delaySec: 0.035,
      trajectory4D: 'spiral_ascend',
      trajectoryRadius: 1.35,
      travelSec: 0.95,
      critical: false,
      priority: 2,
    });
  }

  const notes = p.outcome === 'WIN' ? [523.25, 659.25, 783.99] : p.outcome === 'LOSS' ? [392.0, 311.13] : [440.0, 587.33];
  const dur = p.outcome === 'WIN' ? 1.55 : 1.1;
  const vel = p.outcome === 'WIN' ? 0.58 : 0.42;
  notes.forEach((hz, idx) => {
    layers.push({
      key: `rin|${hz}|${dur}|${vel}|${qk}`,
      job: job('rin', p, nextSeed(), [hz, dur, vel]),
      pos: { x: (idx - 1) * 0.48, y: 0.78, z: -0.35 },
      gain: p.outcome === 'WIN' ? 0.34 : 0.26,
      reverbScale: 1.4,
      delaySec: 0.04 + idx * 0.055,
      trajectory4D: p.outcome === 'WIN' && idx === notes.length - 1 ? 'overhead_arc' : undefined,
      trajectoryRadius: 1.4,
      travelSec: 1.25,
      critical: idx === 0,
      priority: 2,
    });
  });
  return layers;
}

/** Extra layers that Overdrive (極一撃) adds on top of the clash stack. */
export function planOverdriveExtras(
  outcome: 'WIN' | 'LOSS' | 'DRAW',
  p: { quality: JSoundQualityMode; sampleRate: number; seedBase: number }
): PlannedLayer[] {
  const qk = `${p.quality}@${p.sampleRate}`;
  const s = p.seedBase >>> 0;
  const shamNotes = outcome === 'WIN' ? [220.0, 293.66, 329.63, 440.0] : [220.0, 196.0, 164.81];
  return [
    {
      key: `katana|1.08|${qk}`,
      job: job('katana', p, s + 11, [1.08]),
      pos: { x: -0.7, y: 0.4, z: 0.25 },
      gain: 0.46,
      reverbScale: 1.25,
      endPos: { x: 0.7, y: 0.45, z: -0.25 },
      trajectory4D: 'overhead_arc',
      trajectoryRadius: 1.65,
      travelSec: 0.46,
      enableDoppler: true,
      critical: true,
      priority: 3,
    },
    {
      key: `dora|0.85|${qk}`,
      job: job('dora', p, s + 23, [0.85]),
      pos: { x: -0.35, y: 0.72, z: -0.55 },
      gain: 0.34,
      reverbScale: 1.52,
      delaySec: 0.03,
      trajectory4D: 'orbit_360',
      trajectoryRadius: 1.75,
      travelSec: 1.6,
      enableDoppler: false,
      critical: false,
      priority: 2,
    },
    {
      key: `shamisen|${shamNotes.join(',')}|${qk}`,
      job: job('shamisen_phrase', p, s + 37, [0.072, 0.94, ...shamNotes]),
      pos: { x: 0.18, y: 0.5, z: -0.22 },
      gain: 0.46,
      reverbScale: 1.22,
      delaySec: 0.05,
      critical: false,
      priority: 2,
    },
  ];
}

/** Win-streak flourish (2: atarigane → 3: flute → 4: biwa → 5+: kakko). */
export function planComboFlourish(
  streak: number,
  p: { quality: JSoundQualityMode; sampleRate: number; seedBase: number }
): PlannedLayer[] {
  if (streak < 2) return [];
  const qk = `${p.quality}@${p.sampleRate}`;
  const s = p.seedBase >>> 0;
  const out: PlannedLayer[] = [];
  const mode = streak >= 3 ? 'open' : 'damped';
  out.push({
    key: `atarigane|${mode}|${qk}`,
    job: job('atarigane', p, s + 3, [mode, 0.82]),
    pos: { x: 0.35, y: 0.68, z: -0.35 },
    gain: 0.34,
    reverbScale: 1.25,
    delaySec: 0.09,
    critical: false,
    priority: 2,
  });
  if (streak >= 3) {
    const flute: RenderJob =
      streak >= 5
        ? job('nokan', p, s + 5, [880.0, 1.2, 0.66])
        : streak % 2 === 1
        ? job('ryuteki', p, s + 5, [587.33, 1.15, 0.68])
        : job('shinobue', p, s + 5, [783.99, 1.05, 0.66]);
    out.push({
      key: `${flute.kind}|${flute.args.join(',')}|${qk}`,
      job: flute,
      pos: { x: -0.25, y: 0.88, z: -0.45 },
      gain: 0.36,
      reverbScale: 1.42,
      delaySec: 0.14,
      trajectory4D: 'overhead_arc',
      trajectoryRadius: 1.45,
      travelSec: 1.05,
      critical: false,
      priority: 2,
    });
  }
  if (streak >= 4) {
    out.push({
      key: `biwa|146.83|${qk}`,
      job: job('biwa', p, s + 7, [146.83, 0.88, 1.65]),
      pos: { x: 0, y: 0.48, z: -0.3 },
      gain: 0.38,
      reverbScale: 1.32,
      delaySec: 0.06,
      critical: false,
      priority: 2,
    });
  }
  if (streak >= 5) {
    out.push({
      key: `kakko|0.78|${qk}`,
      job: job('kakko', p, s + 9, [0.78]),
      pos: { x: 0.25, y: 0.42, z: -0.35 },
      gain: 0.34,
      reverbScale: 1.15,
      delaySec: 0.1,
      critical: false,
      priority: 2,
    });
  }
  return out;
}

/** Grand match finale chord (victory or defeat). */
export function planVictoryChord(
  playerWon: boolean,
  p: { quality: JSoundQualityMode; sampleRate: number; seedBase: number }
): PlannedLayer[] {
  const qk = `${p.quality}@${p.sampleRate}`;
  let s = p.seedBase >>> 0;
  const ns = (): number => {
    s = (s + 104729) >>> 0;
    return s;
  };
  const out: PlannedLayer[] = [
    {
      key: `bonsho|${playerWon ? 130.81 : 110}|${qk}`,
      job: job('bonsho', p, ns(), [playerWon ? 130.81 : 110.0, 2.8, playerWon ? 0.88 : 0.65]),
      pos: { x: 0, y: 1.15, z: -1.1 },
      gain: 0.46,
      reverbScale: 1.68,
      trajectory4D: 'orbit_360',
      trajectoryRadius: 1.85,
      travelSec: 2.5,
      enableDoppler: false,
      critical: true,
      priority: 3,
    },
  ];
  if (playerWon) {
    out.push(
      {
        key: `koto_arp|victory|${qk}`,
        job: job('koto_arp', p, ns(), [0.072, 0.78, 293.66, 329.63, 440.0, 523.25, 587.33, 659.25, 880.0]),
        pos: { x: 0, y: 0.65, z: -0.4 },
        gain: 0.48,
        reverbScale: 1.48,
        delaySec: 0.08,
        critical: true,
        priority: 3,
      },
      {
        key: `ryuteki|587.33|1.5|${qk}`,
        job: job('ryuteki', p, ns(), [587.33, 1.5, 0.58]),
        pos: { x: -0.35, y: 0.95, z: -0.6 },
        gain: 0.32,
        reverbScale: 1.58,
        delaySec: 0.22,
        trajectory4D: 'overhead_arc',
        trajectoryRadius: 1.65,
        travelSec: 1.4,
        critical: false,
        priority: 2,
      },
      {
        key: `suzu|0.92|${qk}`,
        job: job('suzu', p, ns(), [0.92]),
        pos: { x: 0, y: 0.9, z: -0.2 },
        gain: 0.36,
        reverbScale: 1.52,
        delaySec: 0.16,
        trajectory4D: 'spiral_ascend',
        trajectoryRadius: 1.55,
        travelSec: 1.4,
        critical: false,
        priority: 2,
      }
    );
    [523.25, 659.25, 783.99, 1046.5].forEach((hz, idx) => {
      out.push({
        key: `rin|${hz}|2.35|0.72|${qk}`,
        job: job('rin', p, ns(), [hz, 2.35, 0.72]),
        pos: { x: (idx - 1.5) * 0.55, y: 0.88, z: -0.45 },
        gain: 0.38,
        reverbScale: 1.55,
        delaySec: 0.1 + idx * 0.095,
        critical: false,
        priority: 2,
      });
    });
  } else {
    out.push(
      {
        key: `kokyu|329.63|${qk}`,
        job: job('kokyu', p, ns(), [329.63, 1.85, 0.62]),
        pos: { x: -0.25, y: 0.82, z: -0.55 },
        gain: 0.34,
        reverbScale: 1.52,
        delaySec: 0.08,
        trajectory4D: 'overhead_arc',
        trajectoryRadius: 1.45,
        travelSec: 1.65,
        enableDoppler: false,
        critical: true,
        priority: 3,
      },
      {
        key: `shakuhachi|293.66|${qk}`,
        job: job('shakuhachi', p, ns(), [293.66, 1.9, 0.58]),
        pos: { x: 0.25, y: 0.85, z: -0.6 },
        gain: 0.4,
        reverbScale: 1.5,
        delaySec: 0.16,
        critical: false,
        priority: 2,
      },
      {
        key: `dora|0.55|${qk}`,
        job: job('dora', p, ns(), [0.55]),
        pos: { x: 0.35, y: 0.9, z: -0.9 },
        gain: 0.3,
        reverbScale: 1.6,
        delaySec: 0.06,
        critical: false,
        priority: 2,
      }
    );
    [329.63, 293.66, 220.0].forEach((hz, idx) => {
      out.push({
        key: `rin|${hz}|2.1|0.52|${qk}`,
        job: job('rin', p, ns(), [hz, 2.1, 0.52]),
        pos: { x: (idx - 1) * 0.5, y: 0.82, z: -0.45 },
        gain: 0.3,
        reverbScale: 1.55,
        delaySec: idx * 0.11,
        critical: false,
        priority: 2,
      });
    });
  }
  return out;
}

/** Spirit charge (気迫) cue; `engaged` = Overdrive 極一撃 armed. */
export function planSpiritCharge(
  level: number,
  engaged: boolean,
  p: { quality: JSoundQualityMode; sampleRate: number; seedBase: number }
): PlannedLayer[] {
  const qk = `${p.quality}@${p.sampleRate}`;
  const s = p.seedBase >>> 0;
  const clamped = Math.max(0.15, Math.min(1.0, level));
  const vel = Math.round((0.52 + clamped * 0.32) * 100) / 100;
  const notes = engaged ? [440.0, 493.88, 587.33, 659.25, 739.99, 880.0] : [440.0, 523.25, 659.25, 783.99];
  const dur = engaged ? 1.55 : 0.72;
  const out: PlannedLayer[] = [
    {
      key: `sho|${engaged ? 'od' : 'charge'}|${vel}|${qk}`,
      job: job('sho', p, s + 1, [dur, vel, ...notes]),
      pos: { x: 0, y: 0.78, z: -0.5 },
      gain: engaged ? 0.52 : 0.34,
      reverbScale: 1.52,
      trajectory4D: engaged ? 'spiral_ascend' : undefined,
      trajectoryRadius: 1.6,
      travelSec: 1.45,
      enableDoppler: false,
      critical: true,
      priority: 3,
    },
  ];
  if (engaged) {
    out.push(
      {
        key: `katana|0.98|${qk}`,
        job: job('katana', p, s + 2, [0.98]),
        pos: { x: -0.65, y: 0.34, z: 0.25 },
        gain: 0.56,
        reverbScale: 1.15,
        endPos: { x: 0.35, y: 0.44, z: -0.1 },
        trajectory4D: 'converge_impact',
        trajectoryRadius: 1.5,
        travelSec: 0.48,
        enableDoppler: true,
        critical: true,
        priority: 3,
      },
      {
        key: `horagai|220|${qk}`,
        job: job('horagai', p, s + 3, [220.0, 1.45, 0.6]),
        pos: { x: 0.4, y: 0.95, z: -0.85 },
        gain: 0.32,
        reverbScale: 1.58,
        delaySec: 0.06,
        critical: false,
        priority: 2,
      },
      {
        key: `thunder|0.82|${p.sampleRate}`,
        job: job('thunder', p, s + 4, [0.82]),
        pos: { x: 0, y: 0.35, z: -0.55 },
        gain: 0.48,
        reverbScale: 1.25,
        delaySec: 0.08,
        critical: false,
        priority: 2,
      }
    );
  }
  return out;
}

// =============================================================================
// Synthesis budget governor
// =============================================================================

const QUALITY_LADDER: JSoundQualityMode[] = ['ultra', 'pro', 'lite'];

/**
 * Watches how long physical-model renders take on *this* device and steps the render quality down
 * (ultra → pro → lite) when it would miss its budget, then probes upward again once renders are
 * comfortably fast. The user's chosen quality is the ceiling; the governor never exceeds it.
 */
export class SynthesisBudgetGovernor {
  private readonly budgetMs: number;
  private readonly ema = new Map<JSoundQualityMode, number>();
  private fastStreak = 0;
  private cap: JSoundQualityMode = 'ultra';

  constructor(opts: { budgetMs: number }) {
    this.budgetMs = opts.budgetMs;
  }

  public report(quality: JSoundQualityMode, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const prev = this.ema.get(quality);
    const next = prev === undefined ? ms : prev * 0.6 + ms * 0.4;
    this.ema.set(quality, next);
    if (quality === this.cap && next < this.budgetMs * 0.3) {
      this.fastStreak++;
      if (this.fastStreak >= 20) {
        this.fastStreak = 0;
        const idx = QUALITY_LADDER.indexOf(this.cap);
        if (idx > 0) {
          const up = QUALITY_LADDER[idx - 1];
          this.ema.delete(up); // forget stale slow measurement; probe again
          this.cap = up;
        }
      }
    } else if (quality === this.cap) {
      this.fastStreak = 0;
    }
  }

  public effectiveQuality(requested: JSoundQualityMode): JSoundQualityMode {
    // Lower the device cap while its measured render time exceeds the budget
    let capIdx = QUALITY_LADDER.indexOf(this.cap);
    while (capIdx < QUALITY_LADDER.length - 1) {
      const est = this.ema.get(QUALITY_LADDER[capIdx]);
      if (est !== undefined && est > this.budgetMs) capIdx++;
      else break;
    }
    if (capIdx !== QUALITY_LADDER.indexOf(this.cap)) {
      this.cap = QUALITY_LADDER[capIdx];
      this.fastStreak = 0;
    }
    return QUALITY_LADDER[Math.max(QUALITY_LADDER.indexOf(requested), capIdx)];
  }

  public getCap(): JSoundQualityMode {
    return this.cap;
  }

  public getEstimateMs(quality: JSoundQualityMode): number | null {
    return this.ema.get(quality) ?? null;
  }
}

// =============================================================================
// Priority voice manager (click-free voice stealing)
// =============================================================================

export interface ManagedVoice {
  id: string;
  priority: number;
  startedAt: number;
  stop: (fadeSec: number) => void;
}

/**
 * 1.5 silently dropped any new sound once 48 voices were busy — during a busy clash that could be
 * the clash itself. 1.6 steals the oldest voice of the lowest priority (ambience first), fading it
 * out over a few milliseconds, and only rejects a request when every voice is more important.
 */
export class VoicePriorityManager {
  public readonly maxVoices: number;
  public stolenCount = 0;
  public rejectedCount = 0;
  private readonly voices = new Map<string, ManagedVoice>();

  constructor(maxVoices: number) {
    this.maxVoices = Math.max(1, maxVoices);
  }

  public get count(): number {
    return this.voices.size;
  }

  public allocate(v: ManagedVoice): boolean {
    if (this.voices.size < this.maxVoices) {
      this.voices.set(v.id, v);
      return true;
    }
    let victim: ManagedVoice | null = null;
    for (const cand of this.voices.values()) {
      if (
        victim === null ||
        cand.priority < victim.priority ||
        (cand.priority === victim.priority && cand.startedAt < victim.startedAt)
      ) {
        victim = cand;
      }
    }
    if (victim && victim.priority <= v.priority) {
      this.voices.delete(victim.id);
      this.stolenCount++;
      victim.stop(0.012);
      this.voices.set(v.id, v);
      return true;
    }
    this.rejectedCount++;
    return false;
  }

  public release(id: string): void {
    this.voices.delete(id);
  }
}
