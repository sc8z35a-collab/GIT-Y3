/**
 * JNV1.0 (Janken Non-stationary Inference & Volatility Core v1.0)
 *
 * Complete 7-layer autonomous Rock-Scissors-Paper decision engine.
 *
 * Strict Zero-Cheating Protocol:
 *   1. Before the player selects a move for round R, `commitNextMove()` computes
 *      JNV1.0's policy purely from historical rounds [1 .. R-1], samples JNV1.0's
 *      move, and seals it with a verifiable FIPS 180-4 SHA-256 CommitSeal.
 *   2. Once the human locks in their hand, `revealAndObserve(playerMove, latencyMs)`
 *      reveals the pre-committed move, verifies the SHA-256 digest, updates all
 *      9+3 base predictors, 36 meta-experts, Hedge weights, and CUSUM drift monitor,
 *      and immediately seals the NEXT round!
 */

import { ArbiterDecision, JNVExpertArbiter } from './arbiter';
import { createCommitSeal, generateSalt, verifyCommitSeal } from './cryptoCommit';
import { CandidateExpert, expandMetaBank } from './metaBank';
import { JNV_PERSONAS } from './personas';
import { JNVPredictorSuite } from './predictors';
import {
  BehavioralProfile,
  CommitSeal,
  JNVPersonaConfig,
  JNVPersonaId,
  JNVRoundTelemetry,
  MOVE_META,
  Move,
  ProbVec,
  RoundRecord,
  evaluatePlayerOutcome,
  normalizeProb,
  normalizedEntropy,
  npcPayoff,
} from './types';
import { JNVVolatilityMonitor, VolatilityState } from './volatility';

interface PendingCommit {
  round: number;
  chosenNpcMove: Move;
  seal: CommitSeal;
  experts: CandidateExpert[];
  arbiter: ArbiterDecision;
  policyDist: ProbVec;
  nashBlendBeta: number;
  effectiveTemp: number;
}

export class JNV1Core {
  private persona: JNVPersonaConfig;
  private readonly predictors = new JNVPredictorSuite();
  private readonly arbiter = new JNVExpertArbiter();
  private readonly volatility = new JNVVolatilityMonitor();
  private readonly rng: () => number;

  private history: RoundRecord[] = [];
  private aikoChain = 0;
  private lastVolatility: VolatilityState = {
    volatilityIndex: 0.45,
    cusumSignal: 0,
    driftDetected: false,
    selfExploitability: 0,
    recommendedNashBeta: 0.55,
  };

  private pending: PendingCommit | null = null;
  private lastTelemetry: JNVRoundTelemetry | null = null;

  constructor(personaId: JNVPersonaId = 'apex', rng: () => number = Math.random) {
    this.persona = JNV_PERSONAS[personaId];
    this.rng = rng;
    this.commitNextMove();
  }

  getPersona(): JNVPersonaConfig {
    return this.persona;
  }

  setPersona(personaId: JNVPersonaId): void {
    this.persona = JNV_PERSONAS[personaId];
    // Re-compute pre-commit for upcoming round under new persona without wiping learned history
    this.pending = null;
    this.commitNextMove();
  }

  reset(personaId?: JNVPersonaId): void {
    if (personaId) this.persona = JNV_PERSONAS[personaId];
    this.predictors.reset();
    this.arbiter.reset();
    this.volatility.reset();
    this.history = [];
    this.aikoChain = 0;
    this.lastTelemetry = null;
    this.lastVolatility = {
      volatilityIndex: 0.45,
      cusumSignal: 0,
      driftDetected: false,
      selfExploitability: 0,
      recommendedNashBeta: Math.max(this.persona.nashFloor, 0.55),
    };
    this.pending = null;
    this.commitNextMove();
  }

  getHistory(): readonly RoundRecord[] {
    return this.history;
  }

  getCurrentSeal(): CommitSeal {
    if (!this.pending) this.commitNextMove();
    return this.pending!.seal;
  }

  getLastTelemetry(): JNVRoundTelemetry | null {
    return this.lastTelemetry;
  }

