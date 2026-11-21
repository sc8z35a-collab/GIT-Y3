/**
 * ★ KIWAMI MOBILE CORE 1.0 — POCO F7-first device-adaptive performance engine ★
 *
 * Reference target: POCO F7 — Snapdragon 8s Gen 4 (4 nm, 1× Cortex-X4 @ 3.21 GHz + 7× Cortex-A720),
 * Adreno 825, 6.83" 1280×2772 AMOLED @ 120 Hz (~447 ppi), 12 GB LPDDR5X, UFS 4.1.
 *
 * 1. `classifyDevice` — fingerprints the device from the WebGL renderer string (ANGLE → "Adreno (TM) 825"),
 *    core count, memory, measured display refresh (rAF cadence), pointer type and screen size, and picks a
 *    tuned starting configuration. Adreno 825 + 120 Hz + 8 cores ⇒ "POCO F7 級": 120 Hz target, FHD with
 *    dynamic resolution, HD hand textures pre-generated at idle (12 GB RAM makes the 106 MB tier free),
 *    3 render-farm workers on the A720 cluster, Pro-quality physical synthesis.
 * 2. `KiwamiFramePacer` — closed-loop frame pacing for 120 Hz OLED phones:
 *      - vsync-divisor tiers only (120 → 60 → 40 on a 120 Hz panel): every frame is held for the same
 *        number of vsyncs, so lowering the rate never introduces judder (90 fps on 120 Hz would);
 *      - Dynamic Resolution Scaling on a discrete ladder (1.0 → 0.56) driven by the missed-vsync rate
 *        in 0.5 s windows; render targets are reallocated only on a step, never per frame;
 *      - upward moves are probes that revert on the first miss with exponential back-off (4 → 32 s);
 *      - sustained-load ("thermal") detection: a configuration that had been stable for 20 s and then
 *        starts missing triggers 45 s at the half-rate tier instead of oscillating while the SoC throttles;
 *      - power-aware idle pacing: no round, no camera motion and no touch for 3 s ⇒ half refresh
 *        (60 Hz), back to 120 Hz on the very next interaction.
 * 3. `computeRevealSchedule` — maps a future visual event (the "PON!" reveal frame) onto the
 *    AudioContext clock using `getOutputTimestamp()` and subtracts the device's audio output latency
 *    (large on Bluetooth earbuds), so the impact is *heard* on the frame it is *seen*.
 * 4. `computeHudFraming` — HUD-aware optical centre: an off-axis projection shift that puts the
 *    camera's look-at point in the middle of the band the top bar and the hand dock leave free on a
 *    20:9 portrait screen (no camera move, so every hand-tuned shot keeps its perspective).
 *
 * Pure logic (no DOM) except `probeDeviceSignals`, so it is fully unit-tested in Node.
 */

import type { QualityPresetId, ResolutionPresetId, ShadowFlameMode } from '../../graphics/GraphicsConfig';

export interface DeviceSignals {
  coarsePointer: boolean;
  hardwareConcurrency: number;
  /** navigator.deviceMemory (Chrome reports at most 8) or null when unavailable */
  deviceMemoryGb: number | null;
  /** max(screen.width, screen.height) in CSS px */
  maxScreenSidePx: number;
  devicePixelRatio: number;
  /** UNMASKED_RENDERER_WEBGL (e.g. "ANGLE (Qualcomm, Adreno (TM) 825, OpenGL ES 3.2)") or '' */
  gpuRenderer: string;
  maxTextureSize: number;
  /** measured display refresh rate from requestAnimationFrame cadence */
  refreshHz: number;
  /** UA-CH model if available (e.g. a Xiaomi model number) */
  model: string;
  userAgent: string;
}

export type DeviceClass =
  | 'flagship_android_120'
  | 'android_high'
  | 'android_mid'
  | 'apple_mobile'
  | 'desktop_high'
  | 'desktop_mid'
  | 'low';

