/**
 * Interactive UI Controller for JANKEN · 極 (3D Architectural Duel).
 * Renders:
 *  - Minimal top header bar + live render telemetry (Resolution / FPS / KHDR / Shadow Flame)
 *  - Match Scoreboard (Best-of-5 / Best-of-9 / Endless)
 *  - Tactile Rock / Scissors / Paper hand dock with live JNV1.0 SHA-256 Pre-Commit Seal
 *  - Left Slide-out Drawer: Graphics Studio (HD/FHD/1.5K/2K, 60/120/Unlimited FPS, KHDR ON/OFF + A/B Split,
 *    Shadow Flame 1.0 Standard/Flash/Pro, 5 Photorealistic Stages, Hand Materials)
 *  - Right Slide-out Drawer: JNV1.0 Cognitive Core Inspector (Personas, SHA-256 Seal Verification,
 *    Last-Round Prediction Post-Mortem, Top-6 Experts Leaderboard, Player Behavioral Profile, Live 1,600-Round Benchmark!)
 */

import { runJNV1Benchmark, BenchmarkBotResult } from '../engine/jnv1/benchmark';
import { JNV_PERSONA_LIST } from '../engine/jnv1/personas';
import {
  CommitSeal,
  JNVPersonaId,
  JNVRoundTelemetry,
  MOVE_META,
  Move,
  PAPER,
  ROCK,
  SCISSORS,
} from '../engine/jnv1/types';
import {
  FpsLimitMode,
  GraphicsSettings,
  HandMaterialPreset,
  RESOLUTION_LIST,
  RenderMetrics,
  ResolutionPresetId,
  SHADOW_FLAME_SPECS,
  ShadowFlameMode,
  StageId,
} from '../graphics/GraphicsConfig';
import { STAGE_LIST } from '../scene/StageBuilder';

export type MatchFormat = 'bo5' | 'bo9' | 'endless';

export interface GameUIHandlers {
  onSelectMove: (move: Move) => void;
  onHoverMove: (move: Move | null) => void;
  onResetMatch: () => void;
  onChangeMatchFormat: (fmt: MatchFormat) => void;
  onChangeResolution: (res: ResolutionPresetId) => void;
  onChangeFpsLimit: (fps: FpsLimitMode) => void;
  onToggleKHDR: (enabled: boolean) => void;
  onToggleKHDRSplit: (enabled: boolean) => void;
  onChangeKHDRSplitX: (normX: number) => void;
  onChangeShadowFlame: (mode: ShadowFlameMode) => void;
  onChangeStage: (stage: StageId) => void;
  onChangeHandMaterials: (playerMat: HandMaterialPreset, npcMat: HandMaterialPreset) => void;
  onChangePersona: (persona: JNVPersonaId) => void;
  onToggleSound: () => boolean;
}

const HAND_MATERIAL_OPTIONS: Array<{ id: HandMaterialPreset; label: string }> = [
  { id: 'hinoki_ivory', label: '檜象牙' },
  { id: 'karakuri_bronze', label: 'からくり真鍮' },
  { id: 'bisque_porcelain', label: '京白磁' },
  { id: 'obsidian_gold', label: '黒曜金継' },
];

const SVG_ICONS: Record<Move, string> = {
  [ROCK]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12V9a2 2 0 0 1 4 0v1"/><path d="M10 9V8a2 2 0 0 1 4 0v2"/><path d="M14 9.5a2 2 0 0 1 4 0V14a6 6 0 0 1-6 6H9.5A5.5 5.5 0 0 1 4 14.5V12a2 2 0 0 1 2-2Z"/><path d="M6 12h8"/></svg>`,
  [SCISSORS]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12.5 11.2 14.5 4.6a1.5 1.5 0 1 1 2.86.88L15.2 12.5"/><path d="M15.2 12.5a2 2 0 0 1 3.3 1.5V15a6 6 0 0 1-6 6H10a5 5 0 0 1-5-5v-2.5a2 2 0 0 1 4 0"/></svg>`,
  [PAPER]: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12V5a1.5 1.5 0 0 1 3 0v6"/><path d="M10 11V3.8a1.5 1.5 0 0 1 3 0V11"/><path d="M13 11V4.8a1.5 1.5 0 0 1 3 0V12"/><path d="M16 12V7.5a1.5 1.5 0 0 1 3 0V15a6.5 6.5 0 0 1-6.5 6.5H10A5.5 5.5 0 0 1 4.5 16v-3.5a1.5 1.5 0 0 1 3 0"/></svg>`,
};

export class GameUI {
  private readonly root: HTMLElement;
  private readonly handlers: GameUIHandlers;

