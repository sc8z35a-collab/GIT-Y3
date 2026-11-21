/**
 * ★ FINGER S1.1 — Zoom-Adaptive Detail Engine ★
 *
 * Three cooperating layers make detail appear in proportion to the optical magnification:
 *
 *  1. `FingerS11DetailGovernor` — maps the live camera magnification to a detail tier with
 *     hysteresis (no flicker when hovering around a threshold):
 *        tier 0 標準   (< 2.5×)  S1.0 maps & meshes, shader octaves O1–O4
 *        tier 1 HD 2×  (≥ 2.5×)  2048² finger/palm + 1024² micro/nail maps, 2× tessellated meshes, O1–O6
 *        tier 2 超精細 (≥ 12×)   + corneocyte cells (O7)
 *        tier 3 顕微   (≥ 90×)   + corneocyte micro-margins (O8), all 8 octaves
 *  2. `FingerS11HDTextureStreamer` — synthesises the HD maps in two Web Workers (finger→nail,
 *     palm→micro) and uploads each as soon as it arrives. Roughness rides in the albedo alpha
 *     channel, so an HD surface costs two textures instead of S1.0's three.
 *  3. "MICRO-DERMA FRACTAL 2.0" GLSL — eight analytic octaves of skin relief (Langer folds →
 *     Rete Cutis islands → secondary furrows & pores → papillary ridges with crest pores →
 *     tertiary lines → stratum-corneum flakes → 36 µm corneocyte cells → 17 µm margins).
 *     Each octave returns its height AND exact analytic gradient; the gradients are combined with
 *     Mikkelsen's surface-gradient framework and fed into three.js's *main* PBR normal, so the
 *     sun, environment reflections and clearcoat all respond to the micro relief (S1.0 only
 *     shaded its custom add-on terms with it). Octaves fade in by pixel footprint (2.5→6 px per
 *     cycle: alias-free) and fade out when a feature is far larger than the view, so at most ~4
 *     octaves are ever evaluated per pixel at any zoom.
 */

import * as THREE from 'three';
import { S11_HD_SIZES } from './FingerS11TextureSynth';

// =============================================================================
// 1. Tier governor
// =============================================================================

export interface S11TierSpec {
  tier: 0 | 1 | 2 | 3;
  labelJp: string;
  shortJp: string;
  enterMagnification: number;
  maxOctave: number;
  geometryScale: number;
  hdTextures: boolean;
}

export const S11_TIER_SPECS: readonly S11TierSpec[] = [
  { tier: 0, labelJp: '標準ディテール', shortJp: '標準', enterMagnification: 0, maxOctave: 4, geometryScale: 1, hdTextures: false },
  { tier: 1, labelJp: 'HD 2× 精細', shortJp: 'HD 2×', enterMagnification: 2.5, maxOctave: 6, geometryScale: 2, hdTextures: true },
  { tier: 2, labelJp: '超精細（角質細胞）', shortJp: '超精細', enterMagnification: 12, maxOctave: 7, geometryScale: 2, hdTextures: true },
  { tier: 3, labelJp: '顕微（17µm）', shortJp: '顕微', enterMagnification: 90, maxOctave: 8, geometryScale: 2, hdTextures: true },
];

/** Hysteresis ratio: leave a tier only below enterMagnification / HYSTERESIS. */
export const S11_HYSTERESIS = 1.35;

export class FingerS11DetailGovernor {
  private tier = 0;

  public update(magnification: number, enabled = true): S11TierSpec {
    if (!enabled || !Number.isFinite(magnification)) {
      this.tier = 0;
      return S11_TIER_SPECS[0];
    }
    // climb
    while (this.tier < 3 && magnification >= S11_TIER_SPECS[this.tier + 1].enterMagnification) this.tier++;
    // descend with hysteresis
    while (this.tier > 0 && magnification < S11_TIER_SPECS[this.tier].enterMagnification / S11_HYSTERESIS) this.tier--;
    return S11_TIER_SPECS[this.tier];
  }

  public get current(): S11TierSpec {
    return S11_TIER_SPECS[this.tier];
  }
}

/**
 * GPU budget guard: when the frame time stays above budget at a high tier, the finest (most
 * expensive) octaves are shed one at a time; they come back when frames are fast again.
 * Returns the octave cap to use (never below 5 so the HD look is preserved).
 */
export class FingerS11FrameBudgetGovernor {
  private shed = 0;
  private slowSec = 0;
  private fastSec = 0;