export interface DeviceDecision {
  deviceClass: DeviceClass;
  labelJp: string;
  isPocoF7Class: boolean;
  gpuFamily: string;
  targetFps: 120 | 90 | 60;
  initialPreset: QualityPresetId | 'device';
  resolution: ResolutionPresetId;
  shadow: ShadowFlameMode;
  jsoundQuality: 'ultra' | 'pro' | 'lite';
  drsMinScale: number;
  hdPregenAtIdle: boolean;
  renderWorkers: number;
  reasonsJp: string[];
}

export interface GpuInfo {
  vendor: 'adreno' | 'mali' | 'apple' | 'powervr' | 'xclipse' | 'nvidia' | 'amd' | 'intel' | 'swiftshader' | 'unknown';
  model: number;
  raw: string;
}

/** Parse the WebGL renderer string into a GPU family and model number. */
export function parseGpu(renderer: string): GpuInfo {
  const r = renderer || '';
  const num = (re: RegExp): number => {
    const m = r.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };
  if (/adreno/i.test(r)) return { vendor: 'adreno', model: num(/adreno\D*(\d{3})/i), raw: r };
  if (/immortalis|mali/i.test(r)) return { vendor: 'mali', model: num(/(?:mali|immortalis)-?g?(\d{2,3})/i), raw: r };
  if (/apple/i.test(r)) return { vendor: 'apple', model: num(/apple\s*(?:a|m)?(\d{1,2})/i), raw: r };
  if (/xclipse/i.test(r)) return { vendor: 'xclipse', model: num(/xclipse\D*(\d{3})/i), raw: r };
  if (/powervr/i.test(r)) return { vendor: 'powervr', model: 0, raw: r };
  if (/swiftshader|llvmpipe|software/i.test(r)) return { vendor: 'swiftshader', model: 0, raw: r };
  if (/nvidia|geforce|rtx|gtx/i.test(r)) return { vendor: 'nvidia', model: num(/(?:rtx|gtx)\s*(\d{3,4})/i), raw: r };
  if (/amd|radeon/i.test(r)) return { vendor: 'amd', model: num(/rx\s*(\d{3,4})/i), raw: r };
  if (/intel/i.test(r)) return { vendor: 'intel', model: 0, raw: r };
  return { vendor: 'unknown', model: 0, raw: r };
}

/** Snap a measured rAF rate to the nearest common panel refresh. */
export function snapRefreshHz(measured: number): number {
  const rates = [30, 48, 60, 72, 90, 120, 144, 165, 240];
  let best = 60;
  let bestErr = Infinity;
  for (const r of rates) {
    const e = Math.abs(measured - r) / r;
    if (e < bestErr) {
      bestErr = e;
      best = r;
    }
  }
  return best;
}

/**
 * Pick a tuned starting configuration. Adreno model numbers: 8xx = Snapdragon 8-series 2024+
 * (825 = 8s Gen 4 → POCO F7), 750/740/730 = 8 Gen 3/2/1, 7xx < 700 = 7-series / older.
 */
