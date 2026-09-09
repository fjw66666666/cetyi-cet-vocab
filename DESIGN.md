# 词忆 CET · 产品设计文档

> 面向大一学生的四六级词汇长期记忆 PWA。
> 核心：SM-2 改进版间隔重复 + 主动回忆 + 游戏化习惯养成。

---

## 一、产品信息架构（IA）

```
词忆 CET
├── 首页（Today）
│   ├── 今日待复习 N 词（显著数字，始终优先）
│   ├── 今日进度环（新词 + 复习完成情况）
│   ├── 连胜 Streak 火焰 + 本周打卡热力
│   ├── 入口：开始学习 / 开始复习 / 随身听
│   └── 浏览器通知提醒开关状态
├── 学习页（Learn）——新词学习
│   └── 翻卡式学习卡：单词/音标/发音 → 例句/助记/搭配
├── 复习页（Review）——主动回忆测验
│   ├── 看英选中 / 看中选英
│   ├── 听音辨义
│   ├── 拼写默写
│   └── 例句填空
│   （题型随机混合；先回忆后核对；三档自评：认识/模糊/忘记）
├── 随身听（Listen）
│   └── 顺序播放今日单词发音 + 释义（通勤/睡前）
├── 统计页（Stats）
│   ├── 今日学习：新词数/复习数/正确率/用时
│   ├── 记忆状态分布：未学/学习中/已掌握/待复习
│   ├── 个人遗忘曲线与记忆持久度
│   └── 周/月学习报表
├── 成就页（Achievements）
│   ├── XP 与等级
│   ├── 打卡日历热力图
│   ├── 成就徽章墙
│   └── 词汇量成长曲线（2 分钟词汇量小测入口）
├── 词库页（Library）
│   ├── CET-4 / CET-6 词书切换（重叠词去重、进度继承）
│   ├── 单词搜索
│   ├── 生词本 / 错词本 / 斩词（熟词标记）
│   └── 高频优先排序（真题高频 → 核心 → 大纲）
└── 设置页（Settings）
    ├── 每日新词量（10–50，默认 20）
    ├── 发音偏好（英音/美音）
    ├── 深色模式
    ├── 浏览器通知提醒
    └── 数据导出 / 重置
```

## 二、核心页面清单

| 页面 | 路由 | 职责 |
|---|---|---|
| 首页 | `/` | 今日任务总览、进度环、Streak、快速入口 |
| 学习页 | `/learn` | 新词翻卡学习，一屏一词，底部拇指热区三档按钮 |
| 复习页 | `/review` | 主动回忆测验，题型随机混合，错题当次会话末尾重测 |
| 随身听 | `/listen` | 顺序播放今日单词发音+释义 |
| 统计页 | `/stats` | 学习数据、记忆分布、遗忘曲线、周/月报表 |
| 成就页 | `/achievements` | XP/等级、徽章、打卡热力图、词汇量曲线 |
| 词库页 | `/library` | 词书切换、搜索、生词/错词/斩词管理 |
| 设置页 | `/settings` | 偏好与数据管理 |

## 三、SM-2 改进版调度算法

### 数据结构（每词一条记忆记录）

```ts
interface MemoryRecord {
  user_id: string;          // 预留云端同步
  word_id: string;
  book: 'CET4' | 'CET6';
  ef: number;               // 记忆强度系数 easiness factor，初始 2.5，下限 1.3
  reps: number;             // 连续「认识」次数
  lapses: number;           // 「忘记」次数
  interval_min: number;     // 当前间隔（分钟）
  next_review_at: number;   // 下次复习时间戳
  last_grade: 0 | 1 | 2;    // 0=忘记 1=模糊 2=认识
  status: 'new' | 'learning' | 'review' | 'mastered';
  wrong_count: number;      // 错词本依据
  starred: boolean;         // 生词本
  slain: boolean;           // 斩词（熟词，不再调度）
}
```

### 间隔阶梯（配置项）

