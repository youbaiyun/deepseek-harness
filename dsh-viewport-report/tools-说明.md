# 这个目录里的 `tools-*` 怎么用

本目录的 `tools-*` 与 `D:\DSH-file` 下的同名文件**逐字节相同**（已核对 sha256），只是加了 `tools-` 前缀，
让「随文档走的备份」与「正在用的工具」分得开。

> ⚠️ **前缀会打断脚本之间的调用**：`patch-dsh-follow.mjs` 内部会去执行 `_asar_get.mjs`、`_patch.mjs`、
> `_asar_put.mjs`，用的是**不含前缀**的文件名。所以本目录这份**不能直接跑**。

## 要用的话，两条路

1. **直接用工作副本**（推荐）：`cd D:\DSH-file` —— 那里是原始命名，一条命令即可：

   ```powershell
   node patch-dsh-follow.mjs check    # 只看状态，不改任何东西
   node patch-dsh-follow.mjs apply    # 仅当"未打补丁"时才写入
   ```

2. **从这里重建一份可运行的工具集**：把本目录的 `tools-*` 复制到某个空目录并去掉 `tools-` 前缀，
   再把 `tools-_chat-client.orig.js` / `tools-_chat-client.patched.js` 命名为
   `_chat-client.orig.js` / `_chat-client.patched.js`，然后在该目录里运行。

## 各文件干什么

| 文件 | 作用 |
|---|---|
| `tools-_asar_get.mjs` | 从 asar 归档里取出单个文件（`node _asar_get.mjs <archive> <inner/path> [outFile]`） |
| `tools-_asar_put.mjs` | 等长原地写回归档，带内容哈希校验与自动备份 |
| `tools-_patch.mjs` | 生成补丁并自检：四处替换、每处要求唯一匹配、长度不符则拒绝写出 |
| `tools-patch-dsh-follow.mjs` | 幂等封装：`check` / `apply`，能区分「未打 / 已打 / 无法识别」 |
| `tools-_chat-client.orig.js` | 未修补的原始 bundle（565,053 字节，sha256 `a33cbb81…`）——**行号引用基准** |
| `tools-_chat-client.patched.js` | 修补后的 bundle（565,053 字节，sha256 `86f9a856…`，供 diff） |

## 补丁做了什么（4 处等长替换）

| # | 替换 | 含义 |
|---|---|---|
| 1 | `ScrollFollow` 类字段 `following` → `x` | 换成 bundle 里不会重名的字段，改作「读者是否离开了尾部」 |
| 2 | `sample()` 里补 `this.x = !this.following` | 在重新计算跟随意图的同一处记录读者意图 |
| 3 | getter `followingTail()` 改返回 `this.x` | 名字保留（状态机的公开面），答案改为读者意图 |
| 4 | 回合结束 `&& reading.followingTail` → `&& !reading.state.x` | 缺陷本体：答完是否回底 |

总长度必须与原文件**逐字节相等**（asar 是原地写入，后续文件的偏移量按字节计）。四处替换后若差 1 字节，
`_patch.mjs` 会在文件末尾补一个空格——这是脚本里写明并自检过的唯一让步（对 JS 模块无害）。

## 一处已修的显示问题

`patch-dsh-follow.mjs check` 过去把 `String.length`（UTF-16 码元数，563,047）标成「字节」，
与文档里的真实字节数 565,053 对不上，容易被误读成文件被改坏了。现已改为 `Buffer.byteLength`。