  private graphicsOpen = false;
  private inspectorOpen = false;
  private soundOn = true;
  private currentSettings: GraphicsSettings;
  private currentPersona: JNVPersonaId = 'apex';
  private matchFormat: MatchFormat = 'bo5';
  private benchmarkCache: BenchmarkBotResult[] | null = null;

  // Key DOM refs
  private perfStripEl!: HTMLElement;
  private scorePlayerEl!: HTMLElement;
  private scoreNpcEl!: HTMLElement;
  private scoreRoundEl!: HTMLElement;
  private calloutEl!: HTMLElement;
  private calloutTitleEl!: HTMLElement;
  private calloutSubEl!: HTMLElement;
  private calloutMatchupEl!: HTMLElement;
  private sealBarEl!: HTMLElement;
  private handButtons: HTMLButtonElement[] = [];

  private graphicsDrawerEl!: HTMLElement;
  private inspectorDrawerEl!: HTMLElement;
  private graphicsNavBtn!: HTMLButtonElement;
  private inspectorNavBtn!: HTMLButtonElement;
  private soundNavBtn!: HTMLButtonElement;

  private graphicsBodyEl!: HTMLElement;
  private inspectorBodyEl!: HTMLElement;

  private splitOverlayEl!: HTMLElement;
  private splitHandleEl!: HTMLElement;

  private modalBackdropEl!: HTMLElement;
  private modalTitleEl!: HTMLElement;
  private modalDescEl!: HTMLElement;
  private modalStatsEl!: HTMLElement;

  private lastTelemetry: JNVRoundTelemetry | null = null;
  private currentSeal: CommitSeal | null = null;

  constructor(
    root: HTMLElement,
    initialSettings: GraphicsSettings,
    initialPersona: JNVPersonaId,
    handlers: GameUIHandlers
  ) {
    this.root = root;
    this.currentSettings = { ...initialSettings };
    this.currentPersona = initialPersona;
    this.handlers = handlers;

    this.mountSkeleton();
    this.renderGraphicsDrawer();
    this.renderInspectorDrawer();
    this.bindKeyboardShortcuts();
    this.bindSplitDrag();
  }

