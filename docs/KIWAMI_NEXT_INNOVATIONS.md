# Project KIWAMI-NEXT — 5大・世界初級オリジナル革新技術 設計＆検証ドキュメント

**JANKEN · 極 v1.4** の全サブシステム（`FINGER S1.0` / `JHand Kinesis 1.1` / `KHDR 1.1` / `5K 48-Bit PNG` / `JSound Engin 1.4 4D` / `JNV1.0`）を徹底研究し、従来のWebゲームや一般3Dタイトルでも実装されていない **5つの完全独自・実動作・数学／物理／暗号検証済みの先端技術** を統合実装しました。

---

## 革新技術 1：J-BIOPULSE 1.0 — 心拍血行動態 × 14関節毛細血管白化 × 8–12Hz 神経筋マイクロトレモア生体生理エンジン
- **実装**: [`src/engine/biopulse/BioPulseEngine.ts`](../src/engine/biopulse/BioPulseEngine.ts) → [`src/scene/HandRig.ts`](../src/scene/HandRig.ts) & [`src/engine/jsound/JSoundEngine.ts`](../src/engine/jsound/JSoundEngine.ts)
- **革新性**:
  1. **2相性動脈光電容積脈波（Windkessel 収縮期ピーク + 大動脈弁閉鎖ディクロティックノッチ）**：スコア差・マッチポイント・あいこ連打・極一撃から交感神経ドライブ常微分方程式を解き、呼吸性洞性不整脈（RSA 0.22 Hz）付きで心拍数 **66 BPM → 146 BPM** をリアルタイム遷移。
  2. **機械的「毛細血管圧迫白化（Capillary Blanching）」積分器**：JHand Kinesis 1.1 の指屈曲角から拳の握り込み圧を計測し、グーで強く握ると関節背側の皮膚から血が引いて象牙色へ白化（時定数 `0.18s`）、パーで開くと反応性充血で温かな血色が戻る（時定数 `1.05s`）現象を FINGER S1.0 シェーダへリアルタイム反映（非ネオン自然血色）。
  3. **生理的 8–12 Hz 神経筋マイクロトレモア & 発汗スペキュラ**：高緊張時に人間の真の生理的振動帯域（8.7 / 10.4 / 11.6 Hz）を極微振幅（`< 0.012 rad`）で指先・手首へ重畳し、緊張発汗による真皮クリアコート微変化＋4Dオーディオでの極微心拍サブパルス同期を実現。

---

## 革新技術 2：AERO-KINETIC VORTEX 1.0 — リアルタイム3D ビオ・サバール渦輪＆手後流流体エンジン
- **実装**: [`src/engine/aero/AeroVortexEngine.ts`](../src/engine/aero/AeroVortexEngine.ts) → [`src/scene/AtmosphereEffects.ts`](../src/scene/AtmosphereEffects.ts) & [`src/scene/GameScene.ts`](../src/scene/GameScene.ts)
- **革新性**:
  - 手の高速スイング（`palm_velocity > 1.25 m/s`）およびグー／チョキ／パーの激突瞬間に、空間へ **Lamb-Oseen 正則化3Dビオ・サバール渦輪（Vortex Ring）**・**カルマン剪断渦（Blade Shear）**・**地面効果トロイダル衝撃渦（Toroidal Mach-Stem Ring）** を物理スポーン。
  - 3D渦輪の遠方場双極子減衰（$\propto 1/r^3$）と粘性拡散（$\sigma^2(t) = \sigma_0^2 + 4\nu_{\text{eff}} t$）をゼロGC固定プールで毎フレーム計算し、舞台の160粒子（塵・桜花弁・温泉湯気）および120枚の物理金箔すべてを **リアルタイム流体移流** させます。

---

