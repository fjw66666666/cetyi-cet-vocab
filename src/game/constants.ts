// 词战长空 · 常量表
// 难度曲线逐项对照 PRD §7；分数 / 卡时长 / 存储键 / 输入映射集中于此，便于核验。
import type { QuizMode, WaveQuizType } from './types';

/** 逻辑坐标系（引擎内部用，与 CSS 像素解耦；绘制时按 canvas 尺寸缩放） */
export const FIELD_W = 400;
export const FIELD_H = 700;

/** 难度曲线（PRD §7，逐项对照，禁止自创阈值） */
export const DIFFICULTY = {
  speedStart: 40, // px/s
  speedStep: 4, // +4 px/s / 波
  speedMax: 140, // px/s
  enemiesBase: 3,
  enemiesStepEvery: 2, // 每 2 波 +1
  enemiesMax: 8,
  timeStart: 8.0, // s
  timeStep: 0.25, // −0.25 s / 波
  timeMin: 4.0, // s
  optionsCount: 3, // 干扰项数（始终 4 选项）
  scoreBase: 100,
  comboStep: 0.1,
  comboMax: 3.0, // ×3 封顶
  hpStart: 3,
  hpMax: 5,
} as const;

/** 强化卡停留时长（s） */
export const CARD = {
  correctSec: 0.8,
  wrongSec: 1.2, // 答错 +50%
} as const;

/** 错词本 */
export const WRONGBOOK_KEY = 'cetyi.game.wrongbook.v1';
/** 游戏错词本移出阈值（与站点 WRONG_PASS_STREAK=3 刻意不同，见 ARCH §4.6） */
export const GAME_WRONG_PASS_STREAK = 2;

/** 输入 */
export const MOVE_STEP = 36; // 方向键单次位移（逻辑单位）
export const MOVE_SPEED = 12; // 战机跟随插值速度（逻辑单位/帧系数）
export const DIGIT_KEYS: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 };

/** 题型轮换表（混合模式；避免连续两波同型由引擎动态保证） */
export const ALL_TYPES: WaveQuizType[] = ['en2zh', 'zh2en', 'listen'];

/** 功能词性黑名单（PRD §4.1 主判据） */
export const FUNC_POS = ['art.', 'pron.', 'prep.', 'conj.', 'aux.', 'det.', 'int.', 'num.'] as const;

/** 显式短词黑名单（PRD §4.1，仅 23 个 len≤2 词中的功能词） */
export const SHORT_BLACKLIST = new Set<string>([
  'a', 'ad', 'as', 'at', 'ax', 'be', 'by', 'do', 'go', 'he', 'hi', 'i',
  'if', 'in', 'it', 'me', 'my', 'no', 'of', 'oh', 'on', 'or', 'ox',
]);

/** 词池最小规模（低于此值放弃过滤并 warn，保可玩性优先） */
export const POOL_MIN = 20;

/** 题型 → 默认模式别名，供 UI 展示 */
export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  en2zh: '英→中',
  zh2en: '中→英',
  listen: '听音辨词',
  mix: '混合模式',
};

/** Canvas 字体栈（与 index.css 的 .font-word 保持一致，Canvas 拿不到 CSS 字体） */
export const CANVAS_FONT_WORD = "Georgia, 'Times New Roman', 'Songti SC', SimSun, serif";
export const CANVAS_FONT_UI =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', sans-serif";

/** 防线纵向位置比例（敌机抵达此比例即视为超时） */
export const DEFENSE_Y_RATIO = 0.82;
/** 战机纵向位置比例 */
export const SHIP_Y_RATIO = 0.92;
/** 敌机气泡基础半径与最小/最大（逻辑单位） */
export const ENEMY_RADIUS_MIN = 30;
export const ENEMY_RADIUS_MAX = 46;
