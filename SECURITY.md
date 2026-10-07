[1-完整技术报告.md](https://github.com/user-attachments/files/33165993/1-.md)
# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |# 回答停在半路：转录跟随把「内容增长」误判为「读者滚动」，回合结束便不再回到最新消息

- **组件**：`@deepseek-ai/dsh-client-ui-chat`（对话转录的滚动与跟随逻辑）
- **文件**：`dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`
- **环境**：DeepSeek Harness 桌面端；`app.asar` 115.7 MB；`dsh` 包 `0.2.0-rc.2`
- **bundle**：565,053 字节，sha256 前缀 `a33cbb8130b6e17c`（未修补的原始版本）

## 现象

回答较长时，**回合已经结束，视图却停在这段回答的中间**，之后不再滚动。看起来就像"回答只写了一半"。

因为触发条件是「内容增长」与采样时机竞争，所以是**间歇性**的 —— 这与"有时答到一半就停住"的反馈一致。

## 触发链条

1. 提交提问 → `reading.followTail()` 执行，转录处于「跟随尾部」状态。
2. 回答流式输出，内容持续变长。
3. `ScrollFollow.sample()` 的默认归因判定「读者动了」。
4. `followingTail` 变为 `false`。
5. 回合结束时，分支因 `&& reading.followingTail` 不成立，走 `else`。
6. 回合结束，视图停在原处。

---

## 缺陷位置（四处）

### 位置 1｜真实输入事件被捕获，却不参与判断

```js
// 行 4476–4482
const READING_INTENTS = ["wheel", "touchstart", "pointerdown", "keydown", "beforematch"];

// 行 4524 —— 监听器确实挂上了
for (const type of READING_INTENTS) scroller.addEventListener(type, this.onIntent, { passive: true, capture: true });

// 行 4895–4903 —— 处理器
onIntent = (event) => {
    if (event.type === "keydown" || event.type === "pointerdown") {
        if (event.target instanceof Element && event.target.closest("[data-composer-seat]") !== null) return;
        if (event.type === "keydown" && (!(event instanceof KeyboardEvent) || !SCROLL_KEYS.has(event.key))) return;
    }
    if (this.paging === null) return;          // ← 普通流式输出时 paging 为 null，直接返回
    this.stopPreserving();
    this.events?.interact();
};
```

`onIntent` **全程没有设置 `movedByReader`，也没有设置 `following`**。读者的真实意图被捕获了，却从未进入"是否继续跟随"的决策。

补充：`paging` 只在**加载更早历史**时非空（`beginPaging()` 行 4730、`paging = null` 行 4502 / 4776），所以正常流式输出期间 `onIntent` 在第 4900 行就返回了。

### 位置 2｜决策完全依赖「位置差」推断

```js
// 行 1954–1964
/**
 * Adopt delivered scrolling while retaining intent during native animation.
 * @param metrics - current geometry.
 * @param movedByReader - caller attribution; omitted callers compare the last sampled position.
 * @returns updated follow intent.
 */
sample(metrics, movedByReader = this.sampledTop === void 0
                          || Math.abs(metrics.top - this.sampledTop) > .5) {
    this.sampledTop = metrics.top;                                        // ← 每次采样都推进基准
    if (!this.animating && movedByReader) this.following = this.nearBottom(metrics);
    return this.active;
}
```

任何超过半像素的 `top` 变化都被归因给读者，**包括内容增长与应用自身滚动锚定造成的变化**。

### 位置 3｜自我强化的死循环

```js
// 行 4594–4605
readScroll() {
    const metrics = this.metrics();
    if (metrics === null) return null;
    return {
        metrics,
        movedByReader: Math.abs(metrics.top - Math.min(this.observation.top, metrics.floor)) > .5
    };
}

// 行 4421–4433 —— 基准只在「未跟随」分支推进
flushSample = () => {
    if (!this.pending) return;
    this.cancelPending();
    const scroll = this.viewport.readScroll();
    if (scroll === null) return;
    const followingTail = this.follow.sample(scroll.metrics, scroll.movedByReader);
    let position = null;
    if (!scroll.movedByReader && followingTail) this.followTail();
    else {
        position = followingTail ? null : this.viewport.capturePosition();
        this.viewport.acknowledge(scroll.metrics);        // ← 只在这条分支里推进基准
        …
    }
};
```

`acknowledge()`（行 4588）**只在「没在跟随」时才调用**。于是正常跟随期间基准是冻结的：

| 步骤 | 结果                                                   |
| -- | ---------------------------------------------------- |
| 1  | 正在跟随 → `acknowledge()` 不执行 → 基准 `observation.top` 冻结 |
| 2  | 回答流式增长 → `top` 变大                                    |
| 3  | 下一次 `readScroll()` 用**新 top** 比**旧基准** → 差值 > 0.5px  |
| 4  | → `movedByReader = true`（**误判**）                     |
| 5  | → `following = nearBottom(metrics)` → 通常为 `false`    |
| 6  | → 停止跟随（此时用户什么都没做）                                    |
| 7  | → 此后 `acknowledge()` 才开始推进基准，但跟随已经断了                 |

**因为没在跟随所以不更新基准，因为不更新基准所以更早地停止跟随。**

### 位置 4｜单向状态机：回合结束不会把你带回来

```js
// 行 4979–4982
if ((previous === null || current.ready !== previous.ready || current.firstSeq !== previous.firstSeq
     || current.lastKey !== previous.lastKey || current.order.length !== previous.order.length
     || current.running !== previous.running || current.steeringId !== previous.steeringId
     || current.submissionId !== previous.submissionId)
    && reading.followingTail) {
    navigation.cancel();
    reading.followTail();          // ← 只在「本来就在跟随」时才回到底部
} else navigation.reconcile();
```

`reading.followTail()` 只有三个入口：

- 行 4970–4973：用户自己提交输入（`ownInput`）
- 点击「回到底部」按钮
- 手动滚动到**精确底部**（行 4352：`scroll.metrics.top >= scroll.metrics.floor`）

**回合结束不在其中。** 所以一旦断链，答完也不会回到最新消息。

---

## 为什么这是缺陷，而不是设计取舍

判据不是主观判断，而是**同一模块内三处自证**：

| 证据      | 位置                   | 说明                                                                                                     |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| 显式归因通道  | 行 1957               | 参数文档写明 *"caller attribution; omitted callers compare the last sampled position"* —— 位置差只是**无更好信息时的回落** |
| 真实输入已捕获 | 行 4476 / 4524 / 4895 | 五种输入事件都监听了，却不用来判断意图                                                                                    |
| 循环依赖    | 行 4431               | `acknowledge()` 依赖「未在跟随」，使基准在跟随时永远过期                                                                   |

**尊重读者意图是正确的设计；用位置差去推断这个意图，是缺陷。**

## 复现

1. 提一个回答长度超过视窗的问题。
2. **全程不碰滚轮/触控板**，等待回答结束。

结果：视图可能停在回答中间。因为是内容增长与采样时机竞争，所以是间歇性的。

> 说明：不碰滚轮也可能触发（位置 3 的循环依赖），而**碰了滚轮时触发得更稳定** —— 这也是为什么它既会被报成"有时候停住"，也会被报成"我滚上去看开头，答完就不管我了"。

---

## 建议修复

**根治（推荐）：把真实输入接进归因，不再靠差值猜。**

```js
// 1) onIntent 里记录「读者确实动了」——这是唯一可信的意图来源
onIntent = (event) => {
    …现有过滤…
    this.readerMoved = true;
    if (this.paging === null) return;
    this.stopPreserving();
    this.events?.interact();
};

// 2) readScroll() 用真实意图限定，差值只用于确认幅度
movedByReader: this.readerMoved && Math.abs(metrics.top - baseline) > .5

// 3) 跟随期间也推进基准，解开循环依赖
if (followingTail) this.viewport.acknowledge(scroll.metrics);
```

**兜底（最小改动）：回合结束不再依赖那个已被污染的标志。**

```js
// sample()：记住读者是否离开了尾部
if (!this.animating && movedByReader) { this.following = this.nearBottom(metrics); this.readerLeft = !this.following; }

// 回合结束：只有读者确实离开才不回贴
) && !reading.state.readerLeft) {
```

兜底方案可以让「答完回到最新」不再依赖被污染的 `followingTail`，但**误归因本身仍然存在**，所以严格来说应配合根治方案。

## 说明

本问题是在排查一个不相关的功能时发现的，因为位于已发布的代码中而报告。本地为确认诊断曾临时修补过（仅上述兜底方案涉及的几处替换），问题本身与任何第三方扩展、配置无关。

| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.
