// 词战长空 · 纯逻辑引擎（零 React / 零 JSX；仅持有 canvas ctx 用于绘制）
// 状态分离：实体坐标等高频视觉状态存于本类私有字段，绝不进入 React；
// 离散数值（hp/score/combo/wave）仅在判定 / 扣血 / 波次切换时经 onHud 推送。
import { speak } from '@/lib/speech';
import type { WordEntry } from '@/lib/types';
import {
  ALL_TYPES,
  CARD,
  CANVAS_FONT_WORD,
  DEFENSE_Y_RATIO,
  DIFFICULTY,
  FIELD_H,
  FIELD_W,
  MOVE_SPEED,
  SHIP_Y_RATIO,
} from './constants';
import { buildQuestion } from './distractors';
import { pickQuestionEntry } from './wordPool';
import { isInWrongBook, recordCorrect, recordWrong } from './wrongbook';
import type {
  Enemy,
  EngineOptions,
  GameInput,
  GameState,
  HudSnapshot,
  InputResult,
  Particle,
  Question,
  SessionSummary,
  Ship,
  ThemeColors,
  Verdict,
  WaveQuizType,
  WrongBook,
  WrongWordEntry,
} from './types';

/** 深空暗色兜底主题（SkyWords 挂载后会立即用真实取色覆盖） */
const FALLBACK_COLORS: ThemeColors = {
  background: 'hsl(225 44% 7%)',
  card: 'hsl(223 34% 10%)',
  primary: 'hsl(198.6 93.2% 59.8%)',
  destructive: 'hsl(6 55% 55%)',
  foreground: 'hsl(213 30% 95%)',
  muted: 'hsl(215 18% 70%)',
  border: 'hsl(220 26% 18%)',
  gradA: 'hsl(198.6 93.2% 59.8%)',
  gradB: 'hsl(258.3 89.7% 66.3%)',
  gradC: 'hsl(172.5 66.1% 50.4%)',
};

/** 视觉常量 */
const SPAWN_Y = 44;
const BURST_SECONDS = 0.35;
const STAR_COUNT = 70;

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 敌机气泡上展示的文本（listen 只显示 🔊） */
function enemyText(q: Question): string {
  if (q.quizType === 'listen') return '🔊';
  if (q.quizType === 'zh2en') return q.entry.meanings[0] ?? q.entry.word;
  return q.entry.word;
}

export class Engine {
  // ---- 渲染句柄 ----
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private colors: ThemeColors;

  // ---- 配置 ----
  private callbacks: EngineOptions['callbacks'];
  private pool: WordEntry[];
  private distractorPool: WordEntry[];
  private map: Map<string, WordEntry>;
  private mode: EngineOptions['mode'];
  private quizMode: EngineOptions['quizMode'];
  private voice: 'en-GB' | 'en-US';
  private reduceMotion: boolean;
  private soundOn: boolean;

  // ---- 运行时状态 ----
  private state: GameState = 'ready';
  private clockMs = 0;
  private lastTs = 0;
  private rafId = 0;
  private running = false;
  private disposed = false;

  // ---- 数值状态 ----
  private hp: number = DIFFICULTY.hpStart;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private wave = 1;
  private waveRemaining = 0;
  private total = 0;
  private killed = 0;

  // ---- 实体 ----
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private ship: Ship;
  private enemySeq = 0;
  private stars: Star[] = [];

  // ---- 出题会话 ----
  private seenIds = new Set<string>();
  private lastCorrectIndexByWord = new Map<string, number>();
  private lastCorrectIndex: number | undefined = undefined;
  private lastQuizType: WaveQuizType | undefined = undefined;

  // ---- 计时 ----
  private questionElapsedMs = 0;
  private timeLimitMs = DIFFICULTY.timeStart * 1000;
  private timeRatio = 1;

  // ---- 强化卡 ----
  private cardElapsedMs = 0;
  private cardDurationMs = 0;
  private cardExtended = false;
  private lastVerdict: Verdict = 'correct';
  private lastQuestion: Question | null = null;

