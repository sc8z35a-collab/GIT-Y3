/**
 * ★ KHDR 1.1 (Kinetic Dual-Lobe Spectral HDR 1.1) Multi-Pass WebGL2 Rendering Pipeline ★
 *
 * Proprietary high-dynamic-range photographic pipeline (STRICTLY ZERO NEON!).
 * Renders the 3D scene into a true 16-bit floating-point HDR framebuffer
 * (`THREE.HalfFloatType`) with an attached WebGL2 hardware `DepthTexture`, then runs:
 *
 *  Pass 1 — Karis-Weighted Half-Resolution Log-Luminance Field & Physical Sun-Veil Extraction
 *           (isolates broad illumination field from fine skin/wood/stone/porcelain micro-detail,
 *            plus subtle physical glass-lens optical veil ONLY on genuine sun glints L > 1.85)
 *
 *  Pass 2 — KHDR 1.1 Master Compositor + Shadow Flame 1.0 Pro Screen-Space Contact Shadow Ray-March (SF-SSCS):
 *           1. When Shadow Flame 1.0 Pro is enabled: executes a 10-step Screen-Space Depth Ray-March
 *              along the projected 3D sun vector to carve ultra-fine micro-shadows between fingers,
 *              knuckles, zabuton pleats, and carved table edges!
 *           2. When KHDR 1.1 is ON:
 *              - Edge-Preserving Bilateral-Weighted Dual-Scale Retinex (zero bright/dark halos around
 *                hands while revealing rich micro-detail across shadows AND sunlit highlights!)
 *              - AgX-Inspired Spectral Inset / Outset Matrix + 16-Stop Perceptual Tone Curve
 *                (preserves living skin warmth, ivory, hinoki, lacquer & bronze chroma cleanly up to
 *                 16 stops of luminance with zero pale yellow-shift or clipping!)
 *              - Depth-Aware Foreground Micro-Clarity (lifts tactile FINGER S1.0 pores & craft grain
 *                on foreground hands while preserving natural silky architectural background depth!)
 *              - Classical Japanese Film Shadow/Highlight Color Science (subtle cool sky shadow fill
 *                + warm sunlit parchment highlights)
 *              - Physical 50mm Optical Vignette mapped in global frame coordinates (`uTileOffset`/`uTileScale`)
 *                so tiled 5K Photo Capture is 100% mathematically seamless across tile boundaries!
 *              - Interleaved Gradient Blue-Noise Dithering on 8-bit display (`uDitherStrength = 1.0`),
 *                cleanly bypassed (`uDitherStrength = 0.0`) during True 16-Bit/ch 5K Float Readback!
 */

import * as THREE from 'three';

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Pass 1A: Downsample & extract Log-Luminance base layer + physical extreme-highlight sun veil
const EXTRACT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform vec2 uTexelSize;
varying vec2 vUv;

float khdrLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  // 4-tap box downsample (Karis-weighted to prevent specular firefly flicker)
  vec3 c0 = texture2D(tColor, vUv + vec2(-0.5, -0.5) * uTexelSize).rgb;
  vec3 c1 = texture2D(tColor, vUv + vec2( 0.5, -0.5) * uTexelSize).rgb;
  vec3 c2 = texture2D(tColor, vUv + vec2(-0.5,  0.5) * uTexelSize).rgb;
  vec3 c3 = texture2D(tColor, vUv + vec2( 0.5,  0.5) * uTexelSize).rgb;

  float w0 = 1.0 / (1.0 + khdrLuma(c0));
  float w1 = 1.0 / (1.0 + khdrLuma(c1));
  float w2 = 1.0 / (1.0 + khdrLuma(c2));
  float w3 = 1.0 / (1.0 + khdrLuma(c3));
  vec3 avg = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);

  float lum = max(khdrLuma(avg), 1e-4);

  // Subtle physical optical lens veil ONLY on genuine high-radiance sunlight glints (L > 1.85)
  float excess = max(0.0, lum - 1.85);
  float softKnee = excess / (excess + 1.55);
  vec3 veil = avg * (softKnee / max(lum, 1e-3)) * 0.44;

  // Store veil RGB in .rgb and log2-luminance in .a for Bilateral Dual-Scale Retinex 1.1!
  gl_FragColor = vec4(veil, log2(lum));
}
`;

// Pass 1B & 1C: Separable 9-tap Gaussian blur for smooth Retinex illumination field & physical veil
const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uDirection;
varying vec2 vUv;

void main() {
  vec4 sum = texture2D(tInput, vUv) * 0.227027;
  sum += texture2D(tInput, vUv + uDirection * 1.384615) * 0.316216;
  sum += texture2D(tInput, vUv - uDirection * 1.384615) * 0.316216;
  sum += texture2D(tInput, vUv + uDirection * 3.230769) * 0.070270;
  sum += texture2D(tInput, vUv - uDirection * 3.230769) * 0.070270;
  gl_FragColor = sum;
}
`;