export function classifyDevice(sig: DeviceSignals): DeviceDecision {
  const gpu = parseGpu(sig.gpuRenderer);
  const mem = sig.deviceMemoryGb ?? 4;
  const cores = sig.hardwareConcurrency || 4;
  const hz = snapRefreshHz(sig.refreshHz || 60);
  const isMobile = sig.coarsePointer && sig.maxScreenSidePx <= 1366;
  const isAndroid = /android/i.test(sig.userAgent);
  const reasons: string[] = [];

  // Adreno 8xx ≥ 820 (8s Gen 4 = 825, 8 Elite = 830) and 730–7xx (8 Gen 1–3); 810/7xx<730 are mid-range
  const highAdreno = gpu.vendor === 'adreno' && (gpu.model >= 820 || (gpu.model >= 730 && gpu.model < 800));
  const highMali = gpu.vendor === 'mali' && gpu.model >= 710;
  const highXclipse = gpu.vendor === 'xclipse' && gpu.model >= 920;
  const isPocoF7Class = gpu.vendor === 'adreno' && gpu.model === 825;

  if (gpu.raw) reasons.push(`GPU: ${gpu.raw.replace(/^ANGLE \(|\)$/g, '')}`);
  reasons.push(`${cores}コア / ${mem}GB以上 / ${hz}Hz表示`);

  if (gpu.vendor === 'swiftshader') {
    return {
      deviceClass: 'low',
      labelJp: 'ソフトウェア描画（GPUなし）',
      isPocoF7Class: false,
      gpuFamily: 'software',
      targetFps: 60,
      initialPreset: 'eco',
      resolution: 'hd',
      shadow: 'standard',
      jsoundQuality: 'lite',
      drsMinScale: 0.5,
      hdPregenAtIdle: false,
      renderWorkers: 1,
      reasonsJp: [...reasons, 'GPUアクセラレーションが無効のため最軽量設定'],
    };
  }

  if (isMobile && /iphone|ipad|ipod/i.test(sig.userAgent)) {
    return {
      deviceClass: 'apple_mobile',
      labelJp: 'iPhone / iPad',
      isPocoF7Class: false,
      gpuFamily: 'apple',
      targetFps: hz >= 120 ? 120 : 60,
      initialPreset: 'device',
      resolution: 'fhd',
      shadow: 'flash',
      jsoundQuality: 'pro',
      drsMinScale: 0.6,
      hdPregenAtIdle: false,
      renderWorkers: Math.max(1, Math.min(3, cores - 2)),
      reasonsJp: reasons,
    };
  }

  if (isMobile && (isAndroid || gpu.vendor !== 'unknown')) {
    if ((highAdreno || highMali || highXclipse) && cores >= 8 && hz >= 120) {
      if (isPocoF7Class) reasons.push('Snapdragon 8s Gen 4 / Adreno 825 を検出（POCO F7 級）');
      return {
        deviceClass: 'flagship_android_120',
        labelJp: isPocoF7Class ? 'POCO F7 級（Snapdragon 8s Gen 4 · Adreno 825 · 120Hz）' : `ハイエンドAndroid（${gpu.vendor} ${gpu.model || ''} · ${hz}Hz）`,
        isPocoF7Class,
        gpuFamily: `${gpu.vendor}-${gpu.model}`,
        targetFps: 120,
        initialPreset: 'device',
        resolution: 'fhd',
        shadow: 'flash',
        jsoundQuality: 'pro',
        drsMinScale: 0.62,
        hdPregenAtIdle: mem >= 6,
        renderWorkers: 3,
        reasonsJp: [...reasons, '120Hz目標・動的解像度・HD手肌を待機中に事前生成'],
      };
    }
    // GPU string masked (privacy mode / some browsers) but the hardware is clearly high-end:
    // start high — the closed-loop pacer steps down within ~1 s if that was optimistic.
    const maskedButStrong = gpu.vendor === 'unknown' && cores >= 8 && mem >= 8 && hz >= 90;
    if (maskedButStrong) reasons.push('GPU名は非公開 → 8コア・8GB以上・高リフレッシュから高性能と推定');
    if (highAdreno || highMali || highXclipse || maskedButStrong) {
      return {
        deviceClass: 'android_high',
        labelJp: `ハイエンドAndroid（${hz}Hz）`,
        isPocoF7Class,
        gpuFamily: `${gpu.vendor}-${gpu.model}`,
        targetFps: hz >= 120 && maskedButStrong ? 120 : hz >= 90 ? 90 : 60,
        initialPreset: 'device',
        resolution: 'fhd',
        shadow: 'flash',
        jsoundQuality: 'pro',
        drsMinScale: 0.6,
        hdPregenAtIdle: mem >= 8,
        renderWorkers: Math.max(1, Math.min(3, cores - 2)),
        reasonsJp: reasons,
      };
    }
    return {
      deviceClass: 'android_mid',
      labelJp: 'Android（標準性能）',
      isPocoF7Class: false,
      gpuFamily: `${gpu.vendor}-${gpu.model}`,
      targetFps: 60,
      initialPreset: 'eco',
      resolution: 'hd',
      shadow: 'flash',
      jsoundQuality: 'lite',
      drsMinScale: 0.55,
      hdPregenAtIdle: false,
      renderWorkers: Math.max(1, Math.min(2, cores - 2)),
      reasonsJp: reasons,
    };
  }

  const strongDesktop =
    (gpu.vendor === 'nvidia' && gpu.model >= 1600) || (gpu.vendor === 'amd' && gpu.model >= 5000) || gpu.vendor === 'apple' || cores >= 8;
  return {
    deviceClass: strongDesktop ? 'desktop_high' : 'desktop_mid',
    labelJp: strongDesktop ? 'PC（高性能）' : 'PC（標準）',
    isPocoF7Class: false,
    gpuFamily: `${gpu.vendor}-${gpu.model}`,
    targetFps: hz >= 120 ? 120 : 60,
    initialPreset: strongDesktop ? 'max' : 'balanced',
    resolution: strongDesktop ? '2k' : 'fhd',
    shadow: strongDesktop ? 'pro' : 'flash',
    jsoundQuality: strongDesktop ? 'ultra' : 'pro',
    drsMinScale: 0.7,
    hdPregenAtIdle: strongDesktop && mem >= 6,
    renderWorkers: 3,
    reasonsJp: reasons,
  };
}