```ts
const SRS_CONFIG = {
  steps_min: [10, 1440, 4320, 10080, 21600, 43200], // 10分钟→1天→3天→7天→15天→30天
  ef_init: 2.5, ef_min: 1.3,
  bonus_good: 0.1,        // 「认识」ef 奖励
  penalty_hard: 0.15,     // 「模糊」ef 惩罚
  penalty_again: 0.3,     // 「忘记」ef 惩罚
  hard_step_back: 1,      // 「模糊」间隔回退档数
  relearn_steps_min: [10],// 「忘记」重学阶梯
  master_interval_min: 43200, // 间隔 ≥30 天视为已掌握
  daily_new_default: 20, daily_new_min: 10, daily_new_max: 50,
  avalanche_ratio: 3,     // 到期复习 > 新词×3 时暂停新词
};
```

### 调度伪代码

```
function schedule(record, grade, now):
  # grade: 0=忘记, 1=模糊, 2=认识
  if grade == AGAIN:                        # 忘记
      record.ef      = max(EF_MIN, record.ef - PENALTY_AGAIN)
      record.reps    = 0
      record.lapses += 1
      record.interval_min = RELEARN_STEPS[0]          # 10 分钟后重来
      record.status  = 'learning'
      record.next_review_at = now + 10min
      加入当次会话重学队列（session 内立即再次出现）

  else if grade == HARD:                    # 模糊
      record.ef = max(EF_MIN, record.ef - PENALTY_HARD)
      # 间隔缩短一档：找到当前间隔在阶梯中的位置，回退 1 档
      idx = ladder_index(record.interval_min)
      record.interval_min = STEPS[max(0, idx - HARD_STEP_BACK)]
      record.next_review_at = now + record.interval_min
      加入当次会话尾部再测队列（session 内再次出现一次）

  else:                                     # 认识
      record.ef = record.ef + BONUS_GOOD
      if record.reps < len(STEPS):
          base = STEPS[record.reps]         # 走阶梯 10m→1d→3d→7d→15d→30d
      else:
          base = record.interval_min * record.ef   # 阶梯走完后按 ef 递增
      record.interval_min = round(base)
      record.reps += 1
      record.next_review_at = now + record.interval_min
      if record.interval_min >= MASTER_INTERVAL: record.status = 'mastered'
      else: record.status = 'review'

  record.last_grade = grade
  persist(record)

function build_today_queue(now, settings):
  due  = 所有 next_review_at <= now 且未斩的词   # 到期复习，始终优先
  newQ = []
  if len(due) <= settings.daily_new * AVALANCHE_RATIO:   # 防复习雪崩
      newQ = 从未学词中取 daily_new 个（高频优先：tier 0→1→2）
  return due(按过期程度降序) + newQ

# 新词短期强化：学习后 ~10 分钟、当天结束前各一次快速回顾
function on_learn_new(word, now):
  record.next_review_at = now + 10min       # 10 分钟快速回顾
  当晚 23:00 前若已完成 10 分钟回顾，再排一次「今日结束回顾」
```

### 主动回忆协议（测试效应）

```
复习卡片生命周期：
  1. 只显示提示面（英文单词 / 中文释义 / 音频 / 挖空例句）——答案不可见
  2. 用户作答（选择 / 输入拼写 / 填空）
  3. 系统判定对错 → 展示完整答案与解析
  4. 用户三档自评（认识/模糊/忘记）→ 进入 SM-2 调度
  严禁：未作答直接展示答案的「过一遍」模式
```

## 四、视觉与交互规范

- 主色：低饱和绿 `#3d8f6a`（浅色）/ `#5cb98a`（深色），中性灰阶背景，大留白
- 一屏一词；「认识/模糊/忘记」固定于移动端底部拇指热区（safe-area 适配）
- 微动效 < 300ms：答对轻快打勾、答错温和摇晃；无滚动触发动画
- 深色模式：背景 `#101010`、文字 `#f5f5f5`
- 字体：英文 `"Inter", system-ui`，中文系统字体栈 `"PingFang SC","Microsoft YaHei"`

## 五、技术方案

- React 18 + TypeScript + Vite + Tailwind CSS（移动优先响应式）
- PWA：`manifest.webmanifest` + Service Worker（离线缓存已加载词库分片）
- 存储：localStorage（记忆记录/打卡/设置），词库 JSON 分片按需 fetch；数据结构含 `user_id`
- 发音：Web Speech API（`en-GB` / `en-US` 可切换）
- 词库分片：`/data/cet4-0.json …` 按 tier 分片，首屏仅加载索引
