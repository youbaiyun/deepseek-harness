# 行号可核对清单

在原始 bundle 中逐条查找下列**代码片段**。用片段而非行号，因此 DSH 更新后行号漂移也仍可定位。

> 「源码行」一列对应 `4-bundle与源码行号对照.md`（源码基准 `master`＝`5badb15009`）。
> 判定仍以**代码片段**为准：片段在、行号对，即为成立。

```powershell
# 先取出 bundle（详见 README）
node _asar_get.mjs 'D:\DeepSeek Harness\resources\app.asar' `
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js' client.js
```

| # | 位置 | 应在的代码片段 | 本机实测行号 | 源码行（见 `4-`） |
|---|---|---|---|---|
| | 位置 1a：输入事件清单 | `const READING_INTENTS = [` | 4476 | `use-chat-viewport.ts:41` |
| | 位置 1b：监听器已挂载 | `scroller.addEventListener(type, this.onIntent` | 4524 | `use-chat-viewport.ts:66` |
| | 位置 1c：onIntent 早退（paging 为 null） | `if (this.paging === null) return;` | 4900 | `use-chat-viewport.ts:449` |
| | 位置 2：位置差归因的默认参数 | `movedByReader = this.sampledTop === void 0` | 1960 | `use-scroll-follow.ts:90` |
| | 位置 2b：归因参数文档 | `caller attribution; omitted callers compare` | 1957 | `use-scroll-follow.ts:87` |
| | 位置 3a：readScroll 靠差值 | `movedByReader: Math.abs(metrics.top - Math.min(this.observation.top` | 4603 | `use-chat-viewport.ts:141` |
| | 位置 3b：acknowledge 只在未跟随分支 | `this.viewport.acknowledge(scroll.metrics);` | 4431 | `use-chat-reading.ts:200` |
| | 位置 4：回合结束的单向条件 | `) && reading.followingTail) {` | 4979 | `use-chat-scroll.ts:81–84` |
| | 位置 4b：followTail 被调用（回底） | `reading.followTail();` | 4972 | `use-chat-scroll.ts:68–72` |
| | 位置 5a（补充）：同族零容差 `preserve()` | `if (metrics.top !== target) {` | 4811–4812 | `use-chat-viewport.ts:365–366` |
| | 位置 5b（补充）：同族零容差 `write()` | `if (top !== metrics.top)` | 4861 | `use-chat-viewport.ts:412` |

## 判断依据

若上面每一条都能在原始 bundle 中找到，则报告所述的四处缺陷位置成立：

1. 输入事件被监听（位置 1a/1b），但处理器不设置 `movedByReader` 或 `following`（位置 1c 之后的实现）。
2. 归因默认走位置差（位置 2），而参数文档自己说明这只是**回落**（位置 2b）。
3. 基准 `acknowledge()` 只在「未跟随」分支推进（位置 3b），与位置 3a 的差值判定形成循环依赖。
4. 回合结束分支被 `&& reading.followingTail` 限制（位置 4），而 `followTail()` 的入口不含回合结束（位置 4b）。
