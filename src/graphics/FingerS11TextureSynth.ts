/**
 * ★ FINGER S1.1 — HD Dermal Texture Synthesis (2× linear resolution, DOM-free) ★
 *
 * Generates the S1.1 "HD tier" maps that stream in when the camera zooms past 2.5×:
 *   - finger  2048² (S1.0: 1024²)  — phalanx skin, knuckle folds, volar creases, dermatoglyphics
 *   - palm    2048² (S1.0: 1024²)  — palmar creases + NEW palmar papillary ridges, dorsal follicles/veins
 *   - micro   1024² (S1.0:  512²)  — seamless Worley skin for joints/webbing
 *   - nail    1024² (S1.0:  512²)  — keratin striations, lunula, lamination, hyponychium capillaries
 *
 * Every map keeps S1.0's UV layout (so it is a drop-in swap) and adds detail that a 1024 map cannot
 * hold: 2×-density secondary/tertiary Worley cells, a second fold frequency on knuckles, double
 * flexion creases, anatomically dense fingerprint ridges with minutiae and crest pores, palmar
 * ridges, finer follicles, keratin lamination lines.
 *
 * Output packing (one fewer texture than S1.0 per surface):
 *   albedoRough  RGBA8: sRGB albedo in RGB, linear roughness in A
 *   normalHeight RGBA8: tangent-space normal in RGB, height in A
 *
 * Pure TypeScript (no DOM / three.js) so it runs in a Web Worker and in Node tests.
 */

export interface S11SurfaceMaps {
  size: number;
  albedoRough: Uint8ClampedArray;
  normalHeight: Uint8ClampedArray;
  /** Raw height field (only kept when requested, for tests) */
  height?: Float32Array;
}

