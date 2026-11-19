/**
 * ★ JSound Engin 1.1 — Living Procedural Stage Ambience & 3D World Soundscape Actors ★
 *
 * Upgraded v1.1 Multi-Layered Stereo Room Beds (`5.6s` equal-power circular crossfaded loops)
 * PLUS Living Non-Repeating 3D Spatial Soundscape Micro-Actor Specifications for all 5 stages:
 *  - zashiki : Sunlit tatami stillness + shoji paper breeze + garden Shishi-odoshi & Edo Furin!
 *  - salon   : Grand marble room air bloom + distant antique pendulum clock tick-tock!
 *  - shrine  : Open cedar canopy wind gusts + Kagura-Suzu eave shimmer + gentle cedar creak!
 *  - onsen   : 3-layer limestone waterfall + thermal steam hiss + 3D spatial stalactite droplets!
 *  - atelier : Warm brick vault room presence + hearth charcoal crackle + watchmaker chronometer!
 */

import { StageId } from '../../graphics/GraphicsConfig';
import { createSeededRng } from './ModalSynthesizer';
import { Vec3 } from './types';

export type SoundscapeActorKind =
  | 'shishi_odoshi'
  | 'furin'
  | 'pendulum_clock'
  | 'suzu_breeze'
  | 'cedar_creak'
  | 'water_droplet'
  | 'hearth_pop'
  | 'chronometer_tick'
  | 'distant_mokugyo'
  | 'distant_shamisen'
  | 'distant_shinobue';

export interface StageSoundscapeSpec {
  minIntervalSec: number;
  maxIntervalSec: number;
  actors: Array<{
    kind: SoundscapeActorKind;
    weight: number;
    gain: number;
    pos: Vec3;
    posJitter: Vec3;
    labelJp: string;
  }>;
}

