# DSH 官方代码问题：回答结束时视图停在半路

本目录是对一个 DSH 桌面端缺陷的分析材料，供提交给 DSH 官方使用。

## 一句话结论

`@deepseek-ai/dsh-client-ui-chat` 的转录跟随逻辑，**把「内容增长导致的滚动位置变化」误判为「读者滚动」**，
于是停止跟随；而回合结束的分支又被 `&& reading.followingTail` 挡住，**再也回不到最新消息**。
结果就是：长回答已经答完，视图却停在回答中间。

**这是 DSH 官方代码的缺陷**，与任何第三方扩展、配置无关。

## 文件说明

| 文件 | 用途 |
|---|---|
| `1-完整技术报告.md` | 完整分析：现象、触发链条、四处缺陷＋一处同族、为什么是缺陷而非设计取舍、复现、建议修复 |
| `2-简短版-可直接粘贴issue.md` | 建议**实际提交这一份**：精简、含关键代码与修法，每条引用都带「源码行 + bundle 行」双锚 |
| `3-代码证据-精确行号与原文.md` | 每处缺陷的精确行号与代码原文，供官方逐条核对 |
| `4-bundle与源码行号对照.md` | bundle 行 ↔ 源码行对照表；含两份同版本产物差异的说明 |
| `verify-行号可核对清单.md` | 快速自查清单：在原始 bundle 里逐条 grep 验证（附源码列） |
| `tools-说明.md` | 本目录里 `tools-*` 怎么用、与 `D:\DSH-file` 的关系 |

## 建议提交方式

1. 打开 DSH 的问题反馈入口（issue tracker / 反馈表单），或直接在已有 Discussion 下回复。
2. 标题建议：
   > 回答结束时视图停在半路：转录跟随把「内容增长」误判为「读者滚动」，之后不再回到最新消息
3. 正文粘贴 `2-简短版-可直接粘贴issue.md` 的内容。
4. 附上 `3-代码证据-精确行号与原文.md`；若对方按源码定位，再附 `4-bundle与源码行号对照.md`。
5. 回复时的措辞要点：引用**源码路径 + 行号 + 符号名**（如 `use-chat-viewport.ts:141` 的 `movedByReader` / `this.observation`），不要只描述现象——这比行号本身更耐版本漂移。

## 如何自行核对（不依赖本机修补）

缺陷位于安装包内的 `app.asar`，需要先从归档中取出 bundle：

```powershell
# 取出 bundle（需要 _asar_get.mjs，见下）
node _asar_get.mjs 'D:\DeepSeek Harness\resources\app.asar' `
  'dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js' client.js
```

然后按 `verify-行号可核对清单.md` 逐条比对。

**重要**：如果本机已经打过修复补丁，取出的 bundle 会是**已修补**的版本，
行号与内容会与报告不符。请先按下面的「还原」步骤取到原始版本。

## 本机状态与还原

**当前状态（2026-10-12 实测）：已打补丁。** `node patch-dsh-follow.mjs check` 报 `状态: 已打补丁 ✓`，
从归档取出的 bundle sha256 前缀为 `86f9a85694d9f449`（＝ `tools-_chat-client.patched.js`）。

⚠️ 因此在**本机现在复现不了**「答完停在半路」。若要提供行为证据（录屏／时间线），必须先用下面的还原命令
取回原始字节再复现。补丁只改了回合结束那一处判定、误归因仍在（属于 `2-` 里的「最小兜底」），所以现象应当消失。

本机曾为确认诊断而临时修补过该 bundle（仅 4 处替换）。归档备份位于：

```
D:\DeepSeek Harness\resources\app.asar.backup
```

还原命令：

```powershell
Copy-Item 'D:\DeepSeek Harness\resources\app.asar.backup' `
          'D:\DeepSeek Harness\resources\app.asar' -Force
```

查看当前是否已修补：

```powershell
cd D:\DSH-file
node patch-dsh-follow.mjs check
```

## 相关工具

本目录下的 `tools-*.mjs` / `tools-_chat-client.*.js` 与 `D:\DSH-file` 下的同名文件**逐字节相同**（已核对哈希），
只是加了 `tools-` 前缀以便和文档区分。**前缀会打断脚本之间互相调用**（`patch-dsh-follow.mjs` 会去找
`_patch.mjs` / `_asar_get.mjs` / `_asar_put.mjs`），所以本目录里的这份是**随附备份**；要真正跑，用
`D:\DSH-file` 里的原始命名，或把 `tools-` 前缀去掉后放到同一目录。详见 `tools-说明.md`。

| 文件 | 用途 |
|---|---|
| `_asar_get.mjs` | 从 asar 归档中取出单个文件 |
| `_asar_put.mjs` | 等长原地写回，带内容哈希校验与自动备份 |
| `_patch.mjs` | 生成补丁并自检（长度不符则拒绝输出） |
| `patch-dsh-follow.mjs` | 幂等封装：`check` / `apply`，能识别未打 / 已打 / 无法识别三种状态 |
| `_chat-client.orig.js` | 未修补的原始 bundle（行号引用基准） |
| `_chat-client.patched.js` | 修补后的 bundle（供 diff） |

## 时间与版本备注

- 报告基于安装包内实际字节，非源码仓库；版本为 `dsh` 包 `0.2.0-rc.2`。
- **同版本两份产物**：`app.asar` 内的 bundle 565,053 字节（sha256 `a33cbb81…`），npm 包
  `@deepseek-ai/dsh-client-ui-chat` 内的是 565,361 字节（sha256 `575de080…`）。逐行比对：行数同为
  12,516，所有被引行号相同；差异 208 行全是 CSS-module 类名哈希与构建路径注释。详见 `4-`。
- DSH 更新后行号可能变化。`verify-行号可核对清单.md` 里的匹配串是**代码片段**而非仅行号，
  因此即使行号漂移也仍可定位。
- `patch-dsh-follow.mjs check` 输出的字节数在 2026-10-12 前是**字符数**（`String.length`，563,047），
  与文档里的真实字节数 565,053 对不上；已改为 `Buffer.byteLength`。