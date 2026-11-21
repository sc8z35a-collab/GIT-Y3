/**
 * ★ JSound Engin 1.6 — Zero-Jank Predictive Render Farm (browser side) ★
 *
 * A small pool of Web Workers renders `RenderJob`s. Results are kept in a bounded ready-pool keyed
 * by the job's seed-less cache key, so the reveal frame only has to copy PCM into an AudioBuffer.
 *   - `request(key, job)`  : render now (deduplicated while in flight)
 *   - `take(key)`          : consume a ready result (or null)
 *   - `inflight(key)`      : promise for a result still being rendered
 * If workers are unavailable (very old browsers, CSP), `available` is false and the engine falls
 * back to main-thread synthesis guarded by the budget governor.
 */

import { RenderJob, RenderedAudio, SynthesisBudgetGovernor } from './RenderFarm16';

interface WorkerReply {
  id: number;
  ok: boolean;
  left?: Float32Array;
  right?: Float32Array | null;
  ms?: number;
  quality?: RenderJob['quality'];
  error?: string;
}

interface PendingJob {
  key: string;
  resolve: (r: RenderedAudio) => void;
  reject: (e: Error) => void;
  worker: number;
}

interface QueuedJob {
  id: number;
  key: string;
  job: RenderJob;
  resolve: (r: RenderedAudio) => void;
  reject: (e: Error) => void;
}

export type RenderPriority = 'high' | 'low';

export interface RenderFarmStats {
  workers: number;
  jobsRendered: number;
  poolHits: number;
  poolMisses: number;
  lateArrivals: number;
  avgWorkerMs: number;
  lastWorkerMs: number;
  queued: number;
}

export class JSoundRenderFarm {
  public readonly governor = new SynthesisBudgetGovernor({ budgetMs: 260 });
  private workers: Worker[] = [];
  private load: number[] = [];
  private nextId = 1;
  private readonly pending = new Map<number, PendingJob>();
  /** Two-level queue: decision-time JIT jobs ('high') always overtake background pool jobs ('low'). */
  private readonly highQueue: QueuedJob[] = [];
  private readonly lowQueue: QueuedJob[] = [];
  private readonly inflightByKey = new Map<string, Promise<RenderedAudio>>();
  private readonly ready = new Map<string, RenderedAudio>();
  private readonly maxReady: number;
  private stats: RenderFarmStats = {
    workers: 0,
    jobsRendered: 0,
    poolHits: 0,
    poolMisses: 0,
    lateArrivals: 0,
    avgWorkerMs: 0,
    lastWorkerMs: 0,
    queued: 0,
  };

  constructor(opts: { maxWorkers?: number; maxReady?: number } = {}) {
    this.maxReady = opts.maxReady ?? 72;
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    const count = Math.max(1, Math.min(opts.maxWorkers ?? 3, hc - 1));
    for (let i = 0; i < count; i++) {
      try {
        const w = new Worker(new URL('./JSoundRenderWorker.ts', import.meta.url), {
          type: 'module',
          name: `jsound16-render-${i}`,
        });
        const idx = this.workers.length;
        w.onmessage = (ev: MessageEvent<WorkerReply>) => this.onReply(idx, ev.data);
        w.onerror = () => this.failWorker(idx);
        this.workers.push(w);
        this.load.push(0);
      } catch {
        break;
      }
    }
    this.stats.workers = this.workers.length;
  }

  public get available(): boolean {
    return this.workers.length > 0;
  }

  public getStats(): RenderFarmStats {
    return { ...this.stats, queued: this.pending.size + this.highQueue.length + this.lowQueue.length };
  }

  public has(key: string): boolean {
    return this.ready.has(key) || this.inflightByKey.has(key);
  }

  /** Render (deduplicated by key). The result lands in the ready-pool when it arrives. */
  public request(key: string, job: RenderJob, priority: RenderPriority = 'high'): Promise<RenderedAudio> {
    const existing = this.inflightByKey.get(key);
    if (existing) {
      if (priority === 'high') this.promote(key);
      return existing;
    }
    if (!this.available) return Promise.reject(new Error('render farm unavailable'));

    const id = this.nextId++;
    const p = new Promise<RenderedAudio>((resolve, reject) => {
      const q: QueuedJob = { id, key, job, resolve, reject };
      if (priority === 'high') this.highQueue.push(q);
      else this.lowQueue.push(q);
    });
    this.inflightByKey.set(key, p);
    p.then(
      (r) => {
        this.inflightByKey.delete(key);
        this.store(key, r);
      },
      () => this.inflightByKey.delete(key)
    );
    this.pump();
    return p;
  }