export interface S11HDMapSet {
  finger: S11SurfaceMaps;
  palm: S11SurfaceMaps;
  micro: S11SurfaceMaps;
  nail: S11SurfaceMaps;
  generationMs: number;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function tileNoise2(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash2(x0, y0);
  const b = hash2(x1, y0);
  const c = hash2(x0, y1);
  const d = hash2(x1, y1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/**
 * Precomputed value-noise lattice: returns exactly `tileNoise2(x, y, period)` (same hash values as
 * S1.0, so the HD maps line up with the base maps — no pattern "pop" on the tier swap) but replaces
 * four Math.sin hashes per sample with four table reads.
 */
class NoiseLattice {
  readonly p: number;
  readonly t: Float32Array;
  constructor(period: number) {
    this.p = period;
    this.t = new Float32Array(period * period);
    for (let y = 0; y < period; y++) for (let x = 0; x < period; x++) this.t[y * period + x] = hash2(x, y);
  }
  sample(x: number, y: number): number {
    const p = this.p;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    let x0 = xi % p;
    if (x0 < 0) x0 += p;
    let y0 = yi % p;
    if (y0 < 0) y0 += p;
    const x1 = x0 + 1 === p ? 0 : x0 + 1;
    const y1 = y0 + 1 === p ? 0 : y0 + 1;
    const t = this.t;
    const r0 = y0 * p;
    const r1 = y1 * p;
    const a = t[r0 + x0];
    const b = t[r0 + x1];
    const c = t[r1 + x0];
    const d = t[r1 + x1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
}

const latticeCache = new Map<number, NoiseLattice>();
function lattice(period: number): NoiseLattice {
  let l = latticeCache.get(period);
  if (!l) {
    l = new NoiseLattice(period);
    latticeCache.set(period, l);
  }
  return l;
}

/** Truncated Gaussian line profile exp(−((x−c)/w)²), zero beyond 4σ. */
function gauss(x: number, c: number, w: number): number {
  const d = (x - c) / w;
  return d > 4 || d < -4 ? 0 : Math.exp(-d * d);
}

/** Cheap crest sharpening (≈ sign(s)·|s|^0.62 without a pow per texel). */
function sharpen(s: number): number {
  return s / (0.35 + 0.65 * (s < 0 ? -s : s));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Periodic Worley (F2−F1) island tile with two cell densities. Same construction as S1.0's
 * Rete Cutis tile but parameterised so S1.1 can build a 2×-density secondary tile.
 */
export function buildWorleyTile(size: number, primaryCells: number, subCells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  const layer = (px: number, py: number, cells: number, so: number): { edge: number; f1: number } => {
    const gx = Math.floor(px);
    const gy = Math.floor(py);
    let f1 = 99;
    let f2 = 99;
    for (let oy = -1; oy <= 1; oy++) {
      const cy = (((gy + oy) % cells) + cells) % cells;
      for (let ox = -1; ox <= 1; ox++) {
        const cx = (((gx + ox) % cells) + cells) % cells;
        const jx = 0.14 + 0.72 * hash2(cx + so, cy + so * 1.7);
        const jy = 0.14 + 0.72 * hash2(cx + so * 2.3 + 19.1, cy + so * 0.9 + 7.4);
        const dx = gx + ox + jx - px;
        const dy = gy + oy + jy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < f1) {
          f2 = f1;
          f1 = d2;
        } else if (d2 < f2) {
          f2 = d2;
        }
      }
    }
    const r1 = Math.sqrt(f1);
    return { edge: Math.sqrt(f2) - r1, f1: r1 };
  };
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const wu = u + (tileNoise2(u * 6, v * 6, 6) - 0.5) * 0.032;
      const wv = v + (tileNoise2(u * 6 + 3.1, v * 6 + 1.7, 6) - 0.5) * 0.032;
      const p1 = layer(wu * primaryCells, wv * primaryCells, primaryCells, seed);
      const p2 = layer(wu * subCells, wv * subCells, subCells, seed * 4.24 + 36.6);
      const island1 = smoothstep(0.02, 0.28, p1.edge);
      const island2 = smoothstep(0.02, 0.3, p2.edge);
      const dome = Math.max(0, 1 - p1.f1 * 1.15) * 0.14;
      out[y * size + x] = island1 * 0.64 + island2 * 0.24 + dome;
    }
  }
  return out;
}

function sampleTile(tile: Float32Array, size: number, u: number, v: number): number {
  const mask = size - 1;
  const fx = (u - Math.floor(u)) * size;
  const fy = (v - Math.floor(v)) * size;
  const x0 = Math.floor(fx) & mask;
  const y0 = Math.floor(fy) & mask;
  const x1 = (x0 + 1) & mask;
  const y1 = (y0 + 1) & mask;
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);
  const a = tile[y0 * size + x0];
  const b = tile[y0 * size + x1];
  const c = tile[y1 * size + x0];
  const d = tile[y1 * size + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Sobel tangent-space normal (RGB) + height (A). `wrapY` false clamps rows (finger/palm v axis). */
export function packNormalHeight(height: Float32Array, size: number, strength: number, wrapY: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const mask = size - 1;
  let hMin = Infinity;
  let hMax = -Infinity;
  for (let i = 0; i < height.length; i++) {
    const h = height[i];
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  const hScale = hMax > hMin ? 255 / (hMax - hMin) : 0;
  for (let y = 0; y < size; y++) {
    const ym = wrapY ? (y - 1) & mask : Math.max(0, y - 1);
    const yp = wrapY ? (y + 1) & mask : Math.min(size - 1, y + 1);
    const row = y * size;
    const rowM = ym * size;
    const rowP = yp * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const tl = height[rowM + xm];
      const t = height[rowM + x];
      const tr = height[rowM + xp];
      const l = height[row + xm];
      const r = height[row + xp];
      const bl = height[rowP + xm];
      const b = height[rowP + x];
      const br = height[rowP + xp];
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const idx = (row + x) * 4;
      out[idx] = clamp255((-dx * inv * 0.5 + 0.5) * 255);
      out[idx + 1] = clamp255((-dy * inv * 0.5 + 0.5) * 255);
      out[idx + 2] = clamp255((inv * 0.5 + 0.5) * 255);
      out[idx + 3] = clamp255((height[row + x] - hMin) * hScale);
    }
  }
  return out;
}

// =============================================================================
// Shared Worley tiles (built once per synthesis run)
// =============================================================================

interface S11Tiles {
  size: number;
  primary: Float32Array; // 16/36 cells (S1.0-equivalent)
  fine: Float32Array; // 32/72 cells (2× density)
}

function buildTiles(): S11Tiles {
  const size = 256;
  return {
    size,
    primary: buildWorleyTile(size, 16, 36, 11.3),
    fine: buildWorleyTile(size, 32, 72, 29.7),
  };
}

// =============================================================================
// A. Finger (phalanx) HD maps — u=0/1 dorsal, u=0.5 volar; v=0 proximal -> 1 distal
// =============================================================================

export function synthFingerHD(size: number, tiles: S11Tiles, keepHeight = false): S11SurfaceMaps {
  const height = new Float32Array(size * size);
  const albedoRough = new Uint8ClampedArray(size * size * 4);
  const inv = 1 / size;
  const T = tiles.size;
  const L8 = lattice(8);
  const L26 = lattice(26);
  const L78 = lattice(78);
  const L160 = lattice(160);
  const L330 = lattice(330);
  const L156 = lattice(156);
  const L46 = lattice(46);

  // Per-column precomputation (u only)
  const dorsalW = new Float32Array(size);
  const uProxCol = new Float32Array(size);
  const fpDxCol = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const u = x * inv;
    const c = Math.cos(u * Math.PI);
    dorsalW[x] = c * c;
    uProxCol[x] = (u < 0.5 ? u : 1 - u) * 2.2;
    fpDxCol[x] = (u - 0.5) * 3.2;
  }

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    const rowOff = y * size;
    const tipBlush = v > 0.58 ? ((v - 0.58) / 0.42) * 0.44 : 0;
    const vProx = (v - 0.08) * 3.1;
    const vDist = (v - 0.92) * 3.2;
    const fpDy = (v - 0.56) * 2.1;
    const nearCrease = (v > 0.02 && v < 0.2) || (v > 0.84 && v < 0.96);

    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const dW = dorsalW[x];
      const vW = 1 - dW;

      const nLow = L8.sample(u * 8, v * 8);
      const nMid = L26.sample(u * 26, v * 26);
      const nFine = L78.sample(u * 78, v * 78);
      const nMicro = L160.sample(u * 160, v * 160);
      const nUltra = L330.sample(u * 330, v * 330); // S1.1: beyond a 1024 map's Nyquist

      // 1. Rete Cutis: S1.0 primary cells + S1.1 2×-density secondary + tertiary micro-triangles
      const wu = u * 2.0 + (nLow - 0.5) * 0.09 + (nMid - 0.5) * 0.025;
      const wv = v * 3.0 + (nMid - 0.5) * 0.08 + (nLow - 0.5) * 0.06;
      const wCell = sampleTile(tiles.primary, T, wu, wv);
      const wFine = sampleTile(tiles.fine, T, wu * 2.1 + 0.37, wv * 2.1 + 0.11);
      const wMicro = sampleTile(tiles.fine, T, wu * 4.3 + 0.71, wv * 4.3 + 0.53);
      const reteCutis =
        (wCell - 0.52) * 0.16 + (wFine - 0.52) * 0.075 + (wMicro - 0.52) * 0.04 + (nMicro - 0.5) * 0.03 + (nUltra - 0.5) * 0.018;
      const sulcusAo = Math.max(0, 0.58 - wCell) * 0.22 + Math.max(0, 0.5 - wFine) * 0.08;

      // 2. Pores at 2× density + dorsal hair-follicle orifices at furrow junctions
      const nPore = L156.sample(u * 156, v * 156);
      const pore = nPore < 0.12 ? -(0.12 - nPore) * 1.35 : 0;
      const follicle =
        dW > 0.45 && wCell < 0.36 && nMicro < 0.11
          ? -(0.11 - nMicro) * 1.85 * dW
          : dW > 0.5 && wFine < 0.3 && nUltra < 0.06
          ? -(0.06 - nUltra) * 1.6 * dW
          : 0;

      // 3. Dorsal knuckle folds: S1.0 fold frequency + S1.1 secondary fold harmonic & cross-hatch
      let dorsalFurrow = 0;
      let knuckleBlush = 0;
      if (dW > 0.003) {
        const uProx = uProxCol[x];
        const proxD2 = uProx * uProx + vProx * vProx;
        const distD2 = uProx * uProx + vDist * vDist;
        if (proxD2 < 1.2 || distD2 < 1.2) {
          const proxD = Math.sqrt(proxD2);
          const distD = Math.sqrt(distD2);
          const envP = Math.exp(-proxD2 * 6.2);
          const envD = Math.exp(-distD2 * 6.5);
          const foldP = Math.sin(proxD * 64.0 + nLow * 1.2) * 0.36 + Math.sin(proxD * 131.0 + nMid * 2.1) * 0.11;
          const foldD = Math.sin(distD * 58.0 + nMid * 0.9) * 0.3 + Math.sin(distD * 121.0 + nLow * 1.7) * 0.09;
          const cross = Math.sin(uProx * 92 + v * 37 + nFine * 2.4) * 0.035 * (envP + envD);
          dorsalFurrow = dW * (envP * foldP + envD * foldD + cross);
          knuckleBlush = dW * (Math.exp(-proxD2 * 4.2) + Math.exp(-distD2 * 4.5)) * 0.56;
        }
      }

      // 4. Volar flexion creases — S1.1 doubled crease lines with natural waviness
      let volarCrease = 0;
      if (vW > 0.003) {
        if (nearCrease) {
          const vv = v + Math.sin(u * 40 + nLow * 3) * 0.0035;
          const vcProx =
            gauss(vv, 0.07, 0.017) + 0.62 * gauss(vv, 0.083, 0.006) + 0.68 * gauss(vv, 0.112, 0.013) + 0.34 * gauss(vv, 0.148, 0.011);
          const vcDist = gauss(vv, 0.912, 0.015) + 0.55 * gauss(vv, 0.9, 0.005) + 0.45 * gauss(vv, 0.875, 0.012);
          volarCrease = vW * (vcProx * 0.58 + vcDist * 0.48);
        }
        if (nMid > 0.82) {
          const fine = (nMid - 0.82) * 0.6 * Math.abs(Math.sin(u * 210 + v * 18));
          volarCrease += vW * fine * 0.2;
        }
      }

      // 5. Dermatoglyphics: 2× ridge density, minutiae via warped phase, sharpened crests and
      //    eccrine pores dotted ALONG the crests
      let fingerprint = 0;
      let poreOnRidge = 0;
      if (vW > 0.01) {
        const fpDx = fpDxCol[x];
        const fpR2 = fpDx * fpDx + fpDy * fpDy;
        if (fpR2 < 3.9) {
          const fpMask = vW * Math.exp(-fpR2 * 1.42);
          if (fpMask > 0.004) {
            const fpR = Math.sqrt(fpR2);
            const ang = Math.atan2(fpDy, fpDx);
            const minutiae = (L46.sample(u * 46, v * 46) - 0.5) * 2.2;
            const sv = Math.sin(fpR * 228.0 + ang * 2.0 + nLow * 1.65 + minutiae);
            const along = Math.sin(ang * 96.0 + fpR * 140.0 + minutiae * 0.7);
            poreOnRidge = sv > 0.55 && along > 0.86 ? -0.26 * fpMask : 0;
            fingerprint = fpMask * sharpen(sv) * 0.3 + poreOnRidge;
          }
        }
      }

      const h = 0.5 + reteCutis + pore + follicle + (nMid - 0.5) * 0.085 + dorsalFurrow - volarCrease + fingerprint;
      height[rowOff + x] = h;

      // Albedo (S1.0 tones) + S1.1 micro melanin granules & capillary mottling
      const creaseDark = Math.min(0.46, volarCrease * 0.46 + Math.max(0, -dorsalFurrow) * 0.28 + sulcusAo);
      const melanin = (nFine > 0.88 ? (nFine - 0.88) * 38 * dW : 0) + (nUltra > 0.94 ? (nUltra - 0.94) * 30 * dW : 0);
      const microVasc = (nMid - 0.5) * 10 + (nMicro - 0.5) * 4;
      const poreDark = pore < 0 || poreOnRidge < 0 ? 0.08 : 0;
      const r = 164 + vW * 18 + (nLow - 0.5) * 15 + (knuckleBlush + tipBlush) * 17 + microVasc * 0.65 - creaseDark * 48 - melanin * 0.45 - poreDark * 30;
      const g = 116 + vW * 18 + (nLow - 0.5) * 10 - (knuckleBlush + tipBlush) * 8 - creaseDark * 50 - melanin * 0.85 - poreDark * 34;
      const b = 90 + vW * 20 + (nMid - 0.5) * 8 - (knuckleBlush + tipBlush) * 9 - creaseDark * 43 - melanin * 0.95 - poreDark * 30;
      let rough =
        0.48 - knuckleBlush * 0.09 - Math.max(0, fingerprint) * 0.12 + (poreOnRidge < 0 ? -0.1 : 0) + creaseDark * 0.48 + (nMid - 0.5) * 0.09 + (wFine - 0.5) * 0.05;
      rough = rough < 0.3 ? 0.3 : rough > 0.8 ? 0.8 : rough;
      const idx = (rowOff + x) * 4;
      albedoRough[idx] = clamp255(r);
      albedoRough[idx + 1] = clamp255(g);
      albedoRough[idx + 2] = clamp255(b);
      albedoRough[idx + 3] = clamp255(rough * 255);
    }
  }
  // 2× resolution -> 2× Sobel strength keeps the same physical slopes as S1.0
  const normalHeight = packNormalHeight(height, size, 2.05 * (size / 1024), false);
  return { size, albedoRough, normalHeight, height: keepHeight ? height : undefined };
}

// =============================================================================
// B. Palm & dorsum HD maps — v=0 volar palm … v=1 dorsal back
// =============================================================================

export function synthPalmHD(size: number, tiles: S11Tiles, keepHeight = false): S11SurfaceMaps {
  const height = new Float32Array(size * size);
  const albedoRough = new Uint8ClampedArray(size * size * 4);
  const inv = 1 / size;
  const T = tiles.size;
  const L6 = lattice(6);
  const L22 = lattice(22);
  const L64 = lattice(64);
  const L144 = lattice(144);
  const L300 = lattice(300);
  const sinU = new Float32Array(size);
  const cosU = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    sinU[x] = Math.sin(x * inv * Math.PI * 2);
    cosU[x] = Math.cos(x * inv * Math.PI * 2);
  }
  for (let y = 0; y < size; y++) {
    const v = y * inv;
    const rowOff = y * size;
    const dorsalMask = smoothstep(0.44, 0.58, v);
    const volarMask = 1 - dorsalMask;
    const pv = Math.min(1, v / 0.44);
    const volarEnv = smoothstep(0.05, 0.16, v);
    const dv = Math.max(0, (v - 0.6) / 0.36);
    const veinEnv = smoothstep(0.6, 0.72, v) * (1 - smoothstep(0.88, 0.98, v));
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const n1 = L6.sample(u * 6, v * 6);
      const n2 = L22.sample(u * 22, v * 22);
      const n3 = L64.sample(u * 64, v * 64);
      const n4 = L144.sample(u * 144, v * 144);
      const n5 = L300.sample(u * 300, v * 300);

      const wu = u * 2.5 + (n1 - 0.5) * 0.08 + (n2 - 0.5) * 0.025;
      const wv = v * 2.5 + (n2 - 0.5) * 0.08 + (n1 - 0.5) * 0.05;
      const wCell = sampleTile(tiles.primary, T, wu, wv);
      const wFine = sampleTile(tiles.fine, T, wu * 2.05 + 0.29, wv * 2.05 + 0.61);
      const meshH = (wCell - 0.52) * 0.16 + (wFine - 0.52) * 0.07 + (n4 - 0.5) * 0.04 + (n5 - 0.5) * 0.018;
      const sulcusAo = Math.max(0, 0.58 - wCell) * 0.22 + Math.max(0, 0.5 - wFine) * 0.07;
      const poreH = n3 < 0.16 ? -(0.16 - n3) * 1.15 : 0;
      const folliclePit =
        dorsalMask > 0.5 && wCell < 0.36 && n4 < 0.1
          ? -(0.1 - n4) * 1.95 * dorsalMask
          : dorsalMask > 0.5 && wFine < 0.3 && n5 < 0.05
          ? -(0.05 - n5) * 1.7 * dorsalMask
          : 0;

      let palmCrease = 0;
      let palmRidge = 0;
      if (volarMask > 0.005) {
        const lifeD = Math.abs(Math.hypot(u - 0.26, pv - 0.44) - 0.32);
        const headD = Math.abs(pv - (0.56 + sinU[x] * 0.07));
        const heartD = Math.abs(pv - (0.74 - cosU[x] * 0.05));
        const fateD = Math.abs(u - (0.52 + (pv - 0.5) * 0.08 + (n1 - 0.5) * 0.04));
        const thenar = Math.sin((u * 42 + pv * 28) * Math.PI) * 0.08 * smoothstep(0.45, 0.15, u);
        // S1.1: minor flexion crease network (fine branching lines between the major lines)
        const minor =
          Math.exp(-Math.pow(Math.abs(Math.sin((u * 13 - pv * 7 + n2 * 0.8) * Math.PI)) / 0.05, 2)) * 0.22 +
          Math.exp(-Math.pow(Math.abs(Math.sin((u * 9 + pv * 11 + n1) * Math.PI)) / 0.04, 2)) * 0.16;
        palmCrease =
          volarMask *
          volarEnv *
          (Math.exp(-Math.pow(lifeD / 0.013, 2)) +
            0.82 * Math.exp(-Math.pow(headD / 0.012, 2)) +
            0.74 * Math.exp(-Math.pow(heartD / 0.012, 2)) +
            0.46 * Math.exp(-Math.pow(fateD / 0.01, 2)) +
            Math.max(0, thenar) +
            minor * smoothstep(0.08, 0.2, v));
        // S1.1: palmar papillary ridge field (flowing ridges ≈0.5 mm period) — invisible below 2048
        const flow = (u * 0.62 + pv * 0.78) * 520 + Math.sin(u * 9 + pv * 5) * 6 + (n2 - 0.5) * 9;
        palmRidge = volarMask * volarEnv * sharpen(Math.sin(flow)) * 0.07;
      }

      let vein = 0;
      if (dorsalMask > 0.005 && veinEnv > 0.005) {
        const v1 = Math.abs(u - (0.34 + Math.sin(dv * 4.5 + n1 * 1.1) * 0.055));
        const v2 = Math.abs(u - (0.64 - Math.cos(dv * 4.2 + n1 * 1.0) * 0.05));
        const vb = Math.abs(u - (0.49 + (dv - 0.45) * 0.24 + (n2 - 0.5) * 0.03));
        // S1.1: two extra fine tributaries
        const vt1 = Math.abs(u - (0.42 + (dv - 0.3) * -0.18 + (n3 - 0.5) * 0.02));
        const vt2 = Math.abs(u - (0.57 + (dv - 0.6) * 0.21 + (n3 - 0.5) * 0.02));
        vein =
          dorsalMask *
          veinEnv *
          (Math.exp(-Math.pow(v1 / 0.015, 2)) +
            Math.exp(-Math.pow(v2 / 0.014, 2)) +
            0.62 * Math.exp(-Math.pow(vb / 0.011, 2)) +
            0.32 * Math.exp(-Math.pow(vt1 / 0.006, 2)) * smoothstep(0.2, 0.5, dv) +
            0.3 * Math.exp(-Math.pow(vt2 / 0.006, 2)) * smoothstep(0.4, 0.75, dv)) *
          0.36;
      }

      height[rowOff + x] = 0.5 + meshH + poreH + folliclePit + (n2 - 0.5) * 0.085 + vein * 0.17 - palmCrease * 0.45 + palmRidge;

      const melanin = (n3 > 0.89 ? (n3 - 0.89) * 34 * dorsalMask : 0) + (n5 > 0.95 ? (n5 - 0.95) * 26 * dorsalMask : 0);
      const r = 164 + volarMask * 18 + (n1 - 0.5) * 14 + (n2 - 0.5) * 6 - vein * 18 - palmCrease * 36 - sulcusAo * 34 - melanin * 0.45;
      const g = 116 + volarMask * 18 + (n1 - 0.5) * 10 - vein * 5 - palmCrease * 40 - sulcusAo * 36 - melanin * 0.85;
      const b = 90 + volarMask * 20 + (n2 - 0.5) * 7 + vein * 8 - palmCrease * 34 - sulcusAo * 32 - melanin * 0.95;
      const rough = Math.max(
        0.34,
        Math.min(0.78, 0.5 + (n2 - 0.5) * 0.1 + palmCrease * 0.22 + sulcusAo * 0.28 - vein * 0.05 - Math.max(0, palmRidge) * 0.4)
      );
      const idx = (rowOff + x) * 4;
      albedoRough[idx] = clamp255(r);
      albedoRough[idx + 1] = clamp255(g);
      albedoRough[idx + 2] = clamp255(b);
      albedoRough[idx + 3] = clamp255(rough * 255);
    }
  }
  const normalHeight = packNormalHeight(height, size, 1.65 * (size / 1024), false);
  return { size, albedoRough, normalHeight, height: keepHeight ? height : undefined };
}

