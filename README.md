# JANKEN · 極 (GIT-Y3)

提供された建築・素材テクスチャアトラスから自動切り出し＋PBR（法線・粗さマップ）合成した5つの写実的3D舞台で戦う、**非ネオン・高精細3Dじゃんけんゲーム**です。

## 主な搭載技術（v1.5 極 / JSound Engin 1.5 × Project KIWAMI-NEXT）

- **次世代物理音響エンジン「JSound Engin 1.5」** ([詳細設計書](docs/JSOUND_ENGIN_1_5.md))
  - **2D波動・薄板FDTDソルバー (`WaveFieldSolver2D`)**：Kirchhoff-Love 薄板＆von Kármán 非線形張力PDEを実時間数値解法（打点位置による物理音色変化・大入力ピッチブルーム・2点マイク波面ステレオ）
  - **16ch 3次アンビソニックス (`Ambisonics3OAEngine`) & 新フラグシップ `★ 4D Audio X (3OA)`**：ACN/SN3D Max-$r_E$ 球面調和符号化＋Wigner-D 厳密回転＋正二十面体12仮想スピーカー KEMAR バイノーラル復号
  - **専用オーディオ・スレッド `AudioWorklet` (`QuantumMasterWorklet`)**：8ch Hadamard ユニタリ変調FDN ＋ 13弦日本音階共鳴弦バンク ＋ 4×OS Catmull-Rom 1.5ms先読みトゥルーピーク・リミッター ＋ ITU-R BS.1770-4 K重み付けLUFS/位相相関メーター ＋ ISO 226 等ラウドネス補正
  - **63-Tap Kaiser ($\beta=13.2$) `-134 dB` マスタリングFIR ＆ 16×OS（768kHz）トランジェント核**
  - **7次 520+音線 3OA建築IR ＋ 9帯域ベルベットノイズ残響**、**44和楽器・70物理素材・24種3OA環境音・120サウンド**＋スタジオ内 **40和楽器 3OA/2D-FDTD 試聴デッキ**
- **現カメラアングル True 5K 48-Bit KHDR 1.1 フォト撮影** ([詳細設計書](docs/KHDR_1_1_AND_5K_PHOTO.md))
  - 今見ている3Dカメラ視点そのまま（自由回転・マクロ接写含む、UI自動非表示）を **True 5K（5120×2880 / 長辺5120px）**・**高ビットレート True 48-bit（16bit/ch・281兆色無劣化PNG）** で1枚保存（右上カメラボタンまたは `K` キー）
  - **KHDR 1.1**（AgX着想スペクトル色空間＋16ストップ二重ローブ＋バイラテラルエッジ保護 Retinex）を 32-bit 浮動小数・2×2 オーバーサンプリングタイルで継ぎ目なく描画
- **Project KIWAMI-NEXT — 5大・世界初級オリジナル革新技術** ([詳細設計書](docs/KIWAMI_NEXT_INNOVATIONS.md))
  1. **J-BIOPULSE 1.0**：2相性動脈脈波（Windkessel＋ディクロティックノッチ）× 握力連動・毛細血管圧迫白化（Capillary Blanching）× 8–12 Hz 生理的神経筋マイクロトレモア × FINGER S1.0 生体光学連動
  2. **AERO-KINETIC VORTEX 1.0**：手の3D速度＆激突から Lamb-Oseen 3Dビオ・サバール渦輪（Vortex Ring）＆トロイダル衝撃渦を生成し、舞台の塵・花弁・金箔すべてをリアルタイム流体移流
  3. **J-PSYCHO-NET 1.0**：SHA-256 事前封印を100%守りつつ、シャノン情報量 $H(X)$・KLダイバージェンス・可変長マルコフ連鎖(VLMC)・ナッシュ後悔最小化(Hedge)で心理を可視化
  4. **SPECTRAL-RAY ACOUSTIC PROBE 1.0**：ライブ3Dカメラ位置と建築寸法から毎秒30回・12幾何音線を解析し、D/R比・コンデンサ近接効果・フレネル遮蔽LPFをJSound 1.5へ連続連成
  5. **JNV-PROOF STEGO-SEAL 1.0**：5K 48-bit PNG の全ピクセル SHA-256 指紋と試合ハッシュ・カメラ座標・生体状態を専用 `jNVp` PNGチャンクへ不可分封印＋スタジオ内蔵 **1-bit改ざん検知リーダー**
- **極写実ハンド造形＆皮膚・関節グラフィックモード「FINGER S1.0」** ([詳細設計書](docs/FINGER_S1_0.md))
  - 32×24 非対称解剖彫刻指節・3層動的関節皺・二重曲率爪半月・手続き型指紋/毛穴/掌紋/静脈 PBR・GLSL 皮下散乱 SSS・`living_skin` 極写実肌
- **独自生体関節エンジン「JHand Kinesis 1.1」× 36掌形＆C²滑らか制御** ([詳細設計書](docs/JHAND_KINESIS_1_1.md))
  - 38-DOF 解剖リグ・36掌形・6×サブステップ＋厳密解析解バネ `AnalyticSpring`・Camera Director 2.1・PVシネマ録画・スマホ全画面UI
- **独自NPCコア「JNV1.0」& 独自影「Shadow Flame 1.0 Flash / Pro」** ([詳細設計書](docs/JNV1_ARCHITECTURE.md))
  - 36専門家 Fixed-Share Hedge × CUSUM変化点検知 × FIPS 180-4 SHA-256 事前封印証明、PCSS可変半影＋深度レイマーチ極微影(SF-SSCS)

## セットアップ & 起動

```bash
npm install
npm run dev
```

## ビルド & 全エンジン自動検証

```bash
# TypeScript型チェック + 本番ビルド
npm run build

# 全エンジン一括検証（JNV1.0 + JHand 36掌形 + JSound 1.4 4D/31-Tap/58素材/36和楽器/376音線 + KHDR 1.1 5K 48-bit PNG + KIWAMI-NEXT 5大革新技術）
npm run test:all
```