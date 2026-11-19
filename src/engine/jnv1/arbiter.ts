/**
 * JNV1.0 Layer 3 — Non-Stationary Discounted Hedge / Fixed-Share EXP3-MWU Arbiter.
 *
 * Tracks every competing expert's online discounted cumulative zero-sum reward
 * and blends weights using Herbster-Warmuth Fixed-Share mixing so that whenever
 * a human player switches tactics mid-match, dormant experts immediately wake up
 * and seize control within 2-3 rounds.
 */

import { CandidateExpert } from './metaBank';
import {
  ExpertSnapshot,
  JNVPersonaConfig,
  Move,
  ProbVec,
  normalizeProb,
  npcPayoff,
} from './types';

interface ExpertLedger {
  discountedScore: number;
  recentHits: number;
  recentTrials: number;
  lastReward: number;
}

export interface ArbiterDecision {
  aggregatedNpcEv: ProbVec;
  aggregatedPlayerDist: ProbVec;
  snapshots: ExpertSnapshot[];
  topExpert: ExpertSnapshot | null;
  edgeStrength: number; // 0..1 confidence of predictive advantage
}

export class JNVExpertArbiter {
  private readonly ledger = new Map<string, ExpertLedger>();

  reset(): void {
    this.ledger.clear();
  }

  private getEntry(id: string): ExpertLedger {
    let entry = this.ledger.get(id);
    if (!entry) {
      entry = {
        discountedScore: 0,
        recentHits: 0,
        recentTrials: 0,
        lastReward: 0,
      };
      this.ledger.set(id, entry);
    }
    return entry;
  }

