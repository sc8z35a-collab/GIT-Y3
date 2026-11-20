/**
 * ★ CHROMA-DERM & KERATIN OPTICS 1.0 — Hand Fine-Detail Breakthrough #2 ★
 * Wavelength-Dependent 3-Band Spectral Skin Diffusion, Dual-Lobe Sebum/Keratin GGX BRDF,
 * Real-Time 3D Backlit Dorsal Vellus Hair Fiber Field & Pressure-Reactive Anisotropic Nail Optics!
 *
 * Strictly zero neon — engineered purely from physical dermal & keratin optics for macro & 5K realism:
 *  1. 3-Band Spectral Chromatic Skin Diffusion (`evaluateSpectralDermalBRDF`):
 *     - Red (650 nm, scatter 3.4 mm -> wrap 0.62) wraps furthest into shadow terminators,
 *     - Green (550 nm, scatter 0.9 mm -> wrap 0.24) softens mid-tone dermal warmth,
 *     - Blue (450 nm, scatter 0.3 mm -> wrap 0.06) preserves razor-sharp Rete Cutis micro-pore relief!
 *  2. Dual-Lobe Sebum Lipid + Stratum Corneum Keratin Microfacet Specular BRDF:
 *     - Narrow Sebum Lipid Lobe (α₁ ≈ 0.17) sparkles across individual skin cells & fingerprint ridges,
 *     - Broad Keratin Satin Lobe (α₂ ≈ 0.48) provides authentic organic skin sheen without plastic glaze!
 *  3. Real-Time 3D Backlit Dorsal Vellus Micro-Hair Field (`createVellusHairInstancedField`):
 *     - 360+ ultra-fine tapered 1.6mm dorsal hairs distributed organically across the back of the hand
 *       and wrist in 1 single `THREE.InstancedMesh` draw call, lying at natural 18°–25° distal-ulnar flow!
 *     - Custom Kajiya-Kay / Fresnel grazing backlit shader catches warm golden-ivory sunlight ONLY at
 *       oblique silhouettes (invisible head-on, astonishing photographic realism in macro & 5K captures!).
 *  4. Anisotropic Keratin Nail Optics + Hydraulic Nail-Bed Capillary Refill (`NailPressureRefillSolver`
 *     & `enhanceNailWithKeratinOptics`):
 *     - Longitudinal brushed-keratin anisotropic highlight stretched across the transverse C-curve,
 *     - Fast mechanical blanching (τ=0.08s) under fingertip pulp pressure + warm rosy capillary refill
 *       wave (τ=0.38s) upon release, plus translucent distal free-edge backlight!
 */

import * as THREE from 'three';

export interface SpectralDermalSample {
  /** 3-channel wavelength-dependent diffuse wrap radiance [R, G, B] */
  diffuseRgb: [number, number, number];
  /** Narrow sebum lipid lobe specular contribution */
  sebumSpec: number;
  /** Broad stratum corneum satin lobe specular contribution */
  keratinSpec: number;
  /** Combined dual-lobe microfacet specular */
  totalSpec: number;
}

/** Exact isotropic Trowbridge-Reitz GGX NDF D(h) */
function ggxD(ndoth: number, alpha: number): number {
  const a2 = alpha * alpha;
  const d = ndoth * ndoth * (a2 - 1.0) + 1.0;
  return a2 / Math.max(1e-5, Math.PI * d * d);
}

/**
 * Pure Mathematical Reference Model of CHROMA-DERM 1.0 3-Band Spectral Skin Diffusion & Dual-Lobe BRDF.
 * Mirrors our WebGL2 GLSL kernel bit-for-bit for deterministic optical verification!
 */
