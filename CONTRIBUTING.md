# CONTRIBUTING · 交接指南（面向开发者与 AI 协作者）

欢迎接手「词忆 CET」。本文件是上手的最短路径：**请先读完 `README.md` 和 `DESIGN.md`，再读本文件，然后才动代码。**

## 这是什么

面向大一学生的四六级词汇长期记忆 PWA。核心壁垒是「科学记忆调度」而非界面：
改进版 SM-2 间隔重复 + 主动回忆（测试效应）+ 游戏化习惯养成。
技术栈：React 19 + TypeScript + Vite 7 + Tailwind CSS 3 + Recharts，无后端，数据全在浏览器 localStorage。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 必须通过：tsc -b + vite build
```

## 架构地图（改代码前先定位）

| 你要改什么 | 去哪里 |
|---|---|
| 间隔阶梯、记忆系数、每日新词量、防雪崩阈值、XP 规则 | `src/lib/config.ts`（**唯一参数入口，禁止把参数写散到其他文件**） |
| 调度算法（三档自评 → 下次复习时间） | `src/lib/sm2.ts`（纯函数，保持无副作用） |
| 持久化、当日统计、连胜、徽章触发 | `src/lib/store.ts`（所有写入都走这里，数据含 `user_id` 预留云同步） |
| 词条结构 / 记忆记录结构 | `src/lib/types.ts`（改字段要同步考虑旧数据兼容） |
| 词库加载、四六级去重、搜索 | `src/lib/wordbank.ts` + `public/data/*.json` |
| 词库重新生成 / 扩充 | `python scripts/build-wordbank.py`（源数据在 `scripts/source/`） |
| 页面 | `src/pages/`（Home / Learn / Review / Listen / Stats / Achievements / Library / Settings） |
| 主题色、动效、字体 | `src/index.css` 的 CSS 变量（浅色/深色双套） |

## 硬性设计约束（不可破坏）

1. **主动回忆协议**：复习必须「先作答 → 后核对 → 再三档自评」，严禁出现不看答案直接翻页的模式。任何新题型都要遵守这个顺序。
2. **到期复习永远优先于新词**；到期量超过 `daily_new × avalanche_ratio` 时自动暂停新词。
3. **三档自评按钮固定在移动端底部拇指热区**（`GradeButtons` 组件），一屏一词。
4. **动效 < 300ms**，禁止滚动触发动画、无限 loading、无意义悬停放大。
5. **配色克制**：单一低饱和主色（绿）+ 中性灰阶，颜色只允许来自 `index.css` 的 CSS 变量，禁止在组件里写死色值。
6. **中英文排版**：中文系统字体栈，英文展示用 `.font-word`（衬线）；中文不斜体。
7. **数据结构预留 `user_id`**，为将来的云同步留口；本地存储 key 为 `cetyi.v1`，改结构时必须写迁移逻辑或版本号。

## 词库规范

- 分片 JSON 在 `public/data/`，每片 ≤600 词，登记进 `index.json`。
- 词条字段：`id`（= 小写拼写，跨词书去重键）、`word`、`uk`/`us`（音标）、`pos`、`tier`（0 真题高频 / 1 核心 / 2 大纲）、`meanings[]`，可选 `example{en,zh}`、`mnemonic`、`collocations[]`、`derivatives[]`、`confusables[]`。
- 四六级重叠词**不要删**：同一个词在两本书的分片里都存在，加载时按 `id` 合并并共享学习进度。
- 手写精编词条（`cet4-0/1.json`、`cet6-0.json`）优先于生成词条；扩充词库优先走 `scripts/build-wordbank.py`。
- 数据源：KyleBing/english-vocabulary（词表）、open-dict-data/ipa-dict（音标）、hermitdave/FrequencyWords（词频），均为开源数据，注意保留来源说明。

## 提交前检查清单

- [ ] `npm run build` 通过（含 tsc 严格检查，不允许 `any` 逃逸）
- [ ] 移动端（≤768px）和桌面（≥1024px）各开一遍核心流程：学新词 → 复习答题 → 自评 → 看统计
- [ ] 深色模式切换无瞎眼/隐形文字
- [ ] localStorage 旧数据（老版本 `cetyi.v1`）打开不炸
- [ ] 首屏主包没有明显变大（当前约 92KB gzip；新页面请 `lazy()` 拆分）

## 工作流

- 直接在 `main` 上小步提交可以；大改动请开分支 + PR，PR 描述里写清「动了哪个模块、为什么」。
- Commit message 用中文一句话，例如「复习页新增例句填空题型的干扰项按词性匹配」。
- 改完记忆算法参数（`config.ts`）请在 PR 里说明理由，这类改动影响用户的长期复习节奏。
