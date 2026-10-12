/**
 * Build the follow-tail patch for the DSH chat transcript.
 *
 * The bug: a finishing turn only returns the view to the newest message when the app
 * already believes it is following the tail. That belief is recomputed whenever the scroll
 * offset moves by more than half a pixel -- including movements the app causes itself by
 * growing the conversation -- so a turn can end with the reader parked mid-answer and
 * nothing bringing them back to it.
 *
 * The fix: record whether the *reader* left the tail, and let the turn-end branch consult
 * that instead. A reader who scrolled up stays where they are; a turn that merely grew
 * returns to the bottom.
 *
 * Length matters: the bundle goes back into an asar archive in place, where every following
 * file's offset is a byte count, so the result must be exactly as long as the input. The
 * edits land a byte or two off, and trailing spaces close the gap -- inert in a JS module
 * and the only concession made. Nothing is written unless it lands exactly.
 */

import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('_chat-client.js', 'utf8')
const bytes = (s) => Buffer.byteLength(s, 'utf8')
const target = bytes(src)

/** Replace once and require uniqueness -- a silent second match would corrupt the bundle. */
const sub = (text, from, to, label) => {
  const n = text.split(from).length - 1
  if (n !== 1) throw new Error(label + ': matched ' + n + ' times, expected exactly 1')
  return text.split(from).join(to)
}

let out = src
const changes = []
const apply = (label, from, to) => {
  const before = bytes(out)
  out = sub(out, from, to, label)
  changes.push([label, bytes(out) - before])
}

// 1. `following` holds a boolean. It becomes `x` -- a name the bundle never otherwise uses
//    on `this` -- and now means "the reader left the tail".
const classHead = out.match(/var ScrollFollow = class ScrollFollow \{[^;]*;/)[0]
apply('class field following -> x', classHead, classHead.replace('following;', 'x;'))

// 2. Record reader intent where follow intent is already recomputed, so no second opinion
//    about who scrolled is introduced.
const sample = out.match(/if \(!this\.animating && movedByReader\)[^\n]*/)[0]
apply(
  'sample(): record reader intent',
  sample,
  'if (!this.animating && movedByReader) { this.following = this.nearBottom(metrics); this.x = !this.following; }',
)

// 3. The getter keeps its name: it is the state machine's public surface and other code
//    reads `reading.followingTail`. Only the answer changes -- reader intent, not raw state.
apply('getter returns this.x', 'return this.state.followingTail;', 'return this.x;')

// 4. The fix itself.
apply('turn end uses !state.x', ') && reading.followingTail) {', ') && !reading.state.x) {')

console.log('change                                 delta')
for (const [label, delta] of changes) console.log(label.padEnd(38) + ' ' + String(delta).padStart(6))

const excess = bytes(out) - target
console.log('\nafter edits: ' + bytes(out) + ' bytes / original ' + target + ' (delta ' + excess + ')')
if (excess !== 0) {
  out = out + ' '.repeat(Math.abs(excess))
  console.log('appended ' + Math.abs(excess) + ' byte(s) of trailing whitespace')
}

if (bytes(out) !== target) {
  console.log('FAILED to match length: ' + bytes(out) + ' != ' + target)
  process.exit(1)
}
console.log('OK: length identical to the original')

const classSlice = out.slice(out.indexOf('var ScrollFollow'), out.indexOf('var ScrollFollow') + 220)
const checks = [
  ['fix condition present', out.includes(') && !reading.state.x) {')],
  ['reader intent recorded', out.includes('this.x = !this.following;')],
  ['class field renamed', /\{\s*x;/.test(classSlice)],
  ['getter name kept', /get followingTail\(\)/.test(out)],
  ['getter returns x', out.includes('return this.x;')],
  ['old condition gone', !out.includes(') && reading.followingTail) {')],
]
console.log('\n=== self check ===')
let ok = true
for (const [name, pass] of checks) {
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + name)
  if (!pass) ok = false
}
if (!ok) process.exit(1)

writeFileSync('_chat-client.patched.js', out)
console.log('\nwrote _chat-client.patched.js (app.asar untouched)')