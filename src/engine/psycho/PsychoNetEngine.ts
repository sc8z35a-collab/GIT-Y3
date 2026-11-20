/**
 * ★ J-PSYCHO-NET 1.0 — Information-Theoretic Shannon Entropy × Variable-Length Markov × Hedge Nash AI ★
 *
 * Strictly ZERO-CHEAT Cryptographic Pre-Commit Tactical Intelligence:
 *  - Operates EXCLUSIVELY BEFORE the player selects their move — its chosen counter-move is
 *    immediately sealed inside JNV1.0's SHA-256 commitment hash before the round opens!
 *    Therefore, post-hoc cheating is mathematically impossible and 100% SHA-256 verifiable!
 *  - Architecture (3-Expert Ensemble with Exponential Weights / Hedge Regret-Minimization):
 *      Expert 0: Dirichlet-Smoothed Frequency Marginal Estimator (captures move bias)
 *      Expert 1: Outcome-Conditioned Psychology Model (Win-Stay / Lose-Shift / Aiko-Escape reflexes!)
 *      Expert 2: Variable-Length Markov Chain (VLMC, Order 1–3) on player sequence history
 *      Expert 3: Meta-Game Nash Equilibrium Defender (auto-blends into uniform mixed Nash when
 *                the player actively counter-exploits or plays near-maximal Shannon entropy!)
 *  - Computes real-time Information Theory telemetry:
 *      • Player Shannon Entropy H(X) in bits (0.00 = deterministic .. 1.585 = perfect uniform chaos)
 *      • Kullback-Leibler Divergence D_KL(P || U) measuring psychological predictability
 *      • Active behavioral archetype diagnosis in Japanese (e.g., 勝後維持型 / あいこ転換型 / 剛拳偏重 / 明鏡均衡)
 */

import { Move, PAPER, ROCK, SCISSORS } from '../jnv1/types';

export type OpponentAIMode = 'psycho_fair' | 'pure_crypto';

export interface PsychoNetTelemetry {
  aiMode: OpponentAIMode;
  roundsAnalyzed: number;
  /** Player move Shannon entropy H(X) in bits (max = log2(3) ≈ 1.585 bits) */
  shannonEntropyBits: number;
  /** Predictability index 0..100% derived from KL-divergence & Markov confidence */
  predictabilityPct: number;
  /** KL Divergence D_KL(P || Uniform) in bits */
  klDivergenceBits: number;
  /** AI confidence on the pre-committed round (33% = Nash uniform .. 88% = high pattern lock) */
  preCommitConfidencePct: number;
  /** Winning expert currently leading Hedge weights */
  dominantExpertJp: string;
  /** Diagnosed human psychological tendency */
  playerTendencyJp: string;
  /** Predicted player move probability distribution [Rock, Scissors, Paper] */
  predictedPlayerProbs: [number, number, number];
}

type RoundOutcomeForPlayer = 'WIN' | 'LOSS' | 'DRAW';

interface HistoryEntry {
  playerMove: Move;
  npcMove: Move;
  outcome: RoundOutcomeForPlayer;
}

const LOG2_3 = Math.log2(3); // 1.5849625...

/** Returns the move that beats `target` (Rock=0, Scissors=1, Paper=2; Rock beats Scissors, Scissors beats Paper, Paper beats Rock) */
export function counterMoveOf(target: Move): Move {
  if (target === ROCK) return PAPER;
  if (target === SCISSORS) return ROCK;
  return SCISSORS;
}

