# JSound Engin 1.4 — 4D Audio / 4D Audio MAX × 384kHz 8×OS 31-Tap (-111 dB) 物理音響エンジン設計書

## 概要

**JSound Engin 1.4** は、外部音声ファイル（WAV/MP3/OGG等）を一切使用せず、物理法則（ヘルツ接触力学・弾性固有モード・ストローハル空力渦・カプルズ振動・ヘルムホルツ擦弦・導波管気柱共鳴・6次380音線鏡像法）と **真の4Dホログラフィック音場（`4D Audio` / `4D Audio MAX`）** をブラウザ内リアルタイムで完全合成する独自オーディオエンジンです。

---

## v1.4 の 5 大技術進化

### 1. 真の 4D Audio & 4D Audio MAX ホログラフィック音場 ([`Spatial4DEngine.ts`](../src/engine/jsound/Spatial4DEngine.ts))
従来の静的3D（X, Y, Z）を超え、**時空間波面進化（X, Y, Z, t, Φ）** を導入：
- **4D Holographic Externalizer（頭外定位ネットワーク）**：非対称ハース微小遅延（6.8ms / 11.4ms）＋対側頭部遮蔽 LPF（2.2 kHz）クロスフィードにより、ヘッドホン特有の頭内定位を打破し、実際の建築空間へ音を解放。
- **4D Quadrature Orbital Envelopment（直交位相 360° 波面周回）**：直交 LFO（`0.19 Hz` 方位角 × `0.29 Hz` 仰角）が拡散音場の空気流を滑らかに 360° 回転させ、音が空間の中で「呼吸する」4D没入感を実現。
- **4D Upper-Hemisphere Height Air Bus（頭上 8.2 kHz 耳介高度バス）**：人間の耳介（Pinna）の頭上知覚共振（7.9–8.2 kHz）を非対称高度マイクロ遅延（3.7ms / 5.9ms）でリフトし、梵鐘・風鈴・錫杖・能管・水琴窟が頭上空間へ立ち昇る。
- **4D Visceral Sub-Tactile Physical Field（38–82 Hz 体感重低音バス）**：2×OS クリーン2次倍音シェイパー付きの位相整合モノラル低域バスが、大太鼓・雷太鼓・銅鑼・法螺貝・極一撃に物理的な胸腔振動（体感音圧）を付与。
- **Curved 4D Spatio-Temporal Trajectories（曲線4D軌道＋連続ドップラー＋動的耳介追従）**：`orbit_360`, `overhead_arc`, `spiral_ascend`, `converge_impact`, `stereo_sweep` の5種解析曲線を12ウェイポイントで実行し、各点での解析的速度ベクトル $\mathbf{v}(t)$ から相対論的ドップラーピッチシフトと仰角耳介フィルターを連続駆動。

### 2. 厳密 31-Tap Kaiser ($\beta=9.2$) ハーフバンド・カスケード FIR ([`ModalSynthesizer.ts`](../src/engine/jsound/ModalSynthesizer.ts))
- 384 kHz (8×OS) / 192 kHz (4×OS) / 96 kHz (2×OS) デシメーションフィルターを 23タップ（-86.5 dB）から **厳密 31タップ Kaiser ($\beta=9.2$) ハーフバンド線形位相 FIR** へ刷新。
- **実測エイリアス抑圧：`-111.7 dB`（2×/4×OS）、`-112.2 dB`（384kHz 8×OS）**、通過帯域リップル `-0.00 dB`、わずか 8 対称乗算/サンプルの高速設計。

### 3. 6次 376音線 4D鏡像法（Image-Source）＋ ゼロアロケーション 7帯域ベルベットノイズ IR ([`StageAcoustics.ts`](../src/engine/jsound/StageAcoustics.ts))
- 初期反射次数を 5次（230本）から **6次（376本、Ultra）** へ拡張。
- Woodworth-Schlosberg 球頭 ITD に加え、**仰角ピンナ高度キュー＋前後混同円錐（Cone-of-Confusion Front/Back）ピンナ HRTF フィルタ** を全 376 音線へ物理適用。
- 後期残響を **7帯域ベルベットノイズ（6,400 パルス/秒）** へ高密度化しつつ、全5舞台の IR 合計生成時間 **~200 ms** の超高速処理を達成。

### 4. 36和楽器・58物理素材・20空間環境音アクター・96サウンドカタログ
- **新規追加 10和楽器（26 → 36）**：錫杖（`shakujo`）・銅鐸風鐸（`kane_chime`）・大正琴（`taisho_koto`）・琉球三線（`sanshin`）・擦弦胡弓（`kokyu`, Helmholtz スティックスリップ物理）・能楽能管（`nokan`, 喉管非整数倍音）・締太鼓（`shime_daiko`）・24枚木片ステレオ編木（`binzasara`）・弓道和弓（`yumi_bow`, 麻弦反発＋矢風ドップラー）・雷太鼓（`thunder_taiko`）＋ **鈴虫・竹林頭上風・5K KHDR 1.1 二重幕機械式カメラシャッター**。
- **スタジオ試聴デッキ**：24種 → **32和楽器 4D物理試聴デッキ（4×8 グリッド）**。

### 5. SPECTRAL-RAY ACOUSTIC PROBE 1.0 リアルタイムカメラ連動音響 ([`AcousticProbeEngine.ts`](../src/engine/jsound/AcousticProbeEngine.ts))
- 30 Hz で現在のライブ 3D カメラ座標と舞台建築の寸法・吸音率から **12本の幾何音線**（直接音＋盤面鏡面反射＋6壁面＋4隅2次反射）をリアルタイム解析。
- 匠マクロ接写時には **直接音対残響比（D/R 比）＋コンデンサマイク近接効果（165 Hz 温もり）** が立ち上がり、遠景では建築残響と ISO 9613-1 空気吸収・フレネル回折遮蔽へ自然に移行。

## 自動検証 (`npm run test:jsound`)
- 31-Tap Kaiser(9.2) FIR: `-111.7 dB` 〜 `-112.2 dB` エイリアス抑圧 PASS
- 全 58 物理素材 & 全 36 和楽器（45 バリアント）: NaN/クリップゼロ PASS
- 4D Audio MAX > 4D Audio > 3D Binaural 頭外拡散エネルギー単調増加 PASS
- 全 5 舞台 6次 376音線 4D IR & SPECTRAL-RAY ACOUSTIC PROBE 1.0 幾何音響検証 PASS