  /** Fire-and-forget prefetch (no-op if already ready or in flight). */
  public prefetch(key: string, job: RenderJob, priority: RenderPriority = 'low'): void {
    if (this.ready.has(key) || this.inflightByKey.has(key) || !this.available) return;
    void this.request(key, job, priority).catch(() => undefined);
  }

  /** Move a queued low-priority job to the high queue (a reveal now depends on it). */
  private promote(key: string): void {
    const idx = this.lowQueue.findIndex((q) => q.key === key);
    if (idx >= 0) {
      const [q] = this.lowQueue.splice(idx, 1);
      this.highQueue.push(q);
    }
  }

  /** Keep exactly one job in flight per idle worker. */
  private pump(): void {
    for (let w = 0; w < this.workers.length; w++) {
      if (this.load[w] !== 0) continue;
      const q = this.highQueue.shift() ?? this.lowQueue.shift();
      if (!q) return;
      this.pending.set(q.id, { key: q.key, resolve: q.resolve, reject: q.reject, worker: w });
      this.load[w] = 1;
      this.workers[w].postMessage({ id: q.id, job: q.job });
    }
  }

  /** Consume a ready result. */
  public take(key: string): RenderedAudio | null {
    const r = this.ready.get(key);
    if (r) {
      this.ready.delete(key);
      this.stats.poolHits++;
      return r;
    }
    this.stats.poolMisses++;
    return null;
  }

  public inflight(key: string): Promise<RenderedAudio> | null {
    return this.inflightByKey.get(key) ?? null;
  }

  public noteLateArrival(): void {
    this.stats.lateArrivals++;
  }

  /** Drop every ready result and queued background work (e.g. after a quality/material/stage change). */
  public clearReady(): void {
    this.ready.clear();
    for (const q of this.lowQueue) q.reject(new Error('invalidated'));
    this.lowQueue.length = 0;
  }

  public dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('disposed'));
    for (const q of [...this.highQueue, ...this.lowQueue]) q.reject(new Error('disposed'));
    this.highQueue.length = 0;
    this.lowQueue.length = 0;
    this.pending.clear();
    this.inflightByKey.clear();
    this.ready.clear();
  }

  private store(key: string, r: RenderedAudio): void {
    if (this.ready.has(key)) this.ready.delete(key);
    this.ready.set(key, r);
    while (this.ready.size > this.maxReady) {
      const oldest = this.ready.keys().next().value;
      if (oldest === undefined) break;
      this.ready.delete(oldest);
    }
  }

  private onReply(workerIdx: number, msg: WorkerReply): void {
    const job = this.pending.get(msg.id);
    if (Number.isFinite(this.load[workerIdx])) this.load[workerIdx] = 0;
    if (!job) {
      this.pump();
      return;
    }
    this.pending.delete(msg.id);
    if (!msg.ok || !msg.left) {
      job.reject(new Error(msg.error ?? 'render failed'));
      this.pump();
      return;
    }
    const ms = msg.ms ?? 0;
    this.stats.jobsRendered++;
    this.stats.lastWorkerMs = Math.round(ms);
    this.stats.avgWorkerMs = this.stats.avgWorkerMs === 0 ? ms : this.stats.avgWorkerMs * 0.85 + ms * 0.15;
    if (msg.quality) this.governor.report(msg.quality, ms);
    job.resolve({ left: msg.left, right: msg.right ?? null });
    this.pump();
  }

  private failWorker(idx: number): void {
    // Reject everything that was queued on this worker; keep the others running.
    for (const [id, p] of this.pending) {
      if (p.worker === idx) {
        this.pending.delete(id);
        p.reject(new Error('worker error'));
      }
    }
    this.load[idx] = Number.POSITIVE_INFINITY;
    if (this.load.every((l) => !Number.isFinite(l))) {
      for (const w of this.workers) w.terminate();
      this.workers = [];
      this.stats.workers = 0;
      for (const q of [...this.highQueue, ...this.lowQueue]) q.reject(new Error('no workers'));
      this.highQueue.length = 0;
      this.lowQueue.length = 0;
    } else {
      this.pump();
    }
  }
}
