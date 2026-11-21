# JANKEN · 極 (GIT-Y3)

提供された建築・素材テクスチャアトラスから自動切り出し＋PBR（法線・粗さマップ）合成した5つの写実的3D舞台で戦う、**非ネオン・高精細3Dじゃんけんゲーム**です。

## v1.6 の新機能（POCO F7 を大前提に最適化）

- **スマホ向けにわかりやすくしたUI**：縦画面を基準にしたレイアウト、下から出てくる設定シート（下にスワイプで閉じる）、今やることを示すステータス表示、最初の遊び方ガイド、親指で押しやすい「手」ボタン（触れた瞬間に反応し、短くバイブ）、画面右の縦型拡大鏡
- **端末適応エンジン「KIWAMI MOBILE CORE 1.0」** ([詳細設計書](docs/KIWAMI_MOBILE_CORE_1_0.md))
  - Adreno 825 と 120Hz 表示から **POCO F7 級**を自動で判定し、FHD・120fps・HD 手肌の事前生成・音声ワーカー3本で始める
  - **ジャダーの出ない 120→60→40fps 段**だけを使う閉ループ・フレームペーサー＋**動的解像度**（上げるときは試行し、失敗したら戻して待ち時間を倍に）
  - **発熱を検知して45秒冷却**、待機中は 60Hz に落として省電力、**HUDを避けたカメラ中心**（斜め投影で、手をボタン列に隠さない）
- **次世代音響エンジン「JSound Engin 1.6」** ([詳細設計書](docs/JSOUND_ENGIN_1_6.md))
  - **ゼロ・ジャンク予測レンダーファーム**：27種類の物理合成を Web Worker で先に計算し、「ポン！」の瞬間のDSP計算を0に
  - **遅延を補正した予約再生**：Bluetooth イヤホンの遅延まで補正して、手が見えた瞬間に音が届く。同じ波形からバイブも作る
  - **KIWAMI MASTER 16**（AudioWorklet）：4×FIR トゥルーピーク検出（誤差 0.021dB）、強制クリップ不要の先読みリミッター（+18dBFS 入力でも −1.000dBFS）、LR4 3バンド・ダイナミクス、チェビシェフ仮想低音、BS.1770-4 ラウドネス計
  - **再生機器に合わせた音作り**（イヤホン / スマホ本体スピーカー / PCスピーカー）
- **ズーム倍率で細かさが変わる「FINGER S1.1」** ([詳細設計書](docs/FINGER_S1_1.md))
  - 2.5× / 12× / 90× で HD 2× → 超精細 → 顕微（17µm）に切り替え（チラつき防止つき）
  - 2048² HD テクスチャ（画素数4倍、指紋の隆線 14→38本）、三角形4倍のメッシュ（形が飛ばない切り替え）、8段の解析的な肌の凹凸をメインの PBR 法線に

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
- **極写実ハンド造形＆手の細部革新 × 無制限顕微ズーム「FINGER S1.0 × DERMA-TENSOR 1.0 × CHROMA-DERM & KERATIN OPTICS 1.0 × INFINITE-ZOOM OPTICS」** ([FINGER S1.0設計書](docs/FINGER_S1_0.md) / [手の細部・無制限ズーム設計書](docs/HAND_DETAIL_INNOVATIONS.md))
  - **細部技術革新① `DERMA-TENSOR 1.0`**：4本の総指伸筋腱（EDC）・2本の斜走腱間結合・母指嗅ぎタバコ窩（EPL）・背側静脈弓の **リアルタイム3D頂点実変形**（52×40彫刻手掌・チョキ時は示指/中指2腱のみ選択隆起）＋ Langer線 逆位相皮膚張力 ＆ **4オクターブ・スケール不変 Mikkelsen 35μm 顕微法線（`1.4mm → 0.42mm → 0.13mm → 0.035mm`）**
  - **細部技術革新② `CHROMA-DERM & KERATIN OPTICS 1.0`**：3波長スペクトル皮膚拡散（赤650nm ＞ 緑550nm ＞ 青450nm）＋ 皮脂($\alpha_1$)/角質($\alpha_2$)2層GGX ＋ **680本カーブ3D逆光産毛（手背520本＋指基節160本）** ＋ **立体厚み3D爪スラブ＆3D甘皮アーチ**・異方性ケラチン爪光学＆油圧式毛細血管再充血（$\tau=0.08\text{s}/0.38\text{s}$）
  - **無制限顕微ズーム（`0.2×〜5000×`）**：双曲線ドリー＋超望遠C∞連続遷移（画面縦視野 `0.345mm` までめり込みゼロ）・動的Near/Far＆SF-SSCS適応・3Dパン＆360°回転・6種ワンタップ顕微フォーカス・1024×1024汗孔付指紋＆512×512爪床毛細血管PBR
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

# 全エンジン一括検証（JNV1.0 + JHand 36掌形 + JSound 1.5/1.6 + KHDR 1.1 5K 48-bit PNG + KIWAMI-NEXT 5大革新 + 手の細部2革新 + FINGER S1.1 + KIWAMI MOBILE CORE）
npm run test:all

# v1.6 の個別検証
npm run test:jsound16     # JSound Engin 1.6（16項目）
npm run test:fingers11    # FINGER S1.1（11項目）
npm run test:mobilecore   # KIWAMI MOBILE CORE（26項目）
```