# 词库数据实测档案（架构与实现必须遵守）

> 本文件由主理人在需求启动阶段对 `public/data/` 全量跑数得出，**所有数字均为实测值**，非推断。
> 架构师与工程师在实现时必须以本档案为事实基准。测试用的数据脚本见文末。

## 0. 依赖版本实测（`package.json` 声明 vs `node_modules` 实装）

| 包 | package.json | 实装版本 | 备注 |
|----|-------------|---------|------|
| react | `^19.2.0` | **19.2.3** | |
| react-router | `^7.6.1` | **7.18.3** | ⚠️ 导入源是 `react-router`，**不是 `react-router-dom`** |
| vite | `^7.2.4` | **7.3.0** | `base: './'` |
| typescript | `~5.9.3` | **5.9.3** | 构建脚本 `tsc -b && vite build` |
| tailwindcss | `^3.4.19` | **3.4.19** | v3 语法，**不是 v4** |
| lucide-react | `^0.562.0` | **0.562.0** | 图标库 |
| @vitejs/plugin-react | `^5.1.1` | **5.1.2** | |

`node_modules` 已安装（261 个顶层包），`dist/` 已存在，**可直接跑真实构建与 dev server 验证**。

## 1. 分片与规模
| 词书 | 分片数 | 声明词数 | 实测加载词数 |
|------|--------|---------|-------------|
| CET4 | 10（cet4-0 … cet4-9） | 4545 | 4545 |
| CET6 | 8（cet6-0 … cet6-7） | 3998 | 3998 |
| 合并去重后（按 id 小写） | — | — | 见 §5 |

## 2. 字段覆盖率（实测）

| 字段 | CET4 覆盖 | CET6 覆盖 | 结论 |
|------|-----------|-----------|------|
| `example` | 2754 / 4545 = **60.6%** | 1573 / 3998 = **39.3%** | 约四成词无例句，**必须兜底** |
| `mnemonic` | 2743 / 4545 = **60.3%** | 1557 / 3998 = **38.9%** | 约四成词无词根，**必须兜底** |
| `confusables` | 29 / 4545 = **0.6%** | 8 / 3998 = **0.2%** | ⚠️ **极稀疏，见 §3** |
| `collocations` | 部分（未全量统计） | 部分 | 可选 |
| `derivatives` | 部分 | 部分 | 可选 |
| `pos` | 有 15 条为空 | 有 21 条为空 | **可为 undefined，必须兜底** |

## 3. ⚠️ 关键发现：`confusables` 字段极度稀疏

**全库（CET4+CET6）仅 33 个词带 `confusables` 字段**，占 8543 词总数的 **0.39%**。

这意味着原始需求文档中"**优先从 `confusables` 字段取易混词作为干扰项**"的策略，
在实际数据下覆盖率不足 1%——**95% 以上的出题会走不到这条路径**。

### 设计结论（架构师必须处理）

1. `confusables` 优先逻辑**仍然要实现**（它是真数据、质量高，是题库里最珍贵的陷阱对），
   但**不能把它当作主路径**，必须设计一个**覆盖 100% 词的兜底干扰项来源**。
2. `confusables` 的值是**字符串数组**，格式形如 `"abundant adj. 丰富的"`，
   不是纯单词 id。需要**解析首 token** 才能与词库 join：
   - 用 `split(/[\s（(]/)[0].toLowerCase()` 提取词形
   - 实测该解析在 48 条 confusable 条目中 **命中词库 45 条、未命中 3 条**
     （未命中样例：`adsorb`、`adept`、`rise`——不在四六级大纲内，属正常）
3. **未命中时不得崩溃**，应静默跳过该 confusable 条目，回落到兜底策略。

## 4. `pos` 字段实测分布（影响"同 pos"策略）

全库共 **22 种不同的 `pos` 取值**，且包含**复合词性**（如 `adj./n.`、`n./v.`、`v./n.`）。

高频取值（出现 ≥50 次）：

