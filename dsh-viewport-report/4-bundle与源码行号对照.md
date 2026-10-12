# bundle 行 ↔ 源码行 对照表

`3-代码证据-精确行号与原文.md` 里的行号是 **bundle（构建产物）行号**；上游按源码定位时用的是另一套行号。
本文件给出两边的逐条对应，便于把报告直接落在源码上。

- **bundle 基准**：`dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`，565,053 字节，
  sha256 前缀 `a33cbb8130b6e17c`（`dsh` 0.2.0-rc.2，未修补），共 12,516 行。
- **源码基准**：`youbaiyun/deepseek-harness` 的 `master`＝上游 HEAD `5badb15009`＝`dsh-v0.2.1-alpha.1`。
- 源码路径前缀统一省略为 `packages/client/ui-chat/src/client/chat/`。

## 对照表

| # | 位置 | 源文件 | 源码行 | bundle 行 |
|---|---|---|---|---|
| 1a | 真实输入事件清单 | `use-chat-viewport.ts` | 41 | 4476–4482 |
| 1b | 五个输入事件的监听器确实挂上了 | 同上 | 66 | 4524–4527 |
| 1c | `onIntent` 处理器；`paging` 为 null 时早退 | 同上 | 444–450（早退 **449**） | 4895–4903（早退 **4900**） |
| 2a | 参数文档：位置差只是 caller 省略归因时的回落 | `use-scroll-follow.ts` | 87 | 1957 |
| 2b | `sample()`：默认参数即位置差（>0.5px） | 同上 | 90–93 | 1960–1964 |
| 3a | `readScroll()` 归因判据 | `use-chat-viewport.ts` | 136–143（判据 **141**） | 4598–4605（判据 **4603**） |
| 3b | `acknowledge()`：重建归因基准 | 同上 | 128–130 | 4588–4593 |
| 3c | 基准的三处赋值：`detach()` 初值 / `acknowledge()` / 落地后 | 同上 | 90 / 129 / 395 | 4550 / 4589 / 4843 |
| 3d | 基准只在「未跟随」分支推进 | `use-chat-reading.ts` | 195–205（调用点 **200**） | 4421–4433（调用点 **4431**） |
| 4a | 回合结束的单向条件（缺陷本体） | `use-chat-scroll.ts` | 81–84 | 4979–4982 |
| 4b | `followTail()` 入口①：用户自身输入 | 同上 | 68–72 | 4970–4973 |
| 4c | `followTail()` 入口②：点「回到底部」 | 同上 | 127–130 | 5049–5052 |
| 4d | `followTail()` 入口③：手动滚到**精确**底部 | `use-chat-reading.ts` | 127–128 | 4351–4352 |
| 5a | 同族：对浮点位置做零容差比较（`preserve()`） | `use-chat-viewport.ts` | 365–366 | 4811–4812 |
| 5b | 同族：零容差比较（`write()`） | 同上 | 412 | 4861 |

## 这张表顺带说明的一件事

四处缺陷**不在同一个文件里**：

| 源文件 | 承担的角色 |
|---|---|
| `use-chat-viewport.ts` | 捕获并丢弃真实输入（1）、归因判据（3a）、两处零容差（5） |
| `use-scroll-follow.ts` | 位置差回落（2） |
| `use-chat-reading.ts` | 基准推进的调用点（3d）、到精确底部的入口（4d） |
| `use-chat-scroll.ts` | 回合结束的单向条件（4a）、另两个回底入口（4b/4c） |

也就是说：「跟随意图」这套判据分散在四个模块，而只有 `use-chat-viewport.ts` 一处同时持有
「真实输入」与「位置差推断」两者——信息是在模块边界上丢掉的，不是某一个文件的局部疏漏。
所以修法要么在 1c 处把输入接进归因（信息本就在手边），要么在各处统一判据。

## 怎么自己复核

bundle 里保留了逐段的 region 注释，源文件名可以直接读出来，不必猜：

```js
//#region lib/types/client/chat/use-chat-viewport.js
```

于是「bundle 行段 → 源文件」是现成的；再在对应 `.ts` 里按原文 grep，即得到上表行号。
两种产物（`app.asar` 内 / npm 包内）用同样方法都成立——见下一节。

## 同版本两份产物的差异（不影响行号）

同一个 `0.2.0-rc.2`：`app.asar` 内的 bundle 是 565,053 字节（sha256 `a33cbb81…`），
npm 包 `@deepseek-ai/dsh-client-ui-chat` 内的是 565,361 字节（sha256 `575de080…`）。

逐行比对结果：**行数同为 12,516，上表所有被引位置的行号完全相同**。差异共 208 行，全部是

- CSS-module 类名哈希（`app.asar` 为 `cJsG2q_*`，npm 包为 `Sixlwa_*`），以及
- 构建路径注释（`D:\develop\dsh-harness-windows-x64\…` vs `/home/runner/work/deepseek-harness/…`）。

位置 1–4 所在的 4350–5000 区间**一行未变**，所以行号在任一份产物上都站得住。