  private mountSkeleton(): void {
    this.root.innerHTML = `
      <header class="top-bar">
        <div class="brand-cluster">
          <div class="brand-plate">
            <div class="brand-hanko" aria-hidden="true">極</div>
            <div class="brand-titles">
              <h1>JANKEN · 極</h1>
              <p>PHOTOREALISTIC 3D DUEL · JNV1.0 CORE</p>
            </div>
          </div>
          <div class="perf-strip" id="perf-strip">
            <span class="perf-chip"><strong>--</strong> FPS</span>
            <span class="perf-sep">|</span>
            <span class="perf-chip"><strong>FHD</strong></span>
            <span class="perf-sep">|</span>
            <span class="perf-chip accent"><strong>KHDR ON</strong></span>
            <span class="perf-sep">|</span>
            <span class="perf-chip accent"><strong>SF 1.0 Pro</strong></span>
          </div>
        </div>

        <div class="scoreboard" aria-label="対戦スコア">
          <div class="score-side player">
            <span class="label">あなた</span>
            <span class="num" id="score-player">0</span>
          </div>
          <div class="score-center">
            <span class="score-round" id="score-round">ROUND 1 · 引分 0</span>
            <select id="match-format-select" class="match-mode-select" aria-label="試合形式">
              <option value="bo5">3本先取 (5本勝負)</option>
              <option value="bo9">5本先取 (9本勝負)</option>
              <option value="endless">無制限 (エンドレス)</option>
            </select>
          </div>
          <div class="score-side npc">
            <span class="label">JNV1.0</span>
            <span class="num" id="score-npc">0</span>
          </div>
        </div>

        <div class="top-actions">
          <button id="btn-graphics" class="nav-btn" type="button">
            <span>映像・舞台</span>
            <span class="tag">KHDR / SF1.0</span>
          </button>
          <button id="btn-inspector" class="nav-btn" type="button">
            <span>JNV1.0 解析</span>
            <span class="tag">36 EXP</span>
          </button>
          <button id="btn-sound" class="nav-btn" type="button" title="音響オンオフ">
            <span>音響 ON</span>
          </button>
        </div>
      </header>

      <main class="center-stage-hud">
        <div class="callout-banner" id="callout-banner" role="status" aria-live="polite">
          <div class="callout-title" id="callout-title">いざ勝負</div>
          <div class="callout-matchup" id="callout-matchup"></div>
          <div class="callout-sub" id="callout-sub"></div>
        </div>
      </main>

      <footer class="bottom-dock">
        <div class="seal-bar" id="seal-bar">
          <span class="seal-dot"></span>
          <span class="persona-badge">JNV1.0-APEX</span>
          <span>事前封印済 SHA-256:</span>
          <span class="hash">計算中…</span>
        </div>

        <div class="hand-controls-row" role="group" aria-label="手を選択">
          ${([ROCK, SCISSORS, PAPER] as const)
            .map(
              (m) => `
            <button class="hand-btn" data-move="${m}" id="btn-move-${MOVE_META[m].id}" type="button">
              <span class="hand-icon">${SVG_ICONS[m]}</span>
              <span class="hand-text">
                <span class="jp">${MOVE_META[m].jp}</span>
                <span class="en">${MOVE_META[m].en}</span>
              </span>
              <span class="hand-key">${MOVE_META[m].key}</span>
            </button>
          `
            )
            .join('')}
        </div>

        <div class="bottom-meta">
          <span>ドラッグで3D視点回転 · ダブルクリックで視点復帰 · キー [1][2][3] で即出し</span>
          <button id="btn-reset-match" class="link-btn" type="button">試合をリセット</button>
        </div>
      </footer>

      <div class="khdr-split-overlay" id="khdr-split-overlay">
        <div class="khdr-split-label left">← 標準 SDR (KHDR OFF)</div>
        <div class="khdr-split-label right">独自 KHDR ON →</div>
        <div class="khdr-split-handle" id="khdr-split-handle" title="左右にドラッグしてKHDR比較">⇄</div>
      </div>

      <aside class="drawer left" id="drawer-graphics" aria-label="映像・舞台設定">
        <div class="drawer-header">
          <div>
            <h2>映像エンジン・舞台設定</h2>
            <div class="subtitle">HD〜2K · KHDR · SHADOW FLAME 1.0</div>
          </div>
          <button class="drawer-close" id="close-graphics" type="button" aria-label="閉じる">×</button>
        </div>
        <div class="drawer-body" id="graphics-drawer-body"></div>
      </aside>

      <aside class="drawer right" id="drawer-inspector" aria-label="JNV1.0 頭脳解析">
        <div class="drawer-header">
          <div>
            <h2>JNV1.0 独自NPCコア解析</h2>
            <div class="subtitle">NON-STATIONARY INFERENCE &amp; VOLATILITY ENGINE</div>
          </div>
          <button class="drawer-close" id="close-inspector" type="button" aria-label="閉じる">×</button>
        </div>
        <div class="drawer-body" id="inspector-drawer-body"></div>
      </aside>

      <div class="match-modal-backdrop" id="match-modal">
        <div class="match-modal">
          <h3 id="modal-title">勝負あり</h3>
          <p id="modal-desc"></p>
          <div class="match-modal-stats" id="modal-stats"></div>
          <button id="btn-modal-rematch" class="action-btn" type="button">もう一局挑む（学習継続・再戦）</button>
          <button id="btn-modal-fresh" class="seg-btn" type="button">JNV1.0記憶を初期化して新規対戦</button>
        </div>
      </div>
    `;

    this.perfStripEl = this.root.querySelector('#perf-strip')!;
    this.scorePlayerEl = this.root.querySelector('#score-player')!;
    this.scoreNpcEl = this.root.querySelector('#score-npc')!;
    this.scoreRoundEl = this.root.querySelector('#score-round')!;
    this.calloutEl = this.root.querySelector('#callout-banner')!;
    this.calloutTitleEl = this.root.querySelector('#callout-title')!;
    this.calloutSubEl = this.root.querySelector('#callout-sub')!;
    this.calloutMatchupEl = this.root.querySelector('#callout-matchup')!;
    this.sealBarEl = this.root.querySelector('#seal-bar')!;

    this.graphicsDrawerEl = this.root.querySelector('#drawer-graphics')!;
    this.inspectorDrawerEl = this.root.querySelector('#drawer-inspector')!;
    this.graphicsNavBtn = this.root.querySelector('#btn-graphics')!;
    this.inspectorNavBtn = this.root.querySelector('#btn-inspector')!;
    this.soundNavBtn = this.root.querySelector('#btn-sound')!;
    this.graphicsBodyEl = this.root.querySelector('#graphics-drawer-body')!;
    this.inspectorBodyEl = this.root.querySelector('#inspector-drawer-body')!;

    this.splitOverlayEl = this.root.querySelector('#khdr-split-overlay')!;
    this.splitHandleEl = this.root.querySelector('#khdr-split-handle')!;

    this.modalBackdropEl = this.root.querySelector('#match-modal')!;
    this.modalTitleEl = this.root.querySelector('#modal-title')!;
    this.modalDescEl = this.root.querySelector('#modal-desc')!;
    this.modalStatsEl = this.root.querySelector('#modal-stats')!;

    this.handButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.hand-btn'));
    for (const btn of this.handButtons) {
      const move = Number(btn.dataset.move) as Move;
      btn.addEventListener('click', () => this.handlers.onSelectMove(move));
      btn.addEventListener('mouseenter', () => this.handlers.onHoverMove(move));
      btn.addEventListener('mouseleave', () => this.handlers.onHoverMove(null));
    }

    this.graphicsNavBtn.addEventListener('click', () => {
      this.graphicsOpen = !this.graphicsOpen;
      this.syncDrawers();
    });
    this.inspectorNavBtn.addEventListener('click', () => {
      this.inspectorOpen = !this.inspectorOpen;
      this.syncDrawers();
    });
    this.root.querySelector('#close-graphics')!.addEventListener('click', () => {
      this.graphicsOpen = false;
      this.syncDrawers();
    });
    this.root.querySelector('#close-inspector')!.addEventListener('click', () => {
      this.inspectorOpen = false;
      this.syncDrawers();
    });

    this.soundNavBtn.addEventListener('click', () => {
      this.soundOn = this.handlers.onToggleSound();
      this.soundNavBtn.innerHTML = `<span>音響 ${this.soundOn ? 'ON' : 'OFF'}</span>`;
    });

    const fmtSelect = this.root.querySelector<HTMLSelectElement>('#match-format-select')!;
    fmtSelect.value = this.matchFormat;
    fmtSelect.addEventListener('change', () => {
      this.matchFormat = fmtSelect.value as MatchFormat;
      this.handlers.onChangeMatchFormat(this.matchFormat);
    });

    this.root.querySelector('#btn-reset-match')!.addEventListener('click', () => {
      this.closeMatchModal();
      this.handlers.onResetMatch();
    });
  }