  /**
   * Compute softmax + fixed-share expert weights and aggregate expected NPC action payoffs.
   */
  aggregate(
    experts: readonly CandidateExpert[],
    persona: JNVPersonaConfig,
    driftBoost: boolean
  ): ArbiterDecision {
    if (experts.length === 0) {
      return {
        aggregatedNpcEv: [0, 0, 0],
        aggregatedPlayerDist: [1 / 3, 1 / 3, 1 / 3],
        snapshots: [],
        topExpert: null,
        edgeStrength: 0,
      };
    }

    const eta = driftBoost ? persona.learningRate * 1.45 : persona.learningRate;

    // 1. Compute raw Hedge logits from discounted cumulative score + small prior bias
    const rawLogits: number[] = new Array(experts.length);
    let maxLogit = -Infinity;

    for (let i = 0; i < experts.length; i++) {
      const ex = experts[i];
      const entry = this.getEntry(ex.id);
      let priorBias = 0;

      // Slight preference for direct M0 over deep M2 until proven otherwise (Occam's razor)
      if (ex.metaLevel === 0) priorBias += 0.14;
      else if (ex.metaLevel === 1) priorBias += 0.04;
      else priorBias -= 0.05;

      // Psychological boost for MIRROR persona
      if (
        (ex.predictorId === 'P5_WXZ_PSYCH' || ex.predictorId === 'P7_RUN_REV' || ex.predictorId === 'P9_MIRROR') &&
        persona.psychWeightBoost !== 1.0
      ) {
        priorBias += Math.log(persona.psychWeightBoost);
      }

      // Self-mirror slight conservatism until history proves player is reading JNV
      if (ex.stream === 'self') priorBias -= 0.12;

      const logit = eta * entry.discountedScore + priorBias;
      rawLogits[i] = logit;
      if (logit > maxLogit) maxLogit = logit;
    }

    // 2. Softmax normalization + Herbster-Warmuth Fixed-Share floor
    const rawWeights: number[] = new Array(experts.length);
    let sumW = 0;
    for (let i = 0; i < experts.length; i++) {
      const w = Math.exp(Math.max(-24, Math.min(24, rawLogits[i] - maxLogit)));
      rawWeights[i] = w;
      sumW += w;
    }

    const alpha = persona.fixedShareAlpha;
    const uniformShare = alpha / experts.length;
    const finalWeights: number[] = new Array(experts.length);
    let activeWeightSum = 0;

    // Combine Hedge weight with current predictor signal confidence
    for (let i = 0; i < experts.length; i++) {
      const hedgeW = (1 - alpha) * (rawWeights[i] / sumW) + uniformShare;
      // Modulate by confidence floor so idle/unmatched predictors don't dilute sharp ones
      const effW = hedgeW * (0.12 + 0.88 * experts[i].confidence);
      finalWeights[i] = effW;
      activeWeightSum += effW;
    }

    // Normalize effective weights
    const normWeights: number[] = new Array(experts.length);
    for (let i = 0; i < experts.length; i++) {
      normWeights[i] = activeWeightSum > 1e-12 ? finalWeights[i] / activeWeightSum : 1 / experts.length;
    }

    // 3. Weighted ensemble aggregation of EV(R,S,P) & implied Player Distribution
    const aggEv: [number, number, number] = [0, 0, 0];
    const aggPlayer: [number, number, number] = [0, 0, 0];
    const snapshots: ExpertSnapshot[] = new Array(experts.length);

    for (let i = 0; i < experts.length; i++) {
      const ex = experts[i];
      const w = normWeights[i];
      const entry = this.getEntry(ex.id);

      aggEv[0] += w * ex.npcEv[0];
      aggEv[1] += w * ex.npcEv[1];
      aggEv[2] += w * ex.npcEv[2];

      aggPlayer[0] += w * ex.effectivePlayerDist[0];
      aggPlayer[1] += w * ex.effectivePlayerDist[1];
      aggPlayer[2] += w * ex.effectivePlayerDist[2];

      snapshots[i] = {
        id: ex.id,
        predictorId: ex.predictorId,
        labelJp: ex.labelJp,
        stream: ex.stream,
        metaLevel: ex.metaLevel,
        recommendedNpcMove: ex.recommendedNpcMove,
        recommendedDist: ex.recommendedDist,
        confidence: ex.confidence,
        discountedScore: entry.discountedScore,
        weight: w,
        hitRate: entry.recentTrials > 0.1 ? entry.recentHits / entry.recentTrials : 0.5,
        detail: ex.detail,
      };
    }

    snapshots.sort((a, b) => b.weight - a.weight);

    const maxEv = Math.max(aggEv[0], aggEv[1], aggEv[2]);
    const minEv = Math.min(aggEv[0], aggEv[1], aggEv[2]);
    const edgeStrength = Math.max(0, Math.min(1, (maxEv - minEv) * 1.35));

    return {
      aggregatedNpcEv: aggEv,
      aggregatedPlayerDist: normalizeProb(aggPlayer),
      snapshots,
      topExpert: snapshots[0] ?? null,
      edgeStrength,
    };
  }

  /**
   * Update discounted cumulative payoffs for ALL experts after observing the player's actual move.
   */
  updateAfterReveal(
    experts: readonly CandidateExpert[],
    actualPlayerMove: Move,
    persona: JNVPersonaConfig,
    driftDetected: boolean
  ): void {
    // When regime drift is detected, sharply accelerate forgetting so stale leaders step down immediately!
    const decay = driftDetected ? Math.max(0.55, persona.scoreDecay - 0.22) : persona.scoreDecay;

    for (const ex of experts) {
      const entry = this.getEntry(ex.id);
      // Expected zero-sum reward of this expert's recommended distribution against actualPlayerMove
      const expectedReward =
        ex.recommendedDist[0] * npcPayoff(0, actualPlayerMove) +
        ex.recommendedDist[1] * npcPayoff(1, actualPlayerMove) +
        ex.recommendedDist[2] * npcPayoff(2, actualPlayerMove);

      // Weight reward slightly by whether the expert actually had an opinion (confidence)
      const scaledReward = expectedReward * (0.45 + 0.55 * ex.confidence);

      entry.discountedScore = entry.discountedScore * decay + scaledReward;
      entry.lastReward = expectedReward;

      // Track rolling effective win-equivalent hit rate (win=1, draw=0.5, loss=0)
      entry.recentHits = entry.recentHits * 0.9 + (expectedReward * 0.5 + 0.5);
      entry.recentTrials = entry.recentTrials * 0.9 + 1.0;
    }
  }
}
