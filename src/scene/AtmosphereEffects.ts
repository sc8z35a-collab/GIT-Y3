/**
 * Natural Physical Atmosphere & Impact Particle Effects (STRICTLY ZERO NEON).
 *
 * - Sunlit architectural dust motes drifting lazily through warm window shafts
 * - Stage-matched organic ambiance (soft sakura petals in Zashiki/Shrine, gentle warm
 *   onsen steam wisps in Onsen, warm dust in Salon/Atelier)
 * - Tactile physical clash burst particles (wood dust / gold-leaf flecks / ivory powder)
 *   subject to gravity and air drag when Rock, Scissors, and Paper collide!
 */

import * as THREE from 'three';
import { StageId } from '../graphics/GraphicsConfig';

interface BurstParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
}

export class AtmosphereEffects {
  public readonly group = new THREE.Group();

  // Ambient sunlit dust motes
  private readonly moteCount = 140;
  private readonly motePositions: Float32Array;
  private readonly motePhases: Float32Array;
  private readonly moteGeo: THREE.BufferGeometry;
  private readonly moteMat: THREE.PointsMaterial;
  private readonly motePoints: THREE.Points;

  // Physical clash burst flakes (gold leaf / sakura petals / fine stone dust via InstancedMesh)
  private readonly burstMax = 56;
  private readonly burstMesh: THREE.InstancedMesh;
  private readonly burstMat: THREE.MeshStandardMaterial;
  private readonly bursts: BurstParticle[] = [];
  private readonly dummy = new THREE.Object3D();

  private elapsed = 0;