// =============================================================================
// Frame pacer
// =============================================================================

export interface PacerActivity {
  /** a round / PV / overdrive animation is playing */
  animating: boolean;
  /** the camera is moving (orbit, zoom spring, cinematic cut) */
  cameraMoving: boolean;
  /** ms since the last user input */
  msSinceInput: number;
}

export interface PacerDecision {
  fpsCap: number;
  renderScale: number;
  tierFps: number;
  idle: boolean;
  thermal: boolean;
  /** true when renderScale changed this frame (caller should reallocate render targets) */
  scaleChanged: boolean;
  reasonJp: string;
}

export const DRS_SCALE_LADDER = [1.0, 0.9, 0.8, 0.72, 0.64, 0.56] as const;

/**
 * Vsync-divisor pacing tiers: on a fixed-refresh panel only R, R/2, R/3 give perfectly even frame
 * spacing (90 fps on a 120 Hz panel would alternate 1- and 2-vsync frames = visible judder).
 */
export function vsyncDivisorTiers(refreshHz: number, targetFps: number): number[] {
  const r = snapRefreshHz(refreshHz);
  const tiers = [r, r / 2, r / 3].map((t) => Math.round(t)).filter((t) => t >= 30);
  const capped = tiers.filter((t) => t <= Math.max(30, targetFps) + 0.5);
  return capped.length > 0 ? capped : [tiers[tiers.length - 1]];
}

/**
 * Closed-loop frame pacer driven by the *missed-vsync rate* (frame intervals on a fixed-refresh panel
 * are quantised to vsync multiples, so durations alone cannot reveal headroom). Down-steps react
 * within ~1 s; up-steps are *probes* that revert instantly on the first miss and back off
 * exponentially (4 s → 32 s), so the pacer never oscillates.
 */
export class KiwamiFramePacer {
  public enabled = true;
  private readonly tiers: number[];
  private tierIdx = 0;
  private scaleIdx = 0;
  private readonly minScale: number;
  private clockSec = 0;
  // windowed miss statistics
  private winFrames = 0;
  private winMisses = 0;
  private winStart = 0;
  private badWindows = 0;
  private cleanWindows = 0;
  // probing
  private probeBackoffSec = 4;
  private probeActive: { kind: 'scale' | 'tier'; startedSec: number } | null = null;
  // sustained-load (thermal) detection
  private stableSinceSec = 0;
  private thermalUntilSec = 0;
  private lastChangeSec = 0;
  private wasThermal = false;
  private reason = '安定';
  public stats = { scaleDowns: 0, scaleUps: 0, tierDowns: 0, tierUps: 0, failedProbes: 0, thermalEvents: 0 };

  private readonly idleSaving: boolean;
  /** one panel refresh period (ms) — frame intervals are quantised to multiples of it */
  private readonly vsyncMs: number;