  // ---- HUD 节流 ----
  private lastHudPushMs = 0;
  private lastTimeRatio = 1;
  private lastUrgent = false;

  // ---- 错词本 ----
  private wrongbook: WrongBook;
  private sessionWrongIds = new Set<string>();

  // ---- 画布尺寸 ----
  private scale = 1;
  private offX = 0;
  private offY = 0;

  private readonly rand: () => number = () => Math.random();

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context 不可用');
    this.ctx = ctx;

    this.colors = FALLBACK_COLORS;
    this.callbacks = opts.callbacks;
    this.map = collectMap(opts);
    this.mode = opts.mode;
    this.quizMode = opts.quizMode;
    this.voice = opts.voice;
    this.reduceMotion = opts.reduceMotion;
    this.soundOn = opts.soundOn;

    // 普通模式：题目与干扰项都来自 pool；
    // 专攻错词：题目来自 wrongPool，干扰项从全量 pool 补齐（PRD §4 特例）。
    this.pool = this.mode === 'wrongbook' && opts.wrongPool && opts.wrongPool.length > 0
      ? opts.wrongPool
      : opts.pool;
    this.distractorPool = opts.pool;

    this.wrongbook = { ...opts.wrongbook };

    this.ship = { x: FIELD_W / 2, targetX: FIELD_W / 2 };
    this.waveRemaining = this.enemiesPerWave(this.wave);

