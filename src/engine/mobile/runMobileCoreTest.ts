/**
 * ★ KIWAMI MOBILE CORE 1.0 — Verification Suite (`npm run test:mobilecore`) ★
 *
 *  1. GPU parsing & refresh snapping (Adreno 825 / Mali / Apple / SwiftShader / RTX)
 *  2. Device classification: POCO F7 (Snapdragon 8s Gen 4 · Adreno 825 · 120 Hz) and the other classes
 *  3. Vsync-divisor tiers (judder-free rates only)
 *  4. Closed-loop frame pacer on a simulated 120 Hz panel: convergence, no oscillation, probe back-off,
 *     tier fallback, thermal hold + recovery, idle half-rate, OFF switch
 *  5. Latency-compensated reveal scheduling (getOutputTimestamp mapping, Bluetooth latency)
 *  6. Audio-derived haptics: PWM pattern shape, phase-locked timing, leading silence
 *  7. HUD-aware optical centre (off-axis projection shift)
 */

import {
  DeviceSignals,
  KiwamiFramePacer,
  PacerActivity,
  PacerDecision,
  classifyDevice,
  computeHudFraming,
  computeRevealSchedule,
  parseGpu,
  snapRefreshHz,
  vsyncDivisorTiers,
} from './KiwamiMobileCore';
import { extractHapticPattern } from './HapticSync';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string): void {
  if (ok) passed++;
  else failed++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

console.log('\n=== KIWAMI MOBILE CORE 1.0 — POCO F7-first Verification Suite ===\n');

// -----------------------------------------------------------------------------
// 1. GPU parsing & refresh snapping
// -----------------------------------------------------------------------------
{
  const cases: Array<[string, string, number]> = [
    ['ANGLE (Qualcomm, Adreno (TM) 825, OpenGL ES 3.2)', 'adreno', 825],
    ['Adreno (TM) 750', 'adreno', 750],
    ['Mali-G715 MC7', 'mali', 715],
    ['Apple GPU', 'apple', 0],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'swiftshader', 0],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'nvidia', 3060],
  ];
  const bad = cases.filter(([r, v, m]) => {
    const g = parseGpu(r);
    return g.vendor !== v || (m > 0 && g.model !== m);
  });
  check('parseGpu: vendor + model from WebGL renderer strings', bad.length === 0, bad.length ? `mismatch: ${bad.map((b) => b[0]).join(' | ')}` : `${cases.length}/${cases.length} (Adreno 825 → POCO F7 GPU)`);

  const snaps: Array<[number, number]> = [
    [119.6, 120],
    [59.94, 60],
    [89.2, 90],
    [143.8, 144],
    [30.1, 30],
  ];
  const badSnap = snaps.filter(([m, e]) => snapRefreshHz(m) !== e);
  check('snapRefreshHz: rAF cadence → panel refresh', badSnap.length === 0, snaps.map(([m]) => `${m}→${snapRefreshHz(m)}`).join(', '));
}