export function evaluateSpectralDermalBRDF(
  ndotl: number,
  ndotv: number,
  ndoth: number,
  sweat = 0.18,
  dorsalStrain = 0.25
): SpectralDermalSample {
  // 1. Wavelength-dependent 3-band skin diffusion wrap (Red 3.4mm > Green 0.9mm > Blue 0.3mm!)
  const wR = 0.62;
  const wG = 0.24;
  const wB = 0.06;
  const diffR = Math.max(0, Math.min(1, (ndotl + wR) / (1.0 + wR)));
  const diffG = Math.max(0, Math.min(1, (ndotl + wG) / (1.0 + wG)));
  const diffB = Math.max(0, Math.min(1, (ndotl + wB) / (1.0 + wB)));

  // 2. Dual-Lobe Sebum Lipid (narrow α₁) + Stratum Corneum Keratin (broad α₂) GGX Microfacet Specular
  const clampedV = Math.max(0.02, Math.min(1, ndotv));
  const clampedH = Math.max(0, Math.min(1, ndoth));
  const fresnel = 0.028 + 0.972 * Math.pow(1.0 - clampedV, 5.0);

  const alphaSebum = Math.max(0.1, 0.175 - sweat * 0.045 - dorsalStrain * 0.025);
  const alphaKeratin = Math.max(0.28, 0.48 - dorsalStrain * 0.09);

  const sebumWeight = 0.24 + sweat * 0.22;
  const keratinWeight = 0.76;

  const visAtten = Math.max(0, Math.min(1, (ndotl + 0.22) / 1.22));
  const sebumSpec = ggxD(clampedH, alphaSebum) * fresnel * sebumWeight * 0.11 * visAtten;
  const keratinSpec = ggxD(clampedH, alphaKeratin) * fresnel * keratinWeight * 0.14 * visAtten;

  return {
    diffuseRgb: [diffR, diffG, diffB],
    sebumSpec,
    keratinSpec,
    totalSpec: sebumSpec + keratinSpec,
  };
}

/**
 * Real-Time Asymmetric Hydraulic Nail-Bed Capillary Refill ODE Solver:
 *  - Mechanical pulp compression quickly forces blood out of the subungual vascular bed (`tauBlanch = 0.08s`)
 *  - Releasing grip triggers a lifelike warm rosy capillary refill wave (`tauRefill = 0.38s`)!
 */
export class NailPressureRefillSolver {
  /** Smoothed per-hand nail-bed capillary blanching level in [0..1] */
  public pressureBlanch = 0;

  public step(rawCompression: number, dt: number): number {
    const safeDt = Math.max(0.0005, Math.min(0.08, dt));
    const target = Math.max(0, Math.min(1, rawCompression));
    // Asymmetric physiological time constants: rapid compression blanching vs gradual vascular refill!
    const tau = target > this.pressureBlanch ? 0.08 : 0.38;
    const alpha = 1.0 - Math.exp(-safeDt / tau);
    this.pressureBlanch += (target - this.pressureBlanch) * alpha;
    return this.pressureBlanch;
  }

  public reset(): void {
    this.pressureBlanch = 0;
  }
}

export interface KeratinNailUniforms {
  uKeratinEnabled: { value: number };
  uNailSkinMode: { value: number }; // 1.0 living_skin, 0.0 non-organic craft
  uNailPressure: { value: number }; // 0..1 hydraulic capillary blanching
  uNailPulse: { value: number }; // 0..1 arterial pulse flush
  uNailSunDir: { value: THREE.Vector3 };
}

/**
 * Patch `nailMat` cleanly with CHROMA-DERM & KERATIN OPTICS 1.0:
 *  1. Longitudinal brushed-keratin anisotropic specular (stretched horizontally across the nail C-curve!)
 *  2. Hydraulic nail-bed capillary blanching (`uNailPressure`) turning the pink vascular bed ivory under press!
 *  3. Translucent distal free-edge backlit scatter (`v > 0.76`)!
 */