// =============================================================================
// C. Seamless micro-skin (joints, webbing, cuticle collar) — 1024² tileable
// =============================================================================

export function synthMicroSkinHD(size: number, tiles: S11Tiles, keepHeight = false): S11SurfaceMaps {
  const height = new Float32Array(size * size);
  const albedoRough = new Uint8ClampedArray(size * size * 4);
  const inv = 1 / size;
  const T = tiles.size;
  const M8 = lattice(8);
  const M24 = lattice(24);
  const M64 = lattice(64);
  const M128 = lattice(128);
  for (let y = 0; y < size; y++) {
    const v = y * inv;
    const rowOff = y * size;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const n1 = M8.sample(u * 8, v * 8);
      const n2 = M24.sample(u * 24, v * 24);
      const n3 = M64.sample(u * 64, v * 64);
      const n4 = M128.sample(u * 128, v * 128);
      const wu = u + (n1 - 0.5) * 0.055;
      const wv = v + (n2 - 0.5) * 0.055;
      const wCell = sampleTile(tiles.primary, T, wu, wv);
      const wFine = sampleTile(tiles.fine, T, wu * 2 + 0.43, wv * 2 + 0.17);
      const poreH = n3 < 0.16 ? -(0.16 - n3) * 1.1 : n4 < 0.07 ? -(0.07 - n4) * 1.2 : 0;
      const sulcusAo = Math.max(0, 0.58 - wCell) * 0.22 + Math.max(0, 0.5 - wFine) * 0.07;
      height[rowOff + x] = 0.5 + (wCell - 0.52) * 0.165 + (wFine - 0.52) * 0.07 + poreH + (n2 - 0.5) * 0.07 + (n4 - 0.5) * 0.02;
      const r = 166 + (n1 - 0.5) * 12 + (n2 - 0.5) * 6 - sulcusAo * 34;
      const g = 118 + (n1 - 0.5) * 9 - sulcusAo * 36;
      const b = 92 + (n2 - 0.5) * 7 - sulcusAo * 32;
      const rough = Math.max(0.36, Math.min(0.76, 0.5 + (n2 - 0.5) * 0.1 + sulcusAo * 0.28 + (wFine - 0.5) * 0.04));
      const idx = (rowOff + x) * 4;
      albedoRough[idx] = clamp255(r);
      albedoRough[idx + 1] = clamp255(g);
      albedoRough[idx + 2] = clamp255(b);
      albedoRough[idx + 3] = clamp255(rough * 255);
    }
  }
  const normalHeight = packNormalHeight(height, size, 1.95 * (size / 512), true);
  return { size, albedoRough, normalHeight, height: keepHeight ? height : undefined };
}