// -----------------------------------------------------------------------------
// 2. Device classification
// -----------------------------------------------------------------------------
const POCO_F7: DeviceSignals = {
  coarsePointer: true,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8, // Chrome caps navigator.deviceMemory at 8 (the phone has 12 GB)
  maxScreenSidePx: 891,
  devicePixelRatio: 3.1,
  gpuRenderer: 'ANGLE (Qualcomm, Adreno (TM) 825, OpenGL ES 3.2)',
  maxTextureSize: 16384,
  refreshHz: 119.7,
  model: '',
  userAgent: 'Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};
{
  const d = classifyDevice(POCO_F7);
  check(
    'classifyDevice: POCO F7 → flagship_android_120 (POCO F7 class)',
    d.deviceClass === 'flagship_android_120' && d.isPocoF7Class && d.targetFps === 120 && d.initialPreset === 'device',
    `${d.labelJp} · target ${d.targetFps}fps · preset ${d.initialPreset}`
  );
  check(
    'POCO F7 tuning: FHD + DRS floor 0.62, HD hand textures pre-generated at idle, 3 render workers',
    d.resolution === 'fhd' && Math.abs(d.drsMinScale - 0.62) < 1e-9 && d.hdPregenAtIdle && d.renderWorkers === 3 && d.jsoundQuality === 'pro',
    `res ${d.resolution} · DRS ≥ ${d.drsMinScale} · pregen ${d.hdPregenAtIdle} · workers ${d.renderWorkers} · audio ${d.jsoundQuality}`
  );

  const at60 = classifyDevice({ ...POCO_F7, refreshHz: 60 });
  check('POCO F7 in 60 Hz display mode → android_high @ 60 fps', at60.deviceClass === 'android_high' && at60.targetFps === 60, `${at60.deviceClass} · ${at60.targetFps}fps`);

  const masked = classifyDevice({ ...POCO_F7, gpuRenderer: '' });
  check(
    'masked GPU string + 8 cores + 8 GB + 120 Hz → still high-end (pacer corrects within ~1 s)',
    masked.deviceClass === 'android_high' && masked.targetFps === 120,
    `${masked.deviceClass} · ${masked.targetFps}fps`
  );

  const mid = classifyDevice({ ...POCO_F7, gpuRenderer: 'Adreno (TM) 610', hardwareConcurrency: 8, deviceMemoryGb: 4, refreshHz: 60 });
  const iphone = classifyDevice({
    ...POCO_F7,
    gpuRenderer: 'Apple GPU',
    hardwareConcurrency: 6,
    deviceMemoryGb: null,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const desktop = classifyDevice({
    ...POCO_F7,
    coarsePointer: false,
    maxScreenSidePx: 2560,
    devicePixelRatio: 1,
    hardwareConcurrency: 16,
    gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    refreshHz: 144,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const soft = classifyDevice({ ...POCO_F7, gpuRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' });
  check(
    'other classes: Adreno 610 → eco, iPhone → apple_mobile, RTX desktop → max, SwiftShader → low',
    mid.deviceClass === 'android_mid' &&
      mid.initialPreset === 'eco' &&
      iphone.deviceClass === 'apple_mobile' &&
      desktop.deviceClass === 'desktop_high' &&
      desktop.initialPreset === 'max' &&
      soft.deviceClass === 'low' &&
      soft.initialPreset === 'eco',
    `${mid.deviceClass}/${mid.initialPreset}, ${iphone.deviceClass}, ${desktop.deviceClass}/${desktop.initialPreset}, ${soft.deviceClass}/${soft.initialPreset}`
  );
}

// -----------------------------------------------------------------------------
// 3. Vsync-divisor tiers
// -----------------------------------------------------------------------------
{
  const t120 = vsyncDivisorTiers(120, 120);
  const t60 = vsyncDivisorTiers(60, 60);
  const t120cap60 = vsyncDivisorTiers(120, 60);
  const t144 = vsyncDivisorTiers(144, 120);
  const allDivide = [
    [120, t120],
    [60, t60],
    [120, t120cap60],
    [144, t144],
  ].every(([r, ts]) => (ts as number[]).every((t) => Math.abs((r as number) / t - Math.round((r as number) / t)) < 1e-9));
  check(
    'vsync-divisor tiers: only R, R/2, R/3 (no 90 fps on a 120 Hz panel = no judder)',
    JSON.stringify(t120) === '[120,60,40]' && JSON.stringify(t60) === '[60,30]' && JSON.stringify(t120cap60) === '[60,40]' && allDivide,
    `120Hz ${JSON.stringify(t120)} · 60Hz ${JSON.stringify(t60)} · 120Hz/cap60 ${JSON.stringify(t120cap60)} · 144Hz/cap120 ${JSON.stringify(t144)}`
  );
}

// -----------------------------------------------------------------------------
// 4. Frame pacer on a simulated fixed-refresh panel
// -----------------------------------------------------------------------------
interface SimFrame {
  t: number;
  interval: number;
  missed: boolean;
  d: PacerDecision;
}

/**
 * Frame model: CPU part + GPU part ∝ pixels (renderScale²). The presented interval is quantised to
 * whole vsyncs and can never be shorter than the cap allows.
 */
function simulate(
  pacer: KiwamiFramePacer,
  seconds: number,
  cost: (tSec: number) => { cpu: number; gpu: number },
  act: (tSec: number) => PacerActivity = () => ({ animating: true, cameraMoving: false, msSinceInput: 0 }),
  refreshHz = 120
): SimFrame[] {
  const vsync = 1000 / refreshHz;
  const frames: SimFrame[] = [];
  let t = 0;
  let d = pacer.update(vsync / 1000, vsync, act(0));
  while (t < seconds * 1000) {
    const cap = d.fpsCap > 0 ? d.fpsCap : refreshHz;
    const minVsyncs = Math.max(1, Math.round(refreshHz / cap));
    const c = cost(t / 1000);
    const work = c.cpu + c.gpu * d.renderScale * d.renderScale;
    const vsyncs = Math.max(minVsyncs, Math.ceil(work / vsync - 1e-9));
    const interval = vsyncs * vsync;
    t += interval;
    const missed = vsyncs > minVsyncs;
    d = pacer.update(interval / 1000, interval, act(t / 1000));
    frames.push({ t: t / 1000, interval, missed, d });
  }
  return frames;
}

function missRate(frames: SimFrame[], from: number, to: number): number {
  const w = frames.filter((f) => f.t >= from && f.t < to);
  return w.length ? w.filter((f) => f.missed).length / w.length : 0;
}

function dominant<T>(values: T[]): T {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const tiers120 = vsyncDivisorTiers(120, 120);
let allCapsJudderFree = true;
const noteCaps = (frames: SimFrame[]) => {
  for (const f of frames) if (f.d.fpsCap !== 0 && !tiers120.includes(f.d.fpsCap)) allCapsJudderFree = false;
};

{
  // (a) light scene: never touch anything
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 120, minScale: 0.62 });
  const fr = simulate(p, 20, () => ({ cpu: 1.5, gpu: 3 }));
  noteCaps(fr);
  const s = p.stats;
  check(
    'light load (4.5 ms/frame): stays at 120 Hz · scale 1.0 with zero changes',
    p.currentScale === 1 && p.currentTier === 120 && s.scaleDowns + s.tierDowns + s.scaleUps + s.tierUps === 0 && missRate(fr, 0, 20) === 0,
    `scale ${p.currentScale} · ${p.currentTier}Hz · changes ${s.scaleDowns + s.tierDowns + s.scaleUps + s.tierUps}`
  );
}

{
  // (b) heavy scene: 11 ms at full res → converges to 0.8 (7.76 ms) at 120 Hz, probes back off
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 120, minScale: 0.62 });
  const fr = simulate(p, 60, () => ({ cpu: 2, gpu: 9 }));
  noteCaps(fr);
  const settled = dominant(fr.filter((f) => f.t >= 30).map((f) => f.d.renderScale));
  const firstDown = fr.find((f) => f.d.renderScale < 1);
  const late = missRate(fr, 30, 60);
  check(
    'heavy load (11 ms @ full res): DRS converges to 0.8 at 120 Hz within ~2 s',
    settled === 0.8 && p.currentTier === 120 && !!firstDown && firstDown.t < 1.5,
    `settled scale ${settled} · first step-down at ${firstDown ? firstDown.t.toFixed(2) : '—'} s · ${p.currentTier}Hz`
  );
  check(
    'no oscillation: failed up-probes back off exponentially, < 3 % missed frames after settling',
    p.stats.failedProbes >= 2 && p.stats.failedProbes <= 4 && late < 0.03,
    `failed probes in 60 s: ${p.stats.failedProbes} (4→8→16→32 s back-off) · miss rate 30–60 s ${(late * 100).toFixed(2)} %`
  );
}

{
  // (c) extreme scene: even the DRS floor misses at 120 → falls back to the 60 Hz divisor tier
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 120, minScale: 0.62 });
  const fr = simulate(p, 30, () => ({ cpu: 3, gpu: 27 }));
  noteCaps(fr);
  const settledCap = dominant(fr.filter((f) => f.t >= 15).map((f) => f.d.fpsCap));
  check(
    'extreme load: DRS floor (0.64) then the judder-free 60 Hz tier',
    settledCap === 60 && p.currentScale >= 0.62 && missRate(fr, 15, 30) < 0.05,
    `settled cap ${settledCap} fps · scale ${p.currentScale} · miss ${(missRate(fr, 15, 30) * 100).toFixed(1)} %`
  );
}

{
  // (d) thermal throttling: 25 s stable, then the SoC throttles (cost doubles)
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 120, minScale: 0.62 });
  const fr = simulate(p, 100, (t) => (t < 25 ? { cpu: 1, gpu: 5 } : { cpu: 2, gpu: 10 }));
  noteCaps(fr);
  const during = fr.filter((f) => f.t >= 30 && f.t < 68);
  const holdOk = during.length > 0 && during.every((f) => f.d.thermal && f.d.fpsCap === 60);
  const endCap = dominant(fr.filter((f) => f.t >= 90).map((f) => f.d.fpsCap));
  check(
    'thermal: stable 25 s then misses → one 45 s cooling hold at 60 Hz',
    p.stats.thermalEvents === 1 && holdOk,
    `thermal events ${p.stats.thermalEvents} · 30–68 s all at 60 Hz: ${holdOk}`
  );
  check(
    'thermal recovery: after the hold, DRS (not another hold) restores 120 Hz',
    endCap === 120 && p.stats.thermalEvents === 1 && missRate(fr, 90, 100) < 0.03,
    `90–100 s cap ${endCap} fps · scale ${p.currentScale} · miss ${(missRate(fr, 90, 100) * 100).toFixed(1)} %`
  );
}