| pos | 出现次数 | 占比 |
|-----|---------|------|
| `n.` | 3407 | 39.9% |
| `adj.` | 1364 | 16.0% |
| `v.` | 1287 | 15.1% |
| `adv.` | 288 | 3.4% |
| `vt.` | 67 | 0.8% |
| `vi.` | 50 | 0.6% |

其余 16 种取值（`prep.` `pron.` `num.` `conj.` `int.` 等）均在 50 次以下，属长尾。

### 设计结论

- **严禁把 `pos` 当枚举用**。必须当**自由字符串**处理：
  精确相等匹配优先 → 失败则退化为"主词性相同"匹配（取 `/` 前第一段，如 `adj./n.` → `adj.`）→ 再失败则忽略 pos 维度。
- 由于 `n.` 占四成，**若只靠"同 pos"抽干扰项，会出现大量同类噪音**，必须叠加 §5 的语义过滤。

## 5. `fs` 与 `tier` 实测分布（影响难度曲线与扣血公式）

| 词书 | `fs` 实测范围 | `tier=0` | `tier=1` | `tier=2` |
|------|--------------|----------|----------|----------|
| CET4 | **16 – 90** | 900 | 1722 | 1923 |
| CET6 | **16 – 87** | 900 | 575 | 2523 |

⚠️ **与原始需求文档不符**：文档称 `fs` 取值范围约 70–83，
**实测真实范围是 16–90**，跨度远大于文档描述。

### 设计结论

- 任何基于 `fs` 的**归一化/分档/扣血公式**都必须按 **16–90** 实测区间设计，
  不能按文档写的 70–83 写死，否则会把绝大多数词都算成"低频词"。
- `tier` 每本书都有 900 个 tier=0 词，**两书合计 1800 个高频词**可作为开局渐进难度池。

## 6. ⚠️ 热度分档必须复用站内既有标准（不得自建）

`src/lib/priority.ts` 已定义完整的热度体系，**游戏必须复用同一套阈值**，
否则会出现"同一个词在词库页标 S 级、在游戏里被当低频词"的认知冲突。

```ts
/** 热度档位：S 真题高频 / A 核心必考 / B 常考 / C 一般 / D 低频 */
export function heatGrade(fs: number | undefined, tier?: number): HeatGrade {
  const score = fs ?? (tier !== undefined ? [100, 70, 40][tier] : 0);
  return score >= 90 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 45 ? 'C' : 'D';
}
export function isHot(g: HeatGrade): boolean { return g === 'S' || g === 'A'; }
```

实测全库 `fs` 最大值仅 90（CET4），意味着 **S 档（≥90）极少**，A 档（≥78）才是"高频"主力。

同文件还导出可直接复用的能力：

| 函数 | 用途 | 游戏可否复用 |
|------|------|-------------|
| `heatGrade(fs, tier)` | 热度分档 S/A/B/C/D | ✅ **必须复用**，用于扣血系数与出题优先级 |
| `isHot(grade)` | 是否 S/A | ✅ 复用 |
| `forgettingRisk(rec, now)` | 遗忘风险 0.05–1 | ✅ **强烈建议复用**：错词优先出题的排序依据 |
| `displayPriority(word, rec, now)` | 综合优先级 | ✅ 可用于难词靠后、弱点靠前的排程 |
| `sprintWords()` / `topFocusWords()` | 高频冲刺池 / 每日重点词 | ⭕ 可选，可作"高频冲刺"玩法池 |
| `prioritizeDue()` | 复习队列表 | ❌ 不涉及 |

## 7. UI 资产实测（避免重复造轮子）

| 资产 | 位置 | 说明 |
|------|------|------|
| `SpeakerButton` | `src/components/ui-bits.tsx` | **已封装 `speak()` + 读取 `store.get().settings.voice`**，带 `aria-label`。强化卡的 🔊 直接用它，无需重写发音逻辑 |
| `GlassCard` | `src/components/GlassCard.tsx` | 玻璃拟态卡片，首页同款 |
| `CountUp` | `src/components/CountUp.tsx` | 数字滚动动画，结束面板得分可用 |
| `StatCard` | `src/components/ui-bits.tsx` | 统计小卡，结束面板战果可用 |
| `HeatBadge` | `src/components/HeatBadge.tsx` | 热度徽章，错词列表可用 |
| `cn()` | `src/lib/utils.ts` | 类名合并（clsx + tailwind-merge） |

