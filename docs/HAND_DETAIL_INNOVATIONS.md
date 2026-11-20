# 手の細部 2大技術革新 — `DERMA-TENSOR 1.0` & `CHROMA-DERM & KERATIN OPTICS 1.0`

**JANKEN · 極** の超写実ハンドシステム `FINGER S1.0 × JHand Kinesis 1.1` に実装された、**2つの独自・手部マイクロ細部技術革新**の設計仕様書です。  
両技術とも **ネオン調完全禁止（Strictly Zero Neon）** の物理光学設計で、`KHDR 1.1`、`Shadow Flame 1.0 Flash/Pro`、`J-BIOPULSE 1.0`、および `5K 48-bit PNG 現視点撮影` と 100% 統合動作します。

---

## 技術革新 ①：`DERMA-TENSOR 1.0`
**実時間・皮下伸筋腱／背側静脈弓 3D頂点変形 ＋ Langer線 逆位相・動的皮膚皺テンソル**

- 実装モジュール：
  - [`DermaTensorEngine.ts`](../src/engine/handdetail/DermaTensorEngine.ts)（`evaluateDermaTensorState` / `evaluateSubcutaneousDisplacementAt` / `SculptedPalmSubcutaneousField`）
  - [`FingerS1Engine.ts`](../src/graphics/FingerS1Engine.ts)（Mikkelsen `dFdx`/`dFdy` 5K無限解像プロシージャル微細法線シェーダー）
  - [`HandRig.ts`](../src/scene/HandRig.ts)（リアルタイム骨格連動・頂点更新＆テレメトリ出力）

### 解決する課題（従来のCGハンドの決定的な限界）
どれほど高精細なノーマルマップを貼っても、従来の3Dハンドは**手背のメッシュ形状が剛体のまま固定**されており、チョキやパーを出しても「皮膚の下で伸ばした指の伸筋腱だけが独立して浮き上がる」「指を曲げると関節背面の皺がピンと伸び、同時に手のひら側の屈曲皺が深く畳まれる」という生体力学的な連動が欠落していました。

### 2段構成の物理コア
1. **リアルタイム皮下伸筋腱・嗅ぎタバコ窩・背側静脈弓 3D頂点実変形（`SculptedPalmSubcutaneousField`）**
   - 彫刻済み手掌メッシュ（`createFingerS1SculptedPalmGeo`）の背側頂点（`uy > 0.08`）のみをゼロGCで抽出し、毎フレーム `JHandSolvedFrame` と `J-BIOPULSE 1.0` の動脈脈波から **実3D頂点高さと法線をリアルタイム再計算**：
     - **4本の総指伸筋腱（EDC：示指・中指・環指・小指）**：手根から各MCP関節へ扇状に走る解剖経路をガウス隆起＋両脇の微細な皮膚テンティング谷で形成。**チョキ時は示指・中指の2本だけが皮膚下で選択隆起**、**パー時は全4本が鮮明に浮上**。
     - **2本の斜走腱間結合（Juncturae Tendinum）**：中指–環指・環指–小指間をつなぐ斜走コラーゲン橋。
     - **母指長母指伸筋腱（EPL・解剖学的嗅ぎタバコ窩）**：親指伸展時に橈側手首縁に張り出す筋条。
     - **分岐する背側静脈弓（Dorsal Venous Arch）**：握り込み負荷と心拍脈波に応じて穏やかに充血・隆起。
   - 静止時はハッシュシグネチャ比較でGPU転送を自動スキップ（アイドル時 `0.00ms`）。

2. **Langer線 逆位相皮膚張力テンソル ＋ Mikkelsen `dFdx`/`dFdy` 5K無限解像微細法線**
   - **逆位相法則**：指伸展時（パー）は背側関節の皺が深くマットに寄り（`dorsalWrinkleDepth → 1.0`）、指屈曲時（グー）は背側コラーゲン繊維が引き伸ばされて皺が平坦化＋微細艶が増加（`dorsalWrinkleDepth → 0.18`, `skinRoughnessShift < 0`）する一方、**同時に掌側屈曲皺が深くなる**（`volarCreaseDepth → 1.0`）。
   - WebGL2フラグメントシェーダー内で、UV継ぎ目ゼロの3Dローカル座標から **Rete Cutis（皮溝・皮丘の菱形微細網）** と動的Langer皺ハイトフィールドを評価し、**Mikkelsen画面空間微分（`dFdx`/`dFdy`）** でワールド法線を直接摂動。**5K（5120×2880）極近接マクロ撮影でもテクスチャボケが一切発生しない無限シャープネス**を実現しています。

