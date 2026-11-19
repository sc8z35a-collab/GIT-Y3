/**
 * JNV1.0 (Janken Non-stationary Inference & Volatility Core v1.0)
 * Core mathematical types and cyclic group Z_3 algebra for Rock-Scissors-Paper.
 */

export const ROCK = 0 as const;
export const SCISSORS = 1 as const;
export const PAPER = 2 as const;

export type Move = typeof ROCK | typeof SCISSORS | typeof PAPER;

export const ALL_MOVES: readonly Move[] = [ROCK, SCISSORS, PAPER] as const;

export const MOVE_META: Record<
  Move,
  { id: string; jp: string; kana: string; en: string; short: string; key: string }
> = {
  [ROCK]: { id: 'rock', jp: 'グー', kana: '石', en: 'ROCK', short: 'R', key: '1' },
  [SCISSORS]: { id: 'scissors', jp: 'チョキ', kana: '鋏', en: 'SCISSORS', short: 'S', key: '2' },
  [PAPER]: { id: 'paper', jp: 'パー', kana: '紙', en: 'PAPER', short: 'P', key: '3' },
};

/** Probability simplex over [ROCK, SCISSORS, PAPER] */
export type ProbVec = [number, number, number];

/** Outcome from the HUMAN PLAYER's perspective */
export type PlayerOutcome = 'WIN' | 'LOSS' | 'DRAW';

/** Return the move that BEATS `move` (e.g., counterOf(ROCK) = PAPER) */
export function counterOf(move: Move): Move {
  return ((move + 2) % 3) as Move;
}

/** Return the move that LOSES TO `move` (e.g., losesTo(ROCK) = SCISSORS) */
export function losesTo(move: Move): Move {
  return ((move + 1) % 3) as Move;
}

/** Rotate a move by `steps` in Z_3 (counter = +2 mod 3, double-counter = +1 mod 3) */
export function rotateMove(move: Move, steps: number): Move {
  return (((move + steps) % 3) + 3) % 3 as Move;
}

/** Evaluate round outcome from the HUMAN PLAYER's perspective */
export function evaluatePlayerOutcome(playerMove: Move, npcMove: Move): PlayerOutcome {
  if (playerMove === npcMove) return 'DRAW';
  return losesTo(playerMove) === npcMove ? 'WIN' : 'LOSS';
}

/** Zero-sum payoff from the NPC's perspective: +1 NPC wins, 0 draw, -1 NPC loses */
export function npcPayoff(npcMove: Move, playerMove: Move): -1 | 0 | 1 {
  if (npcMove === playerMove) return 0;
  return losesTo(npcMove) === playerMove ? 1 : -1;
}

/** Expected NPC payoff vector given predicted probability distribution of the PLAYER's move */
export function expectedNpcValues(predictedPlayerDist: ProbVec): ProbVec {
  // EV(ROCK) = P(SCISSORS) - P(PAPER)
  // EV(SCISSORS) = P(PAPER) - P(ROCK)
  // EV(PAPER) = P(ROCK) - P(SCISSORS)
  const [pR, pS, pP] = predictedPlayerDist;
  return [pS - pP, pP - pR, pR - pS];
}

/** Normalize a 3-element non-negative vector onto the probability simplex */
export function normalizeProb(v: [number, number, number]): ProbVec {
  const s = v[0] + v[1] + v[2];
  if (!Number.isFinite(s) || s <= 1e-12) {
    return [1 / 3, 1 / 3, 1 / 3];
  }
  return [v[0] / s, v[1] / s, v[2] / s];
}

/** Normalized Shannon entropy in [0, 1] (1 = perfectly uniform random) */
export function normalizedEntropy(p: ProbVec): number {
  let h = 0;
  for (let i = 0; i < 3; i++) {
    const x = p[i];
    if (x > 1e-12) h -= x * Math.log(x);
  }
  return Math.max(0, Math.min(1, h / Math.log(3)));
}

