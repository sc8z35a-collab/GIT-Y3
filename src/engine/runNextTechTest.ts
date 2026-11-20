/**
 * ★ Project KIWAMI-NEXT — 5 Breakthrough Original Engine Mathematical & Cryptographic Verification Suite ★
 *
 * Audits all 5 original first-principles subsystems:
 *  1. J-BIOPULSE 1.0          : Biphasic arterial PPG wave (systolic + dicrotic notch), HR ODE, capillary blanching, 8-12Hz micro-tremor
 *  2. AERO-KINETIC VORTEX 1.0 : 3D Lamb-Oseen Biot-Savart vortex-ring induced velocity field, toroidal shockwave, viscous decay
 *  3. J-PSYCHO-NET 1.0        : Zero-cheat pre-commit Shannon entropy, KL divergence, VLMC & Win-Stay pattern exploitability + Nash protection
 *  4. SPECTRAL-RAY PROBE 1.0  : 12-path real-time camera-coupled geometric acoustics (D/R ratio, proximity effect, tabletop comb delay)
 *  5. JNV-PROOF STEGO-SEAL 1.0: True 16-bit PNG `jNVp` SHA-256 pixel-bound seal verification + 1-bit pixel & metadata tamper detection!
 *
 * Run with: npm run test:nexttech
 */

import { encodeRgb16Png } from '../graphics/PhotoCapture5K';
import { AeroVortexEngine } from './aero/AeroVortexEngine';
import { BioPulseEngine } from './biopulse/BioPulseEngine';
import { AcousticProbeEngine } from './jsound/AcousticProbeEngine';
import { PAPER, ROCK, SCISSORS } from './jnv1/types';
import {
  PROOF_CHUNK_TYPE,
  createSignedPhotoProof,
  verify5KPhotoProofPng,
} from './proof/PhotoProofEngine';
import { PsychoNetEngine, counterMoveOf } from './psycho/PsychoNetEngine';

let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  } else {
    console.log(`  [PASS] ${msg}`);
  }
}