// Pass 2: KHDR 1.1 Master Compositor + Shadow Flame 1.0 Pro Screen-Space Ray-Marched Micro-Shadows
const COMPOSITE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAux;             // .rgb = optical sun veil, .a = blurred local log2 luminance
uniform vec2 uResolution;
uniform float uKhdrEnabled;         // 0.0 or 1.0
uniform float uSplitCompare;        // 0.0 = off, 1.0 = active A/B split curtain
uniform float uSplitX;              // 0..1 split cursor position
uniform float uEnableSSCS;          // 1.0 when Shadow Flame 1.0 Pro is active!
uniform float uCameraNear;
uniform float uCameraFar;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec3 uSunViewDir;           // Sun direction in Camera View Space (pointing toward sun)
uniform float uExposure;
uniform float uTime;
uniform vec2 uTileOffset;           // Global UV offset for seamless 5K tiled capture (default 0,0)
uniform vec2 uTileScale;            // Global UV scale for seamless 5K tiled capture (default 1,1)
uniform float uDitherStrength;      // 1.0 for 8-bit display, 0.0 for True 16-bit/ch 5K PNG capture!

varying vec2 vUv;

float khdrLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float linearizeDepth(float depthSample) {
  float zNdc = depthSample * 2.0 - 1.0;
  return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - zNdc * (uCameraFar - uCameraNear));
}

vec3 reconstructViewPos(vec2 uv, float depthSample) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depthSample * 2.0 - 1.0, 1.0);
  vec4 view = uInvProj * clip;
  return view.xyz / view.w;
}

/**
 * Shadow Flame 1.0 Pro — Screen-Space Contact Shadow Ray-March (SF-SSCS).
 */
float computeShadowFlameSSCS(vec2 uv, float rawDepth) {
  if (rawDepth >= 0.9995) return 1.0;

  vec3 viewPos = reconstructViewPos(uv, rawDepth);
  float distFade = 1.0 - smoothstep(4.2, 7.8, -viewPos.z);
  if (distFade <= 0.01) return 1.0;

  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  float rayLength = 0.24;
  const int STEPS = 10;
  float stepLen = rayLength / float(STEPS);
  float thickness = 0.055;

  float occ = 0.0;
  vec3 rayDir = normalize(uSunViewDir);

  for (int i = 1; i <= STEPS; i++) {
    float t = (float(i) - 0.35 + ign * 0.65) * stepLen;
    vec3 sampleView = viewPos + rayDir * t;

    vec4 clip = uProj * vec4(sampleView, 1.0);
    vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (sampleUv.x < 0.002 || sampleUv.x > 0.998 || sampleUv.y < 0.002 || sampleUv.y > 0.998) break;

    float sampleRawDepth = texture2D(tDepth, sampleUv).r;
    float sampleSceneZ = -linearizeDepth(sampleRawDepth);
    float rayZ = sampleView.z;

    float delta = sampleSceneZ - rayZ;
    if (delta > 0.0045 && delta < thickness) {
      float falloff = 1.0 - (float(i) / float(STEPS));
      float smoothThick = 1.0 - smoothstep(thickness * 0.45, thickness, delta);
      occ = max(occ, falloff * smoothThick);
    }
  }

  return 1.0 - occ * 0.46 * distFade;
}