  constructor(opts: { refreshHz: number; targetFps: number; minScale: number; idleSaving?: boolean }) {
    this.tiers = vsyncDivisorTiers(opts.refreshHz, opts.targetFps);
    this.vsyncMs = 1000 / snapRefreshHz(opts.refreshHz);
    this.minScale = opts.minScale;
    // Idle half-rate only where it pays off (battery devices with ≥ 90 Hz panels: 120 → 60)
    this.idleSaving = (opts.idleSaving ?? true) && this.tiers.length > 1 && this.tiers[1] >= 45;
  }

  public get currentScale(): number {
    return DRS_SCALE_LADDER[this.scaleIdx];
  }

  public get currentTier(): number {
    return this.tiers[this.tierIdx];
  }

  public get tierList(): readonly number[] {
    return this.tiers;
  }

  private canScaleDown(): boolean {
    const next = DRS_SCALE_LADDER[this.scaleIdx + 1];
    return next !== undefined && next >= this.minScale - 1e-6;
  }

  private change(kind: 'scaleDown' | 'scaleUp' | 'tierDown' | 'tierUp', reason: string): void {
    if (kind === 'scaleDown') {
      this.scaleIdx++;
      this.stats.scaleDowns++;
    } else if (kind === 'scaleUp') {
      this.scaleIdx--;
      this.stats.scaleUps++;
    } else if (kind === 'tierDown') {
      this.tierIdx++;
      this.stats.tierDowns++;
    } else {
      this.tierIdx--;
      this.stats.tierUps++;
    }
    this.reason = reason;
    this.lastChangeSec = this.clockSec;
    this.stableSinceSec = this.clockSec;
    this.badWindows = 0;
    this.cleanWindows = 0;
  }