---

## 技術革新 ②：`CHROMA-DERM & KERATIN OPTICS 1.0`
**3波長スペクトル皮膚拡散 ＋ 皮脂/角質2層GGX ＋ 3D逆光産毛フィールド ＋ 異方性爪光学＆毛細血管再充血**

- 実装モジュール：
  - [`ChromaDermOptics.ts`](../src/engine/handdetail/ChromaDermOptics.ts)（`evaluateSpectralDermalBRDF` / `NailPressureRefillSolver` / `enhanceNailWithKeratinOptics` / `createVellusHairInstancedField`）
  - [`FingerS1Engine.ts`](../src/graphics/FingerS1Engine.ts)（3波長RGB拡散＆2層GGX GLSLカーネル）
  - [`HandRig.ts`](../src/scene/HandRig.ts)（340本単一ドローコール産毛＆爪床圧力ODE連動）

### 4つのマイクロ光学コンポーネント（ネオン調一切なし）
1. **3波長スペクトル皮膚拡散（Red 650nm / Green 550nm / Blue 450nm）**
   - 実際の人体皮膚における波長別の散乱平均自由行程（**赤 3.4mm → ラップ `0.62` / 緑 0.9mm → `0.24` / 青 0.3mm → `0.06`**）を物理モデル化。
   - **波長別法線ブラー**：赤成分は滑らかな幾何法線で明暗境界線（ターミネーター）の奥まで温かなヘモグロビン血色光を回り込ませ、青成分はMikkelsen微細法線のまま保持するため、**「血色感の柔らかさ」と「皮溝・毛穴のカミソリのような鮮鋭さ」を完全両立**。

2. **皮脂脂質（Sebum）＋ 角質層ケラチン（Stratum Corneum）2層GGXマイクロファセットBRDF**
   - 狭い皮脂脂質ローブ（$\alpha_1 \approx 0.175$、`J-BIOPULSE` の発汗量と張力で鋭敏化）が個々の皮丘セルに微細な誘電体ハイライトを宿し、広い角質サテンローブ（$\alpha_2 \approx 0.48$）がプラスチック感のない自然な人肌の質感を形成。

3. **単一ドローコール 3D逆光「背側産毛（Vellus Hair）」インスタンスフィールド**
   - Halton準乱数分布で手背（`y > 0.012`, `ny > 0.34`）のみに **340本の極細テーパード3D産毛繊維** を解剖学的な遠位・尺側22°の毛流で植毛（片手あたり **1ドローコール / 1,020ポリゴン未満**、シャドウアクネ防止のためシャドウキャスター無効）。
   - カスタム **Kajiya-Kay ＋ フレネル斜めリム逆光シェーダー** により、正面からはほぼ不可視、斜光・逆光の輪郭線にだけ温かな日光のアイボリー光輪を浮かび上がらせます。

4. **異方性ブラッシュド・ケラチン爪光学 ＋ 油圧式・爪床毛細血管再充血ソルバー（`NailPressureRefillSolver`）**
   - 爪甲の縦方向微細条線（ケラチン繊維）に沿った **Ward / Kajiya-Kay 異方性スペキュラー** により、爪のCカーブを横切る本物特有の帯状ハイライトを描画。
   - 指腹圧迫（`pulpCompression`＋握り負荷）に連動する非対称時定数ODE（**圧迫白化 $\tau = 0.08\text{s}$ の急速な血抜き** vs **解放再充血 $\tau = 0.38\text{s}$ の緩やかな薔薇色回復**）と、爪先フリーエッジ（`v > 0.74`）の半透明アイボリー逆光透過をリアルタイム描画。

---

## 技術革新 ③（顕微鑑賞拡張）：`INFINITE-ZOOM OPTICS 1.0` × `MICRO-DERMA FRACTAL 1.0`
**0.2×〜5000× 無制限光学ズーム（C∞ドリー＋超望遠連続遷移）× 35μm 4オクターブ細胞解像 × 立体3Dマイクロ造形**

