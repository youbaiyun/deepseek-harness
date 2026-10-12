# 回答结束时视图停在半路：跟随逻辑把「内容增长」误判成「读者滚动」，之后不再回到最新消息

**组件**：`@deepseek-ai/dsh-client-ui-chat`（对话转录滚动/跟随）
**环境**：DeepSeek Harness 桌面端，`dsh` 包 `0.2.0-rc.2`，bundle `lib/client.js` 565,053 字节，sha256 `a33cbb81…`
**定位**：下面每处同时给出**源码行**（`master` ＝ `5badb15009` ＝ `dsh-v0.2.1-alpha.1`）与 **bundle 行**（0.2.0-rc.2 的构建产物），逐条对照见随附的对照表
**涉及的源文件**（同目录 `packages/client/ui-chat/src/client/chat/`）：`use-chat-viewport.ts`、`use-scroll-follow.ts`、`use-chat-reading.ts`、`use-chat-scroll.ts`

## 现象

长回答**已经答完**，视图却停在这段回答的**中间**，之后不再滚动。间歇性出现。

## 复现

1. 提一个回答长度超过视窗的问题。
2. 全程不碰滚轮/触控板，等回答结束。

## 根因

读者意图**不是**从输入事件读出来的，而是从**滚动位置差**推断的；而这个推断的基准在跟随时又是过期的，于是内容增长被当成读者滚动。

**① 输入事件被监听，却不参与判断** —— `use-chat-viewport.ts:444–450`（bundle 4895–4903）

```ts
private readonly onIntent = (event: Event): void => {
  if (event.type === 'keydown' || event.type === 'pointerdown') {
    if (event.target instanceof Element && event.target.closest('[data-composer-seat]') !== null) return
    if (event.type === 'keydown' && (!(event instanceof KeyboardEvent) || !SCROLL_KEYS.has(event.key))) return
  }
  if (this.paging === null) return          // ← :449；普通流式输出时 paging 为 null，直接返回
  this.stopPreserving()
  this.events?.interact()
}
```

`onIntent` 从不设置 `movedByReader` / `following`；而且它在 `paging === null` 时直接返回（`:449`，bundle 4900）。`paging` 只在加载更早历史时非空（初值 `paging = null`，bundle 4502 / 4776），所以正常流式输出期间，真实输入事件被**显式丢弃**。

**② 归因靠位置差** —— `use-scroll-follow.ts:87`（参数文档）/ `:90–93`（实现）（bundle 1957 / 1960–1964）

```ts
/**
 * @param movedByReader - caller attribution; omitted callers compare the last sampled position.   // :87
 */
sample(metrics: ViewportMetrics, movedByReader = this.sampledTop === undefined
  || Math.abs(metrics.top - this.sampledTop) > 0.5): boolean {                                     // :90–91
  this.sampledTop = metrics.top                                                                    // :92
  if (!this.animating && movedByReader) this.following = this.nearBottom(metrics)                  // :93
```

任何超过半像素的 `top` 变化都被归因给读者，**包括内容增长与应用自身滚动锚定造成的变化**。

**③ 自我强化的循环** —— 判据 `use-chat-viewport.ts:136–143`（判据 `:141`，bundle 4598–4605 / 4603）；基准 `:128–130`（bundle 4588–4593）；调用点 `use-chat-reading.ts:195–205`（调用点 `:200`，bundle 4421–4433 / 4431）

```ts
// use-chat-viewport.ts
readScroll(): ViewportScroll | null {                                                              // :136
  const metrics = this.metrics()
  if (metrics === null) return null
  return {
    metrics,
    movedByReader: Math.abs(metrics.top - Math.min(this.observation.top, metrics.floor)) > 0.5,     // :141
  }
}

// use-chat-reading.ts
const followingTail = this.follow.sample(scroll.metrics, scroll.movedByReader)                      // :195
if (!scroll.movedByReader && followingTail) this.followTail()
else {
  position = followingTail ? null : this.viewport.capturePosition()
  this.viewport.acknowledge(scroll.metrics)                                                        // :200 ← 只在这里推进基准
  …
}
```

`acknowledge()` 只在「没在跟随」时才调用，于是**跟随时基准冻结**：内容增长把 `metrics.top` 推走、而 `this.observation.top` 还是旧值，差值超过 0.5px 就被判成「读者滚动」（`:141` 里 `Math.min(observation.top, floor)` 只处理了容器变矮的方向，内容变长这一侧仍拿旧基准比）。一旦停止跟随，基准才开始推进——**因为没在跟随所以不更新基准，因为不更新基准所以更早地停止跟随**。

**④ 断链后无法恢复** —— `use-chat-scroll.ts:81–84`（bundle 4979–4982）

```ts
const tipChanged = …                                                                               // :77–80
if (tipChanged && reading.followingTail) {                                                          // :81
  navigation.cancel()
  reading.followTail()                                                                              // :83
} else navigation.reconcile()
```

`reading.followTail()` 只有三个入口：用户自身输入（`use-chat-scroll.ts:68–72`）、点「回到底部」按钮（`:127–130`）、手动滚到**精确**底部（`use-chat-reading.ts:127–128`）。**回合结束不在其中**，所以一旦断链就再也回不来。

**⑤ 同族问题（建议一并处理）** —— `use-chat-viewport.ts:365–366`（bundle 4811–4812）与 `:412`（bundle 4861）对浮点滚动位置做**精确不等**比较：

```ts
const target = Math.max(0, Math.min(metrics.floor, metrics.top + top - group.top))                  // :365
if (metrics.top !== target) {                                                                       // :366 ← 零容差
…
if (top !== metrics.top) this.elements.scroller.scrollTop = top                                     // :412 ← 零容差
```

而 `:141` 用的是 0.5 容差。同一个功能里两套容差标准，说明这套判据需要一次统一梳理。

> 补一句范围：上述判据分散在**四个源文件**里（见开头文件列表），只有 `use-chat-viewport.ts` 一处同时持有「真实输入」与「位置差推断」——信息是在模块边界上丢掉的。

## 为什么这是缺陷而非设计取舍

`sample()` 的参数文档自己写明了位置差只是**回落**（`use-scroll-follow.ts:87`）：

> `@param movedByReader - caller attribution; omitted callers compare the last sampled position.`

即：**归因应由调用方给出**，位置差只是没有更好信息时的兜底。而真实输入事件（`wheel` / `touchstart` / `pointerdown` / `keydown` / `beforematch`，`use-chat-viewport.ts:41`）已经全部监听（挂载点 `:66`）—— 信息就在同一个模块里，只是被 `:449` 的早退丢掉了。

## 建议修复

```ts
// 1) 用真实输入置位，这才是可信的意图来源（onIntent 的早退之前）
private readonly onIntent = (event: Event): void => { …; this.readerMoved = true; if (this.paging === null) return; … }

// 2) 差值只用于确认幅度
movedByReader: this.readerMoved && Math.abs(metrics.top - baseline) > 0.5

// 3) 跟随时也推进基准，解开循环依赖（use-chat-reading.ts）
if (followingTail) this.viewport.acknowledge(scroll.metrics)
```

**最小兜底**：让回合结束改看「读者是否离开尾部」而不是被污染的 `followingTail`，这样答完能回到最新，但误归因仍在。

---

（bundle 与源码的逐条对照、以及同版本两份产物的差异说明见随附的 `4-bundle与源码行号对照.md`；完整分析与逐段代码原文见 `1-` / `3-`。）