**CSS 工具类**（`src/index.css`，可直接用）：`.glass-card` `.neon-text` `.glow-ring` `.hover-lift`
`.animate-pulse-neon`（答对脉冲）`.animate-shake`（答错摇晃）`.animate-pop`（弹出）`.animate-fade-slide`
`.font-word`（词典衬线字）`.safe-bottom`（iOS 安全区）。

**已知的 reduce-motion 降级**：`.animate-pulse-neon` `.animate-fade-slide` 等已在
`@media (prefers-reduced-motion: reduce)` 中统一被禁用，游戏的粒子/抖动**需自行接入该媒体查询**。

## 8. 路由与导航实测细节

```ts
// src/App.tsx 实际代码
const immersive = ['/learn', '/review', '/listen'].some((p) => location.pathname.startsWith(p));

const NAV = [
  { to: '/', label: '今日', icon: Home },
  { to: '/library', label: '词库', icon: BookOpenText },
  { to: '/read', label: '阅读', icon: Newspaper },
  { to: '/stats', label: '统计', icon: BarChart3 },
  { to: '/achievements', label: '成就', icon: Trophy },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];
```

⚠️ **导航有两处，需分别处理**：

1. **桌面端**：`<header>` 内 `<nav className="hidden items-center gap-1 md:flex">`，**手机端隐藏**
2. **移动端**：底部 `<nav>` 内 `<div className="grid grid-cols-6">`，**桌面端隐藏**（`md:hidden`）

两处都渲染 `NAV` 数组。新增 `{ to: '/game', label: '词战', icon: Plane }` 后，
移动端需把 `grid-cols-6` 改为 `grid-cols-7`（已确认决策）。

图标从 `lucide-react` 取（`^0.562.0` 已依赖），可用 `Plane` 或 `Rocket`。

**页面懒加载模式**（保持一致）：
```ts
const GamePage = lazy(() => import('@/pages/Game'));
// 路由：<Route path="/game" element={<GamePage />} />
```

## 9. 主题机制与 Canvas 取色的关键约束

### 9.1 主题切换机制（实测）

```ts
// src/hooks/useTheme.ts —— 已在 App 顶层调用
document.documentElement.classList.toggle('dark', isDark);
```

主题是**在 `<html>` 上切换 `.dark` 类**，CSS 变量随之改变。
用户设置 `state.settings.dark` 为 `'light' | 'dark' | 'auto'`，
`'auto'` 时监听 `prefers-color-scheme` 变化。

### 9.2 ⚠️ Canvas 无法直接使用 Tailwind 类（架构必须解决）

这是纯 Canvas 2D 方案最容易踩的坑：

- **DOM 层**（HUD / 弹药按钮 / 强化卡）：可直接用 `bg-card` `text-foreground` `border-border` 等类，
  或用 `.glass-card` `.neon-text` 工具类，**主题自动跟随**。
- **Canvas 层**（星空背景、敌机、战机、粒子、弹道）：`ctx.fillStyle` 只接受**具体颜色值**，
  **写 `hsl(var(--primary))` 无效**——Canvas 不解析 CSS 变量。

**必须采用的做法：在绘制前用 `getComputedStyle` 读取变量真实值并缓存。**

```ts
// 示例：把 CSS 变量解析为可直接喂给 ctx 的颜色
function readThemeColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const v = (name: string) => `hsl(${cs.getPropertyValue(name).trim()})`;
  return {
    background: v('--background'),
    card: v('--card'),
    primary: v('--primary'),
    destructive: v('--destructive'),
    foreground: v('--foreground'),
    muted: v('--muted-foreground'),
    border: v('--border'),
  };
}
```

**缓存与失效策略（架构需明确）：**
1. 组件挂载时读取一次并缓存。
2. 用 `MutationObserver` 监听 `document.documentElement` 的 `class` 属性变化
   （即 `.dark` 的增删），变化时**重新读取并刷新缓存**。
