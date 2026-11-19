/**
 * JNV1.0 Scientific Validation & Benchmark Suite.
 * Tests JNV1.0 (zero cheating, strict SHA-256 pre-commit before opponent throws)
 * against 8 distinct opponent archetypes including regime-switching and anti-AI bots.
 */

import { JNV1Core } from './JNVCore';
import { JNVPersonaId, Move, RoundRecord, counterOf, rotateMove } from './types';

export interface BenchmarkBotResult {
  botId: string;
  botNameJp: string;
  rounds: number;
  jnvWins: number;
  draws: number;
  jnvLosses: number;
  decisiveWinRate: number; // jnvWins / (jnvWins + jnvLosses)
  netEdgePer100: number; // (wins - losses) / rounds * 100
  allSealsVerified: boolean;
}

/** Deterministic Mulberry32 PRNG for reproducible benchmark results */
function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SyntheticOpponent {
  id: string;
  nameJp: string;
  chooseMove: (round: number, history: readonly RoundRecord[], rng: () => number) => Move;
}

const BENCHMARK_OPPONENTS: SyntheticOpponent[] = [
  {
    id: 'biased_rock',
    nameJp: '偏重型（グー65%偏り）',
    chooseMove: (_r, _h, rng) => {
      const x = rng();
      return x < 0.65 ? 0 : x < 0.83 ? 1 : 2;
    },
  },
  {
    id: 'cyclic_rsp',
    nameJp: '循環リズム型（R→S→P周期）',
    chooseMove: (round) => ((round - 1) % 3) as Move,
  },
  {
    id: 'win_stay_lose_shift',
    nameJp: '人間心理モデル（Win-Stay / Lose-Shift）',
    chooseMove: (_r, hist, rng) => {
      if (hist.length === 0) return Math.floor(rng() * 3) as Move;
      const last = hist[hist.length - 1];
      if (last.playerOutcome === 'WIN') {
        return rng() < 0.8 ? last.playerMove : rotateMove(last.playerMove, 1);
      }
      if (last.playerOutcome === 'LOSS') {
        return rng() < 0.82 ? rotateMove(last.playerMove, 1) : last.playerMove;
      }
      return rotateMove(last.playerMove, rng() < 0.5 ? 1 : 2);
    },
  },
  {
    id: 'copycat',
    nameJp: '模倣型（直前のJNV手をコピー）',
    chooseMove: (_r, hist, rng) => {
      if (hist.length === 0) return Math.floor(rng() * 3) as Move;
      return rng() < 0.88 ? hist[hist.length - 1].npcMove : (Math.floor(rng() * 3) as Move);
    },
  },
  {
    id: 'counter_last_npc',
    nameJp: '後追い対抗型（直前のJNV手に勝つ手）',
    chooseMove: (_r, hist, rng) => {
      if (hist.length === 0) return Math.floor(rng() * 3) as Move;
      return rng() < 0.88
        ? counterOf(hist[hist.length - 1].npcMove)
        : (Math.floor(rng() * 3) as Move);
    },
  },
  {
    id: 'pattern_seq',
    nameJp: '複合パターン型（R-R-P-S-P周期）',
    chooseMove: (round) => ([0, 0, 2, 1, 2] as const)[(round - 1) % 5],
  },
  {
    id: 'regime_switcher',
    nameJp: '非定常・途中戦術切替型（Drift試験）',
    chooseMove: (round, hist, rng) => {
      // Switches strategy every 40 rounds!
      const phase = Math.floor((round - 1) / 40) % 3;
      if (phase === 0) {
        return rng() < 0.72 ? 0 : (Math.floor(rng() * 3) as Move);
      }
      if (phase === 1) {
        return ((round - 1) % 3) as Move;
      }
      if (hist.length === 0) return 1;
      return counterOf(hist[hist.length - 1].npcMove);
    },
  },
  {
    id: 'nash_random',
    nameJp: '完全ランダム・ナッシュ均衡（理論下限試験）',
    chooseMove: (_r, _h, rng) => Math.floor(rng() * 3) as Move,
  },
];

export function runJNV1Benchmark(
  personaId: JNVPersonaId = 'apex',
  roundsPerBot = 200,
  seed = 20261119
): BenchmarkBotResult[] {
  const results: BenchmarkBotResult[] = [];

  for (let idx = 0; idx < BENCHMARK_OPPONENTS.length; idx++) {
    const bot = BENCHMARK_OPPONENTS[idx];
    const jnvRng = createMulberry32(seed + idx * 997);
    const botRng = createMulberry32(seed + 77777 + idx * 1301);
    const jnv = new JNV1Core(personaId, jnvRng);

    let jnvWins = 0;
    let draws = 0;
    let jnvLosses = 0;
    let allSealsVerified = true;

    for (let round = 1; round <= roundsPerBot; round++) {
      // Ensure JNV1.0 has ALREADY sealed its move before opponent chooses!
      const preSeal = jnv.getCurrentSeal();
      const playerMove = bot.chooseMove(round, jnv.getHistory(), botRng);
      const latency = 900 + Math.floor(botRng() * 2400);
      const telemetry = jnv.revealAndObserve(playerMove, latency);

      if (!telemetry.seal.verified || telemetry.seal.hashHex !== preSeal.hashHex) {
        allSealsVerified = false;
      }

      if (telemetry.playerOutcome === 'LOSS') jnvWins++;
      else if (telemetry.playerOutcome === 'WIN') jnvLosses++;
      else draws++;
    }

    const decisive = jnvWins + jnvLosses;
    results.push({
      botId: bot.id,
      botNameJp: bot.nameJp,
      rounds: roundsPerBot,
      jnvWins,
      draws,
      jnvLosses,
      decisiveWinRate: decisive > 0 ? jnvWins / decisive : 0.5,
      netEdgePer100: ((jnvWins - jnvLosses) / roundsPerBot) * 100,
      allSealsVerified,
    });
  }

  return results;
}
