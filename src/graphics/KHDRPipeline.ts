/**
 * ★ KHDR (Kinetic Dual-Lobe Spectral HDR) Multi-Pass WebGL2 Rendering Pipeline ★
 *
 * Proprietary high-dynamic-range photographic pipeline (STRICTLY ZERO NEON!).
 * Renders the 3D scene into a true 16-bit floating-point HDR framebuffer
 * (`THREE.HalfFloatType`) with an attached WebGL2 hardware `DepthTexture`, then runs:
 *
 *  Pass 1 — Half-Resolution Separable Guided / Bilateral Base-Luminance & Soft Sun-Veil Extraction
 *           (isolates broad illumination field from fine architectural wood/stone/porcelain detail,
 *            plus subtle physical lens optical veil ONLY on extreme sunlight radiance L > 1.75)
 *
 *  Pass 2 — KHDR Master Compositor + Shadow Flame 1.0 Pro Screen-Space Contact Shadow Ray-March (SF-SSCS):
 *           1. When Shadow Flame 1.0 Pro is enabled: executes a 10-step Screen-Space Depth Ray-March
 *              along the projected 3D sun vector to carve ultra-fine micro-shadows between fingers,
 *              knuckle pins, zabuton pleats, and carved table edges!
 *           2. When KHDR is ON:
 *              - Dual-Scale Local Luminance Adaptation (Retinex detail recovery in both deep
 *                shadows and sunlit highlights without flattening global depth!)
 *              - Spectral Perceptual Highlight Roll-Off (preserves warm amber/ivory/gold chroma
 *                in sunlit highlights instead of harsh white clipping!)
 *              - Warm Architectural Bounce Shadow Grading (subtle physical shadow warmth & cool sky fill)
 *              - Micro-Specular Surface Clarity (gentle unsharp detail lift in mid-tones)
 *              - Subtle Photographic Sun-Veil (real glass-lens scatter, NOT glowing neon bloom!)
 *              - Blue-Noise Interleaved Gradient Dithering (zero 8-bit banding on plaster & sky!)
 *           3. When KHDR is OFF:
 *              - Clean Standard SDR Reinhard/Gamma pass so the user can toggle KHDR ON/OFF or drag
 *                the live A/B Split-Screen Compare bar to immediately see the genuine HDR leap!
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

  // Subtle physical optical lens veil ONLY on genuine high-radiance sunlight glints (L > 1.75)
  float excess = max(0.0, lum - 1.75);
  float softKnee = excess / (excess + 1.45);
  vec3 veil = avg * (softKnee / max(lum, 1e-3)) * 0.48;

  // Store veil RGB in .rgb and log2-luminance in .a for Dual-Scale Local Adaptation!
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

// Pass 2: KHDR Master Compositor + Shadow Flame 1.0 Pro Screen-Space Ray-Marched Micro-Shadows
const COMPOSITE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tAux; // .rgb = optical sun veil, .a = blurred local log2 luminance
uniform vec2 uResolution;
uniform float uKhdrEnabled;       // 0.0 or 1.0
uniform float uSplitCompare;      // 0.0 = off, 1.0 = active A/B split curtain
uniform float uSplitX;            // 0..1 split cursor position
uniform float uEnableSSCS;        // 1.0 when Shadow Flame 1.0 Pro is active!
uniform float uCameraNear;
uniform float uCameraFar;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform vec3 uSunViewDir;         // Sun direction in Camera View Space (pointing toward sun)
uniform float uExposure;
uniform float uTime;

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
 * Marches 10 sub-pixel steps in camera view space along the sun vector to catch
 * delicate finger-to-finger, knuckle-hinge, and tabletop contact micro-shadows.
 */