  public update(dtSec: number, frameMs: number, tierMaxOctave: number): number {
    if (tierMaxOctave <= 5) {
      this.shed = 0;
      this.slowSec = 0;
      this.fastSec = 0;
      return tierMaxOctave;
    }
    if (frameMs > 26) {
      this.slowSec += dtSec;
      this.fastSec = 0;
      if (this.slowSec > 1.2 && tierMaxOctave - this.shed > 5) {
        this.shed++;
        this.slowSec = 0;
      }
    } else if (frameMs < 15) {
      this.fastSec += dtSec;
      this.slowSec = 0;
      if (this.fastSec > 2.5 && this.shed > 0) {
        this.shed--;
        this.fastSec = 0;
      }
    } else {
      this.slowSec = Math.max(0, this.slowSec - dtSec);
      this.fastSec = Math.max(0, this.fastSec - dtSec);
    }
    return Math.max(5, tierMaxOctave - this.shed);
  }

  public get shedOctaves(): number {
    return this.shed;
  }
}

// =============================================================================
// 2. HD texture streamer
// =============================================================================

export type S11SurfaceId = 'finger' | 'palm' | 'micro' | 'nail';

export interface S11HDTexture {
  albedoRough: THREE.DataTexture;
  normalHeight: THREE.DataTexture;
  size: number;
}

export type S11HDTextureSet = Partial<Record<S11SurfaceId, S11HDTexture>>;

interface StreamReply {
  id?: S11SurfaceId;
  size?: number;
  albedoRough?: Uint8ClampedArray;
  normalHeight?: Uint8ClampedArray;
  ms?: number;
  done?: boolean;
}

const SURFACE_REPEAT: Record<S11SurfaceId, [number, number]> = {
  finger: [1, 1],
  palm: [1, 1],
  micro: [1.25, 1.25],
  nail: [1, 1],
};

const SURFACE_WRAP: Record<S11SurfaceId, [THREE.Wrapping, THREE.Wrapping]> = {
  finger: [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping],
  palm: [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping],
  micro: [THREE.RepeatWrapping, THREE.RepeatWrapping],
  nail: [THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping],
};

/**
 * Lazily generates the HD tier in two workers and turns each finished surface into GPU textures.
 * Generation is started on demand (first zoom past ~1.6× or a microscope preset) — or at idle on
 * strong desktops — so phones never pay for HD unless the user actually inspects the hands.
 */
export class FingerS11HDTextureStreamer {
  private static instance: FingerS11HDTextureStreamer | null = null;
  public static get(): FingerS11HDTextureStreamer {
    if (!this.instance) this.instance = new FingerS11HDTextureStreamer();
    return this.instance;
  }

  private readonly textures: S11HDTextureSet = {};
  private started = false;
  private workers: Worker[] = [];
  private listeners: Array<(id: S11SurfaceId) => void> = [];
  public generationMs = 0;
  public failed = false;
  private maxAnisotropy = 8;

  public setMaxAnisotropy(a: number): void {
    this.maxAnisotropy = Math.max(1, Math.min(16, a));
  }

  public get isStarted(): boolean {
    return this.started;
  }

  public get readyCount(): number {
    return Object.keys(this.textures).length;
  }

  public get isComplete(): boolean {
    return this.readyCount === 4;
  }

  public getTextures(): S11HDTextureSet {
    return this.textures;
  }

