#! /usr/bin/env node
/**
 * Stub Audit — verifies zero runtime stubs in shipping (non-test) code.
 *
 * Scans src/ for placeholder/stub patterns:
 *   - "// STUB:" marker comments
 *   - throw new Error('not implemented')
 *   - Empty function bodies returning fixed/placeholder values in non-test code
 */

import { readFileSync } from 'node:fs'
import { globSync } from 'glob'

const SRC_DIR = 'src'

const STUB_PATTERNS = [
  /\/\/\s*STUB:/,
  /\/\/\s*TODO:\s*implement/,
  /throw new Error\(['"]not implemented['"]\)/i,
  /\/\/\s*placeholder/i,
]

const EXCLUDE = [/\/node_modules\//, /\/__tests__\//, /\/tests\//, /\.test\.tsx?$/, /\.spec\.tsx?$/, /\/helpers\//]

const files = globSync(`${SRC_DIR}/**/*.ts`, { cwd: '.' }).filter((f) => !EXCLUDE.some((p) => p.test(f)))

const violations = []

for (const file of files) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of STUB_PATTERNS) {
      const match = lines[i].match(pattern)
      if (match) {
        violations.push({ file, line: i + 1, match: match[0].trim() })
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n❌ Stub audit FAILED (${violations.length} violations):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.match}`)
  }
  console.error('\nShipping code must never contain stubs. Fakes go in tests/helpers/.\n')
  process.exit(1)
}

// Guard: embedded-spa-data.ts must stay the empty stub in the repo. pack:bun
// regenerates it (~2.7 MB base64) and reverts it; if a full payload is staged,
// a generate run leaked into the commit. Catch it before it bloats git history.
const EMBEDDED_SPA_DATA = 'src/api/embedded-spa-data.ts'
try {
  const data = readFileSync(EMBEDDED_SPA_DATA, 'utf-8')
  if (/"\/[^"]+":\s*"/.test(data)) {
    console.error(`\n❌ ${EMBEDDED_SPA_DATA} contains the embedded SPA payload — it must stay an empty stub.`)
    console.error('   Run: node scripts/gen-embedded-spa.mjs --stub  (then re-stage)\n')
    process.exit(1)
  }
} catch {
  /* file absent in some checkouts — not a violation */
}

console.log(`✓ Stub audit clean — ${files.length} files scanned, zero stubs.`)
