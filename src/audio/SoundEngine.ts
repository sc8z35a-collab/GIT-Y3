/**
 * ★ JSound Engin 1.3 — Public Audio Facade ★
 * Re-exports the proprietary 384kHz 8×OS, 26-instrument, 43-material, 230-ray 3D Spatial & LRU-Cached engine.
 */
export { JSoundEngine, JSoundEngine as SoundEngine } from '../engine/jsound/JSoundEngine';
export type {
  AuditionInstrumentId,
  JSoundQualityMode,
  JSoundSettings,
  JSoundSpatialMode,
  JSoundTelemetry,
} from '../engine/jsound/types';
