/**
 * Write a patched file back into an asar archive, in place and byte-for-byte in length.
 *
 * Safety comes from two properties, both asserted rather than assumed:
 *   1. the replacement is exactly as long as the original, so no other file's stored
 *      offset moves;
 *   2. the region being replaced is located by hashing the original bytes and comparing
 *      them, not by trusting an offset handed in from outside.
 *
 * Because `dsh/package.json` carries no outer checksum (only asar's `integrity`, which is
 * a Chromium feature this app does not enable), patching in place is self-consistent.
 *
 * Usage: node _asar_put.mjs <archive> <inner/path> <originalFile> <patchedFile> [--write]
 *        Without --write it reports what it would do and touches nothing.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [, , archivePath, innerPath, originalPath, patchedPath, flag] = process.argv
const write = flag === '--write'

const archive = readFileSync(archivePath)
const original = readFileSync(originalPath)
const patched = readFileSync(patchedPath)

if (original.length !== patched.length) {
  console.error(`refusing: length differs (${original.length} vs ${patched.length})`)
  process.exit(2)
}

// Re-derive the header the same way the extractor does.
const jsonLength = archive.readUInt32LE(12)
const header = JSON.parse(archive.toString('utf8', 16, 16 + jsonLength))
const node = innerPath.split('/').reduce((tree, part) => tree?.files?.[part], header)
if (node?.offset === undefined) {
  console.error(`not found in archive: ${innerPath}`)
  process.exit(2)
}

const dataStart = 16 + jsonLength
const absolute = dataStart + Number(node.offset)
const size = Number(node.size)
if (size !== original.length) {
  console.error(`size mismatch: header says ${size}, original file is ${original.length}`)
  process.exit(2)
}

const region = archive.subarray(absolute, absolute + size)
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex')
if (digest(region) !== digest(original)) {
  console.error('refusing: the bytes at that offset are not the file we extracted')
  process.exit(2)
}

console.log(`  目标区域: ${absolute} .. ${absolute + size} (${size} 字节)`)
console.log(`  原内容哈希: ${digest(region).slice(0, 16)}…  匹配 ✓`)
console.log(`  新内容哈希: ${digest(patched).slice(0, 16)}…`)

if (!write) {
  console.log('  预览模式：未写入。加 --write 才真正改写。')
  process.exit(0)
}

const backup = `${archivePath}.backup`
if (!existsSync(backup)) {
  copyFileSync(archivePath, backup)
  console.log(`  已备份原档 → ${backup}`)
} else {
  console.log(`  备份已存在，保留 → ${backup}`)
}

patched.copy(archive, absolute)
writeFileSync(archivePath, archive)
console.log('  ✓ 已写入')

// Read the region back and confirm the archive still parses as a whole.
const after = readFileSync(archivePath)
const readBack = after.subarray(absolute, absolute + size)
console.log(`  回读校验: ${digest(readBack) === digest(patched) ? '✓ 与补丁一致' : '❌ 不一致'}`)
const headerAfter = JSON.parse(after.toString('utf8', 16, 16 + after.readUInt32LE(12)))
console.log(`  归档仍可解析: ✓ (${Object.keys(headerAfter.files).length} 个顶层条目)`)
console.log(`  归档大小不变: ${after.length === archive.length ? '✓' : '❌'}`)
