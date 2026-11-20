/**
 * ★ AAA Cinema Camera Director 2.0 for JANKEN · 極 ★
 *
 * Upgraded cinematography architecture:
 *  - 5 Selectable Camera Styles: Cinematic / Duel Rail / Macro Artisan / Broadcast / Free Orbit
 *  - 13 Dynamic Camera Moods (including Over-The-Shoulder Player/NPC, Low-Angle Clash,
 *    Macro Hand Inspection, Spirit Overdrive Charge, and Feint Peek!)
 *  - Bullet-Time 180° Arc Orbit during Overdrive / Match-Point / High-Streak Hit-Stops
 *  - Catmull-Rom 3D Spline Cinema Crane Tracks for PV Director & grand stage transitions
 *  - 2-Finger Touch Pinch-to-Zoom + Wheel Zoom + Auto Mobile Portrait/Landscape Responsive Framing
 *  - Spring-damped directional recoil, 50mm–85mm focal-length dolly zoom & subtle Dutch-roll
 */

import * as THREE from 'three';
import { AnalyticSpring } from '../graphics/FingerS1Engine';
import { CameraStyleId } from '../graphics/GraphicsConfig';

export type CameraMood =
  | 'idle'
  | 'windup'
  | 'apex'
  | 'clash'
  | 'low_clash'
  | 'ots_player'
  | 'ots_npc'
  | 'macro_hand'
  | 'spirit_charge'
  | 'feint_peek'
  | 'victory'
  | 'defeat'
  | 'match_victory'
  | 'match_defeat';

export interface SplineShotConfig {
  positions: THREE.Vector3[];
  lookTargets: THREE.Vector3[];
  durationSec: number;
  fovStart?: number;
  fovEnd?: number;
  rollStart?: number;
  rollEnd?: number;
}

interface ActiveSplineShot {
  posCurve: THREE.CatmullRomCurve3;
  lookCurve: THREE.CatmullRomCurve3;
  durationSec: number;
  elapsed: number;
  fovStart: number;
  fovEnd: number;
  rollStart: number;
  rollEnd: number;
}

export interface CameraZoomTelemetry {
  /** Effective optical magnification (1.0 = normal, 100 = 100× macro, up to 5000×+) */
  magnification: number;
  /** Physical distance from lens to focus point in meters */
  workingDistanceM: number;
  /** Effective focal distance in millimeters */
  effectiveDistanceMm: number;
  /** Live vertical field-of-view in degrees */
  fovDeg: number;
  /** True when user is zoomed into macro/microscope range or panned manually */
  isInspecting: boolean;
}

export class CameraDirector {
  public readonly camera: THREE.PerspectiveCamera;

  private readonly basePos = new THREE.Vector3(0, 1.36, 2.24);
  private readonly baseLook = new THREE.Vector3(0, 0.27, -0.02);

  private targetPos = new THREE.Vector3().copy(this.basePos);
  private targetLook = new THREE.Vector3().copy(this.baseLook);
  private currentPos = new THREE.Vector3().copy(this.basePos);
  private currentLook = new THREE.Vector3().copy(this.baseLook);

  // Exact Closed-Form C² AnalyticSpring Steadicam Tracking (zero sudden start/stop snaps!)
  private readonly posSpringX = new AnalyticSpring(0);
  private readonly posSpringY = new AnalyticSpring(1.36);
  private readonly posSpringZ = new AnalyticSpring(2.24);
  private readonly lookSpringX = new AnalyticSpring(0);
  private readonly lookSpringY = new AnalyticSpring(0.27);
  private readonly lookSpringZ = new AnalyticSpring(-0.02);
  private readonly fovSpring = new AnalyticSpring(38);
  private readonly rollSpring = new AnalyticSpring(0);
  private readonly orbitAzSpring = new AnalyticSpring(0);
  private readonly orbitElSpring = new AnalyticSpring(0);
  // Logarithmic Infinite-Zoom Spring: zoomFactor = exp(zoomExp) ∈ [0.0002 (5000×) .. 5.0 (0.2×)]
  private readonly zoomExpSpring = new AnalyticSpring(0.0);
  // Precision 3D Microscope Pan Springs (world-space focus target offset!)
  private readonly panSpringX = new AnalyticSpring(0);
  private readonly panSpringY = new AnalyticSpring(0);
  private readonly panSpringZ = new AnalyticSpring(0);
  private readonly recoilSpringX = new AnalyticSpring(0);
  private readonly recoilSpringY = new AnalyticSpring(0);
  private readonly recoilSpringZ = new AnalyticSpring(0);

