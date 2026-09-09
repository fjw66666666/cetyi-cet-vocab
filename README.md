# 词忆 CET · 四六级词汇记忆 PWA

面向大一学生的四六级词汇长期记忆工具：SM-2 改进版间隔重复 + 主动回忆测验 + 游戏化激励。
技术栈：React 19 + TypeScript + Vite 7 + Tailwind CSS + Recharts，移动端优先的响应式 PWA。

## 启动说明

```bash
npm install        # 首次安装依赖
npm run dev        # 开发模式（默认 http://localhost:3000）
npm run build      # 生产构建 → dist/
npm run preview    # 本地预览生产构建
```

手机体验：开发模式加 `-- --host` 后，用手机访问电脑局域网 IP 即可；或部署 `dist/` 到任意静态托管后用「添加到主屏幕」安装为 App。

## 目录结构

```
cet-vocab/
├── public/
│   ├── manifest.webmanifest   # PWA 清单
│   ├── sw.js                  # Service Worker（离线缓存外壳+词库分片）
│   ├── icon.svg               # 应用图标
│   └── data/                  # 词库分片（按词书/tier 拆分，按需加载）
│       ├── index.json         # 词库索引（分片清单 + 词数）
│       ├── cet4-0/1.json      # CET-4 精编词（221 词，含助记/搭配/辨析）
│       ├── cet4-2~9.json      # CET-4 自动生成分片（4324 词）
│       ├── cet6-0.json        # CET-6 精编词（120 词）
│       └── cet6-1~7.json      # CET-6 自动生成分片（3878 词）
└── src/
    ├── lib/
    │   ├── config.ts          # ★ 所有 SRS 参数（间隔阶梯/系数/防雪崩）与 XP 规则
    │   ├── types.ts           # 词条 / 记忆记录 / 设置等类型（含 user_id 预留）
    │   ├── sm2.ts             # ★ 改进版 SM-2 调度引擎（纯函数）
    │   ├── store.ts           # localStorage 持久化 + 可订阅状态 + 结算管线
    │   ├── wordbank.ts        # 词库分片加载、四六级去重合并、搜索
    │   ├── gamification.ts    # 徽章、连胜、词汇量小测选题与估算
    │   ├── speech.ts          # Web Speech API 发音（英/美音切换）
    │   └── notify.ts          # 浏览器通知提醒
    ├── hooks/                 # useWords / useTodayQueue / useTheme
    ├── components/ui-bits.tsx # 进度环、三档自评按钮、发音按钮、统计卡
    └── pages/                 # Home / Learn / Review / Listen / Stats / Achievements / Library / Settings
```

## 核心机制

- **SM-2 改进版**：每词维护 ef（记忆强度）、reps、next_review_at；三档自评「认识/模糊/忘记」分别走 阶梯递增 / 降档+当次重测 / 重置+10 分钟重学。参数全部在 `src/lib/config.ts`。
- **主动回忆**：复习必须先作答（选择/拼写/填空），核对后才允许自评；无被动浏览模式。
- **今日任务**：到期复习始终优先；到期量 > 每日新词 × 3 时自动暂停新词（防复习雪崩）。
- **新词短期强化**：新词学习后 10 分钟自动进入复习队列，当天再次出现。
- **游戏化**：XP/等级（每级 100×Lv XP）、连胜火焰、12 周打卡热力图、12 枚成就徽章、2 分钟词汇量小测与成长曲线。
- **隐私与离线**：全部数据存于浏览器 localStorage；Service Worker 缓存词库分片，离线可复习已缓存内容。

## 词库规模与数据源

当前内置 **CET-4 词库 4545 词**（11 个分片）+ **CET-6 词库 3998 词**（8 个分片），四六级重叠词按拼写自动去重并继承学习进度。

- 精编词条 341 个（`cet4-0/1.json`、`cet6-0.json`）：真题高频词含完整音标、真题例句、词根助记、固定搭配、派生与形近辨析
- 其余词条由 `scripts/build-wordbank.py` 自动生成，字段含音标（英/美）、词性、多义项释义
- 分层：tier 0 真题高频（约 200 词，优先学）→ tier 1 核心（词频 ≤3000）→ tier 2 大纲
- 音标覆盖率 93.6%（少数生僻词无开源音标，界面自动降级隐藏音标行）

数据源（均为开源项目，运行时由脚本读取 `../wordbank-src/`）：
- 词表：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) 四六级大纲词表
- 音标：[open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict) 英美 IPA
- 词频：[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) en_50k

重新生成词库：`python scripts/build-wordbank.py`（输出到 `public/data/` 并更新 `index.json`）。
扩充词条只需向 `public/data/` 添加同格式分片并在 `index.json` 登记，无需改动代码。