async function run(): Promise<void> {
  console.log('\n=== Project KIWAMI-NEXT — 5 Breakthrough Original Engine Verification ===\n');

  // ---------------------------------------------------------------------------
  // 1. J-BIOPULSE 1.0: Biphasic Arterial Pulse, Sympathetic HR, Capillary Blanching & Tremor
  // ---------------------------------------------------------------------------
  {
    const bio = new BioPulseEngine(1);
    const sysPeak = BioPulseEngine.evaluateArterialWave(0.16);
    const notch = BioPulseEngine.evaluateArterialWave(0.32);
    const diaPeak = BioPulseEngine.evaluateArterialWave(0.44);
    assert(
      sysPeak > 0.85 && diaPeak > notch && diaPeak < sysPeak,
      `J-BIOPULSE 1.0 biphasic Windkessel PPG waveform verified (systolic=${sysPeak.toFixed(2)} > dicrotic=${diaPeak.toFixed(2)} > notch=${notch.toFixed(2)})`
    );

    // Run 6s serene baseline (relaxed Paper)
    let calm = bio.getSample();
    for (let i = 0; i < 360; i++) {
      calm = bio.update(1 / 60, {
        playerScore: 0,
        npcScore: 0,
        targetWins: 3,
        aikoStreak: 0,
        overdriveActive: false,
        clenchLoad: 0.05,
        exertionPulse: 0,
      });
    }

    // Run 6s match-point Overdrive fist clench (Rock)
    let intense = calm;
    let beatCount = 0;
    let maxTremor = 0;
    for (let i = 0; i < 360; i++) {
      intense = bio.update(1 / 60, {
        playerScore: 2,
        npcScore: 2,
        targetWins: 3,
        aikoStreak: 2,
        overdriveActive: true,
        clenchLoad: 1.0,
        exertionPulse: 0.7,
      });
      if (intense.didBeatThisFrame) beatCount++;
      maxTremor = Math.max(maxTremor, Math.abs(intense.tremorFingerRad));
    }

    assert(
      intense.bpm > calm.bpm + 40 &&
        intense.capillaryBlanching > 0.8 &&
        calm.capillaryBlanching < 0.15 &&
        beatCount >= 7 &&
        maxTremor > 0.002 &&
        maxTremor < 0.025,
      `J-BIOPULSE 1.0 physiology ODE verified (Calm ${calm.bpm} BPM / Blanch ${calm.capillaryBlanching} -> Intense ${intense.bpm} BPM / Blanch ${intense.capillaryBlanching} / Beats=${beatCount} / Tremor=${maxTremor.toFixed(4)}rad)`
    );
  }

  // ---------------------------------------------------------------------------
  // 2. AERO-KINETIC VORTEX 1.0: 3D Lamb-Oseen Biot-Savart Induced Velocity & Decay
  // ---------------------------------------------------------------------------
  {
    const aero = new AeroVortexEngine();
    aero.spawnClashShockwave(ROCK, 1.2);
    const out = { vx: 0, vy: 0, vz: 0 };

    // Inside ring center (0, 0.18, 0.04) should experience strong axial jet along +Y
    aero.sampleVelocity(0, 0.18, 0.04, out);
    const centerSpeed = Math.hypot(out.vx, out.vy, out.vz);

    // Far away (8m) should decay cleanly toward 0
    aero.sampleVelocity(8.0, 4.0, 8.0, out);
    const farSpeed = Math.hypot(out.vx, out.vy, out.vz);

    const tel0 = aero.getTelemetry();
    for (let i = 0; i < 180; i++) aero.update(1 / 60); // 3s later -> fully dissipated
    const telEnd = aero.getTelemetry();

    assert(
      tel0.activeVortexCount === 1 &&
        centerSpeed > 0.8 &&
        farSpeed < centerSpeed * 0.02 &&
        telEnd.activeVortexCount === 0,
      `AERO-KINETIC VORTEX 1.0 Biot-Savart field verified (core speed=${centerSpeed.toFixed(2)} m/s, far=${farSpeed.toFixed(4)} m/s, viscous decay clean)`
    );
  }

  // ---------------------------------------------------------------------------
  // 3. J-PSYCHO-NET 1.0: Shannon Entropy, Win-Stay/Markov Exploit & Zero-Cheat Pre-Commit
  // ---------------------------------------------------------------------------
  {
    const ai = new PsychoNetEngine();
    ai.setMode('psycho_fair');

    // Simulate a biased human who cycles Rock -> Scissors -> Paper predictably
    const pattern = [ROCK, SCISSORS, PAPER] as const;
    let seed = 1337;
    const rng = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    let aiWinsSecondHalf = 0;
    let playerWinsSecondHalf = 0;
    for (let r = 0; r < 30; r++) {
      // Strictly BEFORE observing player move, AI pre-commits!
      const npcMove = ai.selectPreCommitNpcMove(rng) ?? ROCK;
      const playerMove = pattern[r % 3];
      const outcome =
        playerMove === npcMove
          ? 'DRAW'
          : counterMoveOf(npcMove) === playerMove
          ? 'WIN'
          : 'LOSS';
      if (r >= 12) {
        if (outcome === 'LOSS') aiWinsSecondHalf++;
        else if (outcome === 'WIN') playerWinsSecondHalf++;
      }
      ai.observeRound(playerMove, npcMove, outcome);
    }

    const telCycle = ai.getTelemetry();
    assert(
      aiWinsSecondHalf > playerWinsSecondHalf * 3 && telCycle.predictabilityPct >= 25,
      `J-PSYCHO-NET 1.0 VLMC pre-commit learning verified on R→S→P cycle (AI wins=${aiWinsSecondHalf} vs Player=${playerWinsSecondHalf}, confidence=${telCycle.preCommitConfidencePct}%)`
    );

    // Verify Shannon Entropy drops dramatically on repetitive Rock player vs high-entropy uniform player
    const rockBiased = new PsychoNetEngine();
    for (let i = 0; i < 12; i++) rockBiased.observeRound(ROCK, PAPER, 'LOSS');
    const telRock = rockBiased.getTelemetry();

    const balanced = new PsychoNetEngine();
    for (let i = 0; i < 12; i++) balanced.observeRound(pattern[i % 3], ROCK, 'DRAW');
    const telBal = balanced.getTelemetry();

    assert(
      telRock.shannonEntropyBits < 0.01 &&
        telBal.shannonEntropyBits > 1.58 &&
        telRock.klDivergenceBits > 1.5,
      `J-PSYCHO-NET 1.0 information theory verified (All-Rock H=${telRock.shannonEntropyBits}b, KL=${telRock.klDivergenceBits}b vs Uniform H=${telBal.shannonEntropyBits}b)`
    );
  }

  // ---------------------------------------------------------------------------
  // 4. SPECTRAL-RAY ACOUSTIC PROBE 1.0: Multi-Stage Geometry & Proximity Physics
  // ---------------------------------------------------------------------------
  {
    const probe = new AcousticProbeEngine('shrine');
    const nearZashiki = probe.evaluate({ x: 0, y: 0.48, z: 0.42 }, { x: 0, y: 0.34, z: 0.04 }, 'zashiki');
    const farSalon = probe.evaluate({ x: 2.2, y: 2.4, z: 3.1 }, { x: 0, y: 0.34, z: 0.04 }, 'salon');
    const occluded = probe.evaluate({ x: 0, y: 0.04, z: -1.5 }, { x: 0, y: 0.34, z: 0.04 }, 'atelier');
    assert(
      nearZashiki.directToReverbDb > farSalon.directToReverbDb + 8 &&
        nearZashiki.proximityWarmthDb > 2.5 &&
        occluded.occlusionFactor > 0.3 &&
        occluded.airCutoffHz < nearZashiki.airCutoffHz - 3000,
      `SPECTRAL-RAY ACOUSTIC PROBE 1.0 verified (Near D/R=${nearZashiki.directToReverbDb}dB vs Salon Far=${farSalon.directToReverbDb}dB, Occluded LPF=${occluded.airCutoffHz}Hz)`
    );
  }

  // ---------------------------------------------------------------------------
  // 5. JNV-PROOF STEGO-SEAL 1.0: 16-Bit PNG Cryptographic Proof + 1-Bit Tamper Detection!
  // ---------------------------------------------------------------------------
  {
    const W = 96;
    const H = 64;
    const rgb16 = new Uint16Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        rgb16[i] = Math.round((x / (W - 1)) * 65535);
        rgb16[i + 1] = Math.round((y / (H - 1)) * 65535);
        rgb16[i + 2] = ((x * 733 + y * 911) & 0xffff);
      }
    }

    const proof = await createSignedPhotoProof(rgb16, {
      width: W,
      height: H,
      bitDepth: 16,
      stageId: 'zashiki',
      stageNameJp: '陽だまりの座敷',
      cameraStyle: 'macro_artisan',
      cameraPos: [0.12, 0.78, 0.92],
      cameraTarget: [0, 0.32, 0.02],
      cameraFovDeg: 32.0,
      khdrVersion: 'KHDR 1.1',
      shadowMode: 'pro',
      playerMaterial: 'living_skin',
      npcMaterial: 'karakuri_bronze',
      jsoundSpatialMode: '4d_audio_max',
      jnvCommitHash: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
      jnvFairnessVerified: true,
      matchScoreText: '2 - 1',
      bioPulseBpm: 118,
      bioCapillaryBlanching: 0.62,
      aeroActiveVortices: 2,
      psychoEntropyBits: 1.42,
      acousticProbeDrDb: 6.4,
      capturedAtIso: '2026-11-19T12:00:00.000Z',
    });

    const proofBytes = new TextEncoder().encode(JSON.stringify(proof));
    const pngBytes = await encodeRgb16Png(
      W,
      H,
      rgb16,
      { 'JNV-Proof-Seal': proof.sealSha256 },
      [{ type: PROOF_CHUNK_TYPE, data: proofBytes }]
    );

    // 5a. Authentic unmodified PNG must pass 100%
    const vOk = await verify5KPhotoProofPng(pngBytes);
    assert(
      vOk.valid &&
        vOk.crcAllValid &&
        vOk.pixelDigestMatch &&
        vOk.sealHashMatch &&
        vOk.record?.bioPulseBpm === 118 &&
        vOk.record?.jnvCommitHash.startsWith('a1b2c3d4'),
      `JNV-PROOF STEGO-SEAL 1.0 authentic 48-bit PNG verified 100% (Seal=${proof.sealSha256.slice(0, 16)}…, BPM=${vOk.record?.bioPulseBpm})`
    );

    // 5b. 1-bit pixel tamper (re-encoded with valid PNG CRCs!) MUST BE CAUGHT by pixelDigestSha256!
    const tamperedRgb16 = new Uint16Array(rgb16);
    tamperedRgb16[1234] ^= 1; // Flip literally ONE single least-significant bit in 16-bit channel!
    const forgedPng = await encodeRgb16Png(
      W,
      H,
      tamperedRgb16,
      { 'JNV-Proof-Seal': proof.sealSha256 },
      [{ type: PROOF_CHUNK_TYPE, data: proofBytes }]
    );
    const vPixelTamper = await verify5KPhotoProofPng(forgedPng);
    assert(
      !vPixelTamper.valid && vPixelTamper.crcAllValid && !vPixelTamper.pixelDigestMatch,
      `JNV-PROOF STEGO-SEAL 1.0 single-LSB pixel forgery caught immediately (${vPixelTamper.reasonJp})`
    );

    // 5c. Metadata forgery (changing matchScoreText inside jNVp chunk with valid CRC!) MUST BE CAUGHT by sealSha256!
    const forgedRecord = { ...proof, matchScoreText: '3 - 0' };
    const forgedMetaPng = await encodeRgb16Png(
      W,
      H,
      rgb16,
      {},
      [{ type: PROOF_CHUNK_TYPE, data: new TextEncoder().encode(JSON.stringify(forgedRecord)) }]
    );
    const vMetaTamper = await verify5KPhotoProofPng(forgedMetaPng);
    assert(
      !vMetaTamper.valid && vMetaTamper.pixelDigestMatch && !vMetaTamper.sealHashMatch,
      `JNV-PROOF STEGO-SEAL 1.0 metadata forgery caught immediately (${vMetaTamper.reasonJp})`
    );
  }

  if (failed > 0) {
    throw new Error(`Project KIWAMI-NEXT verification failed with ${failed} error(s).`);
  }
  console.log('\nProject KIWAMI-NEXT — ALL 5 BREAKTHROUGH ENGINES PASSED 100%.\n');
}

void run();
