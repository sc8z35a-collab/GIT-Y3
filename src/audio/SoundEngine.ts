/**
 * ★ JSound Engin 1.1 — Public Audio Facade ★
 * Re-exports the proprietary 10-module 96kHz 2×OS physical-modeling & 3D spatial acoustic engine.
 */
export { JSoundEngine, JSoundEngine as SoundEngine } from '../engine/jsound/JSoundEngine';
export type {
  AuditionInstrumentId,
  JSoundQualityMode,
  JSoundSettings,
  JSoundTelemetry,
} from '../engine/jsound/types';