  // Camera Style & Mobile Responsive Framing
  private style: CameraStyleId = 'cinematic';
  private aspect = 16 / 9;
  private portraitScale = 1.0;

  // Dynamic focal-length & Dutch-roll cinema springs
  private baseFov = 38;
  private currentFov = 38;
  private targetFovOffset = 0;
  private currentRoll = 0;
  private targetRoll = 0;
  private dampRate = 6.2;

  // Interactive pointer parallax, unbounded 360° orbit, 3D pan & infinite logarithmic zoom
  private pointerX = 0;
  private pointerY = 0;
  private orbitAzimuth = 0;
  private orbitElevation = 0;
  private targetOrbitAzimuth = 0;
  private targetOrbitElevation = 0;
  private zoomExp = 0;
  private targetZoomExp = 0;
  private readonly panOffset = new THREE.Vector3();
  private readonly targetPanOffset = new THREE.Vector3();

  private isDragging = false;
  private isPanning = false;
  private hasUserPanned = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;
  private lastPinchMidX = 0;
  private lastPinchMidY = 0;

  // Live optical telemetry cache
  private liveMagnification = 1.0;
  private liveWorkingDistM = 2.4;
  private liveEffectiveDistMm = 2400;
  private liveFovDeg = 38;

  // Bullet-Time 180° Arc Orbit overlay
  private bulletOrbitRemaining = 0;
  private bulletOrbitDuration = 0;
  private bulletOrbitDir = 1;
  private bulletOrbitSpanRad = 1.45;
  private bulletOrbitAngle = 0;

  // Catmull-Rom 3D Spline Cinema Track (PV Mode & Grand Sweeps)
  private splineShot: ActiveSplineShot | null = null;
  private readonly tmpSplinePos = new THREE.Vector3();
  private readonly tmpSplineLook = new THREE.Vector3();
  private readonly tmpOffset = new THREE.Vector3();
  private readonly tmpCamPos = new THREE.Vector3();
  private readonly tmpFinalLook = new THREE.Vector3();
  private readonly tmpCamRight = new THREE.Vector3();
  private readonly tmpCamUp = new THREE.Vector3();

  // Impact micro-shake
  private microShake = 0;

  private elapsed = 0;
  private mood: CameraMood = 'idle';
  private heroSweepAngle = 0;