// =============================================================================
// D. Nail plate — 1024² (v=0 cuticle -> 1 free edge)
// =============================================================================

export function synthNailHD(size: number, keepHeight = false): S11SurfaceMaps {
  const height = new Float32Array(size * size);
  const albedoRough = new Uint8ClampedArray(size * size * 4);
  const N20 = lattice(20);
  const N48 = lattice(48);
  const N96 = lattice(96);
  const N30 = lattice(30);
  const N12 = lattice(12);
  const N40 = lattice(40);
  const N18 = lattice(18);
  const N16 = lattice(16);
  // Column-only terms (u): stria harmonics, lunula margin jitter, smile-line jitter, side shading
  const striaCol = new Float32Array(size);
  const lunArcCol = new Float32Array(size);
  const freeStartCol = new Float32Array(size);
  const sideCol = new Float32Array(size);
  const capPhaseCol = new Float32Array(size);
  const loopCol = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const u = x / size;
    const cx = (u - 0.5) * 2;
    striaCol[x] =
      Math.sin(u * Math.PI * 76) * 0.08 + Math.sin(u * Math.PI * 158 + 0.7) * 0.048 + Math.sin(u * Math.PI * 312 + 1.9) * 0.024;
    lunArcCol[x] = 0.265 * Math.sqrt(Math.max(0, 1 - cx * cx * 0.84)) + (N30.sample(u * 30, 1.5) - 0.5) * 0.008;
    freeStartCol[x] = 0.785 - cx * cx * 0.078 + (N12.sample(u * 12, 0.5) - 0.5) * 0.014 + (N40.sample(u * 40, 2.5) - 0.5) * 0.004;
    sideCol[x] = Math.pow(Math.abs(cx), 3.2) * 0.36;
    capPhaseCol[x] = u * Math.PI * 92;
    loopCol[x] = 0.5 + 0.5 * Math.sin(u * Math.PI * 180);
  }
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const cuticle = Math.exp(-Math.pow(v / 0.075, 2));
    const film = Math.exp(-Math.pow((v - 0.035) / 0.028, 2));
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // S1.0 striations + S1.1 2× harmonic onychorrhexis micro-ridges
      const stria =
        striaCol[x] +
        Math.sin(u * Math.PI * 628 + 0.4 + N20.sample(u * 20, v * 4) * 2) * 0.012 +
        (N48.sample(u * 48, v * 8) - 0.5) * 0.055 +
        (N96.sample(u * 96, v * 16) - 0.5) * 0.02;
      const beau = Math.sin(v * Math.PI * 14 + (u - 0.5) * 0.6) * 0.022 + Math.sin(v * Math.PI * 41 + u * 2) * 0.006;

      const lunArc = lunArcCol[x];
      const inLun = 1 - smoothstep(lunArc - 0.036, lunArc + 0.042, v);
      const freeStart = freeStartCol[x];
      const inFree = smoothstep(freeStart - 0.026, freeStart + 0.034, v);
      const od = (v - (freeStart - 0.032)) / 0.024;
      const onycho = od > 4 || od < -4 ? 0 : Math.exp(-od * od);
      const bed = (1 - inLun) * (1 - inFree) * smoothstep(0.14, 0.28, v);
      const capStreak = bed > 0 ? bed * (0.5 + 0.5 * Math.sin(capPhaseCol[x] + N18.sample(u * 18, v * 12) * 1.6)) * 0.18 : 0;
      const ld = (v - (freeStart - 0.06)) / 0.018;
      // S1.1: hyponychium capillary loops just proximal to the onychodermal band
      const loops = ld > 4 || ld < -4 ? 0 : Math.exp(-ld * ld) * loopCol[x] * 0.5;
      // S1.1: keratin lamination lines in the free edge (layered nail plate)
      const lamination =
        inFree > 0.001 ? inFree * (0.5 + 0.5 * Math.sin((v - freeStart) * 420 + N16.sample(u * 16, v * 30) * 3)) * 0.4 : 0;

      height[y * size + x] = 0.5 + stria + beau - cuticle * 0.2 + film * 0.06 - lamination * 0.03;

      let r = 186 + capStreak * 18 + loops * 14;
      let g = 123 - capStreak * 14 - loops * 12;
      let b = 111 - capStreak * 12 - loops * 8;
      r += (225 - r) * inLun * 0.85;
      g += (206 - g) * inLun * 0.85;
      b += (194 - b) * inLun * 0.85;
      r += (212 - r) * film * 0.42;
      g += (184 - g) * film * 0.42;
      b += (168 - b) * film * 0.42;
      r += (160 - r) * onycho * 0.56;
      g += (89 - g) * onycho * 0.56;
      b += (80 - b) * onycho * 0.56;
      r += (228 - r) * inFree * 0.94;
      g += (217 - g) * inFree * 0.94;
      b += (200 - b) * inFree * 0.94;
      r -= lamination * 6;
      g -= lamination * 6;
      b -= lamination * 5;
      const side = sideCol[x];
      r = r * (1 - side * 0.28) - cuticle * 22;
      g = g * (1 - side * 0.32) - cuticle * 24;
      b = b * (1 - side * 0.32) - cuticle * 22;
      let rough = 0.17 + inFree * 0.1 + cuticle * 0.25 + Math.abs(stria) * 0.2;
      rough = rough < 0.08 ? 0.08 : rough > 0.5 ? 0.5 : rough;
      const idx = (y * size + x) * 4;
      albedoRough[idx] = clamp255(r);
      albedoRough[idx + 1] = clamp255(g);
      albedoRough[idx + 2] = clamp255(b);
      albedoRough[idx + 3] = clamp255(rough * 255);
    }
  }
  const normalHeight = packNormalHeight(height, size, 1.55 * (size / 512), false);
  return { size, albedoRough, normalHeight, height: keepHeight ? height : undefined };
}

export const S11_HD_SIZES = { finger: 2048, palm: 2048, micro: 1024, nail: 1024 } as const;
export const S10_BASE_SIZES = { finger: 1024, palm: 1024, micro: 512, nail: 512 } as const;

/** Generate the complete S1.1 HD set (≈ 2× linear / 4× texel detail of S1.0). */
export function synthesizeS11HDMapSet(sizes: { finger: number; palm: number; micro: number; nail: number } = S11_HD_SIZES): S11HDMapSet {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const tiles = buildTiles();
  const finger = synthFingerHD(sizes.finger, tiles);
  const palm = synthPalmHD(sizes.palm, tiles);
  const micro = synthMicroSkinHD(sizes.micro, tiles);
  const nail = synthNailHD(sizes.nail);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { finger, palm, micro, nail, generationMs: Math.round(t1 - t0) };
}

export { buildTiles as buildS11Tiles };
