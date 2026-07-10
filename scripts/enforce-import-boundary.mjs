#! /usr/bin/env node
/**
 * Import Boundary Enforcement — verifies src/core/** has zero vendor imports.
 *
 * Scans all .ts files under src/core/ and fails if any import from:
 *   - @modelcontextprotocol/sdk
 *   - @anthropic-ai/sdk
 *   - anthropic
 *   - claude-specific packages
 *
 * Vendor code belongs in the adapter layer (packages/mcp-server/).
 */

import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { resolve } from 'node:path'

const CORE_DIR = resolve(import.meta.dirname ?? process.cwd(), '..', 'src', 'core')

const VENDOR_PATTERNS = [
  /from\s+['"]@modelcontextprotocol\/sdk/,
  /from\s+['"]@anthropic-ai\/sdk/,
  /from\s+['"]anthropic['"]/,
  /require\s*\(\s*['"]@modelcontextprotocol\/sdk/,
  /require\s*\(\s*['"]@anthropic-ai\/sdk/,
  /require\s*\(\s*['"]anthropic['"]/,
]

const EXCLUDE_PATTERNS = [/\/__tests__\//, /\/tests\//, /\.test\.ts$/, /\.spec\.ts$/]

const files = globSync('src/core/**/*.ts', { cwd: resolve(CORE_DIR, '..', '..') }).filter(
  (f) => !EXCLUDE_PATTERNS.some((p) => p.test(f)),
)

const violations = []

for (const file of files) {
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of VENDOR_PATTERNS) {
      const match = lines[i].match(pattern)
      if (match) {
        violations.push({ file, line: i + 1, match: match[0] })
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n❌ Import boundary VIOLATIONS (${violations.length}):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.match}`)
  }
  console.error('\nsrc/core/** must never import vendor SDKs. Vendor code goes in packages/mcp-server/.\n')
  process.exit(1)
}

console.log(`✓ Import boundary clean — ${files.length} core files scanned, zero vendor imports.`)