  /**
   * @param dtSec   wall time since the previous update
   * @param frameMs interval since the previous *rendered* frame (vsync-quantised)
   */
  public update(dtSec: number, frameMs: number, act: PacerActivity): PacerDecision {
    const dt = Math.max(0, Math.min(0.25, dtSec));
    this.clockSec += dt;
    const thermal = this.clockSec < this.thermalUntilSec;
    if (this.wasThermal && !thermal) {
      // cooling window over: the full-rate tier was never *stable* during it, so restart the
      // stability clock — DRS gets the first chance before another thermal hold is declared
      this.stableSinceSec = this.clockSec;
      this.badWindows = 0;
      this.reason = '冷却完了 → 通常のフレームレートに復帰';
    }
    this.wasThermal = thermal;
    const minThermalTier = Math.min(this.tiers.length - 1, 1);
    const effTierIdx = thermal ? Math.max(this.tierIdx, minThermalTier) : this.tierIdx;
    const tierFps = this.tiers[effTierIdx];
    const prevScale = this.scaleIdx;

    if (!this.enabled) {
      this.scaleIdx = 0;
      return { fpsCap: 0, renderScale: 1, tierFps: this.tiers[0], idle: false, thermal: false, scaleChanged: prevScale !== 0, reasonJp: '固定' };
    }

    // Power-aware idle pacing: capped frames are not used to steer the controller
    const idle = this.idleSaving && !act.animating && !act.cameraMoving && act.msSinceInput > 3000;
    if (idle) {
      const idleTier = this.tiers[Math.min(this.tiers.length - 1, Math.max(effTierIdx, 1))];
      this.winFrames = 0;
      this.winMisses = 0;
      this.winStart = this.clockSec;
      return { fpsCap: idleTier, renderScale: this.currentScale, tierFps, idle: true, thermal, scaleChanged: false, reasonJp: `静止中 → ${idleTier}Hzで省電力` };
    }

    // 1. accumulate miss statistics over 0.5 s windows. A miss = the frame slipped by ≥ 1 vsync:
    //    interval > expected + ½ vsync (1.5× the expected interval would let a 25 ms slip at the
    //    60 fps tier of a 120 Hz panel sit exactly on the threshold).
    this.winFrames++;
    if (frameMs > 1000 / tierFps + 0.5 * this.vsyncMs) this.winMisses++;
    if (this.clockSec - this.winStart >= 0.5) {
      const missRate = this.winFrames > 0 ? this.winMisses / this.winFrames : 0;
      this.winFrames = 0;
      this.winMisses = 0;
      this.winStart = this.clockSec;

      if (missRate > 0.08) {
        this.badWindows++;
        this.cleanWindows = 0;
      } else if (missRate === 0) {
        this.cleanWindows++;
        this.badWindows = 0;
      } else {
        this.badWindows = Math.max(0, this.badWindows - 1);
        this.cleanWindows = 0;
      }

      // 2. a probe that hits a miss window is reverted immediately and backs off exponentially
      if (this.probeActive && missRate > 0.08) {
        const p = this.probeActive;
        this.probeActive = null;
        this.stats.failedProbes++;
        this.probeBackoffSec = Math.min(32, this.probeBackoffSec * 2);
        if (p.kind === 'scale') this.change('scaleDown', '上げ試行は重かった → 解像度を戻す');
        else this.change('tierDown', '上げ試行は重かった → フレームレートを戻す');
      } else if (this.probeActive && this.clockSec - this.probeActive.startedSec > 2.0) {
        this.probeActive = null; // probe survived: keep it
        this.probeBackoffSec = Math.max(4, this.probeBackoffSec * 0.75);
      } else if (this.badWindows >= 2) {
        // measured BEFORE the step below (change() restarts the stability clock)
        const stableForSec = this.clockSec - this.stableSinceSec;
        // 3. sustained misses: lower resolution first, then the vsync-divisor tier
        if (this.canScaleDown()) this.change('scaleDown', '負荷増 → 解像度を下げて滑らかさ優先');
        else if (this.tierIdx < this.tiers.length - 1) this.change('tierDown', `最低解像度でも重い → ${this.tiers[this.tierIdx + 1]}Hzへ`);
        // 4. thermal: a configuration that had been stable for 20 s+ suddenly misses
        if (stableForSec > 20 && !thermal) {
          this.thermalUntilSec = this.clockSec + 45;
          this.stats.thermalEvents++;
          this.reason = '発熱による性能低下を検知 → 45秒間フレームレートを抑えて冷却';
        }
      } else if (this.cleanWindows * 0.5 >= this.probeBackoffSec && !thermal) {
        // 5. probe upward: resolution first, then refresh tier
        if (this.scaleIdx > 0) {
          this.change('scaleUp', '余裕あり → 解像度を上げて試行');
          this.probeActive = { kind: 'scale', startedSec: this.clockSec };
        } else if (this.tierIdx > 0) {
          this.change('tierUp', `余裕あり → ${this.tiers[this.tierIdx - 1]}Hzを試行`);
          this.probeActive = { kind: 'tier', startedSec: this.clockSec };
        }
        this.cleanWindows = 0;
      }
    }

    const outTier = this.tiers[thermal ? Math.max(this.tierIdx, minThermalTier) : this.tierIdx];
    return {
      fpsCap: outTier,
      renderScale: this.currentScale,
      tierFps: outTier,
      idle: false,
      thermal,
      scaleChanged: prevScale !== this.scaleIdx,
      reasonJp: this.reason,
    };
  }
}

// =============================================================================
// Audio/visual sync
// =============================================================================

export interface RevealScheduleInput {
  /** performance.now() when the reveal frame will be presented */
  revealPerfMs: number;
  /** AudioContext.getOutputTimestamp() snapshot (or null if unsupported) */
  outputTimestamp: { contextTime: number; performanceTime: number } | null;
  /** ctx.currentTime at the same moment as `nowPerfMs` (fallback mapping) */
  ctxNow: number;
  nowPerfMs: number;
  /** AudioContext.outputLatency + baseLatency (seconds) */
  audioLatencySec: number;
  /** display pipeline latency estimate (compositor + scan-out), seconds */
  visualLatencySec: number;
}

/**
 * Context time at which a sound must START so that it reaches the ear on the same instant the
 * reveal frame reaches the eye: t_audio = t_reveal + visualLatency − audioLatency.
 */
