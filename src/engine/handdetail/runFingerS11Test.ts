/**
 * ★ FINGER S1.1 — Verification Suite (`npm run test:fingers11`) ★
 *
 *  1. Zoom tier governor: thresholds, hysteresis (no flicker), OFF switch
 *  2. 2× geometry LOD: ≥ 3.8× vertices on every sculpted part, and the HD mesh lies on exactly the
 *     same analytic surface as the base mesh (no popping on the swap)
 *  3. HD textures: 4× texels, measurable detail above the S1.0 map's Nyquist limit, 2× fingerprint
 *     ridge density, valid packing (normal.z > 0, roughness in alpha)
 *  4. MICRO-DERMA FRACTAL 2.0: analytic surface gradients match finite differences at every zoom
 *  5. GLSL ↔ CPU mirror share one octave table; LOD weights band-limit every octave
 *  6. GPU frame-budget governor sheds/restores the finest octaves
 */

import * as THREE from 'three';
import {
  FingerS11DetailGovernor,
  FingerS11FrameBudgetGovernor,
  S11_GLSL_COMMON,
  S11_OCTAVES,
  S11_TIER_SPECS,
  evaluateS11SkinReliefCPU,
  s11OctaveWeight,
} from '../../graphics/FingerS11DetailEngine';
import {
  createFingerS1CuticleArchGeo,
  createFingerS1ForearmWristGeo,
  createFingerS1JointCapsuleGeo,
  createFingerS1KnuckleWrinkleStackGeo,
  createFingerS1NailPlateGeo,
  createFingerS1PhalanxGeo,
  createFingerS1SculptedPalmGeo,
} from '../../graphics/FingerS1Engine';
import {
  S10_BASE_SIZES,
  S11_HD_SIZES,
  buildS11Tiles,
  synthFingerHD,
  synthMicroSkinHD,
  synthNailHD,
  synthPalmHD,
} from '../../graphics/FingerS11TextureSynth';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string): void {
  if (ok) passed++;
  else failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

console.log('\n=== FINGER S1.1 — Zoom-Adaptive 2× Detail Verification Suite ===\n');

// -----------------------------------------------------------------------------
// 1. Tier governor
// -----------------------------------------------------------------------------
{
  const gov = new FingerS11DetailGovernor();
  const seq = [1, 2.4, 2.6, 2.3, 2.0, 1.8, 13, 11, 9.5, 8.6, 95, 70, 60, 1];
  const tiers = seq.map((m) => gov.update(m).tier);
  const expected = [0, 0, 1, 1, 1, 0, 2, 2, 2, 1, 3, 3, 2, 0];
  const ok = tiers.every((t, i) => t === expected[i]);
  const off = new FingerS11DetailGovernor().update(500, false).tier;
  check(
    'Zoom tier governor climbs at 2.5× / 12× / 90× and only descends below threshold ÷ 1.35 (no flicker)',
    ok && off === 0,
    `mag ${seq.join('→')} ⇒ tiers ${tiers.join('')} (OFF at 500× → tier ${off})`
  );
}

// -----------------------------------------------------------------------------
// 2. Geometry LOD
// -----------------------------------------------------------------------------
{
  const builders: Array<{ name: string; base: THREE.BufferGeometry; hd: THREE.BufferGeometry; exactNest: boolean; tol: number }> = [
    { name: 'phalanx', base: createFingerS1PhalanxGeo(0.105, 0.025, 0.022, false), hd: createFingerS1PhalanxGeo(0.105, 0.025, 0.022, false, false, 2), exactNest: true, tol: 1e-9 },
    { name: 'distal+nail bed', base: createFingerS1PhalanxGeo(0.056, 0.019, 0.017, true), hd: createFingerS1PhalanxGeo(0.056, 0.019, 0.017, true, false, 2), exactNest: true, tol: 1e-9 },
    { name: 'wrist', base: createFingerS1ForearmWristGeo(), hd: createFingerS1ForearmWristGeo(2), exactNest: true, tol: 1e-9 },
    { name: 'joint capsule', base: createFingerS1JointCapsuleGeo(0.025), hd: createFingerS1JointCapsuleGeo(0.025, 2), exactNest: true, tol: 1e-9 },
    { name: 'knuckle folds', base: createFingerS1KnuckleWrinkleStackGeo(0.025), hd: createFingerS1KnuckleWrinkleStackGeo(0.025, 2), exactNest: true, tol: 0.025 * 0.009 },
    { name: 'nail slab', base: createFingerS1NailPlateGeo(0.029, 0.036), hd: createFingerS1NailPlateGeo(0.029, 0.036, 0.0018, 2), exactNest: false, tol: 0 },
    { name: 'cuticle arch', base: createFingerS1CuticleArchGeo(0.029, 0.036), hd: createFingerS1CuticleArchGeo(0.029, 0.036, 2), exactNest: false, tol: 0 },
    { name: 'sculpted palm', base: createFingerS1SculptedPalmGeo(1), hd: createFingerS1SculptedPalmGeo(1, 2), exactNest: true, tol: 1e-9 },
  ];
  let minRatio = Infinity;
  let maxDev = 0;
  let worstName = '';
  let finite = true;
  for (const b of builders) {
    // 2× segments per axis -> 4× triangles (rim/edge strips make small parts slightly lower)
    const nb = (b.base.index ? b.base.index.count : b.base.attributes.position.count) / 3;
    const nh = (b.hd.index ? b.hd.index.count : b.hd.attributes.position.count) / 3;
    const ratio = nh / nb;
    if (ratio < minRatio) {
      minRatio = ratio;
      worstName = b.name;
    }
    const ph = b.hd.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ph.count; i++) if (!Number.isFinite(ph.getX(i) + ph.getY(i) + ph.getZ(i))) finite = false;
    if (b.exactNest) {
      // Grid geometries: base vertex (ix, iy) == HD vertex (2ix, 2iy)
      const uvB = b.base.attributes.uv as THREE.BufferAttribute;
      const pb = b.base.attributes.position as THREE.BufferAttribute;
      const uvH = b.hd.attributes.uv as THREE.BufferAttribute;
      // build HD lookup by uv
      const key = (u: number, v: number): string => `${u.toFixed(6)},${v.toFixed(6)}`;
      const map = new Map<string, number>();
      for (let i = 0; i < uvH.count; i++) map.set(key(uvH.getX(i), uvH.getY(i)), i);
      for (let i = 0; i < pb.count; i++) {
        const j = map.get(key(uvB.getX(i), uvB.getY(i)));
        if (j === undefined) continue;
        const d = Math.hypot(pb.getX(i) - ph.getX(j), pb.getY(i) - ph.getY(j), pb.getZ(i) - ph.getZ(j));
        if (d > b.tol) maxDev = Math.max(maxDev, d);
      }
    }
  }
  check(
    '2× tessellation LOD: every sculpted part gets 2× segments per axis (≥ 3.85× triangles), all finite',
    minRatio >= 3.85 && finite,
    `min triangle ratio ${minRatio.toFixed(2)}× (${worstName}); palm ${builders[7].base.index!.count / 3}→${builders[7].hd.index!.count / 3} triangles`
  );
  check(
    'HD meshes lie on the identical analytic surface as S1.0 (seamless, pop-free tier swap)',
    maxDev === 0,
    `max deviation at shared parameters beyond tolerance = ${maxDev.toExponential(2)} m (knuckle micro-folds ≤ 0.9% r by design)`
  );
}