    // 星空（只读 clockMs 驱动闪烁，零 getComputedStyle）
    const r = this.rand;
    for (let i = 0; i < STAR_COUNT; i += 1) {
      this.stars.push({
        x: r() * FIELD_W,
        y: r() * FIELD_H,
        r: 0.5 + r() * 1.6,
        tw: r() * Math.PI * 2,
      });
    }
  }

  // ---------------- 公有 API ----------------

  /** 开始游戏（ready → playing） */
  start(): void {
    if (this.disposed || this.state === 'over') return;
    if (this.state === 'playing') return;
    this.state = 'playing';
    this.lastTs = 0;
    this.running = true;
    if (this.rafId === 0) this.rafId = requestAnimationFrame(this.loop);
    this.spawnNext();
    this.callbacks.onEvent({ type: 'state', state: 'playing' });
    this.pushHud(true);
  }

  /** 暂停（仅 playing 生效） */
  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.callbacks.onEvent({ type: 'state', state: 'paused' });
    this.pushHud(true);
  }

  /** 恢复（仅 paused 生效）；不补扣时间 */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.lastTs = 0; // 下一帧 dt 从 0 起算，避免瞬时大 dt
    this.callbacks.onEvent({ type: 'state', state: 'playing' });
    this.pushHud(true);
  }

  /** 提交作答（DOM 弹药按钮直接调用） */
  submitAnswer(index: number): void {
    if (this.state !== 'playing') return;
    const enemy = this.enemies[0];
    if (!enemy || enemy.state !== 'falling') return;
    const verdict: Verdict = index === enemy.question.correctIndex ? 'correct' : 'wrong';
    this.judge(verdict);
  }

  /** 统一输入入口（四路输入归一，按状态分派） */
  dispatch(input: GameInput): InputResult {
    switch (input.kind) {
      case 'move':
        if (this.state === 'playing' || this.state === 'card') {
          this.ship.targetX = clamp(input.x, 20, FIELD_W - 20);
        }
        return { consumed: false };
      case 'move-by':
        if (this.state === 'playing' || this.state === 'card') {
          this.ship.targetX = clamp(this.ship.targetX + input.dx, 20, FIELD_W - 20);
          return { consumed: true };
        }
        return { consumed: false };
      case 'answer':
        if (this.state === 'playing') {
          this.submitAnswer(input.index);
          return { consumed: true };
        }
        if (this.state === 'card') {
          this.closeCard(); // 先关卡片，丢弃本次输入
          return { consumed: true };
        }
        return { consumed: false };
      case 'pause':
        if (this.state === 'playing') {
          this.pause();
          return { consumed: true };
        }
        return { consumed: false };
      case 'resume':
        if (this.state === 'paused') {
          this.resume();
          return { consumed: true };
        }
        return { consumed: false };
      case 'replay': {
        const q = this.enemies[0]?.question;
        if ((this.state === 'playing' || this.state === 'card') && q && q.quizType === 'listen') {
          this.speakWord(q);
          return { consumed: true };
        }
        return { consumed: false };
      }
      case 'extend':
        if (this.state === 'card') {
          this.cardExtended = true;
          return { consumed: true };
        }
        return { consumed: false };
      case 'continue':
        if (this.state === 'card') {
          this.cardExtended = false;
          this.closeCard();
          return { consumed: true };
        }
        return { consumed: false };
      default:
        return { consumed: false };
    }
  }

  /** 更新配色（主题切换时由 React 层调用，非每帧） */
  setColors(colors: ThemeColors): void {
    this.colors = colors;
  }

  /** 同步画布尺寸（CSS 像素）+ DPR 处理 */
  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.scale = Math.min(w / FIELD_W, h / FIELD_H);
    this.offX = (w - FIELD_W * this.scale) / 2;
    this.offY = (h - FIELD_H * this.scale) / 2;
  }

  /** 释放：取消 rAF、清空实体（清理清单 §4.8 第 1、10 项） */
  dispose(): void {
    this.disposed = true;
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.enemies.length = 0;
    this.particles.length = 0;
    this.stars.length = 0;
  }

  /** 当前错词本快照（React 层用于持久化） */
  getWrongBook(): WrongBook {
    return this.wrongbook;
  }

  /** 客户端 X 坐标 → 逻辑坐标（供鼠标/触摸输入换算） */
  toFieldX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return FIELD_W / 2;
    const deviceX = (clientX - rect.left) * (this.canvas.width / rect.width);
    return (deviceX - this.offX) / this.scale;
  }

  // ---------------- 私有：主循环 ----------------

  private loop = (ts: number): void => {
    if (this.disposed) return;
    if (this.lastTs === 0) this.lastTs = ts;
    const raw = ts - this.lastTs;
    this.lastTs = ts;
    const dt = Math.min(100, Math.max(0, raw)); // 单帧上限 100ms，防切回前台瞬移
    this.tick(dt);
    this.draw();
    this.pushHud(false);
    if (this.running) this.rafId = requestAnimationFrame(this.loop);
  };

  private tick(dtMs: number): void {
    if (this.state === 'playing') {
      this.clockMs += dtMs;
      const dtSec = dtMs / 1000;

      this.questionElapsedMs += dtMs;
      this.timeRatio = this.timeLimitMs > 0 ? clamp(1 - this.questionElapsedMs / this.timeLimitMs, 0, 1) : 0;

      for (const e of this.enemies) {
        if (e.state === 'falling') {
          e.y += e.vy * dtSec;
        } else {
          e.fx = Math.min(1, e.fx + dtSec / BURST_SECONDS);
        }
      }

      // 战机插值跟随
      const delta = this.ship.targetX - this.ship.x;
      this.ship.x += delta * Math.min(1, MOVE_SPEED * dtSec);

      this.stepParticles(dtSec);

      // 超时判定：抵达防线 或 作答窗口耗尽
      const enemy = this.enemies[0];
      if (enemy && enemy.state === 'falling') {
        const defenseY = FIELD_H * DEFENSE_Y_RATIO;
        if (enemy.y >= defenseY || this.questionElapsedMs >= this.timeLimitMs) {
          this.judge('timeout');
        }
      }

      // 爆炸动画结束 → 移除并衔接下一架/下一波
      const head = this.enemies[0];
      if (head && head.state === 'bursting' && head.fx >= 1) {
        this.enemies.shift();
        if (this.state === 'playing') this.spawnNext();
      }
    } else if (this.state === 'card') {
      if (!this.cardExtended) {
        this.clockMs += dtMs;
        this.cardElapsedMs += dtMs;
        if (this.cardElapsedMs >= this.cardDurationMs) this.closeCard();
      }
    }
  }

  // ---------------- 私有：出题 / 波次 ----------------

  private enemiesPerWave(wave: number): number {
    return Math.min(
      DIFFICULTY.enemiesMax,
      DIFFICULTY.enemiesBase + Math.floor(wave / DIFFICULTY.enemiesStepEvery),
    );
  }

  private timeLimitForWave(wave: number): number {
    return Math.max(DIFFICULTY.timeMin, DIFFICULTY.timeStart - DIFFICULTY.timeStep * (wave - 1));
  }

  /** 决定本题题型（混合模式轮换，尽量避免连续同型） */
  private pickQuizType(): WaveQuizType {
    if (this.quizMode !== 'mix') return this.quizMode;
    const pool = ALL_TYPES.filter((t) => t !== this.lastQuizType);
    const source = pool.length > 0 ? pool : ALL_TYPES;
    const t = source[Math.floor(this.rand() * source.length)];
    this.lastQuizType = t;
    return t;
  }

  private spawnEnemy(question: Question): void {
    const text = enemyText(question);
    const size = clamp(34, 46, 34 + Math.min(10, text.length) * 1.2);
    const x = clamp(FIELD_W / 2 + (this.rand() - 0.5) * FIELD_W * 0.4, size + 6, FIELD_W - size - 6);
    const speed = Math.min(
      DIFFICULTY.speedMax,
      DIFFICULTY.speedStart + DIFFICULTY.speedStep * (this.wave - 1),
    );
    this.enemySeq += 1;
    const enemy: Enemy = {
      id: this.enemySeq,
      question,
      x,
      y: SPAWN_Y,
      vy: speed, // px/s（PRD §7「时间压力主来源」）
      size,
      state: 'falling',
      fx: 0,
    };
    this.enemies.push(enemy);
    this.questionElapsedMs = 0;
    this.timeLimitMs = this.timeLimitForWave(this.wave) * 1000;
    this.timeRatio = 1;
    this.callbacks.onEvent({ type: 'question', question, index: this.total });
    if (question.quizType === 'listen') this.speakWord(question); // 题面自动播一次
    this.pushHud(true);
  }

  private spawnNext(): void {
    if (this.disposed || this.state === 'over') return;
    if (this.enemies.length > 0) return;

    if (this.waveRemaining <= 0) {
      this.wave += 1;
      this.waveRemaining = this.enemiesPerWave(this.wave);
      this.callbacks.onEvent({ type: 'wave', wave: this.wave });
      this.pushHud(true);
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const target = pickQuestionEntry(this.pool, this.wave, this.seenIds, this.rand);
      if (!target) break;
      const quizType = this.pickQuizType();
      const lastIdx = this.lastCorrectIndexByWord.get(target.id) ?? this.lastCorrectIndex;
      const question = buildQuestion(
        target,
        this.distractorPool,
        this.map,
        quizType,
        lastIdx,
        this.rand,
      );
      if (!question) continue; // 干扰项不足 → 换词重选

      this.lastCorrectIndexByWord.set(target.id, question.correctIndex);
      this.lastCorrectIndex = question.correctIndex;
      this.waveRemaining -= 1;
      this.spawnEnemy(question);
      return;
    }

    // 极端兜底：无法组出任何题
    this.callbacks.onEvent({ type: 'warn', message: '词池不足，无法继续组题' });
    this.gameOver();
  }

  // ---------------- 私有：判定 / 扣血 / 卡片 ----------------

  /** 扣血公式（PRD §8）：clamp(round(1 + 2·fs/100), 1, 3)，JS half-up。fs 缺失/非法 → 2 */
  private applyDamage(fs: number | undefined): number {
    if (typeof fs !== 'number' || !Number.isFinite(fs)) return 2;
    return Math.min(3, Math.max(1, Math.round(1 + 2 * (fs / 100))));
  }

  private judge(verdict: Verdict): void {
    const enemy = this.enemies[0];
    if (!enemy || this.state !== 'playing') return;
    const q = enemy.question;
    let damage = 0;

    if (verdict === 'correct') {
      const mult = Math.min(DIFFICULTY.comboMax, 1 + DIFFICULTY.comboStep * this.combo);
      this.score += Math.round(DIFFICULTY.scoreBase * mult);
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.killed += 1;
      enemy.state = 'bursting';
      enemy.fx = 0;
      this.spawnBurst(enemy.x, enemy.y, this.colors.gradA);
      // 若该词在游戏错词本中，累计连对（连对 2 次移出）
      if (isInWrongBook(this.wrongbook, q.wordId)) {
        this.wrongbook = recordCorrect(this.wrongbook, q.wordId);
      }
    } else {
      damage = this.applyDamage(q.entry.fs);
      this.hp = Math.max(0, this.hp - damage);
      this.combo = 0;
      // 敌机突进至防线并闪光
      enemy.y = FIELD_H * DEFENSE_Y_RATIO;
      enemy.state = 'bursting';
      enemy.fx = 0;
      this.spawnBurst(enemy.x, enemy.y, this.colors.destructive);
      this.wrongbook = recordWrong(this.wrongbook, q.wordId, q.entry.word, Date.now());
      this.sessionWrongIds.add(q.wordId);
    }

    this.total += 1;
    this.seenIds.add(q.wordId);
    this.questionElapsedMs = this.timeLimitMs; // 冻结时间环

    this.lastQuestion = q;
    this.callbacks.onEvent({
      type: 'verdict',
      verdict,
      question: q,
      damage,
      correctIndex: q.correctIndex,
    });
    this.pushHud(true);
    this.openCard(verdict);
  }

  private openCard(verdict: Verdict): void {
    this.state = 'card';
    this.lastVerdict = verdict;
    this.cardElapsedMs = 0;
    this.cardExtended = false;
    this.cardDurationMs = (verdict === 'correct' ? CARD.correctSec : CARD.wrongSec) * 1000;
    this.callbacks.onEvent({ type: 'state', state: 'card' });
  }

  private closeCard(): void {
    if (this.state !== 'card') return;
    this.state = 'playing';
    const q = this.lastQuestion;
    this.callbacks.onEvent({ type: 'card-closed', verdict: this.lastVerdict, question: q as Question });
    if (this.hp <= 0) this.gameOver();
  }

  private gameOver(): void {
    if (this.state === 'over') return;
    this.state = 'over';
    const summary = this.buildSummary();
    this.callbacks.onEvent({ type: 'gameover', summary });
    this.callbacks.onEvent({ type: 'state', state: 'over' });
    this.pushHud(true);
  }

  private buildSummary(): SessionSummary {
    const newWrongEntries: WrongWordEntry[] = [];
    for (const id of this.sessionWrongIds) {
      const e = this.wrongbook[id];
      if (e) newWrongEntries.push(e);
    }
    newWrongEntries.sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt);
    const accuracy = this.total > 0 ? this.killed / this.total : 0;
    return {
      score: this.score,
      maxCombo: this.maxCombo,
      killed: this.killed,
      total: this.total,
      uniqueWords: this.seenIds.size,
      accuracy,
      newWrongEntries,
    };
  }

  // ---------------- 私有：HUD 推送（10Hz 节流 + 变化阈值） ----------------

  private pushHud(force: boolean): void {
    const snap: HudSnapshot = {
      hp: this.hp,
      wave: this.wave,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      timeRatio: this.timeRatio,
      urgent: this.timeRatio <= 0.25,
    };
    if (force) {
      this.callbacks.onHud(snap);
      this.lastHudPushMs = this.clockMs;
      this.lastTimeRatio = snap.timeRatio;
      this.lastUrgent = snap.urgent;
      return;
    }
    const changed = Math.abs(snap.timeRatio - this.lastTimeRatio) > 0.005;
    if (changed && this.clockMs - this.lastHudPushMs >= 100) {
      this.callbacks.onHud(snap);
      this.lastHudPushMs = this.clockMs;
      this.lastTimeRatio = snap.timeRatio;
    }
    // 危急态跨越边界时强制推一次（避免按钮/文字状态滞后）
    if (snap.urgent !== this.lastUrgent) {
      this.lastUrgent = snap.urgent;
      this.callbacks.onHud(snap);
    }
  }

  // ---------------- 私有：发音 / 粒子 ----------------

  private speakWord(question: Question): void {
    if (!this.soundOn) return;
    speak(question.entry.word, this.voice);
  }

  private spawnBurst(x: number, y: number, color: string): void {
    if (this.reduceMotion) return; // 减少动效：跳过粒子
    const n = 18;
    for (let i = 0; i < n; i += 1) {
      const ang = this.rand() * Math.PI * 2;
      const spd = 60 + this.rand() * 170;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        maxLife: 0.45 + this.rand() * 0.4,
        color,
        size: 1 + this.rand() * 2.4,
        kind: 'spark',
      });
    }
    // 冲击环
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 0.35,
      color,
      size: 10,
      kind: 'ring',
    });
  }

  private stepParticles(dtSec: number): void {
    if (this.particles.length === 0) return;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dtSec / p.maxLife;
      if (p.life <= 0) continue;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= 0.96;
      p.vy *= 0.96;
      next.push(p);
    }
    this.particles = next;
  }

  // ---------------- 私有：绘制（零 getComputedStyle） ----------------

  private draw(): void {
    const ctx = this.ctx;
    const c = this.colors;

    // 背景（全画布）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = c.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 逻辑坐标系
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);

    this.drawStars(ctx);
    this.drawDefenseLine(ctx, c);

    const enemy = this.enemies[0];
    if (enemy) this.drawEnemy(ctx, c, enemy);

    this.drawShip(ctx, c);
    this.drawParticles(ctx);
  }

  private drawStars(ctx: CanvasRenderingContext2D): void {
    const t = this.clockMs / 1000;
    ctx.save();
    for (const s of this.stars) {
      const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.tw));
      const color = s.r > 1.4 ? this.colors.gradA : s.r > 1.0 ? this.colors.gradC : this.colors.gradB;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawDefenseLine(ctx: CanvasRenderingContext2D, c: ThemeColors): void {
    const y = FIELD_H * DEFENSE_Y_RATIO;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = c.destructive;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
    ctx.stroke();
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, c: ThemeColors, enemy: Enemy): void {
    const urgent = this.timeRatio <= 0.25;
    const strokeColor = urgent ? c.destructive : c.primary;
    const grow = 1 + enemy.fx * 0.4;
    const radius = enemy.size * grow;
    const alpha = enemy.state === 'bursting' ? Math.max(0, 1 - enemy.fx) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 气泡
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = c.card;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    // 倒计时环（仅下落中）
    if (enemy.state === 'falling') {
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.timeRatio);
      ctx.lineWidth = 3;
      ctx.strokeStyle = urgent ? c.destructive : c.primary;
      ctx.stroke();
    }

    // 文本
    const text = enemyText(enemy.question);
    const fontSize = text.length > 9 ? 16 : text.length > 6 ? 19 : 22;
    ctx.fillStyle = c.foreground;
    ctx.font = `${fontSize}px ${CANVAS_FONT_WORD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, enemy.x, enemy.y);
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D, c: ThemeColors): void {
    const y = FIELD_H * SHIP_Y_RATIO;
    ctx.save();
    ctx.translate(this.ship.x, y);
    ctx.shadowColor = c.primary;
    ctx.shadowBlur = 16;
    ctx.fillStyle = c.primary;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(15, 14);
    ctx.lineTo(0, 6);
    ctx.lineTo(-15, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - p.life) * 34, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** 从 EngineOptions 收集词库 Map（用于 confusables 回查）；由 opts 传入的 pool 重建 */
function collectMap(opts: EngineOptions): Map<string, WordEntry> {
  const m = new Map<string, WordEntry>();
  for (const w of opts.pool) m.set(w.id, w);
  if (opts.wrongPool) for (const w of opts.wrongPool) m.set(w.id, w);
  return m;
}
