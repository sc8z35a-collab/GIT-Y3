/**
 * JNV1.0 Layer 2 — 6-Level Iocaine-Style Meta-Rotation Stack.
 *
 * Wraps each base predictor across 3 recursive mind-reading meta-levels:
 *  - M0 (Direct Exploit): Play counter(predicted_player_move)
 *  - M1 (2nd-Order Read): Player anticipates M0 and plays counter(M0) -> Play counter(counter(M0))
 *  - M2 (3rd-Order Read): One further recursive step -> Play predicted_player_move
 *
 * Combined across both Player-stream predictors (P1..P9) and Self-Mirror predictors (S1..S3),
 * this generates up to 36 distinct competing Experts evaluated simultaneously every round.
 */

import {
  BasePrediction,
  MetaLevel,
  Move,
  ProbVec,
  counterOf,
  expectedNpcValues,
  normalizeProb,
  rotateMove,
} from './types';

export interface CandidateExpert {
  id: string;
  predictorId: string;
  labelJp: string;
  stream: 'player' | 'self';
  metaLevel: MetaLevel;
  /** Probability distribution over what the PLAYER is predicted to throw under this meta-hypothesis */
  effectivePlayerDist: ProbVec;
  /** Expected value vector [EV(R), EV(S), EV(P)] for NPC actions under this expert */
  npcEv: ProbVec;
  /** Recommended NPC action distribution (softened around best EV response) */
  recommendedDist: ProbVec;
  /** Greedy best NPC action */
  recommendedNpcMove: Move;
  confidence: number;
  detail: string;
}

const META_SUFFIX_JP: Record<MetaLevel, string> = {
  0: '直読 M0',
  1: '裏読 M1',
  2: '深読 M2',
};

/**
 * Rotate a predicted player distribution by `metaLevel` steps of recursive counter-thinking.
 * - M0: Player plays dist -> NPC should counter dist.
 * - M1: Player expects NPC to play counter(dist), so player plays counter(counter(dist)) = rotate(+1).
 * - M2: Player rotates one further step = rotate(+2).
 */
function rotatePlayerDistribution(dist: ProbVec, metaLevel: MetaLevel): ProbVec {
  if (metaLevel === 0) return dist;
  // counter(x) = (x + 2) mod 3, so counter(counter(x)) = (x + 4) mod 3 = (x + 1) mod 3!
  // For metaLevel k, player shifts by (+k) mod 3 relative to base prediction.
  const out: [number, number, number] = [0, 0, 0];
  for (let m = 0; m < 3; m++) {
    const shifted = rotateMove(m as Move, metaLevel);
    out[shifted] = dist[m];
  }
  return normalizeProb(out);
}

/**
 * Convert expected values EV(R), EV(S), EV(P) into a sharp yet smooth NPC policy vector.
 */
function evToRecommendedDist(ev: ProbVec, confidence: number): { dist: ProbVec; best: Move } {
  let best: Move = 0;
  if (ev[1] > ev[best]) best = 1;
  if (ev[2] > ev[best]) best = 2;

  // Sharpness scales with confidence so unconfident experts remain gentle
  const beta = 2.8 + 4.2 * confidence;
  const maxEv = Math.max(ev[0], ev[1], ev[2]);
  const w0 = Math.exp(beta * (ev[0] - maxEv));
  const w1 = Math.exp(beta * (ev[1] - maxEv));
  const w2 = Math.exp(beta * (ev[2] - maxEv));

  // If EV is nearly flat (no signal), keep pure uniform
  const evSpan = maxEv - Math.min(ev[0], ev[1], ev[2]);
  if (evSpan < 0.015) {
    return { dist: [1 / 3, 1 / 3, 1 / 3], best: counterOf(0) };
  }

  return {
    dist: normalizeProb([w0, w1, w2]),
    best,
  };
}

export function expandMetaBank(predictions: readonly BasePrediction[]): CandidateExpert[] {
  const experts: CandidateExpert[] = [];
  const levels: readonly MetaLevel[] = [0, 1, 2];

  for (const pred of predictions) {
    for (const metaLevel of levels) {
      const effectivePlayerDist = rotatePlayerDistribution(pred.dist, metaLevel);
      const npcEv = expectedNpcValues(effectivePlayerDist);
      const { dist: recommendedDist, best: recommendedNpcMove } = evToRecommendedDist(
        npcEv,
        pred.confidence
      );

      experts.push({
        id: `${pred.id}_M${metaLevel}`,
        predictorId: pred.id,
        labelJp: `${pred.labelJp} [${META_SUFFIX_JP[metaLevel]}]`,
        stream: pred.stream,
        metaLevel,
        effectivePlayerDist,
        npcEv,
        recommendedDist,
        recommendedNpcMove,
        confidence: pred.confidence,
        detail: pred.detail,
      });
    }
  }

  return experts;
}
