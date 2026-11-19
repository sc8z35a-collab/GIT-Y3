/**
 * ★ JSound Engin 1.0 — Living Procedural Stage Ambience Synthesizer ★
 *
 * Synthesizes seamless, zero-loop-click stereo acoustic room beds tailored to
 * each of the 5 architectural stages:
 *  - zashiki : Sunlit tatami stillness + soft garden air breathing through shoji
 *  - salon   : Grand marble room air warmth + subtle spatial shimmer
 *  - shrine  : Open cedar canopy breeze + hushed courtyard air
 *  - onsen   : Multi-layered limestone waterfall + foamy thermal stream + water droplets
 *  - atelier : Warm vaulted brick studio presence
 */

import { StageId } from '../../graphics/GraphicsConfig';
import { createSeededRng } from './ModalSynthesizer';

/**
 * Generate a seamlessly loopable (equal-power circular crossfaded) stereo room-tone buffer.
 */
export function generateStageAmbienceBuffer(
  stageId: StageId,
  sampleRate: number,
  durationSec = 4.2
): { left: Float32Array; right: Float32Array } {
  const n = Math.floor(sampleRate * durationSec);
  const fadeN = Math.floor(sampleRate * 0.45);
  const total = n + fadeN;

  const rawL = new Float32Array(total);
  const rawR = new Float32Array(total);

  const seed =
    stageId === 'zashiki'
      ? 1101
      : stageId === 'salon'
      ? 2202
      : stageId === 'shrine'
      ? 3303
      : stageId === 'onsen'
      ? 4404
      : 5505;
  const rng = createSeededRng(seed);

  // Paul Kellet refined Pink Noise state (Left & Right decorrelated)
  let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
  let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;
  let lpL = 0, lpR = 0, lp2L = 0, lp2R = 0;

  const nextPinkL = () => {
    const w = rng() * 2 - 1;
    b0L = 0.99886 * b0L + w * 0.0555179;
    b1L = 0.99332 * b1L + w * 0.0750759;
    b2L = 0.969 * b2L + w * 0.153852;
    b3L = 0.8665 * b3L + w * 0.3104856;
    b4L = 0.55 * b4L + w * 0.5329522;
    b5L = -0.7616 * b5L - w * 0.016898;
    const out = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + w * 0.5362) * 0.06;
    b6L = w * 0.115926;
    return out;
  };
  const nextPinkR = () => {
    const w = rng() * 2 - 1;
    b0R = 0.99886 * b0R + w * 0.0555179;
    b1R = 0.99332 * b1R + w * 0.0750759;
    b2R = 0.969 * b2R + w * 0.153852;
    b3R = 0.8665 * b3R + w * 0.3104856;
    b4R = 0.55 * b4R + w * 0.5329522;
    b5R = -0.7616 * b5R - w * 0.016898;
    const out = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + w * 0.5362) * 0.06;
    b6R = w * 0.115926;
    return out;
  };

  const twoPi = Math.PI * 2;
  const loopOmega = twoPi / durationSec; // Exact integer harmonics keep modulation seamless!

  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const pL = nextPinkL();
    const pR = nextPinkR();

    if (stageId === 'onsen') {
      // Multi-band Limestone Waterfall + Thermal Stream Foam!
      const swellL = 0.84 + 0.16 * Math.sin(loopOmega * t * 1.0 + 0.4) * Math.cos(loopOmega * t * 2.0);
      const swellR = 0.84 + 0.16 * Math.sin(loopOmega * t * 1.0 + 1.8) * Math.cos(loopOmega * t * 3.0);
      lpL += (pL - lpL) * 0.095;
      lpR += (pR - lpR) * 0.095;
      lp2L += (pL - lp2L) * 0.015;
      lp2R += (pR - lp2R) * 0.015;
      const foamL = (pL - lpL) * 0.32;
      const foamR = (pR - lpR) * 0.32;
      rawL[i] = (lpL * 0.85 + lp2L * 0.65 + foamL) * swellL;
      rawR[i] = (lpR * 0.85 + lp2R * 0.65 + foamR) * swellR;
    } else if (stageId === 'shrine') {
      // Open Cedar Courtyard Breeze
      const gust = 0.58 + 0.42 * Math.sin(loopOmega * t * 1.0 + 0.3) * Math.sin(loopOmega * t * 2.0 + 0.7);
      lpL += (pL - lpL) * 0.065;
      lpR += (pR - lpR) * 0.065;
      const leafL = (pL - lpL) * 0.24 * gust;
      const leafR = (pR - lpR) * 0.24 * gust;
      rawL[i] = lpL * 0.55 + leafL;
      rawR[i] = lpR * 0.55 + leafR;
    } else if (stageId === 'salon') {
      // Grand Marble Room Air Tone (ultra-clean low warm bloom)
      lpL += (pL - lpL) * 0.032;
      lpR += (pR - lpR) * 0.032;
      const breath = 0.9 + 0.1 * Math.sin(loopOmega * t);
      rawL[i] = lpL * 0.72 * breath;
      rawR[i] = lpR * 0.72 * breath;
    } else {
      // Zashiki / Atelier quiet warm interior air breath
      lpL += (pL - lpL) * 0.042;
      lpR += (pR - lpR) * 0.042;
      const breeze = 0.82 + 0.18 * Math.sin(loopOmega * t * 1.0);
      rawL[i] = lpL * 0.68 * breeze;
      rawR[i] = lpR * 0.68 * breeze;
    }
  }

  // Add realistic tiny water-droplet bubble pings into Onsen ambience (Minnaert bubble chirp!)
  if (stageId === 'onsen') {
    const dropCount = 14;
    for (let d = 0; d < dropCount; d++) {
      const start = Math.floor((0.15 + rng() * (durationSec - 0.35)) * sampleRate);
      const baseF = 850 + rng() * 1400;
      const dropLen = Math.floor(sampleRate * 0.032);
      const pan = rng(); // 0..1
      const gL = Math.cos(pan * Math.PI * 0.5) * 0.14;
      const gR = Math.sin(pan * Math.PI * 0.5) * 0.14;
      let ph = 0;
      for (let k = 0; k < dropLen && start + k < total; k++) {
        const u = k / dropLen;
        // Minnaert rising bubble pitch sweep!
        const f = baseF * (1 + u * 0.58);
        ph += (twoPi * f) / sampleRate;
        const env = Math.sin(Math.PI * u) * Math.exp(-u * 3.2);
        const v = Math.sin(ph) * env;
        rawL[start + k] += v * gL;
        rawR[start + k] += v * gR;
      }
    }
  }

  // Equal-power circular crossfade overlap for 100% click-free infinite loop!
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < fadeN) {
      const u = i / fadeN;
      const gIn = Math.sin(u * Math.PI * 0.5);
      const gOut = Math.cos(u * Math.PI * 0.5);
      left[i] = rawL[i] * gIn + rawL[n + i] * gOut;
      right[i] = rawR[i] * gIn + rawR[n + i] * gOut;
    } else {
      left[i] = rawL[i];
      right[i] = rawR[i];
    }
  }

  return { left, right };
}