export const STAGE_SOUNDSCAPE_SPECS: Record<StageId, StageSoundscapeSpec> = {
  zashiki: {
    minIntervalSec: 4.4,
    maxIntervalSec: 8.6,
    actors: [
      {
        kind: 'shishi_odoshi',
        weight: 0.42,
        gain: 0.14,
        pos: { x: -3.4, y: 0.35, z: -2.5 },
        posJitter: { x: 0.4, y: 0.1, z: 0.3 },
        labelJp: '庭・鹿威し',
      },
      {
        kind: 'furin',
        weight: 0.42,
        gain: 0.085,
        pos: { x: 2.8, y: 2.05, z: -1.6 },
        posJitter: { x: 0.35, y: 0.18, z: 0.25 },
        labelJp: '縁側・江戸風鈴',
      },
      {
        kind: 'distant_shamisen',
        weight: 0.16,
        gain: 0.055,
        pos: { x: -4.2, y: 1.1, z: -3.6 },
        posJitter: { x: 0.5, y: 0.2, z: 0.4 },
        labelJp: '遠音・三味線一撥',
      },
    ],
  },
  salon: {
    minIntervalSec: 2.2,
    maxIntervalSec: 4.0,
    actors: [
      {
        kind: 'pendulum_clock',
        weight: 0.86,
        gain: 0.095,
        pos: { x: 3.6, y: 1.55, z: -3.4 },
        posJitter: { x: 0.1, y: 0.05, z: 0.1 },
        labelJp: '大広間・振子時計',
      },
      {
        kind: 'furin',
        weight: 0.14,
        gain: 0.048,
        pos: { x: -3.4, y: 2.4, z: -2.8 },
        posJitter: { x: 0.3, y: 0.2, z: 0.3 },
        labelJp: '窓辺・硝子響',
      },
    ],
  },
  shrine: {
    minIntervalSec: 3.8,
    maxIntervalSec: 7.8,
    actors: [
      {
        kind: 'suzu_breeze',
        weight: 0.38,
        gain: 0.09,
        pos: { x: 0.4, y: 2.35, z: -2.8 },
        posJitter: { x: 1.2, y: 0.25, z: 0.6 },
        labelJp: '拝殿・神楽鈴風',
      },
      {
        kind: 'cedar_creak',
        weight: 0.32,
        gain: 0.11,
        pos: { x: -2.6, y: 1.7, z: -1.8 },
        posJitter: { x: 0.8, y: 0.3, z: 0.8 },
        labelJp: '檜軒・木鳴り',
      },
      {
        kind: 'distant_mokugyo',
        weight: 0.18,
        gain: 0.075,
        pos: { x: 3.8, y: 0.9, z: -3.8 },
        posJitter: { x: 0.4, y: 0.15, z: 0.5 },
        labelJp: '奥院・木魚',
      },
      {
        kind: 'distant_shinobue',
        weight: 0.12,
        gain: 0.05,
        pos: { x: -4.0, y: 2.1, z: -4.2 },
        posJitter: { x: 0.8, y: 0.3, z: 0.6 },
        labelJp: '遠境・篠笛',
      },
    ],
  },
  onsen: {
    minIntervalSec: 1.1,
    maxIntervalSec: 2.6,
    actors: [
      {
        kind: 'water_droplet',
        weight: 0.82,
        gain: 0.18,
        pos: { x: 0.0, y: 0.6, z: -1.4 },
        posJitter: { x: 2.6, y: 0.9, z: 1.8 },
        labelJp: '岩窟・雫滴音',
      },
      {
        kind: 'shishi_odoshi',
        weight: 0.18,
        gain: 0.12,
        pos: { x: 3.1, y: 0.45, z: -2.4 },
        posJitter: { x: 0.4, y: 0.1, z: 0.3 },
        labelJp: '露天・竹鹿威し',
      },
    ],
  },
  atelier: {
    minIntervalSec: 2.3,
    maxIntervalSec: 5.2,
    actors: [
      {
        kind: 'hearth_pop',
        weight: 0.54,
        gain: 0.13,
        pos: { x: -2.8, y: 0.45, z: -2.1 },
        posJitter: { x: 0.4, y: 0.15, z: 0.3 },
        labelJp: '暖炉・備長炭爆ぜ',
      },
      {
        kind: 'chronometer_tick',
        weight: 0.46,
        gain: 0.085,
        pos: { x: 2.2, y: 0.8, z: -1.6 },
        posJitter: { x: 0.2, y: 0.1, z: 0.2 },
        labelJp: '書斎・精密時計',
      },
    ],
  },
};

/**
 * Generate a seamlessly loopable (equal-power circular crossfaded) stereo room-tone buffer.
 */