  public onSurfaceReady(cb: (id: S11SurfaceId) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /** Begin streaming (idempotent). Returns false if workers are unavailable. */
  public start(): boolean {
    if (this.started) return !this.failed;
    this.started = true;
    if (typeof Worker === 'undefined') {
      this.failed = true;
      return false;
    }
    const t0 = performance.now();
    const plans: Array<Array<{ id: S11SurfaceId; size: number }>> = [
      [
        { id: 'finger', size: S11_HD_SIZES.finger },
        { id: 'nail', size: S11_HD_SIZES.nail },
      ],
      [
        { id: 'palm', size: S11_HD_SIZES.palm },
        { id: 'micro', size: S11_HD_SIZES.micro },
      ],
    ];
    let finished = 0;
    for (const plan of plans) {
      try {
        const w = new Worker(new URL('./FingerS11Texture.worker.ts', import.meta.url), {
          type: 'module',
          name: 'finger-s11-hd',
        });
        w.onmessage = (ev: MessageEvent<StreamReply>) => {
          const d = ev.data;
          if (d.done) {
            finished++;
            w.terminate();
            if (finished === plans.length) this.generationMs = Math.round(performance.now() - t0);
            return;
          }
          if (d.id && d.albedoRough && d.normalHeight && d.size) {
            this.textures[d.id] = this.createTextures(d.id, d.size, d.albedoRough, d.normalHeight);
            for (const l of this.listeners) l(d.id);
          }
        };
        w.onerror = () => {
          this.failed = true;
          w.terminate();
        };
        w.postMessage({ surfaces: plan });
        this.workers.push(w);
      } catch {
        this.failed = true;
      }
    }
    return !this.failed;
  }

  private createTextures(
    id: S11SurfaceId,
    size: number,
    albedoRough: Uint8ClampedArray,
    normalHeight: Uint8ClampedArray
  ): S11HDTexture {
    const make = (data: Uint8ClampedArray, srgb: boolean): THREE.DataTexture => {
      const tex = new THREE.DataTexture(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        size,
        size,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      );
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.flipY = false;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = SURFACE_WRAP[id][0];
      tex.wrapT = SURFACE_WRAP[id][1];
      tex.repeat.set(SURFACE_REPEAT[id][0], SURFACE_REPEAT[id][1]);
      tex.anisotropy = this.maxAnisotropy;
      tex.needsUpdate = true;
      return tex;
    };
    return { albedoRough: make(albedoRough, true), normalHeight: make(normalHeight, false), size };
  }

  public dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const t of Object.values(this.textures)) {
      t?.albedoRough.dispose();
      t?.normalHeight.dispose();
    }
  }
}

// =============================================================================
// 3. MICRO-DERMA FRACTAL 2.0 — analytic-gradient GLSL (+ exact CPU mirror for tests)
// =============================================================================

/** Octave table (frequency in cycles per local unit [m], amplitude in m). */
export const S11_OCTAVES = [
  { name: 'Langer folds', freq: 260, amp: 22e-6 },
  { name: 'Rete Cutis islands', freq: 520, amp: 16e-6 },
  { name: 'Secondary furrows & pores', freq: 1100, amp: 8e-6 },
  { name: 'Papillary ridges & crest pores / follicles', freq: 2050, amp: 22e-6 },
  { name: 'Tertiary lines', freq: 4600, amp: 3.2e-6 },
  { name: 'Stratum corneum flakes', freq: 9000, amp: 1.5e-6 },
  { name: 'Corneocyte cells (36 µm)', freq: 28000, amp: 0.55e-6 },
  { name: 'Corneocyte margins (17 µm)', freq: 60000, amp: 0.22e-6 },
] as const;

/** Pixel-footprint LOD weight of an octave (shared by GLSL and CPU mirror). */
export function s11OctaveWeight(freq: number, pxWorld: number, index: number, maxOctave: number): number {
  const ppc = 1 / Math.max(1e-9, freq * pxWorld);
  const smooth = (e0: number, e1: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const wIn = smooth(2.5, 6.0, ppc);
  const wOut = 1 - smooth(400, 1600, ppc);
  const cap = Math.max(0, Math.min(1, maxOctave - index));
  return wIn * wOut * cap;
}

// ---- CPU mirror (float64) of the GLSL relief, used to verify the analytic gradients ----

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash21(px: number, py: number): number {
  let x = fract(px * 123.34);
  let y = fract(py * 456.21);
  const d = x * (x + 45.32) + y * (y + 45.32);
  x += d;
  y += d;
  return fract(x * y);
}

function hash22(px: number, py: number): [number, number] {
  let a = fract(px * 123.34);
  let b = fract(py * 234.34);
  let c = fract(px * 345.65);
  const d = a * (a + 34.45) + b * (b + 34.45) + c * (c + 34.45);
  a += d;
  b += d;
  c += d;
  return [fract(a * b), fract(b * c)];
}

/** value noise + analytic derivative: [n, dn/dx, dn/dy] */
export function s11NoiseD(px: number, py: number): [number, number, number] {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const dux = 6 * fx * (1 - fx);
  const duy = 6 * fy * (1 - fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k3 = a - b - c + d;
  return [a + k1 * ux + k2 * uy + k3 * ux * uy, dux * (k1 + k3 * uy), duy * (k2 + k3 * ux)];
}

/** Worley F2−F1 + analytic gradient: [edge, de/dx, de/dy] */
export function s11WorleyEdgeD(px: number, py: number): [number, number, number] {
  const nx = Math.floor(px);
  const ny = Math.floor(py);
  const fx = px - nx;
  const fy = py - ny;
  let d1 = 8;
  let d2 = 8;
  let r1x = 0;
  let r1y = 0;
  let r2x = 0;
  let r2y = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const o = hash22(nx + i, ny + j);
      const rx = i + 0.14 + 0.72 * o[0] - fx;
      const ry = j + 0.14 + 0.72 * o[1] - fy;
      const d = rx * rx + ry * ry;
      if (d < d1) {
        d2 = d1;
        r2x = r1x;
        r2y = r1y;
        d1 = d;
        r1x = rx;
        r1y = ry;
      } else if (d < d2) {
        d2 = d;
        r2x = rx;
        r2y = ry;
      }
    }
  }
  const l1 = Math.max(Math.sqrt(d1), 1e-5);
  const l2 = Math.max(Math.sqrt(d2), 1e-5);
  return [l2 - l1, -r2x / l2 + r1x / l1, -r2y / l2 + r1y / l1];
}

