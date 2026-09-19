// 词战长空 · 游戏域类型定义（纯类型，零运行时）
// 全部符合 erasableSyntaxOnly（无 enum / 无参数属性 / 无 namespace）、
// verbatimModuleSyntax（类型导入用 import type）、strict、noUnusedLocals。
import type { WordEntry } from '@/lib/types';

// ---------------- 状态与模式（联合字面量，替代 enum） ----------------

/** 游戏状态机状态 */
export type GameState = 'ready' | 'playing' | 'paused' | 'card' | 'over';

/** 题型模式（含混合） */
export type QuizMode = 'en2zh' | 'zh2en' | 'listen' | 'mix';
/** 单波实际题型（混合模式下每波确定一个，不含 'mix' 本身） */
export type WaveQuizType = Exclude<QuizMode, 'mix'>;

/** 局内玩法模式：普通 / 专攻错词 */
export type PlayMode = 'normal' | 'wrongbook';

/** 判定结果：答对 / 答错 / 超时 */
export type Verdict = 'correct' | 'wrong' | 'timeout';

// ---------------- 选项与出题 ----------------

/** 干扰项来源分级（用于埋点与 warn 日志） */
export type DistractorSource = 'confusable' | 'same-tier-pos' | 'same-tier' | 'any-tier' | 'partial';

export interface GameOption {
  /** 选项唯一键：en2zh 用候选词 id；zh2en/listen 用候选词 id */
  key: string;
  /** 展示文案（en2zh = 中文释义；zh2en/listen = 英文单词） */
  text: string;
  /** 是否为正确项 */
  correct: boolean;
}

/** 一道题（= 一架敌机） */
export interface Question {
  /** 目标词 id（小写拼写） */
  wordId: string;
  /** 目标词完整条目（强化卡直接用，避免二次查表） */
  entry: WordEntry;
  /** 本题题型 */
  quizType: WaveQuizType;
  /** 4 个选项（已 shuffle，可能少于 4 个但 ≥2） */
  options: GameOption[];
  /** 正确项在 options 中的索引 */
  correctIndex: number;
  /** 干扰项实际达标来源（埋点用） */
  source: DistractorSource;
}

// ---------------- 引擎实体 ----------------

/** 敌机（承载一道题） */
export interface Enemy {
  id: number;
  question: Question;
  /** 逻辑坐标（0..FIELD_W） */
  x: number;
  /** 逻辑坐标（0..FIELD_H），自上而下增长 */
  y: number;
  /** px/s */
  vy: number;
  /** 半径 */
  size: number;
  state: 'falling' | 'hit' | 'bursting';
  /** 命中/爆炸进度 0..1（用于缩放消散动画） */
  fx: number;
}

/** 粒子（纯视觉） */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 剩余生命 0..1 */
  life: number;
  maxLife: number;
  /** 已解析的真实色值 */
  color: string;
  size: number;
  kind: 'spark' | 'debris' | 'ring';
}

/** 战机 */
export interface Ship {
  x: number;
  /** 鼠标/触摸/方向键的目标位，逐帧插值跟随 */
  targetX: number;
}

// ---------------- HUD 快照（引擎 → React 的唯一数据通道） ----------------

/** HUD 数据快照：仅在离散事件时推送 */
export interface HudSnapshot {
  hp: number;
  wave: number;
  score: number;
  combo: number;
  maxCombo: number;
  /** 当前题剩余时间比例 0..1（倒计时环用，由 rAF 节流推送） */
  timeRatio: number;
  /** 是否处于最后 2s 危急态 */
  urgent: boolean;
}

/** 引擎向 React 抛出的一次性事件（不参与每帧渲染） */
export type GameEvent =
  | { type: 'state'; state: GameState }
  | { type: 'question'; question: Question; index: number }
  | { type: 'verdict'; verdict: Verdict; question: Question; damage: number; correctIndex: number }
  | { type: 'card-closed'; verdict: Verdict; question: Question }
  | { type: 'gameover'; summary: SessionSummary }
  | { type: 'wave'; wave: number }
  | { type: 'warn'; message: string };

/** 本局战果 */
export interface SessionSummary {
  score: number;
  maxCombo: number;
  /** 击落敌机数 = 答对题数 */
  killed: number;
  /** 总题数 */
  total: number;
  /** 本局不同单词数 */
  uniqueWords: number;
  /** 0..1 */
  accuracy: number;
  newWrongEntries: WrongWordEntry[];
}

// ---------------- 错词本 ----------------

export interface WrongWordEntry {
  /** 显示用原形 */
  word: string;
  /** 累计答错/超时次数 */
  wrongCount: number;
  /** 最近答错时间戳（ms，绝对时间） */
  lastWrongAt: number;
  /** 进入错词本后的连续答对次数 */
  correctStreak: number;
}

/** key = wordId（小写拼写） */
export type WrongBook = Record<string, WrongWordEntry>;

// ---------------- 主题色（Canvas 用真实色值） ----------------

export interface ThemeColors {
  background: string;
  card: string;
  primary: string;
  destructive: string;
  foreground: string;
  muted: string;
  border: string;
  gradA: string;
  gradB: string;
  gradC: string;
}

// ---------------- 输入 ----------------

/** 统一输入事件（四路输入归一） */
export type GameInput =
  | { kind: 'move'; x: number } // 鼠标/触摸：绝对目标 X（逻辑坐标）
  | { kind: 'move-by'; dx: number } // 方向键：相对位移（逻辑单位）
  | { kind: 'answer'; index: number } // 数字键 / 点击弹药按钮（0..3）
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'replay' } // 听音辨词 🔊 重播
  | { kind: 'extend' } // 强化卡「记一下」
  | { kind: 'continue' }; // 强化卡「继续」

/** 输入角色：用于决定是否 consume（阻止页面滚动等） */
export interface InputResult {
  /** 事件是否已被游戏消费（true 时应 preventDefault） */
  consumed: boolean;
}

// ---------------- 引擎构造参数 ----------------

export interface EngineCallbacks {
  onHud: (snap: HudSnapshot) => void;
  onEvent: (ev: GameEvent) => void;
}

export interface EngineOptions {
  /** 过滤后的词池（普通模式用全量；专攻错词模式用错词池） */
  pool: WordEntry[];
  /** 错词池（专攻模式） */
  wrongPool?: WordEntry[];
  mode: PlayMode;
  quizMode: QuizMode;
  /** 初始设置 */
  reduceMotion: boolean;
  soundOn: boolean;
  voice: 'en-GB' | 'en-US';
  /** 初始错词本快照（读取一次，写入由 React 层调 wrongbook 完成） */
  wrongbook: WrongBook;
  callbacks: EngineCallbacks;
}
