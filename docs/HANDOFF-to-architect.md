# 架构阶段交接清单（主理人 → 架构师 高见远）

> 本文件是 PRD 冻结后转交架构师的**决策备忘**，与 `PRD-skywords.md`、`FACTS-wordbank-verified.md` 配套使用。
> 其中多数结论已由主理人对**真实代码与全量词库数据**实测确认，**不必重新论证，直接采用**。

---

## 一、需求与事实基线（三份文件）

| 文件 | 作用 | 权威性 |
|------|------|--------|
| `docs/PRD-skywords.md` | 产品需求（v1.2 冻结版） | 产品需求唯一依据 |
| `docs/FACTS-wordbank-verified.md` | 词库/环境实测档案（14 节） | **技术事实唯一依据**，与 PRD 冲突时以本文件为准 |
| `C:\Users\付\WorkBuddy\2026-09-19-19-33-20\outputs\词战长空-SkyWords-AI提示词.md` | 用户原始需求 | 兜底参考（其技术细节多有出入） |

---

## 二、已拍板的决策（不需重新讨论）

| # | 决策 | 理由 |
|---|------|------|
| D1 | **在本地仓库直接改代码** | 用户明确要求；可真实构建验证 |
| D2 | **高频词（fs 高）答错扣血更重** | 用户确认；高频词是真题必考，答错更"不该" |
| D3 | **移动端导航改 `grid-cols-7`** | 保留全部 6 个功能页，不折叠"成就"；320px 溢出时接受图标缩放/标签截断 |
| D4 | **游戏对 `cetyi.v1` 一律只读，不做 SRS 联动** | `store.grade()` 副作用链会凭空创建记录、污染 `learnedAt`/连胜/徽章/统计，与 P0-19 冲突。**P1-4 已否决** |
| D5 | **`/game` 加入 `immersive` 白名单** | 游戏需全屏空间 |
| D6 | **热度口径用 `isHot()`（S∨A），禁用 S 档单筛** | S 档全库仅 1 词，按 S 筛得空集 |

---

## 三、技术硬约束（违反即返工）

### 3.1 语言与框架

- **`react-router` 导入源是 `react-router`，不是 `react-router-dom`**（v7.18.3 实装）
- TypeScript 严格模式，**禁止 `any`**（缺失字段用可选类型 + 兜底）
- 不引入任何新依赖（已有 `lucide-react` 可作图标）

### 3.1.1 ⚠️ `tsconfig.app.json` 的两条严苛规则（违反即编译失败）

`tsconfig.app.json` 实测开启了比常规项目更严格的选项，**工程师极易踩坑**：

| 选项 | 值 | 强制后果 |
|------|-----|---------|
| `verbatimModuleSyntax` | `true` | **类型导入必须写 `import type { X } from '...'`**，把类型当值导入会报错。禁止 `import { WordEntry }`，必须 `import type { WordEntry }` |
| `erasableSyntaxOnly` | `true` | **禁止一切 TS 专有语法**：`enum`、构造函数参数属性 `constructor(private x: T)`、`namespace`、`declare` 均**不可用** |
| `noUnusedLocals` | `true` | 未使用的局部变量 → **报错**（不是警告） |
| `noUnusedParameters` | `true` | 未使用的函数参数 → **报错**（需用 `_` 前缀规避） |
| `noFallthroughCasesInSwitch` | `true` | `switch` 的 case 穿透 → 报错 |
| `strict` | `true` | 严格空值检查等全套 |

**对游戏引擎设计的直接影响（架构需注意）**：

- ❌ **不能用 `enum` 表示游戏状态/题型** → 改用联合字面量类型：
  ```ts
  // 错误（erasableSyntaxOnly 会报错）
  enum GameState { Ready, Playing, Paused }
  // 正确
  type GameState = 'ready' | 'playing' | 'paused';
  ```
- ❌ **不能用在构造函数里声明参数属性** → 显式写字段：
  ```ts
  // 错误
  class Engine { constructor(private canvas: HTMLCanvasElement) {} }
  // 正确
  class Engine {
    private canvas: HTMLCanvasElement;
    constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
  }
  ```
- ✅ `const enum` 同样禁止
- ✅ 联合字面量类型 + `Record<T, V>` 完全可替代 `enum` 的用法

其他路径与别名：
- 路径别名 `@/*` → `./src/*` 已配置（`tsconfig.app.json` 与 `vite.config.ts` 双向对齐）
- `target: ES2022`，`lib: ["ES2022", "DOM", "DOM.Iterable"]`（可用 `ResizeObserver`、`structuredClone` 等）


### 3.2 Canvas 主题取色（最易漏的技术点）

Canvas 的 `ctx.fillStyle` **不能写 `hsl(var(--primary))`**，那只是字符串，Canvas 不解析 CSS 变量。

**必须**用 `getComputedStyle(el).getPropertyValue('--primary')` 读真实值并拼接 `hsl(...)`，
且需用 `MutationObserver` 监听 `<html>` 的 `class` 变化（`.dark` 增删）来**刷新缓存**，
卸载时 `observer.disconnect()`。否则切换主题会出现"DOM 层变色、Canvas 层没变"的割裂。