  // Optical limits: up to 5000× ultra-microscope magnification & 0.20× panoramic room pullout!
  private static readonly MIN_ZOOM_EXP = Math.log(1 / 5000); // ~ -8.517 -> 5000×!
  private static readonly MAX_ZOOM_EXP = Math.log(5.0);      // ~ +1.609 -> 0.2× wide!

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.02, 80);
    this.resize(aspect);
    this.triggerStageReveal();
  }

  public getStyle(): CameraStyleId {
    return this.style;
  }

  public setStyle(style: CameraStyleId): void {
    this.style = style;
    if (style !== 'free_orbit') {
      this.targetOrbitAzimuth = 0;
      this.targetOrbitElevation = 0;
      this.targetZoomExp = 0;
      this.targetPanOffset.set(0, 0, 0);
      this.hasUserPanned = false;
    }
    this.setMood(this.mood);
  }

  /** Zoom smoothly in (+steps) or out (-steps) by logarithmic perceptual optical increments (22% per step)! */
  public zoomBySteps(steps: number): void {
    const nextExp = this.targetZoomExp - steps * 0.22;
    this.targetZoomExp = THREE.MathUtils.clamp(
      nextExp,
      CameraDirector.MIN_ZOOM_EXP,
      CameraDirector.MAX_ZOOM_EXP
    );
  }

  /** Set exact target magnification (e.g. 1.0 = normal, 35 = 35× macro, 250 = 250× microscope)! */
  public setTargetMagnification(mag: number): void {
    const safeMag = Math.max(0.2, Math.min(5000, mag));
    this.targetZoomExp = THREE.MathUtils.clamp(
      Math.log(1 / safeMag),
      CameraDirector.MIN_ZOOM_EXP,
      CameraDirector.MAX_ZOOM_EXP
    );
  }

  /** Smoothly aim the optical microscope directly at any 3D world point (fingernail, tendon, palm, joint)! */
  public focusWorldPoint(
    worldTarget: THREE.Vector3,
    magnification: number,
    orbitAzimuthRad?: number,
    orbitElevationRad?: number
  ): void {
    this.stopSplineShot();
    this.hasUserPanned = false;
    this.targetPanOffset.copy(worldTarget).sub(this.targetLook);
    this.setTargetMagnification(magnification);
    if (typeof orbitAzimuthRad === 'number') this.targetOrbitAzimuth = orbitAzimuthRad;
    if (typeof orbitElevationRad === 'number') this.targetOrbitElevation = orbitElevationRad;
  }

  /** Continuously track a moving 3D landmark (e.g. opening fingernail or breathing hand) until user pans manually */
  public updateTrackedFocusPoint(worldTarget: THREE.Vector3): void {
    if (!this.hasUserPanned) {
      this.targetPanOffset.copy(worldTarget).sub(this.targetLook);
    }
  }

  public isTrackingFocus(): boolean {
    return !this.hasUserPanned;
  }

  /** Reset zoom, 3D pan, and orbit angle back to default framing smoothly */
  public resetInspectionView(): void {
    this.targetOrbitAzimuth = 0;
    this.targetOrbitElevation = 0;
    this.targetZoomExp = 0;
    this.targetPanOffset.set(0, 0, 0);
    this.hasUserPanned = false;
  }

  public getZoomTelemetry(): CameraZoomTelemetry {
    return {
      magnification: this.liveMagnification,
      workingDistanceM: this.liveWorkingDistM,
      effectiveDistanceMm: this.liveEffectiveDistMm,
      fovDeg: this.liveFovDeg,
      isInspecting:
        this.liveMagnification > 1.28 ||
        this.liveMagnification < 0.82 ||
        this.targetPanOffset.lengthSq() > 0.0004 ||
        Math.abs(this.targetOrbitAzimuth) > 0.05,
    };
  }

  private applyScreenPan(dxPx: number, dyPx: number): void {
    // 1:1 screen-pixel-matched 3D panning across ALL magnifications (1× to 5000×!)
    this.hasUserPanned = true;
    const zoomFactor = Math.exp(this.zoomExp);
    const baseDist = Math.max(0.4, this.currentPos.distanceTo(this.currentLook));
    const effectiveDist = baseDist * zoomFactor;
    const panScale = effectiveDist * 0.00118;

    this.camera.updateMatrixWorld();
    this.tmpCamRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    this.tmpCamUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();

    this.targetPanOffset.addScaledVector(this.tmpCamRight, -dxPx * panScale);
    this.targetPanOffset.addScaledVector(this.tmpCamUp, dyPx * panScale);
    // Keep focus inside the room boundaries cleanly
    this.targetPanOffset.x = THREE.MathUtils.clamp(this.targetPanOffset.x, -2.6, 2.6);
    this.targetPanOffset.y = THREE.MathUtils.clamp(this.targetPanOffset.y, -0.35, 1.85);
    this.targetPanOffset.z = THREE.MathUtils.clamp(this.targetPanOffset.z, -2.4, 2.4);
  }

  public bindCanvasEvents(canvas: HTMLCanvasElement): () => void {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 1) {
        const wantsPan =
          e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey));
        if (e.pointerType === 'mouse' && e.button !== 0 && !wantsPan) return;
        this.isPanning = wantsPan;
        this.isDragging = !wantsPan;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
      } else if (this.activePointers.size === 2) {
        this.isDragging = false;
        this.isPanning = false;
        const pts = [...this.activePointers.values()];
        this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.lastPinchMidX = (pts[0].x + pts[1].x) * 0.5;
        this.lastPinchMidY = (pts[0].y + pts[1].y) * 0.5;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      this.pointerY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;

      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // 2-Finger Touch Pinch-to-Infinite-Zoom + Simultaneous 2-Finger Microscope Pan!
      if (this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;

        if (this.lastPinchDist > 4 && dist > 4) {
          const logRatio = Math.log(this.lastPinchDist / dist);
          this.targetZoomExp = THREE.MathUtils.clamp(
            this.targetZoomExp + logRatio * 1.15,
            CameraDirector.MIN_ZOOM_EXP,
            CameraDirector.MAX_ZOOM_EXP
          );
          this.applyScreenPan(midX - this.lastPinchMidX, midY - this.lastPinchMidY);
        }
        this.lastPinchDist = dist;
        this.lastPinchMidX = midX;
        this.lastPinchMidY = midY;
        return;
      }

      if (this.isPanning) {
        const dx = e.clientX - this.lastDragX;
        const dy = e.clientY - this.lastDragY;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
        this.applyScreenPan(dx, dy);
        return;
      }

      if (this.isDragging) {
        const dx = e.clientX - this.lastDragX;
        const dy = e.clientY - this.lastDragY;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
        // Scale angular rotation sensitivity smoothly at extreme magnification for microscope-grade precision!
        const zoomFactor = Math.exp(this.zoomExp);
        const precisionScale = THREE.MathUtils.clamp(Math.pow(zoomFactor, 0.35), 0.14, 1.0);
        // Full 360° unbounded azimuth rotation in ALL modes!
        this.targetOrbitAzimuth -= dx * 0.0048 * precisionScale;
        this.targetOrbitElevation = THREE.MathUtils.clamp(
          this.targetOrbitElevation + dy * 0.0038 * precisionScale,
          -0.95,
          1.15
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.lastPinchDist = 0;
      }
      if (this.activePointers.size === 0) {
        this.isDragging = false;
        this.isPanning = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Logarithmic perceptual zoom: supports mouse wheel AND trackpad pinch (ctrlKey) seamlessly!
      const rawStep = e.ctrlKey ? e.deltaY * 0.014 : Math.sign(e.deltaY) * Math.min(0.28, Math.max(0.09, Math.abs(e.deltaY) * 0.0018));
      this.targetZoomExp = THREE.MathUtils.clamp(
        this.targetZoomExp + rawStep,
        CameraDirector.MIN_ZOOM_EXP,
        CameraDirector.MAX_ZOOM_EXP
      );
    };

    const onDblClick = () => {
      this.resetInspectionView();
    };

    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);

    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }

  private syncSpringsToCurrent(): void {
    this.posSpringX.snap(this.currentPos.x);
    this.posSpringY.snap(this.currentPos.y);
    this.posSpringZ.snap(this.currentPos.z);
    this.lookSpringX.snap(this.currentLook.x);
    this.lookSpringY.snap(this.currentLook.y);
    this.lookSpringZ.snap(this.currentLook.z);
    this.fovSpring.snap(this.currentFov);
    this.rollSpring.snap(this.currentRoll);
    this.orbitAzSpring.snap(this.orbitAzimuth);
    this.orbitElSpring.snap(this.orbitElevation);
    this.zoomExpSpring.snap(this.zoomExp);
    this.panSpringX.snap(this.panOffset.x);
    this.panSpringY.snap(this.panOffset.y);
    this.panSpringZ.snap(this.panOffset.z);
  }

  /**
   * Architectural crane-in reveal whenever entering a new stage or launching the app!
   */
  public triggerStageReveal(): void {
    this.stopSplineShot();
    this.currentPos.set(-0.48, 2.06, 3.12 * this.portraitScale);
    this.currentLook.set(0.0, 0.42, -0.35);
    this.currentFov = this.baseFov + 6.5;
    this.currentRoll = -0.024;
    this.orbitAzimuth = 0;
    this.orbitElevation = 0;
    this.zoomExp = 0;
    this.panOffset.set(0, 0, 0);
    this.targetOrbitAzimuth = 0;
    this.targetOrbitElevation = 0;
    this.targetZoomExp = 0;
    this.targetPanOffset.set(0, 0, 0);
    this.syncSpringsToCurrent();
    this.setMood('idle');
    this.dampRate = 3.6;
  }

  /**
   * Execute a smooth C¹ Catmull-Rom 3D spline crane track (for PV Mode & cinematic intros).
   */
  public playSplineShot(config: SplineShotConfig): void {
    const posPts =
      config.positions.length >= 2
        ? config.positions
        : [this.currentPos.clone(), config.positions[0] ?? this.basePos.clone()];
    const lookPts =
      config.lookTargets.length >= 2
        ? config.lookTargets
        : [this.currentLook.clone(), config.lookTargets[0] ?? this.baseLook.clone()];

    this.splineShot = {
      posCurve: new THREE.CatmullRomCurve3(posPts, false, 'catmullrom', 0.5),
      lookCurve: new THREE.CatmullRomCurve3(lookPts, false, 'catmullrom', 0.5),
      durationSec: Math.max(0.25, config.durationSec),
      elapsed: 0,
      fovStart: config.fovStart ?? this.baseFov,
      fovEnd: config.fovEnd ?? this.baseFov - 3,
      rollStart: config.rollStart ?? 0,
      rollEnd: config.rollEnd ?? 0,
    };
  }

  public stopSplineShot(): void {
    this.splineShot = null;
  }

  /**
   * Dramatic Cinema Bullet-Time Arc Orbit during Overdrive / Match-Point / High-Streak Hit-Stops!
   */
  public triggerBulletTimeOrbit(durationSec = 0.72, dir: 1 | -1 = 1, spanRad = 1.38): void {
    if (this.style === 'free_orbit' || this.style === 'broadcast') return;
    if (this.liveMagnification > 3.0) return; // Don't spin wildly during close microscope inspection!
    this.bulletOrbitDuration = Math.max(0.25, durationSec);
    this.bulletOrbitRemaining = this.bulletOrbitDuration;
    this.bulletOrbitDir = dir;
    this.bulletOrbitSpanRad = spanRad;
    this.bulletOrbitAngle = 0;
  }

  public setMood(mood: CameraMood, forceOverrideFree = false): void {
    this.mood = mood;
    if (this.style === 'free_orbit' && !forceOverrideFree) {
      return;
    }
    this.heroSweepAngle = 0;

    const isDuel = this.style === 'duel_rail';
    const isMacro = this.style === 'macro_artisan';
    const isBroad = this.style === 'broadcast';
    const pS = this.portraitScale;

    if (mood === 'idle') {
      if (isDuel) {
        this.targetPos.set(0, 0.92, 2.08 * pS);
        this.targetLook.set(0, 0.28, 0.02);
        this.targetFovOffset = -2.0;
      } else if (isMacro) {
        this.targetPos.set(-0.22, 0.72, 1.18 * pS);
        this.targetLook.set(-0.18, 0.29, 0.16);
        this.targetFovOffset = -9.5;
      } else if (isBroad) {
        this.targetPos.set(0, 1.78, 2.52 * pS);
        this.targetLook.set(0, 0.18, -0.06);
        this.targetFovOffset = 3.5;
      } else {
        this.targetPos.set(0, 1.34, 2.24 * pS);
        this.targetLook.set(0, 0.27, -0.02);
        this.targetFovOffset = 0;
      }
      this.targetRoll = 0;
      this.dampRate = 5.4;
    } else if (mood === 'windup') {
      if (isBroad) {
        this.targetPos.set(0, 1.84, 2.6 * pS);
        this.targetLook.set(0, 0.24, -0.04);
        this.targetFovOffset = 4.0;
        this.targetRoll = 0;
      } else if (isDuel) {
        this.targetPos.set(-0.32, 0.88, 2.12 * pS);
        this.targetLook.set(0, 0.36, 0.02);
        this.targetFovOffset = 1.5;
        this.targetRoll = 0.018;
      } else {
        this.targetPos.set(0, 1.48, 2.46 * pS);
        this.targetLook.set(0, 0.36, -0.02);
        this.targetFovOffset = 2.8;
        this.targetRoll = 0.01;
      }
      this.dampRate = 7.5;
    } else if (mood === 'apex') {
      if (isBroad) {
        this.targetPos.set(0, 1.88, 2.62 * pS);
        this.targetLook.set(0, 0.28, -0.04);
        this.targetFovOffset = 4.5;
        this.targetRoll = 0;
      } else {
        this.targetPos.set(0, isDuel ? 0.96 : 1.54, (isDuel ? 2.18 : 2.52) * pS);
        this.targetLook.set(0, 0.41, -0.02);
        this.targetFovOffset = 4.2;
        this.targetRoll = -0.014;
      }
      this.dampRate = 9.0;
    } else if (mood === 'clash') {
      if (isBroad) {
        this.targetPos.set(0, 1.62, 2.3 * pS);
        this.targetLook.set(0, 0.25, 0.0);
        this.targetFovOffset = -1.5;
        this.targetRoll = 0;
      } else if (isMacro) {
        this.targetPos.set(0, 0.72, 1.12 * pS);
        this.targetLook.set(0, 0.31, 0.08);
        this.targetFovOffset = -9.5;
        this.targetRoll = 0.024;
      } else {
        this.targetPos.set(0, isDuel ? 0.78 : 1.06, (isDuel ? 1.72 : 1.82) * pS);
        this.targetLook.set(0, 0.29, 0.04);
        this.targetFovOffset = -5.8;
        this.targetRoll = 0.024;
      }
      this.dampRate = 13.5;
    } else if (mood === 'low_clash') {
      this.targetPos.set(0.18, 0.62, 1.68 * pS);
      this.targetLook.set(0, 0.34, 0.04);
      this.targetFovOffset = -6.8;
      this.targetRoll = -0.032;
      this.dampRate = 14.0;
    } else if (mood === 'ots_player') {
      this.targetPos.set(-1.26, 0.94, 1.54 * pS);
      this.targetLook.set(0.28, 0.3, -0.04);
      this.targetFovOffset = -4.2;
      this.targetRoll = -0.02;
      this.dampRate = 6.8;
    } else if (mood === 'ots_npc') {
      this.targetPos.set(1.26, 0.96, 1.48 * pS);
      this.targetLook.set(-0.28, 0.3, 0.06);
      this.targetFovOffset = -4.2;
      this.targetRoll = 0.022;
      this.dampRate = 6.8;
    } else if (mood === 'macro_hand') {
      this.targetPos.set(-0.28, 0.68, 1.04 * pS);
      this.targetLook.set(-0.22, 0.29, 0.14);
      this.targetFovOffset = -10.5;
      this.targetRoll = -0.015;
      this.dampRate = 4.6;
    } else if (mood === 'spirit_charge') {
      this.targetPos.set(-0.52, 0.98, 1.84 * pS);
      this.targetLook.set(-0.08, 0.31, 0.08);
      this.targetFovOffset = -4.6;
      this.targetRoll = -0.026;
      this.dampRate = 5.8;
    } else if (mood === 'feint_peek') {
      this.targetPos.set(0.32, 1.06, 1.76 * pS);
      this.targetLook.set(0.32, 0.3, 0.04);
      this.targetFovOffset = -5.5;
      this.targetRoll = 0.018;
      this.dampRate = 8.4;
    } else if (mood === 'victory') {
      this.targetPos.set(-0.38, isDuel ? 0.84 : 1.12, 1.9 * pS);
      this.targetLook.set(-0.08, 0.32, 0.04);
      this.targetFovOffset = -3.8;
      this.targetRoll = -0.026;
      this.dampRate = 5.2;
    } else if (mood === 'defeat') {
      this.targetPos.set(0.38, isDuel ? 0.86 : 1.15, 1.92 * pS);
      this.targetLook.set(0.08, 0.32, -0.04);
      this.targetFovOffset = -3.4;
      this.targetRoll = 0.026;
      this.dampRate = 5.2;
    } else if (mood === 'match_victory') {
      this.targetPos.set(-0.48, 1.08, 1.86 * pS);
      this.targetLook.set(-0.06, 0.34, 0.04);
      this.targetFovOffset = -4.8;
      this.targetRoll = -0.03;
      this.dampRate = 3.6;
    } else if (mood === 'match_defeat') {
      this.targetPos.set(0.48, 1.12, 1.9 * pS);
      this.targetLook.set(0.06, 0.34, -0.04);
      this.targetFovOffset = -4.2;
      this.targetRoll = 0.03;
      this.dampRate = 3.6;
    }
  }

  public triggerImpactImpulse(strength = 0.034, dirX = 0, dirY = -0.6): void {
    const macroDamp = Math.min(1.0, Math.exp(this.zoomExp));
    this.recoilSpringX.impulse(dirX * strength * 16.0 * macroDamp);
    this.recoilSpringY.impulse(dirY * strength * 14.0 * macroDamp);
    this.recoilSpringZ.impulse(-strength * 11.0 * macroDamp);
    this.microShake = Math.max(this.microShake, strength * 0.55 * macroDamp);
  }

  public resize(aspect: number): void {
    this.aspect = Math.max(0.4, aspect);
    this.camera.aspect = this.aspect;
    if (this.aspect < 0.72) {
      this.baseFov = 52;
      this.portraitScale = 1.44;
    } else if (this.aspect < 0.98) {
      this.baseFov = 46;
      this.portraitScale = 1.14;
    } else if (this.aspect < 1.35) {
      this.baseFov = 41;
      this.portraitScale = 1.03;
    } else {
      this.baseFov = 38;
      this.portraitScale = 1.0;
    }
    this.camera.fov = this.currentFov || this.baseFov;
    this.camera.updateProjectionMatrix();
    if (!this.splineShot) {
      this.setMood(this.mood);
    }
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;

    // 1. Active Catmull-Rom 3D Spline Cinema Crane Track (PV Mode)
    if (this.splineShot) {
      this.splineShot.elapsed += safeDt;
      const rawU = Math.min(1.0, this.splineShot.elapsed / this.splineShot.durationSec);
      const u = rawU * rawU * rawU * (rawU * (rawU * 6 - 15) + 10);

      this.splineShot.posCurve.getPoint(u, this.tmpSplinePos);
      this.splineShot.lookCurve.getPoint(u, this.tmpSplineLook);

      this.currentPos.copy(this.tmpSplinePos);
      this.currentLook.copy(this.tmpSplineLook);
      this.currentFov = THREE.MathUtils.lerp(this.splineShot.fovStart, this.splineShot.fovEnd, u);
      this.currentRoll = THREE.MathUtils.lerp(this.splineShot.rollStart, this.splineShot.rollEnd, u);

      this.camera.near = 0.04;
      this.camera.far = 64;
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      if (Math.abs(this.currentRoll) > 0.0002) {
        this.camera.rotateZ(this.currentRoll);
      }
      if (rawU >= 1.0) {
        this.targetPos.copy(this.currentPos);
        this.targetLook.copy(this.currentLook);
        this.syncSpringsToCurrent();
        this.splineShot = null;
      }
      return;
    }

    // 2. Camera Director 2.2 — Exact Closed-Form C² AnalyticSpring Steadicam + INFINITE-ZOOM OPTICS!
    this.dampRate = THREE.MathUtils.lerp(this.dampRate, 6.2, 1 - Math.exp(-1.8 * safeDt));
    const omega = Math.max(3.4, this.dampRate * 1.18);
    const kCam = omega * omega;
    const dCam = 2.0 * omega * 0.96;

    this.currentPos.set(
      this.posSpringX.step(this.targetPos.x, kCam, dCam, safeDt),
      this.posSpringY.step(this.targetPos.y, kCam, dCam, safeDt),
      this.posSpringZ.step(this.targetPos.z, kCam, dCam, safeDt)
    );
    this.currentLook.set(
      this.lookSpringX.step(this.targetLook.x, kCam * 1.12, dCam * 1.06, safeDt),
      this.lookSpringY.step(this.targetLook.y, kCam * 1.12, dCam * 1.06, safeDt),
      this.lookSpringZ.step(this.targetLook.z, kCam * 1.12, dCam * 1.06, safeDt)
    );

    const kOrb = 68.0;
    const dOrb = 2.0 * Math.sqrt(kOrb) * 0.99;
    this.orbitAzimuth = this.orbitAzSpring.step(this.targetOrbitAzimuth, kOrb, dOrb, safeDt);
    this.orbitElevation = this.orbitElSpring.step(this.targetOrbitElevation, kOrb, dOrb, safeDt);
    this.zoomExp = this.zoomExpSpring.step(this.targetZoomExp, kOrb * 1.15, dOrb * 1.08, safeDt);
    this.panOffset.set(
      this.panSpringX.step(this.targetPanOffset.x, kOrb, dOrb, safeDt),
      this.panSpringY.step(this.targetPanOffset.y, kOrb, dOrb, safeDt),
      this.panSpringZ.step(this.targetPanOffset.z, kOrb, dOrb, safeDt)
    );

    const desiredBaseFov = THREE.MathUtils.clamp(this.baseFov + this.targetFovOffset, 22, 64);
    this.currentFov = this.fovSpring.step(desiredBaseFov, kCam * 0.9, dCam * 0.96, safeDt);
    this.currentRoll = this.rollSpring.step(this.targetRoll, kCam * 0.85, dCam * 0.95, safeDt);

    const damp = 1 - Math.exp(-this.dampRate * safeDt);
    if (this.mood === 'match_victory' || this.mood === 'match_defeat') {
      this.heroSweepAngle += safeDt * 0.26;
    } else {
      this.heroSweepAngle = THREE.MathUtils.lerp(this.heroSweepAngle, 0, damp);
    }

    if (this.bulletOrbitRemaining > 0) {
      this.bulletOrbitRemaining = Math.max(0, this.bulletOrbitRemaining - safeDt);
      const u = 1 - this.bulletOrbitRemaining / Math.max(0.01, this.bulletOrbitDuration);
      this.bulletOrbitAngle = Math.sin(u * Math.PI) * this.bulletOrbitSpanRad * this.bulletOrbitDir;
    } else {
      this.bulletOrbitAngle = THREE.MathUtils.lerp(this.bulletOrbitAngle, 0, damp);
    }

    const recX = this.recoilSpringX.step(0, 240, 22, safeDt);
    const recY = this.recoilSpringY.step(0, 240, 22, safeDt);
    const recZ = this.recoilSpringZ.step(0, 240, 22, safeDt);

    // ★ INFINITE-ZOOM OPTICS 1.0: C∞ Hyperbolic Physical-Dolly + Optical-Telephoto Handoff! ★
    //   radius = sqrt(effectiveDist² + minWorkDist²)  (never clips into hand geometry!)
    //   tan(fov/2) = tan(baseFov/2) * (effectiveDist / radius)  (seamless 0.2× .. 5000× magnification!)
    this.tmpOffset.copy(this.currentPos).sub(this.currentLook);
    const offLen = Math.max(0.05, this.tmpOffset.length());
    const zoomFactor = Math.exp(this.zoomExp);
    const effectiveDist = offLen * zoomFactor;
    const minWorkDist = 0.014; // 1.4cm safe physical working clearance from surface!
    const radius = Math.sqrt(effectiveDist * effectiveDist + minWorkDist * minWorkDist);
    const opticalScale = Math.min(1.0, effectiveDist / Math.max(1e-6, radius));

    const baseHalfTan = Math.tan(THREE.MathUtils.degToRad(this.currentFov) * 0.5);
    const finalFovDeg = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2.0 * Math.atan(baseHalfTan * opticalScale)),
      0.08,
      78
    );

    // Dynamic Adaptive Near/Far Clipping Planes (zero near-clip at 1.4cm, zero Z-fighting at 18m!)
    const targetNear = THREE.MathUtils.clamp(radius * 0.06, 0.0004, 0.08);
    const targetFar = THREE.MathUtils.clamp(Math.max(48, radius * 24), 48, 260);
    if (
      Math.abs(finalFovDeg - this.camera.fov) > 0.0005 ||
      Math.abs(targetNear - this.camera.near) / Math.max(1e-5, this.camera.near) > 0.03 ||
      Math.abs(targetFar - this.camera.far) > 2.0
    ) {
      this.camera.fov = finalFovDeg;
      this.camera.near = targetNear;
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    this.liveMagnification = Number((1.0 / Math.max(1e-5, zoomFactor)).toFixed(2));
    this.liveWorkingDistM = radius;
    this.liveEffectiveDistMm = Number((effectiveDist * 1000).toFixed(2));
    this.liveFovDeg = Number(finalFovDeg.toFixed(2));

    const basePhi = Math.atan2(this.tmpOffset.x, this.tmpOffset.z);
    const baseTheta = Math.acos(THREE.MathUtils.clamp(this.tmpOffset.y / offLen, -0.99, 0.99));

    // Vibration-isolated optical table damping: breathing & parallax fade smoothly at macro magnification!
    const swayMask = THREE.MathUtils.clamp(zoomFactor * 1.35, 0.0, 1.0);
    const breathX = Math.sin(this.elapsed * 0.68) * 0.014 * swayMask;
    const breathY = Math.cos(this.elapsed * 0.52) * 0.009 * swayMask;
    const heroArc = Math.sin(this.heroSweepAngle) * 0.18 * swayMask;
    const parallaxScale = (this.style === 'broadcast' ? 0.025 : 0.064) * swayMask;

    const finalPhi =
      basePhi + this.orbitAzimuth + this.pointerX * parallaxScale + breathX + heroArc + this.bulletOrbitAngle;
    const finalTheta = THREE.MathUtils.clamp(
      baseTheta - this.orbitElevation - this.pointerY * 0.036 * swayMask + breathY,
      0.06,
      1.54
    );

    this.tmpFinalLook.copy(this.currentLook).add(this.panOffset);
    this.tmpCamPos.set(
      this.tmpFinalLook.x + radius * Math.sin(finalTheta) * Math.sin(finalPhi) + recX,
      this.tmpFinalLook.y + radius * Math.cos(finalTheta) + recY,
      this.tmpFinalLook.z + radius * Math.sin(finalTheta) * Math.cos(finalPhi) + recZ
    );

    if (this.microShake > 0.0003) {
      this.tmpCamPos.x += (Math.random() - 0.5) * this.microShake;
      this.tmpCamPos.y += (Math.random() - 0.5) * this.microShake * 0.85;
      this.microShake *= Math.exp(-18.0 * safeDt);
    } else {
      this.microShake = 0;
    }

    this.camera.position.copy(this.tmpCamPos);
    this.camera.lookAt(this.tmpFinalLook);

    if (Math.abs(this.currentRoll) > 0.0002) {
      this.camera.rotateZ(this.currentRoll * swayMask);
    }
  }
}
