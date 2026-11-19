/**
 * JNV1.0 Layer 6 — Architectural Personas & Calibration Profiles.
 * Every persona executes the genuine JNV1.0 core engine with zero cheating;
 * differences arise strictly from mathematical meta-depth, forgetting rate,
 * psychological priors, and Nash equilibrium risk floors.
 */

import { JNVPersonaConfig, JNVPersonaId } from './types';

export const JNV_PERSONAS: Record<JNVPersonaId, JNVPersonaConfig> = {
  zero: {
    id: 'zero',
    code: 'JNV1.0-ZERO',
    nameJp: '均衡の師範',
    subtitleJp: '標準適応 · バランス型',
    descriptionJp:
      '全9種の基本予測器と3階層メタ読みを調和させ、自然な均衡混合で読み合いを楽しめる標準コア構成。',
    scoreDecay: 0.87,
    learningRate: 1.35,
    fixedShareAlpha: 0.08,
    nashFloor: 0.14,
    nashCeiling: 0.72,
    actionTemperature: 0.24,
    enableSelfMirror: true,
    psychWeightBoost: 1.05,
    driftThreshold: 2.3,
  },
  apex: {
    id: 'apex',
    code: 'JNV1.0-APEX',
    nameJp: '深層読心・極',
    subtitleJp: '競技最上位 · 全36専門家稼働',
    descriptionJp:
      '自己鏡像メタ階層(M0〜M5)・最長一致スナイパー・急峻なCUSUM変化点検知を全開放した本気の競技仕様。',
    scoreDecay: 0.84,
    learningRate: 1.85,
    fixedShareAlpha: 0.06,
    nashFloor: 0.04,
    nashCeiling: 0.62,
    actionTemperature: 0.13,
    enableSelfMirror: true,
    psychWeightBoost: 1.12,
    driftThreshold: 1.85,
  },
  mirror: {
    id: 'mirror',
    code: 'JNV1.0-MIRROR',
    nameJp: '心理鏡・裏読み',
    subtitleJp: '人間行動心理特化 · あいこ罠',
    descriptionJp:
      'Wang-Xu-Zhou条件応答・連打反動・思考テンポ遅延・裏読み階層を重点強化し、人間の心理的癖を突く特化構成。',
    scoreDecay: 0.85,
    learningRate: 1.55,
    fixedShareAlpha: 0.09,
    nashFloor: 0.08,
    nashCeiling: 0.68,
    actionTemperature: 0.18,
    enableSelfMirror: true,
    psychWeightBoost: 1.75,
    driftThreshold: 2.1,
  },
  stochastic: {
    id: 'stochastic',
    code: 'JNV1.0-VOID',
    nameJp: '無心・ナッシュ均衡',
    subtitleJp: '理論防御特化 · 難攻不落型',
    descriptionJp:
      '高いナッシュ均衡混合床を維持して読み合いの隙を消し、明らかな偏りのみを静かに咎める理論防御構成。',
    scoreDecay: 0.9,
    learningRate: 1.05,
    fixedShareAlpha: 0.12,
    nashFloor: 0.42,
    nashCeiling: 0.88,
    actionTemperature: 0.34,
    enableSelfMirror: false,
    psychWeightBoost: 1.0,
    driftThreshold: 2.8,
  },
};

export const JNV_PERSONA_LIST: readonly JNVPersonaConfig[] = [
  JNV_PERSONAS.zero,
  JNV_PERSONAS.apex,
  JNV_PERSONAS.mirror,
  JNV_PERSONAS.stochastic,
];
