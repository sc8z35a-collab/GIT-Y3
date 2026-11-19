/**
 * JNV1.0 Layer 1 — Multi-Horizon Behavioral & Sequential Predictors.
 *
 * Implements 9 specialized base predictors over Player behavior + 3 Self-Mirror
 * predictors over JNV1.0's own trajectory so the Meta-Rotation stack can perform
 * deep recursive mind-reading without hard-coded heuristics.
 */

import {
  BasePrediction,
  Move,
  ProbVec,
  RoundRecord,
  counterOf,
  normalizeProb,
  normalizedEntropy,
  rotateMove,
} from './types';

function sharpnessConfidence(dist: ProbVec, support: number, scale = 4.0): number {
  const ent = normalizedEntropy(dist);
  const sharpness = Math.max(0, 1 - ent);
  const maxDev = Math.max(dist[0], dist[1], dist[2]) - 1 / 3;
  const tvSignal = Math.max(0, Math.min(1, maxDev * 2.35));
  const combined = Math.max(sharpness, tvSignal);
  const supportFactor = 1 - Math.exp(-support / scale);
  return Math.max(0, Math.min(1, combined * supportFactor));
}

function emptyCounts(prior = 0): [number, number, number] {
  return [prior, prior, prior];
}

/**
 * Generic exponentially-decayed variable-order Markov table.
 */
class DecayedContextTable {
  private readonly table = new Map<string, [number, number, number]>();
  private readonly decay: number;

  constructor(decay: number) {
    this.decay = decay;
  }

  observe(key: string, nextSymbol: Move): void {
    let counts = this.table.get(key);
    if (!counts) {
      counts = [0, 0, 0];
      this.table.set(key, counts);
    }
    counts[0] *= this.decay;
    counts[1] *= this.decay;
    counts[2] *= this.decay;
    counts[nextSymbol] += 1;
  }

  query(key: string, dirichletPrior: number): { dist: ProbVec; support: number } {
    const counts = this.table.get(key);
    if (!counts) {
      return { dist: [1 / 3, 1 / 3, 1 / 3], support: 0 };
    }
    const support = counts[0] + counts[1] + counts[2];
    const dist = normalizeProb([
      counts[0] + dirichletPrior,
      counts[1] + dirichletPrior,
      counts[2] + dirichletPrior,
    ]);
    return { dist, support };
  }

  clear(): void {
    this.table.clear();
  }
}

export class JNVPredictorSuite {
  // P1: Exponentially-decayed marginal frequency (Dirichlet-Multinomial)
  private playerFreq: [number, number, number] = emptyCounts(0);
  private selfFreq: [number, number, number] = emptyCounts(0);

  // P2: Variable-order Player Markov (Orders 1..4)
  private playerMarkov = [
    new DecayedContextTable(0.86),
    new DecayedContextTable(0.89),
    new DecayedContextTable(0.92),
    new DecayedContextTable(0.94),
  ];

  // P3: Variable-order Joint (P,N) Markov (Orders 1..3)
  private jointMarkov = [
    new DecayedContextTable(0.86),
    new DecayedContextTable(0.9),
    new DecayedContextTable(0.93),
  ];

  // P4: Rotational / Relative-Shift Delta Markov (Orders 1..3)
  private deltaMarkov = [
    new DecayedContextTable(0.85),
    new DecayedContextTable(0.89),
    new DecayedContextTable(0.92),
  ];

  // P5: Wang-Xu-Zhou Conditional Response (Outcome -> Relative Shift + Aiko Escalation)
  private wxyOutcomeDelta = new DecayedContextTable(0.87);
  private aikoShiftTable = new DecayedContextTable(0.88);

  // P7: Double-Run / Gambler's Fallacy (Anti-repetition after streak L>=2)
  private runReversionTable = new DecayedContextTable(0.86);

  // P8: Decision Latency Cadence (Fast impulsive vs Deliberate moves)
  private latencyFastCounts: [number, number, number] = emptyCounts(0);
  private latencySlowCounts: [number, number, number] = emptyCounts(0);
  private latencyFastDelta: [number, number, number] = emptyCounts(0);
  private latencySlowDelta: [number, number, number] = emptyCounts(0);
  private latencyEma = 2400;
  private latencyVarEma = 900 * 900;

  // P9: Opponent-Mirroring Detector (does player copy/counter NPC's last move?)
  private mirrorRelationCounts: [number, number, number] = emptyCounts(0); // 0=copy, 1=losesTo(N), 2=counter(N)