- **無制限ズーム＆自在3Dパン（[`CameraDirector.ts`](../src/scene/CameraDirector.ts) / [`KHDRPipeline.ts`](../src/graphics/KHDRPipeline.ts) / [`GameScene.ts`](../src/scene/GameScene.ts)）**
  - 対数スケールズーム（`zoomFactor = exp(zoomExp)`）と双曲線最小作動距離（$r = \sqrt{d_{\text{eff}}^2 + d_{\min}^2},\ d_{\min}=1.4\text{cm}$）＋光学望遠FOV圧縮（`38° → 1.41°`・画面縦視野 `0.345 mm`）により、**メッシュ内部へ一切めり込むことなく `0.2×` 広角〜`5000×` 細胞顕微鏡まで C∞連続で無限拡大**。
  - `near`/`far` クリップ面と `Shadow Flame 1.0 Pro` の `SF-SSCS` レイ長（`1.2mm〜24cm`）を距離連動で動的制御し、極近接でもZファイティングや接触影破綻をゼロ化。
  - マウスホイール／トラックパッドピンチ／スマホ2本指ピンチ＋パン／右ドラッグ・Shiftドラッグパン／画面右下HUDの `−`/`＋`/`戻す`／キーボード `+`/`-`/`0` および **ライブ解剖ランドマーク自動追尾付きワンタップ6種フォーカス**（爪・甘皮 `42×`、皮下腱・産毛 `18×`、掌側回外指紋・汗孔 `75×`、真鍮関節 `26×`、超顕微皮膚 `320×`）を搭載。
- **超顕微ディティール徹底強化（[`FingerS1Engine.ts`](../src/graphics/FingerS1Engine.ts) / [`ChromaDermOptics.ts`](../src/engine/handdetail/ChromaDermOptics.ts) / [`HandRig.ts`](../src/scene/HandRig.ts)）**
  - **2オクターブ Worley/Voronoi 細胞網 Rete Cutis ＋ 1024×1024 指節＆手掌 / 512×512 関節用シームレス微細肌＆爪プレートPBR**：幾何格子ゼロの有機多角形皮丘・指紋隆線上の微小エクリン汗孔ドット・毛包微細凹み・爪床透視の縦毛細血管ストリーク・ボー線成長波を合成。
  - **シームレス関節移行＆C¹二平面等方性 4オクターブ顕微法線（`1.4mm → 0.40mm → 0.13mm → 0.035mm`）**：丸み付き指節端タック＋側面極UV関節カプセルで極近接時の段差・引き伸ばしを排除し、ズームするほどWorley皮丘→二次小三角＆汗孔→角質鱗片→**35ミクロン細胞粒状感**まで途切れず出現（金属・檜・白磁ハンドにも切削目・結晶粒を顕微描画）。
  - **真の立体厚み3D爪スラブ（表＋裏＋丸み付き先端エッジ・1,242頂点）＋ 3D彫刻・甘皮アーチ（`createFingerS1CuticleArchGeo`）**。
  - **680本のカーブ形状3D逆光産毛**：2セグメント湾曲繊維（5頂点3三角）に進化した手背520本＋各指基節背側160本（親指含む）を極低ドローコールで植毛。

---

## 自動数学検証（`npm run test:handdetail`）
[`src/engine/handdetail/runHandDetailTest.ts`](../src/engine/handdetail/runHandDetailTest.ts) にて以下19項目を全自動検証しています：
- チョキ時の示指・中指EDC伸筋腱の選択隆起（環指・小指比 `> 2×`）＆パー時の全4腱＋EPL隆起
- Langer線 逆位相法則（グー時の背側皺平坦化 & 掌側皺深化 & 粗さシフト）
- 手掌3D頂点変形の有限性・掌側ゼロリーク・OFF時の完全復元（誤差 `< 1e-6`）
- 3波長スペクトル皮膚拡散のターミネーター位相差順序（`R > G > B`）
- 2層GGX皮脂/角質スペキュラーの発汗応答＆非対称爪床毛細血管再充血時定数
- 520本カーブ手背産毛＋34本/指の基節背側産毛の生成・全行列有限性・背側限定配置
- 立体厚み3D爪スラブ＆3D甘皮アーチの幾何検証
- `INFINITE-ZOOM OPTICS 1.0` の `5000×` 超顕微（視野高 `0.345mm`・めり込みゼロ）・`0.25×` 広角・`1.0×` リセット検証
