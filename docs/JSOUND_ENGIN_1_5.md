# JSound Engin 1.5 — Research-Grade 3OA / 2D-FDTD / Quantum AudioWorklet Physical DSP Architecture

Zero external audio samples (`0 bytes` of `.wav`/`.mp3`/`.ogg`). 100% first-principles real-time & procedural physics synthesis running directly inside Web Audio API + dedicated real-time `AudioWorkletProcessor`.

## 5 Breakthrough Technologies Introduced in JSound Engin 1.5

### 1. Nonlinear 2D Kirchhoff-Love Thin-Plate & von Kármán Membrane FDTD Solver (`WaveFieldSolver2D.ts`)
Solves the genuine 2D damped nonlinear wave & stiff-plate PDE directly on a finite-difference mesh:
$$\frac{\partial^2 u}{\partial t^2} = c^2\bigl(1 + \gamma \overline{|\nabla u|^2}\bigr)\nabla^2 u - \kappa^2 \nabla^4 u - 2\sigma_0 \frac{\partial u}{\partial t} + 2\sigma_1 \nabla^2 \frac{\partial u}{\partial t} + F_{\mathrm{Hertz}}(x,y,t)$$
- **Exact 2D Strike-Coordinate Physics**: Center strikes excite deep fundamental $(0,1)$ membrane modes, while rim strikes naturally excite bright asymmetric Bessel/plate overtones (`f_centroid(rim) > f_centroid(center)`).
- **von Kármán Cubic Tension Stiffening**: High-velocity impacts dynamically raise global membrane/plate tension ($\Delta T$), creating authentic Odaiko pitch-drop punch and metallic gong shimmer.
- **Dual-Microphone Wavefront Pickup**: Samples velocity $\partial u/\partial t$ at two separated coordinates across the vibrating 2D body for physical wavefront-propagation stereo.
- **Powers**: `synthesizeDualMaterialClash` tabletop waves, `synthesizeDaibyoshi` (大拍子太鼓), and `synthesizeTsuridaiko` (雅楽釣太鼓).

### 2. 16-Channel 3rd-Order Ambisonics (3OA ACN/SN3D Max-$r_E$) & 12-Speaker KEMAR Binaural Decoder (`Ambisonics3OAEngine.ts`)
- Exact 16 real spherical harmonics $Y_l^m(\theta,\phi)$ (`l = 0..3`, ACN ordering, SN3D normalization) weighted by Daniel / Zotter-Frank **Max-$r_E$** sidelobe weights (`[1.0, 0.861, 0.612, 0.305]`).
- Exact orthogonal **Wigner-D / SO(2) Yaw Rotation** (`rotate3OAYaw`) preserving L2 norm (`||R·s||₂ === ||s||₂` to $< 10^{-12}$).
- **12-Vertex Regular Icosahedral Virtual Loudspeaker Array** decoded via **Woodworth-Schlosberg ITD + Brown-Duda Spherical Head Diffraction ILD + Shaw/KEMAR Elevation Pinna Notch & Front/Back Concha Cues**.
- Powers **7th-Order 520+ Ray 3OA Architectural Impulse Responses** + **9-Band Velvet-Noise Late Reverb** (`8,000 pulses/sec` in Ultra) across all 5 stages, and the new flagship spatial mode **`★ 4D Audio X (3OA)`**.

### 3. Dedicated Audio-Thread `QuantumMasterWorklet` (`QuantumMasterWorklet.ts`)
Self-contained zero-dependency inline Blob `AudioWorkletProcessor` (with automatic seamless fallback & bit-identical offline `QuantumMasterKernel`):
1. **8-Channel Unitary Walsh-Hadamard Modulated FDN**: 8 mutually prime delay lines (`347..1399` samples) mixed through an exact orthogonal $\frac{1}{\sqrt{8}} H_8$ matrix with per-line absorptive damping and slow inharmonic thermal-air delay modulation ($\pm 0.18\text{ ms}$) for living, breathing air halos.
2. **13-String Stage-Tuned Japanese Sympathetic Resonance Bank**: High-Q physical resonators (Zashiki: 13-string Hirajoshi Koto; Shrine: Bronze Bonsho; Onsen: Limestone cavern; Salon: Harp; Atelier: Forged iron chimes) gently excited by arena clash energy.
3. **True 4×OS Catmull-Rom 1.5 ms Look-Ahead Brickwall True-Peak Limiter**: Clamps intersample DAC overshoots strictly to `≤ -0.35 dBTP` even on `+9 dBFS` overload transients.
4. **Real-Time ITU-R BS.1770-4 K-Weighted LUFS, True-Peak dBTP, Phase Correlation ($\rho_{LR}$), Crest Factor & ISO 226:2023 Equal-Loudness Contour** streamed directly into the Studio Drawer.

### 4. 63-Tap Kaiser ($\beta = 13.2$) `-134 dB` Mastering Decimator & 16×OS (`768 kHz`) Transient Core (`ModalSynthesizer.ts`)
- Exact 63-tap linear-phase Half-Band FIR (`-0.016 dB` flatness @ `19.2 kHz`, `-134 dB` ultrasonic stopband rejection, `-280 dB` Nyquist zero) using only 16 symmetric Float64 multiply-adds per sample.
- Up to **`768 kHz` (`16×OS`)** on ultra-crisp short attacks in Ultra mode.

### 5. Expanded 44-Instrument / 70-Material / 120-Sound Library & 40-Instrument Interactive Studio Deck
- **70 calibrated physical materials** (+12 artisan Japanese ceramics, rare woods, lacquer, cast iron, crystal quartz).
- **44 pure-physical-modeling instruments** (+8 new: Daibyoshi, Tsuridaiko, Wagon 6-string zither, Komabue, Kagurabue, Karakuri Orugoru, Edo Kiriko crystal chime, Morioka Nanbu Tekki cast-iron Furin).
- **24 living 3OA/4D world soundscape actors** across all 5 architectural stages.