export function computeRevealSchedule(i: RevealScheduleInput): number {
  const lat = Math.max(0, Math.min(0.5, i.audioLatencySec));
  const vis = Math.max(0, Math.min(0.1, i.visualLatencySec));
  let ctxAtReveal: number;
  if (i.outputTimestamp && i.outputTimestamp.performanceTime > 0) {
    ctxAtReveal = i.outputTimestamp.contextTime + (i.revealPerfMs - i.outputTimestamp.performanceTime) / 1000;
  } else {
    ctxAtReveal = i.ctxNow + (i.revealPerfMs - i.nowPerfMs) / 1000;
  }
  return ctxAtReveal + vis - lat;
}

// =============================================================================
// HUD-aware optical centre
// =============================================================================

export interface HudFramingInput {
  viewW: number;
  viewH: number;
  /** CSS px covered at the top of the view by the persistent HUD (top bar + status line) */
  topOcclusionPx: number;
  /** CSS px covered at the bottom of the view by the persistent HUD (hand dock) */
  bottomOcclusionPx: number;
  /** largest allowed shift as a fraction of the view height (default 0.16) */
  maxShiftFrac?: number;
}

export interface HudFraming {
  /** `camera.setViewOffset` y offset in CSS px (positive ⇒ the subject moves up the screen) */
  offsetYPx: number;
  /** centre of the unobstructed band, CSS px from the top of the view */
  freeCenterYPx: number;
  freeHeightPx: number;
}

/**
 * ★ HUD-AWARE OPTICAL CENTRE ★
 * On a 20:9 phone the hand dock covers the lower quarter of the screen, so a camera aimed at the
 * hands puts them half behind the buttons. Instead of moving the camera (which would change the
 * perspective and every hand-tuned shot), the *projection centre* is shifted with an off-axis view
 * window (`setViewOffset`): the frustum is sheared so the camera's look-at point lands in the middle
 * of the free band between the top bar and the dock. Perspective, depth of field, shadows and the
 * 5K tiler (which builds its own sub-frustums from the un-sheared camera) are unaffected.
 */
export function computeHudFraming(i: HudFramingInput): HudFraming {
  const h = Math.max(1, i.viewH);
  const top = Math.max(0, Math.min(h * 0.45, i.topOcclusionPx));
  const bottom = Math.max(0, Math.min(h * 0.55, i.bottomOcclusionPx));
  const freeH = Math.max(1, h - top - bottom);
  const freeCenter = top + freeH / 2;
  const maxShift = h * Math.max(0, Math.min(0.3, i.maxShiftFrac ?? 0.16));
  let off = h / 2 - freeCenter;
  off = Math.max(-maxShift, Math.min(maxShift, off));
  // dead zone: sub-pixel shifts are not worth a projection update
  if (Math.abs(off) < 0.5) off = 0;
  return { offsetYPx: off, freeCenterYPx: freeCenter, freeHeightPx: freeH };
}

/** Browser-side signal collection (measures the real panel refresh with ~20 rAF samples). */
export async function probeDeviceSignals(gl: WebGL2RenderingContext | WebGLRenderingContext | null): Promise<DeviceSignals> {
  let gpuRenderer = '';
  let maxTextureSize = 4096;
  if (gl) {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpuRenderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
    } catch {
      // privacy-restricted browsers
    }
  }
  const refreshHz = await new Promise<number>((resolve) => {
    const samples: number[] = [];
    let last = 0;
    const timeout = window.setTimeout(() => resolve(60), 900);
    const step = (t: number) => {
      if (last > 0) samples.push(t - last);
      last = t;
      if (samples.length >= 20) {
        window.clearTimeout(timeout);
        samples.sort((a, b) => a - b);
        const med = samples[Math.floor(samples.length / 2)];
        resolve(med > 0 ? 1000 / med : 60);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  let model = '';
  const uaData = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ model?: string }> } }).userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      model = (await uaData.getHighEntropyValues(['model'])).model ?? '';
    } catch {
      model = '';
    }
  }
  return {
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    maxScreenSidePx: window.screen ? Math.max(window.screen.width, window.screen.height) : Math.max(window.innerWidth, window.innerHeight),
    devicePixelRatio: window.devicePixelRatio || 1,
    gpuRenderer,
    maxTextureSize,
    refreshHz,
    model,
    userAgent: navigator.userAgent,
  };
}
