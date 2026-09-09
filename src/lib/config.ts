// 所有间隔重复参数集中在此，便于后续调优
export const SRS_CONFIG = {
  /** 间隔阶梯（分钟）：10分钟 → 1天 → 3天 → 7天 → 15天 → 30天 */
  steps_min: [10, 1440, 4320, 10080, 21600, 43200],
  ef_init: 2.5, // 初始记忆强度系数
  ef_min: 1.3, // 系数下限
  bonus_good: 0.1, // 「认识」ef 奖励
  penalty_hard: 0.15, // 「模糊」ef 惩罚
  penalty_again: 0.3, // 「忘记」ef 惩罚
  hard_step_back: 1, // 「模糊」间隔回退档数
  relearn_min: 10, // 「忘记」后 10 分钟重学
  master_interval_min: 43200, // 间隔 ≥30 天视为已掌握
  daily_new_default: 20,
  daily_new_min: 10,
  daily_new_max: 50,
  avalanche_ratio: 3, // 到期复习 > 每日新词×3 时自动暂停新词
  same_day_review: true, // 新词当天结束前的快速回顾
} as const;

// 游戏化参数
export const XP_RULES = {
  learn: 10, // 学一个新词
  review_good: 6, // 复习「认识」
  review_hard: 4, // 复习「模糊」
  review_again: 2, // 复习「忘记」（鼓励面对）
  quiz_correct: 3, // 测验答对额外
  session_complete: 20, // 完成今日任务
  vocab_test: 15, // 完成词汇量小测
  wrong_pass: 5, // 错词连续答对 3 次通过
} as const;

export const WRONG_PASS_STREAK = 3; // 错词连续答对 3 次视为通过

export function levelFromXp(xp: number): { level: number; cur: number; need: number } {
  // 每级所需 XP = 100 * level（线性增长）
  let level = 1;
  let rest = xp;
  while (rest >= 100 * level) {
    rest -= 100 * level;
    level += 1;
  }
  return { level, cur: rest, need: 100 * level };
}