{
  // (e) idle power saving: no round, no camera motion, no touch for 3 s ⇒ 60 Hz; first touch ⇒ 120 Hz
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 120, minScale: 0.62, idleSaving: true });
  const act = (t: number): PacerActivity => ({ animating: false, cameraMoving: false, msSinceInput: t < 10 ? t * 1000 : (t - 10) * 1000 });
  const fr = simulate(p, 10.2, () => ({ cpu: 1, gpu: 3 }), act);
  noteCaps(fr);
  const at2 = fr.find((f) => f.t >= 2);
  const at5 = fr.find((f) => f.t >= 5);
  const after = fr.find((f) => f.t >= 10.0);
  check(
    'idle: 3 s without input → half rate (120 → 60 Hz), next touch → 120 Hz instantly',
    !!at2 && !at2.d.idle && at2.d.fpsCap === 120 && !!at5 && at5.d.idle && at5.d.fpsCap === 60 && !!after && !after.d.idle && after.d.fpsCap === 120,
    `t=2 s ${at2?.d.fpsCap}Hz · t=5 s ${at5?.d.fpsCap}Hz (idle ${at5?.d.idle}) · after touch ${after?.d.fpsCap}Hz`
  );
}

{
  // (f) OFF switch
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 120, minScale: 0.62 });
  p.enabled = false;
  const fr = simulate(p, 5, () => ({ cpu: 2, gpu: 12 }));
  check(
    'adaptive OFF: no cap, fixed full resolution',
    fr.every((f) => f.d.fpsCap === 0 && f.d.renderScale === 1),
    `cap ${fr[fr.length - 1].d.fpsCap} · scale ${fr[fr.length - 1].d.renderScale}`
  );
}

