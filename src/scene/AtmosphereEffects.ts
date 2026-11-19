/**
 * ★ AAA Physical Atmosphere, Move-Signature VFX & Non-Neon Shockwave Engine ★
 *
 * STRICTLY ZERO NEON — pure sunlit architectural photography & fine physical materials:
 *  1. Sunlit dust motes / falling shrine sakura petals / rising onsen thermal mist
 *  2. Physical Tabletop Air-Pressure & Fine Gold-Dust Shockwave Ring (custom GLSL shader
 *     resting seamlessly over the central brass inlay ring on PON!! clash impact)
 *  3. 120-Instance Aerodynamic Fluttering Physical Flake Pool with gravity, leaf-flutter
 *     oscillation, tabletop bounce (`e = 0.34`), and Move-Specific Signatures:
 *       · ROCK Win     → Heavy radial timber/gold-dust ground shock plume
 *       · SCISSORS Win → Twin high-velocity crescent blade-shear arcs cutting across center
 *       · PAPER Win    → Majestic ascending spiral vortex of sunlit gold-leaf & petals
 *       · DRAW         → Mirrored colliding parchment/chalk dust burst
 *  4. Ceremonial Match-Victory Gold-Leaf Shower (金箔吹雪) drifting through sunlight shafts!
 */

import * as THREE from 'three';
import { Move, PAPER, ROCK, SCISSORS } from '../engine/jnv1/types';
import { StageId } from '../graphics/GraphicsConfig';

interface BurstParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  flutterPhase: number;
  flutterAmp: number;
  scale: number;
  life: number;
  maxLife: number;
  swirlStrength: number;
  bounced: boolean;
}

const SHOCKWAVE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHOCKWAVE_FRAG = /* glsl */ `
precision highp float;
uniform float uProgress;
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;

void main() {
  if (uProgress <= 0.001 || uProgress >= 0.999) discard;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // Dual concentric physical air/dust wave fronts expanding outward
  float front1 = mix(0.16, 0.96, pow(uProgress, 0.52));
  float width1 = mix(0.095, 0.036, uProgress);
  float ring1 = exp(-pow((r - front1) / width1, 2.0));

  float front2 = mix(0.07, 0.74, pow(uProgress, 0.68));
  float width2 = mix(0.065, 0.028, uProgress);
  float ring2 = exp(-pow((r - front2) / width2, 2.0)) * 0.58;

  // Fine radial grain texture simulating displaced sunlit dust/gold powder (zero neon smoothness)
  float angle = atan(p.y, p.x);
  float grain = 0.76 + 0.24 * sin(angle * 30.0 + uProgress * 7.0) * cos(r * 44.0);

  float fade = pow(1.0 - uProgress, 0.85) * smoothstep(0.0, 0.022, uProgress);
  float alpha = clamp((ring1 + ring2) * grain * fade * uStrength, 0.0, 0.86);
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(uColor, alpha);
}
`;

export class AtmosphereEffects {
  public readonly group = new THREE.Group();

  // 1. Ambient sunlit dust motes / petals / steam
  private readonly moteCount = 160;
  private readonly motePositions: Float32Array;
  private readonly motePhases: Float32Array;
  private readonly moteGeo: THREE.BufferGeometry;
  private readonly moteMat: THREE.PointsMaterial;
  private readonly motePoints: THREE.Points;

  // 2. Physical Tabletop Shockwave Ring Shader Plane
  private readonly shockMat: THREE.ShaderMaterial;
  private readonly shockMesh: THREE.Mesh;
  private shockTime = 99;
  private shockDuration = 0.68;

  // 3. 120-Instance Aerodynamic Fluttering Clash & Ceremonial Flake Pool
  private readonly burstMax = 120;
  private readonly burstMesh: THREE.InstancedMesh;
  private readonly burstMat: THREE.MeshStandardMaterial;
  private readonly bursts: BurstParticle[] = [];
  private readonly dummy = new THREE.Object3D();
  private cursor = 0;

  // Ceremonial Match-Victory Gold-Leaf Shower timer
  private victoryShowerTimer = 0;
  private showerEmitAccum = 0;

  private elapsed = 0;