  /**
   * Step 1 (Pre-Throw): Compute JNV1.0's move strictly from past history and seal it with SHA-256.
   */
  commitNextMove(): CommitSeal {
    const nextRound = this.history.length + 1;
    const basePredictions = this.predictors.predictAll(
      this.history,
      this.persona.enableSelfMirror
    );
    const experts = expandMetaBank(basePredictions);
    const arbiterDecision = this.arbiter.aggregate(
      experts,
      this.persona,
      this.lastVolatility.driftDetected
    );

    // Layer 5: Nash-Equilibrium Risk-Regulated Boltzmann Action Selector
    const nashBeta =
      this.history.length === 0
        ? 0.92 // Round 1: slight empirical human Rock-opening hedge (8% Paper lean) + 92% pure Nash!
        : Math.max(
            this.persona.nashFloor,
            Math.min(
              this.persona.nashCeiling,
              this.lastVolatility.recommendedNashBeta * (1 - 0.35 * arbiterDecision.edgeStrength) +
                this.persona.nashFloor * 0.35
            )
          );

    const ev = arbiterDecision.aggregatedNpcEv;
    const effTemp =
      this.persona.actionTemperature * (1 + 0.5 * this.lastVolatility.volatilityIndex);

    let exploitPolicy: ProbVec;
    if (this.history.length === 0) {
      // Weak universal human opening prior (humans open with Rock slightly more often -> Paper lean)
      exploitPolicy = [0.29, 0.31, 0.4];
    } else {
      const maxEv = Math.max(ev[0], ev[1], ev[2]);
      const e0 = Math.exp(Math.max(-20, (ev[0] - maxEv) / Math.max(0.05, effTemp)));
      const e1 = Math.exp(Math.max(-20, (ev[1] - maxEv) / Math.max(0.05, effTemp)));
      const e2 = Math.exp(Math.max(-20, (ev[2] - maxEv) / Math.max(0.05, effTemp)));
      exploitPolicy = normalizeProb([e0, e1, e2]);
    }

    const policyDist = normalizeProb([
      (1 - nashBeta) * exploitPolicy[0] + nashBeta * (1 / 3),
      (1 - nashBeta) * exploitPolicy[1] + nashBeta * (1 / 3),
      (1 - nashBeta) * exploitPolicy[2] + nashBeta * (1 / 3),
    ]);

    // Sample move cleanly from policyDist
    const r = this.rng();
    let chosenNpcMove: Move = 2;
    if (r < policyDist[0]) chosenNpcMove = 0;
    else if (r < policyDist[0] + policyDist[1]) chosenNpcMove = 1;

    const salt = generateSalt(this.rng);
    const seal = createCommitSeal(nextRound, chosenNpcMove, salt);

    this.pending = {
      round: nextRound,
      chosenNpcMove,
      seal,
      experts,
      arbiter: arbiterDecision,
      policyDist,
      nashBlendBeta: nashBeta,
      effectiveTemp: effTemp,
    };

    return seal;
  }

  /**
   * Step 2 (Reveal & Learn): Reveal pre-committed move against the player's actual move,
   * verify SHA-256 seal, update all online models, emit explainable telemetry, and seal the next round.
   */
  revealAndObserve(playerMove: Move, decisionLatencyMs = 1800): JNVRoundTelemetry {
    if (!this.pending) {
      this.commitNextMove();
    }
    const commit = this.pending!;
    this.pending = null;

    const npcMove = commit.chosenNpcMove;
    const verifiedSeal = verifyCommitSeal(commit.seal, npcMove);
    const playerOutcome = evaluatePlayerOutcome(playerMove, npcMove);
    const score = npcPayoff(npcMove, playerMove);

    const prevRecord = this.history.length > 0 ? this.history[this.history.length - 1] : null;
    const playerDelta =
      prevRecord !== null ? ((((playerMove - prevRecord.playerMove) % 3) + 3) % 3 as Move) : null;

    const record: RoundRecord = {
      round: commit.round,
      playerMove,
      npcMove,
      playerOutcome,
      npcScore: score,
      decisionLatencyMs,
      aikoChainBefore: this.aikoChain,
      playerDelta,
      jointCode: playerMove * 3 + npcMove,
    };

    this.history.push(record);
    this.aikoChain = playerOutcome === 'DRAW' ? this.aikoChain + 1 : 0;

    // Update Volatility / CUSUM Drift Monitor
    const volState = this.volatility.observe(
      commit.arbiter.aggregatedPlayerDist,
      playerMove,
      score,
      this.history,
      this.persona.driftThreshold,
      this.persona.nashFloor,
      this.persona.nashCeiling,
      commit.arbiter.edgeStrength
    );
    this.lastVolatility = volState;

    // Update Expert Arbiter discounted payoffs (with drift forgetting boost if triggered)
    this.arbiter.updateAfterReveal(
      commit.experts,
      playerMove,
      this.persona,
      volState.driftDetected
    );

    // Update all 9+3 Base Predictors
    this.predictors.observe(this.history);

    const profile = this.computeBehavioralProfile();
    const insightJp = this.composeInsightJp(commit, volState, playerOutcome);

    const telemetry: JNVRoundTelemetry = {
      round: commit.round,
      persona: this.persona,
      predictedPlayerDist: commit.arbiter.aggregatedPlayerDist,
      npcExpectedValues: commit.arbiter.aggregatedNpcEv,
      npcPolicyDist: commit.policyDist,
      chosenNpcMove: npcMove,
      actualPlayerMove: playerMove,
      playerOutcome,
      nashBlendBeta: commit.nashBlendBeta,
      effectiveTemperature: commit.effectiveTemp,
      volatilityIndex: volState.volatilityIndex,
      driftDetected: volState.driftDetected,
      cusumSignal: volState.cusumSignal,
      selfExploitability: volState.selfExploitability,
      topExperts: commit.arbiter.snapshots.slice(0, 6),
      activeExpertCount: commit.experts.length,
      insightJp,
      seal: verifiedSeal,
      profile,
    };

    this.lastTelemetry = telemetry;

    // Immediately pre-commit the NEXT round before the player even thinks of clicking!
    this.commitNextMove();

    return telemetry;
  }

