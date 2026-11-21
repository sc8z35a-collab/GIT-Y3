/**
 * ★ JSound Engin 1.6 — Render Farm Worker ★
 * Renders physical-model sound jobs off the main thread and transfers the PCM back (zero-copy).
 */

import { RenderJob, runRenderJob } from './RenderFarm16';

interface WorkerRequest {
  id: number;
  job: RenderJob;
}

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

/** Return a Float32Array that owns its whole ArrayBuffer (required for transfer). */
function own(a: Float32Array): Float32Array {
  if (a.byteOffset === 0 && a.buffer.byteLength === a.byteLength) return a;
  return a.slice();
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, job } = ev.data;
  const t0 = performance.now();
  try {
    const out = runRenderJob(job);
    const left = own(out.left);
    let right = out.right ? own(out.right) : null;
    if (right && right.buffer === left.buffer) right = right.slice();
    const ms = performance.now() - t0;
    const transfer: Transferable[] = [left.buffer as ArrayBuffer];
    if (right) transfer.push(right.buffer as ArrayBuffer);
    ctx.postMessage({ id, ok: true, left, right, ms, quality: job.quality }, transfer);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
