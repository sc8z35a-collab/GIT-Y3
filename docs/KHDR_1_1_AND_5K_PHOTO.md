# KHDR 1.1 & 5K High-Bitrate 48-Bit Current-Angle Photo Capture

## 1. KHDR 1.1（Kinetic Dual-Lobe Spectral HDR 1.1）
[KHDRPipeline.ts](../src/graphics/KHDRPipeline.ts) を **v1.1** へ強化し、リアルタイム描画と 5K 静止画保存の両方で非ネオン・中判フィルム品質の高ダイナミックレンジ描写を実現しました。

- **AgX インスパイア Spectral Inset / Outset × 16-Stop トーンカーブ (`khdr11SpectralToneMap`)**:
  - 圧縮前にスペクトル・クロストーク Inset 行列を掛け、高輝度日光下での肌・檜・漆・真鍮の黄ばみ／白飛びを抑止。圧縮後に部分 Outset 行列で中調の色純度を自然復元。
- **Bilateral Edge-Safe Dual-Scale Retinex 1.1**:
  - 輝度差に応じたエッジ保護重み (`edgeGuard`) により、手と盤面境界のハローを完全に抑えつつ、暗部と明部の木目・指紋・皺の微細コントラストを両立。
- **Depth-Aware Foreground Micro-Clarity**:
  - WebGL2 深度テクスチャを参照し、手前の手元・関節の解像感を優先的に引き出しながら背景建築の滑らかな空気遠近感を保持。
- **グローバルタイル UV ＆ 16-Bit ノンディザー出力 (`renderHighBitDepthTile`)**:
  - 5K 分割撮影時は 8-bit 表示用ディザーを完全停止し、32-bit 浮動小数点（`FloatType`）ターゲットへシームレスに書き出し。

## 2. 現アングル 5K 高ビットレート 48-Bit（16-Bit/ch）PNG 撮影エンジン
[PhotoCapture5K.ts](../src/graphics/PhotoCapture5K.ts) により、現在表示しているカメラ視点そのまま（自由鑑賞でのドラッグ／ズーム構図も含む）を UI なしの純粋な 1 枚の写真として保存します。

- **真の 5K 解像度（長辺 `5120px`）**: 16:9 環境で **`5120×2880`（1,475 万画素）**、縦画面でも長辺 `5120px` で現アスペクト比を 1:1 維持。
- **2×2 オーバーサンプリング・ガター分割撮影 (`camera.setViewOffset` + 32px 余白)**:
  - `MAX_TEXTURE_SIZE = 4096` の GPU でも確実に 5K 描画でき、Retinex ブラー・深度クラリティ・光学ビネットに **継ぎ目ゼロ**。
- **純 TypeScript RFC 2083 48-Bit（16-Bit/ch）ロスレス PNG エンコーダ (`encodeRgb16Png`)**:
  - 一般的なブラウザの 8-bit `canvas.toDataURL`（256 階調）を排し、WebGL2 `Float32` から直接 **16-bit/ch（65,536 階調 × 3ch = 281 兆色）** の高ビットレート PNG を生成。
  - `IHDR (16-bit Truecolor RGB)`・`sRGB`・`gAMA`・`pHYs (300 DPI)`・`tEXt (KHDR 1.1 メタデータ)`・Sub フィルタ・ネイティブ `CompressionStream('deflate')`・全チャンク CRC-32 を完全準拠で出力。