  private syncDrawers(): void {
    this.graphicsDrawerEl.classList.toggle('open', this.graphicsOpen);
    this.inspectorDrawerEl.classList.toggle('open', this.inspectorOpen);
    this.graphicsNavBtn.classList.toggle('active', this.graphicsOpen);
    this.inspectorNavBtn.classList.toggle('active', this.inspectorOpen);
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (this.modalBackdropEl.classList.contains('open')) return;
      const k = e.key.toLowerCase();
      if (k === '1' || k === 'a') this.handlers.onSelectMove(ROCK);
      else if (k === '2' || k === 's') this.handlers.onSelectMove(SCISSORS);
      else if (k === '3' || k === 'd') this.handlers.onSelectMove(PAPER);
      else if (k === 'g') {
        this.graphicsOpen = !this.graphicsOpen;
        this.syncDrawers();
      } else if (k === 'j') {
        this.inspectorOpen = !this.inspectorOpen;
        this.syncDrawers();
      }
    });
  }

  private bindSplitDrag(): void {
    let dragging = false;
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const norm = Math.max(0.06, Math.min(0.94, e.clientX / Math.max(1, window.innerWidth)));
      this.splitHandleEl.style.left = `${norm * 100}%`;
      this.handlers.onChangeKHDRSplitX(norm);
    };
    const onUp = () => {
      dragging = false;
    };
    this.splitHandleEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = true;
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  public setButtonsDisabled(disabled: boolean): void {
    for (const b of this.handButtons) b.disabled = disabled;
  }

  public updateScoreboard(
    playerWins: number,
    npcWins: number,
    draws: number,
    roundNumber: number
  ): void {
    this.scorePlayerEl.textContent = String(playerWins);
    this.scoreNpcEl.textContent = String(npcWins);
    this.scoreRoundEl.textContent = `ROUND ${roundNumber} · あいこ ${draws}`;
  }

  public updatePreCommitSeal(seal: CommitSeal, personaCode: string): void {
    this.currentSeal = seal;
    this.sealBarEl.innerHTML = `
      <span class="seal-dot"></span>
      <span class="persona-badge">${personaCode}</span>
      <span>R${seal.round} 事前封印済 SHA-256:</span>
      <span class="hash">${seal.shortHash}</span>
    `;
    this.renderInspectorDrawer();
  }

  public showCallout(
    title: string,
    tone: 'neutral' | 'win' | 'loss' | 'draw',
    matchupText = '',
    subText = ''
  ): void {
    this.calloutTitleEl.textContent = title;
    this.calloutTitleEl.className = `callout-title ${tone === 'neutral' ? '' : tone}`;
    this.calloutMatchupEl.textContent = matchupText;
    this.calloutSubEl.textContent = subText;
    this.calloutEl.classList.add('visible');
  }

  public hideCallout(): void {
    this.calloutEl.classList.remove('visible');
  }

  public updateRenderMetrics(m: RenderMetrics): void {
    const fpsModeLabel =
      this.currentSettings.fpsLimit === 0 ? '無制限' : `${this.currentSettings.fpsLimit}上限`;
    const sfShort = SHADOW_FLAME_SPECS[m.shadowFlameMode].shortLabel;

    this.perfStripEl.innerHTML = `
      <span class="perf-chip"><strong>${m.fps}</strong> FPS <span style="opacity:.6">(${m.frameTimeMs}ms / 1%Low ${m.onePercentLowFps})</span></span>
      <span class="perf-sep">|</span>
      <span class="perf-chip"><strong>${this.currentSettings.resolution.toUpperCase()}</strong> ${m.renderWidth}×${m.renderHeight}</span>
      <span class="perf-sep">|</span>
      <span class="perf-chip accent"><strong>KHDR ${m.khdrActive ? 'ON' : 'OFF'}</strong></span>
      <span class="perf-sep">|</span>
      <span class="perf-chip accent"><strong>${sfShort}</strong> (${m.shadowMapSize}px)</span>
      <span class="perf-sep">|</span>
      <span class="perf-chip">${fpsModeLabel} · ${(m.triangles / 1000).toFixed(1)}k tri</span>
    `;

    // Also refresh live stat cells inside Graphics drawer if open
    const liveEl = this.graphicsBodyEl.querySelector('#live-gpu-stats');
    if (liveEl) {
      liveEl.innerHTML = `
        <div class="metric-box"><div class="k">実描画解像度</div><div class="v">${m.renderWidth}×${m.renderHeight}</div></div>
        <div class="metric-box"><div class="k">実測FPS / Frame</div><div class="v good">${m.fps} FPS (${m.frameTimeMs}ms)</div></div>
        <div class="metric-box"><div class="k">ShadowMap解像度</div><div class="v">${m.shadowMapSize}×${m.shadowMapSize}</div></div>
        <div class="metric-box"><div class="k">Draw / Triangles</div><div class="v">${m.drawCalls} / ${(m.triangles / 1000).toFixed(1)}k</div></div>
      `;
    }
  }

  public syncSettings(settings: GraphicsSettings): void {
    this.currentSettings = { ...settings };
    this.splitOverlayEl.classList.toggle('active', settings.khdrSplitCompare);
    this.renderGraphicsDrawer();
  }

  public updateJNVTelemetry(telemetry: JNVRoundTelemetry | null, personaId: JNVPersonaId): void {
    this.lastTelemetry = telemetry;
    this.currentPersona = personaId;
    this.renderInspectorDrawer();
  }

  public showMatchModal(
    winner: 'player' | 'npc',
    playerWins: number,
    npcWins: number,
    draws: number,
    onRematchKeepMemory: () => void,
    onRematchFresh: () => void
  ): void {
    this.modalTitleEl.textContent = winner === 'player' ? '見事、勝利' : 'JNV1.0 の勝利';
    this.modalDescEl.textContent =
      winner === 'player'
        ? 'JNV1.0の36専門家アンサンブルと非定常読心モデルを打ち破りました。再戦するとJNV1.0はあなたの癖をさらに深く学習します。'
        : 'JNV1.0があなたの行動パターンと心理シフトを捕捉しました。戦術を変化させるか、心理の裏を突いて再挑戦しましょう。';

    this.modalStatsEl.innerHTML = `
      <div class="metric-box"><div class="k">あなた</div><div class="v good">${playerWins}勝</div></div>
      <div class="metric-box"><div class="k">JNV1.0</div><div class="v warn">${npcWins}勝</div></div>
      <div class="metric-box"><div class="k">あいこ</div><div class="v">${draws}回</div></div>
    `;

    const btnRematch = this.root.querySelector<HTMLButtonElement>('#btn-modal-rematch')!;
    const btnFresh = this.root.querySelector<HTMLButtonElement>('#btn-modal-fresh')!;
    btnRematch.onclick = () => {
      this.closeMatchModal();
      onRematchKeepMemory();
    };
    btnFresh.onclick = () => {
      this.closeMatchModal();
      onRematchFresh();
    };

    this.modalBackdropEl.classList.add('open');
  }

  public closeMatchModal(): void {
    this.modalBackdropEl.classList.remove('open');
  }

  private renderGraphicsDrawer(): void {
    const s = this.currentSettings;
    const sfSpec = SHADOW_FLAME_SPECS[s.shadowFlame];

    this.graphicsBodyEl.innerHTML = `
      <section class="panel-section">
        <div class="section-title"><span>内部レンダリング解像度</span><span>WebGL2 HalfFloat</span></div>
        <div class="seg-group cols-4">
          ${RESOLUTION_LIST.map(
            (r) => `
            <button class="seg-btn ${s.resolution === r.id ? 'active' : ''}" data-res="${r.id}" type="button">
              <span>${r.label}</span>
              <small>${r.nominalHeight}p</small>
            </button>
          `
          ).join('')}
        </div>
        <p class="section-note">HD (1280×720) 〜 2K (2560×1440) の実フレームバッファ解像度をリアルタイム切替します。</p>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>フレームレート制御 (FPS)</span><span>精度ペーサー</span></div>
        <div class="seg-group cols-3">
          ${([
            { v: 60 as FpsLimitMode, label: '60 FPS', sub: '16.7ms' },
            { v: 120 as FpsLimitMode, label: '120 FPS', sub: '8.3ms' },
            { v: 0 as FpsLimitMode, label: '無制限', sub: 'Uncapped' },
          ])
            .map(
              (f) => `
            <button class="seg-btn ${s.fpsLimit === f.v ? 'active' : ''}" data-fps="${f.v}" type="button">
              <span>${f.label}</span>
              <small>${f.sub}</small>
            </button>
          `
            )
            .join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>KHDR 独自拡張HDRパイプライン</span><span>16-bit Linear</span></div>
        <div class="seg-group cols-2">
          <button class="seg-btn ${s.khdrEnabled ? 'active' : ''}" data-khdr="on" type="button">
            <span>KHDR ON</span>
            <small>二重スケール局所適応</small>
          </button>
          <button class="seg-btn ${!s.khdrEnabled ? 'active' : ''}" data-khdr="off" type="button">
            <span>KHDR OFF</span>
            <small>標準SDR比較</small>
          </button>
        </div>
        <button class="seg-btn ${s.khdrSplitCompare ? 'active' : ''}" id="btn-khdr-split" type="button" style="width:100%">
          <span>${s.khdrSplitCompare ? '✓ A/B 分割比較表示中（画面中央のハンドルをドラッグ）' : 'KHDR vs 標準SDR リアルタイム分割比較を開く'}</span>
        </button>
        <p class="section-note">
          独自技術 <strong>KHDR (Kinetic Dual-Lobe Spectral HDR)</strong>：対数輝度レティネックス局所適応で暗部ディテールと明部ハイライト色度を両立し、物理レンズ光学ベールとブルーノイズディザで自然光階調を極限再現。
        </p>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>Shadow Flame 1.0 独自影エンジン</span><span>${sfSpec.shortLabel}</span></div>
        <div class="seg-group cols-3">
          <button class="seg-btn ${s.shadowFlame === 'standard' ? 'active' : ''}" data-sf="standard" type="button">
            <span>標準PCF</span>
            <small>比較用</small>
          </button>
          <button class="seg-btn ${s.shadowFlame === 'flash' ? 'active' : ''}" data-sf="flash" type="button">
            <span>1.0 Flash</span>
            <small>軽量・高写実</small>
          </button>
          <button class="seg-btn ${s.shadowFlame === 'pro' ? 'active' : ''}" data-sf="pro" type="button">
            <span>1.0 Pro</span>
            <small>PCSS + SSCS</small>
          </button>
        </div>
        <p class="section-note">${sfSpec.descriptionJp}</p>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>建築ステージ（提供素材PBR構築）</span><span>5舞台</span></div>
        <div class="stage-list">
          ${STAGE_LIST.map(
            (st) => `
            <button class="stage-card-btn ${s.stage === st.id ? 'active' : ''}" data-stage="${st.id}" type="button">
              <strong>${st.nameJp}</strong>
              <span>${st.subtitleJp}</span>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>彫刻ハンド仕上げ素材</span><span>物理PBR</span></div>
        <div class="section-note">あなたの右手素材</div>
        <div class="seg-group cols-4">
          ${HAND_MATERIAL_OPTIONS.map(
            (hm) => `
            <button class="seg-btn ${s.playerHandMaterial === hm.id ? 'active' : ''}" data-pmat="${hm.id}" type="button">
              <span>${hm.label}</span>
            </button>
          `
          ).join('')}
        </div>
        <div class="section-note" style="margin-top:4px">JNV1.0 対戦相手ハンド素材</div>
        <div class="seg-group cols-4">
          ${HAND_MATERIAL_OPTIONS.map(
            (hm) => `
            <button class="seg-btn ${s.npcHandMaterial === hm.id ? 'active' : ''}" data-nmat="${hm.id}" type="button">
              <span>${hm.label}</span>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>リアルタイム描画テレメトリ</span></div>
        <div class="telemetry-grid" id="live-gpu-stats">
          <div class="metric-box"><div class="k">実描画解像度</div><div class="v">計測中…</div></div>
          <div class="metric-box"><div class="k">実測FPS / Frame</div><div class="v">--</div></div>
        </div>
      </section>
    `;

    // Bind Graphics Drawer buttons
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-res]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeResolution(b.dataset.res as ResolutionPresetId)
      );
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-fps]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeFpsLimit(Number(b.dataset.fps) as FpsLimitMode)
      );
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-khdr]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onToggleKHDR(b.dataset.khdr === 'on'));
    });
    this.graphicsBodyEl.querySelector('#btn-khdr-split')!.addEventListener('click', () => {
      this.handlers.onToggleKHDRSplit(!this.currentSettings.khdrSplitCompare);
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-sf]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeShadowFlame(b.dataset.sf as ShadowFlameMode)
      );
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((b) => {
      b.addEventListener('click', () => this.handlers.onChangeStage(b.dataset.stage as StageId));
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-pmat]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeHandMaterials(
          b.dataset.pmat as HandMaterialPreset,
          this.currentSettings.npcHandMaterial
        )
      );
    });
    this.graphicsBodyEl.querySelectorAll<HTMLButtonElement>('[data-nmat]').forEach((b) => {
      b.addEventListener('click', () =>
        this.handlers.onChangeHandMaterials(
          this.currentSettings.playerHandMaterial,
          b.dataset.nmat as HandMaterialPreset
        )
      );
    });
  }

  private renderInspectorDrawer(): void {
    const t = this.lastTelemetry;
    const seal = this.currentSeal;

    const benchHtml = this.benchmarkCache
      ? `
        <table class="bench-table">
          <thead>
            <tr><th>対戦相手ボット</th><th class="num">勝率</th><th class="num">純利/100</th><th class="num">証明</th></tr>
          </thead>
          <tbody>
            ${this.benchmarkCache
              .map(
                (r) => `
              <tr>
                <td>${r.botNameJp.split('（')[0]}</td>
                <td class="num ${r.decisiveWinRate >= 0.62 ? 'winrate-high' : ''}">${(r.decisiveWinRate * 100).toFixed(1)}%</td>
                <td class="num">${r.netEdgePer100 >= 0 ? '+' : ''}${r.netEdgePer100.toFixed(1)}</td>
                <td class="num">${r.allSealsVerified ? '✓' : '✗'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
      : '';

    this.inspectorBodyEl.innerHTML = `
      <section class="panel-section">
        <div class="section-title"><span>JNV1.0 アーキテクチャ構成切替</span><span>7層推論</span></div>
        <div class="stage-list">
          ${JNV_PERSONA_LIST.map(
            (p) => `
            <button class="stage-card-btn ${this.currentPersona === p.id ? 'active' : ''}" data-persona="${p.id}" type="button">
              <strong>${p.code} — ${p.nameJp}</strong>
              <span>${p.subtitleJp} · ${p.descriptionJp}</span>
            </button>
          `
          ).join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>不正ゼロ証明（SHA-256事前コミット）</span><span>公平性検証</span></div>
        <div class="seal-card">
          <div><strong>次局 (R${seal?.round ?? 1}) 封印ハッシュ：</strong></div>
          <div>${seal?.hashHex ?? '初期化中…'}</div>
          ${
            t
              ? `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1)">
              <span class="badge-ok">${t.seal.verified ? '✓ 前局ハッシュ検証一致 (VERIFIED)' : '✗ 検証失敗'}</span><br/>
              R${t.round} 開示: JNV=${MOVE_META[t.chosenNpcMove].jp} / Salt=${t.seal.salt}
            </div>
          `
              : `<div style="margin-top:4px;opacity:0.75">※ JNV1.0はあなたが手を選ぶ前に次局の手を確定し、SHA-256で封印しています。</div>`
          }
        </div>
      </section>

      ${
        t
          ? `
      <section class="panel-section">
        <div class="section-title"><span>前局 R${t.round} 読心ポストモーテム</span><span>${t.activeExpertCount}専門家</span></div>
        <p class="section-note" style="color:var(--washi-primary)">${t.insightJp}</p>
        <div class="prob-bars">
          ${([ROCK, SCISSORS, PAPER] as const)
            .map((m) => {
              const pct = Math.round(t.predictedPlayerDist[m] * 100);
              const isActual = t.actualPlayerMove === m;
              return `
              <div class="prob-row">
                <span>予測:${MOVE_META[m].jp}${isActual ? '★' : ''}</span>
                <div class="prob-track"><div class="prob-fill ${isActual ? 'secondary' : ''}" style="width:${pct}%"></div></div>
                <span class="prob-val">${pct}%</span>
              </div>
            `;
            })
            .join('')}
        </div>
        <div class="telemetry-grid">
          <div class="metric-box"><div class="k">ナッシュ均衡混合 β</div><div class="v">${Math.round(t.nashBlendBeta * 100)}%</div></div>
          <div class="metric-box"><div class="k">ボラティリティ指数</div><div class="v ${t.driftDetected ? 'warn' : ''}">${(t.volatilityIndex * 100).toFixed(0)}%${t.driftDetected ? ' (変化点)' : ''}</div></div>
          <div class="metric-box"><div class="k">CUSUM変化信号</div><div class="v">${t.cusumSignal.toFixed(2)}</div></div>
          <div class="metric-box"><div class="k">自己被搾取警戒</div><div class="v">${Math.round(t.selfExploitability * 100)}%</div></div>
        </div>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>優勢メタ専門家 Top 5 (Fixed-Share Hedge)</span></div>
        <div class="expert-list">
          ${t.topExperts
            .slice(0, 5)
            .map(
              (ex) => `
            <div class="expert-row">
              <div class="expert-row-top">
                <span class="expert-name">${ex.labelJp}</span>
                <span class="expert-w">重み ${(ex.weight * 100).toFixed(1)}%</span>
              </div>
              <div class="expert-meta">
                推奨:${MOVE_META[ex.recommendedNpcMove].jp} · 割引点:${ex.discountedScore.toFixed(2)} · 勝率:${Math.round(ex.hitRate * 100)}% · ${ex.detail}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </section>

      <section class="panel-section">
        <div class="section-title"><span>あなたの行動プロファイル (${t.profile.sampleCount}手)</span></div>
        <p class="section-note" style="color:var(--washi-primary)">${t.profile.dominantHabitJp}</p>
        <div class="telemetry-grid">
          <div class="metric-box"><div class="k">ランダム性 (Entropy)</div><div class="v">${Math.round(t.profile.playerEntropy * 100)}%</div></div>
          <div class="metric-box"><div class="k">平均思考テンポ</div><div class="v">${(t.profile.avgLatencyMs / 1000).toFixed(2)}s</div></div>
          <div class="metric-box"><div class="k">勝利後・継続率</div><div class="v">${Math.round(t.profile.winStayRate * 100)}%</div></div>
          <div class="metric-box"><div class="k">敗北後・変更率</div><div class="v">${Math.round(t.profile.loseShiftRate * 100)}%</div></div>
        </div>
      </section>
      `
          : `
      <section class="panel-section">
        <div class="section-title"><span>JNV1.0 待機中</span></div>
        <p class="section-note">
          1手勝負するごとに、9種の基本予測器（多階マルコフ・結合マルコフ・回転不変シフト・Wang-Xu-Zhou心理モデル・最長一致スナイパー・連打反動・思考テンポ遅延・対NPCミラー）と3階層メタ読み（計36専門家）のリアルタイム解析がここに可視化されます。
        </p>
      </section>
      `
      }

      <section class="panel-section">
        <div class="section-title"><span>JNV1.0 数学的検証ベンチマーク</span><span>1,600局実測</span></div>
        <p class="section-note">
          8種類の合成対戦AI（偏重・循環・人間心理・模倣・後追い・複合周期・途中戦術切替・完全ランダム）に対して、不正ゼロのSHA-256事前封印モードで各200局をブラウザ内で即時実測します。
        </p>
        <button class="action-btn" id="btn-run-bench" type="button">
          ${this.benchmarkCache ? 'ベンチマークを再実行 (1,600局)' : 'JNV1.0 性能ベンチマークを実行 (1,600局)'}
        </button>
        ${benchHtml}
      </section>
    `;

    this.inspectorBodyEl.querySelectorAll<HTMLButtonElement>('[data-persona]').forEach((b) => {
      b.addEventListener('click', () => {
        this.benchmarkCache = null;
        this.handlers.onChangePersona(b.dataset.persona as JNVPersonaId);
      });
    });

    this.inspectorBodyEl.querySelector('#btn-run-bench')!.addEventListener('click', () => {
      this.benchmarkCache = runJNV1Benchmark(this.currentPersona, 200);
      this.renderInspectorDrawer();
    });
  }
}