function islandD(px: number, py: number): [number, number, number] {
  const [e, ex, ey] = s11WorleyEdgeD(px, py);
  const t = Math.max(0, Math.min(1, (e - 0.02) / 0.28));
  const s = t * t * (3 - 2 * t);
  const ds = t > 0 && t < 1 ? (6 * t * (1 - t)) / 0.28 : 0;
  return [s, ds * ex, ds * ey];
}

export interface S11ReliefParams {
  dorsal: number; // 0 volar .. 1 dorsal
  dorsalStrain: number;
  volarCompress: number;
  pxWorld: number;
  maxOctave: number;
}

/**
 * CPU mirror of `s11SkinRelief` (GLSL). Returns height (m) and its gradient in the projected
 * plane (dimensionless slope).
 */
export function evaluateS11SkinReliefCPU(qx: number, qy: number, p: S11ReliefParams): { h: number; gx: number; gy: number } {
  let h = 0;
  let gx = 0;
  let gy = 0;
  const TAU = Math.PI * 2;
  const add = (amp: number, freq: number, v: [number, number, number], w: number): void => {
    h += amp * w * v[0];
    gx += amp * freq * w * v[1];
    gy += amp * freq * w * v[2];
  };

  // O1 Langer folds (dorsal transverse, volar oblique), depth tied to tensor strain
  {
    const o = S11_OCTAVES[0];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 0, p.maxOctave);
    if (w > 0.001) {
      const n = s11NoiseD(qx * 95, qy * 95);
      const warp = 2.4 * n[0];
      const depthD = (1 + (0.16 - 1) * Math.max(0, Math.min(1, p.dorsalStrain))) * p.dorsal;
      const depthV = p.volarCompress * (1 - p.dorsal);
      const phD = TAU * o.freq * qy + warp;
      const phV = TAU * o.freq * (qy * 0.96 + qx * 0.29) + warp * 1.2;
      const value = 0.5 + 0.5 * Math.cos(phD) * depthD + 0.5 * Math.cos(phV) * depthV;
      // d/dq of warp: 2.4·∇n·95 (lattice -> meters, then / freq to express in lattice units)
      const wx = (2.4 * n[1] * 95) / o.freq;
      const wy = (2.4 * n[2] * 95) / o.freq;
      const sD = -0.5 * Math.sin(phD) * depthD;
      const sV = -0.5 * Math.sin(phV) * depthV;
      const dx = sD * wx + sV * (TAU * 0.29 + 1.2 * wx);
      const dy = sD * (TAU + wy) + sV * (TAU * 0.96 + 1.2 * wy);
      add(o.amp, o.freq, [value, dx, dy], w);
    }
  }
  // O2 Rete Cutis islands
  {
    const o = S11_OCTAVES[1];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 1, p.maxOctave);
    if (w > 0.001) add(o.amp, o.freq, islandD(qx * o.freq, qy * o.freq), w);
  }
  // O3 secondary furrows + eccrine pore dips
  {
    const o = S11_OCTAVES[2];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 2, p.maxOctave);
    if (w > 0.001) {
      const isl = islandD(qx * o.freq + 13.1, qy * o.freq + 7.4);
      const n = s11NoiseD(qx * o.freq * 1.07 + 5.2, qy * o.freq * 1.07 + 19.8);
      const dip = n[0] < 0.18 ? [-(0.18 - n[0]) * 1.65, 1.65 * n[1] * 1.07, 1.65 * n[2] * 1.07] : [0, 0, 0];
      add(o.amp, o.freq, [isl[0] + dip[0], isl[1] + dip[1], isl[2] + dip[2]], w);
    }
  }
  // O4 papillary ridges with crest pores (volar) / follicle pits (dorsal)
  {
    const o = S11_OCTAVES[3];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 3, p.maxOctave);
    if (w > 0.001) {
      const n = s11NoiseD(qx * 210, qy * 210);
      const phase = TAU * o.freq * qy + 1.6 * Math.sin(TAU * 0.2 * o.freq * qx) + 3.0 * n[0];
      const dphx = 1.6 * Math.cos(TAU * 0.2 * o.freq * qx) * TAU * 0.2 + (3.0 * n[1] * 210) / o.freq;
      const dphy = TAU + (3.0 * n[2] * 210) / o.freq;
      const sv = Math.sin(phase);
      const a = 0.35;
      const b = 0.65;
      const den = a + b * Math.abs(sv);
      const ridge = sv / den;
      const dRidge = (a / (den * den)) * Math.cos(phase);
      const volar = 1 - p.dorsal;
      add(o.amp, o.freq, [ridge * volar, dRidge * dphx * volar, dRidge * dphy * volar], w);
      const fol = s11NoiseD(qx * o.freq * 0.5 + 3.3, qy * o.freq * 0.5 + 8.1);
      if (fol[0] < 0.08 && p.dorsal > 0.01) {
        add(o.amp * 0.6 * p.dorsal, o.freq, [-(0.08 - fol[0]) * 6.0, 6.0 * fol[1] * 0.5, 6.0 * fol[2] * 0.5], w);
      }
    }
  }
  // O5 tertiary lines
  {
    const o = S11_OCTAVES[4];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 4, p.maxOctave);
    if (w > 0.001) add(o.amp, o.freq, islandD(qx * o.freq + 27.4, qy * o.freq + 11.9), w);
  }
  // O6 stratum corneum flakes (ridged noise)
  {
    const o = S11_OCTAVES[5];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 5, p.maxOctave);
    if (w > 0.001) {
      const n = s11NoiseD(qx * o.freq + 41.2, qy * o.freq + 53.8);
      const sgn = n[0] >= 0.5 ? 1 : -1;
      add(o.amp, o.freq, [1 - Math.abs(n[0] * 2 - 1), -2 * sgn * n[1], -2 * sgn * n[2]], w);
    }
  }
  // O7 corneocyte cells
  {
    const o = S11_OCTAVES[6];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 6, p.maxOctave);
    if (w > 0.001) add(o.amp, o.freq, islandD(qx * o.freq + 61.7, qy * o.freq + 3.9), w);
  }
  // O8 corneocyte margins
  {
    const o = S11_OCTAVES[7];
    const w = s11OctaveWeight(o.freq, p.pxWorld, 7, p.maxOctave);
    if (w > 0.001) add(o.amp, o.freq, s11NoiseD(qx * o.freq + 7.7, qy * o.freq + 91.3), w);
  }
  return { h, gx, gy };
}