export function generateStageAmbienceBuffer(
  stageId: StageId,
  sampleRate: number,
  durationSec = 5.6
): { left: Float32Array; right: Float32Array } {
  const n = Math.floor(sampleRate * durationSec);
  const fadeN = Math.floor(sampleRate * 0.52);
  const total = n + fadeN;

  const rawL = new Float32Array(total);
  const rawR = new Float32Array(total);

  const seed =
    stageId === 'zashiki'
      ? 11011
      : stageId === 'salon'
      ? 22022
      : stageId === 'shrine'
      ? 33033
      : stageId === 'onsen'
      ? 44044
      : 55055;
  const rng = createSeededRng(seed);

  let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
  let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;
  let lpL = 0, lpR = 0, lp2L = 0, lp2R = 0, lp3L = 0, lp3R = 0;

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
  const loopOmega = twoPi / durationSec;

  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const pL = nextPinkL();
    const pR = nextPinkR();

    if (stageId === 'onsen') {
      // 3-Layer Limestone Waterfall (Deep Plunge + Mid Stream + Thermal Steam Mist!)
      const swellL = 0.84 + 0.16 * Math.sin(loopOmega * t + 0.4) * Math.cos(loopOmega * t * 2);
      const swellR = 0.84 + 0.16 * Math.sin(loopOmega * t + 1.8) * Math.cos(loopOmega * t * 3);
      lpL += (pL - lpL) * 0.095;
      lpR += (pR - lpR) * 0.095;
      lp2L += (pL - lp2L) * 0.016;
      lp2R += (pR - lp2R) * 0.016;
      lp3L += (pL - lp3L) * 0.34;
      lp3R += (pR - lp3R) * 0.34;
      const foamL = (lp3L - lpL) * 0.32;
      const foamR = (lp3R - lpR) * 0.32;
      const steamL = (pL - lp3L) * 0.14;
      const steamR = (pR - lp3R) * 0.14;
      rawL[i] = (lpL * 0.85 + lp2L * 0.65 + foamL + steamL) * swellL;
      rawR[i] = (lpR * 0.85 + lp2R * 0.65 + foamR + steamR) * swellR;
    } else if (stageId === 'shrine') {
      // Open Cedar Courtyard Breeze + Distant Pine Canopy Whisper
      const gust = 0.56 + 0.44 * Math.sin(loopOmega * t + 0.3) * Math.sin(loopOmega * t * 2 + 0.7);
      lpL += (pL - lpL) * 0.062;
      lpR += (pR - lpR) * 0.062;
      const leafL = (pL - lpL) * 0.26 * gust;
      const leafR = (pR - lpR) * 0.26 * gust;
      rawL[i] = lpL * 0.56 + leafL;
      rawR[i] = lpR * 0.56 + leafR;
    } else if (stageId === 'salon') {
      // Grand Marble Room Air Presence (silky warm acoustic depth)
      lpL += (pL - lpL) * 0.032;
      lpR += (pR - lpR) * 0.032;
      const breath = 0.9 + 0.1 * Math.sin(loopOmega * t);
      rawL[i] = lpL * 0.74 * breath;
      rawR[i] = lpR * 0.74 * breath;
    } else if (stageId === 'atelier') {
      // Warm Vaulted Brick Studio + Gentle Hearth Draft Hum
      lpL += (pL - lpL) * 0.048;
      lpR += (pR - lpR) * 0.048;
      lp2L += (pL - lp2L) * 0.012;
      lp2R += (pR - lp2R) * 0.012;
      const draft = 0.84 + 0.16 * Math.sin(loopOmega * t * 2 + 0.6);
      rawL[i] = (lpL * 0.55 + lp2L * 0.5) * draft;
      rawR[i] = (lpR * 0.55 + lp2R * 0.5) * draft;
    } else {
      // Zashiki sunlit shoji breeze
      lpL += (pL - lpL) * 0.042;
      lpR += (pR - lpR) * 0.042;
      const breeze = 0.8 + 0.2 * Math.sin(loopOmega * t);
      rawL[i] = lpL * 0.68 * breeze;
      rawR[i] = lpR * 0.68 * breeze;
    }
  }

  // Embed soft background bubble texture into Onsen bed (in addition to live 3D HRTF droplets!)
  if (stageId === 'onsen') {
    const dropCount = 14;
    for (let d = 0; d < dropCount; d++) {
      const start = Math.floor((0.18 + rng() * (durationSec - 0.4)) * sampleRate);
      const baseF = 850 + rng() * 1450;
      const dropLen = Math.floor(sampleRate * 0.032);
      const pan = rng();
      const gL = Math.cos(pan * Math.PI * 0.5) * 0.12;
      const gR = Math.sin(pan * Math.PI * 0.5) * 0.12;
      let ph = 0;
      for (let k = 0; k < dropLen && start + k < total; k++) {
        const u = k / dropLen;
        const f = baseF * (1 + u * 0.58);
        ph += (twoPi * f) / sampleRate;
        const env = Math.sin(Math.PI * u) * Math.exp(-u * 3.2);
        const v = Math.sin(ph) * env;
        rawL[start + k] += v * gL;
        rawR[start + k] += v * gR;
      }
    }
  }

  // Equal-power circular crossfade overlap for 100% click-free infinite loop
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