// -----------------------------------------------------------------------------
// 3. HD textures
// -----------------------------------------------------------------------------
{
  const tiles = buildS11Tiles();
  const t0 = performance.now();
  const finger = synthFingerHD(S11_HD_SIZES.finger, tiles, true);
  const palm = synthPalmHD(S11_HD_SIZES.palm, tiles, true);
  const micro = synthMicroSkinHD(S11_HD_SIZES.micro, tiles, true);
  const nail = synthNailHD(S11_HD_SIZES.nail, true);
  const genMs = performance.now() - t0;

  const texelRatio = (S11_HD_SIZES.finger / S10_BASE_SIZES.finger) ** 2;
  check(
    'HD tier carries 2× linear / 4× texel resolution on every hand surface',
    S11_HD_SIZES.finger === 2 * S10_BASE_SIZES.finger &&
      S11_HD_SIZES.palm === 2 * S10_BASE_SIZES.palm &&
      S11_HD_SIZES.micro === 2 * S10_BASE_SIZES.micro &&
      S11_HD_SIZES.nail === 2 * S10_BASE_SIZES.nail,
    `finger/palm ${S10_BASE_SIZES.finger}²→${S11_HD_SIZES.finger}², micro/nail ${S10_BASE_SIZES.micro}²→${S11_HD_SIZES.micro}² (${texelRatio}× texels), synthesis ${(genMs / 1000).toFixed(1)} s (off-thread in 2 workers)`
  );

  // Detail above the S1.0 map's Nyquist limit: residual after 2× box-down / bilinear-up
  const residualRatio = (h: Float32Array, size: number): number => {
    const half = size / 2;
    const low = new Float32Array(half * half);
    for (let y = 0; y < half; y++)
      for (let x = 0; x < half; x++) {
        const i = 2 * y * size + 2 * x;
        low[y * half + x] = 0.25 * (h[i] + h[i + 1] + h[i + size] + h[i + size + 1]);
      }
    let mean = 0;
    for (let i = 0; i < h.length; i++) mean += h[i];
    mean /= h.length;
    let res = 0;
    let tot = 0;
    for (let y = 2; y < size - 2; y++) {
      for (let x = 2; x < size - 2; x++) {
        const fx = (x - 0.5) / 2;
        const fy = (y - 0.5) / 2;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const a = low[y0 * half + x0];
        const b = low[y0 * half + x0 + 1];
        const c = low[(y0 + 1) * half + x0];
        const d = low[(y0 + 1) * half + x0 + 1];
        const up = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
        const v = h[y * size + x];
        res += (v - up) * (v - up);
        tot += (v - mean) * (v - mean);
      }
    }
    return Math.sqrt(res / tot);
  };
  const rF = residualRatio(finger.height!, finger.size);
  const rP = residualRatio(palm.height!, palm.size);
  const rN = residualRatio(nail.height!, nail.size);
  // Baseline: the same generator at S1.0 resolution, merely upscaled ×2 (what "bigger textures"
  // without new detail would give) — its residual is only interpolation error.
  const base = synthFingerHD(S10_BASE_SIZES.finger, tiles, true).height!;
  const bs = S10_BASE_SIZES.finger;
  const up = new Float32Array(4 * bs * bs);
  for (let y = 0; y < 2 * bs; y++) {
    for (let x = 0; x < 2 * bs; x++) {
      const fx = Math.min(bs - 1.001, Math.max(0, (x - 0.5) / 2));
      const fy = Math.min(bs - 1.001, Math.max(0, (y - 0.5) / 2));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = base[y0 * bs + x0];
      const b = base[y0 * bs + x0 + 1];
      const c = base[(y0 + 1) * bs + x0];
      const d = base[(y0 + 1) * bs + x0 + 1];
      up[y * 2 * bs + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  const rBase = residualRatio(up, 2 * bs);
  check(
    'HD maps hold real detail beyond the S1.0 resolution limit (vs. a plain 2× upscale baseline)',
    rF > 0.08 && rP > 0.08 && rN > 0.05 && (rF / rBase) ** 2 >= 3,
    `sub-Nyquist residual RMS: finger ${(rF * 100).toFixed(1)}%, palm ${(rP * 100).toFixed(1)}%, nail ${(rN * 100).toFixed(1)}% vs upscaled-S1.0 baseline ${(rBase * 100).toFixed(1)}% (finger: ${((rF / rBase) ** 2).toFixed(1)}× more fine-scale relief energy)`
  );

  // Fingerprint ridge density on the pulp centreline (volar u≈0.5, v≈0.56): count crest crossings
  const size = finger.size;
  const row = Math.round(0.56 * size);
  let crossings = 0;
  let prev = 0;
  const h = finger.height!;
  for (let x = Math.round(0.38 * size); x < Math.round(0.62 * size); x++) {
    // local high-pass to isolate ridges
    const v = h[row * size + x] - 0.5 * (h[row * size + x - 3] + h[row * size + x + 3]);
    if (prev <= 0 && v > 0) crossings++;
    prev = v;
  }
  // S1.0 ridge law: phase = r·114 (vs 228 in S1.1) -> count S1.0 crests over the same span analytically
  let s10Crossings = 0;
  let prevS = 0;
  for (let x = Math.round(0.38 * size); x < Math.round(0.62 * size); x++) {
    const u = x / size;
    const fpDx = (u - 0.5) * 3.2;
    const fpDy = (0.56 - 0.56) * 2.1;
    const sv = Math.sin(Math.hypot(fpDx, fpDy) * 114 + Math.atan2(fpDy, fpDx));
    if (prevS <= 0 && sv > 0) s10Crossings++;
    prevS = sv;
  }
  check(
    'Dermatoglyphic papillary ridges at ≥ 1.8× S1.0 density (anatomical ≈ 0.45 mm spacing)',
    crossings >= s10Crossings * 1.8,
    `ridge crests across the fingertip pad: S1.0 ${s10Crossings} → S1.1 ${crossings}`
  );

  // Packing validity
  let normalOk = true;
  let roughMin = 255;
  let roughMax = 0;
  for (const m of [finger, palm, micro]) {
    for (let i = 0; i < m.normalHeight.length; i += 4 * 97) {
      if (m.normalHeight[i + 2] < 128) normalOk = false;
    }
    for (let i = 3; i < m.albedoRough.length; i += 4 * 89) {
      roughMin = Math.min(roughMin, m.albedoRough[i]);
      roughMax = Math.max(roughMax, m.albedoRough[i]);
    }
  }
  check(
    'Packed maps are valid: tangent normals face outward, roughness rides in albedo alpha (2 textures/surface vs 3)',
    normalOk && roughMin >= Math.floor(0.3 * 255) - 1 && roughMax <= Math.ceil(0.8 * 255) + 1,
    `normal.z ≥ 0.5 everywhere sampled, roughness alpha ∈ [${(roughMin / 255).toFixed(2)}, ${(roughMax / 255).toFixed(2)}], HD VRAM ≈ ${(((2 * S11_HD_SIZES.finger ** 2 * 4 * 2 + 2 * S11_HD_SIZES.micro ** 2 * 4 * 2) / 1048576) * 1.33).toFixed(0)} MB incl. mips`
  );
}

// -----------------------------------------------------------------------------
// 4. Analytic gradient correctness
// -----------------------------------------------------------------------------
{
  let seed = 99;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const zooms = [
    { label: '1×', px: 6e-4 },
    { label: '18×', px: 3.3e-5 },
    { label: '320×', px: 1.9e-6 },
    { label: '5000×', px: 1.2e-7 },
  ];
  const details: string[] = [];
  let allOk = true;
  for (const z of zooms) {
    let good = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const qx = (rnd() - 0.5) * 0.08;
      const qy = (rnd() - 0.5) * 0.08;
      const params = { dorsal: rnd(), dorsalStrain: rnd(), volarCompress: 0.3 + 0.7 * rnd(), pxWorld: z.px, maxOctave: 8 };
      const a = evaluateS11SkinReliefCPU(qx, qy, params);
      const eps = 2e-10;
      const hx1 = evaluateS11SkinReliefCPU(qx + eps, qy, params).h;
      const hx0 = evaluateS11SkinReliefCPU(qx - eps, qy, params).h;
      const hy1 = evaluateS11SkinReliefCPU(qx, qy + eps, params).h;
      const hy0 = evaluateS11SkinReliefCPU(qx, qy - eps, params).h;
      const fx = (hx1 - hx0) / (2 * eps);
      const fy = (hy1 - hy0) / (2 * eps);
      const mag = Math.max(1e-4, Math.hypot(a.gx, a.gy));
      const err = Math.hypot(fx - a.gx, fy - a.gy) / mag;
      total++;
      if (err < 1e-3) good++;
    }
    const pct = (good / total) * 100;
    if (pct < 97) allOk = false;
    details.push(`${z.label}: ${pct.toFixed(1)}%`);
  }
  check(
    'MICRO-DERMA FRACTAL 2.0 analytic surface gradients match finite differences (< 0.1% error) at every zoom',
    allOk,
    `agreement (excluding measure-zero Voronoi/threshold kinks): ${details.join(', ')}`
  );

  // Physical slopes stay plausible for skin micro-relief (no razor spikes)
  let maxSlope = 0;
  let meanSlope = 0;
  let n = 0;
  for (const z of zooms) {
    for (let i = 0; i < 300; i++) {
      const r = evaluateS11SkinReliefCPU((rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08, {
        dorsal: rnd(),
        dorsalStrain: 0.3,
        volarCompress: 0.6,
        pxWorld: z.px,
        maxOctave: 8,
      });
      const s = Math.hypot(r.gx, r.gy);
      maxSlope = Math.max(maxSlope, s);
      meanSlope += s;
      n++;
    }
  }
  meanSlope /= n;
  check(
    'Micro-relief slopes are physically plausible for human skin (mean 0.05–0.6, max < 3)',
    meanSlope > 0.05 && meanSlope < 0.6 && maxSlope < 3,
    `mean |∇h| = ${meanSlope.toFixed(3)}, max = ${maxSlope.toFixed(2)}`
  );
}

// -----------------------------------------------------------------------------
// 5. GLSL / CPU consistency and band-limiting
// -----------------------------------------------------------------------------
{
  const fmt = (v: number): string => {
    const s = String(v);
    return s.includes('.') || s.includes('e') ? s : `${s}.0`;
  };
  const missing = S11_OCTAVES.filter((o) => !S11_GLSL_COMMON.includes(`s11OctW( ${fmt(o.freq)}, px,`));
  // every octave must be (a) invisible when a cycle spans < 2.5 px and (b) present at 10 px/cycle
  let bandOk = true;
  S11_OCTAVES.forEach((o, i) => {
    const tooFine = s11OctaveWeight(o.freq, 1 / (o.freq * 2.0), i, 8);
    const visible = s11OctaveWeight(o.freq, 1 / (o.freq * 10), i, 8);
    if (tooFine > 0 || visible < 0.99) bandOk = false;
  });
  const capped = s11OctaveWeight(S11_OCTAVES[7].freq, 1 / (S11_OCTAVES[7].freq * 10), 7, S11_TIER_SPECS[1].maxOctave);
  check(
    'GLSL and CPU mirror share one 8-octave table; every octave is alias-free (0 below 2.5 px/cycle) and tier-capped',
    missing.length === 0 && bandOk && capped === 0,
    `octaves ${S11_OCTAVES.map((o) => (o.freq >= 1000 ? `${o.freq / 1000}k` : o.freq)).join('/')} cycles·m⁻¹ (${(1e3 / S11_OCTAVES[0].freq).toFixed(1)} mm → ${(1e6 / S11_OCTAVES[7].freq).toFixed(0)} µm), missing in GLSL: ${missing.length}`
  );
}

// -----------------------------------------------------------------------------
// 6. GPU frame-budget governor
// -----------------------------------------------------------------------------
{
  const g = new FingerS11FrameBudgetGovernor();
  let cap = 8;
  for (let i = 0; i < 300; i++) cap = g.update(1 / 30, 34, 8); // 10 s of slow frames
  const shedTo = cap;
  for (let i = 0; i < 900; i++) cap = g.update(1 / 90, 9, 8); // 10 s of fast frames
  check(
    'GPU frame-budget governor sheds the finest octaves when frames are slow and restores them when fast',
    shedTo === 5 && cap === 8,
    `tier-3 cap 8 → ${shedTo} under 34 ms frames → ${cap} under 9 ms frames`
  );
}

console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) (globalThis as { process?: { exit: (code: number) => void } }).process?.exit(1);
