/**
 * ★ JSound Engin 1.5 — Public Audio Facade ★
 * Re-exports the flagship 16ch 3OA Ambisonics (4D Audio X), 2D Kirchhoff-Love/von Kármán FDTD,
 * Real-Time Quantum AudioWorklet (8ch Hadamard Unitary FDN + 13-String Sympathetic Bank + 4×OS True-Peak
 * + ITU-R BS.1770-4 LUFS), 768kHz 16×OS 63-Tap (-134 dB), 44-instrument, 70-material & 520-Ray 3OA engine.
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
