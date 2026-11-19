/**
 * High-Anisotropy PBR Texture Bundle Loader for cleanly extracted atlas tiles.
 * Loads paired albedo (sRGB), tangent-space normal (Linear), and calibrated roughness maps.
 */

import * as THREE from 'three';

export interface PBRTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export class TextureAtlasLoader {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, PBRTextureSet>();
  private readonly maxAnisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  }

  /**
   * Load a PBR triple (`{name}_albedo.jpg`, `{name}_normal.jpg`, `{name}_rough.jpg`)
   * with tiled wrapping and anisotropic filtering.
   */
  loadPBR(
    name: string,
    repeatX = 1,
    repeatY = 1,
    wrapMode: THREE.Wrapping = THREE.RepeatWrapping
  ): PBRTextureSet {
    const key = `${name}:${repeatX}x${repeatY}:${wrapMode}`;
    const existing = this.cache.get(key);
    if (existing) return existing;

    const configure = (tex: THREE.Texture, isColor: boolean): THREE.Texture => {
      tex.wrapS = wrapMode;
      tex.wrapT = wrapMode;
      tex.repeat.set(repeatX, repeatY);
      tex.anisotropy = this.maxAnisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return tex;
    };

    const map = configure(this.loader.load(`./textures/${name}_albedo.jpg`), true);
    const normalMap = configure(this.loader.load(`./textures/${name}_normal.jpg`), false);
    const roughnessMap = configure(this.loader.load(`./textures/${name}_rough.jpg`), false);

    const bundle: PBRTextureSet = { map, normalMap, roughnessMap };
    this.cache.set(key, bundle);
    return bundle;
  }

  /**
   * Create a calibrated MeshPhysicalMaterial backed by an extracted user-atlas PBR triple.
   */
  createMaterial(
    name: string,
    opts: {
      repeatX?: number;
      repeatY?: number;
      wrap?: THREE.Wrapping;
      roughness?: number;
      metalness?: number;
      normalScale?: number;
      clearcoat?: number;
      clearcoatRoughness?: number;
      color?: THREE.ColorRepresentation;
      envMapIntensity?: number;
      side?: THREE.Side;
    } = {}
  ): THREE.MeshPhysicalMaterial {
    const pbr = this.loadPBR(
      name,
      opts.repeatX ?? 1,
      opts.repeatY ?? 1,
      opts.wrap ?? THREE.RepeatWrapping
    );
    const ns = opts.normalScale ?? 1.0;
    return new THREE.MeshPhysicalMaterial({
      map: pbr.map,
      normalMap: pbr.normalMap,
      normalScale: new THREE.Vector2(ns, ns),
      roughnessMap: pbr.roughnessMap,
      roughness: opts.roughness ?? 1.0,
      metalness: opts.metalness ?? 0.0,
      clearcoat: opts.clearcoat ?? 0.0,
      clearcoatRoughness: opts.clearcoatRoughness ?? 0.25,
      color: opts.color ?? 0xffffff,
      envMapIntensity: opts.envMapIntensity ?? 1.1,
      side: opts.side ?? THREE.FrontSide,
    });
  }

  dispose(): void {
    for (const set of this.cache.values()) {
      set.map.dispose();
      set.normalMap.dispose();
      set.roughnessMap.dispose();
    }
    this.cache.clear();
  }
}
