/**
 * ★ AAA Cinema Camera Director for JANKEN · 極 ★
 *
 * Combines 50mm prime-lens architectural framing with:
 *  - Dynamic Spring-Damped FOV Dolly-Zoom (wide anticipation → tight 32° clash punch-in!)
 *  - Subtle Cinema Dutch-Roll Tilt (`±2°`) on clash impact & hero victory framing
 *  - Directional Multi-Axis Spring Impact Recoil aligned with strike vector
 *  - Silky Architectural Crane-In Reveal on initial entry & stage switching
 *  - Interactive Drag-to-Inspect Orbit + Pointer Parallax + Double-Click Reset
 */

import * as THREE from 'three';

export type CameraMood =
  | 'idle'
  | 'windup'
  | 'apex'
  | 'clash'
  | 'victory'
  | 'defeat'
  | 'match_victory'
  | 'match_defeat';

export class CameraDirector {
  public readonly camera: THREE.PerspectiveCamera;

  private readonly basePos = new THREE.Vector3(0, 1.36, 2.24);
  private readonly baseLook = new THREE.Vector3(0, 0.27, -0.02);

  private targetPos = new THREE.Vector3().copy(this.basePos);
  private targetLook = new THREE.Vector3().copy(this.baseLook);
  private currentPos = new THREE.Vector3().copy(this.basePos);
  private currentLook = new THREE.Vector3().copy(this.baseLook);

  // Dynamic focal-length & Dutch-roll cinema springs
  private baseFov = 38;
  private currentFov = 38;
  private targetFovOffset = 0;
  private currentRoll = 0;
  private targetRoll = 0;
  private dampRate = 6.2;

  // Interactive pointer parallax & drag-to-inspect orbit
  private pointerX = 0;
  private pointerY = 0;
  private orbitAzimuth = 0;
  private orbitElevation = 0;
  private targetOrbitAzimuth = 0;
  private targetOrbitElevation = 0;
  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Spring-damped directional impact impulse (replaces noisy random jitter)
  private recoilOffset = new THREE.Vector3();
  private recoilVel = new THREE.Vector3();
  private microShake = 0;