## 革新技術 3：J-PSYCHO-NET 1.0 — 情報理論的シャノンエントロピー × 可変長マルコフ連鎖(VLMC) × ナッシュ後悔最小化(Hedge) 非不正心理解析エンジン
- **実装**: [`src/engine/psycho/PsychoNetEngine.ts`](../src/engine/psycho/PsychoNetEngine.ts) → [`src/main.ts`](../src/main.ts) & [`src/ui/GameUI.ts`](../src/ui/GameUI.ts)
- **革新性**:
  - `JNV1.0` の **SHA-256 事前封印プロトコル（後出し絶対不可能）** と100%両立する4専門家アンサンブル（頻度ベイズ・勝敗条件付き `Win-Stay / Lose-Shift` 反射・1〜3次可変長マルコフ連鎖 VLMC・混合ナッシュ均衡防御）＋指数重み後悔最小化（Hedge）。
  - プレイヤーの毎局の **シャノン情報量 $H(X)$（最大 `1.585 bit`）**、**KLダイバージェンス $D_{\text{KL}}(P \| U)$**、**読破予測度（%）**、**行動心理アーキタイプ**（`明鏡無心` / `勝後維持型` / `敗後転換型` / `剛拳偏重` 等）をリアルタイム定量化。

---

## 革新技術 4：SPECTRAL-RAY ACOUSTIC PROBE 1.0 — リアルタイム3Dカメラ連動・12音線建築ジオメトリ音響プローブ
- **実装**: [`src/engine/jsound/AcousticProbeEngine.ts`](../src/engine/jsound/AcousticProbeEngine.ts) → [`src/engine/jsound/JSoundEngine.ts`](../src/engine/jsound/JSoundEngine.ts) & [`src/scene/GameScene.ts`](../src/scene/GameScene.ts)
- **革新性**:
  - ライブカメラ（自由視点・匠マクロ・決闘ローアングル等）の正確な3D座標と5舞台の建築寸法・吸音率から、毎秒30回 **12本の幾何音線**（直接音＋盤面鏡面反射コム遅延 $\Delta t$＋6壁面1次反射＋4隅2次反射）を解析計算。
  - **直接音対残響比（D/R dB）**・**コンデンサマイク近接効果（`dist < 1.25m` で 165 Hz に最大 `+4.8 dB` の近接温もり）**・**ISO 9613-1 距離空気吸収 & フレネル回折遮蔽 LPF** を JSound Engin 1.4 マスターバスへ無ノイズ連続連成。

---

## 革新技術 5：JNV-PROOF STEGO-SEAL 1.0 — True 5K 48-Bit PNG への「全ピクセルSHA-256＋全エンジン状態」不可分暗号封印＆ブラウザ内蔵改ざん1-bit検知リーダー
- **実装**: [`src/engine/proof/PhotoProofEngine.ts`](../src/engine/proof/PhotoProofEngine.ts) + [`src/graphics/PhotoCapture5K.ts`](../src/graphics/PhotoCapture5K.ts) → [`src/ui/GameUI.ts`](../src/ui/GameUI.ts)
- **革新性**:
  - 5K (`5120×2880`) True 48-Bit (16-Bit/Ch) KHDR 1.1 PNG 保存時に、**全14.75メガピクセルの16-bit RGB生データ全体の SHA-256 指紋（`pixelDigestSha256`）** と、その瞬間の **JNV1.0 事前封印ハッシュ・3Dカメラ座標/FOV・KHDR 1.1・BioPulse BPM・AeroVortex 渦数・PsychoNet エントロピー・Acoustic Probe D/R比** を統合した統合署名ハッシュ **`sealSha256`** を算出。
  - PNG仕様準拠の専用補助チャンク **`jNVp`（IEEE CRC-32保護）** へゼロ劣化で不可分刻印。
  - スタジオドロワー内蔵の **「JNV-PROOF 5K PNG 改ざん検証リーダー」** に保存済みPNGを読み込ませるだけで、全ピクセル展開→再ハッシュ→署名照合をローカル完結で実行し、**たとえ16-bitチャンネルの最下位1ビット（LSB）やスコア1文字の改ざんも即座に検知**します。

---

## 自動検証スイート (`npm run test:nexttech`)
全5エンジンを数学・流体・情報理論・幾何音響・1-bit改ざん検知まで自動検証し、100% PASS を確認済みです。