check('every pacer cap is a vsync divisor of the 120 Hz panel', allCapsJudderFree, `allowed ${JSON.stringify(tiers120)}`);

{
  // (g) a one-vsync slip at the 60 Hz tier (25 ms) must count as a miss
  const p = new KiwamiFramePacer({ refreshHz: 120, targetFps: 60, minScale: 0.62 });
  let d: PacerDecision | null = null;
  for (let i = 0; i < 80; i++) d = p.update(0.025, 25, { animating: true, cameraMoving: false, msSinceInput: 0 });
  check('miss detector: 25 ms frames at the 60 Hz tier are detected (DRS reacts)', !!d && p.stats.scaleDowns >= 1, `scale-downs ${p.stats.scaleDowns} · scale ${p.currentScale}`);
}

// -----------------------------------------------------------------------------
// 5. Reveal scheduling
// -----------------------------------------------------------------------------
{
  const bt = computeRevealSchedule({
    revealPerfMs: 5600,
    outputTimestamp: { contextTime: 10, performanceTime: 5000 },
    ctxNow: 10.02,
    nowPerfMs: 5020,
    audioLatencySec: 0.2,
    visualLatencySec: 0.0125,
  });
  const fb = computeRevealSchedule({ revealPerfMs: 1300, outputTimestamp: null, ctxNow: 3, nowPerfMs: 1000, audioLatencySec: 0.03, visualLatencySec: 0.0125 });
  const clamp = computeRevealSchedule({ revealPerfMs: 1000, outputTimestamp: null, ctxNow: 0, nowPerfMs: 1000, audioLatencySec: 3, visualLatencySec: 1 });
  check(
    'reveal schedule: Bluetooth earbuds (200 ms) start the clash 187.5 ms before the reveal frame',
    Math.abs(bt - 10.4125) < 1e-9,
    `ctx start ${bt.toFixed(4)} s (reveal 10.6 + vis 0.0125 − lat 0.2)`
  );
  check(
    'reveal schedule: currentTime fallback + latency clamps',
    Math.abs(fb - (3.3 + 0.0125 - 0.03)) < 1e-9 && Math.abs(clamp - (0 + 0.1 - 0.5)) < 1e-9,
    `fallback ${fb.toFixed(4)} s · clamped ${clamp.toFixed(3)} s`
  );
}

