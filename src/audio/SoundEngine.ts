/**
 * ★ JSound Engin 1.2 — Public Audio Facade ★
 * Re-exports the proprietary 192kHz 4×OS 18-instrument, 32-material, 128-ray 3D Binaural acoustic engine.
 */
export { JSoundEngine, JSoundEngine as SoundEngine } from '../engine/jsound/JSoundEngine';
export type {
  AuditionInstrumentId,
  JSoundQualityMode,
  JSoundSettings,
  JSoundSpatialMode,
  JSoundTelemetry,
} from '../engine/jsound/types';