  constructor() {
    // 1. Sunlit dust motes
    const moteTex = this.createSoftMoteTexture();
    this.motePositions = new Float32Array(this.moteCount * 3);
    this.motePhases = new Float32Array(this.moteCount);

    for (let i = 0; i < this.moteCount; i++) {
      this.motePositions[i * 3] = (Math.random() - 0.5) * 5.6;
      this.motePositions[i * 3 + 1] = 0.14 + Math.random() * 2.6;
      this.motePositions[i * 3 + 2] = (Math.random() - 0.5) * 4.6;
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

    // 2. Physical Tabletop Air/Gold-Dust Shockwave Ring
    this.shockMat = new THREE.ShaderMaterial({
      vertexShader: SHOCKWAVE_VERT,
      fragmentShader: SHOCKWAVE_FRAG,
      uniforms: {
        uProgress: { value: 1.0 },
        uColor: { value: new THREE.Color(0xebd29e) },
        uStrength: { value: 0.62 },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.shockMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), this.shockMat);
    this.shockMesh.rotation.x = -Math.PI / 2;
    this.shockMesh.position.set(0, 0.017, 0.08);
    this.shockMesh.renderOrder = 3;
    this.group.add(this.shockMesh);

    // 3. Physical Gold-Leaf / Urushi Flake / Petal Pool (120 instances)
    const flakeGeo = new THREE.PlaneGeometry(0.036, 0.023);
    this.burstMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xdfb868),
      roughness: 0.28,
      metalness: 0.72,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
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
        flutterPhase: Math.random() * Math.PI * 2,
        flutterAmp: 0.4 + Math.random() * 0.7,
        scale: 0,
        life: 0,
        maxLife: 1,
        swirlStrength: 0,
        bounced: false,
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
      this.moteMat.size = 0.056;
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
      this.moteMat.color.setHex(0xfff1d6);
      this.moteMat.size = 0.042;
      this.moteMat.opacity = 0.38;
    }
  }

  private nextParticle(): BurstParticle {
    const p = this.bursts[this.cursor];
    this.cursor = (this.cursor + 1) % this.burstMax;
    return p;
  }

