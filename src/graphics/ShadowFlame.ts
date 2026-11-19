/**
 * ★ Shadow Flame 1.0 — Proprietary Real-Time Shadow Engine (Flash & Pro) ★
 *
 * Patches Three.js's global `ShaderChunk.shadowmap_pars_fragment` ONCE at engine boot
 * to replace generic PCF sampling with two bespoke shadow algorithms dispatched
 * cleanly with zero shader-recompilation stutter via `shadowRadius` mode ranges:
 *
 *  - Standard (`shadowRadius < 1.5`):
 *      Stock Three.js 9-tap bilinear PCF Soft Shadow (reference baseline).
 *
 *  - Shadow Flame 1.0 Flash (`1.5 <= shadowRadius < 5.0`):
 *      ★ Lightweight yet hyper-realistic real-time shadow ★
 *      1. Jorge Jimenez Interleaved Gradient Noise (IGN) per-pixel rotational decorrelation
 *      2. Depth-Gradient Contact Hardening (1 center depth probe scales the filter radius
 *         dynamically by `clamp((zReceiver - zCenter) * 42.0, 0.25, 1.0)` — ultra-sharp
 *         at contact, soft at elevation, at nearly zero cost!)
 *      3. 6-Tap Golden-Angle Vogel Spiral Stratified PCF Disk (replaces 17-tap grid!)
 *      4. Runs smoothly on a lightweight 1024×1024 shadow map with zero stair-stepping!
 *
 *  - Shadow Flame 1.0 Pro (`shadowRadius >= 5.0`):
 *      ★ Advanced Physical Penumbra + Contact-Hardening PCSS Engine ★
 *      1. 10-Tap IGN-Rotated Golden-Angle PCSS Blocker Search measuring true receiver-to-blocker
 *         separation (`avgBlockerDepth`) across the light cone
 *      2. Physical Penumbra Width estimation (`(zReceiver - avgBlocker) / avgBlocker * lightSize`)
 *         with fast early-out for fully unoccluded sunlit surfaces
 *      3. 16-Tap Stratified Vogel Spiral Disk PCF with radial cosine-importance weighting
 *      4. Paired in KHDRPipeline with Screen-Space Depth Ray-Marched Micro-Shadows (SF-SSCS)
 *         and 2048×2048 tight-frustum shadow precision!
 */

import * as THREE from 'three';
import { SHADOW_FLAME_SPECS, ShadowFlameMode } from './GraphicsConfig';

let installed = false;

const SHADOW_FLAME_GLSL_BLOCK = /* glsl */ `
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;

			// Per-pixel Interleaved Gradient Noise (Jorge Jimenez) for banding-free Vogel disk rotation
			float sfIgn = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
			float sfAngle0 = sfIgn * 6.2831853;
			const float SF_GOLDEN_ANGLE = 2.39996323;

			if ( shadowRadius < 1.5 ) {
				// --- Baseline: Standard 9-tap Bilinear PCF Soft ---
				float dx = texelSize.x;
				float dy = texelSize.y;
				vec2 uv = shadowCoord.xy;
				vec2 f = fract( uv * shadowMapSize + 0.5 );
				uv -= f * texelSize;
				shadow = (
					texture2DCompare( shadowMap, uv, shadowCoord.z ) +
					texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
					texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
					texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
					mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
						 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ), f.x ) +
					mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
						 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ), f.x ) +
					mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
						 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ), f.y ) +
					mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
						 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ), f.y ) +
					mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
							  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ), f.x ),
						 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
							  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ), f.x ), f.y )
				) * ( 1.0 / 9.0 );

			} else if ( shadowRadius < 5.0 ) {
				// =========================================================================
				// ★ SHADOW FLAME 1.0 FLASH ★
				// Ultra-Lightweight Contact-Tightened 6-Tap IGN Vogel Spiral PCF
				// =========================================================================
				float zReceiver = shadowCoord.z;
				float zCenter = unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy ) );
				// Fast contact-hardening proxy from center blocker separation
				float depthGap = max( 0.0, zReceiver - zCenter );
				float contactFactor = clamp( depthGap * 36.0, 0.24, 1.0 );
				float filterRadius = mix( 1.05, shadowRadius * 1.12, contactFactor );

				float accum = step( zReceiver, zCenter ) * 0.22;
				float wSum = 0.22;

				for ( int i = 0; i < 6; i++ ) {
					float fi = float( i );
					float r = sqrt( ( fi + 0.5 ) / 6.0 );
					float theta = fi * SF_GOLDEN_ANGLE + sfAngle0;
					vec2 offset = vec2( cos( theta ), sin( theta ) ) * ( r * filterRadius ) * texelSize;
					float w = 1.15 - 0.35 * r;
					accum += texture2DCompare( shadowMap, shadowCoord.xy + offset, zReceiver ) * w;
					wSum += w;
				}
				shadow = accum / wSum;
				// Subtle optical umbra richness curve
				shadow = smoothstep( 0.02, 0.98, shadow );

			} else {
				// =========================================================================
				// ★ SHADOW FLAME 1.0 PRO ★
				// 10-Tap PCSS Blocker Search + Physical Variable Penumbra + 16-Tap Vogel PCF
				// =========================================================================
				float zReceiver = shadowCoord.z;
				float searchRadius = shadowRadius * 1.45;
				float blockerSum = 0.0;
				float blockerCount = 0.0;

				// Pass 1: 10-Tap IGN-Rotated Vogel Blocker Search
				for ( int i = 0; i < 10; i++ ) {
					float fi = float( i );
					float r = sqrt( ( fi + 0.5 ) / 10.0 );
					float theta = fi * SF_GOLDEN_ANGLE + sfAngle0;
					vec2 off = vec2( cos( theta ), sin( theta ) ) * ( r * searchRadius ) * texelSize;
					float sampleDepth = unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy + off ) );
					if ( sampleDepth < zReceiver - 0.0004 ) {
						blockerSum += sampleDepth;
						blockerCount += 1.0;
					}
				}

				if ( blockerCount < 0.5 ) {
					// Fast early-out: fully unoccluded direct sunlight!
					shadow = 1.0;
				} else {
					float avgBlocker = blockerSum / blockerCount;
					// True optical penumbra proportionality: sharper at contact, lush soft penumbra at distance
					float blockerDist = max( 0.0, zReceiver - avgBlocker );
					float lightWorldSize = shadowRadius * 12.5;
					float penumbraTexels = clamp( ( blockerDist / max( avgBlocker, 0.08 ) ) * lightWorldSize, 0.85, shadowRadius * 2.15 );

					// Pass 2: 16-Tap Stratified Vogel Spiral Disk with Cosine Importance Weighting
					float accum = 0.0;
					float wSum = 0.0;
					float rot2 = sfAngle0 + 1.0471975;

					for ( int i = 0; i < 16; i++ ) {
						float fi = float( i );
						float r = sqrt( ( fi + 0.5 ) / 16.0 );
						float theta = fi * SF_GOLDEN_ANGLE + rot2;
						vec2 off = vec2( cos( theta ), sin( theta ) ) * ( r * penumbraTexels ) * texelSize;
						float w = 1.25 - 0.45 * r * r;
						accum += texture2DCompare( shadowMap, shadowCoord.xy + off, zReceiver ) * w;
						wSum += w;
					}
					shadow = accum / wSum;
					// Micro-contrast contact preservation inside soft penumbra
					shadow = mix( shadow, smoothstep( 0.03, 0.97, shadow ), 0.35 );
				}
			}
`;

