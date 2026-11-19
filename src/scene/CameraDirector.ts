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
  private readonly zoomSpring = new AnalyticSpring(1.0);
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

  // Interactive pointer parallax, drag orbit & pinch/wheel zoom
  private pointerX = 0;
  private pointerY = 0;
  private orbitAzimuth = 0;
  private orbitElevation = 0;
  private targetOrbitAzimuth = 0;
  private targetOrbitElevation = 0;
  private zoomScale = 1.0;
  private targetZoomScale = 1.0;
  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

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

  // Impact micro-shake
  private microShake = 0;

  private elapsed = 0;
  private mood: CameraMood = 'idle';
  private heroSweepAngle = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.08, 48);
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
      this.targetZoomScale = 1.0;
    }
    this.setMood(this.mood);
  }

  public bindCanvasEvents(canvas: HTMLCanvasElement): () => void {
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 1) {
        this.isDragging = true;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
      } else if (this.activePointers.size === 2) {
        this.isDragging = false;
        const pts = [...this.activePointers.values()];
        this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      this.pointerY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;

      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.lastPinchDist > 4) {
          const ratio = this.lastPinchDist / Math.max(4, dist);
          this.targetZoomScale = THREE.MathUtils.clamp(this.targetZoomScale * ratio, 0.56, 1.55);
        }
        this.lastPinchDist = dist;
        return;
      }

      if (this.isDragging) {
        const dx = e.clientX - this.lastDragX;
        const dy = e.clientY - this.lastDragY;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
        const maxAz = this.style === 'free_orbit' ? Math.PI : 0.92;
        this.targetOrbitAzimuth = THREE.MathUtils.clamp(
          this.targetOrbitAzimuth - dx * 0.0046,
          -maxAz,
          maxAz
        );
        this.targetOrbitElevation = THREE.MathUtils.clamp(
          this.targetOrbitElevation + dy * 0.0034,
          -0.28,
          0.52
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
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const delta = Math.sign(e.deltaY) * 0.055;
      this.targetZoomScale = THREE.MathUtils.clamp(this.targetZoomScale + delta, 0.58, 1.5);
    };

    const onDblClick = () => {
      this.targetOrbitAzimuth = 0;
      this.targetOrbitElevation = 0;
      this.targetZoomScale = 1.0;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('dblclick', onDblClick);

    return () => {
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
    this.zoomSpring.snap(this.zoomScale);
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
    this.zoomScale = 1.0;
    this.targetOrbitAzimuth = 0;
    this.targetOrbitElevation = 0;
    this.targetZoomScale = 1.0;
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
    this.bulletOrbitDuration = Math.max(0.25, durationSec);
    this.bulletOrbitRemaining = this.bulletOrbitDuration;
    this.bulletOrbitDir = dir;
    this.bulletOrbitSpanRad = spanRad;
    this.bulletOrbitAngle = 0;
  }

  public setMood(mood: CameraMood, forceOverrideFree = false): void {
    this.mood = mood;
    if (this.style === 'free_orbit' && !forceOverrideFree) {
      // Preserve user's custom orbit angle in Free Orbit inspection mode!
      return;
    }
    this.heroSweepAngle = 0;

    // Style-adaptive baseline offsets
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
        this.targetPos.set(-0.22, 0.88, 1.54 * pS);
        this.targetLook.set(-0.14, 0.29, 0.14);
        this.targetFovOffset = -7.5;
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
        this.targetPos.set(0, 0.86, 1.46 * pS);
        this.targetLook.set(0, 0.31, 0.08);
        this.targetFovOffset = -8.2;
        this.targetRoll = 0.028;
      } else {
        this.targetPos.set(0, isDuel ? 0.78 : 1.06, (isDuel ? 1.72 : 1.82) * pS);
        this.targetLook.set(0, 0.29, 0.04);
        this.targetFovOffset = -5.8;
        this.targetRoll = 0.024;
      }
      this.dampRate = 13.5;
    } else if (mood === 'low_clash') {
      // Dramatic low Samurai tabletop angle looking slightly up through the colliding hands!
      this.targetPos.set(0.18, 0.62, 1.68 * pS);
      this.targetLook.set(0, 0.34, 0.04);
      this.targetFovOffset = -6.8;
      this.targetRoll = -0.032;
      this.dampRate = 14.0;
    } else if (mood === 'ots_player') {
      // Over-the-shoulder right behind the Player's sculpted craft hand staring down JNV1.0!
      this.targetPos.set(-1.26, 0.94, 1.54 * pS);
      this.targetLook.set(0.28, 0.3, -0.04);
      this.targetFovOffset = -4.2;
      this.targetRoll = -0.02;
      this.dampRate = 6.8;
    } else if (mood === 'ots_npc') {
      // Dramatic counter over-the-shoulder behind JNV1.0!
      this.targetPos.set(1.26, 0.96, 1.48 * pS);
      this.targetLook.set(-0.28, 0.3, 0.06);
      this.targetFovOffset = -4.2;
      this.targetRoll = 0.022;
      this.dampRate = 6.8;
    } else if (mood === 'macro_hand') {
      // Intimate 85mm craft macro inspecting joints, dorsal tendons, and lacquer grain
      this.targetPos.set(-0.28, 0.78, 1.26 * pS);
      this.targetLook.set(-0.22, 0.29, 0.14);
      this.targetFovOffset = -9.5;
      this.targetRoll = -0.015;
      this.dampRate = 4.6;
    } else if (mood === 'spirit_charge') {
      // Coiled low-tension push-in while Spirit Overdrive (極一撃) is armed!
      this.targetPos.set(-0.52, 0.98, 1.84 * pS);
      this.targetLook.set(-0.08, 0.31, 0.08);
      this.targetFovOffset = -4.6;
      this.targetRoll = -0.026;
      this.dampRate = 5.8;
    } else if (mood === 'feint_peek') {
      // Quick tactical lean-in inspecting JNV1.0's hand for a subtle tell!
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

  /**
   * Directional spring-damped physical shockwave kick aligned with clash momentum!
   */
  public triggerImpactImpulse(strength = 0.034, dirX = 0, dirY = -0.6): void {
    this.recoilSpringX.impulse(dirX * strength * 16.0);
    this.recoilSpringY.impulse(dirY * strength * 14.0);
    this.recoilSpringZ.impulse(-strength * 11.0);
    this.microShake = Math.max(this.microShake, strength * 0.55);
  }

  public resize(aspect: number): void {
    this.aspect = Math.max(0.4, aspect);
    this.camera.aspect = this.aspect;
    // Responsive framing: portrait smartphones pull back & open FOV so BOTH hands & kimono sleeves frame cleanly!
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
      // Quintic smoothstep easing for silky museum crane motion
      const u = rawU * rawU * rawU * (rawU * (rawU * 6 - 15) + 10);

      this.splineShot.posCurve.getPoint(u, this.tmpSplinePos);
      this.splineShot.lookCurve.getPoint(u, this.tmpSplineLook);

      this.currentPos.copy(this.tmpSplinePos);
      this.currentLook.copy(this.tmpSplineLook);
      this.currentFov = THREE.MathUtils.lerp(this.splineShot.fovStart, this.splineShot.fovEnd, u);
      this.currentRoll = THREE.MathUtils.lerp(this.splineShot.rollStart, this.splineShot.rollEnd, u);

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

    // 2. Camera Director 2.1 — Exact Closed-Form C² AnalyticSpring Steadicam Tracking!
    this.dampRate = THREE.MathUtils.lerp(this.dampRate, 6.2, 1 - Math.exp(-1.8 * safeDt));
    const omega = Math.max(3.4, this.dampRate * 1.18);
    const kCam = omega * omega;
    // Slightly under-critical zeta=0.96 gives buttery Steadicam momentum with zero wobble!
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

    const kOrb = 58.0;
    const dOrb = 2.0 * Math.sqrt(kOrb) * 0.98;
    this.orbitAzimuth = this.orbitAzSpring.step(this.targetOrbitAzimuth, kOrb, dOrb, safeDt);
    this.orbitElevation = this.orbitElSpring.step(this.targetOrbitElevation, kOrb, dOrb, safeDt);
    this.zoomScale = this.zoomSpring.step(this.targetZoomScale, kOrb, dOrb, safeDt);

    const desiredFov = THREE.MathUtils.clamp(this.baseFov + this.targetFovOffset, 24, 64);
    const nextFov = this.fovSpring.step(desiredFov, kCam * 0.9, dCam * 0.96, safeDt);
    if (Math.abs(nextFov - this.camera.fov) > 0.005) {
      this.currentFov = nextFov;
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.currentRoll = this.rollSpring.step(this.targetRoll, kCam * 0.85, dCam * 0.95, safeDt);

    const damp = 1 - Math.exp(-this.dampRate * safeDt);
    // Subtle heroic continuous arc on match victory/defeat
    if (this.mood === 'match_victory' || this.mood === 'match_defeat') {
      this.heroSweepAngle += safeDt * 0.26;
    } else {
      this.heroSweepAngle = THREE.MathUtils.lerp(this.heroSweepAngle, 0, damp);
    }

    // Bullet-Time 180° Arc Orbit envelope!
    if (this.bulletOrbitRemaining > 0) {
      this.bulletOrbitRemaining = Math.max(0, this.bulletOrbitRemaining - safeDt);
      const u = 1 - this.bulletOrbitRemaining / Math.max(0.01, this.bulletOrbitDuration);
      const arcBell = Math.sin(u * Math.PI);
      this.bulletOrbitAngle = arcBell * this.bulletOrbitSpanRad * this.bulletOrbitDir;
    } else {
      this.bulletOrbitAngle = THREE.MathUtils.lerp(this.bulletOrbitAngle, 0, damp);
    }

    // Step directional impact springs (closed-form framerate-invariant!)
    const recX = this.recoilSpringX.step(0, 240, 22, safeDt);
    const recY = this.recoilSpringY.step(0, 240, 22, safeDt);
    const recZ = this.recoilSpringZ.step(0, 240, 22, safeDt);

    // Organic prime-lens breathing + pointer parallax + orbit + bullet-time arc (zero per-frame alloc!)
    this.tmpOffset.copy(this.currentPos).sub(this.currentLook);
    const offLen = Math.max(0.01, this.tmpOffset.length());
    const radius = Math.max(0.85, offLen * this.zoomScale);
    const basePhi = Math.atan2(this.tmpOffset.x, this.tmpOffset.z);
    const baseTheta = Math.acos(THREE.MathUtils.clamp(this.tmpOffset.y / offLen, -0.99, 0.99));

    const breathX = Math.sin(this.elapsed * 0.68) * 0.014;
    const breathY = Math.cos(this.elapsed * 0.52) * 0.009;
    const heroArc = Math.sin(this.heroSweepAngle) * 0.18;
    const parallaxScale = this.style === 'broadcast' ? 0.025 : 0.064;

    const finalPhi =
      basePhi + this.orbitAzimuth + this.pointerX * parallaxScale + breathX + heroArc + this.bulletOrbitAngle;
    const finalTheta = THREE.MathUtils.clamp(
      baseTheta - this.orbitElevation - this.pointerY * 0.036 + breathY,
      0.34,
      1.38
    );

    this.tmpCamPos.set(
      this.currentLook.x + radius * Math.sin(finalTheta) * Math.sin(finalPhi) + recX,
      this.currentLook.y + radius * Math.cos(finalTheta) + recY,
      this.currentLook.z + radius * Math.sin(finalTheta) * Math.cos(finalPhi) + recZ
    );

    if (this.microShake > 0.0003) {
      this.tmpCamPos.x += (Math.random() - 0.5) * this.microShake;
      this.tmpCamPos.y += (Math.random() - 0.5) * this.microShake * 0.85;
      this.microShake *= Math.exp(-18.0 * safeDt);
    } else {
      this.microShake = 0;
    }

    this.camera.position.copy(this.tmpCamPos);
    this.camera.lookAt(this.currentLook);

    if (Math.abs(this.currentRoll) > 0.0002) {
      this.camera.rotateZ(this.currentRoll);
    }
  }
}