详见 `FACTS-wordbank-verified.md` §9。

### 3.3 词数口径（易算错）

- `useWords()` 返回的 Map 大小 = **6667**（合并去重后），**不是 8543**（原始记录数）
- 词池过滤后 = **6537** 词
- 任何"抽查 N 词""占比""覆盖率"必须基于 **6667**

详见 §11。

### 3.4 舍入语义（已发生过的真实错误）

扣血公式必须用 **`Math.round`（JS half-up）**，`Math.round(2.5) = 3`。
不得用 Python 的 `round()` 语义（银行家舍入，`round(2.5) = 2`）。
正确分段：`fs≤24→1点`、`25≤fs≤74→2点`、`fs≥75→3点`。

详见 §12。

### 3.5 环境验证坑

- **`vite build` 会卡在产物写入阶段**（>4.5 分钟，正常应 30s 内）→ 类型验证请用 `tsc -b`
- **Git Bash 的 `ls`/`head`/`tail`/`dirname` 不可用** → 用 Python / PowerShell
- **PowerShell 输出可能不回显** → 用 Python 打印或写文件后 Read

详见 §10。

---

## 四、可直接复用的站内资产（禁止重复造轮子）

| 资产 | 位置 | 用途 |
|------|------|------|
| `useWords(): Map<string, WordEntry>` | `src/hooks/useWords.tsx` | **词库已全局加载，游戏无需重新请求** |
| `loadAllWords()` / `wordsOfBook()` | `src/lib/wordbank.ts` | 分片加载与合并（已由 Context 调用） |
| `speak(text, lang, rate)` | `src/lib/speech.ts` | 发音 |
| `SpeakerButton` | `src/components/ui-bits.tsx` | **已封装 speak + 读取用户语音偏好 + aria-label**，强化卡的 🔊 直接用 |
| `heatGrade(fs, tier)` / `isHot(g)` | `src/lib/priority.ts` | **热度分档必须复用，不得自建阈值** |
| `forgettingRisk(rec, now)` | `src/lib/priority.ts` | 遗忘风险，可作错词优先排序依据 |
| `GlassCard` / `CountUp` / `StatCard` / `HeatBadge` | `src/components/*` | UI 组件 |
| `.glass-card` `.neon-text` `.glow-ring` `.animate-pulse-neon` `.animate-shake` `.animate-pop` `.font-word` `.safe-bottom` | `src/index.css` | CSS 工具类（部分已接入 reduce-motion 降级） |
| `cn()` | `src/lib/utils.ts` | 类名合并 |

⚠️ `src/lib/quiz.ts` 的 `pickDistractors()` **策略过简**（仅同 tier 优先），
不满足 PRD §4 的 confusables 优先 + 语义重叠过滤，需**增强或另建** `src/game/distractors.ts`。

---

## 五、架构设计需明确回答的问题

1. **模块边界**：`engine.ts`（纯函数/类，无 React 依赖）与 `SkyWords.tsx`（React 渲染与生命周期）
   如何划分？engine 是否应做成不依赖 DOM 的纯逻辑以便单测？
2. **状态同步**：游戏内部高频状态（每帧变化的实体位置）与 React 状态（HUD 的 hp/score/combo）
   如何隔离？**避免每帧 setState 触发 React 重渲染**（性能关键）。
3. **`useGameWords.ts` 的职责**：词库已在 Context，此 hook 应只做**词池筛选/排序/过滤**的派生逻辑（`useMemo`），
   **不做加载**。
4. **双错词本**：游戏错词本（`cetyi.game.wrongbook.v1`）与站点错词本（`state.records[].wrong_count`）
   并存，移出阈值不同（游戏 2 次 / 站点 `WRONG_PASS_STREAK=3` 次）。**请明确这是刻意设计**，
   并在 README 说明差异，避免用户困惑。详见 §13。
5. **暂停机制**：`visibilitychange` + `mouseleave` 自动暂停，恢复时**不补扣时间**；
   与强化卡停留计时如何协调。
6. **输入仲裁**：键盘 1-4 / 方向键 / 鼠标 / 触摸 四路输入的统一处理与冲突避免
   （如强化卡显示期间数字键应先关卡片再处理）。
7. **文件清单与任务分解**：按实现顺序排列，标注依赖关系。

---

## 六、待架构师确认后即可进入编码

- 8 个新增文件：`src/pages/Game.tsx`、`src/game/{SkyWords.tsx,engine.ts,wordPool.ts,distractors.ts,wrongbook.ts,types.ts,useGameWords.ts}`
- 3 处修改：`src/App.tsx`（路由 + immersive 白名单 + NAV + grid-cols-7）、`src/pages/Home.tsx`（入口卡）
- 1 份文档：`GAME_README.md`

> 注：文件清单来自原始需求文档第 3.1 节，架构师可**依据层次划分的合理性**调整
> （如合并 `wordPool.ts` 与 `useGameWords.ts`、或拆分 `engine.ts`），但需说明理由。