// -----------------------------------------------------------------------------
// 6. Audio-derived haptics
// -----------------------------------------------------------------------------
{
  const sr = 48000;
  const len = Math.round(sr * 0.5);
  // clash-like burst: 200 Hz carrier, 2 ms attack, 45 ms exponential decay
  const clash = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.045);
    clash[i] = 0.9 * env * Math.sin(2 * Math.PI * 200 * t);
  }
  const pat = extractHapticPattern(clash, sr);
  const total = pat.reduce((a, b) => a + b, 0);
  const ons = pat.filter((_, i) => i % 2 === 0);
  check(
    'haptics: clash burst → strong first pulse, decaying PWM, ≤ 384 ms, odd length (ends on a pulse)',
    pat.length >= 1 && pat.length % 2 === 1 && pat[0] >= 15 && total <= 384 && pat.every((v) => v >= 0) && ons[ons.length - 1] <= ons[0],
    `[${pat.join(', ')}] = ${total} ms`
  );

  // two bursts 48 ms apart separated by one quiet slot: the 2nd pulse must start at exactly 48 ms
  const two = new Float32Array(Math.round(sr * 0.2));
  for (let i = 0; i < two.length; i++) {
    const t = i / sr;
    const on = (t < 0.018) || (t >= 0.048 && t < 0.066);
    two[i] = on ? 0.8 * Math.sin(2 * Math.PI * 180 * t) : 0;
  }
  const p2 = extractHapticPattern(two, sr);
  const start2 = p2.length >= 3 ? p2[0] + p2[1] : -1;
  check('haptics: gaps keep the clock (2nd pulse phase-locked at 48 ms)', start2 === 48, `[${p2.join(', ')}] → pulse 2 at ${start2} ms`);

  // leading silence (transient at 30 ms) is kept as an initial pause
  const lead = new Float32Array(Math.round(sr * 0.2));
  for (let i = 0; i < lead.length; i++) {
    const t = i / sr;
    lead[i] = t >= 0.03 ? 0.8 * Math.exp(-(t - 0.03) / 0.03) * Math.sin(2 * Math.PI * 160 * t) : 0;
  }
  const p3 = extractHapticPattern(lead, sr);
  check('haptics: pre-delayed transient → [0, 24, …] initial pause', p3[0] === 0 && p3[1] === 24 && p3.length >= 3, `[${p3.join(', ')}]`);

  const silent = extractHapticPattern(new Float32Array(sr / 4), sr);
  const off = extractHapticPattern(clash, sr, { strength: 0 });
  check('haptics: silence / strength 0 → no vibration', silent.length === 0 && off.length === 0, `silent [${silent}] · off [${off}]`);
}

// -----------------------------------------------------------------------------
// 7. HUD-aware optical centre
// -----------------------------------------------------------------------------
{
  const poco = computeHudFraming({ viewW: 412, viewH: 915, topOcclusionPx: 56, bottomOcclusionPx: 173 });
  const none = computeHudFraming({ viewW: 412, viewH: 915, topOcclusionPx: 0, bottomOcclusionPx: 0 });
  const huge = computeHudFraming({ viewW: 412, viewH: 915, topOcclusionPx: 0, bottomOcclusionPx: 500 });
  const topHeavy = computeHudFraming({ viewW: 915, viewH: 412, topOcclusionPx: 120, bottomOcclusionPx: 20 });
  check(
    'HUD framing (POCO F7 portrait): look-at point moved 58.5 px up to the free-band centre',
    Math.abs(poco.offsetYPx - 58.5) < 1e-9 && Math.abs(poco.freeCenterYPx - 399) < 1e-9 && poco.freeHeightPx === 686,
    `offset ${poco.offsetYPx} px · free band centre ${poco.freeCenterYPx} px · ${poco.freeHeightPx} px tall`
  );
  check(
    'HUD framing: no HUD → 0, clamp ≤ 16 % of the height, top-heavy HUD shifts down',
    none.offsetYPx === 0 && Math.abs(huge.offsetYPx - 915 * 0.16) < 1e-9 && topHeavy.offsetYPx < 0,
    `none ${none.offsetYPx} · huge ${huge.offsetYPx.toFixed(1)} · top-heavy ${topHeavy.offsetYPx}`
  );
}

console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) (globalThis as { process?: { exit: (code: number) => void } }).process?.exit(1);