  constructor() {
    // 1. Soft sunlit circular dust mote texture (warm natural off-white, NO glow)
    const moteTex = this.createSoftMoteTexture();
    this.motePositions = new Float32Array(this.moteCount * 3);
    this.motePhases = new Float32Array(this.moteCount);

    for (let i = 0; i < this.moteCount; i++) {
      this.motePositions[i * 3] = (Math.random() - 0.5) * 5.2;
      this.motePositions[i * 3 + 1] = 0.15 + Math.random() * 2.5;
      this.motePositions[i * 3 + 2] = (Math.random() - 0.5) * 4.4;
      this.motePhases[i] = Math.random() * Math.PI * 2;
    }

    this.moteGeo = new THREE.BufferGeometry();
    this.moteGeo.setAttribute('position', new THREE.BufferAttribute(this.motePositions, 3));

    this.moteMat = new THREE.PointsMaterial({
      map: moteTex,
      color: new THREE.Color(0xfff1d8),
      size: 0.042,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.motePoints = new THREE.Points(this.moteGeo, this.moteMat);
    this.group.add(this.motePoints);

    // 2. Physical gold-leaf / wooden flake / petal burst instances
    const flakeGeo = new THREE.PlaneGeometry(0.036, 0.024);
    this.burstMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd7b676),
      roughness: 0.34,
      metalness: 0.65,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    this.burstMesh = new THREE.InstancedMesh(flakeGeo, this.burstMat, this.burstMax);
    this.burstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.burstMesh.frustumCulled = false;

    for (let i = 0; i < this.burstMax; i++) {
      this.bursts.push({
        pos: new THREE.Vector3(0, -10, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: 0,
        life: 0,
        maxLife: 1,
      });
      this.dummy.position.set(0, -10, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.burstMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.burstMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.burstMesh);
  }

  private createSoftMoteTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 250, 240, 0.95)');
    grad.addColorStop(0.35, 'rgba(255, 244, 224, 0.45)');
    grad.addColorStop(1, 'rgba(255, 244, 224, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public setStageMood(stage: StageId): void {
    if (stage === 'onsen') {
      this.moteMat.color.setHex(0xeef5f4);
      this.moteMat.size = 0.14;
      this.moteMat.opacity = 0.22;
    } else if (stage === 'shrine') {
      this.moteMat.color.setHex(0xfce3e6);
      this.moteMat.size = 0.055;
      this.moteMat.opacity = 0.46;
    } else if (stage === 'salon') {
      this.moteMat.color.setHex(0xf7e7c8);
      this.moteMat.size = 0.036;
      this.moteMat.opacity = 0.3;
    } else if (stage === 'atelier') {
      this.moteMat.color.setHex(0xf2d9b8);
      this.moteMat.size = 0.04;
      this.moteMat.opacity = 0.34;
    } else {
      // zashiki
      this.moteMat.color.setHex(0xfff1d6);
      this.moteMat.size = 0.042;
      this.moteMat.opacity = 0.38;
    }
  }

  /**
   * Emit tactile non-neon clash flecks (gold leaf on WIN, crimson/bronze on LOSS, warm ivory on DRAW).
   */
  public emitClashBurst(outcome: 'WIN' | 'LOSS' | 'DRAW', origin = new THREE.Vector3(0, 0.36, 0.04)): void {
    if (outcome === 'WIN') {
      this.burstMat.color.setHex(0xdcb86a); // Warm hammered gold leaf
      this.burstMat.metalness = 0.78;
      this.burstMat.roughness = 0.26;
    } else if (outcome === 'LOSS') {
      this.burstMat.color.setHex(0xa85745); // Aged lacquer vermilion-bronze
      this.burstMat.metalness = 0.45;
      this.burstMat.roughness = 0.42;
    } else {
      this.burstMat.color.setHex(0xe8dfd0); // Natural parchment/chalk dust
      this.burstMat.metalness = 0.08;
      this.burstMat.roughness = 0.68;
    }

    const count = outcome === 'DRAW' ? 28 : 48;
    for (let i = 0; i < count; i++) {
      const p = this.bursts[i];
      const theta = Math.random() * Math.PI * 2;
      const speed = 0.45 + Math.random() * 1.15;
      p.pos.copy(origin).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.14,
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.14
        )
      );
      p.vel.set(
        Math.cos(theta) * speed,
        0.55 + Math.random() * 0.95,
        Math.sin(theta) * speed * 0.75
      );
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9
      );
      p.scale = 0.6 + Math.random() * 1.0;
      p.maxLife = 0.85 + Math.random() * 0.65;
      p.life = p.maxLife;
    }
  }

  public update(dt: number, stage: StageId): void {
    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;

    // Update drifting dust motes / rising onsen mist / falling shrine petals
    const posAttr = this.moteGeo.getAttribute('position') as THREE.BufferAttribute;
    const isOnsen = stage === 'onsen';
    const isShrine = stage === 'shrine';

    for (let i = 0; i < this.moteCount; i++) {
      const phase = this.motePhases[i];
      let x = this.motePositions[i * 3];
      let y = this.motePositions[i * 3 + 1];
      let z = this.motePositions[i * 3 + 2];

      x += Math.sin(this.elapsed * 0.45 + phase) * 0.045 * safeDt;
      z += Math.cos(this.elapsed * 0.35 + phase * 1.3) * 0.035 * safeDt;

      if (isOnsen) {
        y += (0.12 + (phase % 0.08)) * safeDt;
        if (y > 2.6) y = 0.12;
      } else if (isShrine) {
        y -= (0.14 + (phase % 0.07)) * safeDt;
        x += 0.08 * safeDt;
        if (y < 0.05) {
          y = 2.65;
          x = (Math.random() - 0.5) * 5.2;
        }
      } else {
        y += Math.sin(this.elapsed * 0.6 + phase) * 0.025 * safeDt;
      }

      this.motePositions[i * 3] = x;
      this.motePositions[i * 3 + 1] = y;
      this.motePositions[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;

    // Update clash burst physical flecks
    let anyActive = false;
    for (let i = 0; i < this.burstMax; i++) {
      const p = this.bursts[i];
      if (p.life > 0) {
        anyActive = true;
        p.life -= safeDt;
        p.vel.y -= 2.35 * safeDt; // Physical gravity
        p.vel.multiplyScalar(1 - 1.9 * safeDt); // Air flutter drag
        p.pos.addScaledVector(p.vel, safeDt);
        // Gently settle on tabletop surface
        if (p.pos.y < 0.014) {
          p.pos.y = 0.014;
          p.vel.set(0, 0, 0);
          p.rot.x = Math.PI * 0.5;
        } else {
          p.rot.x += p.rotVel.x * safeDt;
          p.rot.y += p.rotVel.y * safeDt;
          p.rot.z += p.rotVel.z * safeDt;
        }
        const fade = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.35)));
        this.dummy.position.copy(p.pos);
        this.dummy.rotation.copy(p.rot);
        this.dummy.scale.setScalar(p.scale * fade);
        this.dummy.updateMatrix();
        this.burstMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    if (anyActive) {
      this.burstMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.moteGeo.dispose();
    this.moteMat.map?.dispose();
    this.moteMat.dispose();
    this.burstMesh.geometry.dispose();
    this.burstMat.dispose();
  }
}
