/**
 * Cinematic Damped Camera Director for JANKEN KIWAMI 3D.
 * Combines refined 50mm prime-lens architectural framing, gentle pointer parallax,
 * interactive drag-to-inspect orbit, rhythmic Jan-Ken-Pon anticipation zoom, and
 * physical impact micro-impulse on clash!
 */

import * as THREE from 'three';

export type CameraMood = 'idle' | 'windup' | 'clash' | 'victory' | 'defeat';

export class CameraDirector {
  public readonly camera: THREE.PerspectiveCamera;

  private readonly basePos = new THREE.Vector3(0, 1.38, 2.26);
  private readonly baseLook = new THREE.Vector3(0, 0.28, -0.02);

  private targetPos = new THREE.Vector3().copy(this.basePos);
  private targetLook = new THREE.Vector3().copy(this.baseLook);
  private currentPos = new THREE.Vector3().copy(this.basePos);
  private currentLook = new THREE.Vector3().copy(this.baseLook);

  // Subtle interactive pointer parallax & drag-to-inspect azimuth/elevation
  private pointerX = 0;
  private pointerY = 0;
  private orbitAzimuth = 0;
  private orbitElevation = 0;
  private targetOrbitAzimuth = 0;
  private targetOrbitElevation = 0;
  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;

  private shakeMagnitude = 0;
  private elapsed = 0;
  private mood: CameraMood = 'idle';

  constructor(aspect: number) {
    // 38 deg FOV approximates a cinema 50mm prime lens (zero fish-eye distortion on hands!)
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.08, 45);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.baseLook);
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
          -0.68,
          0.68
        );
        this.targetOrbitElevation = THREE.MathUtils.clamp(
          this.targetOrbitElevation + dy * 0.0032,
          -0.22,
          0.42
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

  public setMood(mood: CameraMood): void {
    this.mood = mood;
    if (mood === 'idle') {
      this.targetPos.set(0, 1.38, 2.26);
      this.targetLook.set(0, 0.28, -0.02);
    } else if (mood === 'windup') {
      this.targetPos.set(0, 1.46, 2.42);
      this.targetLook.set(0, 0.34, -0.02);
    } else if (mood === 'clash') {
      this.targetPos.set(0, 1.18, 1.94);
      this.targetLook.set(0, 0.3, 0.02);
    } else if (mood === 'victory') {
      this.targetPos.set(-0.26, 1.24, 2.02);
      this.targetLook.set(-0.08, 0.32, 0.04);
    } else if (mood === 'defeat') {
      this.targetPos.set(0.28, 1.26, 2.05);
      this.targetLook.set(0.08, 0.32, -0.04);
    }
  }

  public triggerImpactImpulse(strength = 0.028): void {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, strength);
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    // Gently widen FOV on narrow portrait/split screens so both hands stay gracefully framed
    this.camera.fov = aspect < 1.15 ? 46 : aspect < 1.4 ? 41 : 38;
    this.camera.updateProjectionMatrix();
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;

    const damp = 1 - Math.exp(-5.8 * safeDt);
    this.currentPos.lerp(this.targetPos, damp);
    this.currentLook.lerp(this.targetLook, damp);
    this.orbitAzimuth = THREE.MathUtils.lerp(this.orbitAzimuth, this.targetOrbitAzimuth, damp);
    this.orbitElevation = THREE.MathUtils.lerp(this.orbitElevation, this.targetOrbitElevation, damp);

    // Apply subtle organic prime-lens breathing + pointer parallax + drag orbit around table center
    const offset = this.currentPos.clone().sub(this.currentLook);
    const radius = offset.length();
    const basePhi = Math.atan2(offset.x, offset.z);
    const baseTheta = Math.acos(THREE.MathUtils.clamp(offset.y / radius, -0.99, 0.99));

    const breathX = Math.sin(this.elapsed * 0.7) * 0.012;
    const breathY = Math.cos(this.elapsed * 0.55) * 0.008;

    const finalPhi = basePhi + this.orbitAzimuth + this.pointerX * 0.065 + breathX;
    const finalTheta = THREE.MathUtils.clamp(
      baseTheta - this.orbitElevation - this.pointerY * 0.038 + breathY,
      0.42,
      1.32
    );

    const camPos = new THREE.Vector3(
      this.currentLook.x + radius * Math.sin(finalTheta) * Math.sin(finalPhi),
      this.currentLook.y + radius * Math.cos(finalTheta),
      this.currentLook.z + radius * Math.sin(finalTheta) * Math.cos(finalPhi)
    );

    if (this.shakeMagnitude > 0.0004) {
      camPos.x += (Math.random() - 0.5) * this.shakeMagnitude;
      camPos.y += (Math.random() - 0.5) * this.shakeMagnitude * 0.85;
      this.shakeMagnitude *= Math.exp(-16.0 * safeDt);
    } else {
      this.shakeMagnitude = 0;
    }

    this.camera.position.copy(camPos);
    this.camera.lookAt(this.currentLook);
    void this.mood;
  }
}