  /**
   * Emit signature Move-Specific physical clash burst + tabletop air/gold-dust shockwave!
   */
  public emitClashBurst(
    outcome: 'WIN' | 'LOSS' | 'DRAW',
    winnerMove: Move,
    origin = new THREE.Vector3(0, 0.32, 0.08)
  ): void {
    // 1. Configure physical palette (hammered gold-leaf / vermilion lacquer / fine parchment dust)
    if (outcome === 'WIN') {
      this.burstMat.color.setHex(0xe4c274);
      this.burstMat.metalness = 0.82;
      this.burstMat.roughness = 0.24;
      this.shockMat.uniforms.uColor.value.setHex(0xecd397);
      this.shockMat.uniforms.uStrength.value = 0.7;
    } else if (outcome === 'LOSS') {
      this.burstMat.color.setHex(0xb25440);
      this.burstMat.metalness = 0.48;
      this.burstMat.roughness = 0.38;
      this.shockMat.uniforms.uColor.value.setHex(0xc97b62);
      this.shockMat.uniforms.uStrength.value = 0.62;
    } else {
      this.burstMat.color.setHex(0xeee6d8);
      this.burstMat.metalness = 0.12;
      this.burstMat.roughness = 0.62;
      this.shockMat.uniforms.uColor.value.setHex(0xeae2d2);
      this.shockMat.uniforms.uStrength.value = 0.52;
    }

    // Trigger physical shockwave ring across the tabletop
    this.shockMesh.position.set(origin.x, 0.017, origin.z);
    this.shockTime = 0;
    this.shockDuration = outcome === 'DRAW' ? 0.54 : 0.72;

    const strikeDir = outcome === 'LOSS' ? -1 : 1;

    // 2. Move-Specific Physical Particle Choreography
    if (outcome === 'DRAW') {
      // Mirrored standoff collision puff
      for (let i = 0; i < 42; i++) {
        const p = this.nextParticle();
        const theta = Math.random() * Math.PI * 2;
        const spd = 0.45 + Math.random() * 0.95;
        p.pos.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.1));
        p.vel.set(Math.cos(theta) * spd * 0.65, 0.55 + Math.random() * 0.85, Math.sin(theta) * spd);
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.rotVel.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
        p.scale = 0.55 + Math.random() * 0.85;
        p.maxLife = 0.95 + Math.random() * 0.55;
        p.life = p.maxLife;
        p.swirlStrength = 0;
        p.bounced = false;
      }
      return;
    }

    if (winnerMove === ROCK) {
      // ROCK CRUSH: Heavy low radial shock plume slamming outward & rebounding off table!
      for (let i = 0; i < 72; i++) {
        const p = this.nextParticle();
        const theta = Math.random() * Math.PI * 2;
        const speed = 0.7 + Math.random() * 1.55;
        p.pos.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 0.16, -0.05 + Math.random() * 0.12, (Math.random() - 0.5) * 0.16));
        p.vel.set(
          Math.cos(theta) * speed + strikeDir * 0.35,
          0.35 + Math.random() * 1.15,
          Math.sin(theta) * speed * 0.8
        );
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        p.scale = 0.65 + Math.random() * 1.15;
        p.maxLife = 1.1 + Math.random() * 0.7;
        p.life = p.maxLife;
        p.swirlStrength = 0;
        p.bounced = false;
      }
    } else if (winnerMove === SCISSORS) {
      // SCISSORS SLASH: Razor-crisp twin diagonal crescent blade arcs cutting across the arena!
      for (let i = 0; i < 68; i++) {
        const p = this.nextParticle();
        const t = i / 68;
        const arcAngle = (t - 0.5) * 2.1; // Sweeping crescent fan
        const blade = i % 2 === 0 ? 1 : -1;
        const speed = 0.85 + Math.random() * 1.25;
        p.pos.copy(origin).add(
          new THREE.Vector3(
            strikeDir * (t - 0.3) * 0.28,
            blade * (t - 0.5) * 0.18,
            (Math.random() - 0.5) * 0.14
          )
        );
        p.vel.set(
          strikeDir * (0.9 + Math.cos(arcAngle) * speed * 0.75),
          0.45 + Math.sin(arcAngle) * speed * 0.65 * blade,
          (Math.random() - 0.5) * 0.9
        );
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.rotVel.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
        p.scale = 0.6 + Math.random() * 1.05;
        p.maxLife = 1.05 + Math.random() * 0.65;
        p.life = p.maxLife;
        p.swirlStrength = 0.4;
        p.bounced = false;
      }
    } else {
      // PAPER ENVELOP: Majestic ascending spiral vortex of fluttering sunlit gold-leaf!
      for (let i = 0; i < 74; i++) {
        const p = this.nextParticle();
        const theta = (i / 74) * Math.PI * 4.0 + Math.random() * 0.4;
        const rad = 0.08 + Math.random() * 0.28;
        p.pos.set(
          origin.x + Math.cos(theta) * rad,
          origin.y - 0.06 + Math.random() * 0.16,
          origin.z + Math.sin(theta) * rad
        );
        p.vel.set(
          -Math.sin(theta) * 0.95 + strikeDir * 0.18,
          0.72 + Math.random() * 0.95,
          Math.cos(theta) * 0.95
        );
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.rotVel.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        p.scale = 0.72 + Math.random() * 1.0;
        p.maxLife = 1.35 + Math.random() * 0.85;
        p.life = p.maxLife;
        p.swirlStrength = 2.6 * strikeDir;
        p.bounced = false;
      }
    }
  }

  /**
   * Ceremonial hammered gold-leaf rain drifting gracefully down through sunlight beams on Match Victory!
   */
  public triggerVictoryShower(durationSec = 3.2): void {
    this.burstMat.color.setHex(0xe8c878);
    this.burstMat.metalness = 0.84;
    this.burstMat.roughness = 0.22;
    this.victoryShowerTimer = durationSec;
  }

  public update(dt: number, stage: StageId): void {
    const safeDt = Math.min(dt, 0.05);
    this.elapsed += safeDt;

    // 1. Update drifting dust motes / rising onsen mist / falling shrine petals
    const posAttr = this.moteGeo.getAttribute('position') as THREE.BufferAttribute;
    const isOnsen = stage === 'onsen';
    const isShrine = stage === 'shrine';

    for (let i = 0; i < this.moteCount; i++) {
      const phase = this.motePhases[i];
      let x = this.motePositions[i * 3];
      let y = this.motePositions[i * 3 + 1];
      let z = this.motePositions[i * 3 + 2];

      x += Math.sin(this.elapsed * 0.45 + phase) * 0.048 * safeDt;
      z += Math.cos(this.elapsed * 0.35 + phase * 1.3) * 0.036 * safeDt;

      if (isOnsen) {
        y += (0.12 + (phase % 0.08)) * safeDt;
        if (y > 2.65) y = 0.12;
      } else if (isShrine) {
        y -= (0.14 + (phase % 0.07)) * safeDt;
        x += 0.08 * safeDt;
        if (y < 0.05) {
          y = 2.65;
          x = (Math.random() - 0.5) * 5.6;
        }
      } else {
        y += Math.sin(this.elapsed * 0.6 + phase) * 0.025 * safeDt;
      }

      this.motePositions[i * 3] = x;
      this.motePositions[i * 3 + 1] = y;
      this.motePositions[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;

    // 2. Update tabletop physical air-pressure shockwave ring
    if (this.shockTime < this.shockDuration) {
      this.shockTime += safeDt;
      const prog = Math.min(1.0, this.shockTime / this.shockDuration);
      this.shockMat.uniforms.uProgress.value = prog;
    } else if (this.shockMat.uniforms.uProgress.value < 1.0) {
      this.shockMat.uniforms.uProgress.value = 1.0;
    }

    // 3. Emit ceremonial Match-Victory Gold-Leaf Shower flakes
    if (this.victoryShowerTimer > 0) {
      this.victoryShowerTimer = Math.max(0, this.victoryShowerTimer - safeDt);
      this.showerEmitAccum += safeDt * 32;
      while (this.showerEmitAccum >= 1.0) {
        this.showerEmitAccum -= 1.0;
        const p = this.nextParticle();
        p.pos.set((Math.random() - 0.5) * 2.1, 1.55 + Math.random() * 0.45, (Math.random() - 0.5) * 1.15);
        p.vel.set((Math.random() - 0.5) * 0.28, -0.32 - Math.random() * 0.25, (Math.random() - 0.5) * 0.22);
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.rotVel.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
        p.scale = 0.65 + Math.random() * 0.95;
        p.maxLife = 2.1 + Math.random() * 1.0;
        p.life = p.maxLife;
        p.swirlStrength = 0.35;
        p.bounced = false;
      }
    }

    // 4. Update all 120 fluttering physical flakes with tabletop bounce & aerodynamic wobble
    let anyActive = false;
    for (let i = 0; i < this.burstMax; i++) {
      const p = this.bursts[i];
      if (p.life > 0) {
        anyActive = true;
        p.life -= safeDt;

        // Vortex swirl acceleration for Paper envelop burst
        if (Math.abs(p.swirlStrength) > 0.01 && p.pos.y > 0.03) {
          const rx = p.pos.x;
          const rz = p.pos.z - 0.08;
          p.vel.x += -rz * p.swirlStrength * safeDt;
          p.vel.z += rx * p.swirlStrength * safeDt;
        }

        // Physical gravity + aerodynamic leaf-flutter lateral drift
        p.vel.y -= 1.95 * safeDt;
        p.vel.x += Math.sin(this.elapsed * 7.5 + p.flutterPhase) * p.flutterAmp * 0.22 * safeDt;
        p.vel.multiplyScalar(1 - 1.55 * safeDt);
        p.pos.addScaledVector(p.vel, safeDt);

        // Authentic physical bounce & settle onto tabletop surface
        if (p.pos.y < 0.014) {
          p.pos.y = 0.014;
          if (!p.bounced && Math.abs(p.vel.y) > 0.28) {
            p.vel.y = Math.abs(p.vel.y) * 0.34;
            p.vel.x *= 0.62;
            p.vel.z *= 0.62;
            p.bounced = true;
          } else {
            p.vel.set(0, 0, 0);
            p.rot.x = Math.PI * 0.5;
          }
        } else {
          p.rot.x += p.rotVel.x * safeDt;
          p.rot.y += p.rotVel.y * safeDt;
          p.rot.z += p.rotVel.z * safeDt;
        }

        const fade = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.32)));
        this.dummy.position.copy(p.pos);
        this.dummy.rotation.copy(p.rot);
        this.dummy.scale.setScalar(p.scale * fade);
        this.dummy.updateMatrix();
        this.burstMesh.setMatrixAt(i, this.dummy.matrix);
      } else if (p.scale > 0) {
        p.scale = 0;
        anyActive = true;
        this.dummy.position.set(0, -10, 0);
        this.dummy.scale.setScalar(0);
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
    this.shockMesh.geometry.dispose();
    this.shockMat.dispose();
    this.burstMesh.geometry.dispose();
    this.burstMat.dispose();
  }
}