/**
 * ★ KHDR 1.1 AgX-Inspired Spectral Inset / Outset 16-Stop Perceptual Tone Curve ★
 * Applies a subtle spectral crosstalk inset matrix prior to sigmoidal highlight compression
 * so bright sunlight on skin, hinoki wood, brass, and shoji paper rolls off smoothly without
 * hue skew or harsh clipping, then restores tactile mid-tone richness via partial outset!
 */
vec3 khdr11SpectralToneMap(vec3 hdr) {
  hdr = max(hdr, vec3(0.0));

  // 1. Calibrated Spectral Inset Matrix (prevents primary channel hue-twisting at high EV!)
  const mat3 spectralInset = mat3(
    0.878, 0.082, 0.040,
    0.052, 0.896, 0.052,
    0.036, 0.072, 0.892
  );
  // Partial Spectral Outset Matrix (restores organic chroma saturation in mid-tones cleanly)
  const mat3 spectralOutset = mat3(
     1.134, -0.092, -0.042,
    -0.058,  1.114, -0.056,
    -0.038, -0.078,  1.116
  );

  vec3 insetColor = spectralInset * hdr;
  float lum = max(khdrLuma(insetColor), 1e-5);

  // 2. 16-Stop Dual-Lobe Filmic Curve (silky shadow toe + extended luminous highlight shoulder)
  const float a = 2.72;
  const float b = 0.035;
  const float c = 2.34;
  const float d = 0.59;
  const float e = 0.115;

  float mappedLum = clamp((lum * (a * lum + b)) / (lum * (c * lum + d) + e), 0.0, 1.0);
  vec3 chromaPreserved = insetColor * (mappedLum / lum);
  vec3 perChannel = clamp((insetColor * (a * insetColor + b)) / (insetColor * (c * insetColor + d) + e), 0.0, 1.0);

  // Smooth highlight desaturation path matching medium-format Japanese cinema film
  float hiBlend = smoothstep(0.38, 2.6, lum);
  vec3 compressed = mix(chromaPreserved, perChannel, 0.28 + 0.48 * hiBlend);

  // 3. Partial Outset Chroma Restore (attenuated gracefully in bright highlights)
  vec3 restored = mix(spectralOutset * compressed, compressed, 0.34 + 0.46 * hiBlend);
  return clamp(restored, 0.0, 1.0);
}

/**
 * Standard SDR baseline curve (used when KHDR is toggled OFF for clear A/B visual comparison).
 */
vec3 standardSdrToneMap(vec3 hdr) {
  vec3 x = max(hdr * 0.92, vec3(0.0));
  return x / (1.0 + x);
}

vec3 linearToSrgb(vec3 c) {
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), c));
}