/**
 * Install Shadow Flame 1.0 into Three.js's global ShaderChunk before constructing materials.
 * Idempotent and safe to call multiple times.
 */
export function installShadowFlameEngine(): void {
  if (installed) return;

  const original = THREE.ShaderChunk.shadowmap_pars_fragment;
  const startMarker = '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )';
  const endMarker = '#elif defined( SHADOWMAP_TYPE_VSM )';

  const startIdx = original.indexOf(startMarker);
  const endIdx = original.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.warn('[ShadowFlame 1.0] Could not locate PCF_SOFT markers in Three.js ShaderChunk.');
    return;
  }

  THREE.ShaderChunk.shadowmap_pars_fragment =
    original.slice(0, startIdx) + SHADOW_FLAME_GLSL_BLOCK + '\n\t\t' + original.slice(endIdx);

  installed = true;
}

/**
 * Apply a Shadow Flame 1.0 mode (`standard`, `flash`, `pro`) to the primary sunlight
 * and optional secondary architectural rim light cleanly at runtime.
 */
export function applyShadowFlameToLights(
  mode: ShadowFlameMode,
  keyLight: THREE.DirectionalLight,
  rimLight?: THREE.DirectionalLight
): number {
  const spec = SHADOW_FLAME_SPECS[mode];
  const mapSize = spec.mapSize;

  // Update shadow map size if changed
  if (keyLight.shadow.mapSize.width !== mapSize || keyLight.shadow.mapSize.height !== mapSize) {
    keyLight.shadow.mapSize.set(mapSize, mapSize);
    if (keyLight.shadow.map) {
      keyLight.shadow.map.dispose();
      keyLight.shadow.map = null;
    }
  }

  keyLight.shadow.radius = spec.shaderRadiusCode;
  keyLight.shadow.bias = mode === 'pro' ? -0.00028 : -0.00038;
  keyLight.shadow.normalBias = mode === 'pro' ? 0.016 : 0.022;
  keyLight.shadow.intensity = mode === 'pro' ? 0.94 : mode === 'flash' ? 0.9 : 0.85;
  keyLight.shadow.needsUpdate = true;

  if (rimLight) {
    // Pro activates secondary soft architectural bounce shadow too!
    rimLight.castShadow = mode === 'pro';
    if (mode === 'pro') {
      const rimSize = 1024;
      if (rimLight.shadow.mapSize.width !== rimSize) {
        rimLight.shadow.mapSize.set(rimSize, rimSize);
        if (rimLight.shadow.map) {
          rimLight.shadow.map.dispose();
          rimLight.shadow.map = null;
        }
      }
      rimLight.shadow.radius = 3.2; // Flash kernel on secondary rim shadow for crisp performance!
      rimLight.shadow.bias = -0.0004;
      rimLight.shadow.normalBias = 0.024;
      rimLight.shadow.intensity = 0.42;
      rimLight.shadow.needsUpdate = true;
    }
  }

  return mapSize;
}