/** GLSL shared by every FINGER S1.1 material (injected after `#include <common>` in the fragment). */
export const S11_GLSL_COMMON = /* glsl */ `
uniform float uS11Enabled;
uniform float uS11MaxOctave;
uniform float uS11AlphaRough;
uniform mat3 normalMatrix;

vec3 s11GradObj = vec3( 0.0 );
float s11Cavity = 0.0;
float s11Crest = 0.0;
float s11Flake = 0.0;
float s11Active = 0.0;

float s11Hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
vec2 s11Hash22( vec2 p ) {
  vec3 a = fract( p.xyx * vec3( 123.34, 234.34, 345.65 ) );
  a += dot( a, a + 34.45 );
  return fract( vec2( a.x * a.y, a.y * a.z ) );
}
// value noise + analytic derivative (x: value, yz: gradient in lattice units)
vec3 s11NoiseD( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  vec2 du = 6.0 * f * ( 1.0 - f );
  float a = s11Hash21( i );
  float b = s11Hash21( i + vec2( 1.0, 0.0 ) );
  float c = s11Hash21( i + vec2( 0.0, 1.0 ) );
  float d = s11Hash21( i + vec2( 1.0, 1.0 ) );
  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;
  return vec3( a + k1 * u.x + k2 * u.y + k3 * u.x * u.y, du.x * ( k1 + k3 * u.y ), du.y * ( k2 + k3 * u.x ) );
}
// Worley F2-F1 + analytic gradient
vec3 s11WorleyEdgeD( vec2 p ) {
  vec2 n = floor( p );
  vec2 f = fract( p );
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 r1 = vec2( 0.0 );
  vec2 r2 = vec2( 0.0 );
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = vec2( float( i ), float( j ) );
      vec2 r = g + 0.14 + 0.72 * s11Hash22( n + g ) - f;
      float d = dot( r, r );
      if ( d < d1 ) {
        d2 = d1; r2 = r1; d1 = d; r1 = r;
      } else if ( d < d2 ) {
        d2 = d; r2 = r;
      }
    }
  }
  float l1 = max( sqrt( d1 ), 1e-5 );
  float l2 = max( sqrt( d2 ), 1e-5 );
  return vec3( l2 - l1, -r2 / l2 + r1 / l1 );
}
vec3 s11IslandD( vec2 p ) {
  vec3 e = s11WorleyEdgeD( p );
  float t = clamp( ( e.x - 0.02 ) / 0.28, 0.0, 1.0 );
  float ds = ( t > 0.0 && t < 1.0 ) ? 6.0 * t * ( 1.0 - t ) / 0.28 : 0.0;
  return vec3( t * t * ( 3.0 - 2.0 * t ), ds * e.yz );
}
float s11OctW( float freq, float px, float idx ) {
  float ppc = 1.0 / max( 1e-9, freq * px );
  return smoothstep( 2.5, 6.0, ppc ) * ( 1.0 - smoothstep( 400.0, 1600.0, ppc ) ) * clamp( uS11MaxOctave - idx, 0.0, 1.0 );
}

// ★ MICRO-DERMA FRACTAL 2.0: 8 analytic octaves; returns (height_m, dh/dqx, dh/dqy) and writes
// cavity / crest / flake masks for albedo & roughness micro-modulation.
vec3 s11SkinRelief( vec2 q, float dorsal, float strain, float volarC, float px, float pw ) {
  const float TAU = 6.28318530718;
  vec3 acc = vec3( 0.0 );
  float cav = 0.0;
  float crest = 0.0;
  float flake = 0.0;
  float w;
  // O1 Langer folds
  w = s11OctW( 260.0, px, 0.0 );
  if ( w > 0.001 ) {
    vec3 n = s11NoiseD( q * 95.0 );
    float warp = 2.4 * n.x;
    float depthD = mix( 1.0, 0.16, clamp( strain, 0.0, 1.0 ) ) * dorsal;
    float depthV = volarC * ( 1.0 - dorsal );
    float phD = TAU * 260.0 * q.y + warp;
    float phV = TAU * 260.0 * ( q.y * 0.96 + q.x * 0.29 ) + warp * 1.2;
    float value = 0.5 + 0.5 * cos( phD ) * depthD + 0.5 * cos( phV ) * depthV;
    vec2 wg = 2.4 * n.yz * 95.0 / 260.0;
    float sD = -0.5 * sin( phD ) * depthD;
    float sV = -0.5 * sin( phV ) * depthV;
    vec2 d = vec2( sD * wg.x + sV * ( TAU * 0.29 + 1.2 * wg.x ), sD * ( TAU + wg.y ) + sV * ( TAU * 0.96 + 1.2 * wg.y ) );
    acc += vec3( 22e-6 * value, 22e-6 * 260.0 * d ) * w;
    cav += ( 1.0 - value ) * 0.35 * w;
  }
  // O2 Rete Cutis islands
  w = s11OctW( 520.0, px, 1.0 );
  if ( w > 0.001 ) {
    vec3 isl = s11IslandD( q * 520.0 );
    acc += vec3( 16e-6 * isl.x, 16e-6 * 520.0 * isl.yz ) * w;
    cav += ( 1.0 - isl.x ) * 0.5 * w;
    crest += isl.x * 0.3 * w;
  }
  // O3 secondary furrows + eccrine pores
  w = s11OctW( 1100.0, px, 2.0 );
  if ( w > 0.001 ) {
    vec3 isl = s11IslandD( q * 1100.0 + vec2( 13.1, 7.4 ) );
    vec3 n = s11NoiseD( q * 1177.0 + vec2( 5.2, 19.8 ) );
    vec3 dip = n.x < 0.18 ? vec3( -( 0.18 - n.x ) * 1.65, 1.65 * n.yz * 1.07 ) : vec3( 0.0 );
    vec3 v3 = isl + dip;
    acc += vec3( 8e-6 * v3.x, 8e-6 * 1100.0 * v3.yz ) * w;
    cav += ( ( 1.0 - isl.x ) * 0.35 + ( n.x < 0.18 ? 1.0 : 0.0 ) * 0.8 ) * w;
  }
  // O4 papillary ridges + crest pores (volar) / follicle pits (dorsal)
  w = s11OctW( 2050.0, px, 3.0 );
  if ( w > 0.001 ) {
    vec3 n = s11NoiseD( q * 210.0 );
    float phase = TAU * 2050.0 * q.y + 1.6 * sin( TAU * 410.0 * q.x ) + 3.0 * n.x;
    vec2 dph = vec2( 1.6 * cos( TAU * 410.0 * q.x ) * TAU * 0.2 + 3.0 * n.y * 210.0 / 2050.0, TAU + 3.0 * n.z * 210.0 / 2050.0 );
    float sv = sin( phase );
    float den = 0.35 + 0.65 * abs( sv );
    float ridge = sv / den;
    float dR = ( 0.35 / ( den * den ) ) * cos( phase );
    float volar = 1.0 - dorsal;
    acc += vec3( 22e-6 * ridge * volar, 22e-6 * 2050.0 * dR * dph * volar ) * w;
    crest += max( 0.0, ridge ) * volar * 0.7 * w;
    cav += max( 0.0, -ridge ) * volar * 0.3 * w;
    vec3 fol = s11NoiseD( q * 1025.0 + vec2( 3.3, 8.1 ) );
    if ( fol.x < 0.08 && dorsal > 0.01 ) {
      acc += vec3( -( 0.08 - fol.x ) * 6.0, 6.0 * fol.yz * 0.5 * 2050.0 ) * ( 22e-6 * 0.6 * dorsal * w );
      cav += dorsal * 0.9 * w;
    }
  }
  // O5 tertiary lines
  w = s11OctW( 4600.0, px, 4.0 );
  if ( w > 0.001 ) {
    vec3 isl = s11IslandD( q * 4600.0 + vec2( 27.4, 11.9 ) );
    acc += vec3( 3.2e-6 * isl.x, 3.2e-6 * 4600.0 * isl.yz ) * w;
    cav += ( 1.0 - isl.x ) * 0.25 * w;
  }
  // O6 stratum corneum flakes
  w = s11OctW( 9000.0, px, 5.0 );
  if ( w > 0.001 ) {
    vec3 n = s11NoiseD( q * 9000.0 + vec2( 41.2, 53.8 ) );
    float sgn = n.x >= 0.5 ? 1.0 : -1.0;
    float fl = 1.0 - abs( n.x * 2.0 - 1.0 );
    acc += vec3( 1.5e-6 * fl, 1.5e-6 * 9000.0 * ( -2.0 * sgn * n.yz ) ) * w;
    flake += smoothstep( 0.7, 0.95, fl ) * w;
  }
  // O7 corneocyte cells (36 µm)
  w = s11OctW( 28000.0, px, 6.0 );
  if ( w > 0.001 ) {
    vec3 isl = s11IslandD( q * 28000.0 + vec2( 61.7, 3.9 ) );
    acc += vec3( 0.55e-6 * isl.x, 0.55e-6 * 28000.0 * isl.yz ) * w;
    cav += ( 1.0 - isl.x ) * 0.22 * w;
    flake += ( 1.0 - smoothstep( 0.0, 0.25, isl.x ) ) * 0.6 * w;
  }
  // O8 corneocyte margins (17 µm)
  w = s11OctW( 60000.0, px, 7.0 );
  if ( w > 0.001 ) {
    vec3 n = s11NoiseD( q * 60000.0 + vec2( 7.7, 91.3 ) );
    acc += vec3( 0.22e-6 * n.x, 0.22e-6 * 60000.0 * n.yz ) * w;
  }
  s11Cavity += cav * pw;
  s11Crest += crest * pw;
  s11Flake += flake * pw;
  return acc;
}

// Craft relief (bronze lathe lines, hinoki grain, porcelain crazing, obsidian crystal) — analytic
vec3 s11CraftRelief( vec2 q, float px ) {
  const float TAU = 6.28318530718;
  vec3 acc = vec3( 0.0 );
  float w = s11OctW( 860.0, px, 0.0 );
  if ( w > 0.001 ) {
    vec3 n = s11NoiseD( q * 180.0 );
    float ph = TAU * 860.0 * q.y + 2.1 * n.x;
    acc += vec3( 4e-6 * cos( ph ), 4e-6 * 860.0 * ( -sin( ph ) ) * vec2( 2.1 * n.y * 180.0 / 860.0, TAU + 2.1 * n.z * 180.0 / 860.0 ) ) * w;
  }
  w = s11OctW( 3200.0, px, 2.0 );
  if ( w > 0.001 ) {
    vec3 n = s11NoiseD( q * 3200.0 );
    acc += vec3( 1.6e-6 * n.x, 1.6e-6 * 3200.0 * n.yz ) * w;
  }
  w = s11OctW( 14500.0, px, 5.0 );
  if ( w > 0.001 ) {
    vec3 isl = s11IslandD( q * 14500.0 );
    acc += vec3( 0.5e-6 * isl.x, 0.5e-6 * 14500.0 * isl.yz ) * w;
  }
  return acc;
}
`;