  private elapsed = 0;
  private mood: CameraMood = 'idle';
  private heroSweepAngle = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.08, 45);
    this.resize(aspect);
    this.triggerStageReveal();
  }

  public bindCanvasEvents(canvas: HTMLCanvasElement): () => void {
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      this.pointerY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;

      if (this.isDragging) {
        const dx = e.clientX - this.lastDragX;
        const dy = e.clientY - this.lastDragY;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
        this.targetOrbitAzimuth = THREE.MathUtils.clamp(
          this.targetOrbitAzimuth - dx * 0.0042,
          -0.72,
          0.72
        );
        this.targetOrbitElevation = THREE.MathUtils.clamp(
          this.targetOrbitElevation + dy * 0.0032,
          -0.22,
          0.44
        );
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    const onDblClick = () => {
      this.targetOrbitAzimuth = 0;
      this.targetOrbitElevation = 0;
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('dblclick', onDblClick);

    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }

  /**
   * Architectural crane-in reveal whenever entering a new stage or launching the app!
   */
  public triggerStageReveal(): void {
    this.currentPos.set(-0.42, 2.02, 3.05);
    this.currentLook.set(0.0, 0.42, -0.35);
    this.currentFov = this.baseFov + 6.5;
    this.currentRoll = -0.024;
    this.targetOrbitAzimuth = 0;
    this.targetOrbitElevation = 0;
    this.setMood('idle');
    this.dampRate = 3.2; // Graceful silky architectural glide
  }

  public setMood(mood: CameraMood): void {
    this.mood = mood;
    this.heroSweepAngle = 0;

    if (mood === 'idle') {
      this.targetPos.set(0, 1.36, 2.24);
      this.targetLook.set(0, 0.27, -0.02);
      this.targetFovOffset = 0;
      this.targetRoll = 0;
      this.dampRate = 5.4;
    } else if (mood === 'windup') {
      // Subtle wide tension pullback as both hands pump upward
      this.targetPos.set(0, 1.48, 2.46);
      this.targetLook.set(0, 0.36, -0.02);
      this.targetFovOffset = 2.8;
      this.targetRoll = 0.01;
      this.dampRate = 7.5;
    } else if (mood === 'apex') {
      // Coiled breath-hold high tension right before release
      this.targetPos.set(0, 1.54, 2.52);
      this.targetLook.set(0, 0.41, -0.02);
      this.targetFovOffset = 4.2;
      this.targetRoll = -0.012;
      this.dampRate = 9.0;
    } else if (mood === 'clash') {
      // Explosive tight 50mm→65mm dolly-zoom punch right over the central brass medallion!
      this.targetPos.set(0, 1.08, 1.82);
      this.targetLook.set(0, 0.29, 0.04);
      this.targetFovOffset = -5.8;
      this.targetRoll = 0.024;
      this.dampRate = 13.5;
    } else if (mood === 'victory') {
      // Hero low-angle framing honoring the player's winning hand
      this.targetPos.set(-0.34, 1.15, 1.92);
      this.targetLook.set(-0.08, 0.32, 0.04);
      this.targetFovOffset = -3.4;
      this.targetRoll = -0.026;
      this.dampRate = 5.2;
    } else if (mood === 'defeat') {
      // Dramatic counter-angle highlighting JNV1.0's winning strike
      this.targetPos.set(0.36, 1.17, 1.95);
      this.targetLook.set(0.08, 0.32, -0.04);
      this.targetFovOffset = -3.0;
      this.targetRoll = 0.026;
      this.dampRate = 5.2;
    } else if (mood === 'match_victory') {
      this.targetPos.set(-0.46, 1.12, 1.88);
      this.targetLook.set(-0.06, 0.34, 0.04);
      this.targetFovOffset = -4.5;
      this.targetRoll = -0.03;
      this.dampRate = 3.6;
    } else if (mood === 'match_defeat') {
      this.targetPos.set(0.46, 1.15, 1.92);
      this.targetLook.set(0.06, 0.34, -0.04);
      this.targetFovOffset = -4.0;
      this.targetRoll = 0.03;
      this.dampRate = 3.6;
    }
  }

  /**
   * Directional spring-damped physical shockwave kick aligned with clash momentum!
   */
  public triggerImpactImpulse(strength = 0.034, dirX = 0, dirY = -0.6): void {
    this.recoilVel.x += dirX * strength * 16.0;
    this.recoilVel.y += dirY * strength * 14.0;
    this.recoilVel.z -= strength * 11.0;
    this.microShake = Math.max(this.microShake, strength * 0.55);
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.baseFov = aspect < 1.15 ? 46 : aspect < 1.4 ? 41 : 38;
    this.camera.fov = this.currentFov || this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;

    // Gradually relax architectural reveal dampRate back to normal
    this.dampRate = THREE.MathUtils.lerp(this.dampRate, 6.2, 1 - Math.exp(-1.5 * safeDt));
    const damp = 1 - Math.exp(-this.dampRate * safeDt);

    this.currentPos.lerp(this.targetPos, damp);
    this.currentLook.lerp(this.targetLook, damp);
    this.orbitAzimuth = THREE.MathUtils.lerp(this.orbitAzimuth, this.targetOrbitAzimuth, damp);
    this.orbitElevation = THREE.MathUtils.lerp(this.orbitElevation, this.targetOrbitElevation, damp);

    const desiredFov = this.baseFov + this.targetFovOffset;
    if (Math.abs(this.currentFov - desiredFov) > 0.01) {
      this.currentFov = THREE.MathUtils.lerp(this.currentFov, desiredFov, damp);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.targetRoll, damp);

    // Subtle heroic continuous arc on match victory/defeat
    if (this.mood === 'match_victory' || this.mood === 'match_defeat') {
      this.heroSweepAngle += safeDt * 0.24;
    } else {
      this.heroSweepAngle = THREE.MathUtils.lerp(this.heroSweepAngle, 0, damp);
    }

    // Step directional impact spring
    const kR = 240;
    const dR = 20;
    const ax = -this.recoilOffset.x * kR - this.recoilVel.x * dR;
    const ay = -this.recoilOffset.y * kR - this.recoilVel.y * dR;
    const az = -this.recoilOffset.z * kR - this.recoilVel.z * dR;
    this.recoilVel.x += ax * safeDt;
    this.recoilVel.y += ay * safeDt;
    this.recoilVel.z += az * safeDt;
    this.recoilOffset.addScaledVector(this.recoilVel, safeDt);

    // Organic prime-lens breathing + pointer parallax + drag orbit around table center
    const offset = this.currentPos.clone().sub(this.currentLook);
    const radius = offset.length();
    const basePhi = Math.atan2(offset.x, offset.z);
    const baseTheta = Math.acos(THREE.MathUtils.clamp(offset.y / radius, -0.99, 0.99));

    const breathX = Math.sin(this.elapsed * 0.68) * 0.014;
    const breathY = Math.cos(this.elapsed * 0.52) * 0.009;
    const heroArc = Math.sin(this.heroSweepAngle) * 0.16;

    const finalPhi = basePhi + this.orbitAzimuth + this.pointerX * 0.068 + breathX + heroArc;
    const finalTheta = THREE.MathUtils.clamp(
      baseTheta - this.orbitElevation - this.pointerY * 0.04 + breathY,
      0.4,
      1.32
    );

    const camPos = new THREE.Vector3(
      this.currentLook.x + radius * Math.sin(finalTheta) * Math.sin(finalPhi),
      this.currentLook.y + radius * Math.cos(finalTheta),
      this.currentLook.z + radius * Math.sin(finalTheta) * Math.cos(finalPhi)
    );

    camPos.add(this.recoilOffset);

    if (this.microShake > 0.0003) {
      camPos.x += (Math.random() - 0.5) * this.microShake;
      camPos.y += (Math.random() - 0.5) * this.microShake * 0.85;
      this.microShake *= Math.exp(-18.0 * safeDt);
    } else {
      this.microShake = 0;
    }

    this.camera.position.copy(camPos);
    this.camera.lookAt(this.currentLook);

    // Apply subtle cinema Dutch-roll tilt around view axis
    if (Math.abs(this.currentRoll) > 0.0002) {
      this.camera.rotateZ(this.currentRoll);
    }
  }
}
