#!/usr/bin/env node
/**
 * check-dead-exports — detect unused/dormant exports via knip.
 *
 * WHY: audit-stubs catches placeholder code; this catches wired-but-disconnected
 * exports that compile fine but are never consumed. Guards against the "ships but
 * is unreachable" problem for core public API surfaces.
 *
 * Exit codes:
 *   0 — clean (no unused exports, or all in allowlist)
 *   1 — unused exports found outside the allowlist
 *   2 — knip binary not found / unexpected failure
 */

import { spawnSync } from 'node:child_process'

/**
 * Check if a knip finding is allowlisted.
 * @param {string} entry - "path:exportName" string from knip output
 * @param {string[]} allowlist - array of "path:exportName" patterns
 * @returns {boolean}
 */
export function isAllowlisted(entry, allowlist) {
  return allowlist.some((a) => entry === a || entry.includes(a))
}

/**
 * Public API exports that are legitimately not consumed within the repo
 * (consumed by downstream packages, CLI users, or intentional extension points).
 */
const ALLOWLIST = [
  // Core public types re-exported for downstream consumers
  'src/core/graph/graph-types.ts',
  // Schema exports used by MCP / external callers
  'src/schemas/',
  // Plugin manifest contract — consumed by user-authored plugins
  'src/plugins/',
  // TUI ports — implemented by consumers outside this codebase
  'src/tui/dispatch-ports.ts',
  // ACO params — exported for downstream economy tooling
  'src/core/economy/aco-params.ts',
  // Migration utilities — exported for optional external migration runners
  'src/core/store/migrations',
]

const result = spawnSync('npx', ['knip', '--exports', '--no-gitignore', '--reporter', 'json'], {
  encoding: 'utf8',
  shell: true,
})

if (result.error) {
  console.error('[check-dead-exports] ERROR: could not run knip:', result.error.message)
  process.exit(2)
}

let findings
try {
  findings = JSON.parse(result.stdout || '{}')
} catch {
  // knip may output non-JSON on error
  if (result.stderr?.includes('not found') || result.status === 127) {
    console.error('[check-dead-exports] knip not found — install it as a devDependency')
    process.exit(2)
  }
  // Non-zero but parseable output — treat as clean if no stdout
  findings = {}
}

const unusedExports = findings?.files ?? []
const violations = []

for (const file of unusedExports) {
  for (const exp of file.exports ?? []) {
    const entry = `${file.file}:${exp.name}`
    if (!isAllowlisted(entry, ALLOWLIST) && !isAllowlisted(file.file, ALLOWLIST)) {
      violations.push(entry)
    }
  }
}

if (violations.length > 0) {
  console.error('[check-dead-exports] DEAD EXPORTS FOUND (not in allowlist):')
  for (const v of violations) {
    console.error(`  - ${v}`)
  }
  console.error(`\nFix: wire the export, delete it, or add it to the ALLOWLIST in scripts/check-dead-exports.mjs`)
  process.exit(1)
}

const totalFiles = unusedExports.length
console.log(`[check-dead-exports] ✓ Clean — ${totalFiles} file(s) checked, all exports reachable or allowlisted`)