/**
 * GLSL inserted after `#include <map_fragment>`: evaluates the relief ONCE per pixel (dual-plane
 * projection in object space, exactly as S1.0) and darkens/brightens albedo by the micro masks.
 * Requires the S1.0 varyings (vS1LocalPos, vS1LocalNormal, vS1WorldPos, vS1WorldNormal).
 */
export const S11_GLSL_MAP = /* glsl */ `
if ( uS1Enabled > 0.5 && uS11Enabled > 0.5 && uS1SkinMode > 0.04 && uS1DermaEnabled > 0.5 ) {
  vec3 s11dX = dFdx( vS1WorldPos );
  vec3 s11dY = dFdy( vS1WorldPos );
  float s11Px = max( max( length( s11dX ), length( s11dY ) ), 1e-7 );
  vec3 s11An = abs( normalize( vS1LocalNormal ) );
  float s11SideW = smoothstep( 0.42, 0.76, 1.0 - s11An.y );
  float s11Dorsal = smoothstep( -0.28, 0.32, normalize( vS1WorldNormal ).y );
  vec3 s11G = vec3( 0.0 );
  if ( s11SideW < 0.99 ) {
    vec3 r = uS1SkinMode > 0.45
      ? s11SkinRelief( vS1LocalPos.xz, s11Dorsal, uS1DorsalStrain, uS1VolarCompress, s11Px, 1.0 - s11SideW )
      : s11CraftRelief( vS1LocalPos.xz, s11Px );
    s11G += vec3( r.y, 0.0, r.z ) * ( 1.0 - s11SideW );
  }
  if ( s11SideW > 0.01 ) {
    vec2 qB = vec2( vS1LocalPos.y, vS1LocalPos.z - vS1LocalPos.x * 0.65 );
    vec3 r = uS1SkinMode > 0.45
      ? s11SkinRelief( qB, s11Dorsal, uS1DorsalStrain, uS1VolarCompress, s11Px, s11SideW )
      : s11CraftRelief( qB, s11Px );
    s11G += vec3( -0.65 * r.z, r.y, r.z ) * s11SideW;
  }
  float s11StrainAtten = uS1SkinMode > 0.45 ? mix( 1.0, 0.72, uS1DorsalStrain * s11Dorsal ) : 0.85;
  s11GradObj = s11G * s11StrainAtten;
  s11Active = 1.0;
  if ( uS1SkinMode > 0.45 ) {
    float cav = clamp( s11Cavity, 0.0, 1.4 );
    diffuseColor.rgb *= 1.0 - 0.13 * cav;
    diffuseColor.rgb += vec3( 0.045, 0.040, 0.036 ) * clamp( s11Flake, 0.0, 1.0 );
  }
}
`;