3. 卸载时 `observer.disconnect()`。

若不处理第 2 步，用户在游戏中切换主题会出现"DOM 层变了色、Canvas 层还是旧色"的割裂。

### 9.3 可用的主题变量一览（`src/index.css` 实测）

| 变量 | 亮色 (`:root`) | 暗色 (`.dark`) |
|------|---------------|---------------|
| `--background` | 210 29% 97% | 225 44% 7% |
| `--foreground` | 224 39% 11% | 213 30% 95% |
| `--card` | 0 0% 100% | 223 34% 10% |
| `--primary` | 200 98% 32% | 198.6 93.2% 59.8% |
| `--destructive` | 6 63% 50% | 6 55% 55% |
| `--muted-foreground` | 218 12% 42% | 215 18% 70% |
| `--border` | 214 20% 87% | 220 26% 18% |
| `--grad-a` | 198.6 93.2% 59.8%（电子蓝） | 同左 |
| `--grad-b` | 258.3 89.7% 66.3%（紫） | 同左 |
| `--grad-c` | 172.5 66.1% 50.4%（青绿） | 同左 |

注意 `--grad-*` 三色**亮暗一致**，可直接用于 Canvas 星空/渐变点缀，无需随主题切换。

## 10. 构建与验证环境（⚠️ 有坑，工程师与 QA 必读）

### 10.1 基线状态（改动前实测）

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 类型检查 | `node node_modules/typescript/bin/tsc -b --pretty false` | ✅ **EXIT=0，零错误**（22s 完成） |
| 构建转换 | `node node_modules/vite/bin/vite.js build` | ✅ **2531 modules transformed** 成功 |
| 构建产物写入 | 同上 | ⚠️ **会卡住**（见 10.2） |

**结论：项目基线完全健康。** 后续若出现类型错误，必定由新增代码引起。

### 10.2 ⚠️ 两个必须绕开的坑

**坑 1：Vite `build` 在产物写入阶段会长时间挂起**

实测 `vite build` 能成功完成模块转换（2531 modules），但随后卡在产物写入，
超过 4 分 33 秒仍未结束（正常应 30 秒内完成）。疑似与已存在的 `dist/` 目录、
Windows 文件锁或 IO 有关。

- **验证类型正确性请用 `tsc -b`，不要依赖 `vite build` 的退出状态。**
- 若确需完整构建，先删除 `dist/` 再试，并设置较长超时。

**坑 2：本机 Git Bash 的 `ls` / `head` / `tail` / `dirname` 等基础命令不可用**

`bash` 工具会报 `line 1: ls: command not found`、`dirname: command not found`。
这是环境 shim 缺陷，与环境变量及路径无关。

- **跑脚本、查文件、看输出请统一用 Python 或 PowerShell。**
- 管道到 `tail`/`head` 会直接失败，不要用。

**坑 3：PowerShell 工具的输出可能不回显**

实测部分 PowerShell 命令返回 `exit code 0` 但 **stdout 为空**。
如需可靠读取结果，改用 Python 打印，或把结果写入文件后用 Read 工具读取。

### 10.3 推荐验证命令

```bash
cd C:/Users/付/Desktop/英语/cetyi-cet-vocab

# 类型检查（首选，快且可靠）
"C:/Users/付/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" \
  node_modules/typescript/bin/tsc -b --pretty false > tsc.log 2>&1; echo "EXIT=$?"

# dev server（用于浏览器实测）
"C:/Users/付/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" \
  node_modules/vite/bin/vite.js --port 3000 --host 127.0.0.1
```

### 10.4 ✅ dev server 可用性已验证（QA 阶段依赖）

实测 `vite` dev server 启动正常（**496ms ready**），HTTP 探测结果：

| 路径 | 状态 | 大小 |
|------|------|------|
| `/` | **200** | 1336 bytes |
| `/data/index.json` | **200** | 598 bytes |
| `/data/cet4-0.json` | **200** | 20630 bytes |

**结论：浏览器实测路径通畅**，`#/game` 的实现可用真实浏览器验证
（词库 fetch 走 `import.meta.env.BASE_URL`，在 dev 模式下解析为 `/`，数据可达）。