/** Historical round record consumed by JNV1.0 predictors */
export interface RoundRecord {
  round: number;
  playerMove: Move;
  npcMove: Move;
  playerOutcome: PlayerOutcome;
  npcScore: -1 | 0 | 1;
  decisionLatencyMs: number;
  aikoChainBefore: number;
  playerDelta: Move | null; // (P_t - P_{t-1}) mod 3
  jointCode: number; // 0..8 = 3 * P_t + N_t
}

/** Output of a single base predictor before meta-rotation */
export interface BasePrediction {
  id: string;
  labelJp: string;
  /** Predicted distribution over the target agent's next move */
  dist: ProbVec;
  /** Scalar confidence in [0, 1] based on sample support & distribution sharpness */
  confidence: number;
  /** Whether this predictor models the Player stream or JNV1.0's own stream */
  stream: 'player' | 'self';
  /** Short technical note for inspector telemetry */
  detail: string;
}

/** Meta-rotation level (Iocaine-style recursive mind-reading depth) */
export type MetaLevel = 0 | 1 | 2;

/** Snapshot of an individual competing expert in the JNV1.0 ensemble */
export interface ExpertSnapshot {
  id: string;
  predictorId: string;
  labelJp: string;
  stream: 'player' | 'self';
  metaLevel: MetaLevel;
  recommendedNpcMove: Move;
  recommendedDist: ProbVec;
  confidence: number;
  discountedScore: number;
  weight: number;
  hitRate: number;
  detail: string;
}

/** Provably fair pre-commit cryptographic seal generated BEFORE player moves */
export interface CommitSeal {
  round: number;
  hashHex: string;
  shortHash: string;
  salt: string;
  /** Revealed only after the player submits their move */
  revealedMove?: Move;
  verified?: boolean;
}

export type JNVPersonaId = 'zero' | 'apex' | 'mirror' | 'stochastic';

export interface JNVPersonaConfig {
  id: JNVPersonaId;
  code: string;
  nameJp: string;
  subtitleJp: string;
  descriptionJp: string;
  /** Base exponential discount factor for expert scores (lower = faster forgetting) */
  scoreDecay: number;
  /** Hedge learning rate eta */
  learningRate: number;
  /** Fixed-share redistribution floor (keeps dormant experts ready on regime shift) */
  fixedShareAlpha: number;
  /** Minimum Nash Equilibrium uniform mix floor */
  nashFloor: number;
  /** Maximum Nash blend when volatility or self-exploitability spikes */
  nashCeiling: number;
  /** Softmax action selection temperature (lower = sharper exploitation) */
  actionTemperature: number;
  /** Enable full 3-tier self-mirror meta-levels (M3..M5) */
  enableSelfMirror: boolean;
  /** Multiplier on Wang-Xu-Zhou psychological & Aiko-chain experts */
  psychWeightBoost: number;
  /** Page-Hinkley CUSUM sensitivity threshold */
  driftThreshold: number;
}

export interface BehavioralProfile {
  sampleCount: number;
  moveFrequencies: ProbVec;
  playerEntropy: number;
  winStayRate: number;
  loseShiftRate: number;
  drawChangeRate: number;
  avgLatencyMs: number;
  dominantHabitJp: string;
}

/** Complete explainable telemetry snapshot emitted after each round */
export interface JNVRoundTelemetry {
  round: number;
  persona: JNVPersonaConfig;
  predictedPlayerDist: ProbVec;
  npcExpectedValues: ProbVec;
  npcPolicyDist: ProbVec;
  chosenNpcMove: Move;
  actualPlayerMove: Move;
  playerOutcome: PlayerOutcome;
  nashBlendBeta: number;
  effectiveTemperature: number;
  volatilityIndex: number; // 0..1
  driftDetected: boolean;
  cusumSignal: number;
  selfExploitability: number; // 0..1
  topExperts: ExpertSnapshot[];
  activeExpertCount: number;
  insightJp: string;
  seal: CommitSeal;
  profile: BehavioralProfile;
}
