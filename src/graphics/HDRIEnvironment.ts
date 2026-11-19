/**
 * Physical Studio & Architectural HDRI Environment Generator (Zero-Neon).
 * Synthesizes true floating-point (FloatType) high-dynamic-range equirectangular
 * lighting domes tailored to each architectural stage and prefilters them via PMREM
 * so metals, lacquer, porcelain, and water reflect physically grounded daylight & warm rooms.
 */

import * as THREE from 'three';
import { StageId } from './GraphicsConfig';

interface StageHDRISpec {
  zenith: [number, number, number];
  horizon: [number, number, number];
  ground: [number, number, number];
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  sunAngularRadius: number;
  windowPanels: Array<{
    azim: number; // radians
    elev: number; // radians
    width: number;
    height: number;
    color: [number, number, number];
    radiance: number;
  }>;
}

const STAGE_HDRI_SPECS: Record<StageId, StageHDRISpec> = {
  zashiki: {
    zenith: [0.68, 0.78, 0.92],
    horizon: [1.18, 1.05, 0.88],
    ground: [0.34, 0.27, 0.19],
    sunDir: [0.62, 0.52, -0.58],
    sunColor: [1.0, 0.88, 0.7],
    sunIntensity: 9.5,
    sunAngularRadius: 0.14,
    windowPanels: [
      // Sunlit shoji diffused warm light panel on back-right
      { azim: 0.65, elev: 0.22, width: 0.85, height: 0.52, color: [1.0, 0.93, 0.8], radiance: 3.4 },
      // Cool sky bounce from garden veranda on left
      { azim: -1.45, elev: 0.18, width: 0.72, height: 0.45, color: [0.76, 0.88, 1.0], radiance: 2.0 },
      // Warm soft overhead architectural lantern fill
      { azim: 0.0, elev: 1.25, width: 1.1, height: 0.4, color: [1.0, 0.91, 0.76], radiance: 1.35 },
    ],
  },
  salon: {
    zenith: [0.45, 0.48, 0.52],
    horizon: [0.82, 0.74, 0.6],
    ground: [0.22, 0.2, 0.18],
    sunDir: [0.55, 0.62, -0.56],
    sunColor: [1.0, 0.92, 0.78],
    sunIntensity: 10.5,
    sunAngularRadius: 0.13,
    windowPanels: [
      // Tall heritage arched sunlit windows
      { azim: 0.8, elev: 0.3, width: 0.65, height: 0.65, color: [1.0, 0.94, 0.84], radiance: 4.0 },
      { azim: -0.95, elev: 0.26, width: 0.55, height: 0.55, color: [0.84, 0.9, 0.98], radiance: 2.2 },
      // Warm chandelier overhead bounce
      { azim: 0.0, elev: 1.3, width: 0.9, height: 0.35, color: [1.0, 0.88, 0.68], radiance: 2.1 },
    ],
  },
  shrine: {
    zenith: [0.42, 0.68, 1.05],
    horizon: [0.95, 0.96, 0.92],
    ground: [0.25, 0.29, 0.21],
    sunDir: [0.58, 0.66, -0.48],
    sunColor: [1.0, 0.93, 0.8],
    sunIntensity: 13.0,
    sunAngularRadius: 0.11,
    windowPanels: [
      // Broad open sky dome canopy
      { azim: -0.6, elev: 0.68, width: 1.5, height: 0.6, color: [0.72, 0.88, 1.05], radiance: 2.4 },
      // Warm stone bounce from shrine courtyard
      { azim: 1.2, elev: 0.12, width: 0.9, height: 0.35, color: [0.98, 0.9, 0.76], radiance: 1.7 },
    ],
  },
  onsen: {
    zenith: [0.55, 0.76, 0.92],
    horizon: [0.96, 0.95, 0.89],
    ground: [0.18, 0.32, 0.3],
    sunDir: [0.48, 0.68, -0.55],
    sunColor: [1.0, 0.95, 0.84],
    sunIntensity: 11.5,
    sunAngularRadius: 0.15,
    windowPanels: [
      // Turquoise water caustic upward bounce!
      { azim: -1.1, elev: -0.15, width: 1.1, height: 0.45, color: [0.45, 0.86, 0.84], radiance: 1.8 },
      // Misty sunlit sky opening
      { azim: 0.5, elev: 0.55, width: 1.1, height: 0.55, color: [1.0, 0.96, 0.9], radiance: 3.1 },
    ],
  },
  atelier: {
    zenith: [0.52, 0.58, 0.68],
    horizon: [0.98, 0.84, 0.68],
    ground: [0.26, 0.2, 0.16],
    sunDir: [0.65, 0.5, -0.57],
    sunColor: [1.0, 0.84, 0.64],
    sunIntensity: 11.0,
    sunAngularRadius: 0.12,
    windowPanels: [
      // Large North-light factory skylight
      { azim: -0.35, elev: 0.75, width: 1.2, height: 0.5, color: [0.85, 0.92, 1.0], radiance: 2.9 },
      // Golden afternoon window beam
      { azim: 0.95, elev: 0.22, width: 0.7, height: 0.5, color: [1.0, 0.82, 0.58], radiance: 3.8 },
    ],
  },
};

