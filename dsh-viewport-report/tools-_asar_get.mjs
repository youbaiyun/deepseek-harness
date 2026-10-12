/**
 * Read one file out of an Electron asar archive.
 *
 * The format: a 16-byte pickle header carrying the JSON header's size, the JSON header
 * itself (an offset/length tree, not the bytes), then the file data — each file's bytes
 * start at `headerSize + 8 + offset`, where the 8 covers the aligned secondary pickle
 * header. Written here rather than reused because the helper the operator described is
 * not in the workspace.
 *
 * Usage: node _asar_get.mjs <archive> <inner/path> [outFile]
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [, , archivePath, innerPath, outFile] = process.argv
if (archivePath === undefined || innerPath === undefined) {
  console.error('usage: node _asar_get.mjs <archive> <inner/path> [outFile]')
  process.exit(2)
}

const archive = readFileSync(archivePath)

// Pickle: payload size, then a string header of two more sizes, then the padded JSON.
// The *third* uint32 is the real string length — the two before it are the padded payload
// and the padded string, each 4 bytes larger. File data begins immediately after the JSON
// ends, which is why that length is the one to use.
const payloadSize = archive.readUInt32LE(0)
const jsonLength = archive.readUInt32LE(12)
if (payloadSize <= 0 || jsonLength <= 0 || 16 + jsonLength > archive.length) {
  console.error('not an asar archive: unexpected header')
  process.exit(2)
}
const headerJson = archive.toString('utf8', 16, 16 + jsonLength)
const header = JSON.parse(headerJson)

const node = walk(header, innerPath.split('/'))
if (node === null || node === undefined || typeof node !== 'object' || node.offset === undefined) {
  console.error(`not found in archive: ${innerPath}`)
  process.exit(1)
}

const start = 16 + jsonLength + Number(node.offset)
const size = Number(node.size)
const bytes = archive.subarray(start, start + size)
if (bytes.length !== size) {
  console.error(`truncated: wanted ${size} bytes, got ${bytes.length}`)
  process.exit(1)
}

if (outFile === undefined) {
  process.stdout.write(bytes)
} else {
  writeFileSync(outFile, bytes)
  console.error(`wrote ${outFile} (${size} bytes)`)
}

/** Follow one path segment at a time through the header's `files` tree. */
function walk(tree, segments) {
  let current = tree
  for (const segment of segments) {
    if (current.files === undefined) return null
    current = current.files[segment]
    if (current === undefined) return null
  }
  return current
}