export function enhanceNailWithKeratinOptics(
  mat: THREE.MeshPhysicalMaterial,
  preset: string,
  uniforms: KeratinNailUniforms
): void {
  uniforms.uNailSkinMode.value = preset === 'living_skin' ? 1.0 : 0.0;

  mat.customProgramCacheKey = () => `keratin_nail_optics_v1_${preset}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uKeratinEnabled = uniforms.uKeratinEnabled;
    shader.uniforms.uNailSkinMode = uniforms.uNailSkinMode;
    shader.uniforms.uNailPressure = uniforms.uNailPressure;
    shader.uniforms.uNailPulse = uniforms.uNailPulse;
    shader.uniforms.uNailSunDir = uniforms.uNailSunDir;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec2 vKeratinUv;
        varying vec3 vKeratinWorldPos;
        varying vec3 vKeratinWorldN;
        varying vec3 vKeratinWorldT;
        `
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vKeratinUv = uv;
        vec4 kWp = modelMatrix * vec4( transformed, 1.0 );
        vKeratinWorldPos = kWp.xyz;
        vKeratinWorldN = normalize( mat3( modelMatrix ) * objectNormal );
        // Local +Z runs cuticle->free-edge along microscopic longitudinal keratin ridges!
        vKeratinWorldT = normalize( mat3( modelMatrix ) * vec3( 0.0, 0.0, 1.0 ) );
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uKeratinEnabled;
        uniform float uNailSkinMode;
        uniform float uNailPressure;
        uniform float uNailPulse;
        uniform vec3 uNailSunDir;
        varying vec2 vKeratinUv;
        varying vec3 vKeratinWorldPos;
        varying vec3 vKeratinWorldN;
        varying vec3 vKeratinWorldT;
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `
        if ( uKeratinEnabled > 0.5 && uNailSkinMode > 0.5 ) {
          vec3 kN = normalize( vKeratinWorldN );
          vec3 kV = normalize( cameraPosition - vKeratinWorldPos );
          vec3 kL = normalize( uNailSunDir );

          float u = vKeratinUv.x;
          float v = vKeratinUv.y; // 0 cuticle -> 1 free edge

          // 0. Infinite-Zoom Microscopic Keratin Longitudinal Ridges + Transverse Beau Growth Lamellae!
          vec3 kMicroN = kN;
          vec3 kDx = dFdx( vKeratinWorldPos );
          vec3 kDy = dFdy( vKeratinWorldPos );
          float kPxSize = max( length( kDx ), length( kDy ) );
          float kMacro = 1.0 - smoothstep( 0.00025, 0.0014, kPxSize );
          if ( kMacro > 0.01 ) {
            float kRidge =
              sin( u * 310.0 + sin( v * 12.0 ) * 0.35 ) * 0.42 +
              sin( u * 780.0 + 1.1 ) * 0.24 +
              sin( v * 115.0 + u * 6.0 ) * 0.16;
            float kPxS = max( kPxSize, 1e-7 );
            vec3 uX = kDx / kPxS;
            vec3 uY = kDy / kPxS;
            vec3 r1 = cross( uY, kN );
            vec3 r2 = cross( kN, uX );
            float detU = dot( uX, r1 );
            if ( abs( detU ) > 1e-4 ) {
              vec3 gradU = sign( detU ) * ( dFdx( kRidge ) * r1 + dFdy( kRidge ) * r2 ) / max( abs( detU ), 1e-3 );
              kMicroN = normalize( kN - clamp( gradU, vec3( -1.2 ), vec3( 1.2 ) ) * 0.16 * kMacro );
            }
          }

          vec3 kH = normalize( kL + kV );
          // Orthogonalize longitudinal keratin ridge tangent against micro-perturbed normal
          vec3 kT = normalize( vKeratinWorldT - kMicroN * dot( vKeratinWorldT, kMicroN ) );
          vec3 kB = normalize( cross( kMicroN, kT ) );

          // 1. Hydraulic Nail-Bed Capillary Blanching strictly across vascular bed (v in 0.20..0.78)
          float bedMask = smoothstep( 0.16, 0.30, v ) * ( 1.0 - smoothstep( 0.72, 0.84, v ) );
          float pressBlanch = clamp( uNailPressure, 0.0, 1.0 ) * bedMask;
          vec3 ivoryTint = vec3( 1.12, 1.05, 0.99 );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * ivoryTint, pressBlanch * 0.42 );

          // Subtle live systolic rosy vascular warmth + subungual vertical capillary micro-fibers at macro zoom!
          float capFiber = 0.78 + 0.22 * sin( u * 420.0 + sin( v * 28.0 ) * 0.8 ) * kMacro;
          float rosyFlush = ( 1.0 - pressBlanch ) * bedMask * ( 0.012 + uNailPulse * 0.014 ) * capFiber;
          gl_FragColor.rgb += vec3( 0.65, 0.14, 0.09 ) * rosyFlush;

          // 2. Anisotropic Brushed Keratin Specular (Ward/Kajiya-Kay stretched across transverse C-curve!)
          float hDotT = dot( kH, kT );
          float hDotB = dot( kH, kB );
          float hDotN = max( 0.001, dot( kH, kMicroN ) );
          float anisoExp = -( ( hDotT * hDotT ) / 0.018 + ( hDotB * hDotB ) / 0.14 ) / ( hDotN * hDotN );
          float anisoSpec = exp( clamp( anisoExp, -18.0, 0.0 ) ) * max( 0.0, dot( kMicroN, kL ) );
          float striaMod = 0.80 + 0.20 * sin( u * 240.0 + kMacro * sin( u * 620.0 ) * 0.5 );
          gl_FragColor.rgb += vec3( 0.96, 0.93, 0.89 ) * anisoSpec * striaMod * 0.15;

          // 3. Translucent Ivory Distal Free-Edge Backlit Glow (v > 0.74, strictly physical daylight!)
          float freeMask = smoothstep( 0.74, 0.90, v );
          float backScatter = pow( clamp( dot( kV, -normalize( kL + kN * 0.3 ) ), 0.0, 1.0 ), 3.0 );
          gl_FragColor.rgb += vec3( 0.56, 0.48, 0.36 ) * freeMask * ( 0.018 + backScatter * 0.09 );
        }
        #include <dithering_fragment>
        `
      );
  };
  mat.needsUpdate = true;
}