启动命令：`node node_modules/vite/bin/vite.js --port 3000 --host 127.0.0.1`
访问地址：`http://127.0.0.1:3000/#/game`


## 11. ⚠️ 词数口径：必须区分"原始记录数"与"合并去重后词数"

**这是本项目最容易算错的数字，所有涉及词量的表述都必须标明口径。**

| 口径 | 数值 | 说明 |
|------|------|------|
| 原始记录数（CET4+CET6 直接相加） | 4545 + 3998 = **8543** | 分片文件里的条目总数 |
| **合并去重后词数** | **6667** | `loadAllWords()` 按 `id.toLowerCase()` 合并后的真实词表大小 |
| 重叠词数（同时在两书中） | **1876** | 8543 − 6667 |

⚠️ 游戏运行时 `useWords()` 返回的 Map **大小是 6667**，不是 8543。
任何"抽查 N 个词""词池覆盖率""xx 词占比"的计算都必须基于 **6667**。

### 实测对照表（常见误算点）

| 指标 | 错误算法（按 8543） | 正确值（按 6667） |
|------|-------------------|------------------|
| `fs >= 78`（isHot A 档及以上）词数 | 2817 ❌ | **2044** ✅ |
| `len == 3` 词数 | — | **243** ✅（此值两口径恰好相同） |
| 词池过滤后剩余 | ~8500 ❌ | **6537** ✅（剔除 130） |

### 词池过滤实测结果（PRD §4.1 规则）

按 PRD 的过滤规则（显式黑名单 + `pos` 功能词性 + `len<=2`，且 `len>=3` 不因长度剔除）实测：

- 过滤后保留 **6537** 词，剔除 **130** 词
- 剔除的 `pos` 分布：`prep.` 42、`pron.` 31、`num.` 21、`conj.` 15、`det.` 7、`int.` 6、
  以及少量因黑名单/短词命中的 `n.` 3、`v.` 2、`art.` 1、`aux.` 1、`adv.` 1
- **正常词抽查全部安全**：`abandon` `assess` `available` `access` `challenge` `aim` `job` `new` `old` `plan` —— 全部保留 ✅
- **功能词抽查全部剔除**：`and`(conj.) `be`(len2) `i`(pron.) `a`(art.) ✅

⚠️ **注意**：被剔除的长词含 `despite` / `amongst` / `beneath` / `throughout` / `via` /
`regarding` / `provided` —— 这些是靠 **`pos` 判据**（介词/连词）剔除的，不是靠长度。
它们作为四选一释义题确实出不了好题，**属刻意取舍**，不要误判为 bug 而放开过滤。

## 12. ⚠️ 舍入语义陷阱：Python `round()` ≠ JS `Math.round()`

**这是本项目发生过的真实错误，必须记录以防重犯。**

| 语言 | 函数 | `round(2.5)` 结果 | 语义 |
|------|------|------------------|------|
| Python | `round()` | **2** | 银行家舍入（half-to-even） |
| JavaScript / TypeScript | `Math.round()` | **3** | 四舍五入（half-up） |

**事故经过**：主理人用 Python `round()` 验算扣血公式，
得出 `fs=75 → round(2.5)=2 → 2 点`，据此误判 PRD 的分段表与公式矛盾并发起勘误。
产品经理指出应使用 JS 语义后复核，实际 `Math.round(2.5)=3`，**PRD 原分段表本来就是正确的**。

### 扣血公式的正确分段（JS `Math.round` 语义，已实测确认）

```
damage = clamp( Math.round(1 + 2 * (fs / 100)), 1, 3 )
```

| `1 + 2·fs/100` | 对应 `fs` | damage | 实测词数 | 占比 |
|----------------|----------|--------|---------|------|
| < 1.5 | `fs ≤ 24` | **1** | 410 | 4.8% |
| 1.5 ~ 2.5（不含 2.5） | `25 ≤ fs ≤ 74` | **2** | 4643 | 54.3% |
| ≥ 2.5 | `fs ≥ 75` | **3** | 3490 | 40.9% |

