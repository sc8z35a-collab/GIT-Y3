/**
 * ★ JSound Engin 1.4 — Public Audio Facade ★
 * Re-exports the proprietary 4D Audio / 4D Audio MAX, 384kHz 8×OS 31-Tap (-111 dB),
 * 36-instrument, 58-material, 380-ray 4D Spatial & Real-Time Acoustic Probe engine.
 */
export { JSoundEngine, JSoundEngine as SoundEngine } from '../engine/jsound/JSoundEngine';
export { AcousticProbeEngine } from '../engine/jsound/AcousticProbeEngine';
export type { AcousticProbeSnapshot } from '../engine/jsound/AcousticProbeEngine';
export type {
  AuditionInstrumentId,
  JSoundQualityMode,
  JSoundSettings,
  JSoundSpatialMode,
  JSoundTelemetry,
} from '../engine/jsound/types';