  // Self-mirror predictors (modeling JNV1.0's own history to anticipate player's counter-read)
  private selfMarkov = [
    new DecayedContextTable(0.86),
    new DecayedContextTable(0.9),
  ];
  private selfJointMarkov = new DecayedContextTable(0.88);

  reset(): void {
    this.playerFreq = emptyCounts(0);
    this.selfFreq = emptyCounts(0);
    this.playerMarkov.forEach((t) => t.clear());
    this.jointMarkov.forEach((t) => t.clear());
    this.deltaMarkov.forEach((t) => t.clear());
    this.wxyOutcomeDelta.clear();
    this.aikoShiftTable.clear();
    this.runReversionTable.clear();
    this.latencyFastCounts = emptyCounts(0);
    this.latencySlowCounts = emptyCounts(0);
    this.latencyFastDelta = emptyCounts(0);
    this.latencySlowDelta = emptyCounts(0);
    this.latencyEma = 2400;
    this.latencyVarEma = 900 * 900;
    this.mirrorRelationCounts = emptyCounts(0);
    this.selfMarkov.forEach((t) => t.clear());
    this.selfJointMarkov.clear();
  }

  /**
   * Update all online statistics AFTER round `history[history.length - 1]` has been revealed.
   */
  observe(history: readonly RoundRecord[]): void {
    const n = history.length;
    if (n === 0) return;
    const curr = history[n - 1];
    const pMove = curr.playerMove;
    const nMove = curr.npcMove;

    // P1: Marginal frequencies with smooth exponential forgetting (effective ~16-round window)
    for (let i = 0; i < 3; i++) {
      this.playerFreq[i] *= 0.94;
      this.selfFreq[i] *= 0.94;
    }
    this.playerFreq[pMove] += 1;
    this.selfFreq[nMove] += 1;

    // P2: Player Multi-Order Markov (Orders 1..4)
    for (let ord = 1; ord <= 4; ord++) {
      if (n > ord) {
        let key = '';
        for (let k = n - 1 - ord; k < n - 1; k++) key += history[k].playerMove;
        this.playerMarkov[ord - 1].observe(key, pMove);
      }
    }

    // P3: Joint-State Multi-Order Markov (Orders 1..3)
    for (let ord = 1; ord <= 3; ord++) {
      if (n > ord) {
        let key = '';
        for (let k = n - 1 - ord; k < n - 1; k++) key += history[k].jointCode;
        this.jointMarkov[ord - 1].observe(key, pMove);
      }
    }

    // P4: Rotational / Relative-Shift Delta Markov
    if (curr.playerDelta !== null) {
      // Order 1..3 over previous deltas
      for (let ord = 1; ord <= 3; ord++) {
        if (n > ord + 1) {
          let key = '';
          let ok = true;
          for (let k = n - 1 - ord; k < n - 1; k++) {
            const d = history[k].playerDelta;
            if (d === null) {
              ok = false;
              break;
            }
            key += d;
          }
          if (ok) this.deltaMarkov[ord - 1].observe(key, curr.playerDelta);
        }
      }
    }

    // P5: Wang-Xu-Zhou Conditional Response (Outcome -> Relative Shift)
    if (n >= 2 && curr.playerDelta !== null) {
      const prev = history[n - 2];
      this.wxyOutcomeDelta.observe(prev.playerOutcome, curr.playerDelta);
      if (prev.playerOutcome === 'DRAW') {
        const aikoBucket = Math.min(3, prev.aikoChainBefore + 1);
        this.aikoShiftTable.observe(`A${aikoBucket}`, curr.playerDelta);
      }
    }

    // P7: Run-Reversion / Gambler's Fallacy
    if (n >= 3 && curr.playerDelta !== null) {
      let runLen = 1;
      const prevMove = history[n - 2].playerMove;
      for (let k = n - 3; k >= 0; k--) {
        if (history[k].playerMove === prevMove) runLen++;
        else break;
      }
      if (runLen >= 2) {
        const bucket = Math.min(4, runLen);
        this.runReversionTable.observe(`R${bucket}`, curr.playerDelta);
      }
    }

    // P8: Decision Latency Cadence
    if (curr.decisionLatencyMs > 50 && curr.decisionLatencyMs < 60000) {
      const std = Math.sqrt(Math.max(this.latencyVarEma, 150 * 150));
      const z = (curr.decisionLatencyMs - this.latencyEma) / std;
      if (z < -0.35) {
        for (let i = 0; i < 3; i++) {
          this.latencyFastCounts[i] *= 0.88;
          this.latencyFastDelta[i] *= 0.88;
        }
        this.latencyFastCounts[pMove] += 1;
        if (curr.playerDelta !== null) this.latencyFastDelta[curr.playerDelta] += 1;
      } else if (z > 0.45) {
        for (let i = 0; i < 3; i++) {
          this.latencySlowCounts[i] *= 0.88;
          this.latencySlowDelta[i] *= 0.88;
        }
        this.latencySlowCounts[pMove] += 1;
        if (curr.playerDelta !== null) this.latencySlowDelta[curr.playerDelta] += 1;
      }
      // Update rolling latency EMA & variance
      const diff = curr.decisionLatencyMs - this.latencyEma;
      this.latencyEma += 0.18 * diff;
      this.latencyVarEma = 0.82 * this.latencyVarEma + 0.18 * diff * diff;
    }

    // P9: Opponent-Mirroring Relation relative to NPC's prior move
    if (n >= 2) {
      const prevNpc = history[n - 2].npcMove;
      const rel = (((pMove - prevNpc) % 3) + 3) % 3 as Move; // 0=copy, 1=losesTo(prevNpc), 2=counter(prevNpc)
      for (let i = 0; i < 3; i++) this.mirrorRelationCounts[i] *= 0.87;
      this.mirrorRelationCounts[rel] += 1;
    }

    // Self-Mirror predictors (modeling JNV1.0's own output sequence)
    for (let ord = 1; ord <= 2; ord++) {
      if (n > ord) {
        let key = '';
        for (let k = n - 1 - ord; k < n - 1; k++) key += history[k].npcMove;
        this.selfMarkov[ord - 1].observe(key, nMove);
      }
    }
    if (n >= 2) {
      this.selfJointMarkov.observe(String(history[n - 2].jointCode), nMove);
    }
  }