export class HDRIEnvironmentBuilder {
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly cache = new Map<StageId, THREE.Texture>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
  }

  getEnvironment(stage: StageId): THREE.Texture {
    const cached = this.cache.get(stage);
    if (cached) return cached;

    const spec = STAGE_HDRI_SPECS[stage];
    const width = 256;
    const height = 128;
    const data = new Float32Array(width * height * 4);

    const sunVec = new THREE.Vector3(...spec.sunDir).normalize();
    const dir = new THREE.Vector3();

    for (let y = 0; y < height; y++) {
      const v = (y + 0.5) / height;
      const theta = v * Math.PI; // 0 = zenith, pi = nadir
      const elev = Math.PI * 0.5 - theta; // +pi/2 = zenith, -pi/2 = nadir
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let x = 0; x < width; x++) {
        const u = (x + 0.5) / width;
        const phi = (u - 0.5) * Math.PI * 2; // -pi..pi

        dir.set(Math.sin(phi) * sinTheta, cosTheta, Math.cos(phi) * sinTheta);

        // Sky / Horizon / Ground physical gradient
        let r: number, g: number, b: number;
        if (elev >= 0) {
          const t = Math.pow(Math.min(1, elev / (Math.PI * 0.5)), 0.58);
          r = spec.horizon[0] * (1 - t) + spec.zenith[0] * t;
          g = spec.horizon[1] * (1 - t) + spec.zenith[1] * t;
          b = spec.horizon[2] * (1 - t) + spec.zenith[2] * t;
        } else {
          const t = Math.pow(Math.min(1, -elev / (Math.PI * 0.5)), 0.45);
          r = spec.horizon[0] * (1 - t) + spec.ground[0] * t;
          g = spec.horizon[1] * (1 - t) + spec.ground[1] * t;
          b = spec.horizon[2] * (1 - t) + spec.ground[2] * t;
        }

        // Architectural diffused window & bounce panels
        for (const panel of spec.windowPanels) {
          let dAz = Math.abs(phi - panel.azim);
          if (dAz > Math.PI) dAz = Math.PI * 2 - dAz;
          const dEl = Math.abs(elev - panel.elev);
          const wx = Math.max(0, 1 - dAz / (panel.width * 0.5));
          const wy = Math.max(0, 1 - dEl / (panel.height * 0.5));
          const mask = wx * wx * (3 - 2 * wx) * (wy * wy * (3 - 2 * wy));
          if (mask > 0.001) {
            r += panel.color[0] * panel.radiance * mask;
            g += panel.color[1] * panel.radiance * mask;
            b += panel.color[2] * panel.radiance * mask;
          }
        }

        // High-radiance physical solar disc + soft atmospheric Mie halo
        const sunDot = Math.max(0, dir.dot(sunVec));
        const sunAng = Math.acos(Math.min(1, sunDot));
        const disc = Math.exp(-Math.pow(sunAng / spec.sunAngularRadius, 2.6));
        const halo = Math.pow(sunDot, 10) * 0.35;
        const sunContrib = (disc + halo) * spec.sunIntensity;
        r += spec.sunColor[0] * sunContrib;
        g += spec.sunColor[1] * sunContrib;
        b += spec.sunColor[2] * sunContrib;

        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 1.0;
      }
    }

    const equirect = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.magFilter = THREE.LinearFilter;
    equirect.minFilter = THREE.LinearFilter;
    equirect.needsUpdate = true;

    const envRT = this.pmrem.fromEquirectangular(equirect);
    equirect.dispose();

    this.cache.set(stage, envRT.texture);
    return envRT.texture;
  }

  dispose(): void {
    for (const tex of this.cache.values()) tex.dispose();
    this.cache.clear();
    this.pmrem.dispose();
  }
}