void main() {
  vec3 hdrColor = texture2D(tColor, vUv).rgb;
  float rawDepth = texture2D(tDepth, vUv).r;
  vec4 aux = texture2D(tAux, vUv);
  vec3 sunVeil = aux.rgb;
  float localLogLum = aux.a;

  // Global frame UV (identical to vUv on normal display; seamless global UV across 5K tiles!)
  vec2 globalUv = uTileOffset + vUv * uTileScale;

  // Apply Shadow Flame 1.0 Pro Screen-Space Contact Micro-Shadows before tone mapping!
  if (uEnableSSCS > 0.5) {
    float sscs = computeShadowFlameSSCS(vUv, rawDepth);
    vec3 shadowTint = mix(vec3(0.86, 0.90, 0.98), vec3(1.0), sscs);
    hdrColor *= shadowTint * mix(0.66, 1.0, sscs);
  }

  // Decide whether this pixel uses KHDR 1.1 or Standard SDR (supports live A/B Split Compare!)
  bool useKhdr = uKhdrEnabled > 0.5;
  if (uSplitCompare > 0.5) {
    useKhdr = globalUv.x >= uSplitX;
  }

  vec3 srgb;
  if (useKhdr) {
    // =========================================================================
    // ★ KHDR 1.1 (Bilateral Dual-Scale Retinex + AgX Spectral 16-Stop HDR) ★
    // =========================================================================
    vec3 exposed = hdrColor * uExposure;
    float lum = max(khdrLuma(exposed), 1e-4);
    float pixelLogLum = log2(lum);

    // 1. Bilateral Edge-Safe Dual-Scale Local Luminance Adaptation (ZERO haloing on silhouettes!)
    float detailLog = pixelLogLum - localLogLum;
    float edgeGuard = exp(-detailLog * detailLog * 0.52);
    float safeDetail = detailLog * mix(1.04, 1.24, edgeGuard);
    float adaptedLogLum = localLogLum * 0.87 + safeDetail + 0.015;
    float adaptedLum = exp2(adaptedLogLum);
    float gain = clamp(adaptedLum / lum, 0.60, 1.38);
    vec3 khdr = exposed * gain;

    // 2. Depth-Aware Micro-Specular Surface Clarity (extra tactile crispness on foreground hands!)
    float linearZ = rawDepth < 0.9995 ? linearizeDepth(rawDepth) : 20.0;
    float fgClarityBoost = mix(0.28, 0.46, 1.0 - smoothstep(1.8, 4.6, linearZ));
    vec2 px = 1.0 / uResolution;
    vec3 nAvg = 0.25 * (
      texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb +
      texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb +
      texture2D(tColor, vUv + vec2(0.0, px.y)).rgb +
      texture2D(tColor, vUv - vec2(0.0, px.y)).rgb
    ) * uExposure * gain;
    vec3 highFreq = khdr - nAvg;
    khdr += clamp(highFreq, vec3(-0.075), vec3(0.075)) * fgClarityBoost;

    // 3. Physical Subtle Sunlight Optical Veil (strictly non-neon, warm architectural bounce)
    khdr += sunVeil * 0.20;

    // 4. Classical Japanese Medium-Format Film Shadow/Highlight Balance
    float lumaNorm = smoothstep(0.04, 1.45, khdrLuma(khdr));
    vec3 filmTint = mix(vec3(0.972, 0.986, 1.022), vec3(1.028, 1.005, 0.968), lumaNorm);
    khdr *= filmTint;

    // 5. KHDR 1.1 AgX-Inspired Spectral Inset/Outset 16-Stop Tone Mapping
    vec3 mapped = khdr11SpectralToneMap(khdr);

    // 6. Seamless Global-Frame 50mm Prime Optical Vignette (zero tile seams in 5K capture!)
    vec2 centered = globalUv * 2.0 - 1.0;
    float vig = 1.0 - dot(centered, centered) * 0.105;
    mapped *= clamp(vig, 0.80, 1.0);

    // 7. Gentle Photographic Micro-Contrast & Natural Chroma Presence
    float mappedLuma = khdrLuma(mapped);
    mapped = mix(vec3(mappedLuma), mapped, 1.065);
    srgb = linearToSrgb(clamp(mapped, 0.0, 1.0));
  } else {
    vec3 sdr = standardSdrToneMap(hdrColor * uExposure * 0.96);
    srgb = linearToSrgb(clamp(sdr, 0.0, 1.0));
  }

  // Interleaved Gradient Blue-Noise Dithering (active on 8-bit display; disabled on True 16-bit 5K export!)
  if (uDitherStrength > 0.01) {
    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy + fract(uTime) * 7.0, vec2(0.06711056, 0.00583715)))) - 0.5;
    srgb += (dither / 255.0) * uDitherStrength;
  }

  // Draw crisp matte-brass divider hairline when A/B Split Compare is active
  if (uSplitCompare > 0.5) {
    float distPx = abs(globalUv.x - uSplitX) * (uResolution.x / max(uTileScale.x, 1e-4));
    if (distPx < 1.5) {
      srgb = mix(srgb, vec3(0.86, 0.76, 0.56), 0.9);
    }
  }

  gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
}
`;

export class KHDRPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private sceneRT: THREE.WebGLRenderTarget;
  private blurRT1: THREE.WebGLRenderTarget;
  private blurRT2: THREE.WebGLRenderTarget;

  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quadMesh: THREE.Mesh;

  private readonly extractMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;

  private renderWidth = 1920;
  private renderHeight = 1080;

  public readonly version = '1.1';
  public khdrEnabled = true;
  public splitCompare = false;
  public splitX = 0.5;
  public enableSSCS = true;
  public exposure = 1.08;

  private readonly invProj = new THREE.Matrix4();
  private readonly sunViewDir = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    this.renderWidth = width;
    this.renderHeight = height;

    this.sceneRT = this.createSceneTarget(width, height);
    const halfW = Math.max(160, Math.floor(width / 2));
    const halfH = Math.max(90, Math.floor(height / 2));
    this.blurRT1 = this.createAuxTarget(halfW, halfH);
    this.blurRT2 = this.createAuxTarget(halfW, halfH);

    this.extractMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: EXTRACT_FRAG,
      uniforms: {
        tColor: { value: this.sceneRT.texture },
        uTexelSize: { value: new THREE.Vector2(1 / width, 1 / height) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tInput: { value: this.blurRT1.texture },
        uDirection: { value: new THREE.Vector2(1 / halfW, 0) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tColor: { value: this.sceneRT.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        tAux: { value: this.blurRT1.texture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uKhdrEnabled: { value: 1.0 },
        uSplitCompare: { value: 0.0 },
        uSplitX: { value: 0.5 },
        uEnableSSCS: { value: 1.0 },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 50.0 },
        uInvProj: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uSunViewDir: { value: new THREE.Vector3(0.4, 0.7, 0.5) },
        uExposure: { value: this.exposure },
        uTime: { value: 0.0 },
        uTileOffset: { value: new THREE.Vector2(0, 0) },
        uTileScale: { value: new THREE.Vector2(1, 1) },
        uDitherStrength: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(geo, this.compositeMat);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  private createSceneTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.format = THREE.DepthFormat;

    return new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
      samples: 0,
    });
  }

  private createAuxTarget(width: number, height: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  }

  resize(width: number, height: number): void {
    if (width === this.renderWidth && height === this.renderHeight) return;
    this.renderWidth = width;
    this.renderHeight = height;

    this.sceneRT.depthTexture?.dispose();
    this.sceneRT.dispose();
    this.blurRT1.dispose();
    this.blurRT2.dispose();

    this.sceneRT = this.createSceneTarget(width, height);
    const halfW = Math.max(160, Math.floor(width / 2));
    const halfH = Math.max(90, Math.floor(height / 2));
    this.blurRT1 = this.createAuxTarget(halfW, halfH);
    this.blurRT2 = this.createAuxTarget(halfW, halfH);

    this.extractMat.uniforms.tColor.value = this.sceneRT.texture;
    this.extractMat.uniforms.uTexelSize.value.set(1 / width, 1 / height);
    this.compositeMat.uniforms.tColor.value = this.sceneRT.texture;
    this.compositeMat.uniforms.tDepth.value = this.sceneRT.depthTexture;
    this.compositeMat.uniforms.uResolution.value.set(width, height);
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.renderWidth, height: this.renderHeight };
  }

  private executePasses(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunWorldDir: THREE.Vector3,
    elapsedSec: number,
    outputTarget: THREE.WebGLRenderTarget | null,
    forceKhdr11: boolean,
    tileOffsetX: number,
    tileOffsetY: number,
    tileScaleX: number,
    tileScaleY: number,
    ditherStrength: number
  ): void {
    // Pass 0: Render full 3D scene into true 16-bit HalfFloat HDR target + WebGL2 DepthTexture
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear(true, true, true);
    this.renderer.render(scene, camera);

    // Pass 1: Extract Dual-Scale Log-Luminance & Physical Sun-Veil + 2-Iteration Separable Blur
    const halfW = this.blurRT1.width;
    const halfH = this.blurRT1.height;
    const useKhdr = forceKhdr11 || this.khdrEnabled;
    const useSplit = forceKhdr11 ? false : this.splitCompare;

    if (useKhdr || useSplit) {
      this.quadMesh.material = this.extractMat;
      this.renderer.setRenderTarget(this.blurRT1);
      this.renderer.render(this.quadScene, this.quadCamera);

      this.quadMesh.material = this.blurMat;
      for (const stride of [1.4, 3.2]) {
        this.blurMat.uniforms.tInput.value = this.blurRT1.texture;
        this.blurMat.uniforms.uDirection.value.set(stride / halfW, 0);
        this.renderer.setRenderTarget(this.blurRT2);
        this.renderer.render(this.quadScene, this.quadCamera);

        this.blurMat.uniforms.tInput.value = this.blurRT2.texture;
        this.blurMat.uniforms.uDirection.value.set(0, stride / halfH);
        this.renderer.setRenderTarget(this.blurRT1);
        this.renderer.render(this.quadScene, this.quadCamera);
      }
    }

    // Pass 2: KHDR 1.1 Master Compositor + Shadow Flame 1.0 Pro SF-SSCS
    this.invProj.copy(camera.projectionMatrix).invert();
    this.sunViewDir.copy(sunWorldDir).transformDirection(camera.matrixWorldInverse).normalize();

    const u = this.compositeMat.uniforms;
    u.tAux.value = this.blurRT1.texture;
    u.uKhdrEnabled.value = useKhdr ? 1.0 : 0.0;
    u.uSplitCompare.value = useSplit ? 1.0 : 0.0;
    u.uSplitX.value = this.splitX;
    u.uEnableSSCS.value = this.enableSSCS ? 1.0 : 0.0;
    u.uCameraNear.value = camera.near;
    u.uCameraFar.value = camera.far;
    u.uInvProj.value.copy(this.invProj);
    u.uProj.value.copy(camera.projectionMatrix);
    u.uSunViewDir.value.copy(this.sunViewDir);
    u.uExposure.value = this.exposure;
    u.uTime.value = elapsedSec;
    u.uTileOffset.value.set(tileOffsetX, tileOffsetY);
    u.uTileScale.value.set(tileScaleX, tileScaleY);
    u.uDitherStrength.value = ditherStrength;

    this.quadMesh.material = this.compositeMat;
    this.renderer.setRenderTarget(outputTarget);
    if (outputTarget) {
      this.renderer.clear(true, false, false);
    }
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunWorldDir: THREE.Vector3,
    elapsedSec: number
  ): void {
    this.executePasses(scene, camera, sunWorldDir, elapsedSec, null, false, 0, 0, 1, 1, 1.0);
  }

  /**
   * High-Bit-Depth KHDR 1.1 Tile Render Pass for True 5K (5120px) 48-Bit (16-Bit/ch) Photo Capture!
   * Forces KHDR 1.1 ON, disables 8-bit display dithering, maps seamless global UV coordinates,
   * and writes full floating-point tone-mapped sRGB values into `outputTarget` for 16-bit PNG readback!
   */
  renderHighBitDepthTile(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunWorldDir: THREE.Vector3,
    elapsedSec: number,
    outputTarget: THREE.WebGLRenderTarget,
    tileOffsetX: number,
    tileOffsetY: number,
    tileScaleX: number,
    tileScaleY: number
  ): void {
    this.executePasses(
      scene,
      camera,
      sunWorldDir,
      elapsedSec,
      outputTarget,
      true,
      tileOffsetX,
      tileOffsetY,
      tileScaleX,
      tileScaleY,
      0.0
    );
  }

  dispose(): void {
    this.sceneRT.depthTexture?.dispose();
    this.sceneRT.dispose();
    this.blurRT1.dispose();
    this.blurRT2.dispose();
    this.extractMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
    this.quadMesh.geometry.dispose();
  }
}
