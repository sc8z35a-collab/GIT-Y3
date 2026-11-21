/**
 * ★ FINGER S1.1 — HD texture streaming worker ★
 * Synthesises the 2×-resolution dermal maps off the main thread and transfers each surface back as
 * soon as it is ready (finger first, so the most-inspected surface sharpens first).
 */

import {
  S11SurfaceMaps,
  buildS11Tiles,
  synthFingerHD,
  synthMicroSkinHD,
  synthNailHD,
  synthPalmHD,
} from './FingerS11TextureSynth';

type SurfaceId = 'finger' | 'palm' | 'micro' | 'nail';

interface Request {
  surfaces: Array<{ id: SurfaceId; size: number }>;
}

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<Request>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (ev: MessageEvent<Request>) => {
  const tiles = buildS11Tiles();
  for (const s of ev.data.surfaces) {
    const t0 = performance.now();
    let maps: S11SurfaceMaps;
    if (s.id === 'finger') maps = synthFingerHD(s.size, tiles);
    else if (s.id === 'palm') maps = synthPalmHD(s.size, tiles);
    else if (s.id === 'micro') maps = synthMicroSkinHD(s.size, tiles);
    else maps = synthNailHD(s.size);
    const ms = Math.round(performance.now() - t0);
    scope.postMessage(
      { id: s.id, size: maps.size, albedoRough: maps.albedoRough, normalHeight: maps.normalHeight, ms },
      [maps.albedoRough.buffer as ArrayBuffer, maps.normalHeight.buffer as ArrayBuffer]
    );
  }
  scope.postMessage({ done: true });
};
