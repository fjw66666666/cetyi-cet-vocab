# 词忆 CET · 外部扩展接口（Ext API）规范

版本：v1 · 协议随应用代码升级，破坏性变更将提升 `/v1` 后缀

外部应用程序可通过本接口在用户授权范围内**读取数据、提交修改**（修改单词记忆状态、学习评分、设置、阅读进度等）。所有写操作均经过应用业务规则（SM-2 调度、XP、连胜、徽章）校验并写入审计日志。

## 1. 接入通道

### 1.1 同源桥（推荐调试/脚本/浏览器扩展）
应用页面加载后暴露全局对象：

```js
await window.CetyiExt.call(token, 'system.ping')
// → { id, ok: true, data: { pong: true, api: 'cetyi-ext/v1' } }
```

### 1.2 postMessage（跨域嵌入场景）
向应用窗口发送以下格式消息，响应以 `event.source.postMessage(reply, origin)` 原路返回（响应带相同 `id`）：

```js
const frame = document.querySelector('iframe'); // 嵌入本应用
frame.contentWindow.postMessage({
  id: 'req-1',
  token: 'cetyi_ext_xxx',
  op: 'system.ping',
  payload: {},
  ts: Date.now(),
}, 'https://fjw66666666.github.io');
```

- 跨域来源必须在应用「设置 → 扩展接口」中添加到白名单（严格全匹配 `scheme://host[:port]`，不支持通配符）
- 应用自身域名恒允许
- 角色反转（本应用被嵌入）同样生效

## 2. 授权模型

1. 用户在「设置 → 扩展接口」**开启总开关**（默认关闭）
2. 为外部应用**创建授权条目**：填写名称、勾选范围 → 生成能力令牌（`cetyi_ext_` 前缀）
3. 令牌可**重新生成**（旧令牌立即失效）与**吊销**
4. 每次请求携带令牌 + 命中的范围校验：

| 范围 | 可调用操作 |
|------|-----------|
| `read` | `system.ping` / `word.query` / `stats.snapshot` |
| `words.write` | `word.setStar` / `word.setSlain` / `word.addToPlan` |
| `grade.write` | `learn.grade` |
| `settings.write` | `settings.update` |
| `reading.write` | `reading.progress` / `reading.markUnknown` |

## 3. 信封与防滥用

请求 `{id, token, op, payload, ts}`；响应 `{id, ok, data? , error?{code, message, details?}}`。

- **时间窗**：`ts` 与当前时间差超过 60s → `E_REPLAY`
- **去重**：同一 `(clientId, id)` 二次出现 → `E_REPLAY`
- **限速**：每客户端 60s 窗口 60 次硬上限（超 30 次记审计）→ `E_RATE_LIMITED`
- **审计**：写操作与限速事件写入审计日志（设置页可查看/导出/清空），环形保存最近 500 条

## 4. 错误码

| 码 | 含义 |
|----|------|
| `E_DISABLED` | 扩展接口未启用 |
| `E_ORIGIN_DENIED` | 消息来源不在白名单 |
| `E_TOKEN_INVALID` | 令牌无效或已吊销 |
| `E_SCOPE_DENIED` | 未授权该操作所需范围（details 含 `required`） |
| `E_INVALID_PAYLOAD` | 参数非法（details 为 zod issues 列表） |
| `E_WORD_UNKNOWN` | 单词不在词库 |
| `E_RATE_LIMITED` | 触发限速 |
| `E_REPLAY` | 时间戳超窗或请求 id 重复 |
| `E_BUSINESS_RULE` | 违反业务规则（如通知权限被拒、dailyNew 越界） |
| `E_INTERNAL` | 内部错误 |

## 5. 操作明细

### system.ping（read）
```
payload: {}
data:    { pong: true, api: 'cetyi-ext/v1' }
```

### word.query（read）
```
payload: { wordId: 'abandon' }            // 单词小写拼写，≤48 字符
data:    { entry: {word, uk, us, pos, tier, fs, meanings, books}, record: {...}|null }
```

### stats.snapshot（read）
```
payload: {}
data:    { user_id, activeBook, settings, xp, streak, today, counts{...} }
```

### word.setStar / word.setSlain（words.write）
```
payload: { wordId, value: boolean }       // 目标状态；与当前一致时幂等
data:    { wordId, starred|slain: value }
```

### word.addToPlan（words.write）
```
payload: { wordId }
data:    { wordId, inPlan: true }
```
将该词加入学习计划（置为未学状态、进生词本、当日新词队列置顶）。

### learn.grade（grade.write）
```
payload: { wordId, grade: 0|1|2 }         // 0 忘记 / 1 模糊 / 2 认识
data:    { wordId, isNew, status, interval_min, ef }
```
**注意**：不接受 `isNew/xpBase/quizCorrect` 等统计参数——新词判定与 XP 由应用内部推导，外部无法刷分。提交后按 SM-2 调度更新记忆状态。

### settings.update（settings.write）
```
payload: { dailyNew? 10-50, voice? 'en-GB'|'en-US', notify? boolean, notifyHour? 0-23 }
data:    { settings: {...完整设置} }
```
`notify: true` 需先获得系统通知权限，被拒返回 `E_BUSINESS_RULE`。未知字段一律拒绝（strict）。

### reading.progress（reading.write）
```
payload: { articleId, progress? 0-1, timeMs? ≥0 }
data:    { articleId, saved: true }
```

### reading.markUnknown（reading.write）
```
payload: { articleId, wordId }
data:    { articleId, wordId, marked: true }
```

## 6. 集成示例（iframe 父页面）

```html
<iframe id="cetyi" src="https://fjw66666666.github.io/cetyi-cet-vocab/"></iframe>
<script>
  const token = 'cetyi_ext_xxx';
  const call = (op, payload) =>
    new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        if (e.data && e.data.id === id) {
          window.removeEventListener('message', onMsg);
          resolve(e.data);
        }
      };
      window.addEventListener('message', onMsg);
      document.getElementById('cetyi').contentWindow.postMessage(
        { id, token, op, payload, ts: Date.now() },
        'https://fjw66666666.github.io',
      );
    });

  await call('word.setStar', { wordId: 'abandon', value: true });
</script>
```

## 7. 安全边界

- 纯前端应用，令牌由同源策略保护；令牌**不会**出现在 URL/hash 中
- origin 白名单禁通配符，防止 postMessage 被恶意页面滥用
- 不暴露 `exportJson / importJson / reset` 等全量数据接口（防外部读取/擦除用户数据）
- 所有 payload 经 zod 严格校验（长度上限、枚举、值域），防 localStorage 膨胀
- 全部修改操作留有审计摘要（操作、对象、结果码、耗时）