float computeShadowFlameSSCS(vec2 uv) {
  float rawDepth = texture2D(tDepth, uv).r;
  if (rawDepth >= 0.9995) return 1.0; // Sky / background

  vec3 viewPos = reconstructViewPos(uv, rawDepth);
  // Only apply crisp contact micro-shadows within the near/mid tabletop arena (< 7.5m)
  float distFade = 1.0 - smoothstep(4.2, 7.8, -viewPos.z);
  if (distFade <= 0.01) return 1.0;

  // Per-pixel IGN jitter removes step banding cleanly
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  float rayLength = 0.24; // 24cm physical reach catches fingers, tokens, table bevels
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
    float rayZ = sampleView.z; // negative in view space

    // Positive delta means scene geometry is closer to camera than the shadow ray -> occluded!
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
 * Proprietary KHDR Spectral Perceptual Tone Curve.
 * Preserves natural hue & warm ivory/brass/wood chromaticity under strong HDR sun highlights
 * rather than desaturating prematurely or clipping harshly.
 */
vec3 khdrSpectralToneMap(vec3 hdr) {
  hdr = max(hdr, vec3(0.0));
  float lum = max(khdrLuma(hdr), 1e-5);

  // Perceptual shoulder with silky toe & extended 14-stop highlight latitude
  const float a = 2.65;
  const float b = 0.04;
  const float c = 2.28;
  const float d = 0.62;
  const float e = 0.12;
  float mappedLum = clamp((lum * (a * lum + b)) / (lum * (c * lum + d) + e), 0.0, 1.0);

  // Preserve chromatic ratio with graceful natural highlight desaturation (photographic film stock)
  vec3 chromaScaled = hdr * (mappedLum / lum);
  vec3 pureChannel = clamp((hdr * (a * hdr + b)) / (hdr * (c * hdr + d) + e), 0.0, 1.0);
  float highlightMix = smoothstep(0.45, 2.2, lum);
  return mix(chromaScaled, pureChannel, 0.32 + 0.42 * highlightMix);
}

/**
 * Standard SDR baseline curve (used when KHDR is toggled OFF for clear visual comparison).
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
  vec4 aux = texture2D(tAux, vUv);
  vec3 sunVeil = aux.rgb;
  float localLogLum = aux.a;

  // Apply Shadow Flame 1.0 Pro Screen-Space Contact Micro-Shadows before tone mapping!
  if (uEnableSSCS > 0.5) {
    float sscs = computeShadowFlameSSCS(vUv);
    // Warm-cool natural shadow tint: cool slight sky fill inside tight contact crevices
    vec3 shadowTint = mix(vec3(0.86, 0.90, 0.98), vec3(1.0), sscs);
    hdrColor *= shadowTint * mix(0.66, 1.0, sscs);
  }

  // Decide whether this pixel uses KHDR or Standard SDR (supports live A/B Split Compare!)
  bool useKhdr = uKhdrEnabled > 0.5;
  if (uSplitCompare > 0.5) {
    useKhdr = vUv.x >= uSplitX;
  }

  vec3 srgb;
  if (useKhdr) {
    // =========================================================================
    // ★ KHDR (Kinetic Dual-Lobe Local-Adaptation Spectral HDR) ★
    // =========================================================================
    vec3 exposed = hdrColor * uExposure;
    float lum = max(khdrLuma(exposed), 1e-4);
    float pixelLogLum = log2(lum);

    // 1. Dual-Scale Local Luminance Adaptation (Retinex separation of lighting vs material micro-detail)
    float detailLog = pixelLogLum - localLogLum;
    // Gently compress extreme broad illumination range while boosting tactile wood/stone/cloth detail!
    float adaptedLogLum = localLogLum * 0.86 + detailLog * 1.22 + 0.01;
    float adaptedLum = exp2(adaptedLogLum);
    float gain = clamp(adaptedLum / lum, 0.58, 1.42);
    vec3 khdr = exposed * gain;

    // 2. Micro-Specular Surface Clarity (edge-safe high-frequency texture crispness)
    vec2 px = 1.0 / uResolution;
    vec3 nAvg = 0.25 * (
      texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb +
      texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb +
      texture2D(tColor, vUv + vec2(0.0, px.y)).rgb +
      texture2D(tColor, vUv - vec2(0.0, px.y)).rgb
    ) * uExposure * gain;
    vec3 highFreq = khdr - nAvg;
    // Clamp high-freq to avoid ringing halos on sharp silhouettes
    khdr += clamp(highFreq, vec3(-0.08), vec3(0.08)) * 0.38;

    // 3. Physical Subtle Sunlight Optical Veil (strictly non-neon, warm architectural bounce)
    khdr += sunVeil * 0.22;

    // 4. Warm Daylight Highlight / Subtle Cool Shadow Depth Balance (classic Japanese film color science)
    float lumaNorm = smoothstep(0.04, 1.4, khdrLuma(khdr));
    vec3 filmTint = mix(vec3(0.97, 0.985, 1.025), vec3(1.03, 1.005, 0.965), lumaNorm);
    khdr *= filmTint;

    // 5. Spectral Perceptual Tone Mapping
    vec3 mapped = khdrSpectralToneMap(khdr);

    // 6. Subtle Natural Optical Vignette (physical 50mm prime lens falloff)
    vec2 centered = vUv * 2.0 - 1.0;
    float vig = 1.0 - dot(centered, centered) * 0.11;
    mapped *= clamp(vig, 0.78, 1.0);

    // 7. Gentle photographic richness (warm contrast & micro-saturation)
    float mappedLuma = khdrLuma(mapped);
    mapped = mix(vec3(mappedLuma), mapped, 1.08);
    srgb = linearToSrgb(clamp(mapped, 0.0, 1.0));
  } else {
    // Standard SDR baseline (noticeably flatter dynamic range & clipped highlights vs KHDR)
    vec3 sdr = standardSdrToneMap(hdrColor * uExposure * 0.96);
    srgb = linearToSrgb(clamp(sdr, 0.0, 1.0));
  }

  // Interleaved Gradient Blue-Noise Dithering (eliminates 8-bit sky/plaster banding)
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy + fract(uTime) * 7.0, vec2(0.06711056, 0.00583715)))) - 0.5;
  srgb += dither / 255.0;

  // Draw crisp matte-brass divider hairline when A/B Split Compare is active
  if (uSplitCompare > 0.5) {
    float distPx = abs(vUv.x - uSplitX) * uResolution.x;
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
      },
      depthTest: false,
      depthWrite: false,
    });

    // Full-screen single-triangle/quad geometry
    const geo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(geo, this.compositeMat);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  private createSceneTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.format = THREE.DepthFormat;

    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
      samples: 0, // DepthTexture requires samples=0 in WebGL2; high-res 1.5K/2K supersampling provides razor anti-aliasing!
    });
    return rt;
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

  render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sunWorldDir: THREE.Vector3,
    elapsedSec: number
  ): void {
    // Pass 0: Render full 3D scene into true 16-bit HalfFloat HDR target + WebGL2 DepthTexture
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear(true, true, true);
    this.renderer.render(scene, camera);

    // Pass 1: Extract Dual-Scale Log-Luminance & Physical Sun-Veil + 2-Iteration Separable Blur
    const halfW = this.blurRT1.width;
    const halfH = this.blurRT1.height;

    if (this.khdrEnabled || this.splitCompare) {
      this.quadMesh.material = this.extractMat;
      this.renderer.setRenderTarget(this.blurRT1);
      this.renderer.render(this.quadScene, this.quadCamera);

      // Broad Retinex illumination field (2 separable blur sweeps at increasing stride)
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

    // Pass 2: KHDR Master Compositor + Shadow Flame 1.0 Pro SF-SSCS directly to display canvas
    this.invProj.copy(camera.projectionMatrix).invert();
    this.sunViewDir.copy(sunWorldDir).transformDirection(camera.matrixWorldInverse).normalize();

    const u = this.compositeMat.uniforms;
    u.tAux.value = this.blurRT1.texture;
    u.uKhdrEnabled.value = this.khdrEnabled ? 1.0 : 0.0;
    u.uSplitCompare.value = this.splitCompare ? 1.0 : 0.0;
    u.uSplitX.value = this.splitX;
    u.uEnableSSCS.value = this.enableSSCS ? 1.0 : 0.0;
    u.uCameraNear.value = camera.near;
    u.uCameraFar.value = camera.far;
    u.uInvProj.value.copy(this.invProj);
    u.uProj.value.copy(camera.projectionMatrix);
    u.uSunViewDir.value.copy(this.sunViewDir);
    u.uExposure.value = this.exposure;
    u.uTime.value = elapsedSec;

    this.quadMesh.material = this.compositeMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
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
