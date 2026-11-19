/**
 * ★ JSound Engin 1.0 — Public Audio Facade ★
 * Re-exports the proprietary 8-module physical-modeling & 3D spatial acoustic engine.
 */
export { JSoundEngine, JSoundEngine as SoundEngine } from '../engine/jsound/JSoundEngine';
export type {
  JSoundQualityMode,
  JSoundSettings,
  JSoundTelemetry,
} from '../engine/jsound/types';