  /**
   * Generate all BasePredictions for the upcoming round using ONLY strictly past history [0..n-1].
   */
  predictAll(history: readonly RoundRecord[], enableSelfMirror: boolean): BasePrediction[] {
    const n = history.length;
    const preds: BasePrediction[] = [];

    // --- P1: Exponential-Decay Frequency (Dirichlet-Multinomial) ---
    {
      const support = this.playerFreq[0] + this.playerFreq[1] + this.playerFreq[2];
      const dist = normalizeProb([
        this.playerFreq[0] + 0.9,
        this.playerFreq[1] + 0.9,
        this.playerFreq[2] + 0.9,
      ]);
      preds.push({
        id: 'P1_FREQ',
        labelJp: '指数減衰・頻度分布',
        dist,
        confidence: sharpnessConfidence(dist, support, 4.5),
        stream: 'player',
        detail: `Dirichlet-EMA (n=${support.toFixed(1)})`,
      });
    }

    // --- P2: Multi-Order Context Tree Markov (Player Stream, Orders 1..4) ---
    {
      let blended: [number, number, number] = [0, 0, 0];
      let totalW = 0;
      let deepestOrder = 0;
      for (let ord = 4; ord >= 1; ord--) {
        if (n >= ord) {
          let key = '';
          for (let k = n - ord; k < n; k++) key += history[k].playerMove;
          const q = this.playerMarkov[ord - 1].query(key, 0.35);
          if (q.support > 0.35) {
            const ordWeight = (1 + ord * 0.9) * Math.min(1, q.support / 2.2);
            blended[0] += q.dist[0] * ordWeight;
            blended[1] += q.dist[1] * ordWeight;
            blended[2] += q.dist[2] * ordWeight;
            totalW += ordWeight;
            if (deepestOrder === 0) deepestOrder = ord;
          }
        }
      }
      const dist = totalW > 0 ? normalizeProb(blended) : ([1 / 3, 1 / 3, 1 / 3] as ProbVec);
      preds.push({
        id: 'P2_PMARKOV',
        labelJp: '多階マルコフ連鎖(手列)',
        dist,
        confidence: sharpnessConfidence(dist, totalW * 1.5, 3.0),
        stream: 'player',
        detail: deepestOrder > 0 ? `Order-${deepestOrder} Context Tree` : 'Warmup',
      });
    }

    // --- P3: Joint-State Markov (Orders 1..3 on (P,N) pairs) ---
    {
      let blended: [number, number, number] = [0, 0, 0];
      let totalW = 0;
      let deepestOrder = 0;
      for (let ord = 3; ord >= 1; ord--) {
        if (n >= ord) {
          let key = '';
          for (let k = n - ord; k < n; k++) key += history[k].jointCode;
          const q = this.jointMarkov[ord - 1].query(key, 0.3);
          if (q.support > 0.35) {
            const ordWeight = (1 + ord * 1.05) * Math.min(1, q.support / 1.8);
            blended[0] += q.dist[0] * ordWeight;
            blended[1] += q.dist[1] * ordWeight;
            blended[2] += q.dist[2] * ordWeight;
            totalW += ordWeight;
            if (deepestOrder === 0) deepestOrder = ord;
          }
        }
      }
      const dist = totalW > 0 ? normalizeProb(blended) : ([1 / 3, 1 / 3, 1 / 3] as ProbVec);
      preds.push({
        id: 'P3_JMARKOV',
        labelJp: '結合状態マルコフ(相互手)',
        dist,
        confidence: sharpnessConfidence(dist, totalW * 1.6, 2.8),
        stream: 'player',
        detail: deepestOrder > 0 ? `Joint Order-${deepestOrder}` : 'Warmup',
      });
    }

    // --- P4: Rotational / Relative-Shift Delta Predictor ---
    {
      let dist: ProbVec = [1 / 3, 1 / 3, 1 / 3];
      let totalW = 0;
      if (n >= 2) {
        const lastPlayer = history[n - 1].playerMove;
        let deltaBlend: [number, number, number] = [0, 0, 0];
        for (let ord = 3; ord >= 1; ord--) {
          if (n >= ord + 1) {
            let key = '';
            let ok = true;
            for (let k = n - ord; k < n; k++) {
              const d = history[k].playerDelta;
              if (d === null) {
                ok = false;
                break;
              }
              key += d;
            }
            if (ok) {
              const q = this.deltaMarkov[ord - 1].query(key, 0.35);
              if (q.support > 0.35) {
                const w = (1 + ord * 0.8) * Math.min(1, q.support / 2.0);
                deltaBlend[0] += q.dist[0] * w;
                deltaBlend[1] += q.dist[1] * w;
                deltaBlend[2] += q.dist[2] * w;
                totalW += w;
              }
            }
          }
        }
        if (totalW > 0) {
          const dDist = normalizeProb(deltaBlend);
          // Convert relative shift probabilities back to absolute moves from lastPlayer
          const absDist: [number, number, number] = [0, 0, 0];
          for (let d = 0; d < 3; d++) {
            absDist[rotateMove(lastPlayer, d)] = dDist[d];
          }
          dist = normalizeProb(absDist);
        }
      }
      preds.push({
        id: 'P4_DELTA',
        labelJp: '循環シフト予測(回転不変)',
        dist,
        confidence: sharpnessConfidence(dist, totalW * 1.4, 3.0),
        stream: 'player',
        detail: totalW > 0 ? 'Relative Z3-Delta' : 'Warmup',
      });
    }

    // --- P5: Wang-Xu-Zhou Behavioral Psychology (Win-Stay / Lose-Shift / Aiko-Breaker) ---
    {
      let dist: ProbVec = [1 / 3, 1 / 3, 1 / 3];
      let support = 0;
      let detail = 'Prior (Win-Stay / Lose-Shift)';
      if (n >= 1) {
        const last = history[n - 1];
        const qOutcome = this.wxyOutcomeDelta.query(last.playerOutcome, 0.25);
        // Empirical human prior from Wang, Xu & Zhou (2014) weak-informed baseline
        let priorDelta: ProbVec;
        if (last.playerOutcome === 'WIN') {
          priorDelta = [0.46, 0.28, 0.26]; // Humans lean Win-Stay
        } else if (last.playerOutcome === 'LOSS') {
          priorDelta = [0.22, 0.42, 0.36]; // Humans lean Lose-Shift
        } else {
          priorDelta = [0.26, 0.37, 0.37]; // Humans break draws
        }

        let deltaDist: ProbVec;
        if (last.playerOutcome === 'DRAW') {
          const aikoBucket = Math.min(3, last.aikoChainBefore + 1);
          const qAiko = this.aikoShiftTable.query(`A${aikoBucket}`, 0.25);
          const aikoPrior: ProbVec =
            aikoBucket >= 2 ? [0.16, 0.43, 0.41] : [0.27, 0.37, 0.36];
          const wEmp = Math.min(0.85, (qOutcome.support + qAiko.support) / 4.5);
          const mergedEmp = normalizeProb([
            qOutcome.dist[0] * 0.5 + qAiko.dist[0] * 0.5,
            qOutcome.dist[1] * 0.5 + qAiko.dist[1] * 0.5,
            qOutcome.dist[2] * 0.5 + qAiko.dist[2] * 0.5,
          ]);
          deltaDist = normalizeProb([
            mergedEmp[0] * wEmp + aikoPrior[0] * (1 - wEmp),
            mergedEmp[1] * wEmp + aikoPrior[1] * (1 - wEmp),
            mergedEmp[2] * wEmp + aikoPrior[2] * (1 - wEmp),
          ]);
          support = qOutcome.support + qAiko.support + 0.8;
          detail = `あいこ${aikoBucket}連続・心理推移`;
        } else {
          const wEmp = Math.min(0.88, qOutcome.support / 3.5);
          deltaDist = normalizeProb([
            qOutcome.dist[0] * wEmp + priorDelta[0] * (1 - wEmp),
            qOutcome.dist[1] * wEmp + priorDelta[1] * (1 - wEmp),
            qOutcome.dist[2] * wEmp + priorDelta[2] * (1 - wEmp),
          ]);
          support = qOutcome.support + 0.7;
          detail =
            last.playerOutcome === 'WIN' ? '勝利後・継続傾向解析' : '敗北後・転換傾向解析';
        }

        const absDist: [number, number, number] = [0, 0, 0];
        for (let d = 0; d < 3; d++) {
          absDist[rotateMove(last.playerMove, d)] = deltaDist[d];
        }
        dist = normalizeProb(absDist);
      }
      preds.push({
        id: 'P5_WXZ_PSYCH',
        labelJp: '心理条件応答(Wang-Xu-Zhou)',
        dist,
        confidence: sharpnessConfidence(dist, support, 3.2),
        stream: 'player',
        detail,
      });
    }

    // --- P6: Exact-Suffix Recency History Matcher (Iocaine / Greenberg Pattern Sniper) ---
    {
      let dist: ProbVec = [1 / 3, 1 / 3, 1 / 3];
      let bestMatchLen = 0;
      let detail = 'No exact suffix match';
      if (n >= 2) {
        const maxSearchLen = Math.min(6, n - 1);
        const jointVotes: [number, number, number] = [0.25, 0.25, 0.25];
        let totalMatchScore = 0;

        // Joint stream exact suffix search (strongest signal)
        for (let len = maxSearchLen; len >= 1; len--) {
          let foundAtLen = 0;
          for (let start = n - len - 1; start >= 0 && foundAtLen < 3; start--) {
            let match = true;
            for (let k = 0; k < len; k++) {
              if (history[start + k].jointCode !== history[n - len + k].jointCode) {
                match = false;
                break;
              }
            }
            if (match) {
              const nextMove = history[start + len].playerMove;
              const recency = Math.pow(0.95, n - 1 - (start + len));
              const score = (len * len) * (0.4 + 0.6 * recency);
              jointVotes[nextMove] += score;
              totalMatchScore += score;
              foundAtLen++;
              if (len > bestMatchLen) bestMatchLen = len;
            }
          }
          if (foundAtLen > 0 && len >= 2) break;
        }

        // Player-only stream suffix search (complementary)
        for (let len = Math.min(5, n - 1); len >= 2; len--) {
          let found = 0;
          for (let start = n - len - 1; start >= 0 && found < 2; start--) {
            let match = true;
            for (let k = 0; k < len; k++) {
              if (history[start + k].playerMove !== history[n - len + k].playerMove) {
                match = false;
                break;
              }
            }
            if (match) {
              const nextMove = history[start + len].playerMove;
              const recency = Math.pow(0.95, n - 1 - (start + len));
              const score = (len * len * 0.7) * (0.4 + 0.6 * recency);
              jointVotes[nextMove] += score;
              totalMatchScore += score;
              found++;
              if (len > bestMatchLen) bestMatchLen = len;
            }
          }
          if (found > 0) break;
        }

        if (totalMatchScore > 0) {
          dist = normalizeProb(jointVotes);
          detail = `最長一致長 L=${bestMatchLen}`;
        }
      }
      preds.push({
        id: 'P6_SUFFIX',
        labelJp: '履歴最長一致スナイパー',
        dist,
        confidence: sharpnessConfidence(dist, bestMatchLen * 1.5, 2.5),
        stream: 'player',
        detail,
      });
    }

    // --- P7: Double-Run & Gambler's Fallacy Detector ---
    {
      let dist: ProbVec = [1 / 3, 1 / 3, 1 / 3];
      let support = 0;
      let detail = 'No active streak';
      if (n >= 2) {
        const lastMove = history[n - 1].playerMove;
        let runLen = 1;
        for (let k = n - 2; k >= 0; k--) {
          if (history[k].playerMove === lastMove) runLen++;
          else break;
        }
        if (runLen >= 2) {
          const bucket = Math.min(4, runLen);
          const q = this.runReversionTable.query(`R${bucket}`, 0.3);
          // Human gambler's fallacy prior: after 2+ identical hands, humans strongly avoid repeating
          const priorDelta: ProbVec =
            runLen >= 3 ? [0.12, 0.44, 0.44] : [0.20, 0.40, 0.40];
          const wEmp = Math.min(0.8, q.support / 2.5);
          const deltaDist = normalizeProb([
            q.dist[0] * wEmp + priorDelta[0] * (1 - wEmp),
            q.dist[1] * wEmp + priorDelta[1] * (1 - wEmp),
            q.dist[2] * wEmp + priorDelta[2] * (1 - wEmp),
          ]);
          const absDist: [number, number, number] = [0, 0, 0];
          for (let d = 0; d < 3; d++) absDist[rotateMove(lastMove, d)] = deltaDist[d];
          dist = normalizeProb(absDist);
          support = q.support + runLen * 0.7;
          detail = `同手${runLen}連続・反動検知`;
        }
      }
      preds.push({
        id: 'P7_RUN_REV',
        labelJp: '連打反動・ギャンブラー錯誤',
        dist,
        confidence: sharpnessConfidence(dist, support, 3.0),
        stream: 'player',
        detail,
      });
    }

    // --- P8: Temporal Decision Latency Cadence ---
    {
      let dist: ProbVec = [1 / 3, 1 / 3, 1 / 3];
      let support = 0;
      let detail = 'Latency baseline calibrating';
      if (n >= 3) {
        const last = history[n - 1];
        const std = Math.sqrt(Math.max(this.latencyVarEma, 150 * 150));
        const z = (last.decisionLatencyMs - this.latencyEma) / std;
        if (z < -0.25) {
          const s = this.latencyFastCounts[0] + this.latencyFastCounts[1] + this.latencyFastCounts[2];
          if (s > 1.2) {
            dist = normalizeProb([
              this.latencyFastCounts[0] + 0.5,
              this.latencyFastCounts[1] + 0.5,
              this.latencyFastCounts[2] + 0.5,
            ]);
            support = s;
            detail = `即断リズム (z=${z.toFixed(1)})`;
          }
        } else if (z > 0.35) {
          const s = this.latencySlowCounts[0] + this.latencySlowCounts[1] + this.latencySlowCounts[2];
          if (s > 1.2) {
            dist = normalizeProb([
              this.latencySlowCounts[0] + 0.5,
              this.latencySlowCounts[1] + 0.5,
              this.latencySlowCounts[2] + 0.5,
            ]);
            support = s;
            detail = `熟考リズム (z=+${z.toFixed(1)})`;
          }
        }
      }
      preds.push({
        id: 'P8_LATENCY',
        labelJp: '思考テンポ・遅延プロファイル',
        dist,
        confidence: sharpnessConfidence(dist, support, 4.0),
        stream: 'player',
        detail,
      });
    }

    // --- P9: Opponent-Mirroring Detector (Player copying or countering NPC's previous move) ---
    {
      let dist: ProbVec = [1 / 3, 1 / 3, 1 / 3];
      let support = 0;
      let detail = 'Warmup';
      if (n >= 1) {
        const lastNpc = history[n - 1].npcMove;
        support =
          this.mirrorRelationCounts[0] +
          this.mirrorRelationCounts[1] +
          this.mirrorRelationCounts[2];
        if (support > 0.8) {
          const relDist = normalizeProb([
            this.mirrorRelationCounts[0] + 0.4,
            this.mirrorRelationCounts[1] + 0.4,
            this.mirrorRelationCounts[2] + 0.4,
          ]);
          const absDist: [number, number, number] = [0, 0, 0];
          for (let rel = 0; rel < 3; rel++) {
            absDist[rotateMove(lastNpc, rel)] = relDist[rel];
          }
          dist = normalizeProb(absDist);
          const dominantRel = relDist.indexOf(Math.max(...relDist));
          detail =
            dominantRel === 0
              ? '直前NPC手の模倣(コピー)傾向'
              : dominantRel === 2
              ? '直前NPC手への後追い対抗傾向'
              : '直前NPC手の弱点追従傾向';
        }
      }
      preds.push({
        id: 'P9_MIRROR',
        labelJp: '対NPCミラー・後追い検知',
        dist,
        confidence: sharpnessConfidence(dist, support, 3.0),
        stream: 'player',
        detail,
      });
    }

    // --- Self-Mirror Predictors (S1..S3): Predict what a clever opponent predicts JNV1.0 will play! ---
    if (enableSelfMirror && n >= 2) {
      // S1: Self Frequency
      const sSupport = this.selfFreq[0] + this.selfFreq[1] + this.selfFreq[2];
      const sFreqDist = normalizeProb([
        this.selfFreq[0] + 0.9,
        this.selfFreq[1] + 0.9,
        this.selfFreq[2] + 0.9,
      ]);
      // If opponent predicts JNV1.0 plays sFreqDist, opponent will play counterOf(sFreqDist)
      const oppCounterOfSelfFreq: ProbVec = [
        sFreqDist[counterOf(0)], // wait: if JNV plays R(0), opp plays P(2) -> P(opp=2)=P(jnv=0)
        sFreqDist[counterOf(1)],
        sFreqDist[counterOf(2)],
      ];
      // Verify mapping carefully:
      // opp plays move m to beat losesTo(m): e.g., opp plays PAPER(2) to beat ROCK(0).
      // So P(opp = m) = P(jnv = losesTo(m))!
      const mappedS1: ProbVec = [
        sFreqDist[1], // opp plays ROCK(0) to beat JNV SCISSORS(1)
        sFreqDist[2], // opp plays SCISSORS(1) to beat JNV PAPER(2)
        sFreqDist[0], // opp plays PAPER(2) to beat JNV ROCK(0)
      ];
      void oppCounterOfSelfFreq;
      preds.push({
        id: 'S1_SELF_FREQ',
        labelJp: '自己履歴逆読(頻度鏡像)',
        dist: mappedS1,
        confidence: sharpnessConfidence(mappedS1, sSupport, 5.0),
        stream: 'self',
        detail: 'Anti-exploitation of JNV bias',
      });

      // S2: Self Markov
      let sBlend: [number, number, number] = [0, 0, 0];
      let sW = 0;
      for (let ord = 2; ord >= 1; ord--) {
        if (n >= ord) {
          let key = '';
          for (let k = n - ord; k < n; k++) key += history[k].npcMove;
          const q = this.selfMarkov[ord - 1].query(key, 0.35);
          if (q.support > 0.4) {
            const w = (1 + ord) * Math.min(1, q.support / 2.0);
            sBlend[0] += q.dist[0] * w;
            sBlend[1] += q.dist[1] * w;
            sBlend[2] += q.dist[2] * w;
            sW += w;
          }
        }
      }
      const sMarkDist = sW > 0 ? normalizeProb(sBlend) : ([1 / 3, 1 / 3, 1 / 3] as ProbVec);
      const mappedS2: ProbVec = [sMarkDist[1], sMarkDist[2], sMarkDist[0]];
      preds.push({
        id: 'S2_SELF_MARKOV',
        labelJp: '自己履歴逆読(連鎖鏡像)',
        dist: mappedS2,
        confidence: sharpnessConfidence(mappedS2, sW * 1.4, 3.0),
        stream: 'self',
        detail: 'Countering player read of JNV',
      });

      // S3: Self Joint Markov
      const qSJ = this.selfJointMarkov.query(String(history[n - 1].jointCode), 0.35);
      const mappedS3: ProbVec = [qSJ.dist[1], qSJ.dist[2], qSJ.dist[0]];
      preds.push({
        id: 'S3_SELF_JOINT',
        labelJp: '自己結合鏡像(相互逆読)',
        dist: mappedS3,
        confidence: sharpnessConfidence(mappedS3, qSJ.support, 2.5),
        stream: 'self',
        detail: 'Mutual pattern counter-read',
      });
    }

    return preds;
  }
}