  /**
   * Compute live human behavioral analytics for the Inspector UI.
   */
  computeBehavioralProfile(): BehavioralProfile {
    const n = this.history.length;
    if (n === 0) {
      return {
        sampleCount: 0,
        moveFrequencies: [1 / 3, 1 / 3, 1 / 3],
        playerEntropy: 1,
        winStayRate: 0.5,
        loseShiftRate: 0.5,
        drawChangeRate: 0.5,
        avgLatencyMs: 0,
        dominantHabitJp: 'データ収集中（初手はナッシュ均衡ベース）',
      };
    }

    const counts: [number, number, number] = [0, 0, 0];
    let winTrials = 0;
    let winStays = 0;
    let loseTrials = 0;
    let loseShifts = 0;
    let drawTrials = 0;
    let drawChanges = 0;
    let latencySum = 0;

    for (let i = 0; i < n; i++) {
      const r = this.history[i];
      counts[r.playerMove]++;
      latencySum += r.decisionLatencyMs;

      if (i > 0) {
        const prev = this.history[i - 1];
        const stayed = r.playerMove === prev.playerMove;
        if (prev.playerOutcome === 'WIN') {
          winTrials++;
          if (stayed) winStays++;
        } else if (prev.playerOutcome === 'LOSS') {
          loseTrials++;
          if (!stayed) loseShifts++;
        } else {
          drawTrials++;
          if (!stayed) drawChanges++;
        }
      }
    }

    const moveFrequencies = normalizeProb(counts);
    const playerEntropy = normalizedEntropy(moveFrequencies);
    const winStayRate = winTrials > 0 ? winStays / winTrials : 0.5;
    const loseShiftRate = loseTrials > 0 ? loseShifts / loseTrials : 0.65;
    const drawChangeRate = drawTrials > 0 ? drawChanges / drawTrials : 0.65;

    let dominantHabitJp = '均衡の取れた手配り（高エントロピー）';
    const maxFreq = Math.max(...moveFrequencies);
    const maxMove = moveFrequencies.indexOf(maxFreq) as Move;

    if (n < 3) {
      dominantHabitJp = '序盤観測フェーズ（行動プロファイル構築中）';
    } else if (maxFreq >= 0.48) {
      dominantHabitJp = `「${MOVE_META[maxMove].jp}」への強い選好バイアス (${Math.round(maxFreq * 100)}%)`;
    } else if (winTrials >= 2 && winStayRate >= 0.72) {
      dominantHabitJp = '勝利後の同手継続（Win-Stay）傾向が顕著';
    } else if (loseTrials >= 2 && loseShiftRate >= 0.8) {
      dominantHabitJp = '敗北後の手変更（Lose-Shift）反射を捕捉';
    } else if (drawTrials >= 2 && drawChangeRate >= 0.8) {
      dominantHabitJp = 'あいこ局面での手変え傾向を検知';
    } else if (playerEntropy < 0.86) {
      dominantHabitJp = '非一様な手偏りを統計的に検出中';
    }

    return {
      sampleCount: n,
      moveFrequencies,
      playerEntropy,
      winStayRate,
      loseShiftRate,
      drawChangeRate,
      avgLatencyMs: Math.round(latencySum / n),
      dominantHabitJp,
    };
  }

  private composeInsightJp(
    commit: PendingCommit,
    vol: VolatilityState,
    outcome: 'WIN' | 'LOSS' | 'DRAW'
  ): string {
    if (commit.round === 1) {
      return '初手のためナッシュ均衡(92%)を軸に微弱な初手グー対策を混合して事前封印。';
    }
    if (vol.driftDetected) {
      return `CUSUM変化点検知(S=${vol.cusumSignal.toFixed(2)}) — 戦略転換を捕捉し専門家スコアを急速減衰。`;
    }
    if (vol.selfExploitability > 0.52) {
      return `自己被搾取警戒(${Math.round(vol.selfExploitability * 100)}%) — ナッシュ混合率を${Math.round(commit.nashBlendBeta * 100)}%へ引き上げ防御。`;
    }
    const top = commit.arbiter.topExpert;
    if (!top) {
      return '均衡分布に基づき決定。';
    }
    const predMove = commit.arbiter.aggregatedPlayerDist.indexOf(
      Math.max(...commit.arbiter.aggregatedPlayerDist)
    ) as Move;
    const predPct = Math.round(commit.arbiter.aggregatedPlayerDist[predMove] * 100);
    const verdict = outcome === 'LOSS' ? '的中' : outcome === 'DRAW' ? '拮抗' : '読み外し・即時学習';
    return `主導:「${top.labelJp}」(重み${Math.round(top.weight * 100)}%) → 「${MOVE_META[predMove].jp}」予測(${predPct}%) [${verdict}]`;
  }
}