export interface VellusHairUniforms {
  [uniform: string]: THREE.IUniform;
  uSunDir: { value: THREE.Vector3 };
  uHairOpacity: { value: number };
}

/** Deterministic Halton quasi-random sequence for organic non-clumping biological hair placement */
function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** Build a smoothly curved, 2-segment tapered 3D microscopic hair shaft (5 verts, 3 tris -> realistic at 200×!) */
function createCurvedVellusBladeGeo(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -0.5, 0.0, 0.0,     // 0: follicle root left
     0.5, 0.0, 0.0,     // 1: follicle root right
    -0.28, 0.52, 0.08,  // 2: mid-shaft natural outward arch left
     0.28, 0.52, 0.08,  // 3: mid-shaft natural outward arch right
     0.0, 1.0, 0.24,    // 4: delicate recurved translucent tip
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.15, 0.52,
    0.85, 0.52,
    0.5, 1.0,
  ]);
  const indices = [
    0, 1, 2,
    1, 3, 2,
    2, 3, 4,
  ];
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createVellusHairShaderMaterial(sunDir: THREE.Vector3): {
  material: THREE.ShaderMaterial;
  uniforms: VellusHairUniforms;
} {
  const uniforms: VellusHairUniforms = {
    uSunDir: { value: sunDir.clone() },
    uHairOpacity: { value: 1.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vHairTangent;
      varying vec3 vSurfaceN;

      void main() {
        vUv = uv;
        mat4 instM = modelMatrix * instanceMatrix;
        vec4 wp = instM * vec4( position, 1.0 );
        vWorldPos = wp.xyz;
        // Curved tangent along arched hair shaft
        vec3 localT = normalize( vec3( 0.0, 1.0, 0.12 + uv.y * 0.22 ) );
        vHairTangent = normalize( mat3( instM ) * localT );
        vSurfaceN = normalize( mat3( instM ) * vec3( 0.0, 0.25, 1.0 ) );
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uHairOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vHairTangent;
      varying vec3 vSurfaceN;

      void main() {
        vec3 T = normalize( vHairTangent );
        vec3 V = normalize( cameraPosition - vWorldPos );
        vec3 L = normalize( uSunDir );
        vec3 N = normalize( vSurfaceN );

        // Kajiya-Kay directional hair scattering sin(T, H) + warm backlit transmission
        vec3 H = normalize( L + V );
        float tdoth = dot( T, H );
        float kajiyaSpec = pow( sqrt( max( 0.0, 1.0 - tdoth * tdoth ) ), 14.0 );
        float backRim = pow( max( 0.0, dot( V, -L ) ), 2.2 ) * 0.65 + 0.35;

        // Distance-adaptive visibility: subtle grazing shimmer at 1×, crisp sunlit micro-fibers at 30×+ macro!
        float camDist = length( cameraPosition - vWorldPos );
        float macroVis = smoothstep( 0.65, 0.08, camDist );
        float grazing = pow( 1.0 - abs( dot( N, V ) ), 1.85 );
        float tipTaper = smoothstep( 0.0, 0.16, vUv.y ) * ( 1.0 - smoothstep( 0.74, 1.0, vUv.y ) );

        float alpha = clamp( ( 0.08 + macroVis * 0.16 + grazing * 0.44 + kajiyaSpec * 0.34 ) * tipTaper * backRim * uHairOpacity, 0.0, 0.56 );
        if ( alpha < 0.015 ) discard;

        // Root subtly warmer/darker melanin -> translucent sunlit pale-ivory keratin tip (strictly zero neon!)
        vec3 rootCol = vec3( 0.56, 0.45, 0.36 );
        vec3 tipCol = vec3( 0.95, 0.88, 0.78 );
        vec3 col = mix( rootCol, tipCol, clamp( vUv.y * 0.55 + kajiyaSpec * 0.55 + grazing * 0.35, 0.0, 1.0 ) );
        gl_FragColor = vec4( col, alpha );
      }
    `,
  });

  return { material, uniforms };
}

/**
 * Create a single zero-overhead `THREE.InstancedMesh` of ~520 anatomically curved 3D microscopic
 * dorsal vellus hairs (産毛) planted flush onto the sculpted dorsal palm surface!
 *  - Only 1 GPU draw call per hand (< 1,600 triangles total!)
 *  - Custom Backlit Kajiya-Kay Grazing Rim Shader: virtually invisible head-on at 1×, reveals
 *    astonishing sunlit arched follicular fibers under macro & 5K/infinite zoom (strictly zero neon!).
 */
export function createVellusHairInstancedField(
  palmGeometry: THREE.BufferGeometry,
  mirrorSign: number,
  sunDir: THREE.Vector3,
  hairCount = 520
): { mesh: THREE.InstancedMesh; uniforms: VellusHairUniforms; material: THREE.ShaderMaterial } {
  const bladeGeo = createCurvedVellusBladeGeo();
  const { material, uniforms } = createVellusHairShaderMaterial(sunDir);

  const posAttr = palmGeometry.attributes.position as THREE.BufferAttribute;
  const normAttr = palmGeometry.attributes.normal as THREE.BufferAttribute;
  const candidates: number[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = normAttr.getY(i);
    // Anatomical dorsal hair zone: back of hand & ulnar-dorsal side (avoid volar palm!)
    if (y > 0.012 && ny > 0.34 && z > -0.115 && z < 0.115) {
      candidates.push(i);
    }
  }

  const actualCount = Math.min(hairCount, Math.max(1, candidates.length));
  const instMesh = new THREE.InstancedMesh(bladeGeo, material, actualCount);
  instMesh.frustumCulled = false;
  instMesh.castShadow = false;
  instMesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const flowDir = new THREE.Vector3();
  const tangentSide = new THREE.Vector3();
  const outNormal = new THREE.Vector3();
  const basisMat = new THREE.Matrix4();

  for (let k = 0; k < actualCount; k++) {
    const hIdx = Math.floor(halton(k + 17, 2) * candidates.length) % candidates.length;
    const vi = candidates[hIdx];
    const jitterA = (halton(k + 17, 3) - 0.5) * 0.007;
    const jitterB = (halton(k + 17, 5) - 0.5) * 0.007;

    p.set(posAttr.getX(vi) + jitterA, posAttr.getY(vi), posAttr.getZ(vi) + jitterB);
    n.set(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi)).normalize();

    // Natural anatomical dorsal hand hair flow: sweeps gently distal (+Z) and slightly ulnar (-mirrorSign * X)
    flowDir
      .set(
        -0.38 * mirrorSign + (halton(k + 31, 7) - 0.5) * 0.25,
        0.0,
        0.92 + (halton(k + 31, 11) - 0.5) * 0.15
      )
      .normalize();
    flowDir.addScaledVector(n, -flowDir.dot(n)).normalize();
    flowDir.multiplyScalar(0.91).addScaledVector(n, 0.41).normalize();

    tangentSide.crossVectors(flowDir, n).normalize();
    outNormal.crossVectors(tangentSide, flowDir).normalize();

    basisMat.makeBasis(tangentSide, flowDir, outNormal);
    dummy.position.copy(p).addScaledVector(n, -0.00025);
    dummy.quaternion.setFromRotationMatrix(basisMat);

    const lenM = 0.003 + halton(k + 5, 13) * 0.0026;
    const widthM = 0.00023 + halton(k + 9, 17) * 0.0001;
    dummy.scale.set(widthM, lenM, widthM);
    dummy.updateMatrix();
    instMesh.setMatrixAt(k, dummy.matrix);
  }

  instMesh.instanceMatrix.needsUpdate = true;
  return { mesh: instMesh, uniforms, material };
}

/**
 * Create a lightweight single-draw-call 3D curved dorsal vellus hair cluster planted strictly on the
 * dorsal surface of a proximal finger phalanx (real human anatomy: fine dorsal proximal hairs,
 * ZERO hairs on volar pulp or distal nail segment!). Shares the parent hand's `ShaderMaterial`!
 */
export function createFingerDorsalVellusField(
  phalanxGeometry: THREE.BufferGeometry,
  sharedMaterial: THREE.ShaderMaterial,
  hairCount = 34
): THREE.InstancedMesh {
  const bladeGeo = createCurvedVellusBladeGeo();
  const posAttr = phalanxGeometry.attributes.position as THREE.BufferAttribute;
  const normAttr = phalanxGeometry.attributes.normal as THREE.BufferAttribute;

  let maxZ = 0.01;
  for (let i = 0; i < posAttr.count; i++) {
    maxZ = Math.max(maxZ, posAttr.getZ(i));
  }

  const candidates: number[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = normAttr.getY(i);
    const zNorm = z / maxZ;
    // Plant strictly along dorsal mid-shaft (avoiding joint capsule borders & volar underside!)
    if (y > 0.006 && ny > 0.48 && zNorm > 0.16 && zNorm < 0.78) {
      candidates.push(i);
    }
  }

  const actualCount = Math.min(hairCount, Math.max(1, candidates.length));
  const instMesh = new THREE.InstancedMesh(bladeGeo, sharedMaterial, actualCount);
  instMesh.frustumCulled = false;
  instMesh.castShadow = false;
  instMesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const flowDir = new THREE.Vector3();
  const tangentSide = new THREE.Vector3();
  const outNormal = new THREE.Vector3();
  const basisMat = new THREE.Matrix4();

  for (let k = 0; k < actualCount; k++) {
    const hIdx = Math.floor(halton(k + 29, 2) * candidates.length) % candidates.length;
    const vi = candidates[hIdx];
    p.set(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
    n.set(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi)).normalize();

    flowDir
      .set((halton(k + 13, 3) - 0.5) * 0.28, 0.0, 0.96)
      .normalize();
    flowDir.addScaledVector(n, -flowDir.dot(n)).normalize();
    flowDir.multiplyScalar(0.92).addScaledVector(n, 0.39).normalize();

    tangentSide.crossVectors(flowDir, n).normalize();
    outNormal.crossVectors(tangentSide, flowDir).normalize();

    basisMat.makeBasis(tangentSide, flowDir, outNormal);
    dummy.position.copy(p).addScaledVector(n, -0.0002);
    dummy.quaternion.setFromRotationMatrix(basisMat);

    const lenM = 0.0024 + halton(k + 7, 5) * 0.0018;
    const widthM = 0.00018 + halton(k + 11, 7) * 0.00008;
    dummy.scale.set(widthM, lenM, widthM);
    dummy.updateMatrix();
    instMesh.setMatrixAt(k, dummy.matrix);
  }

  instMesh.instanceMatrix.needsUpdate = true;
  return instMesh;
}