**边界**：`fs=74 → 2.48 → 2 点`；`fs=75 → 2.50 → 3 点`（3 点档下边界）。

⚠️ **实现必须用 `Math.round`，不得用其它舍入实现**，否则 `fs=75` 会掉档。
⚠️ **任何用 Python 做的验算，凡涉及中点舍入，结论都不能直接搬到 TS 实现上。**

## 13. ⚠️ 双错词本并存问题（架构必须决策）

**站点已有一套错词本**，游戏将再建一套，两者默认互不相通：

| | 站点错词本 | 游戏错词本 |
|---|-----------|-----------|
| 载体 | `cetyi.v1` → `state.records[wordId].wrong_count` | 独立键 `cetyi.game.wrongbook.v1` |
| 写入方 | `store.grade(..., { quizCorrect: false })` | 游戏判定逻辑 |
| 消费方 | `/library` 页「错词本」筛选项、`Settings` 页「导出错词本」按钮 | 游戏结束面板、「专攻错词」模式 |
| 移出规则 | `wrong_count` 累计，另由 `WRONG_PASS_STREAK = 3`（**连对 3 次**）通过 | **连对 2 次**移出 |

实测的证据：

```ts
// src/pages/Library.tsx:102 —— 站点错词数统计
wrong: Object.values(state.records).filter((r) => r.wrong_count > 0 && !r.slain).length,

// src/pages/Settings.tsx:45-49 —— 站点错词本导出
const exportWrong = () => {
  const wrong = [...words.values()].filter((w) => (state.records[w.id]?.wrong_count ?? 0) > 0 && !state.records[w.id]?.slain);
  ...
};

// src/lib/config.ts:33
export const WRONG_PASS_STREAK = 3; // 错词连续答对 3 次视为通过
```

### 需架构师明确决策的点

1. **数据隔离是刻意的还是遗漏？** 原始需求明确要求"只新增 `cetyi.game.*` 键、不动原有数据"，
   所以**分离存储是正确且必须的**（P0-19）。但要在 PRD/设计中**明示这是有意为之**。
2. **两套移出阈值不一致**（站点 3 次 / 游戏 2 次）会造成用户困惑：
   在游戏里"记住"的词，回词库页可能仍标着错词。
   - 建议：在 `GAME_README.md` 中说明这一差异，或统一为 3 次。
3. **是否写回站点错词本？** 若游戏中答错也调用 `store.grade(..., quizCorrect:false)`，
   则 `wrong_count` 会累加，两个错词本数据趋于一致——但这**会修改站点既有学习数据**，
   与 P0-19"不覆盖原有存储"存在张力。
   - 该函数会同时触发 SM-2 调度、XP、连胜、徽章等副作用，**风险显著**。
   - **建议：默认不写回**（保持只读），并在 README 说明两套错词本的用途差异。

此决策请架构师在架构文档中给出明确结论与理由。

## 14. 数据脚本（可复现）

```bash
cd C:/Users/付/Desktop/英语
"C:/Users/付/.workbuddy/binaries/python/versions/3.13.12/python.exe" -c "
import json,os
base='cetyi-cet-vocab/public/data'
idx=json.load(open(os.path.join(base,'index.json'),encoding='utf-8'))
for book,v in idx['books'].items():
    total=has_conf=has_ex=has_mn=0; fsmn=999; fsmx=-1
    for sh in v['shards']:
        for w in json.load(open(os.path.join(base,sh),encoding='utf-8')):
            total+=1
            has_conf += bool(w.get('confusables'))
            has_ex += bool(w.get('example'))
            has_mn += bool(w.get('mnemonic'))
            fs=w.get('fs')
            if fs is not None: fsmn=min(fsmn,fs); fsmx=max(fsmx,fs)
    print(book,total,'conf',has_conf,'ex',has_ex,'mn',has_mn,'fs',fsmn,fsmx)
"
```

注意：本机 bash 环境的 `ls`/`head`/`dirname` 等基础命令不可用（Git Bash shim 问题），
**跑数据脚本请统一用 Python 或 PowerShell**，不要依赖 bash 内置工具。