/** Deterministic Mulberry32 helper for reproducible testing when seeded, or crypto RNG in live matches */
function sampleUniformUnit(rng?: () => number): number {
  if (rng) return rng();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

export class PsychoNetEngine {
  private aiMode: OpponentAIMode = 'psycho_fair';
  private history: HistoryEntry[] = [];

  // Expert 0: Frequency counts (Dirichlet prior alpha = 0.8)
  private freqCounts: [number, number, number] = [0.8, 0.8, 0.8];

  // Expert 1: Outcome-conditioned shift counts: [outcomeIdx][delta: 0=stay, 1=shift+1, 2=shift+2]
  private outcomeShiftCounts: Array<[number, number, number]> = [
    [0.7, 0.7, 0.7], // after WIN
    [0.7, 0.7, 0.7], // after LOSS
    [0.7, 0.7, 0.7], // after DRAW
  ];

  // Expert 2: Variable-Length Markov Chain (order 1, 2, 3 context -> [R, S, P] counts)
  private vlmc = new Map<string, [number, number, number]>();

  // Hedge Regret-Minimization weights across 4 experts: [Freq, PsychShift, VLMC, NashUniform]
  private expertWeights: [number, number, number, number] = [0.22, 0.34, 0.34, 0.1];
  private lastExpertPredictions: Array<[number, number, number]> = [
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3],
    [1 / 3, 1 / 3, 1 / 3],
  ];

  private lastPredictedProbs: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
  private lastConfidencePct = 33;

  public setMode(mode: OpponentAIMode): void {
    this.aiMode = mode;
  }

  public getMode(): OpponentAIMode {
    return this.aiMode;
  }

  public resetMatchMemory(): void {
    // Keep gentle decayed long-term prior (25%) across rematches so the rival feels alive,
    // or call hardReset() for a completely fresh slate.
    for (let i = 0; i < 3; i++) {
      this.freqCounts[i] = 0.8 + (this.freqCounts[i] - 0.8) * 0.25;
      for (let o = 0; o < 3; o++) {
        this.outcomeShiftCounts[o][i] = 0.7 + (this.outcomeShiftCounts[o][i] - 0.7) * 0.25;
      }
    }
  }

  public hardReset(): void {
    this.history = [];
    this.freqCounts = [0.8, 0.8, 0.8];
    this.outcomeShiftCounts = [
      [0.7, 0.7, 0.7],
      [0.7, 0.7, 0.7],
      [0.7, 0.7, 0.7],
    ];
    this.vlmc.clear();
    this.expertWeights = [0.22, 0.34, 0.34, 0.1];
    this.lastPredictedProbs = [1 / 3, 1 / 3, 1 / 3];
    this.lastConfidencePct = 33;
  }

  /**
   * Predict player's next move probability distribution [P(Rock), P(Scissors), P(Paper)]
   * STRICTLY from historical rounds completed BEFORE the current round begins.
   */
  public predictPlayerDistribution(): [number, number, number] {
    if (this.history.length === 0) {
      this.lastPredictedProbs = [1 / 3, 1 / 3, 1 / 3];
      this.lastConfidencePct = 33;
      return [1 / 3, 1 / 3, 1 / 3];
    }

    // Expert 0: Frequency Marginal
    const fSum = this.freqCounts[0] + this.freqCounts[1] + this.freqCounts[2];
    const e0: [number, number, number] = [
      this.freqCounts[0] / fSum,
      this.freqCounts[1] / fSum,
      this.freqCounts[2] / fSum,
    ];

    // Expert 1: Outcome-Conditioned Win-Stay / Lose-Shift / Aiko-Shift Reflex
    const prev = this.history[this.history.length - 1];
    const outIdx = prev.outcome === 'WIN' ? 0 : prev.outcome === 'LOSS' ? 1 : 2;
    const sc = this.outcomeShiftCounts[outIdx];
    const sSum = sc[0] + sc[1] + sc[2];
    const e1: [number, number, number] = [0, 0, 0];
    for (let delta = 0; delta < 3; delta++) {
      const targetMove = ((prev.playerMove + delta) % 3) as Move;
      e1[targetMove] = sc[delta] / sSum;
    }

    // Expert 2: Variable-Length Markov Chain (order 3 -> 2 -> 1 backoff blending)
    let e2: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
    let matchedOrder = 0;
    for (let ord = Math.min(3, this.history.length); ord >= 1; ord--) {
      const key = this.makeContextKey(ord);
      const counts = this.vlmc.get(key);
      if (counts) {
        const tot = counts[0] + counts[1] + counts[2];
        if (tot >= 1.5) {
          const smooth = 0.45;
          const denom = tot + smooth * 3;
          e2 = [(counts[0] + smooth) / denom, (counts[1] + smooth) / denom, (counts[2] + smooth) / denom];
          matchedOrder = ord;
          break;
        }
      }
    }
    if (matchedOrder === 0) {
      e2 = [...e0];
    }

    // Expert 3: Mixed Nash Equilibrium Defense (uniform 1/3, 1/3, 1/3)
    const e3: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];

    this.lastExpertPredictions = [e0, e1, e2, e3];

    // Hedge weighted ensemble combination
    const wSum =
      this.expertWeights[0] +
      this.expertWeights[1] +
      this.expertWeights[2] +
      this.expertWeights[3];
    const blend: [number, number, number] = [0, 0, 0];
    for (let m = 0; m < 3; m++) {
      blend[m] =
        (this.expertWeights[0] * e0[m] +
          this.expertWeights[1] * e1[m] +
          this.expertWeights[2] * e2[m] +
          this.expertWeights[3] * e3[m]) /
        Math.max(1e-6, wSum);
    }

    this.lastPredictedProbs = blend;
    this.lastConfidencePct = Math.round(Math.max(blend[0], blend[1], blend[2]) * 100);
    return blend;
  }

  /**
   * Choose NPC's Pre-Commit Move BEFORE the round begins (for JNV1.0 SHA-256 sealing!).
   * Returns `null` if in `pure_crypto` mode (meaning JNV1.0 uses pure unbiased Web Crypto RNG),
   * or a strategically sampled counter-move when in `psycho_fair` mode.
   */
  public selectPreCommitNpcMove(rng?: () => number): Move | null {
    if (this.aiMode === 'pure_crypto') {
      this.predictPlayerDistribution(); // Keep passive telemetry informative even in pure_crypto!
      return null;
    }

    const pred = this.predictPlayerDistribution();

    // Expected payoff for each NPC candidate move m in {ROCK, SCISSORS, PAPER}:
    // E[payoff(m)] = P(player loses to m) - P(player beats m)
    const ev: [number, number, number] = [
      pred[SCISSORS] - pred[PAPER], // NPC plays ROCK
      pred[PAPER] - pred[ROCK], // NPC plays SCISSORS
      pred[ROCK] - pred[SCISSORS], // NPC plays PAPER
    ];

    // Softmax temperature scales smoothly with history length & predictability
    // (early rounds stay close to Nash mixed equilibrium; strong patterns get punished crisply!)
    const warmup = Math.min(1, this.history.length / 4.0);
    const beta = 1.2 + warmup * 4.4;
    const maxEv = Math.max(ev[0], ev[1], ev[2]);
    const w0 = Math.exp((ev[0] - maxEv) * beta);
    const w1 = Math.exp((ev[1] - maxEv) * beta);
    const w2 = Math.exp((ev[2] - maxEv) * beta);
    const sum = w0 + w1 + w2;

    const u = sampleUniformUnit(rng);
    if (u < w0 / sum) return ROCK;
    if (u < (w0 + w1) / sum) return SCISSORS;
    return PAPER;
  }

  /**
   * Update Bayesian beliefs, VLMC contexts, and Hedge expert weights AFTER a round is revealed.
   */
  public observeRound(playerMove: Move, npcMove: Move, outcome: RoundOutcomeForPlayer): void {
    // 1. Update Hedge Regret-Minimization Expert Weights based on log-likelihood accuracy
    if (this.history.length > 0) {
      const lr = 0.42;
      let wTotal = 0;
      for (let e = 0; e < 4; e++) {
        const pActual = Math.max(0.05, this.lastExpertPredictions[e][playerMove]);
        // Reward experts that assigned higher probability to the player's actual move
        const loss = 1.0 - pActual;
        this.expertWeights[e] *= Math.exp(-lr * loss);
        // Prevent any expert from collapsing completely (keeps Nash safety net alive!)
        this.expertWeights[e] = Math.max(0.04, this.expertWeights[e]);
        wTotal += this.expertWeights[e];
      }
      for (let e = 0; e < 4; e++) {
        this.expertWeights[e] /= wTotal;
      }

      // 2. Update Outcome-Conditioned Shift Reflex
      const prev = this.history[this.history.length - 1];
      const outIdx = prev.outcome === 'WIN' ? 0 : prev.outcome === 'LOSS' ? 1 : 2;
      const delta = (playerMove - prev.playerMove + 3) % 3;
      // Exponential forgetting (0.92) adapts rapidly if human changes strategy mid-match!
      for (let d = 0; d < 3; d++) {
        this.outcomeShiftCounts[outIdx][d] = 0.7 + (this.outcomeShiftCounts[outIdx][d] - 0.7) * 0.92;
      }
      this.outcomeShiftCounts[outIdx][delta] += 1.0;

      // 3. Update Variable-Length Markov Chain (order 1, 2, 3)
      for (let ord = 1; ord <= Math.min(3, this.history.length); ord++) {
        const key = this.makeContextKey(ord);
        let entry = this.vlmc.get(key);
        if (!entry) {
          entry = [0, 0, 0];
          this.vlmc.set(key, entry);
        }
        entry[0] *= 0.94;
        entry[1] *= 0.94;
        entry[2] *= 0.94;
        entry[playerMove] += 1.0;
      }
    }

    // 4. Update Marginal Frequency with mild exponential decay
    for (let m = 0; m < 3; m++) {
      this.freqCounts[m] = 0.8 + (this.freqCounts[m] - 0.8) * 0.93;
    }
    this.freqCounts[playerMove] += 1.0;

    this.history.push({ playerMove, npcMove, outcome });
    if (this.history.length > 64) {
      this.history.shift();
    }

    // Refresh prediction metrics immediately for live UI telemetry
    this.predictPlayerDistribution();
  }

  private makeContextKey(order: number): string {
    const start = this.history.length - order;
    let key = '';
    for (let i = start; i < this.history.length; i++) {
      const h = this.history[i];
      key += `${h.playerMove}${h.outcome[0]}:`;
    }
    return key;
  }

  public getTelemetry(): PsychoNetTelemetry {
    const n = this.history.length;
    let shannonEntropyBits = LOG2_3;
    let klDivergenceBits = 0;

    if (n > 0) {
      const rawCounts = [0, 0, 0];
      for (let i = 0; i < n; i++) rawCounts[this.history[i].playerMove]++;
      let h = 0;
      let kl = 0;
      for (let m = 0; m < 3; m++) {
        const p = rawCounts[m] / n;
        if (p > 1e-9) {
          h -= p * Math.log2(p);
          kl += p * Math.log2(p / (1 / 3));
        }
      }
      shannonEntropyBits = Math.max(0, Math.min(LOG2_3, h));
      klDivergenceBits = Math.max(0, kl);
    }

    // Predictability blends empirical entropy drop + VLMC/ensemble peak confidence
    const entropyDrop = Math.max(0, (LOG2_3 - shannonEntropyBits) / LOG2_3);
    const ensembleLock = Math.max(0, (this.lastConfidencePct - 33) / 67);
    const predictabilityPct = Math.round(
      Math.max(0, Math.min(99, (entropyDrop * 0.48 + ensembleLock * 0.52) * 100))
    );

    // Dominant expert label
    const expertNames = ['頻度ベイズ', '勝敗反射モデル', '可変長マルコフ', 'ナッシュ均衡防御'];
    let bestE = 0;
    for (let i = 1; i < 4; i++) {
      if (this.expertWeights[i] > this.expertWeights[bestE]) bestE = i;
    }

    // Diagnose player's psychological archetype
    let playerTendencyJp = '観測中（初期均衡）';
    if (n >= 2) {
      const winStay = this.outcomeShiftCounts[0][0] / (this.outcomeShiftCounts[0][0] + this.outcomeShiftCounts[0][1] + this.outcomeShiftCounts[0][2]);
      const loseShift = 1 - this.outcomeShiftCounts[1][0] / (this.outcomeShiftCounts[1][0] + this.outcomeShiftCounts[1][1] + this.outcomeShiftCounts[1][2]);
      const fSum = this.freqCounts[0] + this.freqCounts[1] + this.freqCounts[2];
      const pRock = this.freqCounts[0] / fSum;
      const pScis = this.freqCounts[1] / fSum;
      const pPap = this.freqCounts[2] / fSum;

      if (shannonEntropyBits > 1.48 && this.lastConfidencePct < 45) {
        playerTendencyJp = '明鏡無心（高エントロピー）';
      } else if (pRock > 0.48) {
        playerTendencyJp = '剛拳偏重（グー優位）';
      } else if (pScis > 0.48) {
        playerTendencyJp = '双刃偏重（チョキ優位）';
      } else if (pPap > 0.48) {
        playerTendencyJp = '包摂偏重（パー優位）';
      } else if (winStay > 0.48) {
        playerTendencyJp = '勝後維持型 (Win-Stay)';
      } else if (loseShift > 0.74) {
        playerTendencyJp = '敗後転換型 (Lose-Shift)';
      } else {
        playerTendencyJp = '戦術連鎖型 (Markov)';
      }
    }

    return {
      aiMode: this.aiMode,
      roundsAnalyzed: n,
      shannonEntropyBits: Number(shannonEntropyBits.toFixed(3)),
      predictabilityPct,
      klDivergenceBits: Number(klDivergenceBits.toFixed(3)),
      preCommitConfidencePct: this.lastConfidencePct,
      dominantExpertJp: expertNames[bestE],
      playerTendencyJp,
      predictedPlayerProbs: [
        Number(this.lastPredictedProbs[0].toFixed(2)),
        Number(this.lastPredictedProbs[1].toFixed(2)),
        Number(this.lastPredictedProbs[2].toFixed(2)),
      ],
    };
  }
}
