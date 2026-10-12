/**
 * Apply (or verify, or re-apply) the follow-tail patch to the installed DSH app.
 *
 * The fix belongs to DSH, not to this machine: the transcript's follow logic infers
 * "the reader scrolled" from a position delta, so content growth during streaming reads as
 * a reader action and the turn-end branch then declines to return to the newest message.
 * Until that is fixed upstream, this keeps the local install corrected across app updates.
 *
 * Idempotent by construction, and it never guesses: if the bundle no longer contains the
 * expression it knows how to patch, it reports that and stops rather than editing bytes it
 * does not recognise.
 *
 * Usage: node patch-dsh-follow.mjs [check|apply]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const ASAR = 'D:\\DeepSeek Harness\\resources\\app.asar'
const INNER = 'dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'

/** The expression the fix replaces, and the marker that proves the fix is present. */
const ORIGINAL = ') && reading.followingTail) {'
const PATCHED = ') && !reading.state.x) {'
const RECORDED = 'this.x = !this.following;'

const mode = process.argv[2] ?? 'check'
const node = process.execPath
const run = (script, ...args) => execFileSync(node, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16)

if (!existsSync(ASAR)) {
  console.error(`找不到 app.asar: ${ASAR}`)
  process.exit(2)
}
console.log(`归档: ${ASAR}`)
console.log(`大小: ${(statSync(ASAR).size / 1048576).toFixed(1)} MB`)

// Extract the bundle as it is right now, so the decision is made on real bytes.
run('_asar_get.mjs', ASAR, INNER, '_check.js')
const current = readFileSync('_check.js', 'utf8')
const hash = sha(readFileSync('_check.js'))

const hasOriginal = current.includes(ORIGINAL)
const hasPatched = current.includes(PATCHED) && current.includes(RECORDED)
console.log(`当前 bundle: ${Buffer.byteLength(current, 'utf8')} 字节, sha256:${hash}`)

if (hasPatched && !hasOriginal) {
  console.log('\n状态: 已打补丁 ✓')
  console.log('  回合结束时会把视图带回最新消息（除非读者主动离开底部）')
  if (mode === 'check') process.exit(0)
  console.log('  apply 模式下无需操作。')
  process.exit(0)
}

if (!hasOriginal) {
  console.log('\n状态: ⚠ 无法识别')
  console.log(`  既没有原始表达式 ${ORIGINAL}`)
  console.log(`  也没有补丁标记 ${PATCHED}`)
  console.log('  说明这个 bundle 与补丁所针对的版本不同（很可能 DSH 已更新或已自行修复）。')
  console.log('  未做任何改动。请人工核对后再决定。')
  process.exit(3)
}

console.log('\n状态: 未打补丁')
if (mode === 'check') {
  console.log('  运行 `node patch-dsh-follow.mjs apply` 来应用。')
  process.exit(1)
}

// Build the patched bundle from the freshly extracted copy, then verify before writing.
copyFileSync('_check.js', '_chat-client.js')
console.log('\n生成补丁...')
const patchOut = run('_patch.mjs')
for (const line of patchOut.trim().split('\n')) console.log(`  ${line}`)

const patched = readFileSync('_chat-client.patched.js')
if (patched.length !== readFileSync('_check.js').length) {
  console.error('\n❌ 补丁长度与原始不一致，拒绝写入')
  process.exit(4)
}
console.log(`  长度一致: ${patched.length} 字节 ✓`)

console.log('\n写入归档...')
const putOut = run('_asar_put.mjs', ASAR, INNER, '_check.js', '_chat-client.patched.js', '--write')
for (const line of putOut.trim().split('\n')) console.log(`  ${line}`)

// Confirm from the archive itself, not from the file we just wrote.
run('_asar_get.mjs', ASAR, INNER, '_check2.js')
const after = readFileSync('_check2.js', 'utf8')
const ok = after.includes(PATCHED) && after.includes(RECORDED) && !after.includes(ORIGINAL)
console.log(`\n复核: ${ok ? '✓ 补丁已在归档中生效' : '❌ 复核未通过'}`)
if (!ok) process.exit(5)
console.log('重启 DSH 桌面端后生效。')