/** Replacement for `#include <roughnessmap_fragment>`: alpha-packed HD roughness + micro sheen. */
export const S11_GLSL_ROUGHNESS = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  roughnessFactor *= mix( texelRoughness.g, texelRoughness.a, uS11AlphaRough );
#endif
if ( s11Active > 0.5 && uS1SkinMode > 0.45 ) {
  roughnessFactor = clamp( roughnessFactor * ( 1.0 - 0.16 * clamp( s11Crest, 0.0, 1.0 ) + 0.12 * clamp( s11Cavity, 0.0, 1.0 ) ), 0.08, 1.0 );
}
`;

/** GLSL inserted after `#include <normal_fragment_maps>`: Mikkelsen surface-gradient perturbation. */
export const S11_GLSL_NORMAL = /* glsl */ `
if ( s11Active > 0.5 ) {
  vec3 s11GView = normalMatrix * s11GradObj;
  vec3 s11Surf = s11GView - normal * dot( normal, s11GView );
  normal = normalize( normal - clamp( s11Surf, vec3( -1.5 ), vec3( 1.5 ) ) );
}
`;

export interface FingerS11Telemetry {
  tier: number;
  labelJp: string;
  textureResolution: number;
  geometryScale: number;
  shaderOctaves: number;
  hdReady: boolean;
}
