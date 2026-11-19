/**
 * JNV1.0 Layer 4 — Volatility, Regime-Shift (Page-Hinkley CUSUM) & Self-Exploitability Guard.
 *
 * Monitors two critical risks in adversarial zero-sum play:
 *  1. Non-Stationary Regime Shift: Human changes strategy mid-game. Detected via
 *     Page-Hinkley cumulative sum over predictive surprise & negative payoff drift.
 *  2. Self-Exploitability: If JNV1.0's own moves become too low-entropy or the
 *     human starts consistently out-predicting JNV1.0, smoothly increases the
 *     Nash Equilibrium mixing coefficient beta_t to slam the door shut!
 */

import { Move, ProbVec, RoundRecord, normalizedEntropy } from './types';

export interface VolatilityState {
  volatilityIndex: number; // 0 (stable predictable) .. 1 (chaotic / shifting)
  cusumSignal: number;
  driftDetected: boolean;
  selfExploitability: number; // 0 (safe) .. 1 (being exploited)
  recommendedNashBeta: number;
}

export class JNVVolatilityMonitor {
  private surpriseEma = 0.55;
  private rewardEma = 0.0;
  private cusumPos = 0.0;
  private meanLoss = 0.0;
  private sampleCount = 0;

  reset(): void {
    this.surpriseEma = 0.55;
    this.rewardEma = 0.0;
    this.cusumPos = 0.0;
    this.meanLoss = 0.0;
    this.sampleCount = 0;
  }

  /**
   * Observe the outcome of a completed round and evaluate regime drift & exploitability.
   */
  observe(
    predictedPlayerDist: ProbVec,
    actualPlayerMove: Move,
    npcScore: -1 | 0 | 1,
    history: readonly RoundRecord[],
    driftThreshold: number,
    nashFloor: number,
    nashCeiling: number,
    edgeStrength: number
  ): VolatilityState {
    this.sampleCount++;

    // 1. Surprise (normalized negative log likelihood / Brier residual)
    const pActual = Math.max(0.02, predictedPlayerDist[actualPlayerMove]);
    const nllNorm = Math.min(1, -Math.log(pActual) / Math.log(12));
    this.surpriseEma = 0.8 * this.surpriseEma + 0.2 * nllNorm;

    // 2. Rolling NPC payoff EMA (+1 win, 0 draw, -1 loss)
    this.rewardEma = 0.82 * this.rewardEma + 0.18 * npcScore;

    // 3. Page-Hinkley CUSUM on loss signal (loss = -npcScore in [-1, 1])
    const instLoss = -npcScore;
    this.meanLoss = this.meanLoss + (instLoss - this.meanLoss) / Math.min(this.sampleCount, 14);
    const deltaTolerance = 0.18;
    this.cusumPos = Math.max(0, this.cusumPos + (instLoss - this.meanLoss - deltaTolerance));

    let driftDetected = false;
    if (this.cusumPos > driftThreshold && this.sampleCount >= 4) {
      driftDetected = true;
      // Partially reset CUSUM accumulator after triggering adaptation pulse
      this.cusumPos *= 0.35;
    }

    // 4. Self-Exploitability: Measure entropy of JNV1.0's recent 12 moves + losing streak pressure
    const windowSize = Math.min(12, history.length);
    const selfCounts: [number, number, number] = [0.25, 0.25, 0.25];
    for (let i = history.length - windowSize; i < history.length; i++) {
      selfCounts[history[i].npcMove] += 1;
    }
    const selfSum = selfCounts[0] + selfCounts[1] + selfCounts[2];
    const selfEnt = normalizedEntropy([
      selfCounts[0] / selfSum,
      selfCounts[1] / selfSum,
      selfCounts[2] / selfSum,
    ]);

    const lowSelfEntropyPenalty = Math.max(0, 1 - selfEnt) * 0.65;
    const losingPressure = Math.max(0, -this.rewardEma); // 0 if winning/even, up to 1 if getting crushed
    const selfExploitability = Math.max(
      0,
      Math.min(1, losingPressure * 0.78 + lowSelfEntropyPenalty * (0.25 + 0.75 * losingPressure))
    );

    // 5. Composite Volatility Index
    const volatilityIndex = Math.max(
      0,
      Math.min(1, 0.45 * this.surpriseEma + 0.35 * Math.min(1, this.cusumPos / driftThreshold) + 0.2 * selfExploitability)
    );

    // 6. Compute adaptive Nash Equilibrium mixing beta_t
    // Early rounds (n < 3) lean heavily toward Nash Equilibrium to avoid blind guessing
    const warmupBlend = this.sampleCount < 3 ? (3 - this.sampleCount) * 0.24 : 0;
    const winningDampener = this.rewardEma > 0.08 ? Math.max(0.2, 1 - this.rewardEma * 1.4) : 1.0;
    const weakEdgeBlend = Math.max(0, 0.34 - edgeStrength) * 0.72 * winningDampener;
    const defensiveBlend = selfExploitability * 0.65 + (driftDetected ? 0.16 : 0);

    const rawBeta = nashFloor + warmupBlend + weakEdgeBlend + defensiveBlend;
    const recommendedNashBeta = Math.max(nashFloor, Math.min(nashCeiling, rawBeta));

    return {
      volatilityIndex,
      cusumSignal: this.cusumPos,
      driftDetected,
      selfExploitability,
      recommendedNashBeta,
    };
  }
